// js/pago/pago.js
import { exigirRol } from '../auth/auth.js';
import { desglosarGuardado, formatearSoles, redondear, NOMBRES_VEHICULO } from '../registro/tarifario.js';
import {
  formatearNumeroTarjeta, formatearVencimiento, detectarMarca,
  validarFormularioTarjeta, validarCelular, validarCodigoAprobacion,
} from './validaciones.js';
import { obtenerRegistro, listarPendientesCliente, pagarConTarjeta, pagarConBilletera, revisarCupon } from './pasarela.js';
import { avisar, lanzarConfeti, sinAnimaciones } from '../config/ui.js';

const usuario = exigirRol('cliente');
if (!usuario) throw new Error('Acceso denegado');

const $ = (selector) => document.querySelector(selector);

const selectRegistro = $('#registro');
const detalle = $('#resumen-detalle');
const resumenMonto = $('#resumen-monto');
const mensaje = $('#mensaje-pago');
const panelPago = $('#panel-pago');
const formTarjeta = $('#form-tarjeta');
const formBilletera = $('#form-billetera');
const inputNumero = $('#numero');
const inputVenc = $('#vencimiento');
const inputCvv = $('#cvv');
const inputTitular = $('#titular');
const marcaDetectada = $('#marca-detectada');
const vista = {
  tarjeta: $('#vista-tarjeta'),
  numero: $('#vista-numero'),
  titular: $('#vista-titular'),
  venc: $('#vista-venc'),
  marca: $('#vista-marca'),
};

let registroActual = null;
let cobrando = false;
let cuponAplicado = null; // { cupon, descuento, descripcion }

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = `mensaje mensaje--${tipo}`;
}

function mostrarError(campo, texto = '') {
  document.querySelector(`#error-${campo}`).textContent = texto;
  document.querySelector(`#${campo}`).setAttribute('aria-invalid', texto ? 'true' : 'false');
}

function limpiarErrores() {
  ['numero', 'vencimiento', 'cvv', 'titular', 'celular', 'codigo'].forEach((campo) => mostrarError(campo, ''));
}

function sacudir(elemento) {
  if (sinAnimaciones) return;
  elemento.classList.remove('sacudir');
  void elemento.offsetWidth;
  elemento.classList.add('sacudir');
}

[formTarjeta, formBilletera].forEach((formulario) => {
  formulario.addEventListener('animationend', (evento) => {
    if (evento.animationName === 'sacudir') formulario.classList.remove('sacudir');
  });
});

// ---- Resumen de la reserva elegida ----
function agregarFila(lista, etiqueta, valor) {
  const li = document.createElement('li');
  const a = document.createElement('span');
  a.textContent = etiqueta;
  const b = document.createElement('span');
  b.textContent = valor;
  li.append(a, b);
  lista.append(li);
}

function pintarResumen() {
  detalle.replaceChildren();
  if (!registroActual) {
    resumenMonto.textContent = '—';
    return;
  }
  const r = registroActual;
  agregarFila(detalle, 'Reserva', r.codigo_seguimiento);
  agregarFila(detalle, 'Placa', r.placa);
  agregarFila(detalle, 'Vehículo', `${NOMBRES_VEHICULO[r.tipo_vehiculo] ?? r.tipo_vehiculo}${r.zona_vip ? ' · zona VIP' : ''}`);
  desglosarGuardado(r, r.monto_calculado).lineas.forEach((linea) => agregarFila(detalle, linea.etiqueta, formatearSoles(linea.valor)));
  let total = Number(r.monto_calculado); // el total sale de la base de datos
  if (cuponAplicado) {
    agregarFila(detalle, `Cupón ${cuponAplicado.cupon}`, formatearSoles(-cuponAplicado.descuento));
    detalle.lastElementChild.classList.add('linea-descuento');
    total = redondear(total - cuponAplicado.descuento);
  }
  resumenMonto.textContent = formatearSoles(total);
}

// ---- Cupón de descuento ----
const formCupon = $('#form-cupon');
const inputCupon = $('#cupon');
const botonCupon = $('#btn-cupon');
const mensajeCupon = $('#mensaje-cupon');

function mostrarCupon(texto, tipo = '') {
  mensajeCupon.textContent = texto;
  mensajeCupon.className = `mensaje-cupon ${tipo}`;
}

