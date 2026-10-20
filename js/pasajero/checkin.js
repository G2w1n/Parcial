// js/pasajero/checkin.js
// Check-in simulado: datos del pasajero -> mapa de asientos -> tarjeta de embarque con código QR.
// No usa la base de datos: las tarjetas se guardan en este navegador.
import { AEROLINEAS, obtenerVuelos, aHora } from '../vuelos/datos-vuelos.js';
import { avisar } from '../config/ui.js';
import { cargarCambios } from '../vuelos/cambios.js';
import { t } from '../config/idioma.js';

const $ = (id) => document.getElementById(id);
const CLAVE_PASES = 'qorikancha.pases';
const CLAVE_SEGUIDOS = 'qorikancha.vuelosSeguidos';
const FILAS = 24;
const COLUMNAS = ['A', 'B', 'C', 'D', 'E', 'F'];
const FILAS_SALIDA = [11, 12];
const CIERRE_MINUTOS = 45;

const form = $('form-checkin');
const selectVuelo = $('ck-vuelo');
const mapa = $('mapa-asientos');
const botonConfirmar = $('confirmar-asiento');

await cargarCambios();
let vuelos = obtenerVuelos();
let datosPasajero = null;
let asientoElegido = null;

// ---------- Almacenamiento local ----------
function leer(clave, vacio) {
  try {
    return JSON.parse(localStorage.getItem(clave)) ?? vacio;
  } catch {
    return vacio;
  }
}
function guardar(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento disponible: la tarjeta solo dura esta visita
  }
}

