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

// Listar todos los usuarios del sistema (Solo administradores)
router.get(
  '/usuarios',
  auth,
  admin,
  wrap(async (req, res) => {
    await query(res, 'SELECT id, nombre, rol, estado FROM public.perfiles ORDER BY nombre');
  })
);

// Actualizar un usuario existente (Solo administradores)
router.patch(
  '/usuarios/:id',
  auth,
  admin,
  validate(z.object({ id: z.string().uuid() }), 'params'),
  validate(
    z
      .object({
        rol: z.enum(['admin', 'vendedor']).optional(),
        estado: z.enum(['activo', 'inactivo']).optional(),
        nombre: optText(100).optional(),
      })
      .strict()
  ),
  wrap(async (req, res) => {
    const fields = ['rol', 'estado', 'nombre'].filter((f) => req.body[f] !== undefined);
    if (!fields.length) throw fail(422, 'Sin cambios');

    // Validación para evitar que el administrador se auto-revoque permisos
    if (
      req.actor.id === req.params.id &&
      (req.body.rol === 'vendedor' || req.body.estado === 'inactivo')
    ) {
      throw fail(409, 'No puedes quitarte tu propio acceso administrativo');
    }

    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values = [...fields.map((f) => req.body[f]), req.params.id];

    await one(
      res,
      `UPDATE public.perfiles 
       SET ${setClause} 
       WHERE id = $${fields.length + 1} 
       RETURNING id, nombre, rol, estado`,
      values
    );
  })
);

module.exports = router;