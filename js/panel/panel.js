import { sql } from '../config/neon-config.js';
import { exigirSesion, consultarTurno, textoTurno, tipoTurno, expulsar } from '../auth/auth.js';

const usuario = exigirSesion();

if (usuario && usuario.rol === 'cliente') {
  window.location.href = 'Transporte.html';
}

const puedeUsarPanel = !!usuario && usuario.rol !== 'cliente';
const esAdministrador = !!usuario && usuario.rol === 'administrador';
const esEmpleado = !!usuario && usuario.rol === 'empleado';

// ---------- Elementos de la página ----------
const filtroTurno = document.getElementById('filtro-turno');
const inputBuscar = document.getElementById('buscar-panel');
const filtroEstado = document.getElementById('filtro-estado');
const filtroAuditEmpleado = document.getElementById('filtro-audit-empleado');
const filtroAuditFecha = document.getElementById('filtro-audit-fecha');

// ---------- Utilidades ----------
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
  return new Date(valor).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}

function mostrarMensaje(elemento, texto, esError = false) {
  elemento.textContent = texto;
  elemento.classList.toggle('error', esError);
  elemento.classList.add('visible');
}

function mostrarSoloAdmin() {
  document.querySelectorAll('[data-solo-admin]').forEach((el) => {
    el.style.display = '';
  });
}

// ---------- Control de horario (solo empleados) ----------
function mostrarTurno(turno) {
  const info = document.getElementById('info-turno');
  const texto = textoTurno(turno);
  if (!info || !texto) return;
  info.textContent = `Tu horario de trabajo: ${texto} (turno ${tipoTurno(turno)}, hora de Perú)`;
  info.style.display = 'block';
}

async function verificarAcceso() {
  if (!esEmpleado) return true;
  try {
    const turno = await consultarTurno(usuario.id);
    if (!turno || !turno.activo) {
      expulsar('desactivada');
      return false;
    }
    if (!turno.en_turno) {
      expulsar('turno');
      return false;
    }
    mostrarTurno(turno);
    return true;
  } catch (error) {
    console.error(error);
    return true; // si falla la consulta no se expulsa por un error de red
  }
}

async function asegurarTurno() {
  if (!(await verificarAcceso())) {
    throw new Error('Fuera de turno');
  }
}

function esFueraDeTurno(error) {
  return error && error.message === 'Fuera de turno';
}

// ---------- Consultas: reservas ----------
export async function listarTodos() {
  return await sql`SELECT * FROM reservas_estacionamiento ORDER BY fecha_registro DESC;`;
}

export async function listarDeHoy() {
  return await sql`
    SELECT * FROM reservas_estacionamiento
    WHERE fecha_hora_entrada::date = CURRENT_DATE
    ORDER BY fecha_registro DESC;
  `;
}

export async function crearRegistro(datos) {
  await asegurarTurno();
  const codigo = 'COD-' + Date.now().toString().slice(-8);
  await sql`
    INSERT INTO reservas_estacionamiento
      (codigo_seguimiento, nombre_pasajero, placa, fecha_hora_entrada, estado, notas, gestionado_por, fecha_gestion)
    VALUES
      (${codigo}, ${datos.nombre_pasajero}, ${datos.placa}, ${datos.fecha_hora_entrada}, 'registrado', ${datos.notas}, ${usuario.id}, NOW());
  `;
  return codigo;
}

export async function actualizarComoPanel(id, datos) {
  await asegurarTurno();
  await sql`
    UPDATE reservas_estacionamiento
    SET nombre_pasajero = ${datos.nombre_pasajero}, placa = ${datos.placa}, estado = ${datos.estado},
        notas = ${datos.notas}, gestionado_por = ${usuario.id}, fecha_gestion = NOW()
    WHERE id = ${id};
  `;
}

export async function marcarAtendido(id) {
  await asegurarTurno();
  await sql`
    UPDATE reservas_estacionamiento
    SET estado = 'atendido', gestionado_por = ${usuario.id}, fecha_gestion = NOW()
    WHERE id = ${id};
  `;
}

export async function eliminarRegistro(id) {
  if (!esAdministrador) {
    throw new Error('Solo el administrador puede eliminar reservas.');
  }
  await sql`DELETE FROM reservas_estacionamiento WHERE id = ${id};`;
}

// ---------- Consultas: resumen y estadísticas ----------
export async function contarDeHoyPorEstado() {
  return await sql`
    SELECT estado, COUNT(*)::int AS total
    FROM reservas_estacionamiento
    WHERE fecha_hora_entrada::date = CURRENT_DATE
    GROUP BY estado;
  `;
}

