// js/garita/garita.js
// Garita de salida: lee el código QR del comprobante con la cámara (o se escribe la placa/código),
// muestra si el pase está habilitado y registra la salida del vehículo.
import { exigirRol } from '../auth/auth.js';
import { consultarSalida, placasBloqueadas, registrarSalida } from '../caja/caja-datos.js';
import { avisar, conCarga } from '../config/ui.js';
import { registrar } from '../config/bitacora.js';
import { formatearSoles, NOMBRES_VEHICULO } from '../registro/tarifario.js';

const usuario = exigirRol('seguridad', 'cajero', 'administrador');
if (!usuario) throw new Error('Acceso denegado');

const $ = (id) => document.getElementById(id);
const video = $('video');
const lienzo = document.createElement('canvas');
const contexto = lienzo.getContext('2d', { willReadFrequently: true });
const resultado = $('resultado');
let flujo = null;
let ultimoCodigo = '';
let ultimoMomento = 0;
const salidasDelTurno = [];

const crear = (etiqueta, clase, texto) => {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
};

// El QR del comprobante dice "QORIKANCHA-PASE|COD-12345678|OP-...". También se acepta el código o la placa sola
function leerCriterio(texto) {
  const limpio = String(texto ?? '').trim();
  if (limpio.startsWith('QORIKANCHA-PASE|')) return limpio.split('|')[1];
  if (limpio.startsWith('QORIKANCHA|')) return { error: 'Ese es el QR de una tarjeta de embarque, no de un pase de estacionamiento.' };
  return limpio;
}

/* ============================== Cámara ============================== */
async function encenderCamara() {
  if (!navigator.mediaDevices?.getUserMedia) {
    avisar('Este navegador no permite usar la cámara. Escribe la placa o el código.', 'error');
    return;
  }
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = flujo;
    await video.play();
    $('camara').classList.add('activa');
    $('btn-camara').textContent = 'Apagar cámara';
    requestAnimationFrame(escanear);
  } catch (error) {
    console.error(error);
    avisar(error.name === 'NotAllowedError'
      ? 'No se dio permiso para usar la cámara. Actívalo en el navegador o escribe la placa.'
      : 'No se pudo encender la cámara.', 'error');
  }
}

function apagarCamara() {
  flujo?.getTracks().forEach((t) => t.stop());
  flujo = null;
  video.srcObject = null;
  $('camara').classList.remove('activa');
  $('btn-camara').textContent = 'Encender cámara';
}

function escanear() {
  if (!flujo) return;
  if (video.readyState === video.HAVE_ENOUGH_DATA && typeof window.jsQR === 'function') {
    const ancho = Math.min(640, video.videoWidth);
    const alto = Math.round((video.videoHeight / video.videoWidth) * ancho);
    lienzo.width = ancho;
    lienzo.height = alto;
    contexto.drawImage(video, 0, 0, ancho, alto);
    const imagen = contexto.getImageData(0, 0, ancho, alto);
    const codigo = window.jsQR(imagen.data, ancho, alto, { inversionAttempts: 'dontInvert' });
    // El mismo código no se vuelve a consultar durante 4 segundos
    if (codigo?.data && (codigo.data !== ultimoCodigo || Date.now() - ultimoMomento > 4000)) {
      ultimoCodigo = codigo.data;
      ultimoMomento = Date.now();
      navigator.vibrate?.(120);
      consultar(codigo.data);
    }
  }
  requestAnimationFrame(escanear);
}

$('btn-camara').addEventListener('click', () => (flujo ? apagarCamara() : encenderCamara()));

/* ============================== Consulta ============================== */
function dato(lista, nombre, valor) {
  const div = crear('div');
  div.append(crear('dt', '', nombre), crear('dd', '', valor ?? '—'));
  lista.append(div);
}

