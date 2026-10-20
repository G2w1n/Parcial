// js/caja/sesion-caja.js
// Fase 6: apertura de caja, arqueo al cerrar, cobros del turno con anulación (autorizada por un
// administrador), devoluciones y exportación del día a Excel.
import {
  cajaAbierta, abrirCaja, efectivoEsperado, cerrarCaja, cobrosDelCajero, anularPago, pagoDeReserva,
  resumenDelDia, listarPagosEnLinea, ampliacionesDelDia,
} from './caja-datos.js';
import { verificarCredenciales } from '../auth/auth.js';
import { avisar, conCarga } from '../config/ui.js';
import { registrar } from '../config/bitacora.js';
import { formatearSoles, redondear } from '../registro/tarifario.js';
import { descargarExcel } from '../config/excel.js';

const $ = (id) => document.getElementById(id);
const DENOMINACIONES = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1];
const NOMBRES_METODO = { efectivo: 'Efectivo', pos: 'POS', billetera: 'Billetera' };

let usuario = null;
let caja = null;            // caja abierta del cajero (o null)
let disponible = true;      // false si la tabla "cajas" aún no existe
let obtenerFecha = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
let alCambiar = () => {};
let anulacionPendiente = null;

const crear = (etiqueta, clase, texto) => {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
};
const hora = (v) => new Date(v).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' });

// El cajero solo cobra con la caja abierta; el administrador puede cobrar siempre
export function puedeCobrar() {
  if (!disponible || usuario.rol === 'administrador' || caja) return true;
  avisar('Primero abre tu caja con el fondo inicial.', 'error');
  $('monto-inicial')?.focus();
  return false;
}

/* ============================== Estado de la caja ============================== */
async function pintarEstado() {
  const resultado = await cajaAbierta(usuario.id);
  disponible = resultado !== undefined;
  caja = resultado ?? null;
  $('mi-caja').hidden = !disponible;
  if (!disponible) return;

  if (caja) {
    const esperado = await efectivoEsperado(caja);
    $('estado-caja').textContent = `Abierta desde las ${hora(caja.apertura)} · fondo ${formatearSoles(Number(caja.monto_inicial))} · efectivo esperado ${formatearSoles(esperado)}`;
    $('estado-caja').className = 'estado-caja abierta';
  } else {
    $('estado-caja').textContent = usuario.rol === 'administrador'
      ? 'No tienes una caja abierta (como administrador puedes cobrar igual).'
      : 'Tu caja está cerrada: ábrela con el fondo inicial para empezar a cobrar.';
    $('estado-caja').className = 'estado-caja cerrada';
  }
  $('form-abrir-caja').hidden = Boolean(caja);
  $('btn-arqueo').hidden = !caja;
  await pintarCobros();
}

$('form-abrir-caja').addEventListener('submit', async (e) => {
  e.preventDefault();
  const monto = Number($('monto-inicial').value);
  if (!(monto >= 0)) return avisar('Escribe el fondo inicial.', 'error');
  try {
    await conCarga(e.target.querySelector('button'), () => abrirCaja(usuario.id, redondear(monto)));
    registrar(usuario, 'Abrió caja', `Fondo ${formatearSoles(monto)}`);
    avisar('Caja abierta. ¡Buen turno!');
    pintarEstado();
  } catch (error) {
    console.error(error);
    avisar(error.code === '23505' ? 'Ya tienes una caja abierta.' : 'No se pudo abrir la caja.', 'error');
    pintarEstado();
  }
});

/* ============================== Mis cobros y anulaciones ============================== */
let cobros = [];

