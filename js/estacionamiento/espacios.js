// js/estacionamiento/espacios.js
// Entrada real del vehículo, espacio asignado y cobro por exceso de tiempo (fase 6)
import { sql } from '../config/neon-config.js';
import { calcularMontoServicio, redondear } from '../registro/tarifario.js';

export const PREFIJOS = { normal: 'A', vip: 'V', bus: 'B' };
export const TOLERANCIA_MINUTOS = 15; // minutos de gracia antes de cobrar exceso

export const zonaDe = (r) => (r.tipo_vehiculo === 'bus_camion' ? 'bus' : r.zona_vip ? 'vip' : 'normal');
export const codigoEspacio = (zona, i) => `${PREFIJOS[zona]}${String(i + 1).padStart(2, '0')}`;

// Espacios con un vehículo adentro ahora (entró y todavía no salió)
export async function espaciosOcupados() {
  try {
    const filas = await sql`
      SELECT espacio FROM reservas_estacionamiento
      WHERE espacio IS NOT NULL AND hora_entrada_real IS NOT NULL AND hora_salida_real IS NULL AND estado = 'registrado';
    `;
    return new Set(filas.map((f) => f.espacio));
  } catch (error) {
    if (error.code !== '42703') console.error(error);
    return new Set();
  }
}

export async function registrarEntrada(idRegistro, espacio) {
  const filas = await sql`
    UPDATE reservas_estacionamiento
    SET hora_entrada_real = NOW(), espacio = ${espacio}
    WHERE id = ${idRegistro} AND estado = 'registrado' AND hora_entrada_real IS NULL
    RETURNING id;
  `;
  return filas.length === 1;
}

// La fecha programada llega como Date o como texto "AAAA-MM-DD HH:MM:SS" (hora de Perú)
function aFecha(valor) {
  if (valor instanceof Date) return valor;
  return new Date(String(valor).replace(' ', 'T').slice(0, 19));
}

// Si el vehículo se quedó más de lo reservado (más la tolerancia), cuánto debe pagar
export function calcularExceso(r, ahora = new Date()) {
  const inicio = r.hora_entrada_real ? new Date(r.hora_entrada_real) : aFecha(r.fecha_hora_entrada);
  const minutosUsados = (ahora - inicio) / 60000;
  const minutosReservados = Number(r.horas) * 60;
  if (!(minutosUsados > minutosReservados + TOLERANCIA_MINUTOS)) return { horasExtra: 0, monto: 0 };
  const horasFacturables = Math.ceil(minutosUsados / 60);
  const horasExtra = horasFacturables - Math.ceil(Number(r.horas));
  const monto = redondear(Math.max(0, calcularMontoServicio({ ...r, horas: horasFacturables }) - Number(r.monto_calculado)));
  return { horasExtra: Math.max(horasExtra, 1), monto, horasFacturables };
}
