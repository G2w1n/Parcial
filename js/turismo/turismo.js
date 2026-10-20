// js/turismo/turismo.js
// Clima en vivo (Open-Meteo), barras de altitud, tours con filtro y conversor de monedas
import { t, idiomaActual } from '../config/idioma.js';

const $ = (id) => document.getElementById(id);
const LOCALES = { es: 'es-PE', en: 'en-US', qu: 'es-PE' };
const locale = () => LOCALES[idiomaActual()] ?? 'es-PE';

/* ============================== Clima ============================== */
// Aeropuerto de Cusco
const URL_CLIMA = 'https://api.open-meteo.com/v1/forecast?latitude=-13.5357&longitude=-71.9388'
  + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day'
  + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max'
  + '&timezone=America%2FLima&forecast_days=4';

// Códigos WMO que usa Open-Meteo
function describirClima(codigo, esDeDia = true) {
  if (codigo === 0) return { icono: esDeDia ? '☀️' : '🌙', texto: 'Despejado' };
  if (codigo <= 2) return { icono: esDeDia ? '🌤️' : '☁️', texto: 'Parcialmente nublado' };
  if (codigo === 3) return { icono: '☁️', texto: 'Nublado' };
  if (codigo <= 48) return { icono: '🌫️', texto: 'Neblina' };
  if (codigo <= 57) return { icono: '🌦️', texto: 'Llovizna' };
  if (codigo <= 67) return { icono: '🌧️', texto: 'Lluvia' };
  if (codigo <= 77) return { icono: '🌨️', texto: 'Nieve o granizo' };
  if (codigo <= 82) return { icono: '🌦️', texto: 'Chubascos' };
  return { icono: '⛈️', texto: 'Tormenta' };
}

function consejoUV(uv) {
  if (uv >= 11) return 'UV extremo: usa bloqueador, lentes y sombrero.';
  if (uv >= 8) return 'UV muy alto: el sol de la altura quema rápido, usa bloqueador.';
  if (uv >= 6) return 'UV alto: usa bloqueador y sombrero.';
  return 'UV moderado.';
}

let datosClima = null;