async function pintarCobros() {
  cobros = await cobrosDelCajero(usuario.id, obtenerFecha());
  const cuerpo = $('tabla-mis-cobros');
  if (cobros.length === 0) {
    const tr = crear('tr');
    const td = crear('td', 'celda-vacia', 'Aún no hay cobros en ventanilla en esta fecha.');
    td.colSpan = 7;
    tr.append(td);
    cuerpo.replaceChildren(tr);
    return;
  }
  cuerpo.replaceChildren(...cobros.map((c) => {
    const tr = crear('tr', c.estado === 'anulado' ? 'fila-anulada' : '');
    const acciones = crear('td');
    const ticket = crear('a', 'enlace-ticket', 'Ticket');
    ticket.href = `comprobante.html?op=${encodeURIComponent(c.codigo_operacion)}&imprimir=1`;
    ticket.target = '_blank';
    ticket.rel = 'noopener';
    acciones.append(ticket);
    if (c.estado === 'aprobado') {
      const anular = crear('button', 'btn-fila btn-anular', 'Anular');
      anular.type = 'button';
      anular.dataset.id = c.id;
      acciones.append(' ', anular);
    }
    tr.append(crear('td', '', hora(c.fecha_pago)), crear('td', '', c.codigo_operacion), crear('td', '', `${c.codigo_seguimiento} · ${c.placa}`),
      crear('td', '', NOMBRES_METODO[c.metodo] ?? c.metodo), crear('td', '', formatearSoles(Number(c.monto))),
      crear('td', '', c.estado === 'anulado' ? 'Anulado' : 'Aprobado'), acciones);
    return tr;
  }));
}

function abrirAnulacion({ pago, idRegistro, tipo, descripcion }) {
  anulacionPendiente = { pago, idRegistro, tipo };
  $('t-anular').textContent = tipo === 'devolucion' ? 'Devolver pago y cancelar la reserva' : 'Anular cobro';
  $('anular-resumen').textContent = descripcion;
  $('anular-autorizacion').hidden = usuario.rol === 'administrador';
  $('anular-error').textContent = '';
  $('form-anular').reset();
  $('dialogo-anular').showModal();
}

// Devolución desde el control de salida (lo llama caja.js)
export async function iniciarDevolucion(registro) {
  const pago = await pagoDeReserva(registro.id);
  if (!pago) return avisar('No se encontró un pago aprobado para esa reserva.', 'error');
  abrirAnulacion({
    pago, idRegistro: registro.id, tipo: 'devolucion',
    descripcion: `${registro.codigo_seguimiento} · ${registro.placa} · ${formatearSoles(Number(pago.monto))} (${pago.canal === 'caja' ? 'pagado en ventanilla' : 'pagado en línea: se devuelve al mismo medio'})`,
  });
}

$('tabla-mis-cobros').addEventListener('click', (e) => {
  const b = e.target.closest('.btn-anular');
  if (!b) return;
  const c = cobros.find((x) => x.id === Number(b.dataset.id));
  if (c) {
    abrirAnulacion({
      pago: c, idRegistro: c.id_registro, tipo: 'anulacion',
      descripcion: `${c.codigo_operacion} · ${c.codigo_seguimiento} · ${formatearSoles(Number(c.monto))}. La reserva vuelve a quedar pendiente de pago.`,
    });
  }
});

$('cancelar-anular').addEventListener('click', () => $('dialogo-anular').close());

$('form-anular').addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = $('anular-error');
  const motivo = $('anular-motivo').value.trim();
  if (motivo.length < 5) return void (error.textContent = 'Escribe el motivo.');
  try {
    await conCarga(e.target.querySelector('button[type="submit"]'), async () => {
      let autorizadoPor = usuario.id;
      if (usuario.rol !== 'administrador') {
        const admin = await verificarCredenciales($('anular-correo').value.trim(), $('anular-clave').value);
        if (!admin || admin.rol !== 'administrador') throw new Error('autorizacion');
        autorizadoPor = admin.id;
      }
      await anularPago({ ...anulacionPendiente, motivo: motivo.slice(0, 200), autorizadoPor, idCajero: usuario.id });
    });
    const { pago, tipo } = anulacionPendiente;
    registrar(usuario, tipo === 'devolucion' ? 'Devolución de pago' : 'Cobro anulado', `${pago.codigo_operacion} · ${formatearSoles(Number(pago.monto))} · ${motivo}`);
    avisar(tipo === 'devolucion' ? 'Pago devuelto y reserva cancelada.' : 'Cobro anulado: la reserva volvió a pendiente.');
    $('dialogo-anular').close();
    pintarEstado();
    alCambiar();
  } catch (err) {
    if (err.message === 'autorizacion') error.textContent = 'El correo o la contraseña del administrador no son correctos.';
    else {
      console.error(err);
      error.textContent = err.message || 'No se pudo completar la operación.';
    }
  }
});

