import { sql } from '../config/neon-config.js';
import { exigirSesion } from '../auth/auth.js';

const usuario = exigirSesion();

if (usuario && usuario.rol === 'cliente') {
  window.location.href = 'Transporte.html';
}

export async function listarTodos() {
  return await sql`SELECT * FROM reservas_estacionamiento ORDER BY fecha_registro DESC;`;
}

export async function crearRegistro(datos) {
  const codigo = 'COD-' + Date.now().toString().slice(-8);
  await sql`
    INSERT INTO reservas_estacionamiento (codigo_seguimiento, nombre_pasajero, placa, fecha_hora_entrada, estado)
    VALUES (${codigo}, ${datos.nombre_pasajero}, ${datos.placa}, ${datos.fecha_hora_entrada}, 'registrado');
  `;
  return codigo;
}

export async function actualizarComoPanel(id, datos) {
  await sql`
    UPDATE reservas_estacionamiento
    SET nombre_pasajero = ${datos.nombre_pasajero}, placa = ${datos.placa}, estado = ${datos.estado}
    WHERE id = ${id};
  `;
}

export async function eliminarRegistro(id) {
  await sql`DELETE FROM reservas_estacionamiento WHERE id = ${id};`;
}

function formatearFecha(valor) {
  if (!valor) return '—';
  return new Date(valor).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}

function pintarFila(reserva) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${reserva.codigo_seguimiento}</td>
    <td>${reserva.nombre_pasajero}</td>
    <td>${reserva.placa}</td>
    <td>${formatearFecha(reserva.fecha_hora_entrada)}</td>
    <td><span class="estado-badge estado-${reserva.estado}">${reserva.estado}</span></td>
    <td>
      <button type="button" class="btn-fila btn-editar" data-id="${reserva.id}">Editar</button>
      <button type="button" class="btn-fila btn-eliminar" data-id="${reserva.id}">Eliminar</button>
    </td>
  `;
  return tr;
}

async function cargarTabla() {
  const cuerpoTabla = document.getElementById('tabla-panel-body');
  if (!cuerpoTabla) return;

  try {
    const reservas = await listarTodos();
    cuerpoTabla.innerHTML = '';
    reservas.forEach((reserva) => {
      const tr = pintarFila(reserva);
      tr.querySelector('.btn-editar').addEventListener('click', () => abrirModalEditar(reserva));
      tr.querySelector('.btn-eliminar').addEventListener('click', () => confirmarEliminar(reserva.id));
      cuerpoTabla.appendChild(tr);
    });
  } catch (error) {
    console.error(error);
  }
}

const formCrear = document.getElementById('form-crear-panel');
if (formCrear) {
  formCrear.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const datos = {
      nombre_pasajero: document.getElementById('pn-nombre').value,
      placa: document.getElementById('pn-placa').value,
      fecha_hora_entrada: document.getElementById('pn-fecha').value,
    };
    const confirmacionEl = document.getElementById('panel-confirmacion');
    try {
      const codigo = await crearRegistro(datos);
      confirmacionEl.textContent = `✓ Reserva registrada. Código: ${codigo}.`;
      confirmacionEl.classList.add('visible');
      formCrear.reset();
      cargarTabla();
    } catch (error) {
      console.error(error);
      confirmacionEl.textContent = 'Ocurrió un error al registrar la reserva.';
      confirmacionEl.classList.add('visible');
    }
  });
}

const modal = document.getElementById('modal-editar');
const formEditar = document.getElementById('form-editar-panel');

function abrirModalEditar(reserva) {
  document.getElementById('pe-id').value = reserva.id;
  document.getElementById('pe-nombre').value = reserva.nombre_pasajero;
  document.getElementById('pe-placa').value = reserva.placa;
  document.getElementById('pe-estado').value = reserva.estado;
  modal.classList.add('abierto');
}

document.getElementById('btn-cancelar-editar').addEventListener('click', () => {
  modal.classList.remove('abierto');
});

formEditar.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const id = document.getElementById('pe-id').value;
  const datos = {
    nombre_pasajero: document.getElementById('pe-nombre').value,
    placa: document.getElementById('pe-placa').value,
    estado: document.getElementById('pe-estado').value,
  };
  try {
    await actualizarComoPanel(id, datos);
    modal.classList.remove('abierto');
    cargarTabla();
  } catch (error) {
    console.error(error);
    alert('Ocurrió un error al guardar los cambios.');
  }
});

async function confirmarEliminar(id) {
  const seguro = confirm('¿Seguro que quieres eliminar esta reserva? Esta acción no se puede deshacer.');
  if (!seguro) return;

  try {
    await eliminarRegistro(id);
    cargarTabla();
  } catch (error) {
    console.error(error);
    alert('Ocurrió un error al eliminar la reserva.');
  }
}

cargarTabla();

const inputBuscar = document.getElementById('buscar-panel');
if (inputBuscar) {
  inputBuscar.addEventListener('input', () => {
    const termino = inputBuscar.value.trim().toLowerCase();
    const filas = document.querySelectorAll('#tabla-panel-body tr');

    filas.forEach((fila) => {
      const texto = fila.textContent.toLowerCase();
      fila.style.display = texto.includes(termino) ? '' : 'none';
    });
  });
}