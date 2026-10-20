// js/panel/menu-admin.js
// Barra del personal (debajo del encabezado): pestañas según el rol, búsqueda global y notificaciones.
// Se usa en todas las páginas del personal: <div id="menu-admin" data-pagina="pedidos"></div>
import { sql } from '../config/neon-config.js';
import { consultarTurno, expulsar } from '../auth/auth.js';
import { avisar } from '../config/ui.js';

const contenedor = document.getElementById('menu-admin');
let usuario = null;
try {
  usuario = JSON.parse(sessionStorage.getItem('usuario'));
} catch {
  usuario = null;
}

const PESTANAS = [
  { pagina: 'mi-turno', texto: 'Mi turno', href: 'mi-turno.html', roles: ['empleado', 'cajero', 'seguridad'] },
  { pagina: 'reservas', texto: 'Reservas', href: 'panel.html', roles: ['administrador', 'empleado'] },
  { pagina: 'pedidos', texto: 'Pedidos', href: 'panel-pedidos.html', roles: ['administrador', 'empleado'] },
  { pagina: 'vuelos', texto: 'Vuelos', href: 'panel-vuelos.html', roles: ['administrador', 'empleado'] },
  { pagina: 'caja', texto: 'Caja', href: 'caja.html', roles: ['administrador', 'cajero'] },
  { pagina: 'garita', texto: 'Garita', href: 'garita.html', roles: ['administrador', 'cajero', 'seguridad'] },
  { pagina: 'estadisticas', texto: 'Estadísticas', href: 'panel-estadisticas.html', roles: ['administrador'] },
  { pagina: 'historial', texto: 'Historial', href: 'historial.html', roles: ['administrador', 'empleado', 'cajero'] },
  { pagina: 'turnos', texto: 'Turnos', href: 'panel-turnos.html', roles: ['administrador'] },
  { pagina: 'config', texto: 'Configuración', href: 'panel-config.html', roles: ['administrador'] },
  { pagina: 'reclamos', texto: 'Reclamos', href: 'panel-reclamos.html', roles: ['administrador'] },
  { pagina: 'bitacora', texto: 'Bitácora', href: 'panel-bitacora.html', roles: ['administrador'] },
];

const crear = (etiqueta, clase, texto) => {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
};

// Consulta que puede fallar si la tabla de la fase 4 o 5 aún no existe
async function seguro(consulta, vacio) {
  try {
    return await consulta();
  } catch (error) {
    if (error.code !== '42P01') console.error(error);
    return vacio;
  }
}

/* ============================== Búsqueda global ============================== */
async function buscar(texto) {
  const patron = `%${texto.replace(/[\\%_]/g, '\\$&')}%`;
  const rol = usuario.rol;
  const resultados = [];

  const reservas = await seguro(() => sql`
    SELECT codigo_seguimiento, placa, nombre_pasajero, estado, estado_pago FROM reservas_estacionamiento
    WHERE codigo_seguimiento ILIKE ${patron} OR placa ILIKE ${patron} OR nombre_pasajero ILIKE ${patron}
    ORDER BY fecha_registro DESC LIMIT 6;`, []);
  reservas.forEach((r) => resultados.push({
    tipo: 'Reserva',
    titulo: `${r.codigo_seguimiento} · ${r.placa}`,
    detalle: `${r.nombre_pasajero ?? 'Sin nombre'} · ${r.estado} · pago ${r.estado_pago}`,
    href: rol === 'administrador' || rol === 'empleado'
      ? `panel.html?buscar=${encodeURIComponent(r.codigo_seguimiento)}`
      : `garita.html?codigo=${encodeURIComponent(r.codigo_seguimiento)}`,
  }));

  // Historial completo de cada placa encontrada
  if (rol !== 'seguridad') {
    [...new Set(reservas.map((r) => r.placa?.toUpperCase()).filter(Boolean))].slice(0, 3).forEach((placa) => resultados.push({
      tipo: 'Historial', titulo: placa, detalle: 'Reservas, pagos e incidentes de la placa',
      href: `historial.html?placa=${encodeURIComponent(placa)}`,
    }));
  }

  if (rol !== 'seguridad') {
    const pagos = await seguro(() => sql`
      SELECT codigo_operacion, monto, estado FROM pagos
      WHERE codigo_operacion ILIKE ${patron} AND estado = 'aprobado'
      ORDER BY fecha_pago DESC LIMIT 4;`, []);
    pagos.forEach((p) => resultados.push({
      tipo: 'Pago', titulo: p.codigo_operacion, detalle: `S/ ${Number(p.monto).toFixed(2)}`,
      href: `comprobante.html?op=${encodeURIComponent(p.codigo_operacion)}`,
    }));
  }

  if (rol === 'administrador' || rol === 'empleado') {
    const pedidos = await seguro(() => sql`
      SELECT codigo, restaurante, nombre, estado FROM pedidos
      WHERE codigo ILIKE ${patron} OR nombre ILIKE ${patron}
      ORDER BY fecha DESC LIMIT 4;`, []);
    pedidos.forEach((p) => resultados.push({
      tipo: 'Pedido', titulo: `${p.codigo} · ${p.restaurante}`, detalle: `${p.nombre} · ${p.estado}`,
      href: `panel-pedidos.html?buscar=${encodeURIComponent(p.codigo)}`,
    }));
  }
  return resultados;
}

