import { Router } from 'express';
import { z } from 'zod';
import { query, makeFilter, selectPage, buildUpdate } from '../db.js';
import { adminClient } from '../supabase.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError, notFound } from '../utils/errors.js';
import { send, sendPage } from '../utils/http.js';
import { pageQuery, searchQuery, sortField, estadoEnum, reqText, uuidParams, buildOrder, likePattern } from '../utils/schemas.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

const rolEnum = z.enum(['admin', 'vendedor']);
const FROM = 'public.perfiles p JOIN auth.users u ON u.id = p.id';
const SELECT = 'p.id, p.nombre, u.email, p.rol, p.estado';
const SORTS = { nombre: 'p.nombre', rol: 'p.rol', estado: 'p.estado' };

async function getUsuario(id) {
  const { rows } = await query(`SELECT ${SELECT} FROM ${FROM} WHERE p.id = $1`, [id]);
  if (!rows[0]) throw notFound('Usuario');
  return rows[0];
}

router.get(
  '/',
  validate({
    query: z.object({
      ...pageQuery, search: searchQuery, rol: rolEnum.optional(), estado: estadoEnum.optional(),
      sort: sortField(Object.keys(SORTS)),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const f = makeFilter();
    if (q.rol) f.add('p.rol = ?', q.rol);
    if (q.estado) f.add('p.estado = ?', q.estado);
    if (q.search) f.add('(p.nombre ILIKE ? OR u.email ILIKE ?)', likePattern(q.search));
    const { rows, total } = await selectPage({
      select: SELECT, from: FROM, where: f.where, params: f.params,
      orderBy: buildOrder(q.sort, SORTS, 'nombre', 'p.id'), page: q.page, pageSize: q.page_size,
    });
    sendPage(res, rows, total, q);
  },
);

router.get('/:id', validate({ params: uuidParams }), async (req, res) => {
  send(res, await getUsuario(req.valid.params.id));
});

router.post(
  '/',
  validate({
    body: z.object({
      email: z.email().max(254),
      password: z.string().min(8).max(72),
      nombre: reqText(2, 100),
      rol: rolEnum.default('vendedor'),
    }),
  }),
  async (req, res) => {
    const { email, password, nombre, rol } = req.valid.body;
    const { data, error } = await adminClient.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { nombre },
    });
    if (error) {
      if (error.code === 'email_exists') throw new AppError(409, 'DUPLICADO', 'Ya existe un usuario con ese correo');
      if (error.code === 'weak_password') throw new AppError(422, 'DATOS_INVALIDOS', 'La contraseña es demasiado débil');
      throw new AppError(502, 'AUTH_NO_DISPONIBLE', 'No se pudo crear el usuario en el servicio de autenticación');
    }
    const id = data.user.id;
    try {
      // El trigger ya creó el perfil como vendedor inactivo; aquí se activa con el rol pedido.
      await query('UPDATE public.perfiles SET nombre = $2, rol = $3, estado = $4 WHERE id = $1', [id, nombre, rol, 'activo']);
    } catch (err) {
      await adminClient.auth.admin.deleteUser(id).catch(() => {});
      throw err;
    }
    send(res, await getUsuario(id), 201);
  },
);

router.patch(
  '/:id',
  validate({
    params: uuidParams,
    body: z.object({
      nombre: reqText(2, 100).optional(),
      rol: rolEnum.optional(),
      estado: estadoEnum.optional(),
      password: z.string().min(8).max(72).optional(),
    }),
  }),
  async (req, res) => {
    const { id } = req.valid.params;
    const body = req.valid.body;
    if (id === req.user.id && (body.estado === 'inactivo' || (body.rol && body.rol !== 'admin'))) {
      throw new AppError(409, 'OPERACION_NO_PERMITIDA', 'No puedes desactivarte ni quitarte el rol admin a ti mismo');
    }
    await getUsuario(id);

    if (body.nombre !== undefined || body.rol !== undefined || body.estado !== undefined) {
      const u = buildUpdate('public.perfiles', 'id', id, ['nombre', 'rol', 'estado'], body);
      await query(u.text, u.params);
    }
    if (body.password) {
      const { error } = await adminClient.auth.admin.updateUserById(id, { password: body.password });
      if (error) throw new AppError(422, 'DATOS_INVALIDOS', 'No se pudo cambiar la contraseña (¿es demasiado débil?)');
    }
    send(res, await getUsuario(id));
  },
);

export default router;
