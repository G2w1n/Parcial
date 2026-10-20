// js/inicio/revelar.js
// Animación al hacer scroll en el inicio: tarjetas y bloques aparecen al entrar en pantalla.
// Si el sistema pide menos movimiento, no se anima nada (la clase .revelar queda sin efecto en CSS).
const elementos = document.querySelectorAll(
  'main section:not(.hero) h2, main section:not(.hero) .section-intro, .tarjetas .tarjeta, .tramite-bloque, .contacto form',
);

if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) return;
      entrada.target.classList.add('visible');
      observador.unobserve(entrada.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });

  elementos.forEach((el) => {
    // Las tarjetas de una misma fila aparecen una tras otra
    const hermanos = el.parentElement ? [...el.parentElement.children] : [];
    if (el.classList.contains('tarjeta') || el.classList.contains('tramite-bloque')) {
      el.style.transitionDelay = `${(hermanos.indexOf(el) % 4) * 80}ms`;
    }
    el.classList.add('revelar');
    observador.observe(el);
  });
}
