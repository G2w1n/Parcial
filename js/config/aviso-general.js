// js/config/aviso-general.js
// Muestra arriba de cada página el aviso general vigente que publica el administrador (tabla "avisos")
import { sql } from './neon-config.js';

const CLAVE_CERRADOS = 'qorikancha.avisosCerrados';
const ICONOS = { info: 'ℹ️', alerta: '⚠️', urgente: '🚨' };

function cerrados() {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE_CERRADOS)) ?? [];
  } catch {
    return [];
  }
}

export async function mostrarAvisoGeneral() {
  let filas;
  try {
    filas = await sql`
      SELECT id, mensaje, tipo FROM avisos
      WHERE activo AND (hasta IS NULL OR hasta > NOW())
      ORDER BY CASE tipo WHEN 'urgente' THEN 0 WHEN 'alerta' THEN 1 ELSE 2 END, fecha DESC
      LIMIT 1;
    `;
  } catch (error) {
    if (error.code !== '42P01') console.error(error);
    return;
  }
  const aviso = filas[0];
  if (!aviso || cerrados().includes(aviso.id)) return;

  const barra = document.createElement('div');
  barra.className = `aviso-general aviso-general-${aviso.tipo}`;
  barra.setAttribute('role', aviso.tipo === 'urgente' ? 'alert' : 'status');
  const contenido = document.createElement('div');
  contenido.className = 'wrap aviso-general-contenido';
  const icono = document.createElement('span');
  icono.setAttribute('aria-hidden', 'true');
  icono.textContent = ICONOS[aviso.tipo] ?? ICONOS.info;
  const texto = document.createElement('p');
  texto.textContent = aviso.mensaje; // textContent: el aviso nunca se interpreta como HTML
  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'aviso-general-cerrar';
  cerrar.setAttribute('aria-label', 'Cerrar aviso');
  cerrar.textContent = '×';
  cerrar.addEventListener('click', () => {
    barra.remove();
    try {
      sessionStorage.setItem(CLAVE_CERRADOS, JSON.stringify([...cerrados(), aviso.id]));
    } catch {
      // Sin almacenamiento: el aviso volverá a aparecer en la siguiente página
    }
  });
  contenido.append(icono, texto, cerrar);
  barra.append(contenido);
  const cabecera = document.querySelector('.site-header');
  if (cabecera) cabecera.after(barra);
  else document.body.prepend(barra);
}
