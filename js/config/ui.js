// js/config/ui.js
// Ayudas de interfaz compartidas entre páginas (no tocan la base de datos)

export const sinAnimaciones = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function escaparHTML(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatearFecha(valor) {
  if (!valor) return '—';
  return new Date(valor).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}

// Aviso emergente (entra con la animación de la Semana 5: aparecer-confirmacion)
export function avisar(texto, tipo = 'exito') {
  let contenedor = document.getElementById('avisos');
  if (!contenedor) {
    contenedor = document.createElement('div');
    contenedor.id = 'avisos';
    contenedor.className = 'avisos';
    contenedor.setAttribute('role', 'status');
    contenedor.setAttribute('aria-live', 'polite');
    document.body.appendChild(contenedor);
  }

  const aviso = document.createElement('div');
  aviso.className = `aviso aviso-${tipo}`;

  const icono = document.createElement('span');
  icono.className = 'aviso-icono';
  icono.setAttribute('aria-hidden', 'true');
  icono.textContent = tipo === 'error' ? '!' : '✓';

  const mensaje = document.createElement('span');
  mensaje.className = 'aviso-texto';
  mensaje.textContent = texto;

  const barra = document.createElement('span');
  barra.className = 'aviso-barra';

  aviso.append(icono, mensaje, barra);
  contenedor.appendChild(aviso);

  const quitar = () => {
    aviso.classList.add('saliendo');
    aviso.addEventListener('animationend', (evento) => {
      if (evento.target === aviso) aviso.remove();
    });
    setTimeout(() => aviso.remove(), 600);
  };
  aviso.addEventListener('click', quitar);
  setTimeout(quitar, 3800);
}

// Botón con círculo que gira mientras se ejecuta una acción
export async function conCarga(boton, accion) {
  if (boton) {
    boton.disabled = true;
    boton.classList.add('cargando');
  }
  try {
    return await accion();
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.classList.remove('cargando');
    }
  }
}

// Número que cuenta hasta su valor. "formato" convierte el número en texto (por ejemplo, a soles)
export function animarNumero(elemento, destino, formato = (n) => String(Math.round(n))) {
  if (!elemento) return;
  const esPrimera = elemento.dataset.valor === undefined;
  const inicio = Number(elemento.dataset.valor || 0);
  if (!esPrimera && inicio === destino) return;
  elemento.dataset.valor = destino;

  if (sinAnimaciones) {
    elemento.textContent = formato(destino);
    return;
  }

  if (!esPrimera) {
    elemento.classList.remove('latido');
    void elemento.offsetWidth;
    elemento.classList.add('latido');
    elemento.addEventListener('animationend', () => elemento.classList.remove('latido'), { once: true });
  }

  const duracion = 700;
  const t0 = performance.now();
  elemento._animacion = t0;

  function paso(ahora) {
    if (elemento._animacion !== t0) return;
    const progreso = Math.min((ahora - t0) / duracion, 1);
    const suave = 1 - Math.pow(1 - progreso, 3);
    elemento.textContent = formato(inicio + (destino - inicio) * suave);
    if (progreso < 1) requestAnimationFrame(paso);
  }
  requestAnimationFrame(paso);
}

// Filas grises con brillo mientras llegan los datos
export function mostrarEsqueleto(cuerpo, columnas, filas = 4) {
  cuerpo.replaceChildren();
  for (let i = 0; i < filas; i++) {
    const tr = document.createElement('tr');
    tr.className = 'fila-esqueleto';
    tr.setAttribute('aria-hidden', 'true');
    for (let c = 0; c < columnas; c++) {
      const td = document.createElement('td');
      const barra = document.createElement('span');
      barra.className = 'barra-esqueleto';
      td.append(barra);
      tr.append(td);
    }
    cuerpo.appendChild(tr);
  }
}

// Confeti desde un elemento (necesita las reglas .confeti de la hoja de estilos de la página)
export function lanzarConfeti(origen) {
  if (sinAnimaciones) return;
  const caja = origen.getBoundingClientRect();
  const colores = ['#f2994a', '#1f8a4c', '#163a5c', '#8fd3f4', '#f5c542'];

  for (let i = 0; i < 28; i++) {
    const trozo = document.createElement('span');
    trozo.className = 'confeti';
    trozo.style.setProperty('--x', `${caja.left + caja.width / 2}px`);
    trozo.style.setProperty('--y', `${caja.top + caja.height / 2}px`);
    trozo.style.setProperty('--dx', `${(Math.random() - 0.5) * 300}px`);
    trozo.style.setProperty('--dy', `${-(60 + Math.random() * 140)}px`);
    trozo.style.setProperty('--giro', `${(Math.random() - 0.5) * 720}deg`);
    trozo.style.background = colores[i % colores.length];
    trozo.addEventListener('animationend', () => trozo.remove());
    document.body.appendChild(trozo);
  }
}