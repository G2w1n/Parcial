// js/panel/pedidos-admin.js
// Gestión de pedidos para recoger: el personal los pasa de Recibido -> Preparando -> Listo -> Entregado
import { sql } from '../config/neon-config.js';
import { exigirRol } from '../auth/auth.js';
import { avisar, conCarga } from '../config/ui.js';
import { formatearSoles } from '../registro/tarifario.js';
import { registrar } from '../config/bitacora.js';
import { normalizar } from '../vuelos/datos-vuelos.js';

const usuario = exigirRol('administrador', 'empleado');
if (!usuario) throw new Error('Acceso denegado');

const $ = (id) => document.getElementById(id);
const SIGUIENTE = { recibido: 'preparando', preparando: 'listo', listo: 'entregado' };
const TEXTO_BOTON = { recibido: 'Empezar a preparar', preparando: 'Marcar listo', listo: 'Entregado' };
const CHIP = { recibido: 'adm-chip-azul', preparando: 'adm-chip-ambar', listo: 'adm-chip-verde', entregado: '', cancelado: 'adm-chip-rojo' };

let pedidos = [];

const crear = (etiqueta, clase, texto) => {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
};

// Pedidos de hoy (hora de Perú) y los de días anteriores que siguen sin entregar
async function cargarPedidos() {
  return sql`
    SELECT id, codigo, restaurante, items, total, nombre, celular, hora_recojo, estado, fecha
    FROM pedidos
    WHERE (fecha AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date
       OR estado IN ('recibido', 'preparando', 'listo')
    ORDER BY CASE estado WHEN 'listo' THEN 0 WHEN 'preparando' THEN 1 WHEN 'recibido' THEN 2 ELSE 3 END, hora_recojo, fecha;
  `;
}

async function cambiarEstado(pedido, nuevo) {
  const filas = await sql`
    UPDATE pedidos SET estado = ${nuevo}
    WHERE codigo = ${pedido.codigo} AND estado = ${pedido.estado}
    RETURNING id;
  `;
  if (filas.length === 0) throw new Error('Otra persona cambió este pedido. Se recargó la lista.');
  registrar(usuario, `Pedido ${nuevo}`, `${pedido.codigo} · ${pedido.restaurante} · ${pedido.nombre}`);
}

function pintarKpis() {
  const contar = (estado) => pedidos.filter((p) => p.estado === estado).length;
  const vendido = pedidos.filter((p) => p.estado === 'entregado').reduce((s, p) => s + Number(p.total), 0);
  const datos = [
    ['Por preparar', contar('recibido')],
    ['Preparando', contar('preparando')],
    ['Listos para recoger', contar('listo')],
    ['Entregados hoy', contar('entregado')],
    ['Vendido hoy', formatearSoles(vendido)],
  ];
  $('kpis').replaceChildren(...datos.map(([nombre, valor]) => {
    const div = crear('div', 'adm-kpi');
    div.append(crear('span', '', nombre), crear('strong', '', String(valor)));
    return div;
  }));
}

