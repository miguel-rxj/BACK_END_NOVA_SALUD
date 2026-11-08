import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { query } from '../db.js';
import { anonClient, adminClient } from '../supabase.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../utils/errors.js';
import { send } from '../utils/http.js';

const router = Router();

// Freno a ataques de fuerza bruta: 10 intentos fallidos cada 15 min por IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: (_req, res) =>
    res.status(429).json({ error: { code: 'DEMASIADOS_INTENTOS', message: 'Demasiados intentos. Espera unos minutos' } }),
});

async function sessionResponse(session, user) {
  const { rows } = await query('SELECT id, nombre, rol, estado FROM public.perfiles WHERE id = $1', [user.id]);
  const perfil = rows[0];
  if (!perfil || perfil.estado !== 'activo') {
    throw new AppError(403, 'USUARIO_INACTIVO', 'Tu usuario está inactivo. Contacta al administrador');
  }
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    usuario: { id: perfil.id, nombre: perfil.nombre, email: user.email, rol: perfil.rol },
  };
}

function mapAuthError(error) {
  if (error.code === 'invalid_credentials' || error.code === 'email_not_confirmed' || error.status === 400) {
    return new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos');
  }
  if (error.code === 'refresh_token_not_found' || error.code === 'refresh_token_already_used') {
    return new AppError(401, 'REFRESH_INVALIDO', 'La sesión ya no es válida. Inicia sesión de nuevo');
  }
  return new AppError(502, 'AUTH_NO_DISPONIBLE', 'Servicio de autenticación no disponible');
}

router.post(
  '/login',
  loginLimiter,
  validate({ body: z.object({ email: z.email().max(254), password: z.string().min(1).max(200) }) }),
  async (req, res) => {
    const { email, password } = req.valid.body;
    const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
    if (error) throw mapAuthError(error);
    send(res, await sessionResponse(data.session, data.user));
  },
);

router.post(
  '/refresh',
  validate({ body: z.object({ refresh_token: z.string().min(1).max(500) }) }),
  async (req, res) => {
    const { data, error } = await anonClient().auth.refreshSession({ refresh_token: req.valid.body.refresh_token });
    if (error || !data.session) throw mapAuthError(error ?? { code: 'refresh_token_not_found' });
    send(res, await sessionResponse(data.session, data.user));
  },
);

router.get('/me', authenticate, (req, res) => {
  const { id, nombre, email, rol } = req.user;
  send(res, { id, nombre, email, rol });
});

router.post('/logout', authenticate, async (req, res) => {
  await adminClient.auth.admin.signOut(req.token, 'local').catch(() => {});
  send(res, { mensaje: 'Sesión cerrada' });
});

export default router;
