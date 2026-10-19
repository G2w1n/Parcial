// js/registro/tarifario.js
// Regla de negocio del caso 21 (estacionamiento): funciones PURAS, sin DOM ni base de datos.
// Prueba en la consola: calcularMontoServicio({ horas: '3.5', tipo_vehiculo: 'auto', zona_vip: 'on' })  ->  43

export const TARIFA_POR_HORA = 7.00;     // S/ por hora o fracción
export const RECARGO_BUS_CAMION = 0.5;   // +50 % si es bus o camión
export const ADICIONAL_ZONA_VIP = 15.00; // S/ fijos por zona techada VIP
export const HORAS_MAXIMAS = 240;        // 10 días

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

export function calcularMontoServicio(d) {
  const horas = horasFacturables(d.horas);
  if (horas === 0) return 0;

  let total = TARIFA_POR_HORA * horas;
  if (d.tipo_vehiculo === 'bus_camion') total *= 1 + RECARGO_BUS_CAMION;
  if (marcado(d.zona_vip)) total += ADICIONAL_ZONA_VIP;
  return redondear(total);
}

// Explica el cálculo línea por línea (se muestra al cliente y en el comprobante)
export function desglosarMonto(d) {
  const horas = Number(d.horas);
  const facturables = horasFacturables(d.horas);
  const lineas = [];
  if (facturables === 0) return { lineas, total: 0, nota: '' };

  const base = redondear(TARIFA_POR_HORA * facturables);
  lineas.push({ etiqueta: `Estacionamiento (${facturables} h × ${formatearSoles(TARIFA_POR_HORA)})`, valor: base });

  if (d.tipo_vehiculo === 'bus_camion') {
    lineas.push({ etiqueta: 'Recargo bus o camión (+50 %)', valor: redondear(base * RECARGO_BUS_CAMION) });
  }
  if (marcado(d.zona_vip)) {
    lineas.push({ etiqueta: 'Zona techada VIP', valor: ADICIONAL_ZONA_VIP });
  }
  const nota = horas !== facturables ? `${horas} h se cobra como ${facturables} h (hora o fracción).` : '';
  return { lineas, total: calcularMontoServicio(d), nota };
}

export const NOMBRES_VEHICULO = { auto: 'Auto', bus_camion: 'Bus o camión' };