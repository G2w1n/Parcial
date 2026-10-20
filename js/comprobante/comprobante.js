// js/comprobante/comprobante.js
import { sql } from '../config/neon-config.js';
import { exigirSesion, rutaInicioSegunRol } from '../auth/auth.js';
import { desglosarGuardado, formatearSoles, NOMBRES_VEHICULO } from '../registro/tarifario.js';

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
      SELECT p.*, r.id AS id_reserva,
             r.codigo_seguimiento, r.nombre_pasajero AS pasajero, r.placa, r.horas, r.tipo_vehiculo, r.zona_vip, r.fecha_hora_entrada,
             c.nombre AS cajero
      FROM pagos p
      JOIN reservas_estacionamiento r ON r.id = p.id_registro
      LEFT JOIN usuarios c ON c.id = p.id_cajero
      WHERE p.codigo_operacion = ${op} AND p.estado = 'aprobado';
    `
  : [];
const pago = filas[0];

// Horas extra pagadas después (fase 4). Si la tabla aún no existe, no hay ampliaciones
let ampliaciones = [];
if (pago) {
  try {
    ampliaciones = await sql`
      SELECT codigo_operacion, horas_extra, monto, fecha FROM ampliaciones
      WHERE id_registro = ${pago.id_reserva} ORDER BY fecha;
    `;
  } catch (error) {
    if (error.code !== '42P01') console.error(error);
  }
}

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

  // Desglose del cobro, con las horas que tenía la reserva al pagarla
  const horasExtra = ampliaciones.reduce((suma, a) => suma + Number(a.horas_extra), 0);
  const descuento = Number(pago.descuento ?? 0);
  const desglose = crear('ul', 'desglose-comp');
  const agregarLinea = (etiqueta, valor) => {
    const li = crear('li', '');
    li.append(crear('span', '', etiqueta), crear('span', '', formatearSoles(valor)));
    desglose.append(li);
  };
  desglosarGuardado({ ...pago, horas: Number(pago.horas) - horasExtra }, Number(pago.monto) + descuento)
    .lineas.forEach((linea) => agregarLinea(linea.etiqueta, linea.valor));
  if (descuento > 0) agregarLinea(`Cupón ${pago.cupon}`, -descuento);
  cuerpo.append(desglose);

  const total = crear('p', 'total-comp');
  total.append(crear('span', '', 'Total pagado'), crear('strong', '', formatearSoles(Number(pago.monto))));
  cuerpo.append(total);

  if (ampliaciones.length) {
    const titulo = crear('p', 'titulo-ampliaciones', 'Ampliaciones de estadía');
    const lista = crear('ul', 'desglose-comp');
    ampliaciones.forEach((a) => {
      const li = crear('li', '');
      li.append(crear('span', '', `+${Number(a.horas_extra)} h · ${a.codigo_operacion}`), crear('span', '', formatearSoles(Number(a.monto))));
      lista.append(li);
    });
    cuerpo.append(titulo, lista);
  }

  const pie = crear('footer', 'constancia-pie');
  pie.append(crear('p', 'pie-codigo', pago.codigo_operacion), crear('div', 'ticket-barras'));

  constancia.append(cabecera, pase, cuerpo, pie);
  contenedor.replaceChildren(constancia);
}