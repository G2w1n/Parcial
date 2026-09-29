import { sql } from '../config/neon-config.js';
import { exigirSesion } from '../auth/auth.js';

const usuario = exigirSesion();

export async function guardarReservaEstacionamiento(datos) {
  const codigo = 'COD-' + Date.now().toString().slice(-8);
  const resultado = await sql`
    INSERT INTO reservas_estacionamiento (codigo_seguimiento, nombre_pasajero, placa, fecha_hora_entrada, usuario_id)
    VALUES (${codigo}, ${datos.nombre_pasajero}, ${datos.placa}, ${datos.fecha_hora_entrada}, ${usuario.id})
    RETURNING codigo_seguimiento;
  `;
  return resultado[0].codigo_seguimiento;
}

const formReserva = document.getElementById('form-reserva-estacionamiento');

if (formReserva) {
  formReserva.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const datos = {
      nombre_pasajero: document.getElementById('re-nombre').value,
      placa: document.getElementById('re-placa').value,
      fecha_hora_entrada: document.getElementById('re-fecha').value,
    };

    const confirmacionEl = document.getElementById('reserva-confirmacion');
    confirmacionEl.classList.remove('visible');

    try {
      const codigo = await guardarReservaEstacionamiento(datos);
      confirmacionEl.innerHTML = `✓ Reserva registrada. Tu código de seguimiento es <strong>${codigo}</strong>. <a href="mis-reservas.html">Ver mis reservas</a>`;
      confirmacionEl.classList.add('visible');
      formReserva.reset();
    } catch (error) {
      console.error(error);
      confirmacionEl.textContent = 'Ocurrió un error al registrar tu reserva. Intenta de nuevo.';
      confirmacionEl.classList.add('visible');
    }
  });
}