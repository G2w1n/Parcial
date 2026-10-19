import { sql } from '../config/neon-config.js';
import { exigirRol } from '../auth/auth.js';
import {
  calcularMontoServicio, desglosarMonto, formatearSoles, marcado, NOMBRES_VEHICULO,
  TARIFA_POR_HORA, ADICIONAL_ZONA_VIP, RECARGO_BUS_CAMION, HORAS_MAXIMAS,
} from './tarifario.js';
import { sinAnimaciones } from '../config/ui.js';

const usuario = exigirRol('cliente');
if (!usuario) throw new Error('Acceso denegado');

export async function guardarReservaEstacionamiento(datos) {
  const codigo = 'COD-' + Date.now().toString().slice(-8);
  const monto = calcularMontoServicio(datos); // se recalcula aquí: no se confía en la pantalla
  const filas = await sql`
    INSERT INTO reservas_estacionamiento
      (codigo_seguimiento, nombre_pasajero, placa, fecha_hora_entrada,
       horas, tipo_vehiculo, zona_vip, monto_calculado, estado_pago, estado, usuario_id)
    VALUES
      (${codigo}, ${datos.nombre_pasajero}, ${datos.placa}, ${datos.fecha_hora_entrada},
       ${Number(datos.horas)}, ${datos.tipo_vehiculo}, ${marcado(datos.zona_vip)}, ${monto},
       'pendiente', 'registrado', ${usuario.id})
    RETURNING id, codigo_seguimiento;
  `;
  return { ...filas[0], monto };
}

const formReserva = document.getElementById('form-reserva-estacionamiento');

