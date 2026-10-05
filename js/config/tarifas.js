// Tarifas estimadas por tipo de servicio. Cambia los precios solo aquí.
export const TIPOS_SERVICIO = {
  normal: { etiqueta: 'Taxi normal', costo: 25 },
  vip: { etiqueta: 'Taxi VIP', costo: 60 },
};

export function costoEstimado(tipo) {
  const servicio = TIPOS_SERVICIO[tipo];
  return servicio ? servicio.costo : 0;
}

export function etiquetaServicio(tipo) {
  const servicio = TIPOS_SERVICIO[tipo];
  return servicio ? servicio.etiqueta : '—';
}

export function formatearSoles(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  return 'S/ ' + Number(valor).toFixed(2);
}

// Rellena los textos marcados con data-etiqueta y data-precio
export function pintarPrecios(raiz = document) {
  raiz.querySelectorAll('[data-etiqueta]').forEach((el) => {
    el.textContent = etiquetaServicio(el.dataset.etiqueta);
  });
  raiz.querySelectorAll('[data-precio]').forEach((el) => {
    el.textContent = formatearSoles(costoEstimado(el.dataset.precio));
  });
}

// Llena un <select> con los tipos de servicio y su precio
export function llenarSelectorServicio(select) {
  select.innerHTML = Object.entries(TIPOS_SERVICIO)
    .map(([clave, s]) => `<option value="${clave}">${s.etiqueta} — ${formatearSoles(s.costo)}</option>`)
    .join('');
}