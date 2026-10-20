// js/vuelos/datos-vuelos.js
// Vuelos SIMULADOS del aeropuerto (caso académico). No usan la base de datos:
// el itinerario se repite cada día y el estado de cada vuelo se calcula con la hora de Perú,
// así el tablero siempre se ve "en vivo". Funciones PURAS: se pueden probar en la consola.

export const AEROLINEAS = {
  LA: {
    nombre: 'LATAM Airlines', corto: 'LATAM', color: '#e3004f',
    mostrador: 'Counters 1 a 6 · Nivel 1', telefono: '(01) 213-8200', web: 'https://www.latamairlines.com/pe/es',
    descripcion: 'La aerolínea con más frecuencias diarias entre Cusco y Lima, además de vuelos a Arequipa, Juliaca y Puerto Maldonado.',
  },
  H2: {
    nombre: 'Sky Airline', corto: 'Sky', color: '#5c2d91',
    mostrador: 'Counters 7 y 8 · Nivel 1', telefono: '(01) 595-1110', web: 'https://www.skyairline.com/peru',
    descripcion: 'Aerolínea de bajo costo con vuelos a Lima y conexiones a Santiago de Chile.',
  },
  JA: {
    nombre: 'JetSMART', corto: 'JetSMART', color: '#1e3a8a',
    mostrador: 'Counters 9 y 10 · Nivel 1', telefono: '(01) 311-0005', web: 'https://jetsmart.com/pe/es',
    descripcion: 'Aerolínea de bajo costo con rutas a Lima, Arequipa y Puerto Maldonado.',
  },
  AV: {
    nombre: 'Avianca', corto: 'Avianca', color: '#da291c',
    mostrador: 'Counter 11 · Nivel 1', telefono: '(01) 511-8222', web: 'https://www.avianca.com/pe/es',
    descripcion: 'Conecta Cusco con Lima y Bogotá, con conexiones a toda América.',
  },
  '2I': {
    nombre: 'Star Perú', corto: 'Star Perú', color: '#0a6ebd',
    mostrador: 'Counter 12 · Nivel 1', telefono: '(01) 705-9000', web: 'https://www.starperu.com',
    descripcion: 'Aerolínea peruana con vuelos a Lima y Puerto Maldonado.',
  },
  OB: {
    nombre: 'Boliviana de Aviación', corto: 'BoA', color: '#00843d',
    mostrador: 'Counter 13 · Nivel 1', telefono: '(01) 422-6070', web: 'https://www.boa.bo',
    descripcion: 'Único vuelo internacional directo a La Paz, Bolivia.',
  },
};

export const CIUDADES = {
  LIM: 'Lima', AQP: 'Arequipa', JUL: 'Juliaca', PEM: 'Puerto Maldonado',
  LPB: 'La Paz', BOG: 'Bogotá', SCL: 'Santiago',
};

// Itinerario diario: [aerolínea, número, tipo, ciudad (código), hora programada]
const ITINERARIO = [
  ['LA', '2021', 'salida', 'LIM', '05:40'], ['LA', '2010', 'llegada', 'LIM', '06:15'],
  ['H2', '5101', 'salida', 'LIM', '06:30'], ['JA', '7330', 'llegada', 'AQP', '07:05'],
  ['LA', '2025', 'salida', 'LIM', '07:20'], ['AV', '808', 'llegada', 'LIM', '07:50'],
  ['JA', '7331', 'salida', 'AQP', '08:10'], ['LA', '2333', 'salida', 'JUL', '08:45'],
  ['2I', '1150', 'llegada', 'PEM', '09:00'], ['AV', '809', 'salida', 'LIM', '09:25'],
  ['LA', '2014', 'llegada', 'LIM', '09:55'], ['OB', '651', 'llegada', 'LPB', '10:20'],
  ['H2', '5103', 'salida', 'LIM', '10:40'], ['2I', '1151', 'salida', 'PEM', '11:05'],
  ['LA', '2029', 'salida', 'LIM', '11:30'], ['JA', '7212', 'llegada', 'LIM', '12:00'],
  ['OB', '652', 'salida', 'LPB', '12:25'], ['LA', '2018', 'llegada', 'AQP', '12:50'],
  ['AV', '9441', 'llegada', 'BOG', '13:15'], ['JA', '7213', 'salida', 'LIM', '13:40'],
  ['LA', '2033', 'salida', 'AQP', '14:05'], ['H2', '5104', 'llegada', 'LIM', '14:30'],
  ['AV', '9442', 'salida', 'BOG', '15:00'], ['LA', '2022', 'llegada', 'LIM', '15:25'],
  ['H2', '5240', 'salida', 'SCL', '15:50'], ['JA', '7340', 'salida', 'PEM', '16:15'],
  ['LA', '2037', 'salida', 'LIM', '16:45'], ['2I', '1160', 'llegada', 'LIM', '17:10'],
  ['LA', '2026', 'llegada', 'LIM', '17:40'], ['2I', '1161', 'salida', 'LIM', '18:05'],
  ['H2', '5241', 'llegada', 'SCL', '18:30'], ['LA', '2041', 'salida', 'LIM', '19:00'],
];

const PUERTAS = { salida: ['1', '2', '3', '4', '5', '6'], llegada: ['A', 'B', 'C'] };
const NOMBRES_TIPO = { salida: 'Salida', llegada: 'Llegada' };

