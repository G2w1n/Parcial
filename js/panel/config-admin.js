// js/panel/config-admin.js
// Configuración del administrador: tarifas, capacidad del estacionamiento, cupones, avisos y lista negra
import { sql } from '../config/neon-config.js';
import { exigirRol } from '../auth/auth.js';
import { avisar, conCarga, formatearFecha } from '../config/ui.js';
import { registrar } from '../config/bitacora.js';
import { cargarConfiguracion, guardarConfiguracion } from '../config/configuracion.js';
import { tarifasVigentes, aplicarTarifas, calcularMontoServicio, formatearSoles } from '../registro/tarifario.js';

const usuario = exigirRol('administrador');
if (!usuario) throw new Error('Acceso denegado');

const $ = (id) => document.getElementById(id);
const crear = (etiqueta, clase, texto) => {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
};

function avisoTabla(id, error, script = 'fase-5') {
  const el = $(id);
  el.hidden = false;
  el.textContent = error.code === '42P01'
    ? `Esta sección se activa al ejecutar database/${script}.sql en Neon.`
    : 'No se pudo conectar con la base de datos.';
}

function filaVacia(cuerpo, columnas, texto) {
  const tr = crear('tr');
  const td = crear('td', 'celda-vacia', texto);
  td.colSpan = columnas;
  tr.append(td);
  cuerpo.replaceChildren(tr);
}

/* ============================== Tarifas ============================== */
// Los porcentajes se muestran como 10 (%) y se guardan como 0.10
const CAMPOS_TARIFA = [
  ['porHora', 'tf-hora', 1], ['diaCompleto', 'tf-dia', 1], ['nocturna', 'tf-nocturna', 1], ['horasNocturna', 'tf-horas-noc', 1],
  ['descuentoFinDeSemana', 'tf-fds', 100], ['recargoBusCamion', 'tf-bus', 100], ['adicionalVip', 'tf-vip', 1],
];
const formTarifas = $('form-tarifas');

function pintarTarifas() {
  const t = tarifasVigentes();
  CAMPOS_TARIFA.forEach(([clave, id, factor]) => { $(id).value = Math.round(t[clave] * factor * 100) / 100; });
  vistaPrevia();
}

function leerTarifas() {
  return Object.fromEntries(CAMPOS_TARIFA.map(([clave, id, factor]) => [clave, Number($(id).value) / factor]));
}

// Ejemplos para ver el efecto antes de guardar (se calcula con las tarifas del formulario y se restauran las vigentes)
function vistaPrevia() {
  const vigentes = tarifasVigentes();
  aplicarTarifas(leerTarifas());
  const ejemplos = [
    ['4 h de día (martes)', { horas: 4, tipo_vehiculo: 'auto', fecha_hora_entrada: '2026-10-20T10:00' }],
    ['12 h (tope diario)', { horas: 12, tipo_vehiculo: 'auto', fecha_hora_entrada: '2026-10-20T08:00' }],
    ['6 h de noche', { horas: 6, tipo_vehiculo: 'auto', fecha_hora_entrada: '2026-10-20T23:00' }],
    ['4 h sábado', { horas: 4, tipo_vehiculo: 'auto', fecha_hora_entrada: '2026-10-24T10:00' }],
    ['3 días, bus, VIP', { horas: 72, tipo_vehiculo: 'bus_camion', zona_vip: true, fecha_hora_entrada: '2026-10-20T08:00' }],
  ];
  $('tf-ejemplos').replaceChildren(...ejemplos.map(([nombre, d]) => {
    const li = crear('li');
    li.append(crear('span', '', nombre), crear('strong', '', formatearSoles(calcularMontoServicio(d))));
    return li;
  }));
  aplicarTarifas(vigentes);
}