function quitarCupon(mensaje = '') {
  cuponAplicado = null;
  inputCupon.disabled = false;
  inputCupon.value = '';
  botonCupon.textContent = 'Aplicar';
  botonCupon.classList.remove('quitar');
  mostrarCupon(mensaje, mensaje ? 'error' : '');
  pintarResumen();
}

formCupon.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (cuponAplicado) {
    quitarCupon();
    return;
  }
  if (!registroActual) return;
  botonCupon.disabled = true;
  try {
    const revision = await revisarCupon(inputCupon.value, registroActual.monto_calculado);
    if (revision.error) {
      mostrarCupon(revision.error, 'error');
      return;
    }
    cuponAplicado = revision;
    inputCupon.value = revision.cupon;
    inputCupon.disabled = true;
    botonCupon.textContent = 'Quitar';
    botonCupon.classList.add('quitar');
    mostrarCupon(`✓ ${revision.descripcion}: ahorras ${formatearSoles(revision.descuento)}.`, 'ok');
    pintarResumen();
  } catch (error) {
    console.error(error);
    mostrarCupon('No se pudo revisar el cupón. Intenta de nuevo.', 'error');
  } finally {
    botonCupon.disabled = false;
  }
});

// ---- Reservas pendientes del cliente ----
async function cargarPendientes() {
  const pendientes = await listarPendientesCliente(usuario.id);
  selectRegistro.replaceChildren();

  if (pendientes.length === 0) {
    panelPago.hidden = true;
    selectRegistro.disabled = true;
    registroActual = null;
    pintarResumen();
    mostrarMensaje('No tienes reservas pendientes de pago.', 'info');
    return;
  }

  panelPago.hidden = false;
  selectRegistro.disabled = false;
  for (const p of pendientes) {
    const opcion = document.createElement('option');
    opcion.value = p.id;
    opcion.textContent = `${p.codigo_seguimiento} · ${p.placa} — ${formatearSoles(Number(p.monto_calculado))}`;
    selectRegistro.append(opcion);
  }

  // Si llegó desde la reserva o desde Mis reservas con ?id=, se preselecciona
  const idUrl = new URLSearchParams(location.search).get('id');
  if (idUrl && pendientes.some((p) => String(p.id) === idUrl)) selectRegistro.value = idUrl;

  await seleccionarRegistro();
}

async function seleccionarRegistro() {
  registroActual = await obtenerRegistro(Number(selectRegistro.value), usuario.id);
  if (cuponAplicado) quitarCupon(); // el cupón se vuelve a revisar con el monto de la otra reserva
  pintarResumen();
}

// ---- Tarjeta o billetera ----
function elegirMetodo(valor) {
  const radio = document.querySelector(`input[name="metodo"][value="${valor}"]`);
  if (radio) radio.checked = true;
  formTarjeta.hidden = valor !== 'tarjeta';
  formBilletera.hidden = valor !== 'billetera';
}

// ---- Vista previa de la tarjeta y formato en vivo ----
function actualizarVista() {
  const marca = detectarMarca(inputNumero.value);
  vista.numero.textContent = inputNumero.value || '•••• •••• •••• ••••';
  vista.titular.textContent = inputTitular.value.trim().toUpperCase() || 'NOMBRE DEL TITULAR';
  vista.venc.textContent = inputVenc.value || 'MM/AA';
  vista.marca.textContent = marca ?? '';
  marcaDetectada.textContent = marca ?? '';
  vista.tarjeta.dataset.marca = marca ? marca.toLowerCase().replace(/\s/g, '') : '';
}

inputNumero.addEventListener('input', () => {
  inputNumero.value = formatearNumeroTarjeta(inputNumero.value);
  actualizarVista();
});
inputVenc.addEventListener('input', () => {
  inputVenc.value = formatearVencimiento(inputVenc.value);
  actualizarVista();
});
inputTitular.addEventListener('input', actualizarVista);

