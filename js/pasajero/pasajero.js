// js/pasajero/pasajero.js
// Calculadora de equipaje, buscador de objetos permitidos y buscador de preguntas frecuentes
import { AEROLINEAS } from '../vuelos/datos-vuelos.js';
import { TIPOS_EQUIPAJE, REGLAS_EQUIPAJE, revisarEquipaje, OBJETOS, estadoObjeto } from './equipaje.js';
import { normalizar } from '../vuelos/datos-vuelos.js';
import { t } from '../config/idioma.js';

const $ = (id) => document.getElementById(id);

/* ============================== Calculadora de equipaje ============================== */
const form = $('form-equipaje');
const selectAerolinea = $('eq-aerolinea');
const contTipos = $('eq-tipos');
const resultado = $('eq-resultado');
const limites = $('eq-limites');
const dibujo = $('maleta-dibujo');
const pesoDibujo = $('maleta-peso');

// Medidas sugeridas al cambiar de tipo (para que el ejemplo tenga sentido)
const EJEMPLOS = {
  personal: { peso: 3, alto: 40, ancho: 30, largo: 15 },
  cabina: { peso: 9, alto: 55, ancho: 35, largo: 23 },
  bodega: { peso: 21, alto: 75, ancho: 50, largo: 30 },
};

function pintarOpciones() {
  const aerolinea = selectAerolinea.value;
  selectAerolinea.replaceChildren(...Object.entries(AEROLINEAS).map(([codigo, a]) => {
    const op = document.createElement('option');
    op.value = codigo;
    op.textContent = a.nombre;
    return op;
  }));
  if (aerolinea) selectAerolinea.value = aerolinea;

  const tipo = form.elements.tipo?.value || 'cabina';
  contTipos.replaceChildren(...Object.entries(TIPOS_EQUIPAJE).map(([clave, info]) => {
    const label = document.createElement('label');
    label.className = 'opcion-tipo';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'tipo';
    input.value = clave;
    input.checked = clave === tipo;
    const caja = document.createElement('span');
    caja.className = 'opcion-tipo-caja';
    const fuerte = document.createElement('strong');
    fuerte.textContent = t(info.nombre);
    const desc = document.createElement('small');
    desc.textContent = t(info.descripcion);
    caja.append(fuerte, desc);
    label.append(input, caja);
    return label;
  }));
}

function dato(nombre, valor) {
  const div = document.createElement('div');
  const dt = document.createElement('dt');
  dt.textContent = t(nombre);
  const dd = document.createElement('dd');
  dd.textContent = valor;
  div.append(dt, dd);
  return div;
}

function calcular() {
  const datos = Object.fromEntries(new FormData(form));
  const r = revisarEquipaje(datos);

  resultado.className = `resultado resultado-${r.nivel}`;
  const titulo = document.createElement('strong');
  titulo.textContent = t(r.titulo);
  const lista = document.createElement('ul');
  r.detalles.forEach((d) => {
    const li = document.createElement('li');
    li.textContent = t(d);
    lista.append(li);
  });
  resultado.replaceChildren(titulo, lista);

  // Límites de la aerolínea para ese tipo
  limites.replaceChildren();
  if (r.regla) {
    limites.append(dato('Peso máximo', `${r.regla.peso} kg`));
    limites.append(dato('Medidas máximas', r.regla.lineal ? `${r.regla.lineal} cm (${t('suma')})` : `${r.regla.medidas.join(' × ')} cm`));
    limites.append(dato('En la tarifa básica', r.regla.incluido ? t('Incluido') : t('Se paga aparte')));
  }

  // La maleta del dibujo crece con las medidas y cambia de color según el resultado
  const alto = Math.min(Number(datos.alto) || 0, 120);
  const ancho = Math.min(Number(datos.ancho) || 0, 90);
  dibujo.style.height = `${40 + alto * 1.1}px`;
  dibujo.style.width = `${30 + ancho * 1.4}px`;
  dibujo.dataset.nivel = r.nivel;
  pesoDibujo.textContent = `${Number(datos.peso) || 0} kg`;
}