function crear(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function pintarClima() {
  const actual = $('clima-actual');
  const dias = $('clima-dias');
  if (!datosClima) return;

  if (datosClima.error) {
    actual.replaceChildren(crear('p', 'clima-error', t('No pudimos consultar el clima en este momento. En Cusco los días suelen ser soleados (18 a 21 °C) y las noches frías (2 a 8 °C).')));
    dias.replaceChildren();
    return;
  }

  const c = datosClima.current;
  const d = datosClima.daily;
  const desc = describirClima(c.weather_code, c.is_day === 1);

  const principal = crear('div', 'clima-principal');
  principal.append(
    crear('span', 'clima-icono', desc.icono),
    crear('span', 'clima-temp', `${Math.round(c.temperature_2m)}°`),
  );
  const detalle = crear('div', 'clima-detalle');
  detalle.append(
    crear('strong', '', t(desc.texto)),
    crear('span', '', `${t('Sensación')} ${Math.round(c.apparent_temperature)}° · ${t('Humedad')} ${c.relative_humidity_2m}% · ${t('Viento')} ${Math.round(c.wind_speed_10m)} km/h`),
    crear('span', 'clima-uv', t(consejoUV(d.uv_index_max[0]))),
  );
  actual.replaceChildren(principal, detalle);

  dias.replaceChildren(...d.time.map((fecha, i) => {
    const li = crear('li', '');
    const nombre = i === 0
      ? t('Hoy')
      : new Date(`${fecha}T12:00:00Z`).toLocaleDateString(locale(), { weekday: 'short', timeZone: 'UTC' });
    const dia = describirClima(d.weather_code[i]);
    li.append(
      crear('span', 'dia-nombre', nombre),
      crear('span', 'dia-icono', dia.icono),
      crear('span', 'dia-temp', `${Math.round(d.temperature_2m_max[i])}° / ${Math.round(d.temperature_2m_min[i])}°`),
      crear('span', 'dia-lluvia', `💧 ${d.precipitation_probability_max[i] ?? 0}%`),
    );
    li.setAttribute('aria-label', `${nombre}: ${t(dia.texto)}, ${t('máxima')} ${Math.round(d.temperature_2m_max[i])}°, ${t('mínima')} ${Math.round(d.temperature_2m_min[i])}°`);
    return li;
  }));
}

async function cargarClima() {
  try {
    const respuesta = await fetch(URL_CLIMA);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    datosClima = await respuesta.json();
  } catch (error) {
    console.error(error);
    datosClima = { error: true };
  }
  pintarClima();
}

/* ============================== Altitud ============================== */
const ALTITUDES = [
  { lugar: 'Lima (nivel del mar)', metros: 154 },
  { lugar: 'Machu Picchu', metros: 2430 },
  { lugar: 'Valle Sagrado', metros: 2870 },
  { lugar: 'Cusco', metros: 3399 },
  { lugar: 'Laguna Humantay', metros: 4200 },
  { lugar: 'Montaña de Colores', metros: 5036 },
];

function pintarAltitudes() {
  const max = Math.max(...ALTITUDES.map((a) => a.metros));
  $('barras-altitud').replaceChildren(...ALTITUDES.map((a) => {
    const fila = crear('div', `barra-altitud${a.lugar === 'Cusco' ? ' actual' : ''}`);
    const barra = crear('span', 'barra');
    barra.style.setProperty('--ancho', `${(a.metros / max) * 100}%`);
    fila.append(crear('span', 'barra-lugar', t(a.lugar)), barra, crear('span', 'barra-metros', `${a.metros.toLocaleString(locale())} m`));
    return fila;
  }));
}

/* ============================== Tours ============================== */
const TOURS = [
  {
    nombre: 'Centro histórico y Qorikancha', tipo: 'medio', icono: '⛪', altura: 3399, desde: '20 min', duracion: '4 h',
    descripcion: 'Plaza de Armas, la Catedral y el templo inca del Sol (Qorikancha), que da nombre a este aeropuerto.',
    consejo: 'Ideal para el día que llegas: es plano y te ayuda a aclimatarte.',
  },
  {
    nombre: 'Sacsayhuamán y alrededores', tipo: 'medio', icono: '🗿', altura: 3700, desde: '30 min', duracion: '4 h',
    descripcion: 'Fortaleza inca con piedras de más de 100 toneladas, junto a Qenqo, Puca Pucara y Tambomachay.',
    consejo: 'Compra el boleto turístico: incluye estos sitios y otros 12.',
  },
  {
    nombre: 'Valle Sagrado de los Incas', tipo: 'completo', icono: '🌄', altura: 2870, desde: '1 h 30 min', duracion: '1 día',
    descripcion: 'Pisac, el mercado artesanal, Ollantaytambo y las salineras de Maras y Moray.',
    consejo: 'Al estar más bajo que Cusco, es ideal para los primeros días.',
  },
  {
    nombre: 'Machu Picchu', tipo: 'completo', icono: '🏔️', altura: 2430, desde: '3 h 30 min (tren)', duracion: '1 o 2 días',
    descripcion: 'La ciudadela inca, una de las 7 maravillas del mundo moderno. Se llega en tren hasta Aguas Calientes y luego en bus.',
    consejo: 'Reserva las entradas y el tren con semanas de anticipación: los cupos son limitados.',
  },
  {
    nombre: 'Laguna Humantay', tipo: 'aventura', icono: '🏞️', altura: 4200, desde: '3 h', duracion: '1 día',
    descripcion: 'Laguna turquesa al pie del nevado Salkantay, con una caminata de subida de unas 2 horas.',
    consejo: 'Hazla después de 2 días de aclimatación. Lleva abrigo y agua.',
  },
  {
    nombre: 'Montaña de Colores (Vinicunca)', tipo: 'aventura', icono: '🌈', altura: 5036, desde: '3 h 30 min', duracion: '1 día',
    descripcion: 'Montaña con franjas de colores formadas por minerales. Caminata exigente por la altura.',
    consejo: 'Sal muy temprano (4 a. m.) y no la hagas si tienes síntomas de soroche.',
  },
];

let filtroTours = '';
const NOMBRES_TIPO = { medio: 'Medio día', completo: 'Día completo', aventura: 'Aventura' };

function pintarTours() {
  const visibles = TOURS.filter((x) => !filtroTours || x.tipo === filtroTours);
  $('lista-tours').replaceChildren(...visibles.map((x) => {
    const tarjeta = crear('article', `tour tour-${x.tipo}`);
    const cabecera = crear('div', 'tour-cabecera');
    cabecera.append(crear('span', 'tour-icono', x.icono), crear('span', 'tour-tipo', t(NOMBRES_TIPO[x.tipo])));
    const datos = crear('dl', 'tour-datos');
    [['Desde el aeropuerto', t(x.desde)], ['Duración', t(x.duracion)], ['Altura', `${x.altura.toLocaleString(locale())} m`]].forEach(([n, v]) => {
      const div = crear('div', '');
      div.append(crear('dt', '', t(n)), crear('dd', '', v));
      datos.append(div);
    });
    const consejo = crear('p', 'tour-consejo');
    consejo.append(crear('strong', '', `${t('Consejo')}: `), document.createTextNode(t(x.consejo)));
    tarjeta.append(cabecera, crear('h3', '', t(x.nombre)), crear('p', 'tour-desc', t(x.descripcion)), datos, consejo);
    cabecera.querySelector('.tour-icono').setAttribute('aria-hidden', 'true');
    return tarjeta;
  }));
}

document.querySelectorAll('#tours .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    filtroTours = chip.dataset.filtro;
    document.querySelectorAll('#tours .chip').forEach((c) => {
      const activo = c === chip;
      c.classList.toggle('activo', activo);
      c.setAttribute('aria-pressed', String(activo));
    });
    pintarTours();
  });
});

