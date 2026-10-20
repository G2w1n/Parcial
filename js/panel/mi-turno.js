// js/panel/mi-turno.js
// Mi turno: asistencia, horario, turnos de la semana, resumen del día, notas entre turnos e incidentes
import { sql } from '../config/neon-config.js';
import { exigirRol, consultarTurno, textoTurno } from '../auth/auth.js';
import { avisar, conCarga, formatearFecha } from '../config/ui.js';
import { registrar } from '../config/bitacora.js';
import { formatearSoles } from '../registro/tarifario.js';
import { TURNOS, diasDeSemana, textoFecha, turnosEntre } from './turnos-datos.js';

const usuario = exigirRol('empleado', 'cajero', 'seguridad', 'administrador');
if (!usuario) throw new Error('Acceso denegado');

const $ = (id) => document.getElementById(id);
const TIPOS_INCIDENTE = { choque: 'Choque', mal_estacionado: 'Mal estacionado', dano: 'Daño', objeto_encontrado: 'Objeto encontrado', otro: 'Otro' };
const hora = (v) => new Date(v).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' });

const crear = (etiqueta, clase, texto) => {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
};

function faltaTabla() {
  $('aviso-tabla').hidden = false;
  $('aviso-tabla').textContent = 'Algunas secciones se activan al ejecutar database/fase-6.sql en Neon.';
}

async function seguro(consulta, vacio) {
  try {
    return await consulta();
  } catch (error) {
    if (error.code === '42P01' || error.code === '42703') faltaTabla();
    else console.error(error);
    return vacio;
  }
}

/* ============================== Asistencia ============================== */
async function pintarAsistencia() {
  const registros = await seguro(() => sql`
    SELECT entrada, salida FROM asistencia
    WHERE usuario_id = ${usuario.id}
      AND (entrada AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date
    ORDER BY entrada;`, null);
  if (registros === null) {
    $('mt-entrada').disabled = true;
    $('mt-salida').disabled = true;
    return;
  }
  const abierta = registros.find((r) => !r.salida);
  const minutos = registros.reduce((s, r) => s + ((r.salida ? new Date(r.salida) : new Date()) - new Date(r.entrada)) / 60000, 0);
  $('mt-estado').textContent = abierta ? `Trabajando desde las ${hora(abierta.entrada)}` : registros.length ? 'Fuera de turno' : 'Aún no marcas tu entrada';
  $('mt-estado').classList.toggle('trabajando', Boolean(abierta));
  $('mt-horas').textContent = registros.length ? `Hoy: ${Math.floor(minutos / 60)} h ${Math.round(minutos % 60)} min trabajados` : '';
  $('mt-entrada').disabled = Boolean(abierta);
  $('mt-salida').disabled = !abierta;
}

$('mt-entrada').addEventListener('click', async (e) => {
  try {
    await conCarga(e.target, () => sql`INSERT INTO asistencia (usuario_id) VALUES (${usuario.id});`);
    registrar(usuario, 'Marcó entrada');
    avisar('Entrada marcada. ¡Buen turno!');
  } catch (error) {
    console.error(error);
    avisar(error.code === '23505' ? 'Ya tenías la entrada marcada.' : 'No se pudo marcar la entrada.', 'error');
  }
  pintarAsistencia();
});

$('mt-salida').addEventListener('click', async (e) => {
  try {
    await conCarga(e.target, () => sql`UPDATE asistencia SET salida = NOW() WHERE usuario_id = ${usuario.id} AND salida IS NULL;`);
    registrar(usuario, 'Marcó salida');
    avisar('Salida marcada. ¡Hasta la próxima!');
  } catch (error) {
    console.error(error);
    avisar('No se pudo marcar la salida.', 'error');
  }
  pintarAsistencia();
});

async function pintarHorario() {
  if (usuario.rol !== 'empleado') return;
  try {
    const turno = await consultarTurno(usuario.id);
    const texto = textoTurno(turno);
    $('mt-horario').textContent = texto ? `Tu horario de acceso al panel: ${texto} (hora de Perú).` : 'No tienes restricción de horario.';
  } catch (error) {
    console.error(error);
  }
}

