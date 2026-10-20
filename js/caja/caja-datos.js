// js/caja/caja-datos.js
// Consultas del módulo de caja a Neon. No tocan el DOM: así se pueden probar por separado.
import { sql } from '../config/neon-config.js';
import { redondear } from '../registro/tarifario.js';
import { generarCodigoOperacion } from '../pago/validaciones.js';

// Lo que escribe el cajero se busca como texto literal (sin comodines % ni _)
const escaparLike = (texto) => texto.replace(/[\\%_]/g, '\\$&');

// Busca por código, placa, DNI o nombre (sin importar mayúsculas ni tildes)
export async function buscarPendientes(criterio = '') {
  const patron = `%${escaparLike(criterio.trim())}%`;
  return await sql`
    SELECT r.id, r.usuario_id, r.codigo_seguimiento, r.placa, r.monto_calculado, r.fecha_registro,
           COALESCE(u.nombre, r.nombre_pasajero) AS cliente, u.dni
    FROM reservas_estacionamiento r
    LEFT JOIN usuarios u ON u.id = r.usuario_id   -- LEFT: incluye reservas creadas en el panel
    WHERE r.estado_pago = 'pendiente' AND r.estado <> 'cancelado'
      AND (   r.codigo_seguimiento ILIKE ${patron}
           OR r.placa ILIKE ${patron}
           OR u.dni ILIKE ${patron}
           OR translate(COALESCE(u.nombre, ''), 'ÁÉÍÓÚÑáéíóúñ', 'AEIOUNaeioun')
              ILIKE translate(${patron}, 'ÁÉÍÓÚÑáéíóúñ', 'AEIOUNaeioun')
           OR translate(COALESCE(r.nombre_pasajero, ''), 'ÁÉÍÓÚÑáéíóúñ', 'AEIOUNaeioun')
              ILIKE translate(${patron}, 'ÁÉÍÓÚÑáéíóúñ', 'AEIOUNaeioun'))
    ORDER BY r.fecha_registro ASC
    LIMIT 50;
  `;
}

// El monto se vuelve a leer de la base en el momento de cobrar (la tabla en pantalla puede estar vieja)
export async function obtenerPendiente(idRegistro) {
  const filas = await sql`
    SELECT id, usuario_id, codigo_seguimiento, placa, monto_calculado
    FROM reservas_estacionamiento
    WHERE id = ${idRegistro} AND estado_pago = 'pendiente' AND estado <> 'cancelado';
  `;
  return filas[0] ?? null;
}

export const METODOS_CAJA = {
  efectivo: { metodo: 'efectivo', proveedor: null },
  pos: { metodo: 'pos', proveedor: null },
  andipay: { metodo: 'billetera', proveedor: 'andipay' },
  pagomovil: { metodo: 'billetera', proveedor: 'pagomovil' },
};

export async function cobrarPresencial({ idRegistro, opcion, montoRecibido, referencia, idCajero }) {
  const forma = METODOS_CAJA[opcion];
  if (!forma) throw new Error('Medio de pago no válido.');

  const registro = await obtenerPendiente(idRegistro);
  if (!registro) throw new Error('Esta solicitud ya fue pagada o fue cancelada.');

  const monto = Number(registro.monto_calculado);
  let recibido = null;
  let vuelto = null;
  let ref;

  if (forma.metodo === 'efectivo') {
    const dinero = Number(montoRecibido);
    if (!(dinero >= monto)) throw new Error('El monto recibido es menor que el total.');
    if (dinero > 99999) throw new Error('El monto recibido es demasiado alto.');
    recibido = redondear(dinero);
    vuelto = redondear(recibido - monto);
    ref = 'Efectivo';
  } else {
    ref = (forma.metodo === 'pos' ? 'Voucher ' : 'Op. ') + String(referencia ?? '').trim();
  }

  const codigo = generarCodigoOperacion('CJ');

  // Las dos sentencias se confirman juntas o no se confirma ninguna
  await sql.transaction([
    sql`INSERT INTO pagos (codigo_operacion, id_registro, id_usuario, canal, metodo, proveedor_billetera,
                           referencia, monto, monto_recibido, vuelto, estado, id_cajero)
        VALUES (${codigo}, ${registro.id}, ${registro.usuario_id}, 'caja', ${forma.metodo}, ${forma.proveedor},
                ${ref}, ${monto}, ${recibido}, ${vuelto}, 'aprobado', ${idCajero});`,
    sql`UPDATE reservas_estacionamiento
        SET estado_pago = 'pagado', canal_pago = 'caja', fecha_pago = NOW()
        WHERE id = ${registro.id} AND estado_pago = 'pendiente';`,
  ]);

  return { codigo, vuelto, monto };
}