/* ============================== Monedas ============================== */
const MONEDAS = {
  PEN: 'Sol peruano', USD: 'Dólar estadounidense', EUR: 'Euro', GBP: 'Libra esterlina', BRL: 'Real brasileño',
  CLP: 'Peso chileno', COP: 'Peso colombiano', BOB: 'Boliviano', MXN: 'Peso mexicano', JPY: 'Yen japonés',
};
// Tasas REFERENCIALES por 1 sol, por si no hay conexión con el servicio de tasas
const TASAS_RESPALDO = { PEN: 1, USD: 0.27, EUR: 0.25, GBP: 0.21, BRL: 1.47, CLP: 251, COP: 1080, BOB: 1.87, MXN: 5.0, JPY: 40.5 };
const URL_TASAS = 'https://open.er-api.com/v6/latest/PEN';

let tasas = TASAS_RESPALDO;
let fuenteTasas = null; // null = respaldo; si no, fecha de actualización

const formMonedas = $('form-monedas');
const selDesde = $('cm-desde');
const selHacia = $('cm-hacia');

function llenarMonedas() {
  const desde = selDesde.value || 'USD';
  const hacia = selHacia.value || 'PEN';
  const opciones = () => Object.entries(MONEDAS).map(([codigo, nombre]) => {
    const op = document.createElement('option');
    op.value = codigo;
    op.textContent = `${codigo} · ${t(nombre)}`;
    return op;
  });
  selDesde.replaceChildren(...opciones());
  selHacia.replaceChildren(...opciones());
  selDesde.value = desde;
  selHacia.value = hacia;
}

function convertir() {
  const monto = Number($('cm-monto').value) || 0;
  const desde = selDesde.value;
  const hacia = selHacia.value;
  const tasa = tasas[hacia] / tasas[desde];
  const fmt = (valor, moneda) => new Intl.NumberFormat(locale(), {
    style: 'currency', currency: moneda, maximumFractionDigits: valor >= 1000 || moneda === 'JPY' || moneda === 'CLP' || moneda === 'COP' ? 0 : 2,
  }).format(valor);

  $('cm-resultado').textContent = `${fmt(monto, desde)} = ${fmt(monto * tasa, hacia)}`;
  $('cm-tasa').textContent = `1 ${desde} = ${tasa.toLocaleString(locale(), { maximumFractionDigits: 4 })} ${hacia}`;
  $('cm-fuente').textContent = fuenteTasas
    ? `${t('Tasa de mercado actualizada el')} ${fuenteTasas}. ${t('Las casas de cambio pueden variar un poco.')}`
    : t('Tasas referenciales (sin conexión al servicio de tasas). Consulta la tasa del día en la casa de cambio.');
}

async function cargarTasas() {
  try {
    const respuesta = await fetch(URL_TASAS);
    const datos = await respuesta.json();
    if (datos.result !== 'success') throw new Error('Servicio de tasas no disponible');
    tasas = Object.fromEntries(Object.keys(MONEDAS).map((m) => [m, datos.rates[m] ?? TASAS_RESPALDO[m]]));
    fuenteTasas = new Date(datos.time_last_update_unix * 1000).toLocaleDateString(locale(), { dateStyle: 'medium' });
  } catch (error) {
    console.error(error);
  }
  convertir();
}

formMonedas.addEventListener('input', convertir);
formMonedas.addEventListener('submit', (e) => e.preventDefault());
$('cm-invertir').addEventListener('click', () => {
  [selDesde.value, selHacia.value] = [selHacia.value, selDesde.value];
  convertir();
});

/* ============================== Arranque ============================== */
function pintarTodo() {
  pintarClima();
  pintarAltitudes();
  pintarTours();
  llenarMonedas();
  convertir();
}

pintarTodo();
cargarClima();
cargarTasas();
document.addEventListener('cambio-idioma', pintarTodo);
