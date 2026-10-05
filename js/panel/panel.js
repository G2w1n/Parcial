import { sql } from '../config/neon-config.js';
import { exigirSesion, consultarTurno, textoTurno, tipoTurno, expulsar } from '../auth/auth.js';
import { costoEstimado, etiquetaServicio, formatearSoles, llenarSelectorServicio } from '../config/tarifas.js';

const usuario = exigirSesion();

if (usuario && usuario.rol === 'cliente') {
  window.location.href = 'Transporte.html';
}

const puedeUsarPanel = !!usuario && usuario.rol !== 'cliente';
const esAdministrador = !!usuario && usuario.rol === 'administrador';
const esEmpleado = !!usuario && usuario.rol === 'empleado';

const sinAnimaciones = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Elementos de la página ----------
const filtroTurno = document.getElementById('filtro-turno');
const inputBuscar = document.getElementById('buscar-panel');
const filtroEstado = document.getElementById('filtro-estado');
const filtroAuditEmpleado = document.getElementById('filtro-audit-empleado');
const filtroAuditFecha = document.getElementById('filtro-audit-fecha');

// Selectores de tipo de servicio (crear y editar) con su costo estimado
const selectCrearTipo = document.getElementById('pn-tipo');
const costoCrear = document.getElementById('pn-costo');
const selectEditarTipo = document.getElementById('pe-tipo');
const costoEditar = document.getElementById('pe-costo');

function mostrarCosto(select, destino) {
  if (select && destino) destino.textContent = formatearSoles(costoEstimado(select.value));
}

if (selectCrearTipo) {
  llenarSelectorServicio(selectCrearTipo);
  mostrarCosto(selectCrearTipo, costoCrear);
  selectCrearTipo.addEventListener('change', () => mostrarCosto(selectCrearTipo, costoCrear));
}
if (selectEditarTipo) {
  llenarSelectorServicio(selectEditarTipo);
  selectEditarTipo.addEventListener('change', () => mostrarCosto(selectEditarTipo, costoEditar));
}

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

// Aviso emergente (usa la animación de la Semana 5 al entrar)
function avisar(texto, tipo = 'exito') {
  let contenedor = document.getElementById('avisos');
  if (!contenedor) {
    contenedor = document.createElement('div');
    contenedor.id = 'avisos';
    contenedor.className = 'avisos';
    contenedor.setAttribute('role', 'status');
    contenedor.setAttribute('aria-live', 'polite');
    document.body.appendChild(contenedor);
  }

  const aviso = document.createElement('div');
  aviso.className = `aviso aviso-${tipo}`;
  aviso.innerHTML = `
    <span class="aviso-icono" aria-hidden="true">${tipo === 'error' ? '!' : '✓'}</span>
    <span class="aviso-texto"></span>
    <span class="aviso-barra"></span>
  `;
  aviso.querySelector('.aviso-texto').textContent = texto;
  contenedor.appendChild(aviso);

  const quitar = () => {
    aviso.classList.add('saliendo');
    aviso.addEventListener('animationend', (evento) => {
      if (evento.target === aviso) aviso.remove();
    });
    setTimeout(() => aviso.remove(), 600);
  };
  aviso.addEventListener('click', quitar);
  setTimeout(quitar, 3800);
}

// Botón con círculo que gira mientras se ejecuta una acción
async function conCarga(boton, accion) {
  if (boton) {
    boton.disabled = true;
    boton.classList.add('cargando');
  }
  try {
    return await accion();
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.classList.remove('cargando');
    }
  }
}

// Número que cuenta hasta su valor
function animarNumero(elemento, destino) {
  if (!elemento) return;
  const inicio = Number(elemento.dataset.valor || 0);
  const esPrimera = elemento.dataset.valor === undefined;
  if (!esPrimera && inicio === destino) return;
  elemento.dataset.valor = destino;

  if (sinAnimaciones) {
    elemento.textContent = destino;
    return;
  }

  if (!esPrimera) {
    elemento.classList.remove('latido');
    void elemento.offsetWidth;
    elemento.classList.add('latido');
    elemento.addEventListener('animationend', () => elemento.classList.remove('latido'), { once: true });
  }

  const duracion = 700;
  const t0 = performance.now();
  elemento._animacion = t0;

  function paso(ahora) {
    if (elemento._animacion !== t0) return;
    const progreso = Math.min((ahora - t0) / duracion, 1);
    const suave = 1 - Math.pow(1 - progreso, 3);
    elemento.textContent = Math.round(inicio + (destino - inicio) * suave);
    if (progreso < 1) requestAnimationFrame(paso);
  }
  requestAnimationFrame(paso);
}

