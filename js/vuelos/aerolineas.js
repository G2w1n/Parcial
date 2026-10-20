// js/vuelos/aerolineas.js
// Tarjetas de cada aerolínea con su mostrador, contacto, destinos y próximo vuelo
import { AEROLINEAS, obtenerVuelos, destinosDe, vuelosDiariosDe } from './datos-vuelos.js';
import { cargarCambios } from './cambios.js';

const lista = document.getElementById('lista-aerolineas');
await cargarCambios();
const vuelos = obtenerVuelos();

function crear(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function proximoVuelo(codigo) {
  return vuelos.find((v) => v.aerolinea === codigo && v.faltanMinutos > 0 && v.estado.clave !== 'cancelado');
}

for (const [codigo, a] of Object.entries(AEROLINEAS)) {
  const tarjeta = crear('article', 'tarjeta-aerolinea');
  tarjeta.id = codigo;
  tarjeta.style.setProperty('--color-aerolinea', a.color);

  const logo = crear('div', 'logo-aerolinea', codigo);
  logo.setAttribute('aria-hidden', 'true');

  const cabecera = crear('div', 'ta-cabecera');
  const titulos = crear('div', '');
  titulos.append(crear('h2', '', a.nombre), crear('p', 'ta-frecuencia', `${vuelosDiariosDe(codigo)} vuelos diarios`));
  cabecera.append(logo, titulos);

  const descripcion = crear('p', 'ta-descripcion', a.descripcion);

  const datos = crear('dl', 'ta-datos');
  const agregar = (nombre, valor) => {
    const grupo = crear('div', '');
    grupo.append(crear('dt', '', nombre));
    const dd = crear('dd', '');
    if (valor instanceof Node) dd.append(valor);
    else dd.textContent = valor;
    grupo.append(dd);
    datos.append(grupo);
  };
  agregar('Mostrador', a.mostrador);
  const tel = crear('a', '', a.telefono);
  tel.href = `tel:${a.telefono.replace(/[^\d+]/g, '')}`;
  agregar('Teléfono', tel);

  const proximo = proximoVuelo(codigo);
  agregar('Próximo vuelo', proximo
    ? `${proximo.codigo} · ${proximo.tipo === 'salida' ? 'a' : 'desde'} ${proximo.ciudad} · ${proximo.horaEstimada}${proximo.manana ? ' (mañana)' : ''}`
    : 'Sin vuelos próximos');

  const destinos = crear('ul', 'ta-destinos');
  destinos.setAttribute('aria-label', 'Destinos desde Cusco');
  destinosDe(codigo).forEach((ciudad) => destinos.append(crear('li', '', ciudad)));

  const acciones = crear('div', 'ta-acciones');
  const verVuelos = crear('a', 'btn-ta', 'Ver sus vuelos');
  verVuelos.href = `vuelos.html?aerolinea=${encodeURIComponent(codigo)}#tablero`;
  const web = crear('a', 'btn-ta btn-ta-borde', 'Sitio web ↗');
  web.href = a.web;
  web.target = '_blank';
  web.rel = 'noopener';
  acciones.append(verVuelos, web);

  tarjeta.append(cabecera, descripcion, datos, destinos, acciones);
  lista.append(tarjeta);
}

// Si se llegó con #LA, se resalta esa aerolínea
const destacada = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
if (destacada) {
  destacada.classList.add('destacada');
  destacada.scrollIntoView({ block: 'center' });
}
