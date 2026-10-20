// js/vuelos/tablero.js
// Tablero de llegadas y salidas, buscador y "Mis vuelos" (seguimiento con cuenta regresiva y avisos)
import { AEROLINEAS, obtenerVuelos, filtrarVuelos, ahoraEnLima } from './datos-vuelos.js';
import { avisar, sinAnimaciones } from '../config/ui.js';
import { cargarCambios } from './cambios.js';

const $ = (id) => document.getElementById(id);
const cuerpo = $('cuerpo-tablero');
const inputBuscar = $('buscar-vuelo');
const selectAerolinea = $('filtro-aerolinea');
const vacio = $('tablero-vacio');
const seccionMisVuelos = $('mis-vuelos');
const listaMisVuelos = $('lista-mis-vuelos');

const CLAVE_SEGUIDOS = 'qorikancha.vuelosSeguidos';
const CARACTERES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ANCHOS = { hora: 5, vuelo: 7, ciudad: 16, puerta: 2, estado: 15 };

let tipoActual = 'salida';
let vuelos = obtenerVuelos();

// ---------- Vuelos seguidos (se guardan solo en este navegador) ----------
function leerSeguidos() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_SEGUIDOS)) ?? {};
  } catch {
    return {};
  }
}

function guardarSeguidos(seguidos) {
  try {
    localStorage.setItem(CLAVE_SEGUIDOS, JSON.stringify(seguidos));
  } catch {
    // Navegación privada o almacenamiento bloqueado: el seguimiento dura solo esta visita
  }
}

let seguidos = leerSeguidos();

const fotoDe = (v) => ({ estado: v.estado.clave, texto: v.estado.texto, puerta: v.puerta, hora: v.horaEstimada });

function alternarSeguimiento(id) {
  const vuelo = vuelos.find((v) => v.id === id);
  if (!vuelo) return;
  if (seguidos[id]) {
    delete seguidos[id];
    avisar(`Dejaste de seguir el vuelo ${vuelo.codigo}.`);
  } else {
    seguidos[id] = fotoDe(vuelo);
    avisar(`Siguiendo ${vuelo.codigo}. Te avisaremos si cambia su estado o su puerta.`);
  }
  guardarSeguidos(seguidos);
  pintarTablero();
  pintarMisVuelos();
}

// Compara lo último que vio el pasajero con el estado actual y avisa los cambios
function revisarCambios() {
  const cambiados = new Set();
  for (const v of vuelos) {
    const antes = seguidos[v.id];
    if (!antes) continue;
    const mensajes = [];
    if (antes.puerta !== v.puerta) mensajes.push(`cambió a la puerta ${v.puerta}`);
    if (antes.estado !== v.estado.clave) mensajes.push(`ahora está "${v.estado.texto}"`);
    else if (antes.hora !== v.horaEstimada) mensajes.push(`nueva hora estimada ${v.horaEstimada}`);
    if (mensajes.length) {
      avisar(`Vuelo ${v.codigo}: ${mensajes.join(' y ')}.`, v.estado.clave === 'cancelado' ? 'error' : 'exito');
      seguidos[v.id] = fotoDe(v);
      cambiados.add(v.id);
    }
  }
  // Los vuelos que ya salieron del tablero se dejan de seguir
  for (const id of Object.keys(seguidos)) {
    if (!vuelos.some((v) => v.id === id)) delete seguidos[id];
  }
  guardarSeguidos(seguidos);
  return cambiados;
}

// ---------- Paletas que giran ----------
// Un solo ciclo de animación mueve todas las paletas pendientes (más liviano que un temporizador por letra)
const pendientes = new Map(); // paleta -> { letra, vueltas }
let ultimoPaso = 0;

function pasoPaletas(ahora) {
  if (ahora - ultimoPaso >= 55) {
    ultimoPaso = ahora;
    for (const [paleta, giro] of pendientes) {
      if (giro.vueltas-- > 0) {
        paleta.textContent = CARACTERES[Math.floor(Math.random() * CARACTERES.length)];
        paleta.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.15)' }, { transform: 'scaleY(1)' }], { duration: 70 });
      } else {
        paleta.textContent = giro.letra;
        pendientes.delete(paleta);
      }
    }
  }
  if (pendientes.size) requestAnimationFrame(pasoPaletas);
}