// Filas grises con brillo mientras llegan los datos
function mostrarEsqueleto(cuerpo, columnas, filas = 4) {
  cuerpo.innerHTML = '';
  for (let i = 0; i < filas; i++) {
    const tr = document.createElement('tr');
    tr.className = 'fila-esqueleto';
    tr.setAttribute('aria-hidden', 'true');
    tr.innerHTML = '<td><span class="barra-esqueleto"></span></td>'.repeat(columnas);
    cuerpo.appendChild(tr);
  }
}

// Las secciones aparecen suavemente al hacer scroll
function prepararRevelado() {
  if (sinAnimaciones || !('IntersectionObserver' in window)) return;

  const objetivos = document.querySelectorAll('.panel > .wrap > .panel-crear, #seccion-empleados, #seccion-auditoria');
  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
      if (entrada.isIntersecting) {
        entrada.target.classList.add('visible');
        observador.unobserve(entrada.target);
      }
    });
  }, { threshold: 0.1 });

  objetivos.forEach((elemento) => {
    elemento.classList.add('revelar');
    observador.observe(elemento);
  });
}

// ---------- Control de horario (solo empleados) ----------
function horaPeruEnMinutos() {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const horas = Number(partes.find((p) => p.type === 'hour').value) % 24;
  const minutos = Number(partes.find((p) => p.type === 'minute').value);
  return horas * 60 + minutos;
}

function aMinutos(hora) {
  const [h, m] = hora.split(':');
  return Number(h) * 60 + Number(m);
}

function progresoTurno(turno) {
  const inicio = aMinutos(turno.hora_inicio);
  const fin = aMinutos(turno.hora_fin);
  const ahora = horaPeruEnMinutos();

  const total = inicio < fin ? fin - inicio : 1440 - inicio + fin;
  let transcurrido = ahora - inicio;
  if (transcurrido < 0) transcurrido += 1440;
  transcurrido = Math.min(Math.max(transcurrido, 0), total);

  return { total, transcurrido, restante: total - transcurrido };
}

function textoRestante(minutos) {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return horas > 0 ? `${horas} h ${resto} min` : `${resto} min`;
}