export async function contarPorEstado() {
  return await sql`
    SELECT estado, COUNT(*)::int AS total
    FROM reservas_estacionamiento
    GROUP BY estado;
  `;
}

export async function empleadoConMasGestiones() {
  const filas = await sql`
    SELECT u.nombre, COUNT(*)::int AS total
    FROM reservas_estacionamiento r
    JOIN usuarios u ON r.gestionado_por = u.id
    WHERE u.rol = 'empleado'
    GROUP BY u.id, u.nombre
    ORDER BY total DESC
    LIMIT 1;
  `;
  return filas[0] || null;
}

// ---------- Consultas: empleados ----------
export async function listarEmpleados() {
  return await sql`
    SELECT id, nombre, correo, activo, hora_inicio, hora_fin
    FROM usuarios WHERE rol = 'empleado' ORDER BY nombre;
  `;
}

export async function crearEmpleado(datos) {
  await sql`
    INSERT INTO usuarios (nombre, correo, contrasena, rol, hora_inicio, hora_fin)
    VALUES (${datos.nombre}, ${datos.correo}, ${datos.contrasena}, 'empleado', ${datos.hora_inicio}, ${datos.hora_fin});
  `;
}

export async function cambiarEstadoEmpleado(id, activo) {
  await sql`UPDATE usuarios SET activo = ${activo} WHERE id = ${id} AND rol = 'empleado';`;
}

export async function cambiarHorarioEmpleado(id, inicio, fin) {
  await sql`UPDATE usuarios SET hora_inicio = ${inicio}, hora_fin = ${fin} WHERE id = ${id} AND rol = 'empleado';`;
}

// ---------- Consultas: auditoría ----------
export async function listarAuditoria() {
  return await sql`
    SELECT r.codigo_seguimiento, r.nombre_pasajero, r.estado, r.fecha_gestion,
           to_char(r.fecha_gestion, 'YYYY-MM-DD') AS fecha_dia,
           u.id AS empleado_id, u.nombre AS empleado_nombre, u.correo AS empleado_correo
    FROM reservas_estacionamiento r
    JOIN usuarios u ON r.gestionado_por = u.id AND u.rol = 'empleado'
    ORDER BY r.fecha_gestion DESC;
  `;
}

// ---------- Tabla de reservas ----------
function pintarFila(reserva) {
  const tr = document.createElement('tr');
  tr.dataset.estado = reserva.estado;

  const botonAtender = reserva.estado === 'registrado'
    ? '<button type="button" class="btn-fila btn-atender">Marcar atendido</button>'
    : '';
  const botonEliminar = esAdministrador
    ? '<button type="button" class="btn-fila btn-eliminar">Eliminar</button>'
    : '';

  tr.innerHTML = `
    <td>${escaparHTML(reserva.codigo_seguimiento)}</td>
    <td>${escaparHTML(reserva.nombre_pasajero)}</td>
    <td>${escaparHTML(reserva.placa)}</td>
    <td>${formatearFecha(reserva.fecha_hora_entrada)}</td>
    <td><span class="estado-badge estado-${reserva.estado}">${reserva.estado}</span></td>
    <td class="celda-notas">${escaparHTML(reserva.notas) || '—'}</td>
    <td class="celda-acciones">
      ${botonAtender}
      <button type="button" class="btn-fila btn-editar">Editar</button>
      ${botonEliminar}
    </td>
  `;
  return tr;
}

function aplicarFiltros() {
  const termino = inputBuscar ? inputBuscar.value.trim().toLowerCase() : '';
  const estado = filtroEstado ? filtroEstado.value : '';

  document.querySelectorAll('#tabla-panel-body tr').forEach((fila) => {
    // Se busca solo en código, pasajero y placa (no en los textos de los botones)
    const texto = [0, 1, 2].map((i) => fila.cells[i].textContent).join(' ').toLowerCase();
    const coincideTexto = texto.includes(termino);
    const coincideEstado = !estado || fila.dataset.estado === estado;
    fila.style.display = coincideTexto && coincideEstado ? '' : 'none';
  });
}

let primeraCarga = true;