/* ============================== Arqueo ============================== */
let esperadoArqueo = 0;

function contado() {
  return redondear([...document.querySelectorAll('#denominaciones input')]
    .reduce((s, input) => s + Number(input.dataset.valor) * (Math.max(0, Math.floor(Number(input.value) || 0))), 0));
}

function pintarTotalesArqueo() {
  const total = contado();
  const diferencia = redondear(total - esperadoArqueo);
  $('arqueo-contado').textContent = formatearSoles(total);
  $('arqueo-esperado').textContent = formatearSoles(esperadoArqueo);
  $('arqueo-diferencia').textContent = `${diferencia > 0 ? '+' : ''}${formatearSoles(diferencia)}${diferencia === 0 ? ' ✓ cuadra' : diferencia > 0 ? ' (sobra)' : ' (falta)'}`;
  $('arqueo-diferencia').className = diferencia === 0 ? 'cuadra' : 'descuadre';
}

export async function abrirArqueo() {
  if (!caja) return avisar('No tienes una caja abierta.', 'error');
  esperadoArqueo = redondear(await efectivoEsperado(caja));
  $('denominaciones').replaceChildren(...DENOMINACIONES.map((valor) => {
    const etiqueta = crear('label', 'denominacion');
    const texto = crear('span', '', valor >= 10 ? `Billete S/ ${valor}` : `Moneda S/ ${valor.toFixed(valor < 1 ? 2 : 0)}`);
    const input = crear('input');
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.inputMode = 'numeric';
    input.value = '0';
    input.dataset.valor = String(valor);
    etiqueta.append(texto, input);
    return etiqueta;
  }));
  pintarTotalesArqueo();
  $('dialogo-arqueo').showModal();
}

$('denominaciones').addEventListener('input', pintarTotalesArqueo);
$('btn-arqueo').addEventListener('click', abrirArqueo);
$('cancelar-arqueo').addEventListener('click', () => $('dialogo-arqueo').close());

function imprimirReporte(cerrada, detalle) {
  const reporte = $('reporte-arqueo');
  const titulo = crear('h1', '', 'Arqueo de caja · Aeropuerto Qorikancha');
  const datos = crear('dl');
  [['Cajero', usuario.nombre], ['Apertura', new Date(cerrada.apertura).toLocaleString('es-PE', { timeZone: 'America/Lima' })],
    ['Cierre', new Date(cerrada.cierre).toLocaleString('es-PE', { timeZone: 'America/Lima' })],
    ['Fondo inicial', formatearSoles(Number(cerrada.monto_inicial))], ['Efectivo esperado', formatearSoles(Number(cerrada.efectivo_esperado))],
    ['Efectivo contado', formatearSoles(Number(cerrada.efectivo_contado))], ['Diferencia', formatearSoles(Number(cerrada.diferencia))],
    ['Nota', cerrada.nota || '—']].forEach(([n, v]) => datos.append(crear('dt', '', n), crear('dd', '', v)));
  const tabla = crear('table');
  const cab = crear('tr');
  ['Denominación', 'Cantidad', 'Subtotal'].forEach((t) => cab.append(crear('th', '', t)));
  tabla.append(cab);
  detalle.filter((d) => d.cantidad > 0).forEach((d) => {
    const tr = crear('tr');
    tr.append(crear('td', '', `S/ ${d.valor}`), crear('td', '', String(d.cantidad)), crear('td', '', formatearSoles(d.valor * d.cantidad)));
    tabla.append(tr);
  });
  const firmas = crear('p', 'firmas', 'Firma del cajero: ____________________     Firma del supervisor: ____________________');
  reporte.replaceChildren(titulo, datos, tabla, firmas);
  document.body.classList.add('imprimiendo-arqueo');
  window.addEventListener('afterprint', () => document.body.classList.remove('imprimiendo-arqueo'), { once: true });
  window.print();
}

