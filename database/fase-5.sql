-- =====================================================================
-- Fase 5: administración (vuelos, avisos, bitácora, configuración,
--         lista negra de placas y rol "seguridad" para la garita)
-- ---------------------------------------------------------------------
-- Requiere haber ejecutado antes database/fase-4.sql.
-- Cómo ejecutarlo (una sola vez):
--   1. Entra a https://console.neon.tech y abre tu proyecto.
--   2. Menú izquierdo -> "SQL Editor".
--   3. Pega TODO este archivo y pulsa "Run".
-- Se puede ejecutar más de una vez sin problema: no borra ni duplica nada.
-- =====================================================================

-- ---------- 1. Nuevo rol "seguridad" (personal de la garita) ----------
-- La columna rol puede tener una restricción CHECK o ser un tipo ENUM: se contemplan los dos casos
DO $$
DECLARE
  tipo TEXT;
  restriccion TEXT;
BEGIN
  SELECT data_type, udt_name INTO tipo, restriccion
  FROM information_schema.columns
  WHERE table_name = 'usuarios' AND column_name = 'rol';

  IF tipo = 'USER-DEFINED' THEN
    EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', restriccion, 'seguridad');
  ELSE
    FOR restriccion IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'usuarios'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%rol%'
    LOOP
      EXECUTE format('ALTER TABLE usuarios DROP CONSTRAINT %I', restriccion);
    END LOOP;
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
      CHECK (rol IN ('cliente', 'administrador', 'empleado', 'cajero', 'seguridad'));
  END IF;
END $$;

-- Cuenta de prueba para la garita (correo: garita@qorikancha.pe · contraseña: garita123)
INSERT INTO usuarios (nombre, correo, contrasena, rol)
SELECT 'Garita principal', 'garita@qorikancha.pe', 'garita123', 'seguridad'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE correo = 'garita@qorikancha.pe');

-- ---------- 2. Cambios manuales a los vuelos (el tablero los aplica sobre el itinerario) ----------
CREATE TABLE IF NOT EXISTS vuelos_cambios (
  codigo_vuelo     TEXT NOT NULL,              -- ej. 'LA 2021'
  dia              DATE NOT NULL,              -- día del vuelo (hora de Perú)
  cancelado        BOOLEAN NOT NULL DEFAULT FALSE,
  demora_minutos   INTEGER CHECK (demora_minutos BETWEEN 0 AND 600),  -- NULL = la del itinerario
  puerta           TEXT,                       -- NULL = la del itinerario
  nota             TEXT CHECK (char_length(nota) <= 120),
  actualizado_por  INTEGER REFERENCES usuarios (id),
  fecha            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (codigo_vuelo, dia)
);

-- ---------- 3. Avisos generales (banner en todas las páginas) ----------
CREATE TABLE IF NOT EXISTS avisos (
  id          SERIAL PRIMARY KEY,
  mensaje     TEXT NOT NULL CHECK (char_length(mensaje) BETWEEN 5 AND 200),
  tipo        TEXT NOT NULL DEFAULT 'info' CHECK (tipo IN ('info', 'alerta', 'urgente')),
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  hasta       TIMESTAMPTZ,                    -- NULL = hasta que se desactive
  creado_por  INTEGER REFERENCES usuarios (id),
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 4. Bitácora de actividad del personal ----------
CREATE TABLE IF NOT EXISTS bitacora (
  id              SERIAL PRIMARY KEY,
  usuario_id      INTEGER REFERENCES usuarios (id),
  usuario_nombre  TEXT,
  rol             TEXT,
  accion          TEXT NOT NULL,
  detalle         TEXT,
  fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bitacora_fecha_idx ON bitacora (fecha DESC);

-- ---------- 5. Configuración editable desde el panel (tarifas y capacidad) ----------
CREATE TABLE IF NOT EXISTS configuracion (
  clave           TEXT PRIMARY KEY,
  valor           JSONB NOT NULL,
  actualizado_por INTEGER REFERENCES usuarios (id),
  fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO configuracion (clave, valor) VALUES
  ('tarifas', '{"porHora": 7, "diaCompleto": 60, "nocturna": 20, "horasNocturna": 8, "descuentoFinDeSemana": 0.10, "recargoBusCamion": 0.5, "adicionalVip": 15}'),
  ('capacidad', '{"normal": 60, "vip": 20, "bus": 8}')
ON CONFLICT (clave) DO NOTHING;

-- ---------- 6. Lista negra de placas ----------
CREATE TABLE IF NOT EXISTS lista_negra (
  placa       TEXT PRIMARY KEY,               -- siempre en mayúsculas
  motivo      TEXT NOT NULL CHECK (char_length(motivo) <= 150),
  deuda       NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (deuda >= 0),
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_por  INTEGER REFERENCES usuarios (id),
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO lista_negra (placa, motivo, deuda) VALUES
  ('XYZ-999', 'Salió sin pagar el 12/09 (placa de prueba)', 45)
ON CONFLICT (placa) DO NOTHING;
