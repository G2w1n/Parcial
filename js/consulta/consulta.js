import { sql } from '../config/neon-config.js';
import { exigirRol } from '../auth/auth.js';
import { formatearSoles, NOMBRES_VEHICULO } from '../registro/tarifario.js';
import { formatearFecha, avisar } from '../config/ui.js';

const usuario = exigirRol('cliente');
if (!usuario) throw new Error('Acceso denegado');


export async function consultarMisReservas() {
  return await sql`
    SELECT r.id, r.codigo_seguimiento, r.placa, r.horas, r.tipo_vehiculo, r.zona_vip,
           r.monto_calculado, r.estado, r.estado_pago, r.fecha_hora_entrada, r.fecha_registro,
           p.codigo_operacion
    FROM reservas_estacionamiento r
    LEFT JOIN pagos p ON p.id_registro = r.id AND p.estado = 'aprobado'
    WHERE r.usuario_id = ${usuario.id}
    ORDER BY r.fecha_registro DESC;
  `;
}

export async function buscarReservaPorCodigo(codigo) {
  const filas = await sql`
    SELECT r.codigo_seguimiento, r.placa, r.monto_calculado, r.estado, r.estado_pago
    FROM reservas_estacionamiento r
    WHERE r.codigo_seguimiento = ${codigo} AND r.usuario_id = ${usuario.id};
  `;
  return filas[0] || null;
}

function celda(tr, contenido) {
  const td = document.createElement('td');
  if (contenido instanceof Node) td.append(contenido);
  else td.textContent = contenido ?? '—'; // textContent: nunca se interpreta como HTML
  tr.append(td);
  return td;
}

function insignia(clase, texto) {
  const span = document.createElement('span');
  span.className = clase;
  span.textContent = texto;
  return span;
}

function enlace(href, clase, texto) {
  const a = document.createElement('a');
  a.href = href;
  a.className = clase;
  a.textContent = texto;
  return a;
}

function pintarFila(r) {
  const tr = document.createElement('tr');
  tr.dataset.codigo = r.codigo_seguimiento;

  celda(tr, r.codigo_seguimiento);
  celda(tr, r.placa);
  celda(tr, `${NOMBRES_VEHICULO[r.tipo_vehiculo] ?? r.tipo_vehiculo}${r.zona_vip ? ' · VIP' : ''}`);
  celda(tr, `${Number(r.horas)} h`);
  celda(tr, formatearSoles(Number(r.monto_calculado)));
  celda(tr, insignia(`pago-badge pago-${r.estado_pago}`, r.estado_pago));
  celda(tr, formatearFecha(r.fecha_hora_entrada));
  celda(tr, insignia(`estado-badge estado-${r.estado}`, r.estado));

  const acciones = document.createElement('td');
  if (r.estado_pago === 'pendiente' && r.estado !== 'cancelado') {
    acciones.append(enlace(`pago.html?id=${r.id}`, 'btn-pagar-fila', 'Pagar'));
  }
  if (r.estado_pago === 'pagado' && r.codigo_operacion) {
    acciones.append(enlace(`comprobante.html?op=${encodeURIComponent(r.codigo_operacion)}`, 'btn-comprobante-fila', 'Comprobante'));
  }
  if (r.estado === 'registrado' && r.estado_pago === 'pagado') {
    acciones.append(enlace(`ampliar.html?codigo=${encodeURIComponent(r.codigo_seguimiento)}`, 'btn-ampliar-fila', 'Ampliar'));
  }
  if (r.estado === 'registrado' && r.estado_pago !== 'pagado') {
    acciones.append(enlace(`actualizar.html?codigo=${encodeURIComponent(r.codigo_seguimiento)}`, 'btn-editar-fila', 'Editar'));
    const cancelar = document.createElement('button');
    cancelar.type = 'button';
    cancelar.className = 'btn-cancelar-fila';
    cancelar.dataset.codigo = r.codigo_seguimiento;
    cancelar.textContent = 'Cancelar';
    acciones.append(cancelar);
  }
  if (!acciones.childNodes.length) acciones.textContent = r.estado_pago === 'exonerado' ? 'Exonerado' : '—';
  tr.append(acciones);

  return tr;
}

