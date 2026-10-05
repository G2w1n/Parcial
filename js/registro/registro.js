import { sql } from '../config/neon-config.js';
import { exigirSesion } from '../auth/auth.js';

const usuario = exigirSesion();

export async function guardarReservaEstacionamiento(datos) {
  const codigo = 'COD-' + Date.now().toString().slice(-8);
  const resultado = await sql`
    INSERT INTO reservas_estacionamiento (codigo_seguimiento, nombre_pasajero, placa, fecha_hora_entrada, usuario_id)
    VALUES (${codigo}, ${datos.nombre_pasajero}, ${datos.placa}, ${datos.fecha_hora_entrada}, ${usuario.id})
    RETURNING codigo_seguimiento;
  `;
  return resultado[0].codigo_seguimiento;
}

const formReserva = document.getElementById('form-reserva-estacionamiento');

if (formReserva) {
  const sinAnimaciones = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const tarjeta = document.getElementById('reserva-card');
  const nombre = document.getElementById('re-nombre');
  const placa = document.getElementById('re-placa');
  const fecha = document.getElementById('re-fecha');
  const botonReservar = formReserva.querySelector('button[type="submit"]');
  const textoBoton = botonReservar.querySelector('.btn-texto');
  const textoOriginal = textoBoton.textContent;
  const confirmacionEl = document.getElementById('reserva-confirmacion');
  const ticket = document.getElementById('ticket-reserva');
  const botonCopiar = document.getElementById('btn-copiar');
  const listoEl = document.getElementById('rv-listo');
  const resumen = {
    nombre: document.getElementById('rv-nombre'),
    placa: document.getElementById('rv-placa'),
    fecha: document.getElementById('rv-fecha'),
  };

  const campos = [
    {
      input: nombre,
      msg: document.getElementById('msg-nombre'),
      validar: (v) => (v.trim().length >= 3 ? '' : 'Escribe al menos 3 caracteres.'),
    },
    {
      input: placa,
      msg: document.getElementById('msg-placa'),
      validar: (v) => (/^[A-Za-z0-9-]{6,10}$/.test(v.trim()) ? '' : 'Usa de 6 a 10 letras, números o guiones (ej. ABC-123).'),
    },
    {
      input: fecha,
      msg: document.getElementById('msg-fecha'),
      validar: (v) => (v ? '' : 'Elige la fecha y la hora de entrada.'),
    },
  ];

  let codigoActual = '';

  // Los campos entran uno tras otro cuando el formulario se ve en pantalla
  if (sinAnimaciones || !('IntersectionObserver' in window)) {
    tarjeta.classList.add('en-vista');
  } else {
    tarjeta.classList.add('preparada');
    const observador = new IntersectionObserver((entradas) => {
      if (entradas[0].isIntersecting) {
        tarjeta.classList.add('en-vista');
        observador.disconnect();
      }
    }, { threshold: 0.2 });
    observador.observe(tarjeta);
  }

  // Validación en vivo
  function validarCampo(campo, mostrarVacio = false) {
    const valor = campo.input.value;
    const contenedor = campo.input.closest('.campo-flotante');

    if (valor === '' && !mostrarVacio) {
      contenedor.classList.remove('valido', 'invalido');
      campo.msg.textContent = '';
      return false;
    }

    const mensaje = campo.validar(valor);
    contenedor.classList.toggle('invalido', mensaje !== '');
    contenedor.classList.toggle('valido', mensaje === '');
    campo.msg.textContent = mensaje;
    return mensaje === '';
  }

  // Resumen en vivo
  function formatearFecha(valor) {
    if (!valor) return '';
    return new Date(valor).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function actualizarDato(elemento, texto) {
    const nuevo = texto || '—';
    if (elemento.textContent === nuevo) return;
    elemento.textContent = nuevo;
    elemento.classList.remove('cambio');
    void elemento.offsetWidth;
    elemento.classList.add('cambio');
  }

  function actualizarResumen() {
    actualizarDato(resumen.nombre, nombre.value.trim());
    actualizarDato(resumen.placa, placa.value.trim().toUpperCase());
    actualizarDato(resumen.fecha, formatearFecha(fecha.value));
    const todoOk = campos.every((c) => c.validar(c.input.value) === '');
    listoEl.classList.toggle('visible', todoOk);
  }

  function limpiarEstados() {
    formReserva.querySelectorAll('.campo-flotante').forEach((c) => c.classList.remove('valido', 'invalido'));
    campos.forEach((c) => { c.msg.textContent = ''; });
    actualizarResumen();
  }

  campos.forEach((campo) => {
    campo.input.addEventListener('input', () => {
      validarCampo(campo);
      actualizarResumen();
    });
    campo.input.addEventListener('blur', () => validarCampo(campo, true));
  });

  // Sacudida del formulario
  function sacudir() {
    if (sinAnimaciones) return;
    formReserva.classList.remove('sacudir');
    void formReserva.offsetWidth;
    formReserva.classList.add('sacudir');
  }

  formReserva.addEventListener('animationend', (evento) => {
    if (evento.animationName === 'sacudir') formReserva.classList.remove('sacudir');
  });

  // Confeti
  function lanzarConfeti(origen) {
    if (sinAnimaciones) return;
    const caja = origen.getBoundingClientRect();
    const colores = ['#f2994a', '#1f8a4c', '#163a5c', '#8fd3f4', '#f5c542'];

    for (let i = 0; i < 28; i++) {
      const trozo = document.createElement('span');
      trozo.className = 'confeti';
      trozo.style.setProperty('--x', `${caja.left + caja.width / 2}px`);
      trozo.style.setProperty('--y', `${caja.top + caja.height / 2}px`);
      trozo.style.setProperty('--dx', `${(Math.random() - 0.5) * 300}px`);
      trozo.style.setProperty('--dy', `${-(60 + Math.random() * 140)}px`);
      trozo.style.setProperty('--giro', `${(Math.random() - 0.5) * 720}deg`);
      trozo.style.background = colores[i % colores.length];
      trozo.addEventListener('animationend', () => trozo.remove());
      document.body.appendChild(trozo);
    }
  }

  // Mensaje de confirmación (animación de la Semana 5)
  function mostrarMensaje(texto, esError = false) {
    confirmacionEl.classList.remove('visible', 'error');
    void confirmacionEl.offsetWidth;
    confirmacionEl.classList.toggle('error', esError);

    if (esError) {
      confirmacionEl.textContent = texto;
    } else {
      confirmacionEl.innerHTML = `
        <svg class="check-animado" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <path d="M7 12.5l3.2 3.2L17 9"/>
        </svg>
        <span>${texto}</span>
      `;
    }
    confirmacionEl.classList.add('visible');
  }

  // Ticket de reserva
  function mostrarTicket(codigo, datos) {
    codigoActual = codigo;
    document.getElementById('tk-codigo').textContent = codigo;
    document.getElementById('tk-nombre').textContent = datos.nombre_pasajero;
    document.getElementById('tk-placa').textContent = datos.placa;
    document.getElementById('tk-fecha').textContent = formatearFecha(datos.fecha_hora_entrada);
    document.getElementById('tk-ver').href = 'mis-reservas.html?nueva=' + encodeURIComponent(codigo);

    ticket.hidden = false;
    ticket.classList.remove('entra');
    void ticket.offsetWidth;
    ticket.classList.add('entra');
    ticket.scrollIntoView({ behavior: sinAnimaciones ? 'auto' : 'smooth', block: 'nearest' });
  }

  // Copiar código
  botonCopiar.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(codigoActual);
    } catch (error) {
      const auxiliar = document.createElement('textarea');
      auxiliar.value = codigoActual;
      document.body.appendChild(auxiliar);
      auxiliar.select();
      document.execCommand('copy');
      auxiliar.remove();
    }
    botonCopiar.textContent = '¡Copiado!';
    botonCopiar.classList.add('copiado');
    setTimeout(() => {
      botonCopiar.textContent = 'Copiar código';
      botonCopiar.classList.remove('copiado');
    }, 1500);
  });

  // Envío del formulario
  formReserva.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    let todoOk = true;
    campos.forEach((campo) => {
      if (!validarCampo(campo, true)) todoOk = false;
    });
    actualizarResumen();

    if (!todoOk) {
      sacudir();
      const primero = formReserva.querySelector('.campo-flotante.invalido input');
      if (primero) primero.focus();
      return;
    }

    const datos = {
      nombre_pasajero: nombre.value.trim(),
      placa: placa.value.trim().toUpperCase(),
      fecha_hora_entrada: fecha.value,
    };

    confirmacionEl.classList.remove('visible', 'error');
    botonReservar.disabled = true;
    botonReservar.classList.add('cargando');
    textoBoton.textContent = 'Reservando...';

    try {
      const codigo = await guardarReservaEstacionamiento(datos);

      botonReservar.classList.remove('cargando');
      botonReservar.classList.add('exito');
      textoBoton.textContent = textoOriginal;
      lanzarConfeti(botonReservar);
      mostrarMensaje('¡Reserva registrada correctamente!');
      mostrarTicket(codigo, datos);

      formReserva.reset();
      limpiarEstados();

      setTimeout(() => {
        botonReservar.classList.remove('exito');
        botonReservar.disabled = false;
      }, 1800);
    } catch (error) {
      console.error(error);
      botonReservar.classList.remove('cargando');
      botonReservar.disabled = false;
      textoBoton.textContent = textoOriginal;
      mostrarMensaje('Ocurrió un error al registrar tu reserva. Intenta de nuevo.', true);
      sacudir();
    }
  });
}