formTarifas.addEventListener('input', vistaPrevia);
formTarifas.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nuevas = leerTarifas();
  if (Object.values(nuevas).some((v) => !Number.isFinite(v) || v < 0)) {
    avisar('Revisa los valores: no pueden estar vacíos ni ser negativos.', 'error');
    return;
  }
  if (!confirm('Las nuevas tarifas se aplicarán a las reservas que se creen desde ahora. ¿Guardar?')) return;
  try {
    await conCarga(formTarifas.querySelector('button[type="submit"]'), () => guardarConfiguracion('tarifas', nuevas, usuario.id));
    aplicarTarifas(nuevas);
    registrar(usuario, 'Tarifas actualizadas', JSON.stringify(nuevas));
    avisar('Tarifas guardadas.');
  } catch (error) {
    console.error(error);
    avisoTabla('aviso-config', error);
  }
});

/* ============================== Capacidad ============================== */
const formCapacidad = $('form-capacidad');
formCapacidad.addEventListener('submit', async (e) => {
  e.preventDefault();
  const capacidad = { normal: Number($('cap-normal').value), vip: Number($('cap-vip').value), bus: Number($('cap-bus').value) };
  if (Object.values(capacidad).some((v) => !Number.isInteger(v) || v < 0 || v > 500)) {
    avisar('La capacidad de cada zona es un número entero entre 0 y 500.', 'error');
    return;
  }
  try {
    await conCarga(formCapacidad.querySelector('button[type="submit"]'), () => guardarConfiguracion('capacidad', capacidad, usuario.id));
    registrar(usuario, 'Capacidad actualizada', `General ${capacidad.normal}, VIP ${capacidad.vip}, buses ${capacidad.bus}`);
    avisar('Capacidad guardada. El mapa de espacios ya la usa.');
  } catch (error) {
    console.error(error);
    avisoTabla('aviso-config', error);
  }
});

/* ============================== Cupones ============================== */
async function cargarCupones() {
  let cupones;
  try {
    cupones = await sql`SELECT codigo, descripcion, tipo, valor, monto_minimo, usos, usos_maximos, vence, activo FROM cupones ORDER BY activo DESC, codigo;`;
    $('aviso-cupones').hidden = true;
  } catch (error) {
    avisoTabla('aviso-cupones', error, 'fase-4');
    filaVacia($('tabla-cupones'), 7, '—');
    return;
  }
  if (cupones.length === 0) return filaVacia($('tabla-cupones'), 7, 'No hay cupones.');
  $('tabla-cupones').replaceChildren(...cupones.map((c) => {
    const tr = crear('tr');
    const codigo = crear('td');
    codigo.append(crear('strong', '', c.codigo), crear('br'), crear('small', '', c.descripcion));
    const valor = c.tipo === 'porcentaje' ? `${Number(c.valor)} %` : formatearSoles(Number(c.valor));
    const vence = c.vence ? new Date(c.vence).toLocaleDateString('es-PE', { timeZone: 'UTC' }) : 'Sin vencimiento';
    const estado = crear('td');
    estado.append(crear('span', `adm-chip ${c.activo ? 'adm-chip-verde' : ''}`, c.activo ? 'Activo' : 'Inactivo'));
    const acciones = crear('td');
    const b = crear('button', `adm-btn ${c.activo ? 'adm-btn-peligro' : 'adm-btn-borde'}`, c.activo ? 'Desactivar' : 'Activar');
    b.type = 'button';
    b.dataset.codigo = c.codigo;
    b.dataset.activo = String(c.activo);
    acciones.append(b);
    tr.append(codigo, crear('td', '', valor), crear('td', '', Number(c.monto_minimo) ? `desde ${formatearSoles(Number(c.monto_minimo))}` : '—'),
      crear('td', '', `${c.usos} / ${c.usos_maximos}`), crear('td', '', vence), estado, acciones);
    return tr;
  }));
}

$('tabla-cupones').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-codigo]');
  if (!b) return;
  const activar = b.dataset.activo !== 'true';
  try {
    await conCarga(b, () => sql`UPDATE cupones SET activo = ${activar} WHERE codigo = ${b.dataset.codigo};`);
    registrar(usuario, activar ? 'Cupón activado' : 'Cupón desactivado', b.dataset.codigo);
    cargarCupones();
  } catch (error) {
    console.error(error);
    avisar('No se pudo cambiar el cupón.', 'error');
  }
});

