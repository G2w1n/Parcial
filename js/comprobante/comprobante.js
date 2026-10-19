// js/comprobante/comprobante.js
import { sql } from '../config/neon-config.js';
import { exigirSesion, rutaInicioSegunRol } from '../auth/auth.js';
import { desglosarMonto, formatearSoles, NOMBRES_VEHICULO } from '../registro/tarifario.js';

const usuario = exigirSesion();
if (!usuario) throw new Error('Sin sesión');

const NOMBRES_METODO = {
  tarjeta_debito: 'Tarjeta de débito',
  tarjeta_credito: 'Tarjeta de crédito',
  billetera: 'Billetera electrónica',
  efectivo: 'Efectivo',
  pos: 'Tarjeta en POS',
};
const NOMBRES_BILLETERA = { andipay: 'AndiPay', pagomovil: 'PagoMóvil' };

const contenedor = document.querySelector('#comprobante');
document.querySelector('#volver').href = usuario.rol === 'cliente' ? 'mis-reservas.html' : rutaInicioSegunRol(usuario.rol);
document.querySelector('#imprimir').addEventListener('click', () => window.print());

const op = new URLSearchParams(location.search).get('op');

const filas = op
  ? await sql`
      SELECT p.codigo_operacion, p.canal, p.metodo, p.proveedor_billetera, p.marca_tarjeta, p.referencia,
             p.monto, p.monto_recibido, p.vuelto, p.fecha_pago, p.id_usuario,
             r.codigo_seguimiento, r.nombre_pasajero AS pasajero, r.placa, r.horas, r.tipo_vehiculo, r.zona_vip,
             c.nombre AS cajero
      FROM pagos p
      JOIN reservas_estacionamiento r ON r.id = p.id_registro
      LEFT JOIN usuarios c ON c.id = p.id_cajero
      WHERE p.codigo_operacion = ${op} AND p.estado = 'aprobado';
    `
  : [];
const pago = filas[0];

function crear(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto; // textContent: nunca se interpreta como HTML
  return el;
}

function agregarDato(lista, etiqueta, valor) {
  lista.append(crear('dt', '', etiqueta), crear('dd', '', valor ?? '—'));
}

// Un cliente solo puede ver sus propios comprobantes
if (!pago || (usuario.rol === 'cliente' && pago.id_usuario !== usuario.id)) {
  contenedor.textContent = 'Comprobante no encontrado.';
} else {
  const constancia = crear('article', 'constancia');

  const cabecera = crear('header', 'constancia-cab');
  cabecera.append(crear('strong', '', 'Aeropuerto Qorikancha'), crear('span', '', 'Constancia de pago'));

  // El pago habilita el pase de salida de la garita
  const pase = crear('div', 'pase');
  const textoPase = crear('div', '');
  textoPase.append(
    crear('strong', '', 'Pase de salida habilitado'),
    crear('small', '', 'Presenta el código de operación en la garita'),
  );
  pase.append(crear('span', 'pase-icono', '✓'), textoPase);

  const cuerpo = crear('div', 'constancia-cuerpo');
  const lista = crear('dl', '');

  const medio = [
    NOMBRES_METODO[pago.metodo],
    pago.marca_tarjeta ?? NOMBRES_BILLETERA[pago.proveedor_billetera] ?? '',
    pago.referencia ?? '',
  ].join(' ').replace(/\s+/g, ' ').trim();

  agregarDato(lista, 'N.º de operación', pago.codigo_operacion);
  agregarDato(lista, 'Reserva', pago.codigo_seguimiento);
  agregarDato(lista, 'Pasajero', pago.pasajero);
  agregarDato(lista, 'Placa', pago.placa);
  agregarDato(lista, 'Estadía', `${Number(pago.horas)} h · ${NOMBRES_VEHICULO[pago.tipo_vehiculo] ?? pago.tipo_vehiculo}${pago.zona_vip ? ' · zona VIP' : ''}`);
  agregarDato(lista, 'Canal', pago.canal === 'pasarela' ? 'Pago en línea' : 'Ventanilla');
  agregarDato(lista, 'Medio', medio);
  if (pago.metodo === 'efectivo') {
    agregarDato(lista, 'Recibido', formatearSoles(Number(pago.monto_recibido)));
    agregarDato(lista, 'Vuelto', formatearSoles(Number(pago.vuelto)));
  }
  if (pago.cajero) agregarDato(lista, 'Atendido por', pago.cajero);
  agregarDato(lista, 'Fecha y hora', new Date(pago.fecha_pago).toLocaleString('es-PE', { timeZone: 'America/Lima' }));
  cuerpo.append(lista);

  // Desglose del cobro
  const desglose = crear('ul', 'desglose-comp');
  desglosarMonto(pago).lineas.forEach((linea) => {
    const li = crear('li', '');
    li.append(crear('span', '', linea.etiqueta), crear('span', '', formatearSoles(linea.valor)));
    desglose.append(li);
  });
  cuerpo.append(desglose);

  const total = crear('p', 'total-comp');
  total.append(crear('span', '', 'Total pagado'), crear('strong', '', formatearSoles(Number(pago.monto))));
  cuerpo.append(total);

  const pie = crear('footer', 'constancia-pie');
  pie.append(crear('p', 'pie-codigo', pago.codigo_operacion), crear('div', 'ticket-barras'));

  constancia.append(cabecera, pase, cuerpo, pie);
  contenedor.replaceChildren(constancia);
}