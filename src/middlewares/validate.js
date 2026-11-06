
const { z } = require("zod");

/**
 * Middleware genérico de validación con Zod.
 *
 * @param {z.ZodType} schema
 * @param {"body"|"query"|"params"} source
 */
const validate = (schema, source = "body") => {
  return (req, res, next) => {
    try {
      const result = schema.safeParse(req[source]);

      if (!result.success) {
        return res.status(422).json({
          success: false,
          message: "Datos inválidos",
          errors: result.error.issues.map(issue => ({
            field: issue.path.join("."),
            message: issue.message
          }))
        });
      }

      // Guardamos los datos validados sin modificar
      // directamente req.query o req.params.
      req.validated = req.validated || {};
      req.validated[source] = result.data;

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Identificadores numéricos de PostgreSQL
const id = z.coerce.number().int().positive();

// Validación de parámetros de rutas
const params = validate(
  z.object({ id }),
  "params"
);

module.exports = {
  validate,
  params
};
