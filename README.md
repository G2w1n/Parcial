# ✈️ Aeropuerto Internacional Qorikancha — Cusco

Sitio web del **Aeropuerto Internacional Qorikancha** (código CUZ): horarios de vuelo, servicios en sala, transporte y un **sistema de estacionamiento** completo, con reservas, pago en línea, caja presencial y panel de administración.

> Caso académico ficticio. Los datos de vuelos, tarjetas y billeteras son de prueba.

![Página de inicio](docs/capturas/inicio.webp)

## Funcionalidades

### Para el público
- **Inicio** con información del aeropuerto, servicios y requisitos.
- **Tablero de vuelos en vivo** estilo aeropuerto, con letras que giran, pestañas de salidas y llegadas, y estados que cambian con la hora de Cusco (programado, a tiempo, embarcando, puerta cerrada, demorado, cancelado).
- **Buscador de vuelos** por número, aerolínea o ciudad, y filtro por aerolínea.
- **Seguir mi vuelo**: con la estrella ☆ el vuelo pasa a "Mis vuelos", con cuenta regresiva y avisos si cambia su estado, su hora o su puerta. Se guarda en el navegador.
- **Aerolíneas**: mostrador, teléfono, destinos y próximo vuelo de cada una.
- **Check-in en línea**: datos del pasajero, mapa de asientos y **tarjeta de embarque con código QR**, imprimible y guardada en el navegador.
- **Guía del pasajero**: pasos para tu primer vuelo, **calculadora de equipaje** por aerolínea, buscador de **objetos permitidos y prohibidos**, preguntas frecuentes con buscador y qué hacer si se pierde tu maleta.
- **Descubre Cusco**: **clima en vivo** (Open-Meteo), consejos contra el **soroche**, altura de cada destino, **tours** con filtro y **conversor de monedas** con tasas del día.
- **Modo oscuro** y **modo accesible** (letra más grande, más contraste y sin animaciones) con los botones ☾ y Aa del menú; se recuerdan en el navegador.
- **Animaciones al hacer scroll** en el inicio (se desactivan si el sistema pide menos movimiento).
- **Idiomas**: selector de español, inglés y quechua en el menú. Las páginas de pasajeros, check-in y turismo están traducidas completas; en el resto se traducen el menú y el pie de página. El quechua es una traducción parcial.
- **Mapa del terminal**: planos interactivos de los 2 niveles, con buscador, filtros por categoría, tiempo de espera estimado en el control de seguridad y **cómo llegar**.
- **Estacionamiento**: mapa de espacios libres y ocupados (zona general, VIP y buses), tarifas y calculadora de costo.
- **Servicios**: Sala VIP con reserva, Wi-Fi, servicios especiales (silla de ruedas, mascotas, menores), **calificaciones con estrellas**, tiendas y restaurantes con **pedidos para recoger**, objetos perdidos, taxis, buses y alquiler de autos.

### Cliente
- **Reservar estacionamiento** con cotización en vivo: S/ 7.00 por hora o fracción, tope de S/ 60.00 por día, **tarifa nocturna** de S/ 20.00 (entrada de 22:00 a 05:59, hasta 8 h), **-10 % en fin de semana**, +50 % para bus o camión y +S/ 15.00 por zona techada VIP.
- **Mis reservas**: lista con el estado de pago y botones para pagar, editar, **ampliar la estadía** o ver el comprobante.
- **Editar reserva** mientras esté registrada y sin pagar; el monto se recalcula.
- **Pasarela de pago** con tarjeta (Visa, Mastercard, American Express) o billetera (AndiPay, PagoMóvil), y **cupones de descuento**.
- **Ampliar estadía** de una reserva pagada, pagando solo la diferencia.
- **Comprobante** imprimible que habilita el pase de salida.
- **Cancelar** una reserva registrada que aún no se pagó.
- **Mi perfil** (`perfil.html`): editar nombre y DNI, y **cambiar la contraseña**.
- **Libro de reclamaciones** (`reclamos.html`, enlace en el pie de todas las páginas): registra el reclamo o queja con un código `LR-AAAA-XXXXX` y permite consultar su estado y la respuesta.

