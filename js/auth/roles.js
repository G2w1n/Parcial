// js/auth/roles.js
// Reglas de rol sin conexión a la base de datos (las usan auth.js y nav-sesion.js)
export const ROLES = ['cliente', 'administrador', 'empleado', 'cajero', 'seguridad'];

export function rutaInicioSegunRol(rol) {
  const rutas = {
    cliente: 'Transporte.html',
    administrador: 'panel.html',
    empleado: 'panel.html',
    cajero: 'caja.html',
    seguridad: 'garita.html',
  };
  return rutas[rol] ?? 'index.html';
}