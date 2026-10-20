// js/caja/caja.js
import { exigirRol, cerrarSesion } from '../auth/auth.js';
import { formatearSoles, redondear, NOMBRES_VEHICULO } from '../registro/tarifario.js';
import { avisar, animarNumero, mostrarEsqueleto, sinAnimaciones } from '../config/ui.js';
import {
  buscarPendientes, cobrarPresencial, listarPagosEnLinea, verificarPago, resumenDelDia, consultarSalida,
  placasBloqueadas, registrarSalida, ampliacionesDelDia, descuentosDelDia,
} from './caja-datos.js';
import { registrar } from '../config/bitacora.js';

const usuario = exigirRol('cajero', 'administrador');
if (!usuario) throw new Error('Acceso denegado');

const NOMBRES_METODO = {
  tarjeta_debito: 'Tarjeta de débito',
  tarjeta_credito: 'Tarjeta de crédito',
  billetera: 'Billetera electrónica',
  efectivo: 'Efectivo',
  pos: 'Tarjeta en POS',
};
const NOMBRES_BILLETERA = { andipay: 'AndiPay', pagomovil: 'PagoMóvil' };

const $ = (selector) => document.querySelector(selector);
const tablaPendientes = $('#tabla-pendientes tbody');
const tablaEnLinea = $('#tabla-en-linea tbody');
const tablaResumen = $('#tabla-resumen tbody');
const dialogo = $('#dialogo-cobro');
const formCobro = $('#form-cobro');
const selectMetodo = $('#metodo-caja');
const inputRecibido = $('#monto-recibido');
const inputReferencia = $('#referencia');
const inputFecha = $('#fecha-caja');
const chkPorVerificar = $('#solo-por-verificar');
const resultadoSalida = $('#resultado-salida');

// Fecha de HOY en Lima con formato AAAA-MM-DD (el que espera <input type="date">)
const hoyEnLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

let pendientesCache = [];
let registroEnCobro = null;
let ultimoIdVisto = null;
let ultimoCriterioSalida = '';
const salidaCache = new Map();

$('#nombre-cajero').textContent = usuario.nombre;
$('#fecha-actual').textContent = new Date().toLocaleDateString('es-PE', { dateStyle: 'full', timeZone: 'America/Lima' });
inputFecha.value = hoyEnLima();
if (usuario.rol === 'administrador') $('#enlace-panel').hidden = false;

$('#cerrar-sesion').addEventListener('click', () => {
  cerrarSesion();
  window.location.href = 'index.html';
});

/* ============================== Ayudas de tabla ============================== */
// Todo se escribe con textContent: los datos nunca se interpretan como HTML
function celda(fila, contenido) {
  const td = document.createElement('td');
  if (contenido instanceof Node) td.append(contenido);
  else td.textContent = contenido ?? '—';
  fila.append(td);
  return td;
}

function boton(texto, accion, id, clase = 'btn-fila') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = clase;
  b.textContent = texto;
  b.dataset.accion = accion;
  b.dataset.id = id;
  return b;
}

function filaVacia(tbody, columnas, texto) {
  const tr = document.createElement('tr');
  const td = celda(tr, texto);
  td.colSpan = columnas;
  td.className = 'celda-vacia';
  tbody.append(tr);
}

function describirMedio(p) {
  if (p.metodo === 'billetera') return `Billetera ${NOMBRES_BILLETERA[p.proveedor_billetera] ?? ''} ${p.referencia ?? ''}`.trim();
  if (p.marca_tarjeta) return `${p.marca_tarjeta} ${p.referencia ?? ''}`.trim();
  return p.referencia ?? NOMBRES_METODO[p.metodo] ?? p.metodo;
}

