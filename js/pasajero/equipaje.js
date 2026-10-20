// js/pasajero/equipaje.js
// Reglas REFERENCIALES de equipaje por aerolínea (caso académico) y funciones PURAS para validarlo.
// Prueba en la consola: revisarEquipaje({ aerolinea: 'LA', tipo: 'cabina', peso: 12, alto: 55, ancho: 35, largo: 25 })

export const TIPOS_EQUIPAJE = {
  personal: { nombre: 'Artículo personal', descripcion: 'Mochila o cartera que va debajo del asiento' },
  cabina: { nombre: 'Equipaje de mano', descripcion: 'Maleta pequeña que va en el compartimiento superior' },
  bodega: { nombre: 'Equipaje de bodega', descripcion: 'Maleta que se documenta en el mostrador' },
};

// peso en kg; medidas en cm (alto × ancho × largo); lineal = suma de las tres medidas
// incluido: si viene en la tarifa básica; cargoKg: S/ por kg de exceso (solo bodega)
export const REGLAS_EQUIPAJE = {
  LA: {
    personal: { peso: 4, medidas: [45, 35, 20], incluido: true },
    cabina: { peso: 10, medidas: [55, 35, 25], incluido: false },
    bodega: { peso: 23, lineal: 158, incluido: false, cargoKg: 25, pesoMaximo: 32 },
  },
  H2: {
    personal: { peso: 4, medidas: [45, 35, 20], incluido: true },
    cabina: { peso: 10, medidas: [55, 35, 25], incluido: false },
    bodega: { peso: 23, lineal: 158, incluido: false, cargoKg: 22, pesoMaximo: 32 },
  },
  JA: {
    personal: { peso: 4, medidas: [45, 35, 25], incluido: true },
    cabina: { peso: 10, medidas: [55, 35, 25], incluido: false },
    bodega: { peso: 23, lineal: 158, incluido: false, cargoKg: 22, pesoMaximo: 32 },
  },
  AV: {
    personal: { peso: 5, medidas: [45, 35, 20], incluido: true },
    cabina: { peso: 10, medidas: [55, 40, 25], incluido: true },
    bodega: { peso: 23, lineal: 158, incluido: false, cargoKg: 28, pesoMaximo: 32 },
  },
  '2I': {
    personal: { peso: 5, medidas: [45, 35, 20], incluido: true },
    cabina: { peso: 8, medidas: [55, 35, 25], incluido: true },
    bodega: { peso: 23, lineal: 158, incluido: true, cargoKg: 18, pesoMaximo: 32 },
  },
  OB: {
    personal: { peso: 5, medidas: [45, 35, 20], incluido: true },
    cabina: { peso: 8, medidas: [55, 40, 20], incluido: true },
    bodega: { peso: 23, lineal: 158, incluido: true, cargoKg: 20, pesoMaximo: 32 },
  },
};

const redondear = (n) => Math.round(n * 10) / 10;

// Compara las medidas sin importar el orden en que se escribieron (la maleta se puede girar)
function excedeMedidas(medidas, limite) {
  const a = [...medidas].sort((x, y) => y - x);
  const b = [...limite].sort((x, y) => y - x);
  return a.some((m, i) => m > b[i]);
}

