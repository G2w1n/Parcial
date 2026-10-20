// js/estacionamiento/ampliar.js
// Ampliar la estadía de una reserva YA pagada: se calcula el nuevo total con el tarifario
// y se cobra solo la diferencia (pasarela.js vuelve a calcularla contra la base de datos)
import { sql } from '../config/neon-config.js';
import { exigirRol } from '../auth/auth.js';
import { calcularMontoServicio, desglosarMonto, formatearSoles, redondear } from '../registro/tarifario.js';
import {
  formatearNumeroTarjeta, formatearVencimiento, validarFormularioTarjeta, validarCelular, validarCodigoAprobacion,
} from '../pago/validaciones.js';
import { pagarAmpliacion } from '../pago/pasarela.js';
import { avisar, conCarga, lanzarConfeti } from '../config/ui.js';

const usuario = exigirRol('cliente');
if (!usuario) throw new Error('Acceso denegado');

const $ = (id) => document.getElementById(id);
const codigo = new URLSearchParams(location.search).get('codigo');
const inputExtra = $('am-extra');
const form = $('form-ampliar');
let reserva = null;
let diferencia = 0;

async function obtenerReserva() {
  const filas = await sql`
    SELECT id, codigo_seguimiento, placa, horas, tipo_vehiculo, zona_vip, fecha_hora_entrada,
           monto_calculado, estado, estado_pago
    FROM reservas_estacionamiento
    WHERE codigo_seguimiento = ${codigo} AND usuario_id = ${usuario.id};
  `;
  return filas[0] ?? null;
}

// La fecha llega como Date o como texto "AAAA-MM-DD HH:MM:SS" (hora de Perú)
function aFecha(valor) {
  if (valor instanceof Date) return valor;
  return new Date(String(valor).replace(' ', 'T').slice(0, 19));
}

