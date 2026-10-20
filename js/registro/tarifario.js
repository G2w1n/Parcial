// js/registro/tarifario.js
// Regla de negocio del caso 21 (estacionamiento): funciones PURAS, sin DOM ni base de datos.
// Prueba en la consola: calcularMontoServicio({ horas: '3.5', tipo_vehiculo: 'auto', zona_vip: 'on' })  ->  43

export const TARIFA_POR_HORA = 7.00;     // S/ por hora o fracción
export const RECARGO_BUS_CAMION = 0.5;   // +50 % si es bus o camión
export const ADICIONAL_ZONA_VIP = 15.00; // S/ fijos por zona techada VIP
export const HORAS_MAXIMAS = 240;        // 10 días

// Tarifas especiales (fase 4)
export const TARIFA_DIA_COMPLETO = 60.00;       // S/ por cada 24 h; también es el tope de un mismo día
export const TARIFA_NOCTURNA = 20.00;           // S/ fijos si entra entre las 22:00 y las 05:59 y se queda hasta 8 h
export const HORAS_NOCTURNA = 8;
export const DESCUENTO_FIN_DE_SEMANA = 0.10;    // -10 % si entra sábado o domingo

export function redondear(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export function formatearSoles(monto) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(monto);
}

// Un checkbox marcado llega en FormData como 'on'; si no está marcado, NO llega
export const marcado = (valor) => valor === 'on' || valor === true;

// "3.5 horas" se cobra como 4 (hora o fracción). Si el dato no es válido devuelve 0
export function horasFacturables(horas) {
  const h = Number(horas);
  return Number.isFinite(h) && h > 0 ? Math.ceil(h) : 0;
}

// Hora y día de la semana de la entrada. Acepta "AAAA-MM-DDTHH:MM" (del formulario),
// "AAAA-MM-DD HH:MM:SS" o un Date (de la base de datos). Sin fecha devuelve null
export function datosEntrada(fecha) {
  if (!fecha) return null;
  if (fecha instanceof Date) {
    return Number.isNaN(fecha.getTime()) ? null : { hora: fecha.getHours(), diaSemana: fecha.getDay() };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(fecha));
  if (!m) return null;
  const diaSemana = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return { hora: Number(m[4]), diaSemana };
}

const esNocturna = (entrada) => entrada !== null && (entrada.hora >= 22 || entrada.hora < 6);
const esFinDeSemana = (entrada) => entrada !== null && (entrada.diaSemana === 0 || entrada.diaSemana === 6);

// Costo del estacionamiento sin recargos, con la tarifa que más le conviene al cliente
function tarifaBase(horas, entrada) {
  const dias = Math.floor(horas / 24);
  const resto = horas % 24;
  if (dias >= 1) {
    const adicional = Math.min(resto * TARIFA_POR_HORA, TARIFA_DIA_COMPLETO);
    return { tipo: 'dia', dias, resto, base: dias * TARIFA_DIA_COMPLETO + adicional, adicional };
  }
  const porHora = horas * TARIFA_POR_HORA;
  if (esNocturna(entrada) && horas <= HORAS_NOCTURNA && TARIFA_NOCTURNA < porHora) {
    return { tipo: 'nocturna', base: TARIFA_NOCTURNA };
  }
  if (porHora > TARIFA_DIA_COMPLETO) return { tipo: 'tope', base: TARIFA_DIA_COMPLETO };
  return { tipo: 'hora', base: porHora };
}

// Explica el cálculo línea por línea (se muestra al cliente y en el comprobante)
export function desglosarMonto(d) {
  const horas = Number(d.horas);
  const facturables = horasFacturables(d.horas);
  const lineas = [];
  if (facturables === 0) return { lineas, total: 0, nota: '' };

  const entrada = datosEntrada(d.fecha_hora_entrada);
  const t = tarifaBase(facturables, entrada);

  if (t.tipo === 'dia') {
    lineas.push({ etiqueta: `Tarifa por día (${t.dias} × ${formatearSoles(TARIFA_DIA_COMPLETO)})`, valor: redondear(t.dias * TARIFA_DIA_COMPLETO) });
    if (t.resto > 0) {
      lineas.push({ etiqueta: `Horas adicionales (${t.resto} h, máximo ${formatearSoles(TARIFA_DIA_COMPLETO)})`, valor: redondear(t.adicional) });
    }
  } else if (t.tipo === 'nocturna') {
    lineas.push({ etiqueta: `Tarifa nocturna (22:00 a 06:00, hasta ${HORAS_NOCTURNA} h)`, valor: TARIFA_NOCTURNA });
  } else if (t.tipo === 'tope') {
    lineas.push({ etiqueta: `Estacionamiento (${facturables} h, tope diario)`, valor: TARIFA_DIA_COMPLETO });
  } else {
    lineas.push({ etiqueta: `Estacionamiento (${facturables} h × ${formatearSoles(TARIFA_POR_HORA)})`, valor: redondear(t.base) });
  }

  let base = t.base;
  if (esFinDeSemana(entrada)) {
    const descuento = redondear(base * DESCUENTO_FIN_DE_SEMANA);
    lineas.push({ etiqueta: `Descuento fin de semana (-${Math.round(DESCUENTO_FIN_DE_SEMANA * 100)} %)`, valor: -descuento });
    base -= descuento;
  }
  if (d.tipo_vehiculo === 'bus_camion') {
    lineas.push({ etiqueta: `Recargo bus o camión (+${Math.round(RECARGO_BUS_CAMION * 100)} %)`, valor: redondear(base * RECARGO_BUS_CAMION) });
  }
  if (marcado(d.zona_vip)) {
    lineas.push({ etiqueta: 'Zona techada VIP', valor: ADICIONAL_ZONA_VIP });
  }

  const nota = horas !== facturables ? `${horas} h se cobra como ${facturables} h (hora o fracción).` : '';
  const total = redondear(lineas.reduce((suma, l) => suma + l.valor, 0));
  return { lineas, total, nota };
}

export function calcularMontoServicio(d) {
  return desglosarMonto(d).total;
}

export const NOMBRES_VEHICULO = { auto: 'Auto', bus_camion: 'Bus o camión' };

// Para mostrar una reserva ya guardada: si se registró con otra tarifa (antes de las tarifas especiales),
// se muestra el monto guardado en una sola línea para que el detalle siempre sume lo que se cobra
export function desglosarGuardado(d, montoGuardado) {
  const desglose = desglosarMonto(d);
  const guardado = Number(montoGuardado);
  if (!Number.isFinite(guardado) || Math.abs(desglose.total - guardado) < 0.01) return desglose;
  return {
    lineas: [{ etiqueta: `Estacionamiento (${Number(d.horas)} h, tarifa al reservar)`, valor: guardado }],
    total: guardado,
    nota: '',
  };
}
