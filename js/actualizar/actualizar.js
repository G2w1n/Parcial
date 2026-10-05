import { sql } from '../config/neon-config.js';
import { exigirSesion } from '../auth/auth.js';
import { costoEstimado, formatearSoles, pintarPrecios } from '../config/tarifas.js';

const usuario = exigirSesion();

const parametros = new URLSearchParams(window.location.search);
const codigo = parametros.get('codigo');

let reservaId = null;

export async function obtenerReservaPropia(codigoSeguimiento) {
  const filas = await sql`
    SELECT id, nombre_pasajero, placa, fecha_hora_entrada, estado, tipo_servicio
    FROM reservas_estacionamiento
    WHERE codigo_seguimiento = ${codigoSeguimiento} AND usuario_id = ${usuario.id};
  `;
  return filas[0] || null;
}

export async function actualizarRegistro(id, datos) {
  await sql`
    UPDATE reservas_estacionamiento
    SET nombre_pasajero = ${datos.nombre_pasajero}, placa = ${datos.placa}, fecha_hora_entrada = ${datos.fecha_hora_entrada},
        tipo_servicio = ${datos.tipo_servicio}, costo_estimado = ${datos.costo_estimado}
    WHERE id = ${id} AND usuario_id = ${usuario.id};
  `;
  // el "AND usuario_id = ..." evita que un cliente edite el registro de otro,
  // aunque cambie el código en la URL a mano.
}

const form = document.getElementById('form-actualizar');
const avisoSoloLectura = document.getElementById('solo-lectura-aviso');
const confirmacionEl = document.getElementById('actualizar-confirmacion');
const costoEl = document.getElementById('ac-costo');

pintarPrecios();

function tipoElegido() {
  const marcado = document.querySelector('input[name="tipo_servicio"]:checked');
  return marcado ? marcado.value : 'normal';
}

function mostrarCosto() {
  costoEl.textContent = formatearSoles(costoEstimado(tipoElegido()));
}

document.querySelectorAll('input[name="tipo_servicio"]').forEach((radio) => {
  radio.addEventListener('change', mostrarCosto);
});
mostrarCosto();

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

    const radio = document.querySelector(`input[name="tipo_servicio"][value="${reserva.tipo_servicio}"]`);
    if (radio) radio.checked = true;
    mostrarCosto();
  } catch (error) {
    console.error(error);
    mostrarAviso('Ocurrió un error al cargar la reserva.');
  }
}

if (form) {
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const tipo = tipoElegido();
    const datos = {
      nombre_pasajero: document.getElementById('ac-nombre').value,
      placa: document.getElementById('ac-placa').value,
      fecha_hora_entrada: document.getElementById('ac-fecha').value,
      tipo_servicio: tipo,
      costo_estimado: costoEstimado(tipo),
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