/* ============================== Mis turnos de la semana ============================== */
async function pintarSemana() {
  const dias = diasDeSemana();
  const turnos = await seguro(() => turnosEntre(textoFecha(dias[0]), textoFecha(dias[6]), usuario.id), []);
  const porFecha = Object.fromEntries(turnos.map((t) => [t.fecha, t.turno]));
  const hoy = textoFecha(new Date());
  $('mt-semana').replaceChildren(...dias.map((d) => {
    const fecha = textoFecha(d);
    const turno = porFecha[fecha];
    const li = crear('li', fecha === hoy ? 'hoy' : '');
    li.append(
      crear('strong', '', d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric' })),
      crear('span', `turno-${turno ?? 'libre'}`, turno ? `${TURNOS[turno].nombre} · ${TURNOS[turno].horario}` : 'Libre'),
    );
    return li;
  }));
}

/* ============================== Resumen del día ============================== */
async function pintarResumen() {
  const acciones = await seguro(() => sql`
    SELECT accion, COUNT(*)::int AS total FROM bitacora
    WHERE usuario_id = ${usuario.id}
      AND (fecha AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date
    GROUP BY accion ORDER BY total DESC;`, []);
  const kpis = [['Acciones hoy', String(acciones.reduce((s, a) => s + a.total, 0))]];
  if (usuario.rol === 'cajero' || usuario.rol === 'administrador') {
    const [cobrado] = await seguro(() => sql`
      SELECT COALESCE(SUM(monto), 0) AS total, COUNT(*)::int AS n FROM pagos
      WHERE id_cajero = ${usuario.id} AND estado = 'aprobado'
        AND (fecha_pago AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date;`, [{ total: 0, n: 0 }]);
    kpis.push(['Cobrado en ventanilla', formatearSoles(Number(cobrado.total))], ['Cobros', String(cobrado.n)]);
  }
  const contar = (texto) => acciones.filter((a) => a.accion.startsWith(texto)).reduce((s, a) => s + a.total, 0);
  if (usuario.rol === 'empleado' || usuario.rol === 'administrador') kpis.push(['Entradas registradas', String(contar('Entrada registrada'))], ['Pedidos atendidos', String(contar('Pedido '))]);
  if (usuario.rol === 'seguridad' || usuario.rol === 'cajero') kpis.push(['Salidas registradas', String(contar('Salida registrada'))]);
  $('mt-resumen').replaceChildren(...kpis.map(([n, v]) => {
    const div = crear('div', 'adm-kpi');
    div.append(crear('span', '', n), crear('strong', '', v));
    return div;
  }));
  $('mt-acciones').replaceChildren(...(acciones.length
    ? acciones.slice(0, 6).map((a) => crear('li', '', `${a.accion}: ${a.total}`))
    : [crear('li', '', 'Todavía no registras acciones hoy.')]));
}

/* ============================== Notas entre turnos ============================== */
async function pintarNotas() {
  const notas = await seguro(() => sql`SELECT autor_nombre, mensaje, fecha FROM notas_turno ORDER BY fecha DESC LIMIT 15;`, []);
  $('lista-notas').replaceChildren(...(notas.length ? notas.map((n) => {
    const li = crear('li', '', n.mensaje); // textContent: la nota nunca se interpreta como HTML
    li.append(crear('small', '', `${n.autor_nombre} · ${formatearFecha(n.fecha)}`));
    return li;
  }) : [crear('li', '', 'No hay notas. Usa este espacio para avisar algo al siguiente turno.')]));
}

$('form-nota').addEventListener('submit', async (e) => {
  e.preventDefault();
  const mensaje = $('nota-texto').value.trim();
  if (mensaje.length < 2) return;
  try {
    await conCarga(e.target.querySelector('button'), () => sql`
      INSERT INTO notas_turno (autor_id, autor_nombre, mensaje) VALUES (${usuario.id}, ${usuario.nombre}, ${mensaje.slice(0, 300)});`);
    e.target.reset();
    pintarNotas();
  } catch (error) {
    console.error(error);
    avisar('No se pudo guardar la nota.', 'error');
  }
});

/* ============================== Incidentes ============================== */
// La foto se reduce a 640 px y se guarda como JPEG en base64 (unos 40 KB)
function reducirFoto(archivo) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, 640 / Math.max(img.width, img.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
      URL.revokeObjectURL(img.src);
      resolve(lienzo.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(archivo);
  });
}

