import { sql } from '../config/neon-config.js';
import { exigirSesion } from '../auth/auth.js';

const usuario = exigirSesion();

export async function consultarMisReservas() {
  const filas = await sql`
    SELECT codigo_seguimiento, placa, fecha_hora_entrada, estado, fecha_registro
    FROM reservas_estacionamiento
    WHERE usuario_id = ${usuario.id}
    ORDER BY fecha_registro DESC;
  `;
  return filas;
}

export async function buscarReservaPorCodigo(codigo) {
  const filas = await sql`
    SELECT codigo_seguimiento, placa, fecha_hora_entrada, estado, fecha_registro
    FROM reservas_estacionamiento
    WHERE codigo_seguimiento = ${codigo} AND usuario_id = ${usuario.id};
  `;
  return filas[0] || null;
}

function escaparHTML(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatearFecha(valor) {
  if (!valor) return '—';
  const fecha = new Date(valor);
  return fecha.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}

function pintarFila(reserva) {
  const tr = document.createElement('tr');
  tr.dataset.codigo = reserva.codigo_seguimiento;

  const accion = reserva.estado === 'registrado'
    ? `<a href="actualizar.html?codigo=${encodeURIComponent(reserva.codigo_seguimiento)}" class="btn-editar-fila">Editar</a>`
    : '—';

  tr.innerHTML = `
    <td>${escaparHTML(reserva.codigo_seguimiento)}</td>
    <td>${escaparHTML(reserva.placa)}</td>
    <td>${formatearFecha(reserva.fecha_hora_entrada)}</td>
    <td><span class="estado-badge estado-${reserva.estado}">${reserva.estado}</span></td>
    <td>${formatearFecha(reserva.fecha_registro)}</td>
    <td>${accion}</td>
  `;
  return tr;
}

// Esqueleto de carga mientras llegan los datos
function mostrarEsqueleto(cuerpoTabla) {
  cuerpoTabla.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const tr = document.createElement('tr');
    tr.className = 'fila-esqueleto';
    tr.setAttribute('aria-hidden', 'true');
    tr.innerHTML = '<td><span class="barra-esqueleto"></span></td>'.repeat(6);
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
    cuerpoTabla.innerHTML = '';

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
        tr.classList.add('fila-nueva');          // la reserva recién creada parpadea en verde
        filaNueva = tr;
      } else {
        tr.classList.add('fila-entrada');        // las demás entran escalonadas
        tr.style.animationDelay = `${Math.min(i * 60, 600)}ms`;
      }
      cuerpoTabla.appendChild(tr);
    });

    if (filaNueva) {
      filaNueva.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } catch (error) {
    console.error(error);
    cuerpoTabla.innerHTML = '';
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
      resultadoEl.textContent = `✓ Encontrada: placa ${reserva.placa}, estado "${reserva.estado}".`;
      resultadoEl.classList.add('encontrado');
    } catch (error) {
      console.error(error);
      resultadoEl.textContent = 'Ocurrió un error al buscar la reserva.';
      resultadoEl.classList.add('no-encontrado');
    }
  });
}

cargarMisReservas();