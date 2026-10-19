// js/pago/pasarela.js
// Simula la pasarela: (1) consulta a la entidad emisora o billetera, (2) autoriza o rechaza,
// (3) si aprueba: descuenta saldo + registra el pago + marca la reserva, todo en UNA transacción.
import { sql } from '../config/neon-config.js';
import { soloDigitos, enmascararTarjeta, enmascararCelular, generarCodigoOperacion } from './validaciones.js';

// El monto SIEMPRE se lee de la base de datos, nunca del formulario
export async function obtenerRegistro(idRegistro, idUsuario) {
  const filas = await sql`
    SELECT id, codigo_seguimiento, placa, horas, tipo_vehiculo, zona_vip,
           monto_calculado, estado, estado_pago
    FROM reservas_estacionamiento
    WHERE id = ${idRegistro} AND usuario_id = ${idUsuario};
  `;
  return filas[0] ?? null;
}

// Reservas que el cliente todavía puede pagar (las canceladas no se cobran)
export async function listarPendientesCliente(idUsuario) {
  return await sql`
    SELECT id, codigo_seguimiento, placa, monto_calculado
    FROM reservas_estacionamiento
    WHERE usuario_id = ${idUsuario} AND estado_pago = 'pendiente' AND estado <> 'cancelado'
    ORDER BY fecha_registro DESC;
  `;
}

// Antes de cobrar se vuelve a leer la reserva: el monto o el estado pudieron cambiar
async function prepararCobro(idRegistro, usuario) {
  const registro = await obtenerRegistro(idRegistro, usuario.id);
  if (!registro) return { error: 'No se encontró la solicitud.' };
  if (registro.estado === 'cancelado') return { error: 'La reserva está cancelada y no se puede pagar.' };
  if (registro.estado_pago !== 'pendiente') return { error: 'Esta solicitud ya fue pagada.' };
  if (!(Number(registro.monto_calculado) > 0)) return { error: 'La solicitud no tiene un monto por cobrar.' };
  return { registro };
}

// Todo intento rechazado también se guarda: el cajero y el auditor deben verlo
async function registrarRechazo({ registro, usuario, metodo, proveedor = null, marca = null, referencia, motivo }) {
  const codigo = generarCodigoOperacion('RCH');
  await sql`
    INSERT INTO pagos (codigo_operacion, id_registro, id_usuario, canal, metodo,
                       proveedor_billetera, marca_tarjeta, referencia, monto, estado, motivo_rechazo)
    VALUES (${codigo}, ${registro.id}, ${usuario.id}, 'pasarela', ${metodo},
            ${proveedor}, ${marca}, ${referencia}, ${registro.monto_calculado}, 'rechazado', ${motivo});
  `;
  return { aprobado: false, codigo, motivo };
}

// Traduce errores de PostgreSQL a mensajes para el usuario
function motivoDesdeError(error) {
  if (error.code === '23514') return 'Saldo insuficiente al momento de confirmar.'; // CHECK saldo >= 0
  if (error.code === '23505') return 'Esta solicitud ya fue pagada.';               // índice único
  return 'Error de comunicación con la entidad. No se realizó ningún cargo.';
}

// Las tres sentencias se confirman juntas o no se confirma ninguna
function confirmarCobro({ actualizarSaldo, registro, usuario, codigo, metodo, proveedor = null, marca = null, referencia, monto }) {
  return sql.transaction([
    actualizarSaldo,
    sql`INSERT INTO pagos (codigo_operacion, id_registro, id_usuario, canal, metodo,
                           proveedor_billetera, marca_tarjeta, referencia, monto, estado)
        VALUES (${codigo}, ${registro.id}, ${usuario.id}, 'pasarela', ${metodo},
                ${proveedor}, ${marca}, ${referencia}, ${monto}, 'aprobado');`,
    sql`UPDATE reservas_estacionamiento
        SET estado_pago = 'pagado', canal_pago = 'pasarela', fecha_pago = NOW()
        WHERE id = ${registro.id} AND estado_pago = 'pendiente';`,
  ]);
}

