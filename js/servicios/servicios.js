// js/servicios/servicios.js
// Buscador de servicios, reserva de la Sala VIP (simulada) y calificaciones (tabla "calificaciones")
import { sql } from '../config/neon-config.js';
import { normalizar } from '../vuelos/datos-vuelos.js';
import { avisar, conCarga, formatearFecha } from '../config/ui.js';
import { formatearSoles } from '../registro/tarifario.js';

const $ = (id) => document.getElementById(id);

function leer(clave, vacio) {
  try {
    return JSON.parse(localStorage.getItem(clave)) ?? vacio;
  } catch {
    return vacio;
  }
}
function guardar(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento disponible
  }
}

/* ============================== Buscador de servicios ============================== */
const inputBuscar = $('buscar-servicio');
function filtrarServicios() {
  const buscado = normalizar(inputBuscar.value);
  let visibles = 0;
  document.querySelectorAll('#servicios-grid .servicio-card').forEach((card) => {
    const mostrar = !buscado || normalizar(card.textContent).includes(buscado);
    card.hidden = !mostrar;
    if (mostrar) visibles++;
  });
  $('servicios-vacio').hidden = visibles > 0;
}
inputBuscar.addEventListener('input', filtrarServicios);
$('form-buscar-servicio').addEventListener('submit', (e) => {
  e.preventDefault();
  filtrarServicios();
});

/* ============================== Sala VIP (simulada) ============================== */
const PRECIO_VIP = 129;
const formVip = $('form-vip');
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
$('vip-fecha').value = hoy;
$('vip-fecha').min = hoy;

function totalVip() {
  const personas = Math.min(Math.max(Math.round(Number($('vip-personas').value) || 1), 1), 6);
  $('vip-total').textContent = formatearSoles(personas * PRECIO_VIP);
  return personas;
}
formVip.addEventListener('input', totalVip);

