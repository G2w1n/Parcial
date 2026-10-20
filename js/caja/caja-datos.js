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
    SELECT r.*, p.codigo_operacion, p.canal, p.fecha_pago, p.verificado
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
  let filas;
  try {
    filas = await sql`
      UPDATE reservas_estacionamiento
      SET estado = 'atendido', gestionado_por = ${idUsuario}, fecha_gestion = NOW(), hora_salida_real = NOW()
      WHERE id = ${idRegistro} AND estado = 'registrado' AND estado_pago IN ('pagado', 'exonerado')
      RETURNING id;
    `;
  } catch (error) {
    if (error.code !== '42703') throw error;
    // Sin las columnas de la fase 6 se registra la salida como antes
    filas = await sql`
      UPDATE reservas_estacionamiento
      SET estado = 'atendido', gestionado_por = ${idUsuario}, fecha_gestion = NOW()
      WHERE id = ${idRegistro} AND estado = 'registrado' AND estado_pago IN ('pagado', 'exonerado')
      RETURNING id;
    `;
  }
  return filas.length === 1;
}

// Cobro en caja del tiempo que el vehículo se quedó de más (se guarda como ampliación de tipo "exceso")
export async function cobrarExceso({ registro, exceso, opcion, idCajero }) {
  const forma = METODOS_CAJA[opcion];
  if (!forma) throw new Error('Medio de pago no válido.');
  const codigo = generarCodigoOperacion('EXC');
  try {
    await sql.transaction([
      sql`INSERT INTO ampliaciones (codigo_operacion, id_registro, id_usuario, horas_extra, monto, metodo,
                                    proveedor_billetera, referencia, tipo, id_cajero)
          VALUES (${codigo}, ${registro.id}, ${registro.usuario_id ?? null}, ${exceso.horasExtra}, ${exceso.monto},
                  ${forma.metodo}, ${forma.proveedor}, 'Exceso de tiempo', 'exceso', ${idCajero});`,
      sql`UPDATE reservas_estacionamiento
          SET horas = ${exceso.horasFacturables}, monto_calculado = monto_calculado + ${exceso.monto}
          WHERE id = ${registro.id} AND estado = 'registrado';`,
    ]);
  } catch (error) {
    if (error.code === '42703' || error.code === '42P01') throw new Error('El cobro de exceso se activa al ejecutar database/fase-6.sql.');
    throw error;
  }
  return codigo;
}

