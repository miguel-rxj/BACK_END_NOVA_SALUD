import { Router } from 'express';
import { z } from 'zod';
import { query, makeFilter, selectPage, buildUpdate } from '../db.js';
import { authenticate, requireRole, isAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { notFound } from '../utils/errors.js';
import { send, sendPage } from '../utils/http.js';
import {
  idParams, idNum, intStr, pageQuery, searchQuery, sortField, estadoEnum, optText, reqText, money,
  buildOrder, likePattern,
} from '../utils/schemas.js';

const router = Router();
router.use(authenticate);

// Producto + stock vendible (lotes no vencidos) + categoría + nivel de stock + próximo vencimiento
const BASE = `(
  SELECT p.id_producto, p.codigo_barras, p.nombre, p.principio_activo, p.presentacion,
         p.precio_venta, p.stock_minimo, p.estado, p.id_categoria, c.nombre AS categoria,
         v.stock_disponible,
         CASE WHEN v.stock_disponible <= 0 THEN 'agotado'
              WHEN v.stock_disponible <= p.stock_minimo THEN 'bajo'
              ELSE 'normal' END AS nivel_stock,
         (SELECT min(l.fecha_vencimiento) FROM public.lotes l
           WHERE l.id_producto = p.id_producto AND l.stock_actual > 0
             AND l.fecha_vencimiento >= public.fn_hoy()) AS proximo_vencimiento
  FROM public.productos p
  JOIN public.v_stock_productos v ON v.id_producto = p.id_producto
  LEFT JOIN public.categorias c ON c.id_categoria = p.id_categoria
) b`;

const SORTS = {
  nombre: 'b.nombre', precio_venta: 'b.precio_venta', stock_disponible: 'b.stock_disponible',
  categoria: 'b.categoria', id: 'b.id_producto',
};

const campos = {
  codigo_barras: optText(50),
  nombre: reqText(2, 150),
  id_categoria: idNum.nullish(),
  principio_activo: optText(150),
  presentacion: optText(100),
  precio_venta: money,
  stock_minimo: z.number().int().min(0).max(1_000_000),
};
const crearSchema = z.object({ ...campos, stock_minimo: campos.stock_minimo.default(0) });
const editarSchema = z.object(campos).partial().extend({ estado: estadoEnum.optional() });

async function getProducto(id, { soloActivos = false } = {}) {
  const { rows } = await query(
    `SELECT b.* FROM ${BASE} WHERE b.id_producto = $1 ${soloActivos ? "AND b.estado = 'activo'" : ''}`,
    [id],
  );
  if (!rows[0]) throw notFound('Producto');
  const lotes = await query(
    `SELECT id_lote, codigo_lote, fecha_vencimiento, stock_actual,
            (fecha_vencimiento < public.fn_hoy()) AS vencido
     FROM public.lotes WHERE id_producto = $1 ORDER BY fecha_vencimiento, id_lote`,
    [id],
  );
  return { ...rows[0], lotes: lotes.rows };
}

router.get(
  '/',
  validate({
    query: z.object({
      ...pageQuery,
      search: searchQuery,
      codigo_barras: z.string().trim().min(1).max(50).optional(),
      id_categoria: intStr(1).optional(),
      estado: estadoEnum.optional(),
      nivel_stock: z.enum(['agotado', 'bajo', 'normal']).optional(),
      sort: sortField(Object.keys(SORTS)),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const f = makeFilter();
    // El vendedor solo ve productos activos
    const estado = isAdmin(req) ? q.estado : 'activo';
    if (estado) f.add('b.estado = ?', estado);
    if (q.id_categoria) f.add('b.id_categoria = ?', q.id_categoria);
    if (q.nivel_stock) f.add('b.nivel_stock = ?', q.nivel_stock);
    if (q.codigo_barras) f.add('b.codigo_barras = ?', q.codigo_barras);
    if (q.search) {
      f.add('(b.nombre ILIKE ? OR b.principio_activo ILIKE ? OR b.codigo_barras ILIKE ?)', likePattern(q.search));
    }
    const { rows, total } = await selectPage({
      select: 'b.*', from: BASE, where: f.where, params: f.params,
      orderBy: buildOrder(q.sort, SORTS, 'nombre', 'b.id_producto'), page: q.page, pageSize: q.page_size,
    });
    sendPage(res, rows, total, q);
  },
);

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  send(res, await getProducto(req.valid.params.id, { soloActivos: !isAdmin(req) }));
});

router.post('/', requireRole('admin'), validate({ body: crearSchema }), async (req, res) => {
  const b = req.valid.body;
  const { rows } = await query(
    `INSERT INTO public.productos
       (codigo_barras, nombre, id_categoria, principio_activo, presentacion, precio_venta, stock_minimo)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_producto`,
    [b.codigo_barras ?? null, b.nombre, b.id_categoria ?? null, b.principio_activo ?? null,
     b.presentacion ?? null, b.precio_venta, b.stock_minimo],
  );
  send(res, await getProducto(rows[0].id_producto), 201);
});

router.patch(
  '/:id',
  requireRole('admin'),
  validate({ params: idParams, body: editarSchema }),
  async (req, res) => {
    const { id } = req.valid.params;
    const u = buildUpdate(
      'public.productos', 'id_producto', id,
      ['codigo_barras', 'nombre', 'id_categoria', 'principio_activo', 'presentacion', 'precio_venta', 'stock_minimo', 'estado'],
      req.valid.body,
    );
    const r = await query(u.text, u.params);
    if (!r.rowCount) throw notFound('Producto');
    send(res, await getProducto(id));
  },
);

export default router;
