import { Router } from 'express';
import { z } from 'zod';
import { query, buildUpdate } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { notFound } from '../utils/errors.js';
import { send } from '../utils/http.js';
import { idParams, reqText } from '../utils/schemas.js';

const router = Router();
router.use(authenticate);

const SELECT = `
  SELECT c.id_categoria, c.nombre, count(p.id_producto)::int AS total_productos
  FROM public.categorias c
  LEFT JOIN public.productos p ON p.id_categoria = c.id_categoria`;

async function getCategoria(id) {
  const { rows } = await query(`${SELECT} WHERE c.id_categoria = $1 GROUP BY c.id_categoria`, [id]);
  if (!rows[0]) throw notFound('Categoría');
  return rows[0];
}

// Lista completa (son pocas), sin paginación
router.get('/', async (_req, res) => {
  const { rows } = await query(`${SELECT} GROUP BY c.id_categoria ORDER BY c.nombre`);
  send(res, rows);
});

router.post(
  '/',
  requireRole('admin'),
  validate({ body: z.object({ nombre: reqText(2, 100) }) }),
  async (req, res) => {
    const { rows } = await query('INSERT INTO public.categorias (nombre) VALUES ($1) RETURNING id_categoria', [req.valid.body.nombre]);
    send(res, await getCategoria(rows[0].id_categoria), 201);
  },
);

router.patch(
  '/:id',
  requireRole('admin'),
  validate({ params: idParams, body: z.object({ nombre: reqText(2, 100) }) }),
  async (req, res) => {
    const u = buildUpdate('public.categorias', 'id_categoria', req.valid.params.id, ['nombre'], req.valid.body);
    const r = await query(u.text, u.params);
    if (!r.rowCount) throw notFound('Categoría');
    send(res, await getCategoria(req.valid.params.id));
  },
);

export default router;
