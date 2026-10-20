// js/pago/pasarela.js
// Simula la pasarela: (1) consulta a la entidad emisora o billetera, (2) autoriza o rechaza,
// (3) si aprueba: descuenta saldo + registra el pago + marca la reserva, todo en UNA transacción.
import { sql } from '../config/neon-config.js';
import { soloDigitos, enmascararTarjeta, enmascararCelular, generarCodigoOperacion } from './validaciones.js';
import { redondear } from '../registro/tarifario.js';

// El monto SIEMPRE se lee de la base de datos, nunca del formulario
export async function obtenerRegistro(idRegistro, idUsuario) {
  const filas = await sql`
    SELECT id, codigo_seguimiento, placa, horas, tipo_vehiculo, zona_vip, fecha_hora_entrada,
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

// ---------- Cupones (fase 4: requieren database/fase-4.sql) ----------
// Devuelve { cupon, descuento } o { error }
export async function revisarCupon(codigo, monto) {
  const texto = String(codigo ?? '').trim().toUpperCase();
  if (!texto) return { error: 'Escribe un código de cupón.' };
  let filas;
  try {
    filas = await sql`
      SELECT codigo, descripcion, tipo, valor, monto_minimo, usos, usos_maximos, activo,
             (vence IS NOT NULL AND vence < (NOW() AT TIME ZONE 'America/Lima')::date) AS vencido
      FROM cupones WHERE codigo = ${texto};
    `;
  } catch (error) {
    if (error.code === '42P01') return { error: 'Los cupones aún no están activados (falta ejecutar database/fase-4.sql).' };
    throw error;
  }
  const c = filas[0];
  if (!c || !c.activo) return { error: 'El cupón no existe.' };
  if (c.vencido) return { error: 'El cupón ya venció.' };
  if (c.usos >= c.usos_maximos) return { error: 'El cupón ya se agotó.' };
  if (Number(monto) < Number(c.monto_minimo)) return { error: `Este cupón es para montos desde S/ ${Number(c.monto_minimo).toFixed(2)}.` };

  const descuento = c.tipo === 'porcentaje'
    ? redondear(Number(monto) * Number(c.valor) / 100)
    : Math.min(Number(c.valor), Number(monto));
  return { cupon: c.codigo, descripcion: c.descripcion, descuento: redondear(descuento) };
}

// Antes de cobrar se vuelve a leer la reserva (y el cupón): el monto o el estado pudieron cambiar
async function prepararCobro(idRegistro, usuario, codigoCupon) {
  const registro = await obtenerRegistro(idRegistro, usuario.id);
  if (!registro) return { error: 'No se encontró la solicitud.' };
  if (registro.estado === 'cancelado') return { error: 'La reserva está cancelada y no se puede pagar.' };
  if (registro.estado_pago !== 'pendiente') return { error: 'Esta solicitud ya fue pagada.' };
  if (!(Number(registro.monto_calculado) > 0)) return { error: 'La solicitud no tiene un monto por cobrar.' };

  let cupon = null;
  let descuento = 0;
  if (codigoCupon) {
    const revision = await revisarCupon(codigoCupon, registro.monto_calculado);
    if (revision.error) return { error: revision.error };
    ({ cupon, descuento } = revision);
  }
  const monto = redondear(Number(registro.monto_calculado) - descuento); // NUMERIC llega como texto
  return { registro, cupon, descuento, monto };
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
  if (error.constraint === 'cupones_usos_check') return 'El cupón se agotó justo ahora. Intenta sin cupón.';
  if (error.code === '23514') return 'Saldo insuficiente al momento de confirmar.'; // CHECK saldo >= 0
  if (error.code === '23505') return 'Esta solicitud ya fue pagada.';               // índice único
  return 'Error de comunicación con la entidad. No se realizó ningún cargo.';
}

// ---------- Entidad emisora y billeteras simuladas ----------
// Devuelven { ok, metodo, referencia, actualizarSaldo } o { ok: false, motivo, metodo, referencia }
async function autorizarTarjeta({ numero, mes, anio, cvv }, monto) {
  const pan = soloDigitos(numero);
  const referencia = enmascararTarjeta(pan); // solo se guardan los últimos 4 dígitos
  const filas = await sql`
    SELECT t.tipo, t.mes_venc, t.anio_venc, t.cvv, t.estado, c.id AS id_cuenta, c.saldo_disponible
    FROM banco_tarjetas t JOIN banco_cuentas c ON c.id = t.id_cuenta
    WHERE t.numero = ${pan};
  `;
  const tarjeta = filas[0];
  const metodo = tarjeta?.tipo === 'credito' ? 'tarjeta_credito' : 'tarjeta_debito';
  const rechazo = (motivo) => ({ ok: false, motivo, metodo, referencia });

  if (!tarjeta) return rechazo('Tarjeta no reconocida por la entidad emisora.');
  if (tarjeta.estado !== 'activa') return rechazo('Tarjeta bloqueada. Comunícate con tu entidad.');
  if (tarjeta.mes_venc !== mes || tarjeta.anio_venc !== anio) return rechazo('Fecha de vencimiento incorrecta.');
  if (tarjeta.cvv !== cvv) return rechazo('Código de seguridad incorrecto.');
  if (Number(tarjeta.saldo_disponible) < monto) {
    return rechazo(tarjeta.tipo === 'credito' ? 'Línea de crédito insuficiente.' : 'Saldo insuficiente en la cuenta de ahorros.');
  }
  return {
    ok: true, metodo, referencia,
    actualizarSaldo: sql`UPDATE banco_cuentas SET saldo_disponible = saldo_disponible - ${monto} WHERE id = ${tarjeta.id_cuenta};`,
  };
}

async function autorizarBilletera({ proveedor, celular, codigoAprobacion }, monto) {
  const cel = soloDigitos(celular);
  const referencia = enmascararCelular(cel);
  const filas = await sql`
    SELECT id, saldo_disponible, codigo_aprobacion
    FROM billeteras WHERE proveedor = ${proveedor} AND celular = ${cel};
  `;
  const billetera = filas[0];
  const rechazo = (motivo) => ({ ok: false, motivo, metodo: 'billetera', referencia });

  if (!billetera) return rechazo('El celular no está afiliado a esa billetera.');
  if (billetera.codigo_aprobacion !== codigoAprobacion) return rechazo('Código de aprobación incorrecto.');
  if (Number(billetera.saldo_disponible) < monto) return rechazo('Saldo insuficiente en la billetera.');
  return {
    ok: true, metodo: 'billetera', referencia,
    actualizarSaldo: sql`UPDATE billeteras SET saldo_disponible = saldo_disponible - ${monto} WHERE id = ${billetera.id};`,
  };
}

// Las sentencias se confirman juntas o no se confirma ninguna
function confirmarCobro({ actualizarSaldo, registro, usuario, codigo, metodo, proveedor = null, marca = null, referencia, monto, cupon, descuento }) {
  const insertarPago = cupon
    ? sql`INSERT INTO pagos (codigo_operacion, id_registro, id_usuario, canal, metodo, proveedor_billetera,
                             marca_tarjeta, referencia, monto, estado, cupon, descuento)
          VALUES (${codigo}, ${registro.id}, ${usuario.id}, 'pasarela', ${metodo}, ${proveedor},
                  ${marca}, ${referencia}, ${monto}, 'aprobado', ${cupon}, ${descuento});`
    : sql`INSERT INTO pagos (codigo_operacion, id_registro, id_usuario, canal, metodo,
                             proveedor_billetera, marca_tarjeta, referencia, monto, estado)
          VALUES (${codigo}, ${registro.id}, ${usuario.id}, 'pasarela', ${metodo},
                  ${proveedor}, ${marca}, ${referencia}, ${monto}, 'aprobado');`;
  const sentencias = [
    actualizarSaldo,
    insertarPago,
    sql`UPDATE reservas_estacionamiento
        SET estado_pago = 'pagado', canal_pago = 'pasarela', fecha_pago = NOW()
        WHERE id = ${registro.id} AND estado_pago = 'pendiente';`,
  ];
  if (cupon) sentencias.push(sql`UPDATE cupones SET usos = usos + 1 WHERE codigo = ${cupon};`);
  return sql.transaction(sentencias);
}

async function cobrar(preparado, usuario, autorizacion, extra) {
  const { registro, cupon, descuento, monto } = preparado;
  const base = { registro, usuario, metodo: autorizacion.metodo, referencia: autorizacion.referencia, ...extra };
  if (!autorizacion.ok) return registrarRechazo({ ...base, motivo: autorizacion.motivo });

  const codigo = generarCodigoOperacion('OP');
  try {
    await confirmarCobro({ ...base, actualizarSaldo: autorizacion.actualizarSaldo, codigo, monto, cupon, descuento });
    return { aprobado: true, codigo };
  } catch (error) {
    console.error(error);
    return registrarRechazo({ ...base, motivo: motivoDesdeError(error) });
  }
}

export async function pagarConTarjeta({ idRegistro, usuario, numero, mes, anio, cvv, marca, cupon = null }) {
  const preparado = await prepararCobro(idRegistro, usuario, cupon);
  if (preparado.error) return { aprobado: false, motivo: preparado.error };
  const autorizacion = await autorizarTarjeta({ numero, mes, anio, cvv }, preparado.monto);
  return cobrar(preparado, usuario, autorizacion, { marca });
}

export async function pagarConBilletera({ idRegistro, usuario, proveedor, celular, codigoAprobacion, cupon = null }) {
  const preparado = await prepararCobro(idRegistro, usuario, cupon);
  if (preparado.error) return { aprobado: false, motivo: preparado.error };
  const autorizacion = await autorizarBilletera({ proveedor, celular, codigoAprobacion }, preparado.monto);
  return cobrar(preparado, usuario, autorizacion, { proveedor });
}

// ---------- Ampliación de estadía (fase 4) ----------
// "forma" = { tipo: 'tarjeta', numero, mes, anio, cvv, marca } o { tipo: 'billetera', proveedor, celular, codigoAprobacion }
// La diferencia se calcula afuera con el tarifario y aquí se vuelve a validar contra la base de datos
export async function pagarAmpliacion({ idRegistro, usuario, horasExtra, montoEsperado, calcularNuevoTotal, forma }) {
  const registro = await obtenerRegistro(idRegistro, usuario.id);
  if (!registro) return { aprobado: false, motivo: 'No se encontró la reserva.' };
  if (registro.estado !== 'registrado' || registro.estado_pago !== 'pagado') {
    return { aprobado: false, motivo: 'Solo se puede ampliar una reserva pagada que todavía no se atendió.' };
  }
  const nuevasHoras = Number(registro.horas) + Number(horasExtra);
  const monto = redondear(Math.max(0, calcularNuevoTotal({ ...registro, horas: nuevasHoras }) - Number(registro.monto_calculado)));
  if (Math.abs(monto - montoEsperado) > 0.009) {
    return { aprobado: false, motivo: 'El monto cambió. Revisa el nuevo total e inténtalo otra vez.' };
  }

  let autorizacion = { ok: true, metodo: 'sin_cargo', referencia: null, actualizarSaldo: null };
  if (monto > 0) {
    autorizacion = forma.tipo === 'tarjeta'
      ? await autorizarTarjeta(forma, monto)
      : await autorizarBilletera(forma, monto);
    if (!autorizacion.ok) return { aprobado: false, motivo: autorizacion.motivo };
  }

  const codigo = generarCodigoOperacion('AMP');
  const sentencias = [
    sql`INSERT INTO ampliaciones (codigo_operacion, id_registro, id_usuario, horas_extra, monto, metodo,
                                  proveedor_billetera, marca_tarjeta, referencia)
        VALUES (${codigo}, ${registro.id}, ${usuario.id}, ${Number(horasExtra)}, ${monto}, ${autorizacion.metodo},
                ${forma?.proveedor ?? null}, ${forma?.marca ?? null}, ${autorizacion.referencia});`,
    sql`UPDATE reservas_estacionamiento
        SET horas = ${nuevasHoras}, monto_calculado = monto_calculado + ${monto}
        WHERE id = ${registro.id} AND estado = 'registrado' AND estado_pago = 'pagado';`,
  ];
  if (autorizacion.actualizarSaldo) sentencias.unshift(autorizacion.actualizarSaldo);

  try {
    await sql.transaction(sentencias);
    return { aprobado: true, codigo, monto, nuevasHoras };
  } catch (error) {
    console.error(error);
    if (error.code === '42P01') return { aprobado: false, motivo: 'Las ampliaciones aún no están activadas (falta ejecutar database/fase-4.sql).' };
    return { aprobado: false, motivo: motivoDesdeError(error) };
  }
}
