const { z, id } = require('../validators/common');
const { auth, admin } = require('../middlewares/auth');
const { validate, params } = require('../middlewares/validate');
const { wrap, fail } = require('./http');
const { query, one } = require('./db-response');
const { pool } = require('../config/connections');

module.exports = (router) => {
  // Generar ruta para listar registros
  const list = (path, sql) =>
    router.get(
      '/' + path,
      auth,
      wrap(async (req, res) => query(res, sql))
    );

  // Generar ruta para obtener un registro por ID
  const get = (path, table, key) =>
    router.get(
      '/' + path + '/:id',
      auth,
      params,
      wrap(async (req, res) =>
        one(res, `SELECT * FROM public.${table} WHERE ${key} = $1`, [req.params.id])
      )
    );

  // Generar ruta para insertar un nuevo registro
  const insert = (path, table, fields, schema, role) =>
    router.post(
      '/' + path,
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

  // Generar ruta para actualizar un registro existente
  const update = (path, table, key, fields, schema, role) =>
    router.patch(
      '/' + path + '/:id',
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

  return { list, get, insert, update };
};