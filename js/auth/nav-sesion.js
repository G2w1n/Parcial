// js/auth/nav-sesion.js
import { rutaInicioSegunRol } from './roles.js';
import { mostrarAvisoGeneral } from '../config/aviso-general.js';

const ETIQUETA_INICIO = { cliente: 'Reservas', administrador: 'Panel', empleado: 'Panel', cajero: 'Caja', seguridad: 'Garita' };

let usuarioGuardado = null;
try {
  usuarioGuardado = JSON.parse(sessionStorage.getItem('usuario'));
} catch {
  usuarioGuardado = null;
}

// "Reservas" lleva a cada perfil a su página de inicio
const enlaceReservas = document.getElementById('nav-reservas');
if (enlaceReservas) {
  enlaceReservas.href = usuarioGuardado ? rutaInicioSegunRol(usuarioGuardado.rol) : 'login.html';
  if (usuarioGuardado) enlaceReservas.textContent = ETIQUETA_INICIO[usuarioGuardado.rol] ?? 'Reservas';
}

// "Iniciar sesión" se vuelve un menú con el nombre y la opción "Cerrar sesión"
const enlaceSesion = document.getElementById('nav-sesion');
if (enlaceSesion && usuarioGuardado) {
  const contenedor = document.createElement('div');
  contenedor.className = 'nav-usuario';

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'nav-usuario-boton';
  const flecha = document.createElement('span');
  flecha.className = 'nav-usuario-flecha';
  flecha.textContent = '▾';
  boton.append(document.createTextNode(`${usuarioGuardado.nombre} `), flecha);

  const menu = document.createElement('div');
  menu.className = 'nav-usuario-menu';
  const cerrar = document.createElement('a');
  cerrar.href = '#';
  cerrar.textContent = 'Cerrar sesión';
  menu.append(cerrar);

  contenedor.append(boton, menu);
  enlaceSesion.replaceWith(contenedor);

  boton.addEventListener('click', (evento) => {
    evento.stopPropagation();
    contenedor.classList.toggle('abierto');
  });

  cerrar.addEventListener('click', (evento) => {
    evento.preventDefault();
    sessionStorage.removeItem('usuario');
    window.location.href = 'index.html';
  });

  // Cierra el menú si se hace clic en cualquier otro lado de la página
  document.addEventListener('click', () => contenedor.classList.remove('abierto'));
}

// Aviso general del administrador (por ejemplo, vuelos demorados por mal clima)
mostrarAvisoGeneral();
