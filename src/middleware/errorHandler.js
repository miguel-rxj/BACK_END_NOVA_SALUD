import { AppError, fromPgError } from '../utils/errors.js';

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'RUTA_NO_ENCONTRADA', message: `La ruta ${req.method} ${req.path} no existe` },
  });
};

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let e = null;
  if (err instanceof AppError) e = err;
  else if (err.type === 'entity.parse.failed') e = new AppError(400, 'JSON_INVALIDO', 'El cuerpo de la petición no es un JSON válido');
  else if (err.type === 'entity.too.large') e = new AppError(413, 'CUERPO_MUY_GRANDE', 'El cuerpo de la petición es demasiado grande');
  else e = fromPgError(err);

  if (!e) {
    req.log?.error({ err }, 'Error no controlado');
    e = new AppError(500, 'ERROR_INTERNO', 'Error interno del servidor');
  }
  res.status(e.status).json({ error: { code: e.code, message: e.message, details: e.details } });
}