async function cargarTabla(soloHoy = false) {
  const cuerpoTabla = document.getElementById('tabla-panel-body');
  if (!cuerpoTabla) return;

  try {
    const reservas = soloHoy ? await listarDeHoy() : await listarTodos();
    cuerpoTabla.innerHTML = '';
    reservas.forEach((reserva, i) => {
      const tr = pintarFila(reserva);

      if (primeraCarga) {
        tr.classList.add('fila-entrada');
        tr.style.animationDelay = `${Math.min(i * 40, 600)}ms`;
      }

      const botonAtender = tr.querySelector('.btn-atender');
      if (botonAtender) botonAtender.addEventListener('click', () => marcarComoAtendida(reserva.id, tr));

      tr.querySelector('.btn-editar').addEventListener('click', () => abrirModalEditar(reserva));

      const botonEliminar = tr.querySelector('.btn-eliminar');
      if (botonEliminar) botonEliminar.addEventListener('click', () => confirmarEliminar(reserva.id));

      cuerpoTabla.appendChild(tr);
    });
    primeraCarga = false;
    aplicarFiltros();
  } catch (error) {
    console.error(error);
  }
}

// ---------- Resumen del día y estadísticas ----------
async function cargarContadores() {
  try {
    const filas = await contarDeHoyPorEstado();
    const totales = { registrado: 0, atendido: 0, cancelado: 0 };
    filas.forEach((f) => { totales[f.estado] = f.total; });
    document.getElementById('cnt-registrado').textContent = totales.registrado;
    document.getElementById('cnt-atendido').textContent = totales.atendido;
    document.getElementById('cnt-cancelado').textContent = totales.cancelado;
  } catch (error) {
    console.error(error);
  }
}

async function cargarEstadisticas() {
  try {
    const filas = await contarPorEstado();
    const totales = { registrado: 0, atendido: 0, cancelado: 0 };
    filas.forEach((f) => { totales[f.estado] = f.total; });
    const total = totales.registrado + totales.atendido + totales.cancelado;

    document.getElementById('est-total').textContent = total;
    document.getElementById('est-registrado').textContent = totales.registrado;
    document.getElementById('est-atendido').textContent = totales.atendido;
    document.getElementById('est-cancelado').textContent = totales.cancelado;

    const top = await empleadoConMasGestiones();
    document.getElementById('est-top-empleado').textContent = top ? `${top.nombre} (${top.total})` : '—';
  } catch (error) {
    console.error(error);
  }
}

// ---------- Acciones sobre reservas ----------
async function marcarComoAtendida(id, fila) {
  try {
    await marcarAtendido(id);

    // El badge cambia de color con transición antes de recargar la tabla
    const badge = fila.querySelector('.estado-badge');
    badge.className = 'estado-badge estado-atendido';
    badge.textContent = 'atendido';
    fila.dataset.estado = 'atendido';
    const botonAtender = fila.querySelector('.btn-atender');
    if (botonAtender) botonAtender.remove();
    fila.classList.add('fila-destacada');

    setTimeout(recargarTodo, 900);
  } catch (error) {
    if (esFueraDeTurno(error)) return;
    console.error(error);
    alert('Ocurrió un error al marcar la reserva como atendida.');
  }
}

async function confirmarEliminar(id) {
  const seguro = confirm('¿Seguro que quieres eliminar esta reserva? Esta acción no se puede deshacer.');
  if (!seguro) return;

  try {
    await eliminarRegistro(id);
    recargarTodo();
  } catch (error) {
    console.error(error);
    alert('Ocurrió un error al eliminar la reserva.');
  }
}

function recargarTodo() {
  cargarTabla(filtroTurno ? filtroTurno.checked : false);
  cargarContadores();
  if (esAdministrador) {
    cargarEstadisticas();
    cargarAuditoria();
  }
}

// ---------- Crear reserva ----------
const formCrear = document.getElementById('form-crear-panel');
if (formCrear) {
  formCrear.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const datos = {
      nombre_pasajero: document.getElementById('pn-nombre').value,
      placa: document.getElementById('pn-placa').value,
      fecha_hora_entrada: document.getElementById('pn-fecha').value,
      notas: document.getElementById('pn-notas').value.trim() || null,
    };
    const confirmacionEl = document.getElementById('panel-confirmacion');
    try {
      const codigo = await crearRegistro(datos);
      mostrarMensaje(confirmacionEl, `✓ Reserva registrada. Código: ${codigo}.`);
      formCrear.reset();
      recargarTodo();
    } catch (error) {
      if (esFueraDeTurno(error)) return;
      console.error(error);
      mostrarMensaje(confirmacionEl, 'Ocurrió un error al registrar la reserva.', true);
    }
  });
}

// ---------- Editar reserva (modal) ----------
const modal = document.getElementById('modal-editar');
const formEditar = document.getElementById('form-editar-panel');