/* ============================== Cobro presencial ============================== */
async function pintarPendientes(criterio = '') {
  pendientesCache = await buscarPendientes(criterio);
  const bloqueadas = await placasBloqueadas(pendientesCache.map((r) => r.placa));
  tablaPendientes.replaceChildren();
  if (pendientesCache.length === 0) return filaVacia(tablaPendientes, 6, 'Sin reservas pendientes de pago.');

  for (const r of pendientesCache) {
    const tr = document.createElement('tr');
    tr.className = 'fila-entrada';
    celda(tr, r.codigo_seguimiento);
    const bloqueo = bloqueadas[r.placa?.toUpperCase()];
    const tdPlaca = celda(tr, r.placa);
    if (bloqueo) {
      tr.classList.add('fila-bloqueada');
      const chip = document.createElement('span');
      chip.className = 'chip-bloqueo';
      chip.textContent = '⛔ Lista negra';
      chip.title = `${bloqueo.motivo} · deuda ${formatearSoles(Number(bloqueo.deuda))}`;
      tdPlaca.append(' ', chip);
    }
    celda(tr, r.cliente ?? 'Atención presencial');
    celda(tr, r.dni);
    celda(tr, formatearSoles(Number(r.monto_calculado)));
    celda(tr).append(boton('Cobrar', 'cobrar', r.id, 'btn-fila btn-cobrar'));
    tablaPendientes.append(tr);
  }
}

$('#form-buscar').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await pintarPendientes(new FormData(e.target).get('criterio') ?? '');
  } catch (error) {
    console.error(error);
    avisar('No se pudo buscar. Intenta de nuevo.', 'error');
  }
});

function ajustarCamposMetodo() {
  const esEfectivo = selectMetodo.value === 'efectivo';
  $('#campo-recibido').hidden = !esEfectivo;
  $('#campo-referencia').hidden = esEfectivo;
  inputRecibido.required = esEfectivo;
  inputReferencia.required = !esEfectivo;
  actualizarVuelto();
}

function actualizarVuelto() {
  const salida = $('#vuelto');
  if (!registroEnCobro || inputRecibido.value === '') {
    salida.textContent = formatearSoles(0);
    return;
  }
  const vuelto = Number(inputRecibido.value) - Number(registroEnCobro.monto_calculado);
  salida.textContent = vuelto >= 0 ? formatearSoles(redondear(vuelto)) : 'Monto insuficiente';
}

selectMetodo.addEventListener('change', ajustarCamposMetodo);
inputRecibido.addEventListener('input', actualizarVuelto);

// Billetes rápidos: un clic llena el monto recibido
$('#billetes').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-valor]');
  if (!b || !registroEnCobro) return;
  inputRecibido.value = b.dataset.valor === 'exacto'
    ? Number(registroEnCobro.monto_calculado).toFixed(2)
    : b.dataset.valor;
  actualizarVuelto();
});

function abrirCobro(registro) {
  registroEnCobro = registro;
  $('#cobro-codigo').textContent = registro.codigo_seguimiento;
  $('#cobro-total').textContent = formatearSoles(Number(registro.monto_calculado));
  formCobro.reset();
  ajustarCamposMetodo();
  dialogo.showModal();
}

// Delegación de eventos: un solo listener para todos los botones "Cobrar"
tablaPendientes.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-accion="cobrar"]');
  if (!b) return;
  const registro = pendientesCache.find((r) => r.id === Number(b.dataset.id));
  if (registro) abrirCobro(registro);
});

$('#cancelar-cobro').addEventListener('click', () => dialogo.close());
dialogo.addEventListener('click', (e) => {
  if (e.target === dialogo) dialogo.close(); // clic en el fondo oscuro
});

function mostrarUltimoCobro(codigo, vuelto) {
  const caja = $('#ultimo-cobro');
  const texto = document.createElement('span');
  texto.textContent = `Cobro registrado · operación ${codigo}` + (vuelto !== null ? ` · vuelto ${formatearSoles(vuelto)}` : '');
  const enlace = document.createElement('a');
  enlace.href = `comprobante.html?op=${encodeURIComponent(codigo)}`;
  enlace.target = '_blank';
  enlace.rel = 'noopener';
  enlace.textContent = 'Ver comprobante';
  caja.replaceChildren(texto, enlace);
  caja.hidden = false;
  caja.classList.remove('visible');
  void caja.offsetWidth;
  caja.classList.add('visible');
}

