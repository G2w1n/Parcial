// js/config/idioma.js
// Selector de idioma (español, inglés y quechua). Traduce el menú y el pie de página de todas las páginas,
// y los textos marcados con data-i18n (las páginas de pasajeros, check-in y turismo están completas).
// Los módulos de cada página usan t() para sus textos y escuchan el evento "cambio-idioma" para repintar.
import { TRADUCCIONES, PATRONES } from './traducciones.js';

const CLAVE = 'qorikancha.idioma';
export const IDIOMAS = { es: 'Español', en: 'English', qu: 'Runasimi (quechua)' };

let idioma = 'es';
try {
  const guardado = localStorage.getItem(CLAVE);
  if (IDIOMAS[guardado]) idioma = guardado;
} catch {
  // Sin almacenamiento: se queda en español
}

export const idiomaActual = () => idioma;

// Traduce un texto en español al idioma actual; si no hay traducción, lo devuelve igual
export function t(texto) {
  if (idioma === 'es' || !texto) return texto;
  const exacto = TRADUCCIONES[texto]?.[idioma];
  if (exacto) return exacto;
  for (const [patron, reemplazos] of PATRONES) {
    if (reemplazos[idioma] && patron.test(texto)) return texto.replace(patron, reemplazos[idioma]);
  }
  return texto;
}

// Guarda el texto original en español la primera vez para poder volver a él
const originales = new WeakMap();
function traducirNodo(nodo) {
  if (!originales.has(nodo)) originales.set(nodo, nodo.textContent.trim());
  const original = originales.get(nodo);
  const traducido = t(original);
  if (nodo.textContent.trim() !== traducido) {
    nodo.textContent = nodo.textContent.replace(nodo.textContent.trim(), traducido);
  }
}

function nodosDeTexto(raiz) {
  const nodos = [];
  const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.textContent.trim() && !n.parentElement.closest('.selector-idioma, script, style')
      ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  while (recorrido.nextNode()) nodos.push(recorrido.currentNode);
  return nodos;
}

export function traducirPagina() {
  document.documentElement.lang = idioma === 'qu' ? 'qu' : idioma;
  // Menú, menú de usuario y pie de página (comunes a todas las páginas)
  document.querySelectorAll('.site-header nav, .site-footer').forEach((zona) => nodosDeTexto(zona).forEach(traducirNodo));
  // Textos marcados en cada página
  document.querySelectorAll('[data-i18n]').forEach((el) => nodosDeTexto(el).forEach(traducirNodo));
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    if (!el.dataset.placeholderOriginal) el.dataset.placeholderOriginal = el.placeholder;
    el.placeholder = t(el.dataset.placeholderOriginal);
  });
}

function crearSelector() {
  const nav = document.querySelector('.site-header nav');
  if (!nav || nav.querySelector('.selector-idioma')) return;
  const contenedor = document.createElement('span');
  contenedor.className = 'selector-idioma';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Idioma / Language / Simi');
  for (const [codigo, nombre] of Object.entries(IDIOMAS)) {
    const op = document.createElement('option');
    op.value = codigo;
    op.textContent = codigo.toUpperCase();
    op.title = nombre;
    select.append(op);
  }
  select.value = idioma;
  select.addEventListener('change', () => {
    idioma = select.value;
    try {
      localStorage.setItem(CLAVE, idioma);
    } catch {
      // Sin almacenamiento: el idioma dura solo esta página
    }
    traducirPagina();
    document.dispatchEvent(new CustomEvent('cambio-idioma', { detail: idioma }));
  });
  contenedor.append(select);
  nav.append(contenedor);
}

// Se espera a que todos los módulos de la página terminen (nav-sesion.js cambia el menú)
function iniciar() {
  crearSelector();
  if (idioma !== 'es') {
    traducirPagina();
    document.dispatchEvent(new CustomEvent('cambio-idioma', { detail: idioma }));
  }
}
if (document.readyState === 'complete') iniciar();
else document.addEventListener('DOMContentLoaded', iniciar);
