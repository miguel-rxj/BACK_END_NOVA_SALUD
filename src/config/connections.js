
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

// Validar variables de entorno
const requiredKeys = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'FRONTEND_URL'
];

for (const key of requiredKeys) {
  if (!process.env[key]) {
    throw new Error(`Falta la variable: ${key}`);
  }
}

// Configuración SSL
function getSslConfig() {
  if (process.env.DATABASE_SSL !== 'true') {
    return false;
  }

  const caPath = process.env.DATABASE_CA_PATH;

  if (!caPath) {
    throw new Error('Falta DATABASE_CA_PATH');
  }

  return {
    ca: fs.readFileSync(path.resolve(caPath), 'utf8'),
    rejectUnauthorized: true
  };
}

// Conexión PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  ssl: getSslConfig()
});

// Cliente Supabase Auth
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