function tarjeta(r, bloqueo) {
  const cancelada = r.estado === 'cancelado';
  const yaSalio = r.estado === 'atendido';
  const pagada = r.estado_pago === 'pagado' || r.estado_pago === 'exonerado';
  let clase = 'pendiente';
  let titulo = `Pendiente de pago: ${formatearSoles(Number(r.monto_calculado))}. Envíalo a caja.`;
  if (cancelada) { clase = 'cancelada'; titulo = 'Reserva cancelada: no corresponde salida con este pase.'; }
  else if (yaSalio) { clase = 'usada'; titulo = 'Este pase ya se usó: el vehículo ya salió.'; }
  else if (pagada) { clase = 'habilitada'; titulo = '✓ Salida habilitada'; }
  if (bloqueo) { clase = 'bloqueada'; titulo = '⛔ Placa en lista negra: no dejar salir. Llama al administrador.'; }

  const art = crear('article', `pase-salida ${clase}`);
  art.append(crear('h2', '', titulo));
  if (bloqueo) art.append(crear('p', 'motivo-bloqueo', `${bloqueo.motivo} · deuda ${formatearSoles(Number(bloqueo.deuda))}`));
  const lista = crear('dl');
  dato(lista, 'Placa', r.placa);
  dato(lista, 'Reserva', r.codigo_seguimiento);
  dato(lista, 'Pasajero', r.nombre_pasajero);
  dato(lista, 'Estadía', `${Number(r.horas)} h · ${NOMBRES_VEHICULO[r.tipo_vehiculo] ?? r.tipo_vehiculo}${r.zona_vip ? ' · VIP' : ''}`);
  dato(lista, 'Pago', r.codigo_operacion ? `${r.codigo_operacion} (${r.canal === 'pasarela' ? 'en línea' : 'ventanilla'})` : r.estado_pago);
  art.append(lista);

  if (clase === 'habilitada') {
    const boton = crear('button', 'btn-salida', 'Registrar salida y abrir barrera');
    boton.type = 'button';
    boton.addEventListener('click', async () => {
      try {
        const ok = await conCarga(boton, () => registrarSalida(r.id, usuario.id));
        if (!ok) {
          avisar('La salida ya estaba registrada o la reserva no está pagada.', 'error');
          return;
        }
        registrar(usuario, 'Salida registrada', `${r.codigo_seguimiento} · ${r.placa}`);
        avisar(`Salida registrada: ${r.placa}. ¡Buen viaje!`);
        salidasDelTurno.unshift({ placa: r.placa, codigo: r.codigo_seguimiento, hora: new Date() });
        pintarHistorial();
        consultar(r.codigo_seguimiento);
      } catch (error) {
        console.error(error);
        avisar('No se pudo registrar la salida.', 'error');
      }
    });
    art.append(boton);
  }
  return art;
}

async function consultar(texto) {
  const criterio = leerCriterio(texto);
  if (criterio?.error) {
    resultado.replaceChildren(crear('p', 'resultado-vacio', criterio.error));
    return;
  }
  if (!criterio) return;
  $('criterio').value = criterio;
  resultado.replaceChildren(crear('p', 'resultado-vacio', 'Consultando…'));
  try {
    const filas = await consultarSalida(criterio);
    if (filas.length === 0) {
      resultado.replaceChildren(crear('p', 'resultado-vacio', `No se encontró ninguna reserva con "${criterio}".`));
      return;
    }
    const bloqueadas = await placasBloqueadas(filas.map((r) => r.placa));
    resultado.replaceChildren(...filas.map((r) => tarjeta(r, bloqueadas[r.placa?.toUpperCase()])));
  } catch (error) {
    console.error(error);
    resultado.replaceChildren(crear('p', 'resultado-vacio', 'No se pudo consultar. Revisa la conexión.'));
  }
}

function pintarHistorial() {
  $('contador-salidas').textContent = String(salidasDelTurno.length);
  $('historial').replaceChildren(...salidasDelTurno.slice(0, 10).map((s) => {
    const li = crear('li');
    li.append(crear('strong', '', s.placa), crear('span', '', `${s.codigo} · ${s.hora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`));
    return li;
  }));
}

$('form-manual').addEventListener('submit', (e) => {
  e.preventDefault();
  consultar($('criterio').value);
});

$('nombre-turno').textContent = usuario.nombre;
const codigoUrl = new URLSearchParams(location.search).get('codigo');
if (codigoUrl) consultar(codigoUrl);
pintarHistorial();
window.addEventListener('pagehide', apagarCamara);
