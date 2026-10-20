// js/panel/estadisticas.js
// Gráficos para el administrador: reservas, ingresos, horas pico, medios de pago y estados
import { sql } from '../config/neon-config.js';
import { exigirRol } from '../auth/auth.js';
import { formatearSoles } from '../registro/tarifario.js';
import { graficoColumnas, graficoBarras } from './graficos.js';

const usuario = exigirRol('administrador');
if (!usuario) throw new Error('Acceso denegado');

const $ = (id) => document.getElementById(id);
const NOMBRES_METODO = {
  tarjeta_debito: 'Tarjeta de débito', tarjeta_credito: 'Tarjeta de crédito', billetera: 'Billetera',
  efectivo: 'Efectivo', pos: 'POS', sin_cargo: 'Sin cargo',
};
const soles = (n) => formatearSoles(n);

async function seguro(consulta, vacio) {
  try {
    return await consulta();
  } catch (error) {
    if (error.code !== '42P01' && error.code !== '42703') console.error(error);
    return vacio;
  }
}

function etiquetaDia(texto) {
  const d = new Date(`${texto}T12:00:00Z`);
  return {
    corta: d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }),
    larga: d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
  };
}

async function cargar() {
  const dias = Number($('periodo').value);
  const hoyIdx = dias - 1;

  // Reservas por día de entrada (fecha_hora_entrada se guarda en hora de Perú)
  const reservas = await sql`
    SELECT to_char(d, 'YYYY-MM-DD') AS dia, COUNT(r.id)::int AS total
    FROM generate_series((NOW() AT TIME ZONE 'America/Lima')::date - ${dias - 1}::int,
                         (NOW() AT TIME ZONE 'America/Lima')::date, INTERVAL '1 day') d
    LEFT JOIN reservas_estacionamiento r ON r.fecha_hora_entrada::date = d::date AND r.estado <> 'cancelado'
    GROUP BY d ORDER BY d;
  `;
  graficoColumnas($('g-reservas'), reservas.map((f, i) => {
    const e = etiquetaDia(f.dia);
    return { etiqueta: e.corta, etiquetaLarga: e.larga, valor: f.total, destacado: i === hoyIdx };
  }), { nombreValor: 'Reservas', formato: (n) => `${n}` });

  // Ingresos por día: pagos aprobados + ampliaciones (hora de Perú)
  const ingresos = await sql`
    SELECT to_char(d, 'YYYY-MM-DD') AS dia, COALESCE(SUM(p.monto), 0) AS total
    FROM generate_series((NOW() AT TIME ZONE 'America/Lima')::date - ${dias - 1}::int,
                         (NOW() AT TIME ZONE 'America/Lima')::date, INTERVAL '1 day') d
    LEFT JOIN pagos p ON p.estado = 'aprobado' AND (p.fecha_pago AT TIME ZONE 'America/Lima')::date = d::date
    GROUP BY d ORDER BY d;
  `;
  const ampliaciones = await seguro(() => sql`
    SELECT to_char((fecha AT TIME ZONE 'America/Lima')::date, 'YYYY-MM-DD') AS dia, SUM(monto) AS total
    FROM ampliaciones
    WHERE (fecha AT TIME ZONE 'America/Lima')::date > (NOW() AT TIME ZONE 'America/Lima')::date - ${dias}::int
    GROUP BY 1;`, []);
  const extra = Object.fromEntries(ampliaciones.map((a) => [a.dia, Number(a.total)]));
  const serieIngresos = ingresos.map((f, i) => {
    const e = etiquetaDia(f.dia);
    return { etiqueta: e.corta, etiquetaLarga: e.larga, valor: Number(f.total) + (extra[f.dia] ?? 0), destacado: i === hoyIdx };
  });
  graficoColumnas($('g-ingresos'), serieIngresos, { nombreValor: 'Ingresos', formato: soles });

  // Horas pico de entrada
  const horas = await sql`
    SELECT h AS hora, COUNT(r.id)::int AS total
    FROM generate_series(0, 23) h
    LEFT JOIN reservas_estacionamiento r
      ON EXTRACT(HOUR FROM r.fecha_hora_entrada) = h AND r.estado <> 'cancelado'
     AND r.fecha_hora_entrada::date > (NOW() AT TIME ZONE 'America/Lima')::date - ${dias}::int
    GROUP BY h ORDER BY h;
  `;
  graficoColumnas($('g-horas'), horas.map((f) => ({
    etiqueta: String(f.hora).padStart(2, '0'), etiquetaLarga: `${String(f.hora).padStart(2, '0')}:00 a ${String(f.hora).padStart(2, '0')}:59`, valor: f.total,
  })), { nombreValor: 'Entradas', formato: (n) => `${n}`, alto: 200 });

  // Medios de pago
  const medios = await sql`
    SELECT canal, metodo, SUM(monto) AS total FROM pagos
    WHERE estado = 'aprobado' AND (fecha_pago AT TIME ZONE 'America/Lima')::date > (NOW() AT TIME ZONE 'America/Lima')::date - ${dias}::int
    GROUP BY canal, metodo;
  `;
  graficoBarras($('g-medios'), medios.map((m) => ({
    etiqueta: `${NOMBRES_METODO[m.metodo] ?? m.metodo} · ${m.canal === 'pasarela' ? 'en línea' : 'ventanilla'}`,
    valor: Number(m.total),
  })), { nombreValor: 'Recaudado', formato: soles });

  // Estado de las reservas
  const estados = await sql`
    SELECT estado, estado_pago, COUNT(*)::int AS total FROM reservas_estacionamiento
    WHERE fecha_hora_entrada::date > (NOW() AT TIME ZONE 'America/Lima')::date - ${dias}::int
    GROUP BY estado, estado_pago;
  `;
  graficoBarras($('g-estados'), estados.map((e) => ({ etiqueta: `${e.estado} · pago ${e.estado_pago}`, valor: e.total })),
    { nombreValor: 'Reservas', formato: (n) => `${n}` });

  // Indicadores
  const totalIngresos = serieIngresos.reduce((s, d) => s + d.valor, 0);
  const totalReservas = reservas.reduce((s, d) => s + d.total, 0);
  const [pagosResumen] = await sql`
    SELECT COUNT(*)::int AS n, COALESCE(AVG(monto), 0) AS promedio,
           COUNT(*) FILTER (WHERE canal = 'pasarela')::int AS en_linea
    FROM pagos WHERE estado = 'aprobado'
      AND (fecha_pago AT TIME ZONE 'America/Lima')::date > (NOW() AT TIME ZONE 'America/Lima')::date - ${dias}::int;
  `;
  const [cupones] = await seguro(() => sql`
    SELECT COUNT(*)::int AS n, COALESCE(SUM(descuento), 0) AS total FROM pagos
    WHERE estado = 'aprobado' AND descuento > 0
      AND (fecha_pago AT TIME ZONE 'America/Lima')::date > (NOW() AT TIME ZONE 'America/Lima')::date - ${dias}::int;`, [{ n: 0, total: 0 }]);
  const [pedidos] = await seguro(() => sql`
    SELECT COUNT(*)::int AS n, COALESCE(SUM(total), 0) AS total FROM pedidos
    WHERE estado = 'entregado' AND (fecha AT TIME ZONE 'America/Lima')::date > (NOW() AT TIME ZONE 'America/Lima')::date - ${dias}::int;`, [{ n: 0, total: 0 }]);

  const pctLinea = pagosResumen.n ? Math.round((pagosResumen.en_linea / pagosResumen.n) * 100) : 0;
  const kpis = [
    ['Ingresos del periodo', soles(totalIngresos), 'Pagos y ampliaciones'],
    ['Reservas', String(totalReservas), `En ${dias} días`],
    ['Ticket promedio', soles(Number(pagosResumen.promedio)), `${pagosResumen.n} pagos`],
    ['Pagos en línea', `${pctLinea} %`, 'El resto, en ventanilla'],
    ['Descuentos por cupones', soles(Number(cupones.total)), `${cupones.n} cupones usados`],
    ['Pedidos de comida', soles(Number(pedidos.total)), `${pedidos.n} entregados`],
  ];
  $('kpis').replaceChildren(...kpis.map(([nombre, valor, detalle]) => {
    const div = document.createElement('div');
    div.className = 'adm-kpi';
    const a = document.createElement('span');
    a.textContent = nombre;
    const b = document.createElement('strong');
    b.textContent = valor;
    const c = document.createElement('small');
    c.textContent = detalle;
    div.append(a, b, c);
    return div;
  }));
}