function escribirPaletas(contenedor, texto, ancho) {
  const final = texto.toUpperCase().padEnd(ancho, ' ').slice(0, ancho);
  let paletas = contenedor.querySelectorAll('.paleta');
  if (paletas.length !== ancho) {
    contenedor.replaceChildren();
    for (let i = 0; i < ancho; i++) {
      const p = document.createElement('span');
      p.className = 'paleta';
      p.textContent = ' ';
      contenedor.append(p);
    }
    paletas = contenedor.querySelectorAll('.paleta');
  }

  const estabaQuieto = pendientes.size === 0;
  paletas.forEach((paleta, i) => {
    const letra = final[i];
    const enCurso = pendientes.get(paleta);
    if (enCurso) {
      enCurso.letra = letra; // si ya estaba girando, solo cambia la letra en la que se detendrá
      return;
    }
    if (paleta.textContent === letra) return;
    if (sinAnimaciones) {
      paleta.textContent = letra;
      return;
    }
    // Cada paleta da algunas vueltas con letras al azar antes de quedarse en la correcta
    pendientes.set(paleta, { letra, vueltas: 3 + Math.floor(Math.random() * 6) + Math.floor(i / 3) });
  });
  if (estabaQuieto && pendientes.size) requestAnimationFrame(pasoPaletas);
}

// Celda con texto para lectores de pantalla y paletas solo visuales
function celdaPaletas(tr, clave, texto, extra) {
  const td = document.createElement('td');
  td.dataset.campo = clave;
  const lector = document.createElement('span');
  lector.className = 'visually-hidden';
  const paletas = document.createElement('span');
  paletas.className = 'paletas';
  paletas.setAttribute('aria-hidden', 'true');
  td.append(lector, paletas);
  if (extra) td.append(extra);
  tr.append(td);
  actualizarCelda(td, texto);
  return td;
}

function actualizarCelda(td, texto) {
  td.querySelector('.visually-hidden').textContent = texto;
  escribirPaletas(td.querySelector('.paletas'), texto, ANCHOS[td.dataset.campo]);
}

function etiqueta(clase, texto) {
  const span = document.createElement('span');
  span.className = clase;
  span.textContent = texto;
  return span;
}

function crearFila(v) {
  const tr = document.createElement('tr');
  tr.dataset.id = v.id;
  celdaPaletas(tr, 'hora', v.hora, v.manana ? etiqueta('manana-etiqueta', 'MAÑANA') : null);
  celdaPaletas(tr, 'vuelo', v.codigo);
  celdaPaletas(tr, 'ciudad', v.ciudad);
  celdaPaletas(tr, 'puerta', v.puerta);
  celdaPaletas(tr, 'estado', v.estado.texto);

  const tdSeguir = document.createElement('td');
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn-seguir';
  boton.dataset.id = v.id;
  tdSeguir.append(boton);
  tr.append(tdSeguir);
  return tr;
}

function actualizarFila(tr, v) {
  const celdas = Object.fromEntries([...tr.querySelectorAll('td[data-campo]')].map((td) => [td.dataset.campo, td]));
  actualizarCelda(celdas.hora, v.hora);
  actualizarCelda(celdas.vuelo, v.codigo);
  actualizarCelda(celdas.ciudad, v.ciudad);
  actualizarCelda(celdas.puerta, v.puerta);
  actualizarCelda(celdas.estado, v.estado.texto);

  celdas.hora.querySelector('.manana-etiqueta')?.remove();
  celdas.hora.querySelector('.demora-etiqueta')?.remove();
  if (v.horaEstimada !== v.hora && v.estado.clave !== 'cancelado') celdas.hora.append(etiqueta('demora-etiqueta', `Estimada ${v.horaEstimada}`));
  if (v.manana) celdas.hora.append(etiqueta('manana-etiqueta', 'MAÑANA'));

  celdas.puerta.classList.toggle('puerta-cambiada', v.puertaCambiada);
  celdas.estado.className = `est-${v.estado.clave}`;
  celdas.estado.title = v.nota ?? '';

  const seguido = Boolean(seguidos[v.id]);
  tr.classList.toggle('seguido', seguido);
  const boton = tr.querySelector('.btn-seguir');
  boton.textContent = seguido ? '★' : '☆';
  boton.setAttribute('aria-pressed', String(seguido));
  boton.setAttribute('aria-label', `${seguido ? 'Dejar de seguir' : 'Seguir'} el vuelo ${v.codigo}`);
}