function mostrarTurno(turno) {
  const info = document.getElementById('info-turno');
  const texto = textoTurno(turno);
  if (!info || !texto) return;

  let progreso = info.querySelector('.turno-progreso');
  if (!progreso) {
    info.innerHTML = `
      <span class="punto-turno" aria-hidden="true"></span>
      <span class="turno-texto"></span>
      <span class="turno-barra" aria-hidden="true"><span class="turno-progreso"></span></span>
    `;
    progreso = info.querySelector('.turno-progreso');
  }

  const datos = progresoTurno(turno);
  info.querySelector('.turno-texto').textContent =
    `Tu horario: ${texto} (turno ${tipoTurno(turno)}, hora de Perú) · Te quedan ${textoRestante(datos.restante)}`;

  info.style.display = 'block';
  const porcentaje = Math.round((datos.transcurrido / datos.total) * 100);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { progreso.style.width = `${porcentaje}%`; });
  });
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
      (codigo_seguimiento, nombre_pasajero, placa, fecha_hora_entrada, estado, notas, tipo_servicio, costo_estimado, gestionado_por, fecha_gestion)
    VALUES
      (${codigo}, ${datos.nombre_pasajero}, ${datos.placa}, ${datos.fecha_hora_entrada}, 'registrado', ${datos.notas},
       ${datos.tipo_servicio}, ${datos.costo_estimado}, ${usuario.id}, NOW());
  `;
  return codigo;
}

export async function actualizarComoPanel(id, datos) {
  await asegurarTurno();
  await sql`
    UPDATE reservas_estacionamiento
    SET nombre_pasajero = ${datos.nombre_pasajero}, placa = ${datos.placa}, estado = ${datos.estado},
        notas = ${datos.notas}, tipo_servicio = ${datos.tipo_servicio}, costo_estimado = ${datos.costo_estimado},
        gestionado_por = ${usuario.id}, fecha_gestion = NOW()
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
    <td><span class="servicio-badge servicio-${reserva.tipo_servicio}">${etiquetaServicio(reserva.tipo_servicio)}</span></td>
    <td>${formatearSoles(reserva.costo_estimado)}</td>
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
  const cuerpo = document.getElementById('tabla-panel-body');
  if (!cuerpo) return;

  const filas = cuerpo.querySelectorAll('tr[data-estado]');
  let visibles = 0;

  filas.forEach((fila) => {
    // Se busca solo en código, pasajero y placa (no en los textos de los botones)
    const texto = [0, 1, 2].map((i) => fila.cells[i].textContent).join(' ').toLowerCase();
    const coincide = texto.includes(termino) && (!estado || fila.dataset.estado === estado);
    const estabaOculta = fila.style.display === 'none';

    fila.style.display = coincide ? '' : 'none';
    if (coincide) {
      visibles++;
      if (estabaOculta && !sinAnimaciones) {
        fila.classList.remove('fila-aparece');
        void fila.offsetWidth;
        fila.classList.add('fila-aparece');
      }
    }
  });

  let vacia = cuerpo.querySelector('.fila-vacia');
  if (filas.length > 0 && visibles === 0) {
    if (!vacia) {
      vacia = document.createElement('tr');
      vacia.className = 'fila-vacia';
      vacia.innerHTML = '<td colspan="9">No hay reservas que coincidan con tu búsqueda.</td>';
      cuerpo.appendChild(vacia);
    }
  } else if (vacia) {
    vacia.remove();
  }
}

let primeraCarga = true;

async function cargarTabla(soloHoy = false, destacar = null) {
  const cuerpoTabla = document.getElementById('tabla-panel-body');
  if (!cuerpoTabla) return;

  if (!cuerpoTabla.dataset.cargado) mostrarEsqueleto(cuerpoTabla, 9);

  try {
    const reservas = soloHoy ? await listarDeHoy() : await listarTodos();
    cuerpoTabla.innerHTML = '';
    let filaDestacada = null;

    reservas.forEach((reserva, i) => {
      const tr = pintarFila(reserva);

      if (destacar && reserva.codigo_seguimiento === destacar) {
        tr.classList.add('fila-nueva');
        filaDestacada = tr;
      } else if (primeraCarga) {
        tr.classList.add('fila-entrada');
        tr.style.animationDelay = `${Math.min(i * 40, 600)}ms`;
      }

      const botonAtender = tr.querySelector('.btn-atender');
      if (botonAtender) botonAtender.addEventListener('click', () => marcarComoAtendida(reserva.id, tr));

      tr.querySelector('.btn-editar').addEventListener('click', () => abrirModalEditar(reserva));

      const botonEliminar = tr.querySelector('.btn-eliminar');
      if (botonEliminar) botonEliminar.addEventListener('click', () => confirmarEliminar(reserva.id, tr));

      cuerpoTabla.appendChild(tr);
    });

    cuerpoTabla.dataset.cargado = '1';
    primeraCarga = false;
    aplicarFiltros();

    if (filaDestacada) {
      filaDestacada.scrollIntoView({ behavior: sinAnimaciones ? 'auto' : 'smooth', block: 'nearest' });
    }
  } catch (error) {
    console.error(error);
    cuerpoTabla.innerHTML = '';
    avisar('No se pudieron cargar las reservas.', 'error');
  }
}

