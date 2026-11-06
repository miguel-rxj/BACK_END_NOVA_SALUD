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

// Ruta de inicio de sesión
router.post(
  '/auth/login',
  validate(
    z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }).strict()
  ),
  wrap(async (req, res) => {
    //const { data, error } = await supabase.auth.signInWithPassword(req.body);
    //if (error) throw fail(401, 'Credenciales inválidas');
    
const { data, error } = await supabase.auth.signInWithPassword({
  email: req.body.email,
  password: req.body.password
});

if (error) {
  console.error("Error Supabase Auth:", {
    name: error.name,
    status: error.status,
    code: error.code,
    message: error.message
  });

  if (error.message === "Invalid login credentials") {
    throw fail(401, "Credenciales inválidas");
  }

  if (error.message === "Email not confirmed") {
    throw fail(403, "Correo no confirmado");
  }

  throw fail(502, "No se pudo completar la autenticación");
}

    

    const { rows } = await pool.query(
      'SELECT id, nombre, rol, estado FROM public.perfiles WHERE id = $1',
      [data.user.id]
    );

    if (!rows.length || rows[0].estado !== 'activo') {
      throw fail(403, 'Usuario inactivo');
    }

    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      usuario: rows[0],
    });
  })
);

// Ruta para obtener el perfil del usuario autenticado
router.get('/auth/me', auth, (req, res) => res.json(req.actor));

module.exports = router;