function pintarTabla() {
  const filtroEstado = $('filtro-estado').value;
  const filtroRest = $('filtro-restaurante').value;
  const buscado = normalizar($('filtro-buscar').value);
  const visibles = pedidos.filter((p) =>
    (filtroEstado === 'todos' || (filtroEstado === 'activos' ? SIGUIENTE[p.estado] : p.estado === filtroEstado))
    && (!filtroRest || p.restaurante === filtroRest)
    && (!buscado || normalizar(`${p.codigo} ${p.nombre} ${p.celular}`).includes(buscado)));

  const cuerpo = $('tabla-pedidos');
  if (visibles.length === 0) {
    const tr = crear('tr');
    const td = crear('td', 'celda-vacia', 'No hay pedidos con estos filtros.');
    td.colSpan = 8;
    tr.append(td);
    cuerpo.replaceChildren(tr);
    return;
  }
  cuerpo.replaceChildren(...visibles.map((p) => {
    const tr = crear('tr');
    const items = (typeof p.items === 'string' ? JSON.parse(p.items) : p.items)
      .map((it) => `${it.cantidad} × ${it.nombre}`).join(', ');
    const hora = new Date(p.fecha).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' });
    const cliente = crear('td');
    cliente.append(crear('strong', '', p.nombre), crear('br'), crear('small', '', p.celular));
    const estado = crear('td');
    estado.append(crear('span', `adm-chip ${CHIP[p.estado] ?? ''}`, p.estado));
    const acciones = crear('td');
    const caja = crear('div', 'acciones');
    if (SIGUIENTE[p.estado]) {
      const avanzar = crear('button', `adm-btn${p.estado === 'listo' ? ' adm-btn-ok' : ''}`, TEXTO_BOTON[p.estado]);
      avanzar.type = 'button';
      avanzar.dataset.codigo = p.codigo;
      avanzar.dataset.accion = 'avanzar';
      const cancelar = crear('button', 'adm-btn adm-btn-peligro', 'Cancelar');
      cancelar.type = 'button';
      cancelar.dataset.codigo = p.codigo;
      cancelar.dataset.accion = 'cancelar';
      caja.append(avanzar, cancelar);
    } else {
      caja.textContent = '—';
    }
    acciones.append(caja);
    tr.append(crear('td', '', p.codigo), crear('td', '', `${hora} → ${p.hora_recojo}`), cliente,
      crear('td', '', p.restaurante), crear('td', '', items), crear('td', '', formatearSoles(Number(p.total))), estado, acciones);
    return tr;
  }));
}

async function refrescar() {
  try {
    pedidos = await cargarPedidos();
    $('aviso-tabla').hidden = true;
  } catch (error) {
    if (error.code === '42P01') {
      $('aviso-tabla').hidden = false;
      $('aviso-tabla').textContent = 'Los pedidos aún no están activados: falta ejecutar database/fase-4.sql en Neon.';
      pedidos = [];
    } else {
      console.error(error);
      avisar('No se pudieron cargar los pedidos.', 'error');
    }
  }
  const restaurantes = [...new Set(pedidos.map((p) => p.restaurante))].sort();
  const elegido = $('filtro-restaurante').value;
  $('filtro-restaurante').replaceChildren(crear('option', '', 'Todos los restaurantes'), ...restaurantes.map((r) => {
    const op = crear('option', '', r);
    op.value = r;
    return op;
  }));
  $('filtro-restaurante').options[0].value = '';
  $('filtro-restaurante').value = restaurantes.includes(elegido) ? elegido : '';
  pintarKpis();
  pintarTabla();
  $('ultima-actualizacion').textContent = new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima' });
}

$('tabla-pedidos').addEventListener('click', async (e) => {
  const boton = e.target.closest('button[data-accion]');
  if (!boton) return;
  const pedido = pedidos.find((p) => p.codigo === boton.dataset.codigo);
  if (!pedido) return;
  const nuevo = boton.dataset.accion === 'cancelar' ? 'cancelado' : SIGUIENTE[pedido.estado];
  if (nuevo === 'cancelado' && !confirm(`¿Cancelar el pedido ${pedido.codigo} de ${pedido.nombre}?`)) return;
  try {
    await conCarga(boton, () => cambiarEstado(pedido, nuevo));
    avisar(`Pedido ${pedido.codigo}: ${nuevo}.`);
  } catch (error) {
    console.error(error);
    avisar(error.message || 'No se pudo cambiar el estado.', 'error');
  }
  refrescar();
});

['filtro-estado', 'filtro-restaurante'].forEach((id) => $(id).addEventListener('change', pintarTabla));
$('filtro-buscar').addEventListener('input', pintarTabla);
$('btn-actualizar').addEventListener('click', refrescar);

const buscarUrl = new URLSearchParams(location.search).get('buscar');
if (buscarUrl) {
  $('filtro-buscar').value = buscarUrl;
  $('filtro-estado').value = 'todos';
}
refrescar();
setInterval(() => {
  if (!document.hidden) refrescar();
}, 20000);