formCobro.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!registroEnCobro) return;

  const datos = Object.fromEntries(new FormData(formCobro));
  if (datos.metodo !== 'efectivo' && !/^\d{6,12}$/.test(datos.referencia ?? '')) {
    avisar('Ingresa el número de voucher u operación (6 a 12 dígitos).', 'error');
    inputReferencia.focus();
    return;
  }

  const total = formatearSoles(Number(registroEnCobro.monto_calculado));
  if (!confirm(`¿Confirmar el cobro de ${total} por la reserva ${registroEnCobro.codigo_seguimiento}?`)) return;

  const botonConfirmar = formCobro.querySelector('button[type="submit"]');
  botonConfirmar.disabled = true;

  try {
    const { codigo, vuelto } = await cobrarPresencial({
      idRegistro: registroEnCobro.id,
      opcion: datos.metodo,
      montoRecibido: Number(datos.monto_recibido),
      referencia: datos.referencia,
      idCajero: usuario.id,
    });
    dialogo.close();
    registrar(usuario, 'Cobro presencial', `${codigo} · ${registroEnCobro.codigo_seguimiento} · ${formatearSoles(Number(registroEnCobro.monto_calculado))} · ${datos.metodo}`);
    mostrarUltimoCobro(codigo, vuelto);
    avisar('Cobro registrado. Pase de salida habilitado.');
    registroEnCobro = null;
    await Promise.all([pintarPendientes($('#criterio').value), refrescar()]);
    if (ultimoCriterioSalida) await pintarSalida(ultimoCriterioSalida);
  } catch (error) {
    console.error(error);
    avisar(error.code === '23505' ? 'Esta solicitud ya fue pagada.' : (error.message || 'No se pudo registrar el cobro.'), 'error');
  } finally {
    botonConfirmar.disabled = false;
  }
});

/* ============================== Control de salida (garita) ============================== */
function dato(lista, etiqueta, valor) {
  const dt = document.createElement('dt');
  dt.textContent = etiqueta;
  const dd = document.createElement('dd');
  dd.textContent = valor ?? '—';
  lista.append(dt, dd);
}

function tarjetaSalida(r, bloqueo) {
  const cancelada = r.estado === 'cancelado';
  const habilitado = !cancelada && (r.estado_pago === 'pagado' || r.estado_pago === 'exonerado');
  const clase = cancelada ? 'salida-cancelado' : habilitado ? 'salida-habilitado' : 'salida-pendiente';

  const tarjeta = document.createElement('article');
  tarjeta.className = `salida ${clase}`;

  const titulo = document.createElement('h3');
  titulo.textContent = cancelada
    ? 'Reserva cancelada: no corresponde pase de salida'
    : habilitado
      ? '✓ Pase de salida HABILITADO'
      : `Pendiente de pago: cobrar ${formatearSoles(Number(r.monto_calculado))}`;
  tarjeta.append(titulo);
  if (bloqueo) {
    tarjeta.classList.add('salida-bloqueada');
    const alerta = document.createElement('p');
    alerta.className = 'alerta-bloqueo';
    alerta.textContent = `⛔ Placa en lista negra: ${bloqueo.motivo} (deuda ${formatearSoles(Number(bloqueo.deuda))}). Avisa al administrador antes de dejarlo salir.`;
    tarjeta.append(alerta);
  }

  const lista = document.createElement('dl');
  dato(lista, 'Reserva', r.codigo_seguimiento);
  dato(lista, 'Placa', r.placa);
  dato(lista, 'Pasajero', r.nombre_pasajero);
  dato(lista, 'Estadía', `${Number(r.horas)} h · ${NOMBRES_VEHICULO[r.tipo_vehiculo] ?? r.tipo_vehiculo}${r.zona_vip ? ' · VIP' : ''}`);
  dato(lista, 'Monto', formatearSoles(Number(r.monto_calculado)));
  if (r.codigo_operacion) {
    dato(lista, 'Operación', r.codigo_operacion);
    dato(lista, 'Canal', r.canal === 'pasarela' ? 'Pago en línea' : 'Ventanilla');
    dato(lista, 'Pagado', new Date(r.fecha_pago).toLocaleString('es-PE', { timeZone: 'America/Lima' }));
  }
  tarjeta.append(lista);

  if (!habilitado && !cancelada) {
    salidaCache.set(r.id, r);
    tarjeta.append(boton('Cobrar ahora', 'cobrar-salida', r.id, 'btn btn-confirmar'));
  }
  if (habilitado && r.estado === 'registrado' && !bloqueo) {
    salidaCache.set(r.id, r);
    tarjeta.append(boton('Registrar salida', 'registrar-salida', r.id, 'btn btn-confirmar'));
  }
  if (r.codigo_operacion) {
    const enlace = document.createElement('a');
    enlace.href = `comprobante.html?op=${encodeURIComponent(r.codigo_operacion)}`;
    enlace.target = '_blank';
    enlace.rel = 'noopener';
    enlace.className = 'enlace-comprobante';
    enlace.textContent = 'Ver comprobante';
    tarjeta.append(enlace);
  }
  return tarjeta;
}