// ---------- Hora de Perú ----------
export function ahoraEnLima(fecha = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(fecha).map((p) => [p.type, p.value]),
  );
  const horas = Number(partes.hour) % 24;
  return {
    dia: `${partes.year}-${partes.month}-${partes.day}`,
    minutos: horas * 60 + Number(partes.minute),
    segundos: horas * 3600 + Number(partes.minute) * 60 + Number(partes.second),
  };
}

export const aMinutos = (hora) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

export const aHora = (minutos) => {
  const m = ((minutos % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// Número "aleatorio" que siempre es el mismo para el mismo vuelo en el mismo día (0 a 1)
function azar(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

// ---------- Estado de cada vuelo ----------
// Devuelve { clave, texto } según cuánto falta para la hora estimada
function calcularEstado(tipo, cancelado, demora, faltan) {
  if (cancelado) return { clave: 'cancelado', texto: 'Cancelado' };
  if (tipo === 'salida') {
    if (faltan < -15) return { clave: 'despego', texto: 'Despegó' };
    if (faltan <= 10) return { clave: 'cerrado', texto: 'Puerta cerrada' };
    if (faltan <= 40) return { clave: 'embarcando', texto: 'Embarcando' };
    if (demora > 0) return { clave: 'demorado', texto: `Demorado ${demora} min` };
    if (faltan <= 120) return { clave: 'a-tiempo', texto: 'A tiempo' };
    return { clave: 'programado', texto: 'Programado' };
  }
  if (faltan <= 0) return { clave: 'aterrizo', texto: 'Aterrizó' };
  if (faltan <= 20) return { clave: 'aproximacion', texto: 'En aproximación' };
  if (demora > 0) return { clave: 'demorado', texto: `Demorado ${demora} min` };
  if (faltan <= 120) return { clave: 'a-tiempo', texto: 'A tiempo' };
  return { clave: 'programado', texto: 'Programado' };
}

function diaSiguiente(dia) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function construirVuelo([aerolinea, numero, tipo, ciudad, hora], dia, desfase, ahora) {
  const codigo = `${aerolinea} ${numero}`;
  const semilla = `${dia}|${codigo}`;
  const r = azar(semilla);

  // Algunos vuelos se demoran, muy pocos se cancelan y algunos cambian de puerta
  const cancelado = r > 0.965;
  const demora = !cancelado && r > 0.78 ? 15 + Math.round(azar(semilla + 'd') * 9) * 5 : 0;
  const puertas = PUERTAS[tipo];
  const puertaOriginal = puertas[Math.floor(azar(semilla + 'p') * puertas.length)];
  const cambiaPuerta = tipo === 'salida' && azar(semilla + 'c') > 0.8;
  const puertaNueva = cambiaPuerta
    ? puertas[(puertas.indexOf(puertaOriginal) + 1 + Math.floor(azar(semilla + 'n') * (puertas.length - 1))) % puertas.length]
    : puertaOriginal;

  const programada = aMinutos(hora) + desfase;
  const estimada = programada + demora;
  const faltan = estimada - ahora;
  // El cambio de puerta se anuncia 90 minutos antes de la salida
  const puerta = cambiaPuerta && faltan <= 90 ? puertaNueva : puertaOriginal;

  return {
    id: `${dia}|${codigo}`,
    codigo,
    aerolinea,
    nombreAerolinea: AEROLINEAS[aerolinea].corto,
    tipo,
    nombreTipo: NOMBRES_TIPO[tipo],
    ciudad: CIUDADES[ciudad],
    codigoCiudad: ciudad,
    dia,
    manana: desfase > 0,
    hora,
    horaEstimada: aHora(estimada),
    minutosEstimados: estimada,
    faltanMinutos: faltan,
    puerta,
    puertaCambiada: puerta !== puertaOriginal,
    estado: calcularEstado(tipo, cancelado, demora, faltan),
  };
}

// Vuelos de las próximas 24 horas con su estado actual: los que pasaron hace más de 1 hora
// se reemplazan por el mismo vuelo de mañana. "momento" sirve para probar otras horas
export function obtenerVuelos(momento = ahoraEnLima()) {
  const manana = diaSiguiente(momento.dia);
  return ITINERARIO
    .map((fila) => {
      const hoy = construirVuelo(fila, momento.dia, 0, momento.minutos);
      return hoy.faltanMinutos < -60 ? construirVuelo(fila, manana, 1440, momento.minutos) : hoy;
    })
    .sort((a, b) => a.minutosEstimados - b.minutosEstimados);
}

// Búsqueda sin importar mayúsculas, tildes ni espacios: "la2021", "cuzco", "bogota"
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function filtrarVuelos(vuelos, { texto = '', aerolinea = '', tipo = '' } = {}) {
  const buscado = normalizar(texto);
  return vuelos.filter((v) =>
    (!tipo || v.tipo === tipo)
    && (!aerolinea || v.aerolinea === aerolinea)
    && (!buscado || [v.codigo, v.nombreAerolinea, AEROLINEAS[v.aerolinea].nombre, v.ciudad, v.codigoCiudad]
      .some((campo) => normalizar(campo).includes(buscado))));
}

// Destinos que atiende cada aerolínea (para la página de aerolíneas)
export function destinosDe(codigoAerolinea) {
  const ciudades = new Set(ITINERARIO.filter((f) => f[0] === codigoAerolinea).map((f) => CIUDADES[f[3]]));
  return [...ciudades];
}

export function vuelosDiariosDe(codigoAerolinea) {
  return ITINERARIO.filter((f) => f[0] === codigoAerolinea).length;
}