// ---------- Resumen del día y estadísticas ----------
async function cargarContadores() {
  try {
    const filas = await contarDeHoyPorEstado();
    const totales = { registrado: 0, atendido: 0, cancelado: 0 };
    filas.forEach((f) => { totales[f.estado] = f.total; });
    animarNumero(document.getElementById('cnt-registrado'), totales.registrado);
    animarNumero(document.getElementById('cnt-atendido'), totales.atendido);
    animarNumero(document.getElementById('cnt-cancelado'), totales.cancelado);
  } catch (error) {
    console.error(error);
  }
}

function actualizarBarraEstados(totales, total) {
  const seccion = document.getElementById('seccion-estadisticas');
  if (!seccion) return;

  let barra = seccion.querySelector('.barra-estados');
  if (!barra) {
    barra = document.createElement('div');
    barra.className = 'barra-estados';
    barra.setAttribute('role', 'img');
    barra.innerHTML = '<span class="seg seg-registrado"></span><span class="seg seg-atendido"></span><span class="seg seg-cancelado"></span>';
    seccion.appendChild(barra);
  }

  barra.setAttribute('aria-label',
    `Registradas ${totales.registrado}, atendidas ${totales.atendido}, canceladas ${totales.cancelado}`);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ['registrado', 'atendido', 'cancelado'].forEach((clave) => {
        const segmento = barra.querySelector(`.seg-${clave}`);
        segmento.style.width = total ? `${(totales[clave] / total) * 100}%` : '0%';
        segmento.title = `${clave}: ${totales[clave]}`;
      });
    });
  });
}

async function cargarEstadisticas() {
  try {
    const filas = await contarPorEstado();
    const totales = { registrado: 0, atendido: 0, cancelado: 0 };
    filas.forEach((f) => { totales[f.estado] = f.total; });
    const total = totales.registrado + totales.atendido + totales.cancelado;

    animarNumero(document.getElementById('est-total'), total);
    animarNumero(document.getElementById('est-registrado'), totales.registrado);
    animarNumero(document.getElementById('est-atendido'), totales.atendido);
    animarNumero(document.getElementById('est-cancelado'), totales.cancelado);
    actualizarBarraEstados(totales, total);

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

    avisar('Reserva marcada como atendida.');
    setTimeout(() => recargarTodo(), sinAnimaciones ? 0 : 900);
  } catch (error) {
    if (esFueraDeTurno(error)) return;
    console.error(error);
    avisar('No se pudo marcar la reserva como atendida.', 'error');
  }
}

async function confirmarEliminar(id, fila) {
  const seguro = confirm('¿Seguro que quieres eliminar esta reserva? Esta acción no se puede deshacer.');
  if (!seguro) return;

  try {
    await eliminarRegistro(id);
    avisar('Reserva eliminada.');
    fila.classList.add('fila-saliendo');
    setTimeout(() => recargarTodo(), sinAnimaciones ? 0 : 450);
  } catch (error) {
    console.error(error);
    avisar('No se pudo eliminar la reserva.', 'error');
  }
}

function recargarTodo(destacar = null) {
  cargarTabla(filtroTurno ? filtroTurno.checked : false, destacar);
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
    const tipo = selectCrearTipo.value;
    const datos = {
      nombre_pasajero: document.getElementById('pn-nombre').value,
      placa: document.getElementById('pn-placa').value,
      fecha_hora_entrada: document.getElementById('pn-fecha').value,
      notas: document.getElementById('pn-notas').value.trim() || null,
      tipo_servicio: tipo,
      costo_estimado: costoEstimado(tipo),
    };
    const confirmacionEl = document.getElementById('panel-confirmacion');
    const boton = formCrear.querySelector('button[type="submit"]');
    try {
      const codigo = await conCarga(boton, () => crearRegistro(datos));
      mostrarMensaje(confirmacionEl, `✓ Reserva registrada. Código: ${codigo}.`);
      avisar(`Reserva ${codigo} registrada.`);
      formCrear.reset();
      mostrarCosto(selectCrearTipo, costoCrear);
      recargarTodo(codigo);
    } catch (error) {
      if (esFueraDeTurno(error)) return;
      console.error(error);
      mostrarMensaje(confirmacionEl, 'Ocurrió un error al registrar la reserva.', true);
      avisar('No se pudo registrar la reserva.', 'error');
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
  selectEditarTipo.value = reserva.tipo_servicio || 'normal';
  mostrarCosto(selectEditarTipo, costoEditar);
  modal.classList.remove('cerrando');
  modal.classList.add('abierto');
  setTimeout(() => document.getElementById('pe-nombre').focus(), 50);
}

function cerrarModal() {
  if (!modal.classList.contains('abierto') || modal.classList.contains('cerrando')) return;
  modal.classList.add('cerrando');
  setTimeout(() => modal.classList.remove('abierto', 'cerrando'), sinAnimaciones ? 0 : 180);
}

document.getElementById('btn-cancelar-editar').addEventListener('click', cerrarModal);
modal.addEventListener('click', (evento) => {
  if (evento.target === modal) cerrarModal();
});
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape') cerrarModal();
});

