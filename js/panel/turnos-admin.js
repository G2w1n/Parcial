// js/panel/turnos-admin.js
// Calendario semanal de turnos: el administrador asigna mañana, tarde o noche a cada persona y día
import { sql } from '../config/neon-config.js';
import { exigirRol } from '../auth/auth.js';
import { avisar, conCarga } from '../config/ui.js';
import { registrar } from '../config/bitacora.js';
import { TURNOS, diasDeSemana, textoFecha, turnosEntre } from './turnos-datos.js';

const usuario = exigirRol('administrador');
if (!usuario) throw new Error('Acceso denegado');

const $ = (id) => document.getElementById(id);
let semana = 0;
let personal = [];
let asignados = {}; // "usuarioId|fecha" -> turno

const crear = (etiqueta, clase, texto) => {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
};

function faltaTabla() {
  $('aviso-tabla').hidden = false;
  $('aviso-tabla').textContent = 'El calendario de turnos se activa al ejecutar database/fase-6.sql en Neon.';
  $('copiar-semana').disabled = true;
}

function selectTurno(persona, fecha) {
  const select = crear('select', 'select-turno');
  select.setAttribute('aria-label', `Turno de ${persona.nombre} el ${fecha}`);
  select.dataset.usuario = persona.id;
  select.dataset.fecha = fecha;
  select.append(Object.assign(crear('option', '', 'Libre'), { value: '' }));
  Object.entries(TURNOS).forEach(([valor, t]) => select.append(Object.assign(crear('option', '', t.nombre), { value: valor })));
  select.value = asignados[`${persona.id}|${fecha}`] ?? '';
  select.className = `select-turno turno-${select.value || 'libre'}`;
  return select;
}

function pintarCobertura(dias) {
  const fila = $('cobertura');
  const etiqueta = crear('th', '', 'Cobertura');
  etiqueta.scope = 'row';
  fila.replaceChildren(etiqueta, ...dias.map((d) => {
    const fecha = textoFecha(d);
    const conteo = Object.keys(TURNOS).map((t) => personal.filter((p) => asignados[`${p.id}|${fecha}`] === t).length);
    const td = crear('td', 'celda-cobertura');
    const faltan = Object.values(TURNOS).filter((_, i) => conteo[i] === 0).map((t) => t.nombre.toLowerCase());
    td.textContent = conteo.join(' · ');
    td.title = `Mañana ${conteo[0]}, tarde ${conteo[1]}, noche ${conteo[2]}`;
    if (faltan.length) {
      td.classList.add('sin-cobertura');
      td.title += ` · sin personal: ${faltan.join(', ')}`;
    }
    return td;
  }));
}

