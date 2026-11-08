import { z } from 'zod';
import { AppError } from '../utils/errors.js';

z.config(z.locales.es());

/**
 * validate({ params, query, body }) -> deja los datos limpios en req.valid.{params,query,body}.
 * Los campos desconocidos se descartan (no llegan a ninguna consulta SQL).
 */
export const validate = (schemas) => (req, _res, next) => {
  const details = [];
  req.valid = {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const input = part === 'body' ? (req.body ?? {}) : req[part];
    const result = schemas[part].safeParse(input);
    if (result.success) {
      req.valid[part] = result.data;
    } else {
      for (const issue of result.error.issues) {
        details.push({ en: part, campo: issue.path.join('.'), mensaje: issue.message });
      }
    }
  }
  if (details.length) return next(new AppError(422, 'VALIDACION', 'Datos inválidos', details));
  next();
};
