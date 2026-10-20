// js/terminal/lugares.js
// Plano SIMULADO del terminal (caso académico): zonas de cada nivel y lugares de interés.
// Coordenadas en un lienzo de 1000 × 560 (el SVG se adapta al ancho de la pantalla).

export const NIVELES = {
  1: { nombre: 'Nivel 1 · Llegadas y mostradores' },
  2: { nombre: 'Nivel 2 · Seguridad y embarque' },
};

export const ZONAS = [
  { nivel: 1, nombre: 'Hall de salidas · Mostradores', x: 40, y: 50, w: 540, h: 210, color: '#e3edf9' },
  { nivel: 1, nombre: 'Hall de llegadas', x: 600, y: 50, w: 360, h: 210, color: '#e3f6ea' },
  { nivel: 1, nombre: 'Zona comercial', x: 40, y: 280, w: 300, h: 180, color: '#fdf1de' },
  { nivel: 1, nombre: 'Servicios', x: 360, y: 280, w: 220, h: 180, color: '#f1ecfa' },
  { nivel: 1, nombre: 'Recojo de equipaje', x: 600, y: 280, w: 360, h: 180, color: '#e3f6ea' },
  { nivel: 1, nombre: 'Acera · Taxis, buses y estacionamiento', x: 40, y: 480, w: 920, h: 50, color: '#d7dde3' },
  { nivel: 2, nombre: 'Control de seguridad', x: 40, y: 50, w: 240, h: 200, color: '#fbe5e5' },
  { nivel: 2, nombre: 'Sala de embarque', x: 300, y: 50, w: 660, h: 300, color: '#e3edf9' },
  { nivel: 2, nombre: 'Tiendas y duty free', x: 40, y: 270, w: 240, h: 190, color: '#fdf1de' },
  { nivel: 2, nombre: 'Puertas de embarque', x: 300, y: 370, w: 660, h: 90, color: '#d7e6f5' },
  { nivel: 2, nombre: 'Pista', x: 40, y: 480, w: 920, h: 50, color: '#d7dde3' },
];

export const CATEGORIAS = {
  mostradores: { nombre: 'Mostradores', color: '#1c5fa8' },
  comida: { nombre: 'Comida', color: '#b5720c' },
  servicios: { nombre: 'Servicios', color: '#6b46c1' },
  transporte: { nombre: 'Transporte', color: '#3b4a5a' },
  embarque: { nombre: 'Embarque', color: '#163a5c' },
  salud: { nombre: 'Salud y seguridad', color: '#c0392b' },
};

