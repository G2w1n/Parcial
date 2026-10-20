// js/panel/bitacora-admin.js
// Bitácora de actividad: quién hizo qué y cuándo (filtros por persona, rol, acción y fecha)
import { sql } from '../config/neon-config.js';
import { exigirRol } from '../auth/auth.js';
import { formatearFecha } from '../config/ui.js';
import { normalizar } from '../vuelos/datos-vuelos.js';
import { descargarExcel } from '../config/excel.js';

const usuario = exigirRol('administrador');
if (!usuario) throw new Error('Acceso denegado');

const $ = (id) => document.getElementById(id);
const CHIP_ROL = { administrador: 'adm-chip-azul', empleado: 'adm-chip-verde', cajero: 'adm-chip-ambar', seguridad: 'adm-chip-rojo' };
let registros = [];

const crear = (etiqueta, clase, texto) => {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
};

async function cargar() {
  const fecha = $('filtro-fecha').value;
  try {
    registros = await sql`
      SELECT usuario_nombre, rol, accion, detalle, fecha FROM bitacora
      WHERE (fecha AT TIME ZONE 'America/Lima')::date = ${fecha}::date
      ORDER BY fecha DESC LIMIT 500;
    `;
    $('aviso-tabla').hidden = true;
  } catch (error) {
    registros = [];
    $('aviso-tabla').hidden = false;
    $('aviso-tabla').textContent = error.code === '42P01'
      ? 'La bitácora se activa al ejecutar database/fase-5.sql en Neon.'
      : 'No se pudo cargar la bitácora.';
  }
  const personas = [...new Set(registros.map((r) => r.usuario_nombre))].sort();
  const elegido = $('filtro-persona').value;
  $('filtro-persona').replaceChildren(crear('option', '', 'Todo el personal'), ...personas.map((p) => {
    const op = crear('option', '', p);
    op.value = p;
    return op;
  }));
  $('filtro-persona').options[0].value = '';
  $('filtro-persona').value = personas.includes(elegido) ? elegido : '';
  pintar();
}

function filtrados() {
  const persona = $('filtro-persona').value;
  const rol = $('filtro-rol').value;
  const buscado = normalizar($('filtro-buscar').value);
  return registros.filter((r) => (!persona || r.usuario_nombre === persona) && (!rol || r.rol === rol)
    && (!buscado || normalizar(`${r.accion} ${r.detalle ?? ''}`).includes(buscado)));
}

function pintar() {
  const visibles = filtrados();
  $('contador').textContent = `${visibles.length} acción(es)`;
  const cuerpo = $('tabla-bitacora');
  if (visibles.length === 0) {
    const tr = crear('tr');
    const td = crear('td', 'celda-vacia', 'No hay actividad registrada con estos filtros.');
    td.colSpan = 5;
    tr.append(td);
    cuerpo.replaceChildren(tr);
    return;
  }
  cuerpo.replaceChildren(...visibles.map((r) => {
    const tr = crear('tr');
    const rolTd = crear('td');
    rolTd.append(crear('span', `adm-chip ${CHIP_ROL[r.rol] ?? ''}`, r.rol));
    tr.append(crear('td', '', formatearFecha(r.fecha)), crear('td', '', r.usuario_nombre), rolTd,
      crear('td', '', r.accion), crear('td', '', r.detalle ?? '—'));
    return tr;
  }));
}

$('filtro-fecha').value = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
$('filtro-fecha').addEventListener('change', cargar);
['filtro-persona', 'filtro-rol'].forEach((id) => $(id).addEventListener('change', pintar));
$('filtro-buscar').addEventListener('input', pintar);
// Exporta lo que se ve en pantalla (con los filtros aplicados)
$('btn-excel-bitacora').addEventListener('click', () => {
  const fecha = $('filtro-fecha').value;
  descargarExcel(`bitacora_${fecha}.xlsx`, [{
    nombre: 'Bitácora',
    columnas: ['Fecha y hora', 'Persona', 'Rol', 'Acción', 'Detalle'],
    filas: filtrados().map((r) => [formatearFecha(r.fecha), r.usuario_nombre, r.rol, r.accion, r.detalle ?? '']),
  }]);
});
cargar();
