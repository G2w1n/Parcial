// js/servicios/pedidos.js
// Pedidos de comida para recoger (tabla "pedidos"). Los códigos de los pedidos se guardan en el navegador
// para consultar su estado; el restaurante lo cambia desde el panel.
import { sql } from '../config/neon-config.js';
import { avisar, conCarga } from '../config/ui.js';
import { formatearSoles, redondear } from '../registro/tarifario.js';
import { ahoraEnLima, aHora } from '../vuelos/datos-vuelos.js';

const $ = (id) => document.getElementById(id);
const CLAVE = 'qorikancha.pedidos';

// Cartas REFERENCIALES (caso académico)
const RESTAURANTES = {
  'Pizza Hut': { lugar: 'Sala de embarque · nivel 2', menu: [['Pizza personal americana', 24.9], ['Pizza personal pepperoni', 26.9], ['Pan al ajo (6 unid.)', 9.9], ['Alitas BBQ (6 unid.)', 19.9], ['Gaseosa 500 ml', 6.5]] },
  Bembos: { lugar: 'Zona pública · nivel 1', menu: [['Hamburguesa clásica', 15.9], ['Hamburguesa a lo pobre', 21.9], ['Papas fritas medianas', 8.9], ['Nuggets (6 unid.)', 12.9], ['Chicha morada', 6.0]] },
  'Burger King': { lugar: 'Hall de salidas · nivel 1', menu: [['Whopper', 22.9], ['Whopper Jr.', 15.9], ['King de pollo', 18.9], ['Aros de cebolla', 9.9], ['Gaseosa 500 ml', 6.5]] },
  KFC: { lugar: 'Hall de llegadas · nivel 1', menu: [['Combo 2 piezas', 21.9], ['Twister', 17.9], ['Popcorn chicken', 14.9], ['Puré y gravy', 7.9], ['Gaseosa 500 ml', 6.5]] },
  Popeyes: { lugar: 'Zona comercial · nivel 1', menu: [['Combo 2 piezas', 22.9], ['Sándwich de pollo', 19.9], ['Tenders (3 unid.)', 16.9], ['Biscuit', 4.9], ['Limonada', 7.5]] },
  Starbucks: { lugar: 'Sala de embarque · nivel 2', menu: [['Café americano', 9.9], ['Latte', 13.9], ['Frappuccino', 16.9], ['Croissant de jamón y queso', 12.9], ['Muffin de arándanos', 9.9]] },
  'Taco Bell': { lugar: 'Zona pública · nivel 1', menu: [['Taco crujiente', 8.9], ['Burrito supremo', 18.9], ['Quesadilla de pollo', 17.9], ['Nachos con queso', 11.9], ['Gaseosa 500 ml', 6.5]] },
};

const ESTADOS = {
  recibido: { texto: 'Recibido', paso: 1 },
  preparando: { texto: 'Preparando', paso: 2 },
  listo: { texto: '¡Listo para recoger!', paso: 3 },
  entregado: { texto: 'Entregado', paso: 4 },
  cancelado: { texto: 'Cancelado', paso: 0 },
};

function leerCodigos() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE)) ?? [];
  } catch {
    return [];
  }
}
function guardarCodigos(codigos) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(codigos.slice(0, 15)));
  } catch {
    // Sin almacenamiento: el pedido igual queda registrado en la base de datos
  }
}