export const LUGARES = [
  // ---------- Nivel 1 ----------
  { id: 'mostrador-la', nivel: 1, x: 90, y: 120, categoria: 'mostradores', icono: '✈️', nombre: 'Mostradores LATAM (1 a 6)', descripcion: 'Check-in y entrega de equipaje de LATAM Airlines.', horario: '03:30 – 19:00' },
  { id: 'mostrador-h2', nivel: 1, x: 190, y: 120, categoria: 'mostradores', icono: '✈️', nombre: 'Mostradores Sky (7 y 8)', descripcion: 'Check-in y entrega de equipaje de Sky Airline.', horario: '04:00 – 18:30' },
  { id: 'mostrador-ja', nivel: 1, x: 290, y: 120, categoria: 'mostradores', icono: '✈️', nombre: 'Mostradores JetSMART (9 y 10)', descripcion: 'Check-in y entrega de equipaje de JetSMART.', horario: '05:00 – 18:00' },
  { id: 'mostrador-av', nivel: 1, x: 390, y: 120, categoria: 'mostradores', icono: '✈️', nombre: 'Mostrador Avianca (11)', descripcion: 'Check-in de Avianca.', horario: '06:00 – 16:00' },
  { id: 'mostrador-2i', nivel: 1, x: 470, y: 120, categoria: 'mostradores', icono: '✈️', nombre: 'Mostrador Star Perú (12)', descripcion: 'Check-in de Star Perú.', horario: '06:30 – 17:30' },
  { id: 'mostrador-ob', nivel: 1, x: 540, y: 120, categoria: 'mostradores', icono: '✈️', nombre: 'Mostrador BoA (13)', descripcion: 'Check-in de Boliviana de Aviación.', horario: '09:00 – 12:00' },
  { id: 'informacion', nivel: 1, x: 310, y: 215, categoria: 'servicios', icono: 'ℹ️', nombre: 'Módulo de información', descripcion: 'Personal que responde tus consultas sobre vuelos, servicios y turismo.', horario: '24 horas' },
  { id: 'banos-1a', nivel: 1, x: 70, y: 220, categoria: 'servicios', icono: '🚻', nombre: 'Baños (hall de salidas)', descripcion: 'Baños, baño accesible y cambiador de bebés.', horario: '24 horas' },
  { id: 'llegadas', nivel: 1, x: 780, y: 140, categoria: 'transporte', icono: '🛬', nombre: 'Salida de pasajeros que llegan', descripcion: 'Punto de encuentro con quienes te esperan.', horario: '24 horas' },
  { id: 'turismo', nivel: 1, x: 900, y: 110, categoria: 'servicios', icono: '🗺️', nombre: 'Información turística', descripcion: 'Mapas, boleto turístico y recomendaciones para Cusco.', horario: '06:00 – 20:00', enlace: 'turismo.html' },
  { id: 'banos-1b', nivel: 1, x: 900, y: 220, categoria: 'servicios', icono: '🚻', nombre: 'Baños (hall de llegadas)', descripcion: 'Baños y baño accesible.', horario: '24 horas' },
  { id: 'bembos', nivel: 1, x: 100, y: 340, categoria: 'comida', icono: '🍔', nombre: 'Bembos', descripcion: 'Hamburguesas. Puedes pedir para recoger.', horario: '05:00 – 21:00', enlace: 'tienda_restaurante.html' },
  { id: 'burger-king', nivel: 1, x: 200, y: 340, categoria: 'comida', icono: '🍔', nombre: 'Burger King', descripcion: 'Hamburguesas. Puedes pedir para recoger.', horario: '05:00 – 21:00', enlace: 'tienda_restaurante.html' },
  { id: 'taco-bell', nivel: 1, x: 290, y: 340, categoria: 'comida', icono: '🌮', nombre: 'Taco Bell', descripcion: 'Comida mexicana rápida.', horario: '08:00 – 20:00', enlace: 'tienda_restaurante.html' },
  { id: 'artesania', nivel: 1, x: 150, y: 420, categoria: 'comida', icono: '🧶', nombre: 'Tienda de artesanía', descripcion: 'Textiles de alpaca y recuerdos de Cusco.', horario: '05:00 – 20:00' },
  { id: 'cajeros', nivel: 1, x: 400, y: 330, categoria: 'servicios', icono: '🏧', nombre: 'Cajeros automáticos', descripcion: 'Cajeros de BCP, Interbank, BBVA y Scotiabank.', horario: '24 horas' },
  { id: 'cambio', nivel: 1, x: 470, y: 330, categoria: 'servicios', icono: '💱', nombre: 'Casa de cambio', descripcion: 'Cambio de dólares, euros y otras monedas.', horario: '05:00 – 20:00', enlace: 'turismo.html#monedas' },
  { id: 'banco', nivel: 1, x: 540, y: 330, categoria: 'servicios', icono: '🏦', nombre: 'Agencia bancaria', descripcion: 'Operaciones bancarias y pagos.', horario: '08:00 – 18:00' },
  { id: 'objetos', nivel: 1, x: 400, y: 420, categoria: 'servicios', icono: '🧳', nombre: 'Objetos perdidos', descripcion: 'Reporta o recoge objetos olvidados en la terminal.', horario: '06:00 – 22:00', enlace: 'Objetos.html' },
  { id: 'topico', nivel: 1, x: 470, y: 420, categoria: 'salud', icono: '⛑️', nombre: 'Tópico y asistencia médica', descripcion: 'Atención de urgencias y oxígeno para el soroche.', horario: '24 horas', enlace: 'turismo.html#soroche' },
  { id: 'policia', nivel: 1, x: 540, y: 420, categoria: 'salud', icono: '👮', nombre: 'Policía de turismo', descripcion: 'Denuncias y orientación al turista.', horario: '24 horas' },
  { id: 'fajas', nivel: 1, x: 700, y: 360, categoria: 'transporte', icono: '🛄', nombre: 'Fajas de equipaje A, B y C', descripcion: 'Recojo de equipaje de vuelos que llegan. Mira en el tablero qué faja te toca.', horario: 'Según llegadas', enlace: 'vuelos.html?tipo=llegada' },
  { id: 'equipaje-aerolineas', nivel: 1, x: 880, y: 360, categoria: 'transporte', icono: '📋', nombre: 'Equipaje demorado o perdido', descripcion: 'Mostradores de las aerolíneas para reportar equipaje que no llegó.', horario: 'Según llegadas', enlace: 'pasajero.html#perdido' },
  { id: 'taxis', nivel: 1, x: 150, y: 505, categoria: 'transporte', icono: '🚕', nombre: 'Taxis oficiales', descripcion: 'Taxis autorizados con tarifa fija al centro.', horario: '24 horas', enlace: 'taxis.html' },
  { id: 'buses', nivel: 1, x: 400, y: 505, categoria: 'transporte', icono: '🚌', nombre: 'Paradero de buses', descripcion: 'Bus al centro de Cusco cada 20 minutos.', horario: '05:00 – 21:00', enlace: 'buses.html' },
  { id: 'alquiler', nivel: 1, x: 620, y: 505, categoria: 'transporte', icono: '🔑', nombre: 'Alquiler de autos', descripcion: 'Avis, Hertz, Budget y Sixt.', horario: '06:00 – 22:00', enlace: 'alquiler.html' },
  { id: 'estacionamiento', nivel: 1, x: 860, y: 505, categoria: 'transporte', icono: '🅿️', nombre: 'Estacionamiento', descripcion: 'A 50 metros. Mira los espacios libres en vivo.', horario: '24 horas', enlace: 'estacionamiento.html' },
  // ---------- Nivel 2 ----------
  { id: 'seguridad', nivel: 2, x: 120, y: 120, categoria: 'salud', icono: '🛂', nombre: 'Control de seguridad', descripcion: 'Escáner de equipaje de mano. Ten listos tu tarjeta de embarque y tu documento.', horario: '03:30 – 20:00' },
  { id: 'fast-track', nivel: 2, x: 220, y: 120, categoria: 'salud', icono: '⚡', nombre: 'Fast Track', descripcion: 'Fila rápida en el control de seguridad para pasajeros con este servicio.', horario: '03:30 – 20:00' },
  { id: 'migraciones', nivel: 2, x: 170, y: 205, categoria: 'salud', icono: '🛃', nombre: 'Migraciones', descripcion: 'Control migratorio para el vuelo internacional a La Paz.', horario: '08:00 – 13:00' },
  { id: 'duty-free', nivel: 2, x: 90, y: 330, categoria: 'comida', icono: '🛍️', nombre: 'Duty free', descripcion: 'Perfumes, licores y chocolates.', horario: '04:00 – 20:00' },
  { id: 'starbucks', nivel: 2, x: 190, y: 330, categoria: 'comida', icono: '☕', nombre: 'Starbucks', descripcion: 'Café y bocaditos. Puedes pedir para recoger.', horario: '04:00 – 20:00', enlace: 'tienda_restaurante.html' },
  { id: 'farmacia', nivel: 2, x: 140, y: 415, categoria: 'salud', icono: '💊', nombre: 'Farmacia', descripcion: 'Medicamentos y productos para el soroche.', horario: '04:00 – 20:00' },
  { id: 'pizza-hut', nivel: 2, x: 380, y: 110, categoria: 'comida', icono: '🍕', nombre: 'Pizza Hut', descripcion: 'Pizzas. Puedes pedir para recoger.', horario: '05:00 – 20:00', enlace: 'tienda_restaurante.html' },
  { id: 'kfc', nivel: 1, x: 680, y: 215, categoria: 'comida', icono: '🍗', nombre: 'KFC', descripcion: 'Pollo frito. Puedes pedir para recoger.', horario: '05:00 – 20:00', enlace: 'tienda_restaurante.html' },
  { id: 'popeyes', nivel: 1, x: 250, y: 420, categoria: 'comida', icono: '🍗', nombre: 'Popeyes', descripcion: 'Pollo frito estilo Luisiana.', horario: '05:00 – 20:00', enlace: 'tienda_restaurante.html' },
  { id: 'vip', nivel: 2, x: 870, y: 110, categoria: 'servicios', icono: '🛋️', nombre: 'Sala VIP Qorikancha', descripcion: 'Sillones, comida, bebidas, duchas y wifi rápido.', horario: '04:30 – 21:00', enlace: 'Servicios.html#sala-vip' },
  { id: 'descanso', nivel: 2, x: 700, y: 110, categoria: 'servicios', icono: '😴', nombre: 'Estación de descanso', descripcion: 'Sillones reclinables y enchufes para cargar tu celular.', horario: '24 horas' },
  { id: 'wifi', nivel: 2, x: 620, y: 230, categoria: 'servicios', icono: '📶', nombre: 'Wi-Fi gratis', descripcion: 'Red "Qorikancha_Free", 60 minutos gratis por día.', horario: '24 horas', enlace: 'Servicios.html#wifi' },
  { id: 'banos-2', nivel: 2, x: 380, y: 300, categoria: 'servicios', icono: '🚻', nombre: 'Baños (sala de embarque)', descripcion: 'Baños, baño accesible y cambiador.', horario: '24 horas' },
  { id: 'lactario', nivel: 2, x: 470, y: 300, categoria: 'servicios', icono: '🍼', nombre: 'Lactario', descripcion: 'Espacio privado para mamás que dan de lactar.', horario: '24 horas' },
  { id: 'puerta-1', nivel: 2, x: 360, y: 428, categoria: 'embarque', icono: '1', nombre: 'Puerta 1', descripcion: 'Puerta de embarque 1.', horario: 'Según vuelos', enlace: 'vuelos.html' },
  { id: 'puerta-2', nivel: 2, x: 470, y: 428, categoria: 'embarque', icono: '2', nombre: 'Puerta 2', descripcion: 'Puerta de embarque 2.', horario: 'Según vuelos', enlace: 'vuelos.html' },
  { id: 'puerta-3', nivel: 2, x: 580, y: 428, categoria: 'embarque', icono: '3', nombre: 'Puerta 3', descripcion: 'Puerta de embarque 3.', horario: 'Según vuelos', enlace: 'vuelos.html' },
  { id: 'puerta-4', nivel: 2, x: 690, y: 428, categoria: 'embarque', icono: '4', nombre: 'Puerta 4', descripcion: 'Puerta de embarque 4.', horario: 'Según vuelos', enlace: 'vuelos.html' },
  { id: 'puerta-5', nivel: 2, x: 800, y: 428, categoria: 'embarque', icono: '5', nombre: 'Puerta 5', descripcion: 'Puerta de embarque 5.', horario: 'Según vuelos', enlace: 'vuelos.html' },
  { id: 'puerta-6', nivel: 2, x: 910, y: 428, categoria: 'embarque', icono: '6', nombre: 'Puerta 6 (internacional)', descripcion: 'Puerta de embarque 6, usada por el vuelo a La Paz.', horario: 'Según vuelos', enlace: 'vuelos.html' },
];
