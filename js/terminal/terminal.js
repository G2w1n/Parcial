// js/terminal/terminal.js
// Mapa interactivo del terminal (SVG), buscador de lugares y tiempo de espera en seguridad
import { NIVELES, ZONAS, CATEGORIAS, LUGARES } from './lugares.js';
import { cargarCambios } from '../vuelos/cambios.js';
import { obtenerVuelos, ahoraEnLima, aMinutos, normalizar } from '../vuelos/datos-vuelos.js';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const plano = $('plano');
const detalle = $('detalle');
const inputBuscar = $('buscar-lugar');

let nivelActual = 1;
let categoriaActual = '';
let lugarElegido = null;

function svg(etiqueta, atributos = {}, texto) {
  const el = document.createElementNS(SVG, etiqueta);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function coincide(lugar) {
  const buscado = normalizar(inputBuscar.value);
  return (!categoriaActual || lugar.categoria === categoriaActual)
    && (!buscado || normalizar(`${lugar.nombre} ${lugar.descripcion} ${CATEGORIAS[lugar.categoria].nombre}`).includes(buscado));
}

// ---------- Plano ----------
function pintarPlano() {
  const elementos = [];
  ZONAS.filter((z) => z.nivel === nivelActual).forEach((z) => {
    elementos.push(
      svg('rect', { x: z.x, y: z.y, width: z.w, height: z.h, rx: 14, fill: z.color, class: 'zona' }),
      svg('text', { x: z.x + 12, y: z.y + 22, class: 'zona-nombre' }, z.nombre),
    );
  });

  const hayFiltro = Boolean(categoriaActual || inputBuscar.value.trim());
  LUGARES.filter((l) => l.nivel === nivelActual).forEach((l) => {
    const activo = coincide(l);
    const g = svg('g', {
      class: `lugar${activo ? '' : ' apagado'}${hayFiltro && activo ? ' resaltado' : ''}${lugarElegido?.id === l.id ? ' elegido' : ''}`,
      transform: `translate(${l.x} ${l.y})`,
      tabindex: activo ? '0' : '-1',
      role: 'button',
      'aria-label': l.nombre,
      'data-id': l.id,
    });
    g.append(
      svg('circle', { r: 22, class: 'lugar-fondo', stroke: CATEGORIAS[l.categoria].color }),
      svg('text', { class: `lugar-icono${/^\d$/.test(l.icono) ? ' numero' : ''}`, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, l.icono),
    );
    elementos.push(g);
  });
  plano.replaceChildren(...elementos);
  $('nombre-nivel').textContent = NIVELES[nivelActual].nombre;
}

function mostrarDetalle(lugar) {
  lugarElegido = lugar;
  const categoria = CATEGORIAS[lugar.categoria];
  const tarjeta = document.createElement('div');
  tarjeta.className = 'detalle-tarjeta';
  tarjeta.style.setProperty('--color-categoria', categoria.color);

  const icono = document.createElement('span');
  icono.className = 'detalle-icono';
  icono.setAttribute('aria-hidden', 'true');
  icono.textContent = lugar.icono;
  const etiqueta = document.createElement('span');
  etiqueta.className = 'detalle-categoria';
  etiqueta.textContent = `${categoria.nombre} · Nivel ${lugar.nivel}`;
  const titulo = document.createElement('h3');
  titulo.textContent = lugar.nombre;
  const desc = document.createElement('p');
  desc.textContent = lugar.descripcion;
  const horario = document.createElement('p');
  horario.className = 'detalle-horario';
  horario.textContent = `🕒 ${lugar.horario}`;
  tarjeta.append(icono, etiqueta, titulo, desc, horario);

  if (lugar.enlace) {
    const a = document.createElement('a');
    a.href = lugar.enlace;
    a.className = 'detalle-enlace';
    a.textContent = 'Más información →';
    tarjeta.append(a);
  }
  detalle.replaceChildren(tarjeta);
  pintarPlano();
  pintarResultados();
  history.replaceState(null, '', `?lugar=${encodeURIComponent(lugar.id)}`);
}

function elegirNivel(nivel) {
  nivelActual = nivel;
  document.querySelectorAll('.niveles [role="tab"]').forEach((tab) => {
    const activo = Number(tab.dataset.nivel) === nivel;
    tab.setAttribute('aria-selected', String(activo));
    tab.tabIndex = activo ? 0 : -1;
  });
  plano.setAttribute('aria-labelledby', `tab-nivel-${nivel}`);
  pintarPlano();
}

// ---------- Lista de resultados (útil en celular y con lector de pantalla) ----------
function pintarResultados() {
  const lista = $('resultados');
  const hayFiltro = Boolean(categoriaActual || inputBuscar.value.trim());
  if (!hayFiltro) {
    lista.replaceChildren();
    return;
  }
  const encontrados = LUGARES.filter(coincide);
  if (encontrados.length === 0) {
    const li = document.createElement('li');
    li.className = 'sin-resultados';
    li.textContent = 'No encontramos ese lugar. Pregunta en el módulo de información (nivel 1).';
    lista.replaceChildren(li);
    return;
  }
  lista.replaceChildren(...encontrados.map((l) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = l.id;
    b.className = lugarElegido?.id === l.id ? 'elegido' : '';
    b.textContent = `${l.icono}  ${l.nombre} · Nivel ${l.nivel}`;
    li.append(b);
    return li;
  }));
}

function irALugar(id) {
  const lugar = LUGARES.find((l) => l.id === id);
  if (!lugar) return;
  if (lugar.nivel !== nivelActual) elegirNivel(lugar.nivel);
  mostrarDetalle(lugar);
}

// ---------- Tiempo de espera en seguridad ----------
// Depende de cuántos vuelos salen en las próximas 2 horas (SIMULADO con el tablero de vuelos)
function esperaPara(minutoDelDia, vuelos) {
  const salidas = vuelos.filter((v) => v.tipo === 'salida' && v.estado.clave !== 'cancelado');
  const proximas = salidas.filter((v) => {
    const m = aMinutos(v.horaEstimada);
    return m >= minutoDelDia && m <= minutoDelDia + 120;
  }).length;
  return Math.min(40, 4 + proximas * 4);
}

function pintarEspera() {
  const vuelos = obtenerVuelos();
  const ahora = ahoraEnLima();
  const minutos = esperaPara(ahora.minutos, vuelos);
  $('espera-min').textContent = minutos;
  const nivel = minutos <= 10 ? 'baja' : minutos <= 22 ? 'media' : 'alta';
  document.querySelector('.espera').dataset.nivel = nivel;
  $('espera-texto').textContent = {
    baja: 'Poca gente en el control. Puedes pasar con calma.',
    media: 'Espera moderada. Pasa al menos 1 hora antes de tu vuelo.',
    alta: 'Hora pico: pasa el control lo antes posible.',
  }[nivel];

  const horaActual = Math.floor(ahora.minutos / 60);
  const horas = Array.from({ length: 16 }, (_, i) => i + 4); // 04:00 a 19:00
  const grafico = $('grafico-espera');
  const datos = horas.map((h) => ({ h, min: esperaPara(h * 60, vuelos) }));
  grafico.setAttribute('aria-label', `Espera estimada por hora: ${datos.map((d) => `${d.h}:00, ${d.min} minutos`).join('; ')}`);
  grafico.replaceChildren(...datos.map(({ h, min }) => {
    const col = document.createElement('div');
    col.className = `barra-hora${h === horaActual ? ' actual' : ''}`;
    col.style.setProperty('--alto', `${(min / 40) * 100}%`);
    col.title = `${String(h).padStart(2, '0')}:00 · ${min} min`;
    const barra = document.createElement('span');
    barra.className = 'barra';
    const etiqueta = document.createElement('span');
    etiqueta.className = 'hora';
    etiqueta.textContent = h % 2 === 0 ? String(h) : '';
    col.append(barra, etiqueta);
    return col;
  }));
}

// ---------- Eventos ----------
document.querySelectorAll('.niveles [role="tab"]').forEach((tab) => {
  tab.addEventListener('click', () => elegirNivel(Number(tab.dataset.nivel)));
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const otro = nivelActual === 1 ? 2 : 1;
    elegirNivel(otro);
    $(`tab-nivel-${otro}`).focus();
  });
});