/* ============================== Notificaciones ============================== */
let ultimosPedidos = null;

async function notificaciones() {
  const rol = usuario.rol;
  const lista = [];

  if (rol === 'administrador' || rol === 'empleado') {
    const [p] = await seguro(() => sql`SELECT COUNT(*)::int AS n FROM pedidos WHERE estado = 'recibido';`, [{ n: 0 }]);
    if (p.n) lista.push({ icono: '🍔', texto: `${p.n} pedido(s) nuevo(s) por preparar`, href: 'panel-pedidos.html' });
    if (ultimosPedidos !== null && p.n > ultimosPedidos) avisar(`Llegó un pedido nuevo (${p.n} por preparar).`);
    ultimosPedidos = p.n;

    const [r] = await seguro(() => sql`
      SELECT COUNT(*)::int AS n FROM reservas_estacionamiento
      WHERE estado = 'registrado'
        AND fecha_hora_entrada BETWEEN (NOW() AT TIME ZONE 'America/Lima')
                                   AND (NOW() AT TIME ZONE 'America/Lima') + INTERVAL '1 hour';`, [{ n: 0 }]);
    if (r.n) lista.push({ icono: '🚗', texto: `${r.n} vehículo(s) llegan en la próxima hora`, href: 'panel.html' });
  }

  if (rol === 'administrador' || rol === 'cajero') {
    const [v] = await seguro(() => sql`
      SELECT COUNT(*)::int AS n FROM pagos
      WHERE canal = 'pasarela' AND estado = 'aprobado' AND verificado = false;`, [{ n: 0 }]);
    if (v.n) lista.push({ icono: '💳', texto: `${v.n} pago(s) en línea por verificar`, href: 'caja.html' });
  }

  if (rol !== 'empleado') {
    const [n] = await seguro(() => sql`
      SELECT COUNT(*)::int AS n FROM reservas_estacionamiento r
      JOIN lista_negra l ON l.placa = UPPER(r.placa) AND l.activo
      WHERE r.estado = 'registrado';`, [{ n: 0 }]);
    if (n.n) lista.push({ icono: '⛔', texto: `${n.n} reserva(s) con placa en lista negra`, href: rol === 'administrador' ? 'panel-config.html#lista-negra' : 'garita.html' });
  }

  const [inc] = await seguro(() => sql`SELECT COUNT(*)::int AS n FROM incidentes WHERE estado = 'abierto';`, [{ n: 0 }]);
  if (inc.n) lista.push({ icono: '⚠️', texto: `${inc.n} incidente(s) sin resolver`, href: 'mi-turno.html' });

  if (rol === 'administrador') {
    const [a] = await seguro(() => sql`SELECT COUNT(*)::int AS n FROM avisos WHERE activo AND (hasta IS NULL OR hasta > NOW());`, [{ n: 0 }]);
    if (a.n) lista.push({ icono: '📢', texto: `${a.n} aviso(s) general(es) publicado(s)`, href: 'panel-config.html#avisos' });
    const [rc] = await seguro(() => sql`SELECT COUNT(*)::int AS n FROM reclamos WHERE estado <> 'resuelto';`, [{ n: 0 }]);
    if (rc.n) lista.push({ icono: '📖', texto: `${rc.n} reclamo(s) sin responder`, href: 'panel-reclamos.html' });
  }
  return lista;
}

