// js/panel/vuelos-admin.js
// Cambios manuales a los vuelos: demora, cancelación, puerta y nota. El tablero público los aplica al instante.
import { sql } from '../config/neon-config.js';
import { exigirRol } from '../auth/auth.js';
import { avisar, conCarga } from '../config/ui.js';
import { registrar } from '../config/bitacora.js';
import { AEROLINEAS, obtenerVuelos, filtrarVuelos } from '../vuelos/datos-vuelos.js';
import { cargarCambios } from '../vuelos/cambios.js';

const usuario = exigirRol('administrador', 'empleado');
if (!usuario) throw new Error('Acceso denegado');

const $ = (id) => document.getElementById(id);
const PUERTAS = { salida: ['1', '2', '3', '4', '5', '6'], llegada: ['A', 'B', 'C'] };
const CHIP = {
  'a-tiempo': 'adm-chip-verde', programado: '', embarcando: 'adm-chip-azul', cerrado: '', despego: '',
  aproximacion: 'adm-chip-azul', aterrizo: 'adm-chip-verde', demorado: 'adm-chip-ambar', cancelado: 'adm-chip-rojo',
};

const dialogo = $('dialogo-vuelo');
const form = $('form-vuelo');
let vuelos = [];
let tablaDisponible = true;
let vueloEditado = null;

const crear = (etiqueta, clase, texto) => {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
};

async function guardarCambio(vuelo, datos) {
  await sql`
    INSERT INTO vuelos_cambios (codigo_vuelo, dia, cancelado, demora_minutos, puerta, nota, actualizado_por, fecha)
    VALUES (${vuelo.codigo}, ${vuelo.dia}::date, ${datos.cancelado}, ${datos.demora}, ${datos.puerta}, ${datos.nota}, ${usuario.id}, NOW())
    ON CONFLICT (codigo_vuelo, dia) DO UPDATE SET
      cancelado = EXCLUDED.cancelado, demora_minutos = EXCLUDED.demora_minutos, puerta = EXCLUDED.puerta,
      nota = EXCLUDED.nota, actualizado_por = EXCLUDED.actualizado_por, fecha = NOW();
  `;
}

async function quitarCambio(vuelo) {
  await sql`DELETE FROM vuelos_cambios WHERE codigo_vuelo = ${vuelo.codigo} AND dia = ${vuelo.dia}::date;`;
}

function pintarTabla() {
  const lista = filtrarVuelos(vuelos, {
    texto: $('filtro-buscar').value,
    aerolinea: $('filtro-aerolinea').value,
    tipo: $('filtro-tipo').value,
  });
  const cuerpo = $('tabla-vuelos');
  if (lista.length === 0) {
    const tr = crear('tr');
    const td = crear('td', 'celda-vacia', 'No hay vuelos con estos filtros.');
    td.colSpan = 8;
    tr.append(td);
    cuerpo.replaceChildren(tr);
    return;
  }
  cuerpo.replaceChildren(...lista.map((v) => {
    const tr = crear('tr');
    const vuelo = crear('td');
    vuelo.append(crear('strong', '', v.codigo), crear('br'), crear('small', '', v.nombreAerolinea));
    const hora = crear('td', '', v.hora + (v.manana ? ' (mañana)' : ''));
    const estimada = crear('td', '', v.horaEstimada);
    const estado = crear('td');
    estado.append(crear('span', `adm-chip ${CHIP[v.estado.clave] ?? ''}`, v.estado.texto));
    if (v.manual) estado.append(' ', crear('span', 'adm-chip adm-chip-azul', 'Manual'));
    if (v.nota) estado.append(crear('br'), crear('small', '', v.nota));
    const acciones = crear('td');
    const caja = crear('div', 'acciones');
    const editar = crear('button', 'adm-btn adm-btn-borde', 'Editar');
    editar.type = 'button';
    editar.dataset.id = v.id;
    editar.disabled = !tablaDisponible;
    caja.append(editar);
    if (v.manual) {
      const quitar = crear('button', 'adm-btn adm-btn-peligro', 'Restablecer');
      quitar.type = 'button';
      quitar.dataset.id = v.id;
      quitar.dataset.accion = 'quitar';
      caja.append(quitar);
    }
    acciones.append(caja);
    tr.append(vuelo, crear('td', '', v.nombreTipo), crear('td', '', v.ciudad), hora, estimada, crear('td', '', v.puerta), estado, acciones);
    return tr;
  }));
}

