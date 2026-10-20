// js/panel/historial.js
// Historial por placa: reservas, pagos, ampliaciones, incidentes y estado en la lista negra
import { sql } from '../config/neon-config.js';
import { exigirRol } from '../auth/auth.js';
import { avisar, formatearFecha } from '../config/ui.js';
import { formatearSoles } from '../registro/tarifario.js';
import { descargarExcel } from '../config/excel.js';

const usuario = exigirRol('administrador', 'empleado', 'cajero');
if (!usuario) throw new Error('Acceso denegado');

const $ = (id) => document.getElementById(id);
const TIPOS_INCIDENTE = { choque: 'Choque', mal_estacionado: 'Mal estacionado', dano: 'Daño', objeto_encontrado: 'Objeto encontrado', otro: 'Otro' };
let reservas = [];
let placaActual = '';

const crear = (etiqueta, clase, texto) => {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
};

async function seguro(consulta, vacio) {
  try {
    return await consulta();
  } catch (error) {
    if (error.code !== '42P01' && error.code !== '42703') console.error(error);
    return vacio;
  }
}

function filas(cuerpo, columnas, lista, vacio) {
  if (!lista.length) {
    const tr = crear('tr');
    const td = crear('td', 'celda-vacia', vacio);
    td.colSpan = columnas;
    tr.append(td);
    cuerpo.replaceChildren(tr);
    return;
  }
  cuerpo.replaceChildren(...lista.map((valores) => {
    const tr = crear('tr');
    valores.forEach((v) => tr.append(crear('td', '', v ?? '—')));
    return tr;
  }));
}

function kpi(nombre, valor, detalle) {
  const div = crear('div', 'adm-kpi');
  div.append(crear('span', '', nombre), crear('strong', '', valor), crear('small', '', detalle));
  return div;
}