async function pintarSalida(criterio) {
  ultimoCriterioSalida = criterio;
  salidaCache.clear();
  resultadoSalida.replaceChildren();

  const filas = await consultarSalida(criterio);
  if (filas.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'salida-vacia';
    vacio.textContent = 'No se encontró ninguna reserva con esa placa o código.';
    resultadoSalida.append(vacio);
    return;
  }
  const bloqueadas = await placasBloqueadas(filas.map((r) => r.placa));
  filas.forEach((r) => resultadoSalida.append(tarjetaSalida(r, bloqueadas[r.placa?.toUpperCase()])));
}

$('#form-salida').addEventListener('submit', async (e) => {
  e.preventDefault();
  const criterio = $('#criterio-salida').value.trim();
  if (!criterio) return;
  try {
    await pintarSalida(criterio);
  } catch (error) {
    console.error(error);
    avisar('No se pudo consultar la salida. Intenta de nuevo.', 'error');
  }
});

resultadoSalida.addEventListener('click', async (e) => {
  const salida = e.target.closest('button[data-accion="registrar-salida"]');
  if (salida) {
    const registro = salidaCache.get(Number(salida.dataset.id));
    if (!registro) return;
    salida.disabled = true;
    try {
      const ok = await registrarSalida(registro.id, usuario.id);
      if (ok) {
        registrar(usuario, 'Salida registrada', `${registro.codigo_seguimiento} · ${registro.placa}`);
        avisar(`Salida registrada: ${registro.placa}.`);
      } else {
        avisar('Esa reserva ya tenía la salida registrada o no está pagada.', 'error');
      }
      await pintarSalida(ultimoCriterioSalida);
    } catch (error) {
      console.error(error);
      avisar('No se pudo registrar la salida.', 'error');
      salida.disabled = false;
    }
    return;
  }
  const b = e.target.closest('button[data-accion="cobrar-salida"]');
  if (!b) return;
  const registro = salidaCache.get(Number(b.dataset.id));
  if (registro) abrirCobro(registro);
});

/* ============================== Pagos en línea (conciliación) ============================== */
async function pintarPagosEnLinea() {
  const pagos = await listarPagosEnLinea(inputFecha.value, chkPorVerificar.checked);
  tablaEnLinea.replaceChildren();
  if (pagos.length === 0) filaVacia(tablaEnLinea, 8, 'Sin operaciones en línea para esta fecha.');

  for (const p of pagos) {
    const tr = document.createElement('tr');
    if (p.estado === 'rechazado') tr.className = 'fila-rechazada';
    celda(tr, new Date(p.fecha_pago).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }));
    celda(tr, p.codigo_operacion);
    celda(tr, `${p.codigo_seguimiento} · ${p.placa}`);
    celda(tr, p.cliente);
    celda(tr, describirMedio(p));
    celda(tr, formatearSoles(Number(p.monto)));
    celda(tr, p.estado === 'aprobado' ? 'Aprobado' : `Rechazado: ${p.motivo_rechazo}`);
    const tdAccion = celda(tr);
    if (p.estado === 'aprobado' && !p.verificado) tdAccion.append(boton('Verificar', 'verificar', p.id));
    else if (p.verificado) tdAccion.textContent = `Verificado por ${p.verificador}`;
    tablaEnLinea.append(tr);
  }

  // Cuántos pagos aprobados siguen sin verificar
  animarNumero($('#kpi-porverificar'), pagos.filter((p) => p.estado === 'aprobado' && !p.verificado).length);

  // Aviso de pagos nuevos desde la última revisión
  const idsAprobados = pagos.filter((p) => p.estado === 'aprobado').map((p) => p.id);
  const maxId = idsAprobados.length ? Math.max(...idsAprobados) : 0;
  if (ultimoIdVisto !== null && maxId > ultimoIdVisto) {
    const nuevos = idsAprobados.filter((id) => id > ultimoIdVisto).length;
    $('#aviso-nuevos').textContent = `Ingresaron ${nuevos} pago(s) nuevo(s) por la pasarela.`;
    avisar(`Ingresaron ${nuevos} pago(s) nuevo(s) por la pasarela.`);
  }
  ultimoIdVisto = Math.max(ultimoIdVisto ?? 0, maxId);
}