function abrirModalEditar(reserva) {
  document.getElementById('pe-id').value = reserva.id;
  document.getElementById('pe-nombre').value = reserva.nombre_pasajero;
  document.getElementById('pe-placa').value = reserva.placa;
  document.getElementById('pe-estado').value = reserva.estado;
  document.getElementById('pe-notas').value = reserva.notas || '';
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
    notas: document.getElementById('pe-notas').value.trim() || null,
  };
  try {
    await actualizarComoPanel(id, datos);
    modal.classList.remove('abierto');
    recargarTodo();
  } catch (error) {
    if (esFueraDeTurno(error)) return;
    console.error(error);
    alert('Ocurrió un error al guardar los cambios.');
  }
});

// ---------- Filtros de la tabla ----------
if (inputBuscar) inputBuscar.addEventListener('input', aplicarFiltros);
if (filtroEstado) filtroEstado.addEventListener('change', aplicarFiltros);
if (filtroTurno) {
  filtroTurno.addEventListener('change', () => cargarTabla(filtroTurno.checked));
}

// ---------- Exportar a CSV (administrador) ----------
function celdaCSV(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return '"' + texto.replace(/"/g, '""') + '"';
}

async function exportarCSV() {
  try {
    const reservas = await listarTodos();
    const encabezados = ['Código', 'Pasajero', 'Placa', 'Entrada', 'Estado', 'Notas', 'Registrado el'];
    const filas = reservas.map((r) => [
      r.codigo_seguimiento,
      r.nombre_pasajero,
      r.placa,
      formatearFecha(r.fecha_hora_entrada),
      r.estado,
      r.notas,
      formatearFecha(r.fecha_registro),
    ].map(celdaCSV).join(','));

    // \uFEFF hace que Excel lea bien las tildes y la ñ
    const contenido = '\uFEFF' + [encabezados.map(celdaCSV).join(','), ...filas].join('\r\n');
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'reservas_estacionamiento.csv';
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
    alert('Ocurrió un error al exportar el archivo.');
  }
}

const botonExportar = document.getElementById('btn-exportar-csv');
if (botonExportar) botonExportar.addEventListener('click', exportarCSV);

// ---------- Gestión de empleados y horarios (administrador) ----------
async function guardarHorario(id, inicio, fin) {
  try {
    await cambiarHorarioEmpleado(id, inicio, fin);
    cargarEmpleados();
  } catch (error) {
    console.error(error);
    alert('Ocurrió un error al guardar el horario.');
  }
}

async function cargarEmpleados() {
  const cuerpo = document.getElementById('tabla-empleados-body');
  if (!cuerpo) return;

  try {
    const empleados = await listarEmpleados();
    cuerpo.innerHTML = '';
    empleados.forEach((emp) => {
      const tipo = tipoTurno(emp);
      const inicio = emp.hora_inicio ? emp.hora_inicio.slice(0, 5) : '';
      const fin = emp.hora_fin ? emp.hora_fin.slice(0, 5) : '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escaparHTML(emp.nombre)}</td>
        <td>${escaparHTML(emp.correo)}</td>
        <td><span class="estado-badge ${emp.activo ? 'estado-registrado' : 'estado-cancelado'}">${emp.activo ? 'activo' : 'desactivado'}</span></td>
        <td>
          <div class="editor-horario">
            <input type="time" class="hora-inicio" value="${inicio}" aria-label="Hora de entrada">
            <span>a</span>
            <input type="time" class="hora-fin" value="${fin}" aria-label="Hora de salida">
            <button type="button" class="btn-fila btn-editar btn-guardar-horario">Guardar</button>
            <button type="button" class="btn-fila btn-quitar-horario">Sin límite</button>
          </div>
          <span class="etiqueta-turno turno-${tipo || 'libre'}">${tipo ? 'Turno ' + tipo : 'Sin restricción de horario'}</span>
        </td>
        <td><button type="button" class="btn-fila btn-cambiar-estado ${emp.activo ? 'btn-eliminar' : 'btn-editar'}">${emp.activo ? 'Desactivar' : 'Activar'}</button></td>
      `;

      tr.querySelector('.btn-guardar-horario').addEventListener('click', () => {
        const nuevoInicio = tr.querySelector('.hora-inicio').value;
        const nuevoFin = tr.querySelector('.hora-fin').value;
        if (!nuevoInicio || !nuevoFin) {
          alert('Completa la hora de entrada y la de salida, o usa "Sin límite".');
          return;
        }
        guardarHorario(emp.id, nuevoInicio, nuevoFin);
      });

      tr.querySelector('.btn-quitar-horario').addEventListener('click', () => {
        guardarHorario(emp.id, null, null);
      });

      tr.querySelector('.btn-cambiar-estado').addEventListener('click', async () => {
        try {
          await cambiarEstadoEmpleado(emp.id, !emp.activo);
          cargarEmpleados();
        } catch (error) {
          console.error(error);
          alert('Ocurrió un error al cambiar el estado del empleado.');
        }
      });

      cuerpo.appendChild(tr);
    });
  } catch (error) {
    console.error(error);
  }
}

const formEmpleado = document.getElementById('form-crear-empleado');
if (formEmpleado) {
  formEmpleado.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const inicio = document.getElementById('em-inicio').value || null;
    const fin = document.getElementById('em-fin').value || null;
    const mensajeEl = document.getElementById('empleado-confirmacion');

    if ((inicio && !fin) || (!inicio && fin)) {
      mostrarMensaje(mensajeEl, 'Completa la entrada y la salida del turno, o deja ambas vacías.', true);
      return;
    }

    const datos = {
      nombre: document.getElementById('em-nombre').value,
      correo: document.getElementById('em-correo').value,
      contrasena: document.getElementById('em-contrasena').value,
      hora_inicio: inicio,
      hora_fin: fin,
    };
    try {
      await crearEmpleado(datos);
      mostrarMensaje(mensajeEl, '✓ Cuenta de empleado creada.');
      formEmpleado.reset();
      cargarEmpleados();
    } catch (error) {
      console.error(error);
      mostrarMensaje(mensajeEl, 'No se pudo crear la cuenta. Verifica que el correo no esté ya registrado.', true);
    }
  });
}

// ---------- Auditoría (administrador) ----------
function aplicarFiltrosAuditoria() {
  const empleado = filtroAuditEmpleado ? filtroAuditEmpleado.value : '';
  const fecha = filtroAuditFecha ? filtroAuditFecha.value : '';

  document.querySelectorAll('#tabla-auditoria-body tr').forEach((fila) => {
    const coincideEmpleado = !empleado || fila.dataset.empleado === empleado;
    const coincideFecha = !fecha || fila.dataset.fecha === fecha;
    fila.style.display = coincideEmpleado && coincideFecha ? '' : 'none';
  });
}

async function cargarAuditoria() {
  const cuerpo = document.getElementById('tabla-auditoria-body');
  if (!cuerpo) return;

  try {
    const registros = await listarAuditoria();

    // Llena el selector con los empleados que aparecen en el registro
    const seleccionado = filtroAuditEmpleado.value;
    const empleados = new Map();
    registros.forEach((r) => empleados.set(String(r.empleado_id), r.empleado_nombre));
    filtroAuditEmpleado.innerHTML = '<option value="">Todos los empleados</option>' +
      [...empleados].map(([id, nombre]) => `<option value="${id}">${escaparHTML(nombre)}</option>`).join('');
    filtroAuditEmpleado.value = seleccionado;

    cuerpo.innerHTML = '';
    registros.forEach((r) => {
      const tr = document.createElement('tr');
      tr.dataset.empleado = r.empleado_id;
      tr.dataset.fecha = r.fecha_dia;
      tr.innerHTML = `
        <td>${escaparHTML(r.codigo_seguimiento)}</td>
        <td>${escaparHTML(r.nombre_pasajero)}</td>
        <td><span class="estado-badge estado-${r.estado}">${r.estado}</span></td>
        <td>${escaparHTML(r.empleado_nombre)} (${escaparHTML(r.empleado_correo)})</td>
        <td>${formatearFecha(r.fecha_gestion)}</td>
      `;
      cuerpo.appendChild(tr);
    });
    aplicarFiltrosAuditoria();
  } catch (error) {
    console.error(error);
  }
}

if (filtroAuditEmpleado) filtroAuditEmpleado.addEventListener('change', aplicarFiltrosAuditoria);
if (filtroAuditFecha) filtroAuditFecha.addEventListener('change', aplicarFiltrosAuditoria);

const botonLimpiarAudit = document.getElementById('btn-limpiar-audit');
if (botonLimpiarAudit) {
  botonLimpiarAudit.addEventListener('click', () => {
    filtroAuditEmpleado.value = '';
    filtroAuditFecha.value = '';
    aplicarFiltrosAuditoria();
  });
}

// ---------- Arranque ----------
async function iniciar() {
  if (!puedeUsarPanel) return;

  // Un empleado fuera de su horario no llega a ver datos
  if (!(await verificarAcceso())) return;

  recargarTodo();
  if (esAdministrador) {
    mostrarSoloAdmin();
    cargarEmpleados();
  }

  if (esEmpleado) {
    // Revisa el horario cada 30 segundos y al volver a esta pestaña
    setInterval(verificarAcceso, 30000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) verificarAcceso();
    });
  }
}

iniciar();