if (formReserva) {
  const $ = (id) => document.getElementById(id);

  const tarjeta = $('reserva-card');
  const nombre = $('re-nombre');
  const placa = $('re-placa');
  const fecha = $('re-fecha');
  const horas = $('re-horas');
  const botonReservar = formReserva.querySelector('button[type="submit"]');
  const textoBoton = botonReservar.querySelector('.btn-texto');
  const textoOriginal = textoBoton.textContent;
  const confirmacionEl = $('reserva-confirmacion');
  const ticket = $('ticket-reserva');
  const botonCopiar = $('btn-copiar');
  const listoEl = $('rv-listo');
  const desgloseEl = $('rv-desglose');
  const notaEl = $('rv-nota');
  const salidaMonto = $('monto-estimado');
  const resumen = {
    nombre: $('rv-nombre'),
    placa: $('rv-placa'),
    fecha: $('rv-fecha'),
    horas: $('rv-horas'),
    vehiculo: $('rv-vehiculo'),
    vip: $('rv-vip'),
  };

  const leerFormulario = () => Object.fromEntries(new FormData(formReserva));

  const campos = [
    {
      input: nombre,
      msg: $('msg-nombre'),
      validar: (v) => (v.trim().length >= 3 ? '' : 'Escribe al menos 3 caracteres.'),
    },
    {
      input: placa,
      msg: $('msg-placa'),
      validar: (v) => (/^[A-Za-z0-9-]{6,10}$/.test(v.trim()) ? '' : 'Usa de 6 a 10 letras, números o guiones (ej. ABC-123).'),
    },
    {
      input: fecha,
      msg: $('msg-fecha'),
      validar: (v) => (v ? '' : 'Elige la fecha y la hora de entrada.'),
    },
    {
      input: horas,
      msg: $('msg-horas'),
      validar: (v) => {
        const h = Number(v);
        return v !== '' && Number.isFinite(h) && h > 0 && h <= HORAS_MAXIMAS
          ? ''
          : `Indica las horas (de 0.5 a ${HORAS_MAXIMAS}).`;
      },
    },
  ];

  let codigoActual = '';

  // Las tarifas se escriben desde tarifario.js: cambiar un precio es tocar un solo archivo
  document.querySelectorAll('[data-tarifa]').forEach((el) => {
    const tipo = el.dataset.tarifa;
    if (tipo === 'hora') el.textContent = formatearSoles(TARIFA_POR_HORA);
    if (tipo === 'vip') el.textContent = formatearSoles(ADICIONAL_ZONA_VIP);
    if (tipo === 'bus') el.textContent = `+${Math.round(RECARGO_BUS_CAMION * 100)} %`;
  });

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

  // Resumen y cotización en vivo
  function formatearFechaLarga(valor) {
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

  function pintarCotizacion(datos) {
    const { lineas, total, nota } = desglosarMonto(datos);

    desgloseEl.replaceChildren();
    if (lineas.length === 0) {
      const vacio = document.createElement('li');
      vacio.className = 'desglose-vacio';
      vacio.textContent = 'Indica las horas para ver el cálculo.';
      desgloseEl.append(vacio);
    } else {
      lineas.forEach((linea) => {
        const li = document.createElement('li');
        const etiqueta = document.createElement('span');
        etiqueta.textContent = linea.etiqueta;
        const valor = document.createElement('span');
        valor.textContent = formatearSoles(linea.valor);
        li.append(etiqueta, valor);
        desgloseEl.append(li);
      });
    }
    notaEl.textContent = nota;

    const nuevo = formatearSoles(total);
    if (salidaMonto.textContent !== nuevo) {
      salidaMonto.textContent = nuevo;
      salidaMonto.classList.remove('cambio');
      void salidaMonto.offsetWidth;
      salidaMonto.classList.add('cambio');
    }
  }

  function actualizarResumen() {
    const datos = leerFormulario();
    actualizarDato(resumen.nombre, nombre.value.trim());
    actualizarDato(resumen.placa, placa.value.trim().toUpperCase());
    actualizarDato(resumen.fecha, formatearFechaLarga(fecha.value));
    actualizarDato(resumen.horas, horas.value ? `${Number(horas.value)} h` : '');
    actualizarDato(resumen.vehiculo, NOMBRES_VEHICULO[datos.tipo_vehiculo]);
    actualizarDato(resumen.vip, marcado(datos.zona_vip) ? 'Sí' : 'No');
    pintarCotizacion(datos);

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

  // Radios y casilla VIP (change) y cualquier tecla (input): el monto cambia en vivo
  formReserva.addEventListener('change', actualizarResumen);
  actualizarResumen();

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

  // Ticket de reserva: queda pendiente de pago y ofrece pagar ahora
  function mostrarTicket(reserva, datos) {
    codigoActual = reserva.codigo_seguimiento;
    $('tk-codigo').textContent = reserva.codigo_seguimiento;
    $('tk-nombre').textContent = datos.nombre_pasajero;
    $('tk-placa').textContent = datos.placa;
    $('tk-fecha').textContent = formatearFechaLarga(datos.fecha_hora_entrada);
    $('tk-estadia').textContent =
      `${Number(datos.horas)} h · ${NOMBRES_VEHICULO[datos.tipo_vehiculo]}${marcado(datos.zona_vip) ? ' · VIP' : ''}`;
    $('tk-total').textContent = formatearSoles(reserva.monto);
    $('tk-pagar').href = `pago.html?id=${reserva.id}`;
    $('tk-ver').href = 'mis-reservas.html?nueva=' + encodeURIComponent(reserva.codigo_seguimiento);

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

    const leido = leerFormulario();
    const datos = {
      nombre_pasajero: nombre.value.trim(),
      placa: placa.value.trim().toUpperCase(),
      fecha_hora_entrada: fecha.value,
      horas: horas.value,
      tipo_vehiculo: leido.tipo_vehiculo,
      zona_vip: leido.zona_vip,
    };

    confirmacionEl.classList.remove('visible', 'error');
    botonReservar.disabled = true;
    botonReservar.classList.add('cargando');
    textoBoton.textContent = 'Reservando...';

    try {
      const reserva = await guardarReservaEstacionamiento(datos);

      botonReservar.classList.remove('cargando');
      botonReservar.classList.add('exito');
      textoBoton.textContent = textoOriginal;
      mostrarMensaje('¡Reserva registrada! Falta pagarla para habilitar tu pase de salida.');
      mostrarTicket(reserva, datos);

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