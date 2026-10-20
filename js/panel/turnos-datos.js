// js/panel/turnos-datos.js
// Turnos planificados (tabla "turnos", fase 6): mañana, tarde y noche
import { sql } from '../config/neon-config.js';

export const TURNOS = {
  manana: { nombre: 'Mañana', horario: '06:00 – 14:00' },
  tarde: { nombre: 'Tarde', horario: '14:00 – 22:00' },
  noche: { nombre: 'Noche', horario: '22:00 – 06:00' },
};

const dos = (n) => String(n).padStart(2, '0');
export const textoFecha = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

// Los 7 días (lunes a domingo) de la semana que contiene "base", desplazada "semanas" semanas
export function diasDeSemana(semanas = 0, base = new Date()) {
  const lunes = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7) + semanas * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    return d;
  });
}

export async function turnosEntre(desde, hasta, idUsuario = null) {
  return idUsuario
    ? sql`SELECT usuario_id, to_char(fecha, 'YYYY-MM-DD') AS fecha, turno FROM turnos
          WHERE usuario_id = ${idUsuario} AND fecha BETWEEN ${desde}::date AND ${hasta}::date;`
    : sql`SELECT usuario_id, to_char(fecha, 'YYYY-MM-DD') AS fecha, turno FROM turnos
          WHERE fecha BETWEEN ${desde}::date AND ${hasta}::date;`;
}
