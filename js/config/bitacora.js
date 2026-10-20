// js/config/bitacora.js
// Registra en la bitácora lo que hace el personal (tabla "bitacora", fase 5).
// Nunca interrumpe la acción principal: si falla, solo se anota en la consola.
import { sql } from './neon-config.js';

export function registrar(usuario, accion, detalle = null) {
  if (!usuario) return Promise.resolve();
  return sql`
    INSERT INTO bitacora (usuario_id, usuario_nombre, rol, accion, detalle)
    VALUES (${usuario.id}, ${usuario.nombre}, ${usuario.rol}, ${accion}, ${detalle});
  `.catch((error) => {
    if (error.code !== '42P01') console.error('No se pudo registrar en la bitácora:', error);
  });
}
