// js/nav-sesion.js
// Cuando hay sesión activa, convierte el link "Iniciar sesión" en un menú
// desplegable con el nombre del usuario y la opción "Cerrar sesión".
// También decide a dónde lleva el link "Reservas" según si hay sesión o no.
const enlaceReservas = document.getElementById('nav-reservas');
const usuarioGuardado = sessionStorage.getItem('usuario');

if (enlaceReservas) {
  enlaceReservas.href = usuarioGuardado ? 'Transporte.html' : 'login.html';
}

const enlaceSesion = document.getElementById('nav-sesion');

if (enlaceSesion) {
  const usuarioActivo = sessionStorage.getItem('usuario');

  if (usuarioActivo) {
    const usuario = JSON.parse(usuarioActivo);

    const contenedor = document.createElement('div');
    contenedor.className = 'nav-usuario';
    contenedor.innerHTML = `
      <button type="button" class="nav-usuario-boton" id="nav-usuario-boton">
        ${usuario.nombre} <span class="nav-usuario-flecha">▾</span>
      </button>
      <div class="nav-usuario-menu" id="nav-usuario-menu">
        <a href="#" id="nav-cerrar-sesion">Cerrar sesión</a>
      </div>
    `;

    enlaceSesion.replaceWith(contenedor);

    const boton = document.getElementById('nav-usuario-boton');
    const menu = document.getElementById('nav-usuario-menu');
    const enlaceCerrarSesion = document.getElementById('nav-cerrar-sesion');

    boton.addEventListener('click', (evento) => {
      evento.stopPropagation();
      contenedor.classList.toggle('abierto');
    });

    enlaceCerrarSesion.addEventListener('click', (evento) => {
      evento.preventDefault();
      sessionStorage.removeItem('usuario');
      window.location.href = 'index.html';
    });

    // Cierra el menú si se hace clic en cualquier otro lado de la página
    document.addEventListener('click', () => {
      contenedor.classList.remove('abierto');
    });
  }
}