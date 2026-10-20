// js/perfil/perfil.js
// Mi perfil: cambiar nombre y DNI, y cambiar la contraseña (se guarda encriptada)
import { sql } from '../config/neon-config.js';
import { exigirSesion, verificarCredenciales, cambiarContrasena } from '../auth/auth.js';
import { avisar, conCarga } from '../config/ui.js';
import { registrar } from '../config/bitacora.js';

const usuario = exigirSesion();
if (!usuario) throw new Error('Sin sesión');

const $ = (id) => document.getElementById(id);
const NOMBRES_ROL = { cliente: 'Cliente', administrador: 'Administrador', empleado: 'Empleado', cajero: 'Cajero', seguridad: 'Seguridad' };
let correo = '';

async function cargar() {
  const [datos] = await sql`SELECT nombre, correo, dni FROM usuarios WHERE id = ${usuario.id};`;
  if (!datos) return;
  correo = datos.correo;
  $('pf-nombre').value = datos.nombre ?? '';
  $('pf-correo').value = datos.correo ?? '';
  $('pf-dni').value = datos.dni ?? '';
  $('pf-rol').textContent = NOMBRES_ROL[usuario.rol] ?? usuario.rol;
  $('pf-iniciales').textContent = (datos.nombre ?? '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

$('form-datos').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = $('pf-nombre').value.trim();
  const dni = $('pf-dni').value.trim();
  if (nombre.length < 3) return avisar('Escribe tu nombre completo.', 'error');
  if (dni && !/^\d{8}$/.test(dni)) return avisar('El DNI tiene 8 dígitos.', 'error');
  try {
    await conCarga(e.target.querySelector('button[type="submit"]'), () => sql`
      UPDATE usuarios SET nombre = ${nombre}, dni = ${dni || null} WHERE id = ${usuario.id};
    `);
    // El nombre también se muestra en el menú: se actualiza la sesión
    sessionStorage.setItem('usuario', JSON.stringify({ ...usuario, nombre }));
    avisar('Datos guardados.');
    cargar();
  } catch (error) {
    console.error(error);
    avisar('No se pudieron guardar los datos.', 'error');
  }
});

$('form-clave').addEventListener('submit', async (e) => {
  e.preventDefault();
  const actual = $('pf-actual').value;
  const nueva = $('pf-nueva').value;
  const repetir = $('pf-repetir').value;
  const error = $('pf-error');
  error.textContent = '';
  if (nueva.length < 6) return void (error.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.');
  if (nueva !== repetir) return void (error.textContent = 'Las contraseñas nuevas no coinciden.');
  if (nueva === actual) return void (error.textContent = 'La nueva contraseña debe ser distinta de la actual.');
  try {
    await conCarga(e.target.querySelector('button[type="submit"]'), async () => {
      const valido = await verificarCredenciales(correo, actual);
      if (!valido || valido.id !== usuario.id) throw new Error('clave');
      await cambiarContrasena(usuario.id, nueva);
    });
    if (usuario.rol !== 'cliente') registrar(usuario, 'Cambió su contraseña');
    e.target.reset();
    avisar('Contraseña actualizada.');
  } catch (err) {
    if (err.message === 'clave') error.textContent = 'La contraseña actual no es correcta.';
    else {
      console.error(err);
      error.textContent = 'No se pudo cambiar la contraseña.';
    }
  }
});

document.querySelectorAll('.ver-clave').forEach((b) => b.addEventListener('click', () => {
  const campo = $(b.dataset.campo);
  const oculto = campo.type === 'password';
  campo.type = oculto ? 'text' : 'password';
  b.textContent = oculto ? 'Ocultar' : 'Ver';
}));

cargar().catch((error) => {
  console.error(error);
  avisar('No se pudieron cargar tus datos.', 'error');
});