formEditar.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const id = document.getElementById('pe-id').value;
  const tipo = selectEditarTipo.value;
  const datos = {
    nombre_pasajero: document.getElementById('pe-nombre').value,
    placa: document.getElementById('pe-placa').value,
    estado: document.getElementById('pe-estado').value,
    notas: document.getElementById('pe-notas').value.trim() || null,
    tipo_servicio: tipo,
    costo_estimado: costoEstimado(tipo),
  };
  const boton = formEditar.querySelector('button[type="submit"]');
  try {
    await conCarga(boton, () => actualizarComoPanel(id, datos));
    cerrarModal();
    avisar('Cambios guardados.');
    recargarTodo();
  } catch (error) {
    if (esFueraDeTurno(error)) return;
    console.error(error);
    avisar('No se pudieron guardar los cambios.', 'error');
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
    const encabezados = ['Código', 'Pasajero', 'Placa', 'Servicio', 'Costo estimado (S/)', 'Entrada', 'Estado', 'Notas', 'Registrado el'];
    const filas = reservas.map((r) => [
      r.codigo_seguimiento,
      r.nombre_pasajero,
      r.placa,
      etiquetaServicio(r.tipo_servicio),
      r.costo_estimado === null || r.costo_estimado === undefined ? '' : Number(r.costo_estimado).toFixed(2),
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
    avisar('Archivo CSV descargado.');
  } catch (error) {
    console.error(error);
    avisar('No se pudo exportar el archivo.', 'error');
  }
}

const botonExportar = document.getElementById('btn-exportar-csv');
if (botonExportar) {
  botonExportar.addEventListener('click', () => conCarga(botonExportar, exportarCSV));
}

// ---------- Gestión de empleados y horarios (administrador) ----------
let primeraCargaEmpleados = true;

async function guardarHorario(id, inicio, fin, boton) {
  try {
    await conCarga(boton, () => cambiarHorarioEmpleado(id, inicio, fin));
    avisar(inicio ? 'Horario actualizado.' : 'Se quitó la restricción de horario.');
    cargarEmpleados(id);
  } catch (error) {
    console.error(error);
    avisar('No se pudo guardar el horario.', 'error');
  }
}

async function cargarEmpleados(destacarId = null) {
  const cuerpo = document.getElementById('tabla-empleados-body');
  if (!cuerpo) return;

  if (!cuerpo.dataset.cargado) mostrarEsqueleto(cuerpo, 5, 3);

  try {
    const empleados = await listarEmpleados();
    cuerpo.innerHTML = '';
    empleados.forEach((emp, i) => {
      const tipo = tipoTurno(emp);
      const inicio = emp.hora_inicio ? emp.hora_inicio.slice(0, 5) : '';
      const fin = emp.hora_fin ? emp.hora_fin.slice(0, 5) : '';

      const tr = document.createElement('tr');
      if (destacarId !== null && emp.id === destacarId) {
        tr.classList.add('fila-destacada');
      } else if (primeraCargaEmpleados) {
        tr.classList.add('fila-entrada');
        tr.style.animationDelay = `${Math.min(i * 60, 400)}ms`;
      }

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

      const botonGuardar = tr.querySelector('.btn-guardar-horario');
      botonGuardar.addEventListener('click', () => {
        const nuevoInicio = tr.querySelector('.hora-inicio').value;
        const nuevoFin = tr.querySelector('.hora-fin').value;
        if (!nuevoInicio || !nuevoFin) {
          avisar('Completa la hora de entrada y la de salida, o usa "Sin límite".', 'error');
          return;
        }
        guardarHorario(emp.id, nuevoInicio, nuevoFin, botonGuardar);
      });

      const botonQuitar = tr.querySelector('.btn-quitar-horario');
      botonQuitar.addEventListener('click', () => {
        guardarHorario(emp.id, null, null, botonQuitar);
      });

      const botonEstado = tr.querySelector('.btn-cambiar-estado');
      botonEstado.addEventListener('click', async () => {
        try {
          await conCarga(botonEstado, () => cambiarEstadoEmpleado(emp.id, !emp.activo));
          avisar(emp.activo ? 'Cuenta desactivada.' : 'Cuenta activada.');
          cargarEmpleados(emp.id);
        } catch (error) {
          console.error(error);
          avisar('No se pudo cambiar el estado del empleado.', 'error');
        }
      });

      cuerpo.appendChild(tr);
    });
    cuerpo.dataset.cargado = '1';
    primeraCargaEmpleados = false;
  } catch (error) {
    console.error(error);
    cuerpo.innerHTML = '';
    avisar('No se pudieron cargar los empleados.', 'error');
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
    const boton = formEmpleado.querySelector('button[type="submit"]');
    try {
      await conCarga(boton, () => crearEmpleado(datos));
      mostrarMensaje(mensajeEl, '✓ Cuenta de empleado creada.');
      avisar('Cuenta de empleado creada.');
      formEmpleado.reset();
      cargarEmpleados();
    } catch (error) {
      console.error(error);
      mostrarMensaje(mensajeEl, 'No se pudo crear la cuenta. Verifica que el correo no esté ya registrado.', true);
      avisar('No se pudo crear la cuenta del empleado.', 'error');
    }
  });
}