async function pintarIncidentes() {
  const incidentes = await seguro(() => sql`
    SELECT id, tipo, descripcion, placa, foto, estado, reportado_nombre, fecha FROM incidentes
    WHERE estado = 'abierto' OR fecha > NOW() - INTERVAL '2 days'
    ORDER BY CASE estado WHEN 'abierto' THEN 0 ELSE 1 END, fecha DESC LIMIT 20;`, []);
  $('lista-incidentes').replaceChildren(...(incidentes.length ? incidentes.map((i) => {
    const li = crear('li');
    const cab = crear('div', 'incidente-cab');
    cab.append(crear('strong', '', TIPOS_INCIDENTE[i.tipo] ?? i.tipo), crear('span', `adm-chip ${i.estado === 'abierto' ? 'adm-chip-rojo' : 'adm-chip-verde'}`, i.estado));
    if (i.placa) cab.append(crear('span', 'adm-chip', i.placa));
    if (i.estado === 'abierto') {
      const b = crear('button', 'adm-btn adm-btn-borde', 'Marcar resuelto');
      b.type = 'button';
      b.dataset.id = i.id;
      cab.append(b);
    }
    li.append(cab, crear('p', '', i.descripcion));
    if (i.foto && i.foto.startsWith('data:image/')) {
      const img = crear('img');
      img.src = i.foto;
      img.alt = `Foto del incidente: ${TIPOS_INCIDENTE[i.tipo] ?? i.tipo}`;
      li.append(img);
    }
    li.append(crear('small', '', `${i.reportado_nombre ?? '—'} · ${formatearFecha(i.fecha)}`));
    return li;
  }) : [crear('li', '', 'Sin incidentes recientes.')]));
}

$('lista-incidentes').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  try {
    await conCarga(b, () => sql`UPDATE incidentes SET estado = 'resuelto' WHERE id = ${Number(b.dataset.id)};`);
    registrar(usuario, 'Incidente resuelto', `#${b.dataset.id}`);
    pintarIncidentes();
  } catch (error) {
    console.error(error);
    avisar('No se pudo actualizar el incidente.', 'error');
  }
});

$('form-incidente').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const descripcion = d.descripcion.trim();
  if (descripcion.length < 5) return avisar('Describe qué pasó.', 'error');
  try {
    await conCarga(e.target.querySelector('button[type="submit"]'), async () => {
      const foto = d.foto && d.foto.size ? await reducirFoto(d.foto) : null;
      await sql`
        INSERT INTO incidentes (tipo, descripcion, placa, foto, reportado_por, reportado_nombre)
        VALUES (${d.tipo}, ${descripcion.slice(0, 500)}, ${d.placa.trim().toUpperCase() || null}, ${foto}, ${usuario.id}, ${usuario.nombre});
      `;
    });
    registrar(usuario, 'Incidente reportado', `${TIPOS_INCIDENTE[d.tipo]}${d.placa ? ` · ${d.placa.toUpperCase()}` : ''}`);
    avisar('Incidente reportado.');
    e.target.reset();
    pintarIncidentes();
  } catch (error) {
    console.error(error);
    avisar(error.code === '42P01' ? 'Los incidentes se activan al ejecutar database/fase-6.sql.' : 'No se pudo reportar el incidente.', 'error');
  }
});

/* ============================== Arranque ============================== */
$('mt-nombre').textContent = usuario.nombre;
pintarAsistencia();
pintarHorario();
pintarSemana();
pintarResumen();
pintarNotas();
pintarIncidentes();