// Esqueleto de carga mientras llegan los datos
function mostrarEsqueleto(cuerpoTabla) {
  cuerpoTabla.replaceChildren();
  for (let i = 0; i < 4; i++) {
    const tr = document.createElement('tr');
    tr.className = 'fila-esqueleto';
    tr.setAttribute('aria-hidden', 'true');
    for (let c = 0; c < 9; c++) {
      const td = document.createElement('td');
      const barra = document.createElement('span');
      barra.className = 'barra-esqueleto';
      td.append(barra);
      tr.append(td);
    }
    cuerpoTabla.appendChild(tr);
  }
}

async function cargarMisReservas() {
  const cuerpoTabla = document.getElementById('tabla-reservas-body');
  const vacioEl = document.getElementById('reservas-vacio');
  if (!cuerpoTabla) return;

  mostrarEsqueleto(cuerpoTabla);

  // Si venimos de reservar, el código llega en la URL para resaltar esa fila
  const codigoNuevo = new URLSearchParams(window.location.search).get('nueva');

  try {
    const reservas = await consultarMisReservas();
    cuerpoTabla.replaceChildren();

    if (reservas.length === 0) {
      vacioEl.textContent = 'Aún no tienes reservas registradas.';
      vacioEl.style.display = 'block';
      return;
    }

    vacioEl.style.display = 'none';

    let filaNueva = null;
    reservas.forEach((reserva, i) => {
      const tr = pintarFila(reserva);

      if (codigoNuevo && reserva.codigo_seguimiento === codigoNuevo) {
        tr.classList.add('fila-nueva');
        filaNueva = tr;
      } else {
        tr.classList.add('fila-entrada');
        tr.style.animationDelay = `${Math.min(i * 60, 600)}ms`;
      }
      cuerpoTabla.appendChild(tr);
    });

    if (filaNueva) {
      filaNueva.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } catch (error) {
    console.error(error);
    cuerpoTabla.replaceChildren();
    vacioEl.textContent = 'Ocurrió un error al cargar tus reservas.';
    vacioEl.style.display = 'block';
  }
}

const formBuscar = document.getElementById('form-buscar-codigo');
if (formBuscar) {
  formBuscar.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const codigo = document.getElementById('buscar-codigo').value.trim();
    const resultadoEl = document.getElementById('busqueda-resultado');
    resultadoEl.className = 'busqueda-resultado';

    if (!codigo) return;

    try {
      const reserva = await buscarReservaPorCodigo(codigo);
      if (!reserva) {
        resultadoEl.textContent = 'No se encontró ninguna reserva con ese código.';
        resultadoEl.classList.add('no-encontrado');
        return;
      }
      resultadoEl.textContent =
        `✓ Encontrada: placa ${reserva.placa}, ${formatearSoles(Number(reserva.monto_calculado))}, ` +
        `pago ${reserva.estado_pago}, estado "${reserva.estado}".`;
      resultadoEl.classList.add('encontrado');
    } catch (error) {
      console.error(error);
      resultadoEl.textContent = 'Ocurrió un error al buscar la reserva.';
      resultadoEl.classList.add('no-encontrado');
    }
  });
}

// El cliente puede cancelar una reserva que todavía no pagó (las pagadas se devuelven en caja)
export async function cancelarReserva(codigo) {
  const filas = await sql`
    UPDATE reservas_estacionamiento SET estado = 'cancelado'
    WHERE codigo_seguimiento = ${codigo} AND usuario_id = ${usuario.id}
      AND estado = 'registrado' AND estado_pago = 'pendiente'
    RETURNING id;
  `;
  return filas.length === 1;
}

document.getElementById('tabla-reservas-body')?.addEventListener('click', async (e) => {
  const boton = e.target.closest('.btn-cancelar-fila');
  if (!boton) return;
  if (!confirm(`¿Cancelar la reserva ${boton.dataset.codigo}? Esta acción no se puede deshacer.`)) return;
  boton.disabled = true;
  try {
    const ok = await cancelarReserva(boton.dataset.codigo);
    avisar(ok ? 'Reserva cancelada.' : 'Esa reserva ya no se puede cancelar (fue pagada o atendida).', ok ? 'exito' : 'error');
    cargarMisReservas();
  } catch (error) {
    console.error(error);
    avisar('No se pudo cancelar la reserva.', 'error');
    boton.disabled = false;
  }
});

cargarMisReservas();