function textoFecha(fecha) {
  return fecha.toLocaleString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const salidaCon = (horas) => new Date(aFecha(reserva.fecha_hora_entrada).getTime() + horas * 3600 * 1000);

function horasExtra() {
  const h = Math.round(Number(inputExtra.value));
  return Number.isFinite(h) ? Math.min(Math.max(h, 1), 72) : 1;
}

function mostrarAviso(texto) {
  $('aviso').textContent = texto;
  $('aviso').hidden = false;
  $('contenido').hidden = true;
}

function calcular() {
  const extra = horasExtra();
  const horasNuevas = Number(reserva.horas) + extra;
  const nuevo = { ...reserva, horas: horasNuevas };
  const { lineas, total } = desglosarMonto(nuevo);
  diferencia = redondear(Math.max(0, calcularMontoServicio(nuevo) - Number(reserva.monto_calculado)));

  $('am-nueva-salida').textContent = textoFecha(salidaCon(horasNuevas));
  $('am-desglose').replaceChildren(...lineas.map((l) => {
    const li = document.createElement('li');
    const a = document.createElement('span');
    a.textContent = l.etiqueta;
    const b = document.createElement('span');
    b.textContent = formatearSoles(l.valor);
    li.append(a, b);
    return li;
  }));
  $('am-nuevo-total').textContent = formatearSoles(total);
  $('am-pagado').textContent = formatearSoles(Number(reserva.monto_calculado));
  $('am-diferencia').textContent = formatearSoles(diferencia);

  // Si la diferencia es 0 (por ejemplo, dentro del tope diario) no se pide medio de pago
  const gratis = diferencia === 0;
  document.querySelector('.metodos').hidden = gratis;
  $('campos-tarjeta').hidden = gratis || formaElegida() !== 'tarjeta';
  $('campos-billetera').hidden = gratis || formaElegida() !== 'billetera';
  $('am-prueba').hidden = gratis;
  $('am-pagar').textContent = gratis ? 'Ampliar sin costo' : `Pagar ${formatearSoles(diferencia)} y ampliar`;
}

const formaElegida = () => document.querySelector('input[name="forma"]:checked').value;

function pintarReserva() {
  $('am-codigo').textContent = reserva.codigo_seguimiento;
  $('am-placa').textContent = reserva.placa;
  $('am-horas').textContent = `${Number(reserva.horas)} h`;
  $('am-salida').textContent = textoFecha(salidaCon(Number(reserva.horas)));
  calcular();
}

async function cargar() {
  if (!codigo) return mostrarAviso('No se indicó la reserva. Entra desde "Mis reservas".');
  try {
    reserva = await obtenerReserva();
  } catch (error) {
    console.error(error);
    return mostrarAviso('No se pudo cargar la reserva. Intenta de nuevo.');
  }
  if (!reserva) return mostrarAviso('No se encontró esa reserva, o no te pertenece.');
  if (reserva.estado_pago !== 'pagado') return mostrarAviso('Esta reserva aún no está pagada: puedes cambiar sus horas desde "Editar" en Mis reservas.');
  if (reserva.estado !== 'registrado') return mostrarAviso(`La reserva está "${reserva.estado}" y ya no se puede ampliar.`);
  $('contenido').hidden = false;
  pintarReserva();
}

// ---------- Eventos ----------
inputExtra.addEventListener('input', calcular);
document.querySelectorAll('.paso').forEach((b) => b.addEventListener('click', () => {
  inputExtra.value = Math.min(Math.max(horasExtra() + Number(b.dataset.delta), 1), 72);
  calcular();
}));
document.querySelectorAll('.rapidos button').forEach((b) => b.addEventListener('click', () => {
  inputExtra.value = b.dataset.horas;
  calcular();
}));
document.querySelectorAll('input[name="forma"]').forEach((r) => r.addEventListener('change', calcular));
$('am-numero').addEventListener('input', (e) => { e.target.value = formatearNumeroTarjeta(e.target.value); });
$('am-venc').addEventListener('input', (e) => { e.target.value = formatearVencimiento(e.target.value); });

$('am-prueba').addEventListener('click', () => {
  if (formaElegida() === 'tarjeta') {
    $('am-numero').value = '4111 1111 1111 1111';
    $('am-venc').value = '12/29';
    $('am-cvv').value = '123';
    $('am-titular').value = 'ANA TORRES QUISPE';
  } else {
    $('am-proveedor').value = 'andipay';
    $('am-celular').value = '987654321';
    $('am-codigo-aprob').value = '123456';
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errores = $('am-errores');
  errores.textContent = '';

  let forma = null;
  if (diferencia > 0) {
    const datos = Object.fromEntries(new FormData(form));
    if (formaElegida() === 'tarjeta') {
      const v = validarFormularioTarjeta(datos);
      if (!v.valido) {
        errores.textContent = Object.values(v.errores).join(' ');
        return;
      }
      forma = { tipo: 'tarjeta', numero: datos.numero, mes: v.venc.mes, anio: v.venc.anio, cvv: datos.cvv, marca: v.marca };
    } else {
      if (!validarCelular(datos.celular) || !validarCodigoAprobacion(datos.codigo)) {
        errores.textContent = 'Revisa el celular (9 dígitos) y el código de aprobación (6 dígitos).';
        return;
      }
      forma = { tipo: 'billetera', proveedor: datos.proveedor, celular: datos.celular, codigoAprobacion: datos.codigo };
    }
  }

  const boton = $('am-pagar');
  const resultado = $('am-resultado');
  try {
    const r = await conCarga(boton, () => pagarAmpliacion({
      idRegistro: reserva.id,
      usuario,
      horasExtra: horasExtra(),
      montoEsperado: diferencia,
      calcularNuevoTotal: calcularMontoServicio,
      forma,
    }));
    resultado.hidden = false;
    if (r.aprobado) {
      resultado.className = 'resultado ok';
      resultado.textContent = `✓ Estadía ampliada a ${r.nuevasHoras} h. Operación ${r.codigo}${r.monto > 0 ? ` · cobrado ${formatearSoles(r.monto)}` : ''}.`;
      avisar('Estadía ampliada. Tu pase de salida se actualizó.');
      lanzarConfeti(boton);
      form.reset();
      reserva = await obtenerReserva();
      pintarReserva();
    } else {
      resultado.className = 'resultado error';
      resultado.textContent = `No se pudo ampliar: ${r.motivo}`;
    }
  } catch (error) {
    console.error(error);
    resultado.hidden = false;
    resultado.className = 'resultado error';
    resultado.textContent = 'No se pudo procesar el pago. Revisa tu conexión.';
  }
});

cargar();