$('form-cupon').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const codigo = d.codigo.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(codigo)) return avisar('El código tiene de 4 a 20 letras o números, sin espacios.', 'error');
  if (!(Number(d.valor) > 0) || (d.tipo === 'porcentaje' && Number(d.valor) > 90)) return avisar('El valor debe ser mayor que 0 (y hasta 90 % si es porcentaje).', 'error');
  try {
    await conCarga(e.target.querySelector('button[type="submit"]'), () => sql`
      INSERT INTO cupones (codigo, descripcion, tipo, valor, monto_minimo, usos_maximos, vence)
      VALUES (${codigo}, ${d.descripcion.trim() || codigo}, ${d.tipo}, ${Number(d.valor)}, ${Number(d.minimo) || 0},
              ${Number(d.usos) || 100}, ${d.vence || null});
    `);
    registrar(usuario, 'Cupón creado', `${codigo}: ${d.tipo === 'porcentaje' ? `${d.valor} %` : `S/ ${d.valor}`}`);
    avisar(`Cupón ${codigo} creado.`);
    e.target.reset();
    cargarCupones();
  } catch (error) {
    console.error(error);
    avisar(error.code === '23505' ? 'Ya existe un cupón con ese código.' : 'No se pudo crear el cupón.', 'error');
  }
});

/* ============================== Avisos generales ============================== */
const TIPOS_AVISO = { info: ['Información', 'adm-chip-azul'], alerta: ['Alerta', 'adm-chip-ambar'], urgente: ['Urgente', 'adm-chip-rojo'] };

async function cargarAvisos() {
  let avisos;
  try {
    avisos = await sql`
      SELECT id, mensaje, tipo, activo, hasta, fecha, (hasta IS NOT NULL AND hasta <= NOW()) AS vencido
      FROM avisos ORDER BY activo DESC, fecha DESC LIMIT 20;`;
    $('aviso-avisos').hidden = true;
  } catch (error) {
    avisoTabla('aviso-avisos', error);
    return;
  }
  const lista = $('lista-avisos');
  if (avisos.length === 0) {
    lista.replaceChildren(crear('li', 'adm-nota', 'Aún no hay avisos publicados.'));
    return;
  }
  lista.replaceChildren(...avisos.map((a) => {
    const li = crear('li', 'item-aviso');
    const [texto, chip] = TIPOS_AVISO[a.tipo];
    const cab = crear('div', 'item-aviso-cab');
    const visible = a.activo && !a.vencido;
    cab.append(crear('span', `adm-chip ${chip}`, texto), crear('span', `adm-chip ${visible ? 'adm-chip-verde' : ''}`, visible ? 'Publicado' : 'Oculto'));
    const b = crear('button', `adm-btn ${a.activo ? 'adm-btn-peligro' : 'adm-btn-borde'}`, a.activo ? 'Quitar' : 'Volver a publicar');
    b.type = 'button';
    b.dataset.id = a.id;
    b.dataset.activo = String(a.activo);
    cab.append(b);
    const detalle = `Creado ${formatearFecha(a.fecha)}${a.hasta ? ` · hasta ${formatearFecha(a.hasta)}` : ''}`;
    li.append(cab, crear('p', '', a.mensaje), crear('small', '', detalle));
    return li;
  }));
}

$('lista-avisos').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  const activar = b.dataset.activo !== 'true';
  try {
    await conCarga(b, () => sql`UPDATE avisos SET activo = ${activar} WHERE id = ${Number(b.dataset.id)};`);
    registrar(usuario, activar ? 'Aviso publicado' : 'Aviso retirado', `Aviso #${b.dataset.id}`);
    cargarAvisos();
  } catch (error) {
    console.error(error);
    avisar('No se pudo cambiar el aviso.', 'error');
  }
});

