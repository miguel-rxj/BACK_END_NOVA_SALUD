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

// Rutas de Categorías
list('categorias', 'SELECT * FROM public.categorias ORDER BY nombre');
get('categorias', 'categorias', 'id_categoria');
insert('categorias', 'categorias', ['nombre'], category, true);
update('categorias', 'categorias', 'id_categoria', ['nombre'], category.partial().strict(), true);

// Rutas de Contactos
list('contactos', 'SELECT * FROM public.contactos ORDER BY nombre');
get('contactos', 'contactos', 'id_contacto');
insert('contactos', 'contactos', Object.keys(contact.shape), contact, true);
update('contactos', 'contactos', 'id_contacto', Object.keys(contact.shape), contact.partial().strict(), true);

// Búsqueda de Productos con filtros y paginación
router.get(
  '/productos',
  auth,
  validate(
    z.object({
      q: z.string().trim().max(100).optional(),
      estado: z.enum(['activo', 'inactivo']).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(30),
      offset: z.coerce.number().int().min(0).default(0),
    }),
    'query'
  ),
  wrap(async (req, res) => {
    const { q, estado, limit, offset } = req.query;

    await query(
      res,
      `SELECT p.*, s.stock_disponible 
       FROM public.productos p 
       JOIN public.v_stock_productos s USING(id_producto) 
       WHERE ($1::text IS NULL OR p.nombre ILIKE '%' || $1 || '%' OR p.codigo_barras ILIKE '%' || $1 || '%') 
         AND ($2::text IS NULL OR p.estado = $2) 
       ORDER BY p.nombre 
       LIMIT $3 OFFSET $4`,
      [q || null, estado || null, limit, offset]
    );
  })
);

// Rutas adicionales de Productos (CRUD automático)
get('productos', 'productos', 'id_producto');
insert('productos', 'productos', productFields, product, true);
update('productos', 'productos', 'id_producto', productFields, product.partial().strict(), true);

module.exports = router;