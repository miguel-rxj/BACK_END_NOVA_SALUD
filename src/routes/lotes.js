import { Router } from 'express';
import { z } from 'zod';
import { query, makeFilter, selectPage } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { send, sendPage } from '../utils/http.js';
import { idParams, intStr, pageQuery, sortField, boolStr, reqText, buildOrder } from '../utils/schemas.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

const SORTS = { vencimiento: 'l.fecha_vencimiento', producto: 'p.nombre', stock: 'l.stock_actual' };
const FROM = 'public.lotes l JOIN public.productos p ON p.id_producto = l.id_producto';
const SELECT = `l.id_lote, l.id_producto, p.nombre AS producto, l.codigo_lote, l.fecha_vencimiento,
                l.stock_actual, (l.fecha_vencimiento < public.fn_hoy()) AS vencido`;

router.get(
  '/',
  validate({
    query: z.object({
      ...pageQuery,
      id_producto: intStr(1).optional(),
      con_stock: boolStr.optional(),
      vencido: boolStr.optional(),
      sort: sortField(Object.keys(SORTS)),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const f = makeFilter();
    if (q.id_producto) f.add('l.id_producto = ?', q.id_producto);
    if (q.con_stock === true) f.where.push('l.stock_actual > 0');
    if (q.vencido === true) f.where.push('l.fecha_vencimiento < public.fn_hoy()');
    if (q.vencido === false) f.where.push('l.fecha_vencimiento >= public.fn_hoy()');
    const { rows, total } = await selectPage({
      select: SELECT, from: FROM, where: f.where, params: f.params,
      orderBy: buildOrder(q.sort, SORTS, 'vencimiento', 'l.id_lote'), page: q.page, pageSize: q.page_size,
    });
    sendPage(res, rows, total, q);
  },
);

// Ajuste manual (merma, rotura, conteo físico). cantidad > 0 suma, < 0 resta.
router.post(
  '/:id/ajustes',
  validate({
    params: idParams,
    body: z.object({
      cantidad: z.number().int().min(-1_000_000).max(1_000_000).refine((v) => v !== 0, 'No puede ser 0'),
      motivo: reqText(3, 300),
    }),
  }),
  async (req, res) => {
    const { cantidad, motivo } = req.valid.body;
    const r = await query(
      'SELECT public.ajustar_stock($1::uuid, $2::bigint, $3::int, $4::text) AS stock_actual',
      [req.user.id, req.valid.params.id, cantidad, motivo],
    );
    const lote = await query(`SELECT ${SELECT} FROM ${FROM} WHERE l.id_lote = $1`, [req.valid.params.id]);
    send(res, { ...lote.rows[0], stock_actual: r.rows[0].stock_actual });
  },
);

export default router;