// Devuelve { nivel: 'ok' | 'aviso' | 'error', titulo, detalles: [], cargo, regla }
export function revisarEquipaje({ aerolinea, tipo, peso, alto, ancho, largo }) {
  const regla = REGLAS_EQUIPAJE[aerolinea]?.[tipo];
  if (!regla) return { nivel: 'error', titulo: 'Elige la aerolínea y el tipo de equipaje.', detalles: [], cargo: 0, regla: null };

  const kg = Number(peso);
  const medidas = [alto, ancho, largo].map(Number);
  if (!(kg > 0) || medidas.some((m) => !(m > 0))) {
    return { nivel: 'error', titulo: 'Ingresa el peso y las tres medidas.', detalles: [], cargo: 0, regla };
  }

  const detalles = [];
  let nivel = 'ok';
  let cargo = 0;

  if (tipo === 'bodega') {
    const lineal = medidas.reduce((s, m) => s + m, 0);
    if (kg > regla.pesoMaximo) {
      nivel = 'error';
      detalles.push(`Supera el máximo de ${regla.pesoMaximo} kg por pieza: debe enviarse como carga.`);
    } else if (kg > regla.peso) {
      nivel = 'aviso';
      const exceso = redondear(kg - regla.peso);
      cargo = Math.round(exceso * regla.cargoKg);
      detalles.push(`Excede ${exceso} kg el límite de ${regla.peso} kg. Cargo estimado: S/ ${cargo} (S/ ${regla.cargoKg} por kg).`);
    }
    if (lineal > regla.lineal) {
      nivel = 'error';
      detalles.push(`La suma de las medidas es ${lineal} cm y el máximo es ${regla.lineal} cm.`);
    }
  } else {
    if (kg > regla.peso) {
      nivel = 'error';
      detalles.push(`Pesa ${redondear(kg - regla.peso)} kg más de lo permitido (${regla.peso} kg).`);
    }
    if (excedeMedidas(medidas, regla.medidas)) {
      nivel = 'error';
      detalles.push(`Sus medidas superan ${regla.medidas.join(' × ')} cm.`);
    }
    if (nivel === 'error') {
      detalles.push(tipo === 'cabina'
        ? 'Tendrás que documentarlo en bodega en el mostrador.'
        : 'Llévalo como equipaje de mano o documéntalo en bodega.');
    }
  }

  if (nivel !== 'error' && !regla.incluido) {
    detalles.push('Este equipaje no viene en la tarifa básica: cómpralo antes, en línea es más barato que en el aeropuerto.');
    if (nivel === 'ok') nivel = 'aviso';
  }

  const titulos = { ok: '¡Tu equipaje cumple!', aviso: 'Tu equipaje cumple, con observaciones', error: 'Tu equipaje no cumple' };
  return { nivel, titulo: titulos[nivel], detalles, cargo, regla };
}

// Lista de objetos: ¿se pueden llevar en cabina y en bodega?
export const OBJETOS = [
  { icono: '💧', nombre: 'Líquidos hasta 100 ml', cabina: true, bodega: true, nota: 'En bolsa transparente de 1 litro' },
  { icono: '🧴', nombre: 'Líquidos de más de 100 ml', cabina: false, bodega: true },
  { icono: '💻', nombre: 'Laptop o tablet', cabina: true, bodega: true, nota: 'Sácala de la mochila en el control' },
  { icono: '🔋', nombre: 'Batería externa (power bank)', cabina: true, bodega: false, nota: 'Solo en cabina, hasta 100 Wh' },
  { icono: '🚬', nombre: 'Encendedor', cabina: true, bodega: false, nota: 'Solo uno, en el bolsillo' },
  { icono: '💊', nombre: 'Medicamentos', cabina: true, bodega: true, nota: 'Con receta si son líquidos' },
  { icono: '✂️', nombre: 'Tijeras de más de 6 cm', cabina: false, bodega: true },
  { icono: '🔪', nombre: 'Cuchillos y navajas', cabina: false, bodega: true },
  { icono: '🪒', nombre: 'Máquina de afeitar', cabina: true, bodega: true },
  { icono: '🧪', nombre: 'Aerosoles inflamables', cabina: false, bodega: false },
  { icono: '🎆', nombre: 'Fuegos artificiales', cabina: false, bodega: false },
  { icono: '🔫', nombre: 'Armas y réplicas', cabina: false, bodega: false, nota: 'Solo con permiso de la aerolínea' },
  { icono: '⛽', nombre: 'Combustibles y gas', cabina: false, bodega: false },
  { icono: '🔨', nombre: 'Herramientas', cabina: false, bodega: true },
  { icono: '🎒', nombre: 'Bastones de trekking', cabina: false, bodega: true, nota: 'Muy común al volver de Machu Picchu' },
  { icono: '🍫', nombre: 'Alimentos sólidos', cabina: true, bodega: true },
  { icono: '🌿', nombre: 'Hojas de coca', cabina: true, bodega: true, nota: 'Permitidas en vuelos nacionales; prohibidas en muchos países' },
  { icono: '🍷', nombre: 'Bebidas alcohólicas', cabina: false, bodega: true, nota: 'Hasta 5 litros, menos de 70 % de alcohol' },
  { icono: '🔌', nombre: 'Cigarrillo electrónico', cabina: true, bodega: false },
  { icono: '🧸', nombre: 'Artesanías y textiles', cabina: true, bodega: true },
];

export function estadoObjeto(objeto) {
  if (objeto.cabina && objeto.bodega) return 'permitido';
  if (!objeto.cabina && !objeto.bodega) return 'prohibido';
  return objeto.cabina ? 'solo-cabina' : 'solo-bodega';
}
