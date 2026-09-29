// js/neon-config.js
// Centraliza la conexión a Neon para que no se repita en cada archivo.
// Como no usamos un empaquetador (Vite, npm), importamos el driver desde un CDN.
import { neon } from "https://esm.sh/@neondatabase/serverless";

// Reemplaza esto por tu cadena de conexión real de Neon
// (Dashboard de Neon → botón "Connect" → Connection string)
export const sql = neon("postgresql://neondb_owner:npg_EB1nvCg6bZTP@ep-silent-bird-b4dbg0yb-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require");