// ---------- Auditoría (administrador) ----------
let primeraCargaAuditoria = true;

function aplicarFiltrosAuditoria() {
  const empleado = filtroAuditEmpleado ? filtroAuditEmpleado.value : '';
  const fecha = filtroAuditFecha ? filtroAuditFecha.value : '';

  document.querySelectorAll('#tabla-auditoria-body tr[data-empleado]').forEach((fila) => {
    const coincide = (!empleado || fila.dataset.empleado === empleado)
      && (!fecha || fila.dataset.fecha === fecha);
    const estabaOculta = fila.style.display === 'none';

    fila.style.display = coincide ? '' : 'none';
    if (coincide && estabaOculta && !sinAnimaciones) {
      fila.classList.remove('fila-aparece');
      void fila.offsetWidth;
      fila.classList.add('fila-aparece');
    }
  });
}

async function cargarAuditoria() {
  const cuerpo = document.getElementById('tabla-auditoria-body');
  if (!cuerpo) return;

  if (!cuerpo.dataset.cargado) mostrarEsqueleto(cuerpo, 5);

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
    registros.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.dataset.empleado = r.empleado_id;
      tr.dataset.fecha = r.fecha_dia;
      if (primeraCargaAuditoria) {
        tr.classList.add('fila-entrada');
        tr.style.animationDelay = `${Math.min(i * 40, 500)}ms`;
      }
      tr.innerHTML = `
        <td>${escaparHTML(r.codigo_seguimiento)}</td>
        <td>${escaparHTML(r.nombre_pasajero)}</td>
        <td><span class="estado-badge estado-${r.estado}">${r.estado}</span></td>
        <td>${escaparHTML(r.empleado_nombre)} (${escaparHTML(r.empleado_correo)})</td>
        <td>${formatearFecha(r.fecha_gestion)}</td>
      `;
      cuerpo.appendChild(tr);
    });
    cuerpo.dataset.cargado = '1';
    primeraCargaAuditoria = false;
    aplicarFiltrosAuditoria();
  } catch (error) {
    console.error(error);
    cuerpo.innerHTML = '';
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

  prepararRevelado();
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