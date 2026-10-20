// js/estacionamiento/estacionamiento.js
// Mapa de espacios libres/ocupados, tarifas y calculadora de costo (página pública)
import { sql } from '../config/neon-config.js';
import {
  desglosarMonto, formatearSoles, TARIFA_POR_HORA, TARIFA_DIA_COMPLETO, TARIFA_NOCTURNA, HORAS_NOCTURNA,
  DESCUENTO_FIN_DE_SEMANA, RECARGO_BUS_CAMION, ADICIONAL_ZONA_VIP,
} from '../registro/tarifario.js';
import { ahoraEnLima } from '../vuelos/datos-vuelos.js';
import { cargarConfiguracion } from '../config/configuracion.js';
import { espaciosOcupados as espaciosConVehiculo, codigoEspacio } from './espacios.js';

const $ = (id) => document.getElementById(id);

const ZONAS = [
  { clave: 'normal', nombre: 'Zona general', prefijo: 'A', espacios: 60 },
  { clave: 'vip', nombre: 'Zona techada VIP', prefijo: 'V', espacios: 20 },
  { clave: 'bus', nombre: 'Buses y camiones', prefijo: 'B', espacios: 8 },
];

// Reservas en línea activas en este momento, por zona (hora de Perú)
async function reservasActivas() {
  const filas = await sql`
    SELECT CASE WHEN tipo_vehiculo = 'bus_camion' THEN 'bus' WHEN zona_vip THEN 'vip' ELSE 'normal' END AS zona,
           COUNT(*)::int AS total
    FROM reservas_estacionamiento
    WHERE estado <> 'cancelado'
      AND fecha_hora_entrada <= (NOW() AT TIME ZONE 'America/Lima')
      AND fecha_hora_entrada + horas * INTERVAL '1 hour' > (NOW() AT TIME ZONE 'America/Lima')
    GROUP BY 1;
  `;
  return Object.fromEntries(filas.map((f) => [f.zona, f.total]));
}