formVip.addEventListener('submit', (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(formVip));
  const error = $('vip-error');
  error.textContent = '';
  if (!datos.fecha || datos.fecha < hoy) return void (error.textContent = 'Elige una fecha desde hoy.');
  if (!datos.hora || datos.hora < '04:30' || datos.hora > '20:00') return void (error.textContent = 'La sala atiende de 04:30 a 21:00: llega hasta las 20:00.');
  if (datos.nombre.trim().length < 3) return void (error.textContent = 'Escribe tu nombre.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo)) return void (error.textContent = 'Escribe un correo válido.');

  const personas = totalVip();
  const codigo = `VIP-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  const reservas = leer('qorikancha.vip', []);
  reservas.unshift({ codigo, ...datos, personas });
  guardar('qorikancha.vip', reservas.slice(0, 10));

  const caja = $('vip-confirmacion');
  const titulo = document.createElement('strong');
  titulo.textContent = `✓ Acceso reservado · ${codigo}`;
  const detalle = document.createElement('span');
  const fecha = new Date(`${datos.fecha}T12:00:00Z`).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  detalle.textContent = `${fecha}, ${datos.hora} · ${personas} persona(s) · ${formatearSoles(personas * PRECIO_VIP)}. Muestra este código en la entrada de la sala (nivel 2).`;
  caja.replaceChildren(titulo, detalle);
  caja.hidden = false;
  avisar('Acceso a la Sala VIP reservado.');
  formVip.reset();
  $('vip-fecha').value = hoy;
  totalVip();
});

/* ============================== Calificaciones ============================== */
const SERVICIOS = ['Sala VIP', 'Wi-Fi', 'Restaurantes', 'Estacionamiento', 'Seguridad', 'Limpieza', 'Mostradores', 'Información'];
const formCal = $('form-calificar');
const resumen = $('resumen-calificaciones');
const comentarios = $('comentarios');

$('cal-servicio').replaceChildren(...SERVICIOS.map((s) => {
  const op = document.createElement('option');
  op.value = s;
  op.textContent = s;
  return op;
}));

function estrellasTexto(valor) {
  const llenas = Math.round(valor);
  return '★'.repeat(llenas) + '☆'.repeat(5 - llenas);
}

function mostrarSinTabla() {
  const p = document.createElement('p');
  p.className = 'aviso-tabla';
  p.textContent = 'Las calificaciones aún no están activadas: falta ejecutar database/fase-4.sql en Neon.';
  resumen.replaceChildren(p);
  comentarios.replaceChildren();
}

async function cargarCalificaciones() {
  let promedios;
  let ultimos;
  try {
    [promedios, ultimos] = await Promise.all([
      sql`SELECT servicio, ROUND(AVG(estrellas), 1) AS promedio, COUNT(*)::int AS total
          FROM calificaciones GROUP BY servicio ORDER BY promedio DESC, total DESC;`,
      sql`SELECT servicio, estrellas, comentario, nombre, fecha FROM calificaciones
          WHERE comentario IS NOT NULL AND comentario <> '' ORDER BY fecha DESC LIMIT 6;`,
    ]);
  } catch (error) {
    if (error.code === '42P01') return mostrarSinTabla();
    console.error(error);
    resumen.textContent = 'No se pudieron cargar las calificaciones.';
    return;
  }

  resumen.replaceChildren(...SERVICIOS.map((servicio) => {
    const fila = promedios.find((p) => p.servicio === servicio);
    const div = document.createElement('div');
    div.className = 'fila-calif';
    const nombre = document.createElement('span');
    nombre.textContent = servicio;
    const estrellas = document.createElement('span');
    estrellas.className = 'estrellas-promedio';
    estrellas.textContent = fila ? estrellasTexto(Number(fila.promedio)) : '☆☆☆☆☆';
    estrellas.setAttribute('aria-label', fila ? `${fila.promedio} de 5` : 'Sin calificaciones');
    const dato = document.createElement('small');
    dato.textContent = fila ? `${Number(fila.promedio).toFixed(1)} · ${fila.total} opinión(es)` : 'Sé el primero';
    div.append(nombre, estrellas, dato);
    return div;
  }));

  comentarios.replaceChildren(...ultimos.map((c) => {
    const li = document.createElement('li');
    const cabecera = document.createElement('div');
    cabecera.className = 'comentario-cabecera';
    const quien = document.createElement('strong');
    quien.textContent = c.nombre || 'Viajero anónimo';
    const estrellas = document.createElement('span');
    estrellas.className = 'estrellas-promedio';
    estrellas.textContent = estrellasTexto(c.estrellas);
    estrellas.setAttribute('aria-label', `${c.estrellas} de 5`);
    cabecera.append(quien, estrellas);
    const texto = document.createElement('p');
    texto.textContent = c.comentario; // textContent: el comentario nunca se interpreta como HTML
    const pie = document.createElement('small');
    pie.textContent = `${c.servicio} · ${formatearFecha(c.fecha)}`;
    li.append(cabecera, texto, pie);
    return li;
  }));
}

formCal.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(formCal));
  const error = $('cal-error');
  error.textContent = '';
  const estrellas = Number(datos.estrellas);
  if (!(estrellas >= 1 && estrellas <= 5)) return void (error.textContent = 'Elige de 1 a 5 estrellas.');

  // Una calificación por servicio y por día desde este navegador
  const hoyClave = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const enviadas = leer('qorikancha.calificaciones', {});
  if (enviadas[datos.servicio] === hoyClave) return void (error.textContent = 'Ya calificaste este servicio hoy. ¡Gracias!');

  const comentario = datos.comentario.trim().slice(0, 300) || null;
  const nombre = datos.nombre.trim().slice(0, 40) || null;
  const boton = formCal.querySelector('button[type="submit"]');
  try {
    await conCarga(boton, () => sql`
      INSERT INTO calificaciones (servicio, estrellas, comentario, nombre)
      VALUES (${datos.servicio}, ${estrellas}, ${comentario}, ${nombre});
    `);
    enviadas[datos.servicio] = hoyClave;
    guardar('qorikancha.calificaciones', enviadas);
    avisar('¡Gracias por tu calificación!');
    formCal.reset();
    cargarCalificaciones();
  } catch (err) {
    console.error(err);
    error.textContent = err.code === '42P01'
      ? 'Las calificaciones aún no están activadas (falta ejecutar database/fase-4.sql).'
      : 'No se pudo enviar. Intenta de nuevo.';
  }
});

/* ============================== Arranque ============================== */
totalVip();
cargarCalificaciones();
