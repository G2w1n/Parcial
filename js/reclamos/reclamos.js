// js/reclamos/reclamos.js
// Libro de reclamaciones virtual: registrar un reclamo, queja o sugerencia y consultar su estado con el código
import { sql } from '../config/neon-config.js';
import { avisar, conCarga, formatearFecha } from '../config/ui.js';

const $ = (id) => document.getElementById(id);
const ESTADOS = { abierto: 'Recibido', en_revision: 'En revisión', resuelto: 'Respondido' };

const sinTabla = (error) => error.code === '42P01';

$('form-reclamo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const error = $('rc-error');
  error.textContent = '';
  if (d.nombre.trim().length < 3) return void (error.textContent = 'Escribe tu nombre completo.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo)) return void (error.textContent = 'Escribe un correo válido para enviarte la respuesta.');
  if (d.documento && !/^[A-Za-z0-9]{8,12}$/.test(d.documento)) return void (error.textContent = 'El documento tiene de 8 a 12 letras o números.');
  if (d.detalle.trim().length < 15) return void (error.textContent = 'Cuéntanos qué pasó (al menos 15 caracteres).');
  if (!d.acepto) return void (error.textContent = 'Confirma que los datos son verdaderos.');

  const anio = new Date().getFullYear();
  const codigo = `LR-${anio}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  try {
    await conCarga(e.target.querySelector('button[type="submit"]'), () => sql`
      INSERT INTO reclamos (codigo, tipo, nombre, documento, correo, detalle, pedido)
      VALUES (${codigo}, ${d.tipo}, ${d.nombre.trim().slice(0, 80)}, ${d.documento || null}, ${d.correo.trim().slice(0, 120)},
              ${d.detalle.trim().slice(0, 1000)}, ${d.pedido.trim().slice(0, 300) || null});
    `);
    e.target.reset();
    const caja = $('rc-confirmacion');
    caja.replaceChildren();
    const titulo = document.createElement('strong');
    titulo.textContent = `✓ Registrado con el código ${codigo}`;
    const texto = document.createElement('span');
    texto.textContent = 'Guárdalo: con él puedes consultar el estado. Respondemos en un máximo de 15 días hábiles.';
    caja.append(titulo, texto);
    caja.hidden = false;
    $('consulta-codigo').value = codigo;
    avisar('Tu registro fue enviado.');
  } catch (err) {
    console.error(err);
    error.textContent = sinTabla(err)
      ? 'El libro virtual aún no está activado. Pide el libro físico en el módulo de información (nivel 1).'
      : 'No se pudo enviar. Intenta de nuevo.';
  }
});

$('form-consulta').addEventListener('submit', async (e) => {
  e.preventDefault();
  const codigo = $('consulta-codigo').value.trim().toUpperCase();
  const resultado = $('consulta-resultado');
  if (!codigo) return;
  resultado.replaceChildren();
  try {
    const [r] = await sql`
      SELECT codigo, tipo, estado, respuesta, fecha, fecha_respuesta FROM reclamos WHERE codigo = ${codigo};
    `;
    if (!r) {
      resultado.textContent = 'No encontramos ese código. Revisa que esté bien escrito (ej. LR-2026-ABC12).';
      return;
    }
    const cab = document.createElement('p');
    const chip = document.createElement('span');
    chip.className = `estado-reclamo estado-${r.estado}`;
    chip.textContent = ESTADOS[r.estado];
    cab.append(chip, ` ${r.tipo} registrado el ${formatearFecha(r.fecha)}`);
    resultado.append(cab);
    if (r.respuesta) {
      const respuesta = document.createElement('blockquote');
      respuesta.textContent = r.respuesta; // textContent: la respuesta nunca se interpreta como HTML
      const fecha = document.createElement('small');
      fecha.textContent = `Respondido el ${formatearFecha(r.fecha_respuesta)}`;
      resultado.append(respuesta, fecha);
    }
  } catch (err) {
    console.error(err);
    resultado.textContent = sinTabla(err) ? 'El libro virtual aún no está activado.' : 'No se pudo consultar. Intenta de nuevo.';
  }
});

const codigoUrl = new URLSearchParams(location.search).get('codigo');
if (codigoUrl) {
  $('consulta-codigo').value = codigoUrl;
  $('form-consulta').requestSubmit();
}