### Seguridad (garita)
- **Garita** (`garita.html`): lee con la cámara el **código QR del comprobante**, o se escribe la placa. Muestra si la salida está habilitada, alerta si la placa está en la lista negra y registra la salida.

### Cajero
- **Cobro presencial** en efectivo (con cálculo de vuelto), POS o billetera.
- **Control de salida (garita)** por placa o código.
- **Conciliación** de los pagos recibidos por la pasarela.
- **Cierre de caja** con resumen del día (incluye ampliaciones y descuentos por cupones), que se actualiza cada 15 segundos.
- Alerta de **placas en lista negra** al cobrar y en el control de salida.
- **Apertura de caja** con fondo inicial: sin caja abierta no se puede cobrar.
- **Arqueo** al cerrar: se cuentan billetes y monedas, se compara con el efectivo esperado (fondo + cobros en efectivo) y se imprime el reporte con firmas. Si hay diferencia, se exige una nota.
- **Mis cobros** del día, con **anulación** (la reserva vuelve a pendiente) y **devolución** (la reserva se cancela), ambas con la autorización de un administrador (correo y contraseña).
- **Cobro por exceso de tiempo**: si el vehículo se quedó más de lo reservado (con 15 minutos de tolerancia), se cobra la diferencia antes de dejarlo salir.
- **Cobro rápido** por placa, **atajos de teclado** (F2 buscar, F4 cobrar el primero, F8 salida, F9 arqueo), **ticket imprimible** y **Excel del día**.

### Administrador y empleado
- **Barra del personal** en todas sus páginas: pestañas según el rol, **búsqueda global** (placa, código, nombre, pago o pedido) y **notificaciones** (pedidos nuevos, pagos por verificar, vehículos por llegar, placas en lista negra).
- **Pedidos** (`panel-pedidos.html`): Recibido → Preparando → Listo → Entregado, o Cancelar.
- **Vuelos** (`panel-vuelos.html`): demoras, cancelaciones, cambios de puerta y notas, que el tablero público muestra al instante.
- **Estadísticas** (`panel-estadisticas.html`, solo administrador): ingresos y reservas por día, horas pico, medios de pago y estados.
- **Configuración** (`panel-config.html`, solo administrador): tarifas, capacidad del estacionamiento, cupones, avisos generales y lista negra de placas.
- **Bitácora** (`panel-bitacora.html`, solo administrador): quién hizo qué y cuándo.
- **Panel** con indicadores, búsqueda y filtros de reservas.
- Crear, editar, atender y cancelar reservas.
- **Gestión de empleados** con horarios de turno (diurno o nocturno, hora de Perú).
- **Auditoría**: quién gestionó cada reserva y cuándo.
- **Mi turno** (`mi-turno.html`, empleado, cajero y seguridad): marcar entrada y salida, turnos de la semana, **mi resumen del día**, **notas entre turnos** e **incidentes** con foto.
- **Registrar entrada** real del vehículo y **asignar el espacio** libre; el mapa público usa esos espacios.
- **Cuentas del personal**: el administrador crea empleados, cajeros y personal de seguridad, y puede restablecer su contraseña.
- **Turnos** (`panel-turnos.html`, solo administrador): calendario semanal (mañana, tarde, noche), cobertura por día y copiar a la semana siguiente.
- **Rendimiento del personal** en Estadísticas: reservas, entradas y salidas, pedidos, cobros y horas trabajadas por persona.
- **Historial por placa** (`historial.html`): reservas, pagos, excesos, incidentes y lista negra de un vehículo; se llega desde la búsqueda global.
- **Reclamos** (`panel-reclamos.html`, solo administrador): poner en revisión y responder, con el conteo de días hábiles.
- **Exportar a Excel** las reservas, la bitácora, el día de caja y el historial de una placa.

