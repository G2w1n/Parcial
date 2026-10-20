// js/auth/auth.js
import { sql } from '../config/neon-config.js';
import { rutaInicioSegunRol } from './roles.js';

export { rutaInicioSegunRol };

// ---------- Contraseñas ----------
// Desde la fase 6 las contraseñas se guardan encriptadas con bcrypt (extensión pgcrypto de Neon).
// Mientras no se ejecute database/fase-6.sql, la función crypt() no existe y se usa el modo anterior.
const sinCrypt = (error) => error.code === '42883' || error.code === '22023';

export async function crearUsuario({ nombre, correo, contrasena, rol = 'cliente', horaInicio = null, horaFin = null }) {
  try {
    await sql`
      INSERT INTO usuarios (nombre, correo, contrasena, rol, hora_inicio, hora_fin)
      VALUES (${nombre}, ${correo}, crypt(${contrasena}, gen_salt('bf')), ${rol}, ${horaInicio}, ${horaFin});
    `;
  } catch (error) {
    if (!sinCrypt(error)) throw error;
    await sql`
      INSERT INTO usuarios (nombre, correo, contrasena, rol, hora_inicio, hora_fin)
      VALUES (${nombre}, ${correo}, ${contrasena}, ${rol}, ${horaInicio}, ${horaFin});
    `;
  }
}

export async function registrarUsuario(nombre, correo, contrasena) {
  await crearUsuario({ nombre, correo, contrasena });
}

// Devuelve { id, nombre, rol } si el correo y la contraseña coinciden (y la cuenta está activa)
export async function verificarCredenciales(correo, contrasena) {
  let filas;
  try {
    filas = await sql`
      SELECT id, nombre, rol FROM usuarios
      WHERE correo = ${correo} AND activo = TRUE AND contrasena = crypt(${contrasena}, contrasena);
    `;
  } catch (error) {
    if (!sinCrypt(error)) throw error;
    filas = await sql`
      SELECT id, nombre, rol FROM usuarios
      WHERE correo = ${correo} AND activo = TRUE AND contrasena = ${contrasena};
    `;
  }
  return filas[0] ?? null;
}

export async function cambiarContrasena(idUsuario, nueva) {
  try {
    await sql`UPDATE usuarios SET contrasena = crypt(${nueva}, gen_salt('bf')) WHERE id = ${idUsuario};`;
  } catch (error) {
    if (!sinCrypt(error)) throw error;
    await sql`UPDATE usuarios SET contrasena = ${nueva} WHERE id = ${idUsuario};`;
  }
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
  const usuario = await verificarCredenciales(correo, contrasena);
  if (!usuario) return null;

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

// Control por rol: si el perfil no corresponde, avisa una sola vez y vuelve al inicio
let accesoDenegado = false;

export function exigirRol(...rolesPermitidos) {
  const usuario = exigirSesion();
  if (!usuario) return null;
  if (!rolesPermitidos.includes(usuario.rol)) {
    if (!accesoDenegado) {
      accesoDenegado = true;
      alert('Tu perfil no tiene acceso a esta página.');
      window.location.href = 'index.html';
    }
    return null;
  }
  return usuario;
}