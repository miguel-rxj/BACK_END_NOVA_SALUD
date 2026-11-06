require('dotenv').config();
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

// Validar variables de entorno requeridas
const requiredKeys = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'FRONTEND_URL'];
for (const key of requiredKeys) {
  if (!process.env[key]) {
    throw new Error(`Falta la variable de entorno: ${key}`);
  }
}

// Configuración de la conexión a PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true },
});

// Configuración del cliente de Supabase
const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_ANON_KEY, 
  {
    auth: { 
      persistSession: false, 
      autoRefreshToken: false 
    }
  }
);

module.exports = { pool, supabase };