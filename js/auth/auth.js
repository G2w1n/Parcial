import { sql } from '../config/neon-config.js';

export async function registrarUsuario(nombre, correo, contrasena) {
  await sql`INSERT INTO usuarios (nombre, correo, contrasena) VALUES (${nombre}, ${correo}, ${contrasena})`;
}

// Revisa con el reloj de Neon (hora de Perú) si el usuario está dentro de su horario
export async function consultarTurno(id) {
  const filas = await sql`
    SELECT activo, hora_inicio, hora_fin,
      CASE
        WHEN rol <> 'empleado' OR hora_inicio IS NULL OR hora_fin IS NULL THEN TRUE
        WHEN hora_inicio < hora_fin THEN
          (NOW() AT TIME ZONE 'America/Lima')::time >= hora_inicio
          AND (NOW() AT TIME ZONE 'America/Lima')::time < hora_fin
        ELSE
          (NOW() AT TIME ZONE 'America/Lima')::time >= hora_inicio
          OR (NOW() AT TIME ZONE 'America/Lima')::time < hora_fin
      END AS en_turno
    FROM usuarios
    WHERE id = ${id};
  `;
  return filas[0] || null;
}

export function textoTurno(turno) {
  if (!turno || !turno.hora_inicio || !turno.hora_fin) return null;
  return `${turno.hora_inicio.slice(0, 5)} a ${turno.hora_fin.slice(0, 5)}`;
}

export function tipoTurno(turno) {
  if (!turno || !turno.hora_inicio || !turno.hora_fin) return null;
  return turno.hora_inicio < turno.hora_fin ? 'diurno' : 'nocturno';
}

export async function iniciarSesion(correo, contrasena) {
  const filas = await sql`
    SELECT id, nombre, rol FROM usuarios
    WHERE correo = ${correo} AND contrasena = ${contrasena} AND activo = TRUE;
  `;
  if (filas.length === 0) return null;

  const usuario = filas[0];

  if (usuario.rol === 'empleado') {
    const turno = await consultarTurno(usuario.id);
    if (turno && !turno.en_turno) {
      const error = new Error('Fuera de turno');
      error.name = 'FueraDeTurno';
      error.turno = turno;
      throw error;
    }
  }

  sessionStorage.setItem('usuario', JSON.stringify(usuario));
  return usuario;
}

export function cerrarSesion() {
  sessionStorage.removeItem('usuario');
}

// Cierra la sesión y lleva al login explicando el motivo
export function expulsar(motivo) {
  sessionStorage.removeItem('usuario');
  window.location.href = 'login.html?motivo=' + encodeURIComponent(motivo);
}

export function exigirSesion() {
  const usuarioActivo = sessionStorage.getItem('usuario');
  if (!usuarioActivo) {
    window.location.href = 'login.html';
    return null;
  }
  return JSON.parse(usuarioActivo);
}