function abrirEditor(v) {
  vueloEditado = v;
  $('t-dialogo-vuelo').textContent = `${v.codigo} · ${v.nombreTipo} ${v.tipo === 'salida' ? 'a' : 'desde'} ${v.ciudad} · ${v.hora}`;
  $('fv-cancelado').checked = v.estado.clave === 'cancelado';
  const demora = Math.max(0, v.minutosEstimados - (Number(v.hora.slice(0, 2)) * 60 + Number(v.hora.slice(3)) + (v.manana ? 1440 : 0)));
  $('fv-demora').value = String(Math.min(240, Math.round(demora / 5) * 5));
  $('fv-puerta').replaceChildren(...PUERTAS[v.tipo].map((p) => {
    const op = crear('option', '', v.tipo === 'salida' ? `Puerta ${p}` : `Faja ${p}`);
    op.value = p;
    return op;
  }));
  $('fv-puerta').value = v.puerta;
  $('fv-nota').value = v.nota ?? '';
  dialogo.showModal();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = vueloEditado;
  const datos = {
    cancelado: $('fv-cancelado').checked,
    demora: Number($('fv-demora').value),
    puerta: $('fv-puerta').value,
    nota: $('fv-nota').value.trim().slice(0, 120) || null,
  };
  try {
    await conCarga(form.querySelector('button[type="submit"]'), () => guardarCambio(v, datos));
    const resumen = datos.cancelado ? 'cancelado' : `demora ${datos.demora} min, puerta ${datos.puerta}`;
    registrar(usuario, 'Cambio de vuelo', `${v.codigo} (${v.dia}): ${resumen}${datos.nota ? ` · ${datos.nota}` : ''}`);
    avisar(`Vuelo ${v.codigo} actualizado. El tablero ya muestra el cambio.`);
    dialogo.close();
    refrescar();
  } catch (error) {
    console.error(error);
    avisar('No se pudo guardar el cambio.', 'error');
  }
});

$('cancelar-vuelo').addEventListener('click', () => dialogo.close());

$('tabla-vuelos').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  const v = vuelos.find((x) => x.id === b.dataset.id);
  if (!v) return;
  if (b.dataset.accion !== 'quitar') {
    abrirEditor(v);
    return;
  }
  if (!confirm(`¿Quitar los cambios manuales del vuelo ${v.codigo}? Volverá a su horario del itinerario.`)) return;
  try {
    await conCarga(b, () => quitarCambio(v));
    registrar(usuario, 'Cambio de vuelo restablecido', `${v.codigo} (${v.dia})`);
    avisar(`Vuelo ${v.codigo} restablecido.`);
    refrescar();
  } catch (error) {
    console.error(error);
    avisar('No se pudo restablecer el vuelo.', 'error');
  }
});

async function refrescar() {
  try {
    await sql`SELECT 1 FROM vuelos_cambios LIMIT 1;`;
    tablaDisponible = true;
    $('aviso-tabla').hidden = true;
  } catch (error) {
    tablaDisponible = false;
    $('aviso-tabla').hidden = false;
    $('aviso-tabla').textContent = error.code === '42P01'
      ? 'Para editar vuelos falta ejecutar database/fase-5.sql en Neon. Mientras tanto ves el itinerario simulado.'
      : 'No se pudo conectar con la base de datos.';
  }
  await cargarCambios();
  vuelos = obtenerVuelos();
  const manuales = vuelos.filter((v) => v.manual).length;
  const demorados = vuelos.filter((v) => v.estado.clave === 'demorado').length;
  const cancelados = vuelos.filter((v) => v.estado.clave === 'cancelado').length;
  $('kpis').replaceChildren(...[['Vuelos en el tablero', vuelos.length], ['Demorados', demorados], ['Cancelados', cancelados], ['Con cambio manual', manuales]]
    .map(([n, val]) => {
      const div = crear('div', 'adm-kpi');
      div.append(crear('span', '', n), crear('strong', '', String(val)));
      return div;
    }));
  pintarTabla();
}

$('filtro-aerolinea').append(...Object.entries(AEROLINEAS).map(([codigo, a]) => {
  const op = crear('option', '', a.nombre);
  op.value = codigo;
  return op;
}));
['filtro-tipo', 'filtro-aerolinea'].forEach((id) => $(id).addEventListener('change', pintarTabla));
$('filtro-buscar').addEventListener('input', pintarTabla);

refrescar();
setInterval(() => {
  if (!document.hidden && !dialogo.open) refrescar();
}, 60000);