export async function pagarConTarjeta({ idRegistro, usuario, numero, mes, anio, cvv, marca }) {
  const preparado = await prepararCobro(idRegistro, usuario);
  if (preparado.error) return { aprobado: false, motivo: preparado.error };
  const { registro } = preparado;

  const pan = soloDigitos(numero);
  const referencia = enmascararTarjeta(pan); // en "pagos" solo se guardan los últimos 4

  const filas = await sql`
    SELECT t.tipo, t.mes_venc, t.anio_venc, t.cvv, t.estado, c.id AS id_cuenta, c.saldo_disponible
    FROM banco_tarjetas t JOIN banco_cuentas c ON c.id = t.id_cuenta
    WHERE t.numero = ${pan};
  `;
  const tarjeta = filas[0];
  const metodo = tarjeta?.tipo === 'credito' ? 'tarjeta_credito' : 'tarjeta_debito';
  const base = { registro, usuario, metodo, marca, referencia };
  const monto = Number(registro.monto_calculado); // NUMERIC llega como texto: convertir

  if (!tarjeta) return registrarRechazo({ ...base, motivo: 'Tarjeta no reconocida por la entidad emisora.' });
  if (tarjeta.estado !== 'activa') return registrarRechazo({ ...base, motivo: 'Tarjeta bloqueada. Comunícate con tu entidad.' });
  if (tarjeta.mes_venc !== mes || tarjeta.anio_venc !== anio) return registrarRechazo({ ...base, motivo: 'Fecha de vencimiento incorrecta.' });
  if (tarjeta.cvv !== cvv) return registrarRechazo({ ...base, motivo: 'Código de seguridad incorrecto.' });
  if (Number(tarjeta.saldo_disponible) < monto) {
    const motivo = tarjeta.tipo === 'credito' ? 'Línea de crédito insuficiente.' : 'Saldo insuficiente en la cuenta de ahorros.';
    return registrarRechazo({ ...base, motivo });
  }

  const codigo = generarCodigoOperacion('OP');
  try {
    await confirmarCobro({
      ...base, codigo, monto,
      actualizarSaldo: sql`UPDATE banco_cuentas SET saldo_disponible = saldo_disponible - ${monto} WHERE id = ${tarjeta.id_cuenta};`,
    });
    return { aprobado: true, codigo };
  } catch (error) {
    console.error(error);
    return registrarRechazo({ ...base, motivo: motivoDesdeError(error) });
  }
}

export async function pagarConBilletera({ idRegistro, usuario, proveedor, celular, codigoAprobacion }) {
  const preparado = await prepararCobro(idRegistro, usuario);
  if (preparado.error) return { aprobado: false, motivo: preparado.error };
  const { registro } = preparado;

  const cel = soloDigitos(celular);
  const base = { registro, usuario, metodo: 'billetera', proveedor, referencia: enmascararCelular(cel) };
  const monto = Number(registro.monto_calculado);

  const filas = await sql`
    SELECT id, saldo_disponible, codigo_aprobacion
    FROM billeteras WHERE proveedor = ${proveedor} AND celular = ${cel};
  `;
  const billetera = filas[0];

  if (!billetera) return registrarRechazo({ ...base, motivo: 'El celular no está afiliado a esa billetera.' });
  if (billetera.codigo_aprobacion !== codigoAprobacion) return registrarRechazo({ ...base, motivo: 'Código de aprobación incorrecto.' });
  if (Number(billetera.saldo_disponible) < monto) return registrarRechazo({ ...base, motivo: 'Saldo insuficiente en la billetera.' });

  const codigo = generarCodigoOperacion('OP');
  try {
    await confirmarCobro({
      ...base, codigo, monto,
      actualizarSaldo: sql`UPDATE billeteras SET saldo_disponible = saldo_disponible - ${monto} WHERE id = ${billetera.id};`,
    });
    return { aprobado: true, codigo };
  } catch (error) {
    console.error(error);
    return registrarRechazo({ ...base, motivo: motivoDesdeError(error) });
  }
}