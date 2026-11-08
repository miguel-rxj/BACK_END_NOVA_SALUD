import pg from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';
import { AppError } from './utils/errors.js';

const { Pool, types } = pg;

// NUMERIC -> number, BIGINT -> number, DATE -> 'YYYY-MM-DD' (sin desfase de zona horaria)
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1082, (v) => v);

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  // Supabase exige SSL. Con DB_SSL=false (BD local) se desactiva.
  ssl: config.DB_SSL ? { rejectUnauthorized: false } : false,
  max: config.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
pool.on('error', (err) => logger.error({ err }, 'Error en conexión inactiva del pool'));

/** SIEMPRE con parámetros ($1, $2...). Nunca concatenar datos del usuario en `text`. */
export const query = (text, params) => pool.query(text, params);

/** Acumula filtros dinámicos. `sql` usa `?` como marcador; el valor siempre va como parámetro. */
export function makeFilter() {
  const where = [];
  const params = [];
  return {
    where,
    params,
    add(sql, value) {
      params.push(value);
      where.push(sql.replaceAll('?', `$${params.length}`));
    },
  };
}

/** Consulta paginada. select/from/orderBy son texto fijo del código; los valores van parametrizados. */
export async function selectPage({ select, from, where = [], params = [], orderBy, page, pageSize }) {
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows, count] = await Promise.all([
    query(
      `SELECT ${select} FROM ${from} ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    ),
    query(`SELECT count(*)::int AS total FROM ${from} ${whereSql}`, params),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

/** UPDATE parcial: solo columnas de la lista blanca `allowed` que vengan definidas en `body`. */
export function buildUpdate(table, idCol, id, allowed, body) {
  const sets = [];
  const params = [];
  for (const col of allowed) {
    if (body[col] !== undefined) {
      params.push(body[col]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (!sets.length) throw new AppError(422, 'VALIDACION', 'No hay campos para actualizar');
  params.push(id);
  return {
    text: `UPDATE ${table} SET ${sets.join(', ')} WHERE ${idCol} = $${params.length} RETURNING ${idCol}`,
    params,
  };
}
