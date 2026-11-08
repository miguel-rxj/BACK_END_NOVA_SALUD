import { Router } from 'express';
import { z } from 'zod';
import { query, makeFilter, selectPage } from '../db.js';
import { authenticate, requireRole, isAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { notFound } from '../utils/errors.js';
import { send, sendPage } from '../utils/http.js';
import {
  idParams, idNum, intStr, pageQuery, sortField, dateStr, money, metodoPago, reqText, buildOrder,
} from '../utils/schemas.js';

const SELECT = `o.id_operacion, o.tipo, o.fecha, o.estado, o.metodo_pago, o.total,
                o.id_contacto, c.nombre AS contacto, o.id_usuario, u.nombre AS usuario`;
const FROM = `public.operaciones o
              LEFT JOIN public.contactos c ON c.id_contacto = o.id_contacto
              JOIN public.perfiles u ON u.id = o.id_usuario`;
const SORTS = { fecha: 'o.fecha', total: 'o.total', id: 'o.id_operacion' };

const listQuery = z.object({
  ...pageQuery,
  estado: z.enum(['completada', 'anulada']).optional(),
  desde: dateStr.optional(),
  hasta: dateStr.optional(),
  id_contacto: intStr(1).optional(),
  id_usuario: z.uuid().optional(),
  sort: sortField(Object.keys(SORTS)),
});

/** Cabecera + líneas agrupadas por producto (con los lotes de donde salió/entró cada unidad). */
async function getOperacion(id, tipo, userId = null) {
  const params = [id, tipo];
  if (userId) params.push(userId);
  const { rows } = await query(
    `SELECT ${SELECT} FROM ${FROM} WHERE o.id_operacion = $1 AND o.tipo = $2 ${userId ? 'AND o.id_usuario = $3' : ''}`,
    params,
  );
  if (!rows[0]) throw notFound(tipo === 'venta' ? 'Venta' : 'Compra');

  const items = await query(
    `SELECT d.id_producto, p.nombre, p.codigo_barras,
            sum(d.cantidad)::int AS cantidad, d.precio_unitario, sum(d.subtotal) AS subtotal,
            jsonb_agg(jsonb_build_object('id_lote', d.id_lote, 'codigo_lote', l.codigo_lote,
                      'fecha_vencimiento', l.fecha_vencimiento, 'cantidad', d.cantidad)
                      ORDER BY l.fecha_vencimiento, d.id_lote) AS lotes
     FROM public.detalle_operacion d
     JOIN public.productos p ON p.id_producto = d.id_producto
     JOIN public.lotes l ON l.id_lote = d.id_lote
     WHERE d.id_operacion = $1
     GROUP BY d.id_producto, p.nombre, p.codigo_barras, d.precio_unitario
     ORDER BY p.nombre`,
    [id],
  );
  return { ...rows[0], items: items.rows };
}

async function listar(req, res, tipo, forzarPropias) {
  const q = req.valid.query;
  const f = makeFilter();
  f.add('o.tipo = ?', tipo);
  if (forzarPropias) f.add('o.id_usuario = ?', req.user.id);
  else if (q.id_usuario) f.add('o.id_usuario = ?', q.id_usuario);
  if (q.estado) f.add('o.estado = ?', q.estado);
  if (q.id_contacto) f.add('o.id_contacto = ?', q.id_contacto);
  // Fechas interpretadas en hora de Lima
  if (q.desde) f.add("o.fecha >= (?::date)::timestamp AT TIME ZONE 'America/Lima'", q.desde);
  if (q.hasta) f.add("o.fecha < ((?::date) + 1)::timestamp AT TIME ZONE 'America/Lima'", q.hasta);
  const { rows, total } = await selectPage({
    select: SELECT, from: FROM, where: f.where, params: f.params,
    orderBy: buildOrder(q.sort, SORTS, '-fecha', 'o.id_operacion DESC'), page: q.page, pageSize: q.page_size,
  });
  sendPage(res, rows, total, q);
}

async function anular(req, res, tipo) {
  const { id } = req.valid.params;
  await getOperacion(id, tipo); // 404 si no existe o es de otro tipo
  await query('SELECT public.anular_operacion($1::uuid, $2::bigint, $3::text)', [req.user.id, id, req.valid.body.motivo]);
  send(res, await getOperacion(id, tipo));
}

const motivoBody = z.object({ motivo: reqText(3, 300) });

// ---------------------------------------------------------------- VENTAS
export const ventasRouter = Router();
ventasRouter.use(authenticate);

ventasRouter.get('/', validate({ query: listQuery }), (req, res) => listar(req, res, 'venta', !isAdmin(req)));

ventasRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  send(res, await getOperacion(req.valid.params.id, 'venta', isAdmin(req) ? null : req.user.id));
});

ventasRouter.post(
  '/',
  validate({
    body: z.object({
      id_contacto: idNum.nullish(),
      metodo_pago: metodoPago.default('efectivo'),
      items: z.array(z.object({ id_producto: idNum, cantidad: z.number().int().min(1).max(100_000) })).min(1).max(100),
    }),
  }),
  async (req, res) => {
    const { id_contacto, metodo_pago, items } = req.valid.body;
    const r = await query(
      'SELECT public.registrar_venta($1::uuid, $2::jsonb, $3::bigint, $4::varchar) AS id',
      [req.user.id, JSON.stringify(items), id_contacto ?? null, metodo_pago],
    );
    send(res, await getOperacion(r.rows[0].id, 'venta'), 201);
  },
);

ventasRouter.post(
  '/:id/anular',
  requireRole('admin'),
  validate({ params: idParams, body: motivoBody }),
  (req, res) => anular(req, res, 'venta'),
);

// ---------------------------------------------------------------- COMPRAS (solo admin)
export const comprasRouter = Router();
comprasRouter.use(authenticate, requireRole('admin'));

comprasRouter.get('/', validate({ query: listQuery }), (req, res) => listar(req, res, 'compra', false));

comprasRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  send(res, await getOperacion(req.valid.params.id, 'compra'));
});

comprasRouter.post(
  '/',
  validate({
    body: z.object({
      id_contacto: idNum,
      metodo_pago: metodoPago.optional(),
      items: z.array(z.object({
        id_producto: idNum,
        cantidad: z.number().int().min(1).max(1_000_000),
        precio_unitario: money,
        codigo_lote: z.string().trim().min(1).max(50),
        fecha_vencimiento: dateStr,
      })).min(1).max(100),
    }),
  }),
  async (req, res) => {
    const { id_contacto, metodo_pago, items } = req.valid.body;
    const r = await query(
      'SELECT public.registrar_compra($1::uuid, $2::bigint, $3::jsonb, $4::varchar) AS id',
      [req.user.id, id_contacto, JSON.stringify(items), metodo_pago ?? null],
    );
    send(res, await getOperacion(r.rows[0].id, 'compra'), 201);
  },
);

comprasRouter.post(
  '/:id/anular',
  validate({ params: idParams, body: motivoBody }),
  (req, res) => anular(req, res, 'compra'),
);