function azar(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

// Vehículos que llegan sin reserva (SIMULADO): más llenos a media mañana y al final de la tarde
function ocupacionSimulada(zona, momento) {
  const hora = Math.floor(momento.minutos / 60);
  const curva = Math.max(Math.exp(-((hora - 11) ** 2) / 8), Math.exp(-((hora - 18) ** 2) / 6));
  const ruido = azar(`${momento.dia}|${hora}|${zona.clave}`) * 0.12;
  const base = zona.clave === 'vip' ? 0.2 : zona.clave === 'bus' ? 0.15 : 0.3;
  return Math.round(zona.espacios * Math.min(0.92, base + 0.5 * curva + ruido));
}

// Qué espacios aparecen ocupados: siempre los mismos durante la misma hora
// Primero los espacios donde el personal registró un vehículo (reales) y el resto, simulados
function espaciosOcupados(zona, cantidad, momento, asignados = new Set()) {
  const hora = Math.floor(momento.minutos / 60);
  const reales = Array.from({ length: zona.espacios }, (_, i) => i).filter((i) => asignados.has(codigoEspacio(zona.clave, i)));
  const resto = Array.from({ length: zona.espacios }, (_, i) => i)
    .filter((i) => !reales.includes(i))
    .sort((a, b) => azar(`${momento.dia}|${hora}|${zona.clave}|${a}`) - azar(`${momento.dia}|${hora}|${zona.clave}|${b}`));
  return new Set([...reales, ...resto].slice(0, Math.max(cantidad, reales.length)));
}

function crear(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

async function pintarMapa() {
  const momento = ahoraEnLima();
  let reales = {};
  try {
    reales = await reservasActivas();
    $('aviso-mapa').hidden = true;
  } catch (error) {
    console.error(error);
    $('aviso-mapa').hidden = false;
    $('aviso-mapa').textContent = 'No se pudieron leer las reservas en línea: el mapa muestra solo la ocupación simulada.';
  }

  const asignados = await espaciosConVehiculo();
  const contadores = [];
  const bloques = ZONAS.filter((zona) => zona.espacios > 0).map((zona) => {
    const marcados = espaciosOcupados(zona, Math.min(zona.espacios, ocupacionSimulada(zona, momento) + (reales[zona.clave] ?? 0)), momento, asignados);
    const ocupados = marcados.size;
    const libres = zona.espacios - ocupados;

    const contador = crear('div', `contador${libres <= zona.espacios * 0.1 ? ' casi-lleno' : ''}`);
    const barra = crear('span', 'contador-barra');
    barra.style.setProperty('--lleno', `${(ocupados / zona.espacios) * 100}%`);
    contador.append(crear('strong', '', String(libres)), crear('span', '', zona.nombre), barra);
    contadores.push(contador);

    const bloque = crear('div', `zona zona-${zona.clave}`);
    const titulo = crear('h3', '');
    titulo.append(document.createTextNode(zona.nombre), crear('span', 'zona-libres', `${libres} libres de ${zona.espacios}`));
    const grilla = crear('div', 'espacios');
    grilla.setAttribute('role', 'img');
    grilla.setAttribute('aria-label', `${zona.nombre}: ${libres} espacios libres y ${ocupados} ocupados`);
    for (let i = 0; i < zona.espacios; i++) {
      const espacio = crear('span', `espacio${marcados.has(i) ? ' ocupado' : ''}`, `${zona.prefijo}${String(i + 1).padStart(2, '0')}`);
      espacio.setAttribute('aria-hidden', 'true');
      grilla.append(espacio);
    }
    bloque.append(titulo, grilla);
    return bloque;
  });

  $('contadores').replaceChildren(...contadores);
  $('mapa').replaceChildren(...bloques);
  const dos = (n) => String(n).padStart(2, '0');
  $('hora-actualizacion').textContent = `${dos(Math.floor(momento.minutos / 60))}:${dos(momento.minutos % 60)}`;
}

function pintarTarifas() {
  const tarjetas = [
    { titulo: 'Por hora', precio: `${formatearSoles(TARIFA_POR_HORA)}`, detalle: 'Por hora o fracción. Nunca pagas más que el tope diario.' },
    { titulo: 'Tope diario', precio: formatearSoles(TARIFA_DIA_COMPLETO), detalle: `Desde 9 horas pagas como máximo ${formatearSoles(TARIFA_DIA_COMPLETO)} por cada 24 horas.` },
    { titulo: 'Nocturna', precio: formatearSoles(TARIFA_NOCTURNA), detalle: `Entrando entre las 22:00 y las 05:59, hasta ${HORAS_NOCTURNA} horas.` },
    { titulo: 'Fin de semana', precio: `-${Math.round(DESCUENTO_FIN_DE_SEMANA * 100)} %`, detalle: 'Si entras sábado o domingo.' },
    { titulo: 'Bus o camión', precio: `+${Math.round(RECARGO_BUS_CAMION * 100)} %`, detalle: 'Recargo sobre la tarifa por el tamaño del vehículo.' },
    { titulo: 'Zona techada VIP', precio: `+${formatearSoles(ADICIONAL_ZONA_VIP)}`, detalle: 'Monto fijo por reserva. Protegida del sol y la lluvia.' },
  ];
  $('tarifas').replaceChildren(...tarjetas.map((t) => {
    const art = crear('article', 'tarifa');
    art.append(crear('h3', '', t.titulo), crear('p', 'tarifa-precio', t.precio), crear('p', 'tarifa-detalle', t.detalle));
    return art;
  }));
}

// ---------- Calculadora ----------
const formCalc = $('form-calc');
function calcular() {
  const datos = Object.fromEntries(new FormData(formCalc));
  const { lineas, total } = desglosarMonto(datos);
  $('calc-desglose').replaceChildren(...lineas.map((l) => {
    const li = crear('li', '');
    li.append(crear('span', '', l.etiqueta), crear('span', '', formatearSoles(l.valor)));
    return li;
  }));
  $('calc-total').textContent = formatearSoles(total);
}

function entradaPorDefecto() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:00`;
}

formCalc.addEventListener('input', calcular);
formCalc.addEventListener('change', calcular);
formCalc.addEventListener('submit', (e) => e.preventDefault());

// Tarifas y capacidad que configura el administrador
const config = await cargarConfiguracion();
ZONAS.forEach((zona) => { zona.espacios = Number(config.capacidad[zona.clave]) || 0; });

$('calc-entrada').value = entradaPorDefecto();
pintarTarifas();
calcular();
pintarMapa();
setInterval(() => {
  if (!document.hidden) pintarMapa();
}, 60000);
