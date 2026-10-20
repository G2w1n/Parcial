import { sql } from '../config/neon-config.js';
import { exigirRol } from '../auth/auth.js';
import { cargarConfiguracion } from '../config/configuracion.js';
import {
  calcularMontoServicio, desglosarMonto, formatearSoles, marcado,
  TARIFA_POR_HORA, ADICIONAL_ZONA_VIP, RECARGO_BUS_CAMION, HORAS_MAXIMAS,
} from '../registro/tarifario.js';
import { avisar, conCarga } from '../config/ui.js';

const usuario = exigirRol('cliente');
if (!usuario) throw new Error('Acceso denegado');

// Tarifas vigentes que configura el administrador (si no hay, se usan las de tarifario.js)
await cargarConfiguracion();

const codigo = new URLSearchParams(window.location.search).get('codigo');
let reservaId = null;

export async function obtenerReservaPropia(codigoSeguimiento) {
  const filas = await sql`
    SELECT id, codigo_seguimiento, nombre_pasajero, placa, fecha_hora_entrada,
           horas, tipo_vehiculo, zona_vip, estado, estado_pago
    FROM reservas_estacionamiento
    WHERE codigo_seguimiento = ${codigoSeguimiento} AND usuario_id = ${usuario.id};
  `;
  return filas[0] || null;
}

// El monto se recalcula aquí (no se confía en la pantalla) y solo se edita si sigue registrada y sin pagar.
// El "AND usuario_id = ..." evita que un cliente edite la reserva de otro cambiando el código en la URL.
export async function actualizarRegistro(id, datos) {
  const monto = calcularMontoServicio(datos);
  const filas = await sql`
    UPDATE reservas_estacionamiento
    SET nombre_pasajero = ${datos.nombre_pasajero}, placa = ${datos.placa},
        fecha_hora_entrada = ${datos.fecha_hora_entrada}, horas = ${Number(datos.horas)},
        tipo_vehiculo = ${datos.tipo_vehiculo}, zona_vip = ${marcado(datos.zona_vip)},
        monto_calculado = ${monto}
    WHERE id = ${id} AND usuario_id = ${usuario.id}
      AND estado = 'registrado' AND estado_pago = 'pendiente'
    RETURNING id;
  `;
  if (filas.length === 0) {
    throw new Error('La reserva ya no se puede editar (fue pagada, atendida o cancelada).');
  }
  return monto;
}

const $ = (id) => document.getElementById(id);
const form = $('form-actualizar');
const avisoSoloLectura = $('solo-lectura-aviso');
const confirmacionEl = $('actualizar-confirmacion');

// Las tarifas se escriben desde tarifario.js: cambiar un precio es tocar un solo archivo
document.querySelectorAll('[data-tarifa]').forEach((el) => {
  const tipo = el.dataset.tarifa;
  if (tipo === 'hora') el.textContent = formatearSoles(TARIFA_POR_HORA);
  if (tipo === 'vip') el.textContent = formatearSoles(ADICIONAL_ZONA_VIP);
  if (tipo === 'bus') el.textContent = `+${Math.round(RECARGO_BUS_CAMION * 100)} %`;
});

const campos = [
  { input: $('ac-nombre'), msg: $('msg-ac-nombre'), validar: (v) => (v.trim().length >= 3 ? '' : 'Escribe al menos 3 caracteres.') },
  { input: $('ac-placa'), msg: $('msg-ac-placa'), validar: (v) => (/^[A-Za-z0-9-]{6,10}$/.test(v.trim()) ? '' : 'Usa de 6 a 10 letras, números o guiones (ej. ABC-123).') },
  { input: $('ac-fecha'), msg: $('msg-ac-fecha'), validar: (v) => (v ? '' : 'Elige la fecha y la hora de entrada.') },
  {
    input: $('ac-horas'),
    msg: $('msg-ac-horas'),
    validar: (v) => {
      const h = Number(v);
      return v !== '' && Number.isFinite(h) && h > 0 && h <= HORAS_MAXIMAS ? '' : `Indica las horas (de 0.5 a ${HORAS_MAXIMAS}).`;
    },
  },
];

