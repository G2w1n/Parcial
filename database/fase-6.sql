-- =====================================================================
-- Fase 6: personal y clientes
--   contraseñas encriptadas, caja (apertura, arqueo, anulaciones),
--   entrada/salida real con cobro por exceso, turnos, asistencia,
--   notas entre turnos, incidentes y libro de reclamaciones
-- ---------------------------------------------------------------------
-- Requiere haber ejecutado antes database/fase-4.sql y database/fase-5.sql.
-- Cómo ejecutarlo (una sola vez): Neon -> SQL Editor -> pegar todo -> Run.
-- Se puede ejecutar más de una vez sin problema: no borra ni duplica nada.
-- =====================================================================

-- ---------- 1. Contraseñas encriptadas (bcrypt con pgcrypto) ----------
-- Las contraseñas que ya existen se encriptan aquí: nadie tiene que cambiar la suya.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE usuarios ALTER COLUMN contrasena TYPE TEXT;
UPDATE usuarios
SET contrasena = crypt(contrasena, gen_salt('bf'))
WHERE contrasena NOT LIKE '$2%';

-- ---------- 2. Pagos anulados (error de cobro o devolución) ----------
-- La columna estado de pagos puede tener una restricción CHECK: se vuelve a crear con 'anulado'
DO $$
DECLARE
  restriccion TEXT;
BEGIN
  FOR restriccion IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'pagos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%estado%'
      AND pg_get_constraintdef(oid) ILIKE '%aprobado%'
  LOOP
    EXECUTE format('ALTER TABLE pagos DROP CONSTRAINT %I', restriccion);
  END LOOP;
  ALTER TABLE pagos ADD CONSTRAINT pagos_estado_check CHECK (estado IN ('aprobado', 'rechazado', 'anulado'));
END $$;

-- Si el índice único de pagos por reserva no distingue el estado, una reserva anulada no podría volver
-- a cobrarse: se reemplaza por uno que solo impide dos pagos APROBADOS de la misma reserva
DO $$
DECLARE i RECORD;
BEGIN
  FOR i IN
    SELECT ix.indexrelid::regclass AS indice, con.conname AS restriccion
    FROM pg_index ix
    JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = ANY (ix.indkey)
    LEFT JOIN pg_constraint con ON con.conindid = ix.indexrelid
    WHERE ix.indrelid = 'pagos'::regclass AND ix.indisunique AND NOT ix.indisprimary
      AND ix.indpred IS NULL AND ix.indnatts = 1 AND a.attname = 'id_registro'
  LOOP
    IF i.restriccion IS NOT NULL THEN
      EXECUTE format('ALTER TABLE pagos DROP CONSTRAINT %I', i.restriccion);
    ELSE
      EXECUTE format('DROP INDEX %s', i.indice);
    END IF;
  END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS pagos_un_aprobado_por_reserva ON pagos (id_registro) WHERE estado = 'aprobado';