// Rendimiento por persona: bitácora (fase 5), cobros en ventanilla y asistencia (fase 6)
async function cargarPersonal(dias) {
  const [personal, acciones, cobros, horas] = await Promise.all([
    sql`SELECT id, nombre, rol FROM usuarios WHERE rol IN ('administrador', 'empleado', 'cajero', 'seguridad') ORDER BY nombre;`,
    seguro(() => sql`
      SELECT usuario_id,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE accion IN ('Reserva creada', 'Reserva editada', 'Reserva atendida'))::int AS reservas,
             COUNT(*) FILTER (WHERE accion IN ('Entrada registrada', 'Salida registrada'))::int AS movimientos,
             COUNT(*) FILTER (WHERE accion LIKE 'Pedido %')::int AS pedidos
      FROM bitacora
      WHERE (fecha AT TIME ZONE 'America/Lima')::date > (NOW() AT TIME ZONE 'America/Lima')::date - ${dias}::int
      GROUP BY usuario_id;`, []),
    sql`
      SELECT id_cajero AS usuario_id, COUNT(*)::int AS n, COALESCE(SUM(monto), 0) AS total FROM pagos
      WHERE canal = 'caja' AND estado = 'aprobado' AND id_cajero IS NOT NULL
        AND (fecha_pago AT TIME ZONE 'America/Lima')::date > (NOW() AT TIME ZONE 'America/Lima')::date - ${dias}::int
      GROUP BY id_cajero;`,
    seguro(() => sql`
      SELECT usuario_id, COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(salida, NOW()) - entrada))) / 3600, 0) AS horas
      FROM asistencia
      WHERE (entrada AT TIME ZONE 'America/Lima')::date > (NOW() AT TIME ZONE 'America/Lima')::date - ${dias}::int
      GROUP BY usuario_id;`, []),
  ]);
  const por = (lista) => Object.fromEntries(lista.map((f) => [f.usuario_id, f]));
  const a = por(acciones);
  const c = por(cobros);
  const h = por(horas);
  const filas = personal.map((p) => ({
    ...p,
    acciones: a[p.id]?.total ?? 0,
    reservas: a[p.id]?.reservas ?? 0,
    movimientos: a[p.id]?.movimientos ?? 0,
    pedidos: a[p.id]?.pedidos ?? 0,
    cobros: c[p.id]?.n ?? 0,
    cobrado: Number(c[p.id]?.total ?? 0),
    horas: Number(h[p.id]?.horas ?? 0),
  }));

  graficoBarras($('g-personal'), filas.filter((f) => f.acciones > 0).map((f) => ({ etiqueta: f.nombre, valor: f.acciones })),
    { nombreValor: 'Acciones registradas', formato: (n) => `${n}` });

  const cuerpo = $('tabla-personal');
  if (!filas.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'celda-vacia';
    td.textContent = 'No hay cuentas del personal.';
    tr.append(td);
    cuerpo.replaceChildren(tr);
    return;
  }
  cuerpo.replaceChildren(...filas.map((f) => {
    const tr = document.createElement('tr');
    [f.nombre, f.rol, String(f.reservas), String(f.movimientos), String(f.pedidos),
      f.cobros ? `${f.cobros} · ${soles(f.cobrado)}` : '—', f.horas ? `${f.horas.toFixed(1)} h` : '—'].forEach((texto) => {
      const td = document.createElement('td');
      td.textContent = texto;
      tr.append(td);
    });
    return tr;
  }));
}

async function recargar() {
  try {
    await cargar();
    await cargarPersonal(Number($('periodo').value));
    $('error').hidden = true;
  } catch (error) {
    console.error(error);
    $('error').hidden = false;
  }
}

$('periodo').addEventListener('change', recargar);
recargar();
