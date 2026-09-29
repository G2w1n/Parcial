import { sql } from '../config/neon-config.js';
import { exigirSesion } from '../auth/auth.js';

const usuario = exigirSesion();

const parametros = new URLSearchParams(window.location.search);
const codigo = parametros.get('codigo');

let reservaId = null;

export async function obtenerReservaPropia(codigoSeguimiento) {
  const filas = await sql`
    SELECT id, nombre_pasajero, placa, fecha_hora_entrada, estado
    FROM reservas_estacionamiento
    WHERE codigo_seguimiento = ${codigoSeguimiento} AND usuario_id = ${usuario.id};
  `;
  return filas[0] || null;
}

export async function actualizarRegistro(id, datos) {
  await sql`
    UPDATE reservas_estacionamiento
    SET nombre_pasajero = ${datos.nombre_pasajero}, placa = ${datos.placa}, fecha_hora_entrada = ${datos.fecha_hora_entrada}
    WHERE id = ${id} AND usuario_id = ${usuario.id};
  `;
  // el "AND usuario_id = ..." evita que un cliente edite el registro de otro,
  // aunque cambie el código en la URL a mano.
}

const form = document.getElementById('form-actualizar');
const avisoSoloLectura = document.getElementById('solo-lectura-aviso');
const confirmacionEl = document.getElementById('actualizar-confirmacion');

function mostrarAviso(mensaje) {
  avisoSoloLectura.textContent = mensaje;
  avisoSoloLectura.classList.add('visible');
  form.style.display = 'none';
}

async function cargarReserva() {
  if (!codigo) {
    mostrarAviso('No se especificó ninguna reserva para editar.');
    return;
  }

  try {
    const reserva = await obtenerReservaPropia(codigo);
    if (!reserva) {
      mostrarAviso('No se encontró esa reserva, o no te pertenece.');
      return;
    }

    reservaId = reserva.id;

    if (reserva.estado !== 'registrado') {
      mostrarAviso(`Esta reserva ya está en estado "${reserva.estado}" y no se puede editar.`);
      return;
    }

    document.getElementById('ac-nombre').value = reserva.nombre_pasajero;
    document.getElementById('ac-placa').value = reserva.placa;
    const fecha = new Date(reserva.fecha_hora_entrada);
    document.getElementById('ac-fecha').value = fecha.toISOString().slice(0, 16);
  } catch (error) {
    console.error(error);
    mostrarAviso('Ocurrió un error al cargar la reserva.');
  }
}

if (form) {
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const datos = {
      nombre_pasajero: document.getElementById('ac-nombre').value,
      placa: document.getElementById('ac-placa').value,
      fecha_hora_entrada: document.getElementById('ac-fecha').value,
    };

    try {
      await actualizarRegistro(reservaId, datos);
      confirmacionEl.textContent = '✓ Reserva actualizada correctamente.';
      confirmacionEl.classList.add('visible');
    } catch (error) {
      console.error(error);
      confirmacionEl.textContent = 'Ocurrió un error al guardar los cambios.';
      confirmacionEl.classList.add('visible');
    }
  });
}

cargarReserva();