// ---- Procesar un pago (común a tarjeta y billetera) ----
async function procesar(formulario, operacion) {
  if (cobrando) return;
  if (!registroActual || registroActual.estado_pago !== 'pendiente') {
    mostrarMensaje('Selecciona una reserva pendiente de pago.', 'error');
    return;
  }

  cobrando = true;
  let aprobado = false;
  const boton = formulario.querySelector('button[type="submit"]');
  const textoOriginal = boton.textContent;
  boton.disabled = true; // evita el doble clic = doble cobro
  boton.classList.add('cargando');
  boton.textContent = 'Procesando...';
  mostrarMensaje('Conectando con la entidad...', 'info');

  try {
    const resultado = await operacion();

    if (resultado.aprobado) {
      aprobado = true;
      formulario.reset();
      actualizarVista();
      mostrarMensaje(`Pago aprobado. Operación ${resultado.codigo}.`, 'exito');
      avisar('Pago aprobado. Tu pase de salida está habilitado.');
      lanzarConfeti(boton);
      setTimeout(() => {
        window.location.href = `comprobante.html?op=${encodeURIComponent(resultado.codigo)}`;
      }, sinAnimaciones ? 600 : 1800);
    } else {
      mostrarMensaje(`Pago rechazado: ${resultado.motivo}`, 'error');
      sacudir(formulario);
      // Si ya estaba pagada o cancelada, se refresca la lista de pendientes
      if (/ya fue pagada|cancelada|No se encontró/.test(resultado.motivo)) await cargarPendientes();
      if (/cupón/i.test(resultado.motivo)) quitarCupon(resultado.motivo);
    }
  } catch (error) {
    console.error(error);
    mostrarMensaje('No se pudo procesar el pago. Revisa tu conexión.', 'error');
  } finally {
    cobrando = false;
    boton.classList.remove('cargando');
    if (aprobado) {
      boton.textContent = 'Pago aprobado ✓';
    } else {
      boton.disabled = false;
      boton.textContent = textoOriginal;
    }
  }
}

formTarjeta.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(formTarjeta));
  const { valido, errores, marca, venc } = validarFormularioTarjeta(datos);

  ['numero', 'vencimiento', 'cvv', 'titular'].forEach((campo) => mostrarError(campo, errores[campo]));
  if (!valido) {
    sacudir(formTarjeta);
    mostrarMensaje('Revisa los datos de la tarjeta. El pago no se envió.', 'error');
    return;
  }

  await procesar(formTarjeta, () => pagarConTarjeta({
    idRegistro: registroActual.id,
    usuario,
    numero: datos.numero,
    mes: venc.mes,
    anio: venc.anio,
    cvv: datos.cvv,
    marca,
    cupon: cuponAplicado?.cupon ?? null,
  }));
});

formBilletera.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(formBilletera));
  const celularOk = validarCelular(datos.celular);
  const codigoOk = validarCodigoAprobacion(datos.codigo);

  mostrarError('celular', celularOk ? '' : 'Celular de 9 dígitos que empiece con 9.');
  mostrarError('codigo', codigoOk ? '' : 'El código tiene 6 dígitos.');
  if (!celularOk || !codigoOk) {
    sacudir(formBilletera);
    mostrarMensaje('Revisa los datos de la billetera. El pago no se envió.', 'error');
    return;
  }

  await procesar(formBilletera, () => pagarConBilletera({
    idRegistro: registroActual.id,
    usuario,
    proveedor: datos.proveedor,
    celular: datos.celular,
    codigoAprobacion: datos.codigo,
    cupon: cuponAplicado?.cupon ?? null,
  }));
});

// ---- Datos de prueba: rellenan el formulario con un clic ----
$('#datos-prueba').addEventListener('click', (e) => {
  const boton = e.target.closest('button[data-tipo]');
  if (!boton) return;

  limpiarErrores();
  mostrarMensaje('', 'info');

  if (boton.dataset.tipo === 'tarjeta') {
    elegirMetodo('tarjeta');
    inputNumero.value = formatearNumeroTarjeta(boton.dataset.numero);
    inputVenc.value = boton.dataset.venc;
    inputCvv.value = boton.dataset.cvv;
    inputTitular.value = boton.dataset.titular;
    actualizarVista();
  } else {
    elegirMetodo('billetera');
    $('#proveedor').value = boton.dataset.proveedor;
    $('#celular').value = boton.dataset.celular;
    $('#codigo').value = boton.dataset.codigo;
  }
});

selectRegistro.addEventListener('change', seleccionarRegistro);
document.querySelectorAll('input[name="metodo"]').forEach((radio) => {
  radio.addEventListener('change', () => elegirMetodo(radio.value));
});

elegirMetodo('tarjeta');
actualizarVista();
cargarPendientes().catch((error) => {
  console.error(error);
  mostrarMensaje('No se pudieron cargar tus reservas. Intenta de nuevo.', 'error');
});