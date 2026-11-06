const { ZodError } = require('zod');

// Mapeo de códigos de error personalizados y de PostgreSQL a códigos HTTP
const ERROR_STATUS_MAP = {
  'NS001': 409,
  'NS002': 403,
  'NS003': 422,
  'NS004': 409,
  '23505': 409, // unique_violation (Postgres)
  '23503': 422, // foreign_key_violation (Postgres)
  '23514': 422, // check_violation (Postgres)
  '22P02': 422, // invalid_text_representation (Postgres)
  '22003': 422, // numeric_value_out_of_range (Postgres)
  '22007': 422, // invalid_datetime_format (Postgres)
};

const errorHandler = (err, req, res, next) => {
  // Manejo de errores de validación con Zod
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: 'Datos inválidos',
      detalles: err.issues.map(x => ({
        campo: x.path.join('.'),
        mensaje: x.message,
      })),
    });
  }

  // Determinar el código de estado HTTP
  const status = err.status || ERROR_STATUS_MAP[err.code] || 500;

  // Registrar errores graves en la consola
  if (status >= 500) {
    console.error('Error interno:', err);
  }

  // Responder al cliente
  res.status(status).json({
    error: status >= 500 ? 'Error interno del servidor' : err.message,
    ...(err.code ? { codigo: err.code } : {}),
  });
};

module.exports = errorHandler;