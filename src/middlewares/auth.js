const { pool, supabase } = require('../config/connections');
const { wrap, fail } = require('../utils/http');

// Middleware para verificar rol de administrador
const admin = (req, res, next) => 
  req.actor?.rol === 'admin' ? next() : next(fail(403, 'Se requiere rol admin'));

// Middleware de autenticación con Supabase
const auth = wrap(async (req, res, next) => {
  const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || '');
  if (!match) throw fail(401, 'Token requerido');

  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data.user) throw fail(401, 'Token inválido');

  const { rows } = await pool.query(
    'SELECT id, nombre, rol, estado FROM public.perfiles WHERE id = $1',
    [data.user.id]
  );

  if (!rows.length || rows[0].estado !== 'activo') {
    throw fail(403, 'Usuario inactivo o sin perfil');
  }

  req.actor = rows[0];
  next();
});

module.exports = { auth, admin };