function pintarTablero() {
  const lista = filtrarVuelos(vuelos, { texto: inputBuscar.value, aerolinea: selectAerolinea.value, tipo: tipoActual });
  const filasActuales = new Map([...cuerpo.children].map((tr) => [tr.dataset.id, tr]));

  // Se reutilizan las filas que ya estaban: así solo giran las letras que cambiaron
  const nuevas = lista.map((v) => {
    const tr = filasActuales.get(v.id) ?? crearFila(v);
    actualizarFila(tr, v);
    return tr;
  });
  cuerpo.replaceChildren(...nuevas);
  vacio.hidden = lista.length > 0;
}

// ---------- Mis vuelos ----------
function textoCuenta(segundos) {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const dos = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h} h ${dos(m)} min ${dos(seg)} s` : `${dos(m)} min ${dos(seg)} s`;
}

function segundosRestantes(v) {
  return v.minutosEstimados * 60 - ahoraEnLima().segundos;
}

function dato(lista, nombre, valor) {
  const grupo = document.createElement('div');
  const dt = document.createElement('dt');
  dt.textContent = nombre;
  const dd = document.createElement('dd');
  dd.textContent = valor;
  grupo.append(dt, dd);
  lista.append(grupo);
}

function pintarMisVuelos(cambiados = new Set()) {
  const mios = vuelos.filter((v) => seguidos[v.id]);
  seccionMisVuelos.hidden = mios.length === 0;
  listaMisVuelos.replaceChildren(...mios.map((v) => {
    const tarjeta = document.createElement('article');
    tarjeta.className = 'tarjeta-vuelo';
    tarjeta.dataset.id = v.id;
    tarjeta.style.setProperty('--color-aerolinea', AEROLINEAS[v.aerolinea].color);
    if (cambiados.has(v.id)) tarjeta.classList.add('cambio');

    const cabecera = document.createElement('div');
    cabecera.className = 'tv-cabecera';
    cabecera.append(etiqueta('tv-codigo', v.codigo), etiqueta(`tv-estado est-${v.estado.clave}`, v.estado.texto));

    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.className = 'tv-quitar';
    quitar.dataset.id = v.id;
    quitar.textContent = '×';
    quitar.setAttribute('aria-label', `Dejar de seguir el vuelo ${v.codigo}`);

    const ruta = document.createElement('p');
    ruta.className = 'tv-ruta';
    ruta.textContent = v.tipo === 'salida' ? `Cusco → ${v.ciudad}` : `${v.ciudad} → Cusco`;

    const datos = document.createElement('dl');
    datos.className = 'tv-datos';
    dato(datos, v.tipo === 'salida' ? (v.manana ? 'Sale mañana' : 'Sale') : (v.manana ? 'Llega mañana' : 'Llega'), v.horaEstimada);
    dato(datos, 'Puerta', v.puerta);
    dato(datos, 'Aerolínea', v.nombreAerolinea);

    const cuenta = document.createElement('p');
    cuenta.className = 'tv-cuenta';
    cuenta.dataset.cuenta = v.id;

    tarjeta.append(quitar, cabecera, ruta, datos, cuenta);
    if (v.nota) tarjeta.append(etiqueta('tv-nota', `📢 ${v.nota}`));
    return tarjeta;
  }));
  actualizarCuentas();
}

// La cuenta regresiva se actualiza cada segundo
function actualizarCuentas() {
  listaMisVuelos.querySelectorAll('[data-cuenta]').forEach((p) => {
    const v = vuelos.find((x) => x.id === p.dataset.cuenta);
    if (!v) return;
    const fuerte = document.createElement('strong');
    let texto;
    if (v.estado.clave === 'cancelado') {
      texto = 'Vuelo cancelado: consulta con tu aerolínea.';
    } else if (segundosRestantes(v) <= 0) {
      texto = v.tipo === 'salida' ? 'El vuelo ya despegó.' : 'El vuelo ya aterrizó.';
    } else {
      texto = v.tipo === 'salida' ? 'Despega en' : 'Aterriza en';
      fuerte.textContent = textoCuenta(segundosRestantes(v));
    }
    p.replaceChildren(document.createTextNode(texto));
    if (fuerte.textContent) p.append(fuerte);
  });
}

// ---------- Eventos ----------
function elegirTipo(tipo) {
  tipoActual = tipo;
  document.querySelectorAll('.tablero-pestanas [role="tab"]').forEach((tab) => {
    const activo = tab.dataset.tipo === tipo;
    tab.setAttribute('aria-selected', String(activo));
    tab.tabIndex = activo ? 0 : -1;
  });
  cuerpo.setAttribute('aria-labelledby', `tab-${tipo}`);
  $('th-ciudad').textContent = tipo === 'salida' ? 'Destino' : 'Origen';
  cuerpo.replaceChildren(); // al cambiar de pestaña todas las paletas giran
  pintarTablero();
}

document.querySelectorAll('.tablero-pestanas [role="tab"]').forEach((tab) => {
  tab.addEventListener('click', () => elegirTipo(tab.dataset.tipo));
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const otro = tab.dataset.tipo === 'salida' ? 'llegada' : 'salida';
    elegirTipo(otro);
    $(`tab-${otro}`).focus();
  });
});

$('form-buscar-vuelo').addEventListener('submit', (e) => e.preventDefault());
inputBuscar.addEventListener('input', pintarTablero);
selectAerolinea.addEventListener('change', pintarTablero);

cuerpo.addEventListener('click', (e) => {
  const boton = e.target.closest('.btn-seguir');
  if (boton) alternarSeguimiento(boton.dataset.id);
});
listaMisVuelos.addEventListener('click', (e) => {
  const boton = e.target.closest('.tv-quitar');
  if (boton) alternarSeguimiento(boton.dataset.id);
});

// ---------- Arranque ----------
for (const [codigo, a] of Object.entries(AEROLINEAS)) {
  const opcion = document.createElement('option');
  opcion.value = codigo;
  opcion.textContent = a.nombre;
  selectAerolinea.append(opcion);

  const li = document.createElement('li');
  const enlace = document.createElement('a');
  enlace.href = `aerolineas.html#${encodeURIComponent(codigo)}`;
  const punto = document.createElement('span');
  punto.className = 'punto-aerolinea';
  punto.style.background = a.color;
  enlace.append(punto, document.createTextNode(a.corto));
  li.append(enlace);
  $('chips-aerolineas').append(li);
}