// Ampliaciones de estadía cobradas en línea en la fecha (se suman al cierre de caja)
// Ampliaciones (en línea) y excesos de tiempo (cobrados en caja, fase 6) de la fecha
export async function ampliacionesDelDia(fecha) {
  try {
    return await sql`
      SELECT tipo, metodo, COUNT(*)::int AS operaciones, SUM(monto) AS total FROM ampliaciones
      WHERE monto > 0 AND (fecha AT TIME ZONE 'America/Lima')::date = ${fecha}::date
      GROUP BY tipo, metodo ORDER BY tipo, metodo;
    `;
  } catch (error) {
    if (error.code === '42703') {
      // Antes de la fase 6 no existe la columna "tipo": todo es ampliación en línea
      return sql`
        SELECT 'ampliacion' AS tipo, metodo, COUNT(*)::int AS operaciones, SUM(monto) AS total FROM ampliaciones
        WHERE monto > 0 AND (fecha AT TIME ZONE 'America/Lima')::date = ${fecha}::date
        GROUP BY metodo ORDER BY metodo;
      `;
    }
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

// ---------- Fase 6: sesiones de caja, arqueo y anulaciones ----------
// Devuelve la caja abierta del cajero, null si no tiene, o undefined si la tabla aún no existe
export async function cajaAbierta(idCajero) {
  try {
    const filas = await sql`SELECT * FROM cajas WHERE cajero_id = ${idCajero} AND estado = 'abierta';`;
    return filas[0] ?? null;
  } catch (error) {
    if (error.code === '42P01') return undefined;
    throw error;
  }
}

export async function abrirCaja(idCajero, montoInicial) {
  const filas = await sql`
    INSERT INTO cajas (cajero_id, monto_inicial) VALUES (${idCajero}, ${montoInicial}) RETURNING *;
  `;
  return filas[0];
}

// Efectivo que debería haber en el cajón: fondo inicial + cobros en efectivo (incluye excesos) desde la apertura
export async function efectivoEsperado(caja) {
  const [cobros] = await sql`
    SELECT COALESCE(SUM(monto), 0) AS total FROM pagos
    WHERE id_cajero = ${caja.cajero_id} AND metodo = 'efectivo' AND estado = 'aprobado' AND fecha_pago >= ${caja.apertura};
  `;
  let excesos = 0;
  try {
    const [fila] = await sql`
      SELECT COALESCE(SUM(monto), 0) AS total FROM ampliaciones
      WHERE id_cajero = ${caja.cajero_id} AND metodo = 'efectivo' AND fecha >= ${caja.apertura};
    `;
    excesos = Number(fila.total);
  } catch (error) {
    if (error.code !== '42703') throw error;
  }
  return Number(caja.monto_inicial) + Number(cobros.total) + excesos;
}

export async function cerrarCaja(idCaja, { esperado, contado, detalle, nota }) {
  const filas = await sql`
    UPDATE cajas SET cierre = NOW(), efectivo_esperado = ${esperado}, efectivo_contado = ${contado},
                     diferencia = ${contado - esperado}, detalle_conteo = ${JSON.stringify(detalle)}::jsonb,
                     nota = ${nota}, estado = 'cerrada'
    WHERE id = ${idCaja} AND estado = 'abierta'
    RETURNING *;
  `;
  return filas[0] ?? null;
}

// Cobros en ventanilla del cajero en la fecha (aprobados y anulados)
export async function cobrosDelCajero(idCajero, fecha) {
  return sql`
    SELECT p.id, p.codigo_operacion, p.metodo, p.proveedor_billetera, p.monto, p.estado, p.fecha_pago,
           r.id AS id_registro, r.codigo_seguimiento, r.placa
    FROM pagos p JOIN reservas_estacionamiento r ON r.id = p.id_registro
    WHERE p.canal = 'caja' AND p.id_cajero = ${idCajero} AND p.estado IN ('aprobado', 'anulado')
      AND (p.fecha_pago AT TIME ZONE 'America/Lima')::date = ${fecha}::date
    ORDER BY p.fecha_pago DESC;
  `;
}

// Pago aprobado de una reserva (para devolverlo)
export async function pagoDeReserva(idRegistro) {
  const filas = await sql`
    SELECT id, codigo_operacion, metodo, monto, canal FROM pagos
    WHERE id_registro = ${idRegistro} AND estado = 'aprobado' ORDER BY fecha_pago DESC LIMIT 1;
  `;
  return filas[0] ?? null;
}

// Anulación (error de cobro: la reserva vuelve a "pendiente") o devolución (la reserva se cancela)
export async function anularPago({ pago, idRegistro, tipo, motivo, autorizadoPor, idCajero }) {
  const reserva = tipo === 'devolucion'
    ? sql`UPDATE reservas_estacionamiento SET estado = 'cancelado', estado_pago = 'pendiente', canal_pago = NULL, fecha_pago = NULL
          WHERE id = ${idRegistro} AND estado = 'registrado';`
    : sql`UPDATE reservas_estacionamiento SET estado_pago = 'pendiente', canal_pago = NULL, fecha_pago = NULL
          WHERE id = ${idRegistro} AND estado = 'registrado';`;
  try {
    await sql.transaction([
      sql`UPDATE pagos SET estado = 'anulado' WHERE id = ${pago.id} AND estado = 'aprobado';`,
      reserva,
      sql`INSERT INTO anulaciones (codigo_operacion, tipo, monto, metodo, motivo, cajero_id, autorizado_por)
          VALUES (${pago.codigo_operacion}, ${tipo}, ${pago.monto}, ${pago.metodo}, ${motivo}, ${idCajero}, ${autorizadoPor});`,
    ]);
  } catch (error) {
    if (error.code === '23514' || error.code === '42P01') throw new Error('Las anulaciones se activan al ejecutar database/fase-6.sql.');
    throw error;
  }
}
