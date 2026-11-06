const { z } = require('zod');

// Validador para identificadores numéricos enteros positivos
const id = z.coerce.number().int().positive().safe();

// Validador para texto opcional con longitud máxima configurable
const optText = (n = 150) => z.string().trim().min(1).max(n);

// Validador para montos monetarios finitos no negativos
const money = z.number().finite().min(0).max(99999999.99);

// Validador para fechas en formato YYYY-MM-DD
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida');

module.exports = {
  z,
  id,
  optText,
  money,
  date,
};