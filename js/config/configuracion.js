// js/config/configuracion.js
// Lee la configuración que el administrador edita en el panel (tabla "configuracion", fase 5)
// y la aplica al tarifario. Si la tabla aún no existe, se usan los valores por defecto.
import { sql } from './neon-config.js';
import { aplicarTarifas } from '../registro/tarifario.js';

export const CAPACIDAD_POR_DEFECTO = { normal: 60, vip: 20, bus: 8 };

let promesa = null;

// Se consulta una sola vez por página; las siguientes llamadas reutilizan el resultado
export function cargarConfiguracion() {
  if (!promesa) {
    promesa = sql`SELECT clave, valor FROM configuracion;`
      .then((filas) => {
        const config = Object.fromEntries(filas.map((f) => [f.clave, typeof f.valor === 'string' ? JSON.parse(f.valor) : f.valor]));
        if (config.tarifas) aplicarTarifas(config.tarifas);
        return { capacidad: { ...CAPACIDAD_POR_DEFECTO, ...(config.capacidad ?? {}) }, tarifas: config.tarifas ?? null };
      })
      .catch((error) => {
        if (error.code !== '42P01') console.error(error);
        return { capacidad: { ...CAPACIDAD_POR_DEFECTO }, tarifas: null };
      });
  }
  return promesa;
}

export async function guardarConfiguracion(clave, valor, idUsuario) {
  await sql`
    INSERT INTO configuracion (clave, valor, actualizado_por, fecha)
    VALUES (${clave}, ${JSON.stringify(valor)}::jsonb, ${idUsuario}, NOW())
    ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_por = EXCLUDED.actualizado_por, fecha = NOW();
  `;
  promesa = null;
}