function crear(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

/* ============================== Diálogo de pedido ============================== */
const dialogo = $('dialogo-pedido');
const form = $('form-pedido');
const menu = $('menu');
let restauranteActual = null;
let cantidades = [];

// Horas de recojo: desde dentro de 20 minutos, cada 15 minutos, hasta 3 horas después
function llenarHoras() {
  const ahora = ahoraEnLima().minutos;
  const inicio = Math.ceil((ahora + 20) / 15) * 15;
  const opciones = [];
  for (let m = inicio; m <= ahora + 180; m += 15) {
    const op = crear('option', '', aHora(m));
    op.value = aHora(m);
    opciones.push(op);
  }
  $('pd-hora').replaceChildren(...opciones);
}

function total() {
  return redondear(RESTAURANTES[restauranteActual].menu.reduce((s, [, precio], i) => s + precio * cantidades[i], 0));
}

function pintarMenu() {
  const items = RESTAURANTES[restauranteActual].menu;
  menu.replaceChildren(...items.map(([nombre, precio], i) => {
    const li = crear('li', `item${cantidades[i] ? ' elegido' : ''}`);
    const texto = crear('div', '');
    texto.append(crear('strong', '', nombre), crear('span', '', formatearSoles(precio)));
    const controles = crear('div', 'cantidad');
    const menos = crear('button', 'btn-cant', '−');
    menos.type = 'button';
    menos.dataset.i = i;
    menos.dataset.delta = -1;
    menos.disabled = cantidades[i] === 0;
    menos.setAttribute('aria-label', `Quitar ${nombre}`);
    const valor = crear('output', '', String(cantidades[i]));
    valor.setAttribute('aria-label', `Cantidad de ${nombre}`);
    const mas = crear('button', 'btn-cant', '+');
    mas.type = 'button';
    mas.dataset.i = i;
    mas.dataset.delta = 1;
    mas.disabled = cantidades[i] >= 10;
    mas.setAttribute('aria-label', `Agregar ${nombre}`);
    controles.append(menos, valor, mas);
    li.append(texto, controles);
    return li;
  }));
  $('pd-total').textContent = formatearSoles(total());
  $('pd-enviar').disabled = total() === 0;
}

menu.addEventListener('click', (e) => {
  const b = e.target.closest('.btn-cant');
  if (!b) return;
  const i = Number(b.dataset.i);
  cantidades[i] = Math.min(10, Math.max(0, cantidades[i] + Number(b.dataset.delta)));
  pintarMenu();
  menu.querySelector(`.btn-cant[data-i="${i}"][data-delta="${b.dataset.delta}"]`)?.focus();
});

function abrirPedido(nombre) {
  restauranteActual = nombre;
  cantidades = RESTAURANTES[nombre].menu.map(() => 0);
  $('t-pedido').textContent = `Pedido en ${nombre}`;
  $('pedido-ubicacion').textContent = `📍 Recoge en ${RESTAURANTES[nombre].lugar}`;
  $('pd-error').textContent = '';
  llenarHoras();
  pintarMenu();
  dialogo.showModal();
}

document.querySelectorAll('.btn-pedir').forEach((b) => b.addEventListener('click', () => abrirPedido(b.dataset.restaurante)));
$('cerrar-pedido').addEventListener('click', () => dialogo.close());
dialogo.addEventListener('click', (e) => {
  if (e.target === dialogo) dialogo.close();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = $('pd-error');
  error.textContent = '';
  const datos = Object.fromEntries(new FormData(form));
  if (total() === 0) return void (error.textContent = 'Agrega al menos un producto.');
  if (datos.nombre.trim().length < 2) return void (error.textContent = 'Escribe tu nombre.');
  if (!/^9\d{8}$/.test(datos.celular)) return void (error.textContent = 'El celular tiene 9 dígitos y empieza con 9.');

  const items = RESTAURANTES[restauranteActual].menu
    .map(([nombre, precio], i) => ({ nombre, precio, cantidad: cantidades[i] }))
    .filter((it) => it.cantidad > 0);
  const codigo = `PD-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  const boton = $('pd-enviar');
  try {
    await conCarga(boton, () => sql`
      INSERT INTO pedidos (codigo, restaurante, items, total, nombre, celular, hora_recojo)
      VALUES (${codigo}, ${restauranteActual}, ${JSON.stringify(items)}::jsonb, ${total()},
              ${datos.nombre.trim().slice(0, 40)}, ${datos.celular}, ${datos.hora_recojo});
    `);
    guardarCodigos([codigo, ...leerCodigos()]);
    dialogo.close();
    form.reset();
    avisar(`Pedido ${codigo} enviado. Recógelo a las ${datos.hora_recojo}.`);
    cargarPedidos();
    $('mis-pedidos').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error(err);
    error.textContent = err.code === '42P01'
      ? 'Los pedidos aún no están activados (falta ejecutar database/fase-4.sql en Neon).'
      : 'No se pudo enviar el pedido. Intenta de nuevo.';
  }
});

/* ============================== Mis pedidos ============================== */
async function cargarPedidos() {
  const codigos = leerCodigos();
  $('mis-pedidos').hidden = codigos.length === 0;
  if (codigos.length === 0) return;

  let pedidos = [];
  try {
    pedidos = await sql`
      SELECT codigo, restaurante, items, total, hora_recojo, estado, fecha
      FROM pedidos WHERE codigo = ANY(${codigos}) ORDER BY fecha DESC;
    `;
  } catch (err) {
    console.error(err);
    $('lista-pedidos').replaceChildren(crear('li', 'pedido-error', 'No se pudo consultar el estado de tus pedidos.'));
    return;
  }

  $('lista-pedidos').replaceChildren(...pedidos.map((p) => {
    const estado = ESTADOS[p.estado] ?? ESTADOS.recibido;
    const li = crear('li', `pedido estado-${p.estado}`);
    const cabecera = crear('div', 'pedido-cab');
    cabecera.append(crear('strong', '', `${p.restaurante} · ${p.codigo}`), crear('span', 'pedido-estado', estado.texto));
    const items = (typeof p.items === 'string' ? JSON.parse(p.items) : p.items)
      .map((it) => `${it.cantidad} × ${it.nombre}`).join(', ');
    const detalle = crear('p', 'pedido-items', items);
    const pie = crear('p', 'pedido-pie', `Recojo ${p.hora_recojo} · ${formatearSoles(Number(p.total))}`);
    const progreso = crear('div', 'progreso');
    progreso.setAttribute('aria-hidden', 'true');
    ['Recibido', 'Preparando', 'Listo', 'Entregado'].forEach((n, i) => {
      progreso.append(crear('span', i < estado.paso ? 'hecho' : '', n));
    });
    li.append(cabecera, detalle, progreso, pie);
    return li;
  }));
}

$('actualizar-pedidos').addEventListener('click', cargarPedidos);
cargarPedidos();
// El estado cambia desde el restaurante: se revisa cada 30 segundos
setInterval(() => {
  if (!document.hidden && leerCodigos().length) cargarPedidos();
}, 30000);
