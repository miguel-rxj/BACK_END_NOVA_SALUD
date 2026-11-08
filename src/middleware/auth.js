import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { query } from '../db.js';
import { AppError } from '../utils/errors.js';

const issuer = `${config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;

// Proyectos con claves asimétricas (por defecto en Supabase): JWKS. Legado: secreto HS256.
const verifyKey = config.SUPABASE_JWT_SECRET
  ? new TextEncoder().encode(config.SUPABASE_JWT_SECRET)
  : createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
const algorithms = config.SUPABASE_JWT_SECRET ? ['HS256'] : ['ES256', 'RS256'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Verifica el JWT de Supabase y carga el perfil (rol, estado) desde la BD en cada petición. */
export async function authenticate(req, _res, next) {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new AppError(401, 'NO_AUTENTICADO', 'Falta el token de autenticación');
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(token, verifyKey, { issuer, audience: 'authenticated', algorithms }));
  } catch (err) {
    if (err.code === 'ERR_JWT_EXPIRED') throw new AppError(401, 'TOKEN_EXPIRADO', 'La sesión expiró');
    if (String(err.code).startsWith('ERR_JWKS')) {
      logger.error({ err }, 'No se pudo obtener el JWKS de Supabase');
      throw new AppError(503, 'AUTH_NO_DISPONIBLE', 'Servicio de autenticación no disponible');
    }
    throw new AppError(401, 'TOKEN_INVALIDO', 'Token inválido');
  }

  if (!UUID.test(payload.sub ?? '')) throw new AppError(401, 'TOKEN_INVALIDO', 'Token inválido');

  const { rows } = await query(
    'SELECT id, nombre, rol, estado FROM public.perfiles WHERE id = $1',
    [payload.sub],
  );
  const perfil = rows[0];
  if (!perfil || perfil.estado !== 'activo') {
    throw new AppError(403, 'USUARIO_INACTIVO', 'Tu usuario está inactivo o no tiene perfil. Contacta al administrador');
  }

  req.user = { id: perfil.id, nombre: perfil.nombre, rol: perfil.rol, email: payload.email ?? null };
  req.token = token;
  next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.rol)) {
    return next(new AppError(403, 'SIN_PERMISO', 'No tienes permiso para realizar esta acción'));
  }
  next();
};

export const isAdmin = (req) => req.user.rol === 'admin';