// Pagos de la pasarela de una fecha, en hora de Lima (aprobados y rechazados)
export async function listarPagosEnLinea(fecha, soloPorVerificar = false) {
  return await sql`
    SELECT p.id, p.codigo_operacion, p.metodo, p.proveedor_billetera, p.marca_tarjeta, p.referencia,
           p.monto, p.estado, p.motivo_rechazo, p.verificado, p.fecha_pago,
           r.codigo_seguimiento, r.placa, COALESCE(u.nombre, r.nombre_pasajero) AS cliente,
           v.nombre AS verificador
    FROM pagos p
    JOIN reservas_estacionamiento r ON r.id = p.id_registro
    LEFT JOIN usuarios u ON u.id = p.id_usuario
    LEFT JOIN usuarios v ON v.id = p.verificado_por
    WHERE p.canal = 'pasarela'
      AND (p.fecha_pago AT TIME ZONE 'America/Lima')::date = ${fecha}::date
      AND (${soloPorVerificar}::boolean = false OR (p.estado = 'aprobado' AND p.verificado = false))
    ORDER BY p.fecha_pago DESC;
  `;
}

// Devuelve true si se verificó ahora; false si ya estaba verificado o no corresponde
export async function verificarPago(idPago, idCajero) {
  const filas = await sql`
    UPDATE pagos
    SET verificado = true, verificado_por = ${idCajero}, fecha_verificacion = NOW()
    WHERE id = ${idPago} AND canal = 'pasarela' AND estado = 'aprobado' AND verificado = false
    RETURNING id;
  `;
  return filas.length === 1;
}

export async function resumenDelDia(fecha) {
  return await sql`
    SELECT canal, metodo, COUNT(*)::int AS operaciones, SUM(monto) AS total
    FROM pagos
    WHERE estado = 'aprobado' AND (fecha_pago AT TIME ZONE 'America/Lima')::date = ${fecha}::date
    GROUP BY canal, metodo
    ORDER BY canal, metodo;
  `;
}

// Control de salida (garita): ¿esta reserva tiene el pase habilitado? Busca por código o placa exactos
export async function consultarSalida(criterio) {
  const texto = (criterio ?? '').trim();
  if (!texto) return [];
  return await sql`
    SELECT r.id, r.usuario_id, r.codigo_seguimiento, r.placa, r.nombre_pasajero, r.horas, r.tipo_vehiculo,
           r.zona_vip, r.monto_calculado, r.estado, r.estado_pago,
           p.codigo_operacion, p.canal, p.fecha_pago, p.verificado
    FROM reservas_estacionamiento r
    LEFT JOIN pagos p ON p.id_registro = r.id AND p.estado = 'aprobado'
    WHERE UPPER(r.codigo_seguimiento) = UPPER(${texto}) OR UPPER(r.placa) = UPPER(${texto})
    ORDER BY r.fecha_registro DESC
    LIMIT 5;
  `;
}
// ---------- Fase 5 ----------
// Placas bloqueadas (lista negra). Si la tabla aún no existe, no hay placas bloqueadas
export async function placasBloqueadas(placas) {
  const lista = [...new Set(placas.filter(Boolean).map((p) => p.toUpperCase()))];
  if (lista.length === 0) return {};
  try {
    const filas = await sql`SELECT placa, motivo, deuda FROM lista_negra WHERE activo AND placa = ANY(${lista});`;
    return Object.fromEntries(filas.map((f) => [f.placa, f]));
  } catch (error) {
    if (error.code !== '42P01') console.error(error);
    return {};
  }
}

// La garita marca la reserva como "atendido" cuando el vehículo sale (solo si está pagada)
export async function registrarSalida(idRegistro, idUsuario) {
  const filas = await sql`
    UPDATE reservas_estacionamiento
    SET estado = 'atendido', gestionado_por = ${idUsuario}, fecha_gestion = NOW()
    WHERE id = ${idRegistro} AND estado = 'registrado' AND estado_pago IN ('pagado', 'exonerado')
    RETURNING id;
  `;
  return filas.length === 1;
}

// Ampliaciones de estadía cobradas en línea en la fecha (se suman al cierre de caja)
export async function ampliacionesDelDia(fecha) {
  try {
    return await sql`
      SELECT metodo, COUNT(*)::int AS operaciones, SUM(monto) AS total FROM ampliaciones
      WHERE monto > 0 AND (fecha AT TIME ZONE 'America/Lima')::date = ${fecha}::date
      GROUP BY metodo ORDER BY metodo;
    `;
  } catch (error) {
    if (error.code !== '42P01') console.error(error);
    return [];
  }
}

// Total descontado con cupones en la fecha
export async function descuentosDelDia(fecha) {
  try {
    const [fila] = await sql`
      SELECT COUNT(*)::int AS cupones, COALESCE(SUM(descuento), 0) AS total FROM pagos
      WHERE estado = 'aprobado' AND descuento > 0 AND (fecha_pago AT TIME ZONE 'America/Lima')::date = ${fecha}::date;
    `;
    return { cupones: fila.cupones, total: Number(fila.total) };
  } catch (error) {
    if (error.code !== '42703' && error.code !== '42P01') console.error(error);
    return { cupones: 0, total: 0 };
  }
}
