import { Router } from 'express';
import { z } from 'zod';
import { makeFilter, selectPage } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { sendPage } from '../utils/http.js';
import { intStr, pageQuery, dateStr, sortField, buildOrder } from '../utils/schemas.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

const SORTS = { fecha: 'm.fecha', id: 'm.id_movimiento' };
const FROM = `public.movimientos_inventario m
  JOIN public.productos p ON p.id_producto = m.id_producto
  JOIN public.lotes l ON l.id_lote = m.id_lote
  JOIN public.perfiles u ON u.id = m.id_usuario`;
const SELECT = `m.id_movimiento, m.fecha, m.tipo, m.cantidad, m.stock_resultante, m.motivo,
  m.id_operacion, m.id_producto, p.nombre AS producto, m.id_lote, l.codigo_lote, u.nombre AS usuario`;

// Kardex: historial inmutable de entradas, salidas, anulaciones y ajustes
router.get(
  '/',
  validate({
    query: z.object({
      ...pageQuery,
      id_producto: intStr(1).optional(),
      id_lote: intStr(1).optional(),
      id_operacion: intStr(1).optional(),
      tipo: z.enum(['compra', 'venta', 'anulacion', 'ajuste']).optional(),
      desde: dateStr.optional(),
      hasta: dateStr.optional(),
      sort: sortField(Object.keys(SORTS)),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const f = makeFilter();
    if (q.id_producto) f.add('m.id_producto = ?', q.id_producto);
    if (q.id_lote) f.add('m.id_lote = ?', q.id_lote);
    if (q.id_operacion) f.add('m.id_operacion = ?', q.id_operacion);
    if (q.tipo) f.add('m.tipo = ?', q.tipo);
    if (q.desde) f.add("m.fecha >= (?::date)::timestamp AT TIME ZONE 'America/Lima'", q.desde);
    if (q.hasta) f.add("m.fecha < ((?::date) + 1)::timestamp AT TIME ZONE 'America/Lima'", q.hasta);
    const { rows, total } = await selectPage({
      select: SELECT, from: FROM, where: f.where, params: f.params,
      orderBy: buildOrder(q.sort, SORTS, '-fecha', 'm.id_movimiento DESC'), page: q.page, pageSize: q.page_size,
    });
    sendPage(res, rows, total, q);
  },
);

export default router;