plano.addEventListener('click', (e) => {
  const g = e.target.closest('.lugar');
  if (g) irALugar(g.dataset.id);
});
plano.addEventListener('keydown', (e) => {
  const g = e.target.closest('.lugar');
  if (g && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    irALugar(g.dataset.id);
    plano.querySelector(`[data-id="${g.dataset.id}"]`)?.focus();
  }
});
$('resultados').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-id]');
  if (b) {
    irALugar(b.dataset.id);
    plano.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

inputBuscar.addEventListener('input', () => {
  // Si lo buscado solo está en el otro nivel, se cambia de nivel automáticamente
  const encontrados = LUGARES.filter(coincide);
  if (encontrados.length && !encontrados.some((l) => l.nivel === nivelActual)) elegirNivel(encontrados[0].nivel);
  else pintarPlano();
  pintarResultados();
});

const contCategorias = $('categorias');
const chips = [['', 'Todo'], ...Object.entries(CATEGORIAS).map(([k, c]) => [k, c.nombre])].map(([clave, nombre]) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `chip${clave === '' ? ' activo' : ''}`;
  b.dataset.categoria = clave;
  b.setAttribute('aria-pressed', String(clave === ''));
  if (clave) b.style.setProperty('--color-categoria', CATEGORIAS[clave].color);
  b.textContent = nombre;
  return b;
});
contCategorias.replaceChildren(...chips);
contCategorias.addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  categoriaActual = b.dataset.categoria;
  chips.forEach((c) => {
    const activo = c === b;
    c.classList.toggle('activo', activo);
    c.setAttribute('aria-pressed', String(activo));
  });
  pintarPlano();
  pintarResultados();
});

// ---------- Arranque ----------
elegirNivel(1);
pintarEspera();
cargarCambios().then(pintarEspera);
setInterval(pintarEspera, 60000);
const lugarUrl = new URLSearchParams(location.search).get('lugar');
if (lugarUrl) irALugar(lugarUrl);