$('form-arqueo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const total = contado();
  const nota = $('arqueo-nota').value.trim();
  if (Math.abs(total - esperadoArqueo) >= 0.01 && nota.length < 3) {
    avisar('Hay diferencia: escribe una nota que la explique.', 'error');
    $('arqueo-nota').focus();
    return;
  }
  if (!confirm(`¿Cerrar la caja con ${formatearSoles(total)} contados?`)) return;
  const detalle = [...document.querySelectorAll('#denominaciones input')]
    .map((i) => ({ valor: Number(i.dataset.valor), cantidad: Math.max(0, Math.floor(Number(i.value) || 0)) }));
  try {
    const cerrada = await conCarga(e.target.querySelector('button[type="submit"]'),
      () => cerrarCaja(caja.id, { esperado: esperadoArqueo, contado: total, detalle, nota: nota || null }));
    if (!cerrada) throw new Error('La caja ya estaba cerrada.');
    registrar(usuario, 'Cerró caja (arqueo)', `Esperado ${formatearSoles(esperadoArqueo)} · contado ${formatearSoles(total)} · diferencia ${formatearSoles(total - esperadoArqueo)}`);
    $('dialogo-arqueo').close();
    avisar('Caja cerrada. Se abrirá el reporte para imprimir.');
    imprimirReporte(cerrada, detalle);
    pintarEstado();
  } catch (error) {
    console.error(error);
    avisar(error.message || 'No se pudo cerrar la caja.', 'error');
  }
});

/* ============================== Excel del día ============================== */
$('btn-excel-caja').addEventListener('click', (e) => conCarga(e.target, async () => {
  const fecha = obtenerFecha();
  try {
    const [resumen, enLinea, ampliaciones, misCobros] = await Promise.all([
      resumenDelDia(fecha), listarPagosEnLinea(fecha, false), ampliacionesDelDia(fecha), cobrosDelCajero(usuario.id, fecha),
    ]);
    descargarExcel(`caja_${fecha}.xlsx`, [
      {
        nombre: 'Resumen',
        columnas: ['Canal', 'Medio', 'Operaciones', 'Total (S/)'],
        filas: [
          ...resumen.map((r) => [r.canal === 'caja' ? 'Ventanilla' : 'En línea', r.metodo, r.operaciones, Number(r.total)]),
          ...ampliaciones.map((a) => [a.tipo === 'exceso' ? 'Exceso de tiempo' : 'Ampliación', a.metodo, a.operaciones, Number(a.total)]),
        ],
      },
      {
        nombre: 'Mis cobros',
        columnas: ['Hora', 'Operación', 'Reserva', 'Placa', 'Medio', 'Monto (S/)', 'Estado'],
        filas: misCobros.map((c) => [hora(c.fecha_pago), c.codigo_operacion, c.codigo_seguimiento, c.placa, c.metodo, Number(c.monto), c.estado]),
      },
      {
        nombre: 'Pagos en línea',
        columnas: ['Hora', 'Operación', 'Reserva', 'Cliente', 'Medio', 'Monto (S/)', 'Resultado', 'Verificado'],
        filas: enLinea.map((p) => [hora(p.fecha_pago), p.codigo_operacion, `${p.codigo_seguimiento} · ${p.placa}`, p.cliente,
          p.metodo, Number(p.monto), p.estado === 'aprobado' ? 'Aprobado' : `Rechazado: ${p.motivo_rechazo}`, p.verificado ? 'Sí' : 'No']),
      },
    ]);
    avisar('Excel del día descargado.');
  } catch (error) {
    console.error(error);
    avisar('No se pudo exportar el día.', 'error');
  }
}));

/* ============================== Inicio ============================== */
export async function iniciarSesionCaja(u, { fecha, alCambiar: callback }) {
  usuario = u;
  obtenerFecha = fecha;
  alCambiar = callback ?? (() => {});
  try {
    await pintarEstado();
  } catch (error) {
    console.error(error);
  }
}

export const refrescarSesionCaja = () => pintarEstado().catch((error) => console.error(error));
