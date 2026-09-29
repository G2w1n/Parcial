// js/auth/login.js
import { registrarUsuario, iniciarSesion } from './auth.js';

const formIniciar = document.getElementById('form-iniciar-sesion');
const formCrear = document.getElementById('form-crear-cuenta');

function mostrarError(idError, mensaje) {
  const errorEl = document.getElementById(idError);
  if (!errorEl) return;
  errorEl.textContent = mensaje;
  errorEl.classList.add('visible');
}

function ocultarError(idError) {
  const errorEl = document.getElementById(idError);
  if (!errorEl) return;
  errorEl.classList.remove('visible');
}

function redirigirSegunRol(usuario) {
  window.location.href = usuario.rol === 'cliente' ? 'Transporte.html' : 'panel.html';
}

if (formIniciar) {
  formIniciar.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    ocultarError('login-error');

    const correo = document.getElementById('li-correo').value;
    const contrasena = document.getElementById('li-contrasena').value;

    try {
      const usuario = await iniciarSesion(correo, contrasena);
      if (!usuario) {
        mostrarError('login-error', 'Correo o contraseña incorrectos.');
        return;
      }
      redirigirSegunRol(usuario);
    } catch (error) {
      console.error(error);
      mostrarError('login-error', 'Ocurrió un error al iniciar sesión. Intenta de nuevo.');
    }
  });
}

if (formCrear) {
  formCrear.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    ocultarError('registro-error');

    const nombre = document.getElementById('cc-nombre').value;
    const correo = document.getElementById('cc-correo').value;
    const contrasena = document.getElementById('cc-contrasena').value;

    try {
      await registrarUsuario(nombre, correo, contrasena);
      const usuario = await iniciarSesion(correo, contrasena);
      redirigirSegunRol(usuario);
    } catch (error) {
      console.error(error);
      mostrarError('registro-error', 'No se pudo crear la cuenta. Verifica que el correo no esté ya registrado.');
    }
  });
}

// ---- Panel deslizante (Crear cuenta / Iniciar sesión) ----
const contenedorLogin = document.getElementById('container');
const botonMostrarRegistro = document.getElementById('signUp');
const botonMostrarLogin = document.getElementById('signIn');

if (botonMostrarRegistro && contenedorLogin) {
  botonMostrarRegistro.addEventListener('click', () => {
    contenedorLogin.classList.add('right-panel-active');
  });
}
if (botonMostrarLogin && contenedorLogin) {
  botonMostrarLogin.addEventListener('click', () => {
    contenedorLogin.classList.remove('right-panel-active');
  });
}

// ---- Mostrar/ocultar contraseña ----
document.querySelectorAll('.toggle-password').forEach((boton) => {
  boton.addEventListener('click', () => {
    const idCampo = boton.getAttribute('data-target');
    const campo = document.getElementById(idCampo);
    if (!campo) return;
    const oculto = campo.type === 'password';
    campo.type = oculto ? 'text' : 'password';
    boton.textContent = oculto ? '🙈' : '👁';
    boton.setAttribute('aria-label', oculto ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
});