// ---------- Utilidades ----------
function azar(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const vuelosAbiertos = () => vuelos.filter((v) =>
  v.tipo === 'salida' && v.estado.clave !== 'cancelado' && v.faltanMinutos > CIERRE_MINUTOS);

function fechaLarga(dia) {
  return new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
}

function mostrarPaso(n) {
  [1, 2, 3].forEach((i) => {
    const li = $(`paso-${i}`);
    li.classList.toggle('activo', i === n);
    li.classList.toggle('hecho', i < n);
    if (i === n) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
  });
  form.hidden = n !== 1;
  $('seccion-asiento').hidden = n !== 2;
  $('seccion-pase').hidden = n !== 3;
  window.scrollTo({ top: document.querySelector('.pasos-checkin').offsetTop - 90, behavior: 'smooth' });
}

// ---------- Paso 1: datos ----------
function llenarVuelos() {
  const elegido = selectVuelo.value;
  const abiertos = vuelosAbiertos();
  selectVuelo.replaceChildren(...abiertos.map((v) => {
    const op = document.createElement('option');
    op.value = v.id;
    op.textContent = `${v.codigo} · ${v.ciudad} · ${v.horaEstimada}${v.manana ? ` (${t('mañana')})` : ''}`;
    return op;
  }));
  if (abiertos.length === 0) {
    const op = document.createElement('option');
    op.textContent = t('No hay vuelos con check-in abierto');
    op.value = '';
    selectVuelo.append(op);
  }
  if (elegido && abiertos.some((v) => v.id === elegido)) selectVuelo.value = elegido;
}

const REGLAS = {
  nombres: (v) => (/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{2,40}$/.test(v.trim()) ? '' : 'Escribe tus nombres como en tu documento.'),
  apellidos: (v) => (/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{2,40}$/.test(v.trim()) ? '' : 'Escribe tus apellidos como en tu documento.'),
  documento: (v, datos) => {
    if (datos.tipoDoc === 'DNI') return /^\d{8}$/.test(v) ? '' : 'El DNI tiene 8 dígitos.';
    return /^[A-Za-z0-9]{6,12}$/.test(v) ? '' : 'Entre 6 y 12 letras o números.';
  },
  reserva: (v) => (/^[A-Za-z0-9]{6}$/.test(v.trim()) ? '' : 'El código tiene 6 letras o números.'),
  vuelo: (v) => (v ? '' : 'Elige un vuelo.'),
};

function validar() {
  const datos = Object.fromEntries(new FormData(form));
  let primero = null;
  for (const [campo, regla] of Object.entries(REGLAS)) {
    const mensaje = regla(datos[campo] ?? '', datos);
    $(`msg-${campo}`).textContent = t(mensaje);
    const input = form.elements[campo];
    input.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
    if (mensaje && !primero) primero = input;
  }
  if (primero) {
    primero.focus();
    return null;
  }
  return datos;
}

$('ck-tipo-doc').addEventListener('change', (e) => {
  $('ck-documento').inputMode = e.target.value === 'DNI' ? 'numeric' : 'text';
});

$('ck-ejemplo').addEventListener('click', () => {
  form.elements.nombres.value = 'Ana Lucía';
  form.elements.apellidos.value = 'Torres Quispe';
  form.elements.tipoDoc.value = 'DNI';
  form.elements.documento.value = '45879612';
  form.elements.reserva.value = 'K7Q2XZ';
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  vuelos = obtenerVuelos();
  const datos = validar();
  if (!datos) return;
  const vuelo = vuelos.find((v) => v.id === datos.vuelo);
  if (!vuelo || vuelo.faltanMinutos <= CIERRE_MINUTOS || vuelo.estado.clave === 'cancelado') {
    avisar(t('El check-in de este vuelo ya cerró. Acércate al mostrador de tu aerolínea.'), 'error');
    llenarVuelos();
    return;
  }
  datosPasajero = { ...datos, reserva: datos.reserva.trim().toUpperCase(), vuelo };
  asientoElegido = null;
  pintarMapa();
  mostrarPaso(2);
});

// ---------- Paso 2: asientos ----------
function ocupado(vuelo, asiento) {
  return azar(`${vuelo.id}|${asiento}`) < 0.55;
}

function pintarMapa() {
  const v = datosPasajero.vuelo;
  $('resumen-vuelo').textContent = `${v.codigo} · Cusco → ${v.ciudad} · ${fechaLarga(v.dia)} · ${v.horaEstimada}`;
  $('asiento-elegido').textContent = '—';
  botonConfirmar.disabled = true;

  const filas = [];
  const cabecera = document.createElement('div');
  cabecera.className = 'fila-asientos fila-letras';
  cabecera.setAttribute('aria-hidden', 'true');
  COLUMNAS.forEach((c, i) => {
    if (i === 3) cabecera.append(document.createElement('span'));
    const s = document.createElement('span');
    s.textContent = c;
    cabecera.append(s);
  });
  filas.push(cabecera);

  for (let n = 1; n <= FILAS; n++) {
    const fila = document.createElement('div');
    fila.className = 'fila-asientos';
    fila.setAttribute('role', 'row');
    if (FILAS_SALIDA.includes(n)) fila.classList.add('fila-salida');
    COLUMNAS.forEach((c, i) => {
      if (i === 3) {
        const pasillo = document.createElement('span');
        pasillo.className = 'pasillo';
        pasillo.textContent = n;
        pasillo.setAttribute('aria-hidden', 'true');
        fila.append(pasillo);
      }
      const codigo = `${n}${c}`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'asiento';
      b.dataset.asiento = codigo;
      b.setAttribute('role', 'gridcell');
      const lleno = ocupado(v, codigo);
      b.disabled = lleno;
      const extra = FILAS_SALIDA.includes(n) ? `, ${t('salida de emergencia')}` : '';
      b.setAttribute('aria-label', `${t('Asiento')} ${codigo}${extra}${lleno ? `, ${t('ocupado')}` : ''}`);
      b.setAttribute('aria-pressed', 'false');
      fila.append(b);
    });
    filas.push(fila);
  }
  mapa.replaceChildren(...filas);
}

function elegirAsiento(codigo) {
  asientoElegido = codigo;
  mapa.querySelectorAll('.asiento').forEach((b) => {
    const es = b.dataset.asiento === codigo;
    b.classList.toggle('elegido', es);
    b.setAttribute('aria-pressed', String(es));
  });
  const fila = Number.parseInt(codigo, 10);
  $('asiento-elegido').textContent = `${codigo}${FILAS_SALIDA.includes(fila) ? ` · ${t('salida de emergencia (más espacio)')}` : ''}`;
  botonConfirmar.disabled = false;
}

mapa.addEventListener('click', (e) => {
  const b = e.target.closest('.asiento');
  if (b && !b.disabled) elegirAsiento(b.dataset.asiento);
});

$('asiento-azar').addEventListener('click', () => {
  const libres = [...mapa.querySelectorAll('.asiento:not(:disabled)')];
  if (libres.length === 0) return;
  const b = libres[Math.floor(Math.random() * libres.length)];
  elegirAsiento(b.dataset.asiento);
  b.scrollIntoView({ block: 'center', behavior: 'smooth' });
});

$('volver-datos').addEventListener('click', () => mostrarPaso(1));

botonConfirmar.addEventListener('click', () => {
  if (!asientoElegido) return;
  const v = datosPasajero.vuelo;
  const fila = Number.parseInt(asientoElegido, 10);
  const pase = {
    id: `${v.id}|${datosPasajero.reserva}`,
    vueloId: v.id,
    codigo: v.codigo,
    aerolinea: v.aerolinea,
    ciudad: v.ciudad,
    codigoCiudad: v.codigoCiudad,
    dia: v.dia,
    salida: v.horaEstimada,
    embarque: aHora(v.minutosEstimados - 40),
    puerta: v.puerta,
    asiento: asientoElegido,
    grupo: fila <= 6 ? 1 : fila <= 14 ? 2 : 3,
    secuencia: String(Math.floor(azar(`${v.id}|${asientoElegido}|seq`) * 150) + 1).padStart(3, '0'),
    pasajero: `${datosPasajero.apellidos.trim().toUpperCase()} / ${datosPasajero.nombres.trim().toUpperCase()}`,
    documento: `${datosPasajero.tipoDoc} ****${datosPasajero.documento.slice(-4)}`,
    reserva: datosPasajero.reserva,
  };
  const pases = leer(CLAVE_PASES, []).filter((p) => p.id !== pase.id);
  pases.unshift(pase);
  guardar(CLAVE_PASES, pases.slice(0, 10));
  mostrarPase(pase);
  avisar(t('¡Check-in listo! Tu tarjeta de embarque quedó guardada en este navegador.'));
});

// ---------- Paso 3: tarjeta de embarque ----------
function crear(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function dato(nombre, valor, clase = '') {
  const div = crear('div', `pase-dato ${clase}`);
  div.append(crear('span', '', t(nombre)), crear('strong', '', valor));
  return div;
}

function codigoQR(texto) {
  // qrcode-generator (MIT) se carga como script clásico antes de este módulo
  if (typeof window.qrcode !== 'function') return crear('p', 'sin-qr', t('Código QR no disponible'));
  const qr = window.qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  const contenedor = crear('div', 'qr');
  contenedor.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  contenedor.setAttribute('role', 'img');
  contenedor.setAttribute('aria-label', t('Código QR de la tarjeta de embarque'));
  return contenedor;
}

function mostrarPase(p) {
  const a = AEROLINEAS[p.aerolinea];
  const pase = $('pase');
  pase.style.setProperty('--color-aerolinea', a.color);

  const cabecera = crear('header', 'pase-cabecera');
  cabecera.append(crear('strong', '', a.nombre), crear('span', '', t('Tarjeta de embarque')));

  const ruta = crear('div', 'pase-ruta');
  const origen = crear('div', '');
  origen.append(crear('span', 'pase-iata', 'CUZ'), crear('span', '', 'Cusco'));
  const destino = crear('div', '');
  destino.append(crear('span', 'pase-iata', p.codigoCiudad), crear('span', '', p.ciudad));
  ruta.append(origen, crear('span', 'pase-avion', '✈'), destino);

  const datos = crear('div', 'pase-datos');
  datos.append(
    dato('Pasajero', p.pasajero, 'ancho'),
    dato('Vuelo', p.codigo),
    dato('Fecha', fechaLarga(p.dia)),
    dato('Salida', p.salida),
    dato('Embarque', p.embarque, 'resaltado'),
    dato('Puerta', p.puerta, 'resaltado'),
    dato('Asiento', p.asiento, 'resaltado'),
    dato('Grupo', String(p.grupo)),
    dato('Secuencia', p.secuencia),
    dato('Reserva', p.reserva),
  );

  const talon = crear('div', 'pase-talon');
  talon.append(
    codigoQR(`QORIKANCHA|${p.codigo.replace(' ', '')}|${p.dia}|${p.pasajero}|${p.asiento}|${p.reserva}|${p.secuencia}`),
    crear('p', 'pase-nota', t('Presenta este código en el control de seguridad y en la puerta de embarque.')),
    crear('p', 'pase-doc', p.documento),
  );

  const cuerpo = crear('div', 'pase-cuerpo');
  cuerpo.append(ruta, datos);
  pase.replaceChildren(cabecera, cuerpo, talon);

  $('seguir-vuelo').href = `vuelos.html?vuelo=${encodeURIComponent(p.codigo.replace(' ', ''))}`;
  $('seguir-vuelo').onclick = () => {
    // Lo agrega a "Mis vuelos" del tablero antes de ir
    const vuelo = vuelos.find((v) => v.id === p.vueloId);
    if (!vuelo) return;
    const seguidos = leer(CLAVE_SEGUIDOS, {});
    seguidos[vuelo.id] = { estado: vuelo.estado.clave, texto: vuelo.estado.texto, puerta: vuelo.puerta, hora: vuelo.horaEstimada };
    guardar(CLAVE_SEGUIDOS, seguidos);
  };
  mostrarPaso(3);
  pintarMisPases();
}

$('imprimir-pase').addEventListener('click', () => window.print());
$('nuevo-checkin').addEventListener('click', () => {
  form.reset();
  llenarVuelos();
  mostrarPaso(1);
});

// ---------- Tarjetas guardadas ----------
function pintarMisPases() {
  const vigentes = leer(CLAVE_PASES, []).filter((p) => vuelos.some((v) => v.id === p.vueloId));
  guardar(CLAVE_PASES, vigentes);
  $('mis-pases').hidden = vigentes.length === 0;
  $('lista-pases').replaceChildren(...vigentes.map((p) => {
    const b = crear('button', 'mini-pase');
    b.type = 'button';
    b.dataset.id = p.id;
    b.style.setProperty('--color-aerolinea', AEROLINEAS[p.aerolinea].color);
    b.append(crear('strong', '', p.codigo), crear('span', '', `CUZ → ${p.codigoCiudad} · ${p.salida}`), crear('span', '', `${t('Asiento')} ${p.asiento}`));
    return b;
  }));
}

$('lista-pases').addEventListener('click', (e) => {
  const b = e.target.closest('.mini-pase');
  if (!b) return;
  const pase = leer(CLAVE_PASES, []).find((p) => p.id === b.dataset.id);
  if (pase) mostrarPase(pase);
});

// ---------- Arranque ----------
llenarVuelos();
pintarMisPases();
const vueloUrl = new URLSearchParams(location.search).get('vuelo');
if (vueloUrl) {
  const v = vuelosAbiertos().find((x) => x.codigo.replace(' ', '') === vueloUrl.replace(/\s/g, '').toUpperCase());
  if (v) selectVuelo.value = v.id;
}
document.addEventListener('cambio-idioma', () => {
  llenarVuelos();
  pintarMisPases();
});
// Los vuelos se recalculan cada minuto para no ofrecer los que ya cerraron
setInterval(() => {
  vuelos = obtenerVuelos();
  if (!form.hidden) llenarVuelos();
}, 60000);