async function cargar(placa) {
  placaActual = placa.trim().toUpperCase();
  if (!placaActual) return;
  history.replaceState(null, '', `?placa=${encodeURIComponent(placaActual)}`);
  $('placa').value = placaActual;

  const [resultado, pagos, ampliaciones, incidentes, bloqueo] = await Promise.all([
    sql`SELECT * FROM reservas_estacionamiento WHERE UPPER(placa) = ${placaActual} ORDER BY fecha_hora_entrada DESC;`,
    sql`
      SELECT p.codigo_operacion, p.fecha_pago, p.canal, p.metodo, p.monto, p.estado, r.codigo_seguimiento
      FROM pagos p JOIN reservas_estacionamiento r ON r.id = p.id_registro
      WHERE UPPER(r.placa) = ${placaActual} ORDER BY p.fecha_pago DESC;`,
    seguro(() => sql`
      SELECT a.codigo_operacion, a.fecha, a.horas_extra, a.monto, COALESCE(a.tipo, 'ampliacion') AS tipo, r.codigo_seguimiento
      FROM ampliaciones a JOIN reservas_estacionamiento r ON r.id = a.id_registro
      WHERE UPPER(r.placa) = ${placaActual} ORDER BY a.fecha DESC;`, null)
      .then((r) => r ?? seguro(() => sql`
        SELECT a.codigo_operacion, a.fecha, a.horas_extra, a.monto, 'ampliacion' AS tipo, r.codigo_seguimiento
        FROM ampliaciones a JOIN reservas_estacionamiento r ON r.id = a.id_registro
        WHERE UPPER(r.placa) = ${placaActual} ORDER BY a.fecha DESC;`, [])),
    seguro(() => sql`SELECT tipo, descripcion, estado, reportado_nombre, fecha FROM incidentes WHERE UPPER(placa) = ${placaActual} ORDER BY fecha DESC;`, []),
    seguro(() => sql`SELECT motivo, deuda, activo FROM lista_negra WHERE placa = ${placaActual};`, []),
  ]);
  reservas = resultado;

  $('historial').hidden = false;
  const negra = bloqueo[0];
  const estado = $('estado-placa');
  if (negra?.activo) {
    estado.className = 'estado-placa bloqueada';
    estado.textContent = `⛔ ${placaActual} está en la lista negra: ${negra.motivo} · deuda ${formatearSoles(Number(negra.deuda))}`;
  } else {
    estado.className = 'estado-placa limpia';
    estado.textContent = reservas.length ? `✓ ${placaActual} no tiene bloqueos` : `No hay reservas con la placa ${placaActual}.`;
  }

  const aprobados = pagos.filter((p) => p.estado === 'aprobado');
  const pagado = aprobados.reduce((s, p) => s + Number(p.monto), 0) + ampliaciones.reduce((s, a) => s + Number(a.monto), 0);
  const visitas = reservas.filter((r) => r.estado === 'atendido').length;
  const horas = reservas.filter((r) => r.estado !== 'cancelado').reduce((s, r) => s + Number(r.horas), 0);
  $('kpis-placa').replaceChildren(
    kpi('Reservas', String(reservas.length), `${reservas.filter((r) => r.estado === 'cancelado').length} canceladas`),
    kpi('Visitas completadas', String(visitas), 'Con salida registrada'),
    kpi('Total pagado', formatearSoles(pagado), `${aprobados.length} pagos y ${ampliaciones.length} cobros extra`),
    kpi('Horas reservadas', `${horas} h`, reservas.length ? `Última: ${formatearFecha(reservas[0].fecha_hora_entrada)}` : '—'),
    kpi('Incidentes', String(incidentes.length), `${incidentes.filter((i) => i.estado === 'abierto').length} abiertos`),
  );

  filas($('h-reservas'), 8, reservas.map((r) => [r.codigo_seguimiento, formatearFecha(r.fecha_hora_entrada), `${Number(r.horas)} h`,
    r.nombre_pasajero, r.estado, r.estado_pago, formatearSoles(Number(r.monto_calculado)), r.espacio]), 'Sin reservas.');

  const movimientos = [
    ...pagos.map((p) => ({ fecha: p.fecha_pago, op: p.codigo_operacion, concepto: `${p.codigo_seguimiento} · ${p.canal === 'pasarela' ? 'en línea' : 'ventanilla'} · ${p.metodo}`, monto: p.monto, estado: p.estado })),
    ...ampliaciones.map((a) => ({ fecha: a.fecha, op: a.codigo_operacion, concepto: `${a.codigo_seguimiento} · ${a.tipo === 'exceso' ? 'exceso' : 'ampliación'} +${Number(a.horas_extra)} h`, monto: a.monto, estado: 'aprobado' })),
  ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  filas($('h-pagos'), 5, movimientos.map((m) => [formatearFecha(m.fecha), m.op, m.concepto, formatearSoles(Number(m.monto)), m.estado]), 'Sin pagos.');

  const lista = $('h-incidentes');
  lista.replaceChildren(...(incidentes.length ? incidentes.map((i) => {
    const li = crear('li');
    li.append(crear('strong', '', `${TIPOS_INCIDENTE[i.tipo] ?? i.tipo} · ${i.estado}`), crear('span', '', ` ${i.descripcion}`),
      crear('small', '', ` — ${i.reportado_nombre ?? ''}, ${formatearFecha(i.fecha)}`));
    return li;
  }) : [crear('li', 'adm-nota', 'Sin incidentes registrados.')]));
}

$('form-placa').addEventListener('submit', (e) => {
  e.preventDefault();
  cargar($('placa').value).catch((error) => {
    console.error(error);
    avisar('No se pudo cargar el historial.', 'error');
  });
});

$('btn-excel-placa').addEventListener('click', () => {
  descargarExcel(`historial_${placaActual}.xlsx`, [{
    nombre: 'Reservas',
    columnas: ['Código', 'Entrada programada', 'Horas', 'Pasajero', 'Estado', 'Pago', 'Monto (S/)', 'Espacio'],
    filas: reservas.map((r) => [r.codigo_seguimiento, formatearFecha(r.fecha_hora_entrada), Number(r.horas), r.nombre_pasajero ?? '',
      r.estado, r.estado_pago, Number(r.monto_calculado), r.espacio ?? '']),
  }]);
});

const placaUrl = new URLSearchParams(location.search).get('placa');
if (placaUrl) {
  $('placa').value = placaUrl;
  $('form-placa').requestSubmit();
}