async function pintar() {
  const dias = diasDeSemana(semana);
  const desde = textoFecha(dias[0]);
  const hasta = textoFecha(dias[6]);
  const formato = { day: 'numeric', month: 'long' };
  $('rango-semana').textContent = `${dias[0].toLocaleDateString('es-PE', formato)} al ${dias[6].toLocaleDateString('es-PE', formato)}`;

  const hoy = textoFecha(new Date());
  const cabecera = $('cabecera-dias');
  cabecera.replaceChildren(crear('th', '', 'Persona'), ...dias.map((d) => {
    const th = crear('th', textoFecha(d) === hoy ? 'hoy' : '', d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric' }));
    return th;
  }));

  personal = await sql`SELECT id, nombre, rol FROM usuarios WHERE rol IN ('empleado', 'cajero', 'seguridad') ORDER BY rol, nombre;`;
  asignados = {};
  try {
    (await turnosEntre(desde, hasta)).forEach((t) => { asignados[`${t.usuario_id}|${t.fecha}`] = t.turno; });
    $('aviso-tabla').hidden = true;
    $('copiar-semana').disabled = false;
  } catch (error) {
    if (error.code === '42P01') faltaTabla();
    else throw error;
  }

  const cuerpo = $('tabla-turnos');
  if (!personal.length) {
    const tr = crear('tr');
    const td = crear('td', 'celda-vacia', 'Aún no hay cuentas de empleados, cajeros ni seguridad. Créalas en «Reservas → Gestión del personal».');
    td.colSpan = 8;
    tr.append(td);
    cuerpo.replaceChildren(tr);
  } else {
    cuerpo.replaceChildren(...personal.map((p) => {
      const tr = crear('tr');
      const th = crear('th', '');
      th.scope = 'row';
      th.append(crear('strong', '', p.nombre), crear('small', 'rol-turno', p.rol));
      tr.append(th, ...dias.map((d) => {
        const td = crear('td');
        td.append(selectTurno(p, textoFecha(d)));
        if ($('aviso-tabla').hidden === false) td.querySelector('select').disabled = true;
        return td;
      }));
      return tr;
    }));
  }
  pintarCobertura(dias);
}

$('tabla-turnos').addEventListener('change', async (e) => {
  const select = e.target.closest('select');
  if (!select) return;
  const idUsuario = Number(select.dataset.usuario);
  const { fecha } = select.dataset;
  const turno = select.value;
  const anterior = asignados[`${idUsuario}|${fecha}`] ?? '';
  select.disabled = true;
  try {
    if (turno) {
      await sql`
        INSERT INTO turnos (usuario_id, fecha, turno, creado_por) VALUES (${idUsuario}, ${fecha}::date, ${turno}, ${usuario.id})
        ON CONFLICT (usuario_id, fecha) DO UPDATE SET turno = EXCLUDED.turno, creado_por = EXCLUDED.creado_por;`;
      asignados[`${idUsuario}|${fecha}`] = turno;
    } else {
      await sql`DELETE FROM turnos WHERE usuario_id = ${idUsuario} AND fecha = ${fecha}::date;`;
      delete asignados[`${idUsuario}|${fecha}`];
    }
    const persona = personal.find((p) => p.id === idUsuario);
    registrar(usuario, 'Turno asignado', `${persona?.nombre} · ${fecha} · ${turno ? TURNOS[turno].nombre : 'libre'}`);
    select.className = `select-turno turno-${turno || 'libre'}`;
    pintarCobertura(diasDeSemana(semana));
  } catch (error) {
    console.error(error);
    avisar('No se pudo guardar el turno.', 'error');
    select.value = anterior;
  } finally {
    select.disabled = false;
  }
});

$('copiar-semana').addEventListener('click', (e) => conCarga(e.target, async () => {
  const dias = diasDeSemana(semana);
  const filas = Object.entries(asignados).map(([clave, turno]) => {
    const [id, fecha] = clave.split('|');
    const d = new Date(`${fecha}T12:00:00`);
    d.setDate(d.getDate() + 7);
    return { id: Number(id), fecha: textoFecha(d), turno };
  });
  if (!filas.length) return avisar('Esta semana no tiene turnos para copiar.', 'error');
  if (!confirm(`¿Copiar ${filas.length} turno(s) a la semana siguiente? Se reemplazan los que ya estén asignados esos días.`)) return;
  try {
    await sql.transaction(filas.map((f) => sql`
      INSERT INTO turnos (usuario_id, fecha, turno, creado_por) VALUES (${f.id}, ${f.fecha}::date, ${f.turno}, ${usuario.id})
      ON CONFLICT (usuario_id, fecha) DO UPDATE SET turno = EXCLUDED.turno, creado_por = EXCLUDED.creado_por;`));
    registrar(usuario, 'Turnos copiados', `Semana del ${textoFecha(dias[0])} a la siguiente (${filas.length})`);
    avisar('Turnos copiados a la semana siguiente.');
    semana += 1;
    await pintar();
  } catch (error) {
    console.error(error);
    avisar('No se pudieron copiar los turnos.', 'error');
  }
}));

const cambiarSemana = (valor) => {
  semana = valor;
  pintar().catch((error) => {
    console.error(error);
    avisar('No se pudo cargar el calendario.', 'error');
  });
};
$('semana-anterior').addEventListener('click', () => cambiarSemana(semana - 1));
$('semana-siguiente').addEventListener('click', () => cambiarSemana(semana + 1));
$('semana-actual').addEventListener('click', () => cambiarSemana(0));
cambiarSemana(0);
