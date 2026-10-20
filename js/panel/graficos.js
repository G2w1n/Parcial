// js/panel/graficos.js
// Gráficos de una sola serie hechos con HTML/SVG (sin librerías): columnas y barras horizontales.
// Cada gráfico tiene tooltip al pasar el mouse o con el teclado, y una tabla con los mismos datos.

const SVG = 'http://www.w3.org/2000/svg';

function svg(etiqueta, atributos = {}) {
  const el = document.createElementNS(SVG, etiqueta);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
  return el;
}

function crear(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

// Marca de escala "limpia" (1, 2, 5 × 10^n) por encima del máximo
function techo(max) {
  if (max <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(max));
  const paso = [1, 2, 2.5, 5, 10].find((m) => m * potencia >= max) * potencia;
  return paso;
}

const compacto = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(Math.round(n * 100) / 100));

function tablaDeDatos(datos, nombreValor, formato) {
  const detalles = crear('details', 'grafico-tabla');
  detalles.append(crear('summary', '', 'Ver como tabla'));
  const tabla = crear('table', 'adm-tabla');
  const cab = crear('tr');
  cab.append(crear('th', '', 'Dato'), crear('th', '', nombreValor));
  const thead = crear('thead');
  thead.append(cab);
  const tbody = crear('tbody');
  datos.forEach((d) => {
    const tr = crear('tr');
    tr.append(crear('td', '', d.etiquetaLarga ?? d.etiqueta), crear('td', '', formato(d.valor)));
    tbody.append(tr);
  });
  tabla.append(thead, tbody);
  detalles.append(tabla);
  return detalles;
}

// Columnas verticales. datos: [{ etiqueta, etiquetaLarga?, valor, destacado? }]
export function graficoColumnas(contenedor, datos, { formato = String, nombreValor = 'Valor', alto = 220 } = {}) {
  contenedor.replaceChildren();
  if (!datos.length) {
    contenedor.append(crear('p', 'grafico-vacio', 'Sin datos en este periodo.'));
    return;
  }
  const ancho = 640;
  const margen = { izq: 44, der: 10, arr: 22, aba: 28 };
  const max = techo(Math.max(...datos.map((d) => d.valor)));
  const areaAncho = ancho - margen.izq - margen.der;
  const areaAlto = alto - margen.arr - margen.aba;
  const banda = areaAncho / datos.length;
  const grosor = Math.min(24, banda * 0.7);
  const y = (v) => margen.arr + areaAlto - (v / max) * areaAlto;

  const lienzo = svg('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'grafico-svg', role: 'img' });
  lienzo.setAttribute('aria-label', `${nombreValor}: ${datos.map((d) => `${d.etiquetaLarga ?? d.etiqueta} ${formato(d.valor)}`).join('; ')}`);

  // Cuadrícula y eje Y (4 divisiones)
  for (let i = 0; i <= 4; i++) {
    const valor = (max / 4) * i;
    const yy = y(valor);
    lienzo.append(svg('line', { x1: margen.izq, x2: ancho - margen.der, y1: yy, y2: yy, class: i === 0 ? 'eje' : 'rejilla' }));
    const t = svg('text', { x: margen.izq - 8, y: yy + 4, class: 'tick', 'text-anchor': 'end' });
    t.textContent = compacto(valor);
    lienzo.append(t);
  }

  const maximo = Math.max(...datos.map((d) => d.valor));
  const cada = Math.ceil(datos.length / 12); // no más de 12 etiquetas en el eje X
  const tooltip = crear('div', 'grafico-tooltip');
  tooltip.hidden = true;

  datos.forEach((d, i) => {
    const cx = margen.izq + banda * i + banda / 2;
    const h = Math.max(0, (d.valor / max) * areaAlto);
    const base = margen.arr + areaAlto;
    const r = Math.min(4, h, grosor / 2);
    // Columna con la punta redondeada y la base recta
    const x0 = cx - grosor / 2;
    const camino = h > 0
      ? `M${x0},${base} V${base - h + r} Q${x0},${base - h} ${x0 + r},${base - h} H${x0 + grosor - r} Q${x0 + grosor},${base - h} ${x0 + grosor},${base - h + r} V${base} Z`
      : '';
    const grupo = svg('g', { class: `columna${d.destacado ? ' destacada' : ''}`, tabindex: '0', role: 'img' });
    grupo.setAttribute('aria-label', `${d.etiquetaLarga ?? d.etiqueta}: ${formato(d.valor)}`);
    // Zona de toque más grande que la columna
    grupo.append(svg('rect', { x: cx - banda / 2, y: margen.arr, width: banda, height: areaAlto, class: 'zona-toque' }));
    if (camino) grupo.append(svg('path', { d: camino, class: 'barra' }));
    lienzo.append(grupo);

    if (i % cada === 0 || i === datos.length - 1) {
      const t = svg('text', { x: cx, y: alto - 8, class: 'tick', 'text-anchor': 'middle' });
      t.textContent = d.etiqueta;
      lienzo.append(t);
    }
    // Etiqueta directa solo en el máximo y en el último dato
    if (d.valor > 0 && (d.valor === maximo || i === datos.length - 1)) {
      const t = svg('text', { x: cx, y: base - h - 6, class: 'valor', 'text-anchor': 'middle' });
      t.textContent = formato(d.valor);
      lienzo.append(t);
    }

    const mostrar = () => {
      tooltip.replaceChildren(crear('strong', '', formato(d.valor)), crear('span', '', d.etiquetaLarga ?? d.etiqueta));
      tooltip.hidden = false;
      const caja = contenedor.getBoundingClientRect();
      const marca = grupo.getBoundingClientRect();
      tooltip.style.left = `${marca.left - caja.left + marca.width / 2}px`;
      tooltip.style.top = `${marca.top - caja.top + (1 - h / areaAlto) * marca.height - 8}px`;
    };
    grupo.addEventListener('pointerenter', mostrar);
    grupo.addEventListener('focus', mostrar);
    grupo.addEventListener('pointerleave', () => { tooltip.hidden = true; });
    grupo.addEventListener('blur', () => { tooltip.hidden = true; });
  });

  contenedor.append(lienzo, tooltip, tablaDeDatos(datos, nombreValor, formato));
}

// Barras horizontales ordenadas de mayor a menor. datos: [{ etiqueta, valor }]
export function graficoBarras(contenedor, datos, { formato = String, nombreValor = 'Valor' } = {}) {
  contenedor.replaceChildren();
  if (!datos.length) {
    contenedor.append(crear('p', 'grafico-vacio', 'Sin datos en este periodo.'));
    return;
  }
  const ordenados = [...datos].sort((a, b) => b.valor - a.valor);
  const max = Math.max(...ordenados.map((d) => d.valor)) || 1;
  const lista = crear('div', 'barras-h');
  lista.setAttribute('role', 'img');
  lista.setAttribute('aria-label', `${nombreValor}: ${ordenados.map((d) => `${d.etiqueta} ${formato(d.valor)}`).join('; ')}`);
  ordenados.forEach((d) => {
    const fila = crear('div', 'barra-h');
    fila.title = `${d.etiqueta}: ${formato(d.valor)}`;
    const pista = crear('span', 'barra-h-pista');
    const relleno = crear('span', 'barra-h-relleno');
    relleno.style.width = `${(d.valor / max) * 100}%`;
    pista.append(relleno);
    fila.append(crear('span', 'barra-h-etiqueta', d.etiqueta), pista, crear('span', 'barra-h-valor', formato(d.valor)));
    lista.append(fila);
  });
  contenedor.append(lista, tablaDeDatos(ordenados, nombreValor, formato));
}