// Enlaces directos: vuelos.html?aerolinea=LA · vuelos.html?vuelo=LA2021 · vuelos.html?tipo=llegada
const parametros = new URLSearchParams(location.search);
if (AEROLINEAS[parametros.get('aerolinea')]) selectAerolinea.value = parametros.get('aerolinea');
if (parametros.get('vuelo')) inputBuscar.value = parametros.get('vuelo');
if (parametros.get('tipo') === 'llegada') tipoActual = 'llegada';

const relojEl = $('reloj');
function actualizarReloj() {
  const s = ahoraEnLima().segundos;
  const dos = (n) => String(n).padStart(2, '0');
  relojEl.textContent = `${dos(Math.floor(s / 3600))}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`;
}

async function refrescar() {
  await cargarCambios();
  vuelos = obtenerVuelos();
  const cambiados = revisarCambios();
  pintarTablero();
  pintarMisVuelos(cambiados);
}

elegirTipo(tipoActual);
revisarCambios();
pintarMisVuelos();
actualizarReloj();
// Los cambios manuales del personal (demoras, cancelaciones, puertas) llegan de la base de datos
refrescar();

setInterval(() => {
  actualizarReloj();
  actualizarCuentas();
}, 1000);
setInterval(() => {
  if (!document.hidden) refrescar();
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refrescar();
});
