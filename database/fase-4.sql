-- =====================================================================
-- Fase 4: cupones, ampliaciones de estadía, calificaciones y pedidos
-- ---------------------------------------------------------------------
-- Cómo ejecutarlo (una sola vez):
--   1. Entra a https://console.neon.tech y abre tu proyecto.
--   2. Menú izquierdo -> "SQL Editor".
--   3. Pega TODO este archivo y pulsa "Run".
-- Se puede ejecutar más de una vez sin problema: no borra ni duplica nada.
-- =====================================================================

-- ---------- 1. Cupones de descuento (se usan en la pasarela de pago) ----------
CREATE TABLE IF NOT EXISTS cupones (
  codigo        TEXT PRIMARY KEY,
  descripcion   TEXT NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('porcentaje', 'monto')),
  valor         NUMERIC(10, 2) NOT NULL CHECK (valor > 0),
  monto_minimo  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  usos_maximos  INTEGER NOT NULL DEFAULT 100,
  usos          INTEGER NOT NULL DEFAULT 0,
  vence         DATE,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  -- Si dos personas usan el último cupón a la vez, una de las dos transacciones falla
  CONSTRAINT cupones_usos_check CHECK (usos <= usos_maximos)
);

INSERT INTO cupones (codigo, descripcion, tipo, valor, monto_minimo, usos_maximos, vence) VALUES
  ('BIENVENIDO10', '10 % de descuento en tu primera reserva', 'porcentaje', 10, 0, 500, NULL),
  ('CUSCO5',       'S/ 5 de descuento en reservas desde S/ 20', 'monto', 5, 20, 200, NULL),
  ('VIAJERO20',    '20 % de descuento en reservas desde S/ 50', 'porcentaje', 20, 50, 50, NULL),
  ('VENCIDO',      'Cupón de prueba que ya venció', 'porcentaje', 50, 0, 10, '2025-01-01')
ON CONFLICT (codigo) DO NOTHING;

-- Cada pago guarda el cupón usado y cuánto se descontó (los pagos anteriores quedan en 0)
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS cupon TEXT REFERENCES cupones (codigo);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS descuento NUMERIC(10, 2) NOT NULL DEFAULT 0;

-- ---------- 2. Ampliaciones de estadía (horas extra sobre una reserva ya pagada) ----------
CREATE TABLE IF NOT EXISTS ampliaciones (
  id                   SERIAL PRIMARY KEY,
  codigo_operacion     TEXT NOT NULL UNIQUE,
  id_registro          INTEGER NOT NULL REFERENCES reservas_estacionamiento (id),
  id_usuario           INTEGER REFERENCES usuarios (id),
  horas_extra          NUMERIC(6, 1) NOT NULL CHECK (horas_extra > 0),
  monto                NUMERIC(10, 2) NOT NULL CHECK (monto >= 0),
  metodo               TEXT NOT NULL,
  proveedor_billetera  TEXT,
  marca_tarjeta        TEXT,
  referencia           TEXT,
  fecha                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 3. Calificaciones de servicios ----------
CREATE TABLE IF NOT EXISTS calificaciones (
  id          SERIAL PRIMARY KEY,
  servicio    TEXT NOT NULL,
  estrellas   SMALLINT NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
  comentario  TEXT CHECK (char_length(comentario) <= 300),
  nombre      TEXT CHECK (char_length(nombre) <= 40),
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Algunas calificaciones de ejemplo (solo si la tabla está vacía)
INSERT INTO calificaciones (servicio, estrellas, comentario, nombre)
SELECT * FROM (VALUES
  ('Sala VIP', 5, 'Muy cómoda y con buena comida. Ideal si tu vuelo se demora.', 'Lucía'),
  ('Wi-Fi', 4, 'Rápido, aunque los 60 minutos gratis se acaban pronto.', 'Mark'),
  ('Estacionamiento', 5, 'Reservé en línea y salí sin hacer cola en la caja.', 'Carlos'),
  ('Restaurantes', 3, 'Buenas opciones, pero algo caras.', NULL),
  ('Seguridad', 4, 'El control fue rápido a las 6 a. m.', 'Ana'),
  ('Limpieza', 5, 'Baños siempre limpios.', NULL)
) AS ejemplo (servicio, estrellas, comentario, nombre)
WHERE NOT EXISTS (SELECT 1 FROM calificaciones);

-- ---------- 4. Pedidos de comida para recoger ----------
CREATE TABLE IF NOT EXISTS pedidos (
  id           SERIAL PRIMARY KEY,
  codigo       TEXT NOT NULL UNIQUE,
  restaurante  TEXT NOT NULL,
  items        JSONB NOT NULL,
  total        NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
  nombre       TEXT NOT NULL,
  celular      TEXT NOT NULL,
  hora_recojo  TEXT NOT NULL,
  estado       TEXT NOT NULL DEFAULT 'recibido'
               CHECK (estado IN ('recibido', 'preparando', 'listo', 'entregado', 'cancelado')),
  fecha        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
