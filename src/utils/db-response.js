const { pool } = require('../config/connections');
const { fail } = require('./http');

// Ejecuta una consulta SQL y responde con un arreglo de resultados
const query = async (res, sql, values = []) => {
  const result = await pool.query(sql, values);
  res.json(result.rows);
};

// Ejecuta una consulta SQL y responde con un único registro (lanza 404 si no existe)
const one = async (res, sql, values = [], status = 200) => {
  const { rows } = await pool.query(sql, values);
  if (!rows.length) throw fail(404, 'Registro no encontrado');
  res.status(status).json(rows[0]);
};

// Funciones auxiliares de CRUD (generación de rutas)
const list = (path, sql) =>
  app.get('/api/' + path, auth, wrap(async (req, res) => query(res, sql)));

const get = (path, table, key) =>
  app.get(
    '/api/' + path + '/:id',
    auth,
    params,
    wrap(async (req, res) =>
      one(res, `SELECT * FROM public.${table} WHERE ${key} = $1`, [req.params.id])
    )
  );

const insert = (path, table, fields, schema, role) =>
  app.post(
    '/api/' + path,
    auth,
    ...(role ? [admin] : []),
    validate(schema),
    wrap(async (req, res) => {
      const cols = fields.filter((f) => req.body[f] !== undefined);
      const vals = cols.map((f) => req.body[f]);

      await one(
        res,
        `INSERT INTO public.${table} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
        vals,
        201
      );
    })
  );

const update = (path, table, key, fields, schema, role) =>
  app.patch(
    '/api/' + path + '/:id',
    auth,
    ...(role ? [admin] : []),
    params,
    validate(schema),
    wrap(async (req, res) => {
      const cols = fields.filter((f) => req.body[f] !== undefined);
      if (!cols.length) throw fail(422, 'No hay campos para actualizar');

      await one(
        res,
        `UPDATE public.${table} SET ${cols.map((f, i) => `${f} = $${i + 1}`).join(', ')} WHERE ${key} = $${cols.length + 1} RETURNING *`,
        [...cols.map((f) => req.body[f]), req.params.id]
      );
    })
  );

module.exports = { query, one };