CREATE TABLE IF NOT EXISTS anulaciones (
  id                SERIAL PRIMARY KEY,
  codigo_operacion  TEXT NOT NULL,                 -- el pago que se anuló
  tipo              TEXT NOT NULL CHECK (tipo IN ('anulacion', 'devolucion')),
  monto             NUMERIC(10, 2) NOT NULL,
  metodo            TEXT,
  motivo            TEXT NOT NULL CHECK (char_length(motivo) <= 200),
  cajero_id         INTEGER REFERENCES usuarios (id),
  autorizado_por    INTEGER REFERENCES usuarios (id),
  fecha             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 3. Sesiones de caja (apertura y arqueo) ----------
CREATE TABLE IF NOT EXISTS cajas (
  id                  SERIAL PRIMARY KEY,
  cajero_id           INTEGER NOT NULL REFERENCES usuarios (id),
  apertura            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  monto_inicial       NUMERIC(10, 2) NOT NULL CHECK (monto_inicial >= 0),
  cierre              TIMESTAMPTZ,
  efectivo_esperado   NUMERIC(10, 2),
  efectivo_contado    NUMERIC(10, 2),
  diferencia          NUMERIC(10, 2),
  detalle_conteo      JSONB,
  nota                TEXT CHECK (char_length(nota) <= 200),
  estado              TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada'))
);
-- Un cajero solo puede tener una caja abierta a la vez
CREATE UNIQUE INDEX IF NOT EXISTS cajas_una_abierta ON cajas (cajero_id) WHERE estado = 'abierta';

-- ---------- 4. Entrada y salida real, espacio asignado ----------
ALTER TABLE reservas_estacionamiento ADD COLUMN IF NOT EXISTS hora_entrada_real TIMESTAMPTZ;
ALTER TABLE reservas_estacionamiento ADD COLUMN IF NOT EXISTS hora_salida_real TIMESTAMPTZ;
ALTER TABLE reservas_estacionamiento ADD COLUMN IF NOT EXISTS espacio TEXT;

-- El exceso de tiempo se cobra como una ampliación de tipo "exceso" (en caja)
ALTER TABLE ampliaciones ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'ampliacion';
ALTER TABLE ampliaciones ADD COLUMN IF NOT EXISTS id_cajero INTEGER REFERENCES usuarios (id);

-- ---------- 5. Turnos planificados y asistencia ----------
CREATE TABLE IF NOT EXISTS turnos (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios (id),
  fecha       DATE NOT NULL,
  turno       TEXT NOT NULL CHECK (turno IN ('manana', 'tarde', 'noche')),
  creado_por  INTEGER REFERENCES usuarios (id),
  UNIQUE (usuario_id, fecha)
);

CREATE TABLE IF NOT EXISTS asistencia (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios (id),
  entrada     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  salida      TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS asistencia_una_abierta ON asistencia (usuario_id) WHERE salida IS NULL;

-- ---------- 6. Notas entre turnos e incidentes ----------
CREATE TABLE IF NOT EXISTS notas_turno (
  id            SERIAL PRIMARY KEY,
  autor_id      INTEGER REFERENCES usuarios (id),
  autor_nombre  TEXT,
  mensaje       TEXT NOT NULL CHECK (char_length(mensaje) BETWEEN 2 AND 300),
  fecha         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS incidentes (
  id              SERIAL PRIMARY KEY,
  tipo            TEXT NOT NULL CHECK (tipo IN ('choque', 'mal_estacionado', 'objeto_encontrado', 'dano', 'otro')),
  descripcion     TEXT NOT NULL CHECK (char_length(descripcion) <= 500),
  placa           TEXT,
  foto            TEXT,                         -- imagen pequeña en base64 (opcional)
  estado          TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'resuelto')),
  reportado_por   INTEGER REFERENCES usuarios (id),
  reportado_nombre TEXT,
  fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 7. Libro de reclamaciones ----------
CREATE TABLE IF NOT EXISTS reclamos (
  id               SERIAL PRIMARY KEY,
  codigo           TEXT NOT NULL UNIQUE,
  tipo             TEXT NOT NULL CHECK (tipo IN ('reclamo', 'queja', 'sugerencia')),
  nombre           TEXT NOT NULL CHECK (char_length(nombre) <= 80),
  documento        TEXT CHECK (char_length(documento) <= 15),
  correo           TEXT NOT NULL CHECK (char_length(correo) <= 120),
  detalle          TEXT NOT NULL CHECK (char_length(detalle) <= 1000),
  pedido           TEXT CHECK (char_length(pedido) <= 300),     -- lo que pide el cliente
  estado           TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'en_revision', 'resuelto')),
  respuesta        TEXT CHECK (char_length(respuesta) <= 1000),
  respondido_por   INTEGER REFERENCES usuarios (id),
  fecha_respuesta  TIMESTAMPTZ,
  fecha            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cuenta de prueba de cajero (correo: caja@qorikancha.pe · contraseña: caja123)
INSERT INTO usuarios (nombre, correo, contrasena, rol)
SELECT 'Cajero de prueba', 'caja@qorikancha.pe', crypt('caja123', gen_salt('bf')), 'cajero'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE correo = 'caja@qorikancha.pe');
