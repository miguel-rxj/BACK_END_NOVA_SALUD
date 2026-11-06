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

// Listados generales de inventario
list('inventario/stock', 'SELECT * FROM public.v_stock_productos ORDER BY nombre');
list('inventario/alertas/reposicion', 'SELECT * FROM public.v_alertas_reposicion ORDER BY faltante DESC');
list('inventario/alertas/vencimiento', 'SELECT * FROM public.v_alertas_vencimiento ORDER BY fecha_vencimiento');
list(
  'inventario/lotes',
  'SELECT l.*, p.nombre AS producto FROM public.lotes l JOIN public.productos p USING(id_producto) ORDER BY l.fecha_vencimiento, l.id_lote'
);

// Consulta de movimientos de inventario con paginación
router.get(
  '/inventario/movimientos',
  auth,
  validate(
    z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }),
    'query'
  ),
  wrap(async (req, res) => {
    const { limit, offset } = req.query;

    await query(
      res,
      `SELECT * 
       FROM public.movimientos_inventario 
       ORDER BY fecha DESC, id_movimiento DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
  })
);

module.exports = router;