$('form-aviso').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const mensaje = d.mensaje.trim();
  if (mensaje.length < 5 || mensaje.length > 200) return avisar('El aviso tiene entre 5 y 200 caracteres.', 'error');
  const horas = Number(d.duracion);
  try {
    await conCarga(e.target.querySelector('button[type="submit"]'), () => sql`
      INSERT INTO avisos (mensaje, tipo, hasta, creado_por)
      VALUES (${mensaje}, ${d.tipo}, ${horas ? new Date(Date.now() + horas * 3600 * 1000).toISOString() : null}, ${usuario.id});
    `);
    registrar(usuario, 'Aviso publicado', mensaje);
    avisar('Aviso publicado. Ya aparece en todas las páginas.');
    e.target.reset();
    cargarAvisos();
  } catch (error) {
    console.error(error);
    avisoTabla('aviso-avisos', error);
  }
});

/* ============================== Lista negra ============================== */
async function cargarListaNegra() {
  let filas;
  try {
    filas = await sql`SELECT placa, motivo, deuda, activo, fecha FROM lista_negra ORDER BY activo DESC, fecha DESC;`;
    $('aviso-lista').hidden = true;
  } catch (error) {
    avisoTabla('aviso-lista', error);
    filaVacia($('tabla-lista'), 5, '—');
    return;
  }
  if (filas.length === 0) return filaVacia($('tabla-lista'), 5, 'No hay placas en la lista negra.');
  $('tabla-lista').replaceChildren(...filas.map((f) => {
    const tr = crear('tr');
    const estado = crear('td');
    estado.append(crear('span', `adm-chip ${f.activo ? 'adm-chip-rojo' : ''}`, f.activo ? 'Bloqueada' : 'Levantada'));
    const acciones = crear('td');
    const b = crear('button', `adm-btn ${f.activo ? 'adm-btn-borde' : 'adm-btn-peligro'}`, f.activo ? 'Levantar' : 'Bloquear otra vez');
    b.type = 'button';
    b.dataset.placa = f.placa;
    b.dataset.activo = String(f.activo);
    acciones.append(b);
    tr.append(crear('td', '', f.placa), crear('td', '', f.motivo), crear('td', '', formatearSoles(Number(f.deuda))), estado, acciones);
    return tr;
  }));
}

$('tabla-lista').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-placa]');
  if (!b) return;
  const activar = b.dataset.activo !== 'true';
  try {
    await conCarga(b, () => sql`UPDATE lista_negra SET activo = ${activar} WHERE placa = ${b.dataset.placa};`);
    registrar(usuario, activar ? 'Placa bloqueada' : 'Placa levantada de la lista negra', b.dataset.placa);
    cargarListaNegra();
  } catch (error) {
    console.error(error);
    avisar('No se pudo actualizar la placa.', 'error');
  }
});

$('form-lista').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const placa = d.placa.trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,10}$/.test(placa)) return avisar('La placa tiene de 6 a 10 letras, números o guiones.', 'error');
  if (!d.motivo.trim()) return avisar('Escribe el motivo.', 'error');
  try {
    await conCarga(e.target.querySelector('button[type="submit"]'), () => sql`
      INSERT INTO lista_negra (placa, motivo, deuda, creado_por)
      VALUES (${placa}, ${d.motivo.trim().slice(0, 150)}, ${Number(d.deuda) || 0}, ${usuario.id})
      ON CONFLICT (placa) DO UPDATE SET motivo = EXCLUDED.motivo, deuda = EXCLUDED.deuda, activo = TRUE, fecha = NOW();
    `);
    registrar(usuario, 'Placa bloqueada', `${placa}: ${d.motivo.trim()}`);
    avisar(`Placa ${placa} agregada a la lista negra.`);
    e.target.reset();
    cargarListaNegra();
  } catch (error) {
    console.error(error);
    avisoTabla('aviso-lista', error);
  }
});

/* ============================== Arranque ============================== */
const config = await cargarConfiguracion();
pintarTarifas();
$('cap-normal').value = config.capacidad.normal;
$('cap-vip').value = config.capacidad.vip;
$('cap-bus').value = config.capacidad.bus;
try {
  await sql`SELECT 1 FROM configuracion LIMIT 1;`;
} catch (error) {
  avisoTabla('aviso-config', error);
}
cargarCupones();
cargarAvisos();
cargarListaNegra();
