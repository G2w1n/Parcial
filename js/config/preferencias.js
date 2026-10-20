// js/config/preferencias.js
// Modo oscuro y modo accesible (letra grande y alto contraste). Se guardan en el navegador y
// cada página los aplica desde el <head> (script en línea) para que no parpadee al cargar.
const CLAVE_TEMA = 'qorikancha.tema';
const CLAVE_ACCESIBLE = 'qorikancha.accesible';
const raiz = document.documentElement;

function leer(clave) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardar(clave, valor) {
  try {
    if (valor) localStorage.setItem(clave, valor);
    else localStorage.removeItem(clave);
  } catch {
    // Sin almacenamiento: dura solo esta visita
  }
}

function aplicar() {
  const tema = leer(CLAVE_TEMA);
  if (tema === 'oscuro') raiz.dataset.tema = 'oscuro';
  else delete raiz.dataset.tema;
  if (leer(CLAVE_ACCESIBLE) === '1') raiz.dataset.accesible = '';
  else delete raiz.dataset.accesible;
}

function boton(texto, etiqueta, activo, alPulsar) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn-preferencia';
  b.textContent = texto;
  b.title = etiqueta;
  b.setAttribute('aria-label', etiqueta);
  b.setAttribute('aria-pressed', String(activo()));
  b.addEventListener('click', () => {
    alPulsar();
    aplicar();
    b.setAttribute('aria-pressed', String(activo()));
  });
  return b;
}

export function crearPreferencias() {
  aplicar();
  const nav = document.querySelector('.site-header nav');
  if (!nav || nav.querySelector('.preferencias')) return;
  const grupo = document.createElement('span');
  grupo.className = 'preferencias';
  grupo.append(
    boton('☾', 'Modo oscuro', () => raiz.dataset.tema === 'oscuro',
      () => guardar(CLAVE_TEMA, raiz.dataset.tema === 'oscuro' ? null : 'oscuro')),
    boton('Aa', 'Modo accesible: letra grande y alto contraste', () => 'accesible' in raiz.dataset,
      () => guardar(CLAVE_ACCESIBLE, 'accesible' in raiz.dataset ? null : '1')),
  );
  nav.append(grupo);
}