form.addEventListener('input', calcular);
form.addEventListener('change', (e) => {
  if (e.target.name === 'tipo') {
    const ejemplo = EJEMPLOS[e.target.value];
    form.elements.peso.value = ejemplo.peso;
    form.elements.alto.value = ejemplo.alto;
    form.elements.ancho.value = ejemplo.ancho;
    form.elements.largo.value = ejemplo.largo;
  }
  calcular();
});
form.addEventListener('submit', (e) => e.preventDefault());

/* ============================== Objetos permitidos ============================== */
const listaObjetos = $('lista-objetos');
const buscarObjeto = $('buscar-objeto');
const vacioObjetos = $('objetos-vacio');
let filtroObjetos = '';

const ETIQUETAS_ESTADO = {
  permitido: 'Permitido',
  'solo-cabina': 'Solo en cabina',
  'solo-bodega': 'Solo en bodega',
  prohibido: 'Prohibido',
};

function marca(texto, permitido) {
  const span = document.createElement('span');
  span.className = permitido ? 'si' : 'no';
  span.textContent = `${permitido ? '✓' : '✕'} ${t(texto)}`;
  return span;
}

function pintarObjetos() {
  const buscado = normalizar(buscarObjeto.value);
  const visibles = OBJETOS.filter((o) =>
    (!filtroObjetos || estadoObjeto(o) === filtroObjetos)
    && (!buscado || normalizar(o.nombre).includes(buscado) || normalizar(t(o.nombre)).includes(buscado)));

  listaObjetos.replaceChildren(...visibles.map((o) => {
    const estado = estadoObjeto(o);
    const li = document.createElement('li');
    li.className = `objeto objeto-${estado}`;
    const icono = document.createElement('span');
    icono.className = 'objeto-icono';
    icono.setAttribute('aria-hidden', 'true');
    icono.textContent = o.icono;
    const texto = document.createElement('div');
    const nombre = document.createElement('strong');
    nombre.textContent = t(o.nombre);
    const etiqueta = document.createElement('span');
    etiqueta.className = 'objeto-estado';
    etiqueta.textContent = t(ETIQUETAS_ESTADO[estado]);
    const lugares = document.createElement('div');
    lugares.className = 'objeto-lugares';
    lugares.append(marca('Cabina', o.cabina), marca('Bodega', o.bodega));
    texto.append(nombre, etiqueta, lugares);
    if (o.nota) {
      const nota = document.createElement('small');
      nota.textContent = t(o.nota);
      texto.append(nota);
    }
    li.append(icono, texto);
    return li;
  }));
  vacioObjetos.hidden = visibles.length > 0;
}

buscarObjeto.addEventListener('input', pintarObjetos);
document.querySelectorAll('.chips-filtro .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    filtroObjetos = chip.dataset.filtro;
    document.querySelectorAll('.chips-filtro .chip').forEach((c) => {
      const activo = c === chip;
      c.classList.toggle('activo', activo);
      c.setAttribute('aria-pressed', String(activo));
    });
    pintarObjetos();
  });
});

/* ============================== Preguntas frecuentes ============================== */
const buscarFaq = $('buscar-faq');
buscarFaq.addEventListener('input', () => {
  const buscado = normalizar(buscarFaq.value);
  let visibles = 0;
  document.querySelectorAll('#lista-faq details').forEach((d) => {
    const coincide = !buscado || normalizar(d.textContent).includes(buscado);
    d.hidden = !coincide;
    if (coincide) visibles++;
    if (buscado && coincide) d.open = true;
  });
  $('faq-vacio').hidden = visibles > 0;
});

/* ============================== Arranque ============================== */
function pintarTodo() {
  pintarOpciones();
  calcular();
  pintarObjetos();
}

pintarTodo();
document.addEventListener('cambio-idioma', pintarTodo);