function validarCampo(campo) {
  const mensaje = campo.validar(campo.input.value);
  campo.msg.textContent = mensaje;
  campo.input.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
  return mensaje === '';
}

function leerFormulario() {
  const datos = Object.fromEntries(new FormData(form));
  return {
    nombre_pasajero: datos.nombre_pasajero.trim(),
    placa: datos.placa.trim().toUpperCase(),
    fecha_hora_entrada: datos.fecha_hora_entrada,
    horas: datos.horas,
    tipo_vehiculo: datos.tipo_vehiculo,
    zona_vip: datos.zona_vip,
  };
}

function pintarCotizacion() {
  const { lineas, total, nota } = desglosarMonto(leerFormulario());
  const lista = $('ac-desglose');
  lista.replaceChildren();
  lineas.forEach((linea) => {
    const li = document.createElement('li');
    const etiqueta = document.createElement('span');
    etiqueta.textContent = linea.etiqueta;
    const valor = document.createElement('span');
    valor.textContent = formatearSoles(linea.valor);
    li.append(etiqueta, valor);
    lista.append(li);
  });
  $('ac-nota').textContent = nota;
  $('ac-monto').textContent = formatearSoles(total);
}

// <input type="datetime-local"> espera "AAAA-MM-DDTHH:MM" en hora local (toISOString la pasaría a UTC: +5 h)
function aFechaLocal(valor) {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

function mostrarAviso(mensaje) {
  avisoSoloLectura.textContent = mensaje;
  avisoSoloLectura.classList.add('visible');
  form.hidden = true;
}

async function cargarReserva() {
  if (!codigo) {
    mostrarAviso('No se especificó ninguna reserva para editar.');
    return;
  }

  try {
    const reserva = await obtenerReservaPropia(codigo);
    if (!reserva) {
      mostrarAviso('No se encontró esa reserva, o no te pertenece.');
      return;
    }
    if (reserva.estado !== 'registrado') {
      mostrarAviso(`Esta reserva está en estado "${reserva.estado}" y ya no se puede editar.`);
      return;
    }
    if (reserva.estado_pago !== 'pendiente') {
      mostrarAviso('Esta reserva ya fue pagada, por eso no se puede editar.');
      return;
    }

    reservaId = reserva.id;
    $('ac-codigo').textContent = reserva.codigo_seguimiento;
    $('ac-nombre').value = reserva.nombre_pasajero ?? '';
    $('ac-placa').value = reserva.placa ?? '';
    $('ac-fecha').value = aFechaLocal(reserva.fecha_hora_entrada);
    $('ac-horas').value = Number(reserva.horas) || '';
    const radio = form.querySelector(`input[name="tipo_vehiculo"][value="${reserva.tipo_vehiculo}"]`);
    if (radio) radio.checked = true;
    $('ac-vip').checked = Boolean(reserva.zona_vip);

    form.hidden = false;
    pintarCotizacion();
  } catch (error) {
    console.error(error);
    mostrarAviso('Ocurrió un error al cargar la reserva.');
  }
}

campos.forEach((campo) => campo.input.addEventListener('blur', () => validarCampo(campo)));
form.addEventListener('input', pintarCotizacion);
form.addEventListener('change', pintarCotizacion);

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  confirmacionEl.classList.remove('visible', 'error');

  const validos = campos.map(validarCampo);
  if (validos.includes(false)) {
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  const boton = form.querySelector('button[type="submit"]');
  try {
    const monto = await conCarga(boton, () => actualizarRegistro(reservaId, leerFormulario()));
    confirmacionEl.textContent = `✓ Reserva actualizada. Nuevo monto: ${formatearSoles(monto)}.`;
    confirmacionEl.classList.add('visible');
    avisar('Cambios guardados.');
  } catch (error) {
    console.error(error);
    confirmacionEl.textContent = error.message.startsWith('La reserva')
      ? error.message
      : 'Ocurrió un error al guardar los cambios.';
    confirmacionEl.classList.add('visible', 'error');
  }
});

cargarReserva();
