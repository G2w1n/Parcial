// js/vuelos/cambios.js
// Trae de la base de datos los cambios manuales de vuelos (demoras, cancelaciones, puertas) de hoy y mañana
// y los aplica al itinerario simulado. Si la tabla aún no existe, el tablero sigue con lo simulado.
import { sql } from '../config/neon-config.js';
import { establecerCambios } from './datos-vuelos.js';

export async function cargarCambios() {
  try {
    const filas = await sql`
      SELECT codigo_vuelo, to_char(dia, 'YYYY-MM-DD') AS dia, cancelado, demora_minutos, puerta, nota
      FROM vuelos_cambios
      WHERE dia BETWEEN (NOW() AT TIME ZONE 'America/Lima')::date AND (NOW() AT TIME ZONE 'America/Lima')::date + 1;
    `;
    const cambios = Object.fromEntries(filas.map((f) => [`${f.dia}|${f.codigo_vuelo}`, f]));
    establecerCambios(cambios);
    return cambios;
  } catch (error) {
    if (error.code !== '42P01') console.error(error);
    return {};
  }
}