![Tablero de vuelos](docs/capturas/vuelos.webp)

![Editar reserva](docs/capturas/editar-reserva.webp)

## Tecnologías

| Capa | Tecnología |
|---|---|
| Interfaz | HTML5, CSS3 y JavaScript (módulos ES), sin frameworks |
| Base de datos | [Neon](https://neon.tech) (PostgreSQL serverless) |
| Conexión | `@neondatabase/serverless`, cargado desde CDN (esm.sh) |
| Tipografías | Space Grotesk e Inter (Google Fonts) |
| Clima | [Open-Meteo](https://open-meteo.com) (gratis, sin clave) |
| Tipo de cambio | [ExchangeRate-API](https://www.exchangerate-api.com) (open.er-api.com, gratis, sin clave) |
| Código QR | qrcode-generator 1.4.4 (MIT) para generarlo y jsQR 1.4.0 (Apache 2.0) para leerlo con la cámara, incluidos en `js/vendor/` |

## Estructura del proyecto

```
├── index.html               Inicio
├── vuelos.html              Tablero de vuelos en vivo
├── aerolineas.html          Aerolíneas
├── checkin.html             Check-in en línea
├── terminal.html            Mapa del terminal
├── estacionamiento.html     Espacios libres, tarifas y calculadora
├── ampliar.html             Ampliar estadía (cliente)
├── garita.html              Garita de salida con lector QR (seguridad)
├── panel-*.html             Pedidos, vuelos, estadísticas, configuración y bitácora
├── pasajero.html            Guía del pasajero
├── turismo.html             Descubre Cusco
├── Servicios.html, Objetos.html, tienda_restaurante.html
├── taxis.html, buses.html, alquiler.html
├── login.html               Iniciar sesión / crear cuenta
├── Transporte.html          Reservar estacionamiento (cliente)
├── mis-reservas.html        Mis reservas (cliente)
├── actualizar.html          Editar reserva (cliente)
├── pago.html                Pasarela de pago (cliente)
├── comprobante.html         Constancia de pago
├── caja.html                Módulo de caja (cajero)
├── panel.html               Panel de gestión (administrador y empleado)
├── 404.html                 Página no encontrada
├── css/
│   ├── base.css             Estilos comunes: colores, encabezado, menú y pie de página
│   └── <página>.css         Estilos propios de cada página
├── js/
│   ├── config/              Conexión a Neon, utilidades de interfaz e idiomas
│   ├── auth/                Login, sesión y roles
│   ├── registro/            Reserva y reglas de tarifa (tarifario.js)
│   ├── consulta/            Mis reservas
│   ├── actualizar/          Editar reserva
│   ├── pago/                Validaciones y pasarela
│   ├── comprobante/         Constancia de pago
│   ├── caja/                Módulo de caja
│   ├── panel/               Panel de gestión
│   ├── vuelos/              Vuelos simulados, tablero y aerolíneas
│   ├── pasajero/            Check-in, equipaje y objetos permitidos
│   ├── turismo/             Clima, tours y monedas
│   ├── terminal/            Plano del terminal y lugares
│   ├── estacionamiento/     Mapa de espacios y ampliar estadía
│   ├── servicios/           Sala VIP, calificaciones y pedidos
│   ├── garita/              Lector QR y salida de vehículos
│   ├── reclamos/            Libro de reclamaciones
│   ├── perfil/              Mi perfil y cambio de contraseña
│   ├── inicio/              Animaciones del inicio
│   └── vendor/              qrcode-generator 1.4.4 (MIT) y jsQR 1.4.0 (Apache 2.0)
├── database/
│   ├── fase-4.sql           Tablas de cupones, ampliaciones, calificaciones y pedidos
│   ├── fase-5.sql           Rol seguridad, vuelos, avisos, bitácora, configuración y lista negra
│   └── fase-6.sql           Contraseñas cifradas, caja, anulaciones, turnos, asistencia, incidentes y reclamos
├── imagenes/
└── docs/capturas/
```

## Cómo ejecutarlo

El proyecto usa módulos de JavaScript, así que **debe abrirse con un servidor**: al abrir el archivo con doble clic, los módulos no cargan.

**Opción 1: VS Code.** Instala la extensión **Live Server**, haz clic derecho en `index.html` y elige *Open with Live Server*.

**Opción 2: terminal.**
```bash
python -m http.server 8000
# abre http://localhost:8000
```

**Opción 3: GitHub Pages.** En *Settings → Pages*, elige la rama `main` y la carpeta `/ (root)`.

### Configurar la base de datos
La cadena de conexión está en `js/config/neon-config.js`. Para usar tu propia base, cópiala desde el panel de Neon (*Connect → Connection string*).

**Tablas de la fase 4:** abre `database/fase-4.sql`, pégalo en *Neon → SQL Editor* y pulsa *Run* (una sola vez; se puede repetir sin problemas). Crea las tablas `cupones`, `ampliaciones`, `calificaciones` y `pedidos`, y agrega las columnas `cupon` y `descuento` a `pagos`. Mientras no se ejecute, esas funciones muestran un aviso y el resto del sitio sigue funcionando.

**Tablas de la fase 5:** después del de la fase 4, ejecuta igual `database/fase-5.sql`. Agrega el rol `seguridad` (con una cuenta de prueba) y crea las tablas `vuelos_cambios`, `avisos`, `bitacora`, `configuracion` y `lista_negra`.

**Tablas de la fase 6:** después del de la fase 5, ejecuta `database/fase-6.sql`. **Cifra las contraseñas** con bcrypt (extensión `pgcrypto`; las cuentas siguen entrando con la misma contraseña), permite el estado `anulado` en `pagos`, agrega la entrada y salida reales y el espacio a las reservas, y crea las tablas `cajas`, `anulaciones`, `turnos`, `asistencia`, `notas_turno`, `incidentes` y `reclamos`. También crea la cuenta de cajero de prueba `caja@qorikancha.pe` / `caja123`.

Cupones de prueba: `BIENVENIDO10` (10 %), `CUSCO5` (S/ 5 desde S/ 20), `VIAJERO20` (20 % desde S/ 50) y `VENCIDO` (para probar el error).

## Roles

| Rol | Página de inicio | Cómo se obtiene |
|---|---|---|
| `cliente` | Reservar estacionamiento | Creando una cuenta en `login.html` |
| `cajero` | Caja | Creado por el administrador desde el panel · cuenta de prueba `caja@qorikancha.pe` / `caja123` |
| `empleado` | Panel (solo dentro de su turno) | Creado por el administrador desde el panel |
| `administrador` | Panel (con acceso a todo) | Asignado en la tabla `usuarios` |
| `seguridad` | Garita | Creado por el administrador desde el panel · cuenta de prueba `garita@qorikancha.pe` / `garita123` |

## Vuelos simulados

Los vuelos no se guardan en la base de datos. Están en `js/vuelos/datos-vuelos.js` como un itinerario diario, y su estado se calcula con la hora de Cusco. Las demoras, cancelaciones y cambios de puerta se eligen al azar, pero son siempre los mismos para un mismo día, así el tablero se ve en vivo a cualquier hora. Para agregar o cambiar un vuelo, se edita el arreglo `ITINERARIO`.

Enlaces directos: `vuelos.html?aerolinea=LA`, `vuelos.html?vuelo=LA2021` y `vuelos.html?tipo=llegada`.

## Datos simulados

- **Vuelos**: itinerario en `js/vuelos/datos-vuelos.js`.
- **Plano del terminal**: lugares y zonas en `js/terminal/lugares.js`.
- **Ocupación del estacionamiento**: suma las reservas en línea activas (reales) y una ocupación simulada de quienes llegan sin reserva.
- **Tiempo de espera en seguridad**: se estima con la cantidad de vuelos que salen en las próximas 2 horas.
- **Sala VIP**: la reserva se guarda solo en el navegador.

## Idiomas

`js/config/idioma.js` agrega el selector al menú y recuerda el idioma elegido. Los textos marcados con `data-i18n` se traducen con el diccionario de `js/config/traducciones.js`; para traducir otro texto, se agrega la frase en español con su versión `en` (y `qu` si se tiene). Lo que no tiene traducción se muestra en español.

## Datos de prueba para pagos

La página de pago tiene botones que llenan el formulario automáticamente.

| Caso | Número / celular | Venc. | CVV / código |
|---|---|---|---|
| Visa débito (aprobada) | 4111 1111 1111 1111 | 12/29 | 123 |
| Mastercard crédito (aprobada) | 5555 5555 5555 4444 | 05/30 | 789 |
| American Express (aprobada) | 3782 822463 10005 | 11/28 | 1234 |
| Visa (saldo insuficiente) | 4000 0000 0000 0002 | 08/28 | 456 |
| Mastercard (bloqueada) | 5105 1051 0510 5100 | 03/27 | 321 |
| AndiPay (aprobada) | 987 654 321 | — | 123456 |
| PagoMóvil (saldo insuficiente) | 912 345 678 | — | 654321 |

## Tablas principales

| Tabla | Para qué sirve |
|---|---|
| `usuarios` | Cuentas, rol, estado activo y horario de turno |
| `reservas_estacionamiento` | Reservas: placa, horas, vehículo, zona VIP, monto, estado y estado de pago |
| `pagos` | Cada intento de pago (aprobado o rechazado), canal, medio, cajero y verificación |
| `banco_cuentas`, `banco_tarjetas` | Entidad emisora simulada para la pasarela |
| `billeteras` | Billeteras electrónicas simuladas |
| `cupones` | Cupones de descuento, con usos máximos y vencimiento (fase 4) |
| `ampliaciones` | Horas extra pagadas sobre una reserva ya pagada (fase 4) |
| `calificaciones` | Estrellas y comentarios de los servicios (fase 4) |
| `pedidos` | Pedidos de comida para recoger y su estado (fase 4) |
| `vuelos_cambios` | Demoras, cancelaciones y puertas cambiadas a mano (fase 5) |
| `avisos` | Avisos generales que se muestran en todas las páginas (fase 5) |
| `bitacora` | Actividad del personal (fase 5) |
| `configuracion` | Tarifas y capacidad editables desde el panel (fase 5) |
| `lista_negra` | Placas bloqueadas (fase 5) |
| `cajas` | Apertura y arqueo de caja de cada cajero (fase 6) |
| `anulaciones` | Cobros anulados y devoluciones, con quién autorizó (fase 6) |
| `turnos`, `asistencia` | Calendario de turnos y marcas de entrada y salida (fase 6) |
| `notas_turno`, `incidentes` | Notas entre turnos e incidentes con foto (fase 6) |
| `reclamos` | Libro de reclamaciones (fase 6) |

> `fecha_hora_entrada` se guarda en hora de Perú (como la escribe el formulario). De ella dependen la tarifa nocturna, el descuento de fin de semana y el mapa de espacios ocupados.

## Seguridad: notas del caso académico

- La conexión a la base de datos se hace desde el navegador, por eso la cadena de conexión es visible. En un sistema real, las consultas pasarían por un servidor (API) y la cadena estaría en variables de entorno.
- Las consultas usan plantillas con parámetros del driver de Neon, lo que evita la inyección SQL.
- Los datos se muestran con `textContent` o escapados, lo que evita la inyección de HTML (XSS).
- Los montos siempre se recalculan o se leen de la base de datos; nunca se confía en el valor del formulario.
- Las contraseñas se guardan **cifradas con bcrypt** (`crypt()` de `pgcrypto`) desde la fase 6.
- Anular o devolver un cobro exige la contraseña de un administrador y queda registrado en `anulaciones` y en la bitácora.
- Los pagos se confirman en **transacciones**: se descuenta el saldo, se registra el pago y se marca la reserva, o no se hace nada.
