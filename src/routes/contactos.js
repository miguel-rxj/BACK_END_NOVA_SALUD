import { Router } from 'express';
import { z } from 'zod';
import { query, makeFilter, selectPage, buildUpdate } from '../db.js';
import { authenticate, isAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError, notFound } from '../utils/errors.js';
import { send, sendPage } from '../utils/http.js';
import { idParams, pageQuery, searchQuery, sortField, optText, reqText, buildOrder, likePattern } from '../utils/schemas.js';

const router = Router();
router.use(authenticate);

const tipoEnum = z.enum(['cliente', 'proveedor']);
const documento = z.string().trim().regex(/^[A-Za-z0-9]{6,20}$/, 'Documento: 6 a 20 letras o números, sin espacios').nullish();
const telefono = z.string().trim().regex(/^[0-9+\-\s()]{6,20}$/, 'Teléfono inválido').nullish();
const SORTS = { nombre: 'nombre', id: 'id_contacto' };
const COLS = 'id_contacto, tipo, nombre, documento, telefono';

async function getContacto(id) {
  const { rows } = await query(`SELECT ${COLS} FROM public.contactos WHERE id_contacto = $1`, [id]);
  return rows[0];
}

// El vendedor solo trabaja con clientes; el admin con clientes y proveedores.
router.get(
  '/',
  validate({
    query: z.object({ ...pageQuery, search: searchQuery, tipo: tipoEnum.optional(), sort: sortField(Object.keys(SORTS)) }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const f = makeFilter();
    const tipo = isAdmin(req) ? q.tipo : 'cliente';
    if (tipo) f.add('tipo = ?', tipo);
    if (q.search) f.add('(nombre ILIKE ? OR documento ILIKE ?)', likePattern(q.search));
    const { rows, total } = await selectPage({
      select: COLS, from: 'public.contactos', where: f.where, params: f.params,
      orderBy: buildOrder(q.sort, SORTS, 'nombre', 'id_contacto'), page: q.page, pageSize: q.page_size,
    });
    sendPage(res, rows, total, q);
  },
);

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  const c = await getContacto(req.valid.params.id);
  if (!c || (!isAdmin(req) && c.tipo !== 'cliente')) throw notFound('Contacto');
  send(res, c);
});

router.post(
  '/',
  validate({
    body: z.object({ tipo: tipoEnum, nombre: reqText(2, 150), documento, telefono }),
  }),
  async (req, res) => {
    const b = req.valid.body;
    if (!isAdmin(req) && b.tipo !== 'cliente') {
      throw new AppError(403, 'SIN_PERMISO', 'Solo un administrador puede registrar proveedores');
    }
    const { rows } = await query(
      'INSERT INTO public.contactos (tipo, nombre, documento, telefono) VALUES ($1, $2, $3, $4) RETURNING id_contacto',
      [b.tipo, b.nombre, b.documento ?? null, b.telefono ?? null],
    );
    send(res, await getContacto(rows[0].id_contacto), 201);
  },
);

router.patch(
  '/:id',
  validate({
    params: idParams,
    body: z.object({ nombre: reqText(2, 150).optional(), documento: documento.optional(), telefono: telefono.optional() }),
  }),
  async (req, res) => {
    const { id } = req.valid.params;
    const actual = await getContacto(id);
    if (!actual || (!isAdmin(req) && actual.tipo !== 'cliente')) throw notFound('Contacto');
    const u = buildUpdate('public.contactos', 'id_contacto', id, ['nombre', 'documento', 'telefono'], req.valid.body);
    await query(u.text, u.params);
    send(res, await getContacto(id));
  },
);

export default router;
