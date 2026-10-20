// js/panel/reclamos-admin.js
// Casos del libro de reclamaciones: ponerlos en revisión y responderlos
import { sql } from '../config/neon-config.js';
import { exigirRol } from '../auth/auth.js';
import { avisar, conCarga, formatearFecha } from '../config/ui.js';
import { registrar } from '../config/bitacora.js';

const usuario = exigirRol('administrador');
if (!usuario) throw new Error('Acceso denegado');

const $ = (id) => document.getElementById(id);
const ESTADOS = { abierto: ['Nuevo', 'adm-chip-azul'], en_revision: ['En revisión', 'adm-chip-ambar'], resuelto: ['Respondido', 'adm-chip-verde'] };
const TIPOS = { reclamo: 'Reclamo', queja: 'Queja', sugerencia: 'Sugerencia' };
let reclamos = [];

const crear = (etiqueta, clase, texto) => {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
};

// Días hábiles (lunes a viernes) que pasaron desde que se registró
function diasHabiles(desde) {
  let dias = 0;
  const d = new Date(desde);
  const hoy = new Date();
  while (d < hoy) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6 && d <= hoy) dias++;
  }
  return dias;
}

async function cargar() {
  try {
    reclamos = await sql`SELECT * FROM reclamos ORDER BY CASE estado WHEN 'resuelto' THEN 1 ELSE 0 END, fecha DESC LIMIT 300;`;
    $('aviso-tabla').hidden = true;
  } catch (error) {
    reclamos = [];
    $('aviso-tabla').hidden = false;
    $('aviso-tabla').textContent = error.code === '42P01'
      ? 'El libro de reclamaciones virtual se activa al ejecutar database/fase-6.sql en Neon.'
      : 'No se pudieron cargar los reclamos.';
  }
  const pendientes = reclamos.filter((r) => r.estado !== 'resuelto');
  const vencidos = pendientes.filter((r) => diasHabiles(r.fecha) > 15).length;
  $('kpis').replaceChildren(...[
    ['Sin responder', pendientes.length], ['Fuera de plazo (más de 15 días hábiles)', vencidos],
    ['Respondidos', reclamos.length - pendientes.length],
  ].map(([n, v]) => {
    const div = crear('div', 'adm-kpi');
    div.append(crear('span', '', n), crear('strong', '', String(v)));
    return div;
  }));
  pintar();
}

function pintar() {
  const estado = $('filtro-estado').value;
  const tipo = $('filtro-tipo').value;
  const visibles = reclamos.filter((r) => (!tipo || r.tipo === tipo)
    && (!estado || (estado === 'pendientes' ? r.estado !== 'resuelto' : r.estado === estado)));
  if (visibles.length === 0) {
    $('lista-reclamos').replaceChildren(crear('li', 'adm-nota', 'No hay casos con estos filtros.'));
    return;
  }
  $('lista-reclamos').replaceChildren(...visibles.map((r) => {
    const li = crear('li', 'reclamo');
    const cab = crear('div', 'reclamo-cab');
    const [texto, chip] = ESTADOS[r.estado];
    const dias = diasHabiles(r.fecha);
    cab.append(crear('strong', '', `${r.codigo} · ${TIPOS[r.tipo]}`), crear('span', `adm-chip ${chip}`, texto));
    if (r.estado !== 'resuelto') cab.append(crear('span', `adm-chip ${dias > 15 ? 'adm-chip-rojo' : ''}`, `${dias} día(s) hábil(es)`));
    const quien = crear('p', 'reclamo-quien', `${r.nombre}${r.documento ? ` · ${r.documento}` : ''} · ${r.correo} · ${formatearFecha(r.fecha)}`);
    const detalle = crear('p', 'reclamo-detalle', r.detalle);
    li.append(cab, quien, detalle);
    if (r.pedido) li.append(crear('p', 'reclamo-pedido', `Pide: ${r.pedido}`));

    if (r.estado === 'resuelto') {
      li.append(crear('blockquote', 'reclamo-respuesta', r.respuesta ?? ''), crear('small', 'adm-nota', `Respondido el ${formatearFecha(r.fecha_respuesta)}`));
    } else {
      const form = crear('form', 'reclamo-form');
      form.dataset.codigo = r.codigo;
      const area = crear('textarea');
      area.name = 'respuesta';
      area.rows = 3;
      area.maxLength = 1000;
      area.placeholder = 'Respuesta para el cliente';
      area.setAttribute('aria-label', `Respuesta al caso ${r.codigo}`);
      const botones = crear('div', 'acciones');
      if (r.estado === 'abierto') {
        const revisar = crear('button', 'adm-btn adm-btn-borde', 'Marcar en revisión');
        revisar.type = 'button';
        revisar.dataset.accion = 'revision';
        botones.append(revisar);
      }
      const enviar = crear('button', 'adm-btn adm-btn-acento', 'Responder y cerrar');
      enviar.type = 'submit';
      botones.append(enviar);
      form.append(area, botones);
      li.append(form);
    }
    return li;
  }));
}

$('lista-reclamos').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-accion="revision"]');
  if (!b) return;
  const codigo = b.closest('form').dataset.codigo;
  try {
    await conCarga(b, () => sql`UPDATE reclamos SET estado = 'en_revision' WHERE codigo = ${codigo} AND estado = 'abierto';`);
    registrar(usuario, 'Reclamo en revisión', codigo);
    cargar();
  } catch (error) {
    console.error(error);
    avisar('No se pudo actualizar el caso.', 'error');
  }
});

$('lista-reclamos').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const respuesta = form.elements.respuesta.value.trim();
  if (respuesta.length < 10) return avisar('Escribe una respuesta de al menos 10 caracteres.', 'error');
  try {
    await conCarga(form.querySelector('button[type="submit"]'), () => sql`
      UPDATE reclamos SET estado = 'resuelto', respuesta = ${respuesta.slice(0, 1000)},
                          respondido_por = ${usuario.id}, fecha_respuesta = NOW()
      WHERE codigo = ${form.dataset.codigo};
    `);
    registrar(usuario, 'Reclamo respondido', form.dataset.codigo);
    avisar(`Caso ${form.dataset.codigo} respondido.`);
    cargar();
  } catch (error) {
    console.error(error);
    avisar('No se pudo guardar la respuesta.', 'error');
  }
});

['filtro-estado', 'filtro-tipo'].forEach((id) => $(id).addEventListener('change', pintar));
cargar();
