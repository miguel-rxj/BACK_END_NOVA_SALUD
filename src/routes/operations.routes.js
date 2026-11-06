const { Router } = require('express');
const router = Router();

// Conexiones y middlewares
const { pool, supabase } = require('../config/connections');
const { auth, admin } = require('../middlewares/auth');
const { validate, params } = require('../middlewares/validate');

// Utilidades y validadores
const { wrap, fail } = require('../utils/http');
const { query, one } = require('../utils/db-response');
const { z, id, optText, money, date } = require('../validators/common');
const { category, contact, product, productFields } = require('../validators/catalog');
const { sale, purchase } = require('../validators/operations');
const { list, get, insert, update } = require('../utils/crud')(router);

// Función auxiliar para invocar funciones almacenadas de la base de datos
const call = async (res, fn, args) => {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(',');
  return one(res, `SELECT public.${fn}(${placeholders}) AS resultado`, args, 201);
};

// Registrar una nueva venta
router.post(
  '/ventas',
  auth,
  validate(sale),
  wrap(async (req, res) => {
    await call(res, 'registrar_venta', [
      req.actor.id,
      JSON.stringify(req.body.items),
      req.body.id_contacto ?? null,
      req.body.metodo_pago,
    ]);
  })
);

// Registrar una nueva compra (Solo administradores)
router.post(
  '/compras',
  auth,
  admin,
  validate(purchase),
  wrap(async (req, res) => {
    await call(res, 'registrar_compra', [
      req.actor.id,
      req.body.id_contacto,
      JSON.stringify(req.body.items),
      req.body.metodo_pago ?? null,
    ]);
  })
);

// Listar operaciones con filtros y paginación
const operationsQuery = 'SELECT * FROM public.operaciones';
router.get(
  '/operaciones',
  auth,
  validate(
    z.object({
      tipo: z.enum(['compra', 'venta']).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(30),
      offset: z.coerce.number().int().min(0).default(0),
    }),
    'query'
  ),
  wrap(async (req, res) => {
    const { tipo, limit, offset } = req.query;
    await query(
      res,
      `${operationsQuery} WHERE ($1::text IS NULL OR tipo = $1) ORDER BY fecha DESC LIMIT $2 OFFSET $3`,
      [tipo || null, limit, offset]
    );
  })
);

// Obtener una operación específica con sus detalles
router.get(
  '/operaciones/:id',
  auth,
  params,
  wrap(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT * FROM public.operaciones WHERE id_operacion = $1',
      [req.params.id]
    );
    if (!rows.length) throw fail(404, 'Operación no encontrada');

    const detalles = await pool.query(
      'SELECT * FROM public.detalle_operacion WHERE id_operacion = $1 ORDER BY id_detalle',
      [req.params.id]
    );

    res.json({ ...rows[0], detalles: detalles.rows });
  })
);

// Anular una operación (Solo administradores)
router.post(
  '/operaciones/:id/anular',
  auth,
  admin,
  params,
  validate(z.object({ motivo: optText(500) }).strict()),
  wrap(async (req, res) => {
    await pool.query('SELECT public.anular_operacion($1, $2, $3)', [
      req.actor.id,
      req.params.id,
      req.body.motivo,
    ]);
    res.json({ ok: true });
  })
);

// Realizar ajustes de stock en el inventario (Solo administradores)
router.post(
  '/inventario/ajustes',
  auth,
  admin,
  validate(
    z.object({
      id_lote: id,
      delta: z
        .number()
        .int()
        .min(-2147483648)
        .max(2147483647)
        .refine((v) => v !== 0),
      motivo: optText(500),
    }).strict()
  ),
  wrap(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT public.ajustar_stock($1, $2, $3, $4) AS stock_actual',
      [req.actor.id, req.body.id_lote, req.body.delta, req.body.motivo]
    );
    res.json(rows[0]);
  })
);

module.exports = router;