tablaEnLinea.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-accion="verificar"]');
  if (!b) return;
  if (!confirm('¿Confirmas que este pago figura en el estado de cuenta de la entidad?')) return;

  b.disabled = true;
  try {
    const verificado = await verificarPago(Number(b.dataset.id), usuario.id);
    if (verificado) registrar(usuario, 'Pago en línea verificado', `Pago #${b.dataset.id}`);
    avisar(verificado ? 'Pago verificado.' : 'Ese pago ya estaba verificado.', verificado ? 'exito' : 'error');
    await pintarPagosEnLinea();
  } catch (error) {
    console.error(error);
    avisar('No se pudo verificar el pago.', 'error');
    b.disabled = false;
  }
});

/* ============================== Resumen del día ============================== */
async function pintarResumen() {
  const [cobros, ampliaciones, descuentos] = await Promise.all([
    resumenDelDia(inputFecha.value), ampliacionesDelDia(inputFecha.value), descuentosDelDia(inputFecha.value),
  ]);
  // Las ampliaciones de estadía se pagan en línea: se suman como un canal más
  const filas = [...cobros, ...ampliaciones.map((a) => ({ ...a, canal: 'ampliacion' }))];
  tablaResumen.replaceChildren();
  if (filas.length === 0) filaVacia(tablaResumen, 4, 'Sin cobros aprobados en esta fecha.');

  let total = 0;
  let enLinea = 0;
  let ventanilla = 0;
  let operaciones = 0;

  for (const f of filas) {
    const importe = Number(f.total);
    total += importe;
    operaciones += f.operaciones;
    if (f.canal === 'caja') ventanilla += importe;
    else enLinea += importe;

    const tr = document.createElement('tr');
    celda(tr, { pasarela: 'En línea', ampliacion: 'Ampliación (en línea)' }[f.canal] ?? 'Ventanilla');
    celda(tr, NOMBRES_METODO[f.metodo] ?? f.metodo);
    celda(tr, String(f.operaciones));
    celda(tr, formatearSoles(importe));
    tablaResumen.append(tr);
  }

  $('#total-dia').textContent = formatearSoles(redondear(total));
  $('#descuentos-dia').textContent = descuentos.cupones
    ? `Incluye ${formatearSoles(descuentos.total)} descontados con ${descuentos.cupones} cupón(es).`
    : '';
  animarNumero($('#kpi-total'), redondear(total), formatearSoles);
  animarNumero($('#kpi-enlinea'), redondear(enLinea), formatearSoles);
  animarNumero($('#kpi-ventanilla'), redondear(ventanilla), formatearSoles);
  animarNumero($('#kpi-operaciones'), operaciones);
}

async function refrescar() {
  try {
    await Promise.all([pintarPagosEnLinea(), pintarResumen()]);
    $('#ultima-actualizacion').textContent = new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima' });
  } catch (error) {
    console.error(error);
  }
}

inputFecha.addEventListener('change', () => {
  ultimoIdVisto = null;
  $('#aviso-nuevos').textContent = '';
  refrescar();
});
chkPorVerificar.addEventListener('change', refrescar);

// Cada 15 segundos revisa si entraron pagos por la pasarela (solo con la pestaña visible y sin ventana de cobro abierta)
setInterval(() => {
  if (document.hidden || dialogo.open) return;
  refrescar();
  pintarPendientes($('#criterio').value).catch((error) => console.error(error));
}, 15000);

/* ============================== Arranque ============================== */
mostrarEsqueleto(tablaPendientes, 6);
mostrarEsqueleto(tablaEnLinea, 8);
mostrarEsqueleto(tablaResumen, 4, 3);

pintarPendientes().catch((error) => {
  console.error(error);
  tablaPendientes.replaceChildren();
  filaVacia(tablaPendientes, 6, 'No se pudieron cargar las reservas pendientes.');
});
refrescar();