/* ============================== Construcción de la barra ============================== */
function construir() {
  const pagina = contenedor.dataset.pagina;
  const barra = crear('div', 'wrap menu-admin-barra');

  const pestanas = crear('nav', 'menu-admin-pestanas');
  pestanas.setAttribute('aria-label', 'Secciones del personal');
  PESTANAS.filter((p) => p.roles.includes(usuario.rol)).forEach((p) => {
    const a = crear('a', '', p.texto);
    a.href = p.href;
    if (p.pagina === pagina) a.setAttribute('aria-current', 'page');
    pestanas.append(a);
  });

  const herramientas = crear('div', 'menu-admin-herramientas');

  // Búsqueda global
  const buscador = crear('div', 'busqueda-global');
  const input = crear('input');
  input.type = 'search';
  input.placeholder = 'Buscar placa, código o nombre…';
  input.setAttribute('aria-label', 'Búsqueda global');
  input.autocomplete = 'off';
  const resultados = crear('ul', 'busqueda-resultados');
  resultados.hidden = true;
  buscador.append(input, resultados);

  let temporizador = null;
  let consultaActual = 0;
  input.addEventListener('input', () => {
    clearTimeout(temporizador);
    const texto = input.value.trim();
    if (texto.length < 2) {
      resultados.hidden = true;
      return;
    }
    temporizador = setTimeout(async () => {
      const numero = ++consultaActual;
      const encontrados = await buscar(texto);
      if (numero !== consultaActual) return; // llegó una búsqueda más nueva
      resultados.replaceChildren(...(encontrados.length ? encontrados.map((r) => {
        const li = crear('li');
        const a = crear('a');
        a.href = r.href;
        a.append(crear('span', 'res-tipo', r.tipo), crear('strong', '', r.titulo), crear('small', '', r.detalle));
        li.append(a);
        return li;
      }) : [crear('li', 'res-vacio', 'Sin resultados')]));
      resultados.hidden = false;
    }, 300);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') resultados.hidden = true;
  });

  // Campanita
  const campana = crear('div', 'notificaciones');
  const boton = crear('button', 'btn-campana');
  boton.type = 'button';
  boton.setAttribute('aria-expanded', 'false');
  boton.setAttribute('aria-label', 'Notificaciones');
  const icono = crear('span', '', '🔔');
  icono.setAttribute('aria-hidden', 'true');
  const insignia = crear('span', 'insignia');
  insignia.hidden = true;
  boton.append(icono, insignia);
  const panel = crear('div', 'notificaciones-panel');
  panel.hidden = true;
  campana.append(boton, panel);
  boton.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    boton.setAttribute('aria-expanded', String(!panel.hidden));
  });

  document.addEventListener('click', (e) => {
    if (!campana.contains(e.target)) {
      panel.hidden = true;
      boton.setAttribute('aria-expanded', 'false');
    }
    if (!buscador.contains(e.target)) resultados.hidden = true;
  });

  async function refrescarNotificaciones() {
    const lista = await notificaciones();
    insignia.hidden = lista.length === 0;
    insignia.textContent = String(lista.length);
    boton.setAttribute('aria-label', `Notificaciones: ${lista.length}`);
    const titulo = crear('p', 'notif-titulo', 'Notificaciones');
    if (lista.length === 0) {
      panel.replaceChildren(titulo, crear('p', 'notif-vacio', 'Todo al día ✓'));
      return;
    }
    const ul = crear('ul');
    lista.forEach((n) => {
      const li = crear('li');
      const a = crear('a');
      a.href = n.href;
      const ic = crear('span', '', n.icono);
      ic.setAttribute('aria-hidden', 'true');
      a.append(ic, crear('span', '', n.texto));
      li.append(a);
      ul.append(li);
    });
    panel.replaceChildren(titulo, ul);
  }

  if (usuario.rol !== 'seguridad') herramientas.append(buscador);
  herramientas.append(campana);
  barra.append(pestanas, herramientas);
  contenedor.append(barra);
  contenedor.classList.add('menu-admin');

  refrescarNotificaciones();
  setInterval(() => {
    if (!document.hidden) refrescarNotificaciones();
  }, 60000);
}

// Los empleados solo trabajan dentro de su turno (el panel principal ya lo revisa por su cuenta)
async function revisarTurno() {
  if (usuario.rol !== 'empleado' || contenedor.dataset.pagina === 'reservas') return;
  try {
    const turno = await consultarTurno(usuario.id);
    if (!turno || !turno.activo) expulsar('desactivada');
    else if (!turno.en_turno) expulsar('turno');
  } catch (error) {
    console.error(error);
  }
}

if (contenedor && usuario && usuario.rol !== 'cliente') {
  construir();
  revisarTurno();
}
