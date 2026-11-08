import { z } from 'zod';
import { AppError } from './errors.js';

// Enteros desde texto (params/query). Rechaza "1e3", "0x10", " 5", "-1", etc.
export const intStr = (min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z.string().regex(/^\d{1,15}$/, 'Debe ser un número entero')
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));

export const idParams = z.object({ id: intStr(1) });
export const uuidParams = z.object({ id: z.uuid() });

export const boolStr = z.enum(['true', 'false']).transform((v) => v === 'true');

export const pageQuery = {
  page: intStr(1, 1_000_000).default(1),
  page_size: intStr(1, 100).default(20),
};

export const searchQuery = z.string().trim().min(1).max(100).optional();

export const sortField = (keys) => z.enum(keys.flatMap((k) => [k, `-${k}`])).optional();

export const dateStr = z.iso.date();

export const estadoEnum = z.enum(['activo', 'inactivo']);

// Texto opcional: '' => null
export const optText = (max) =>
  z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullish();

export const reqText = (min, max) => z.string().trim().min(min).max(max);

// Dinero con máximo 2 decimales
export const money = z.number()
  .min(0)
  .max(99_999_999.99)
  .refine((v) => Math.round(v * 100) / 100 === v, 'Máximo 2 decimales');

export const idNum = z.number().int().positive();

export const metodoPago = z.enum(['efectivo', 'tarjeta', 'yape', 'plin', 'transferencia']);

/** ORDER BY seguro: la clave viene de un enum validado y se traduce con un mapa fijo. */
export function buildOrder(sort, map, fallback, tie) {
  const s = sort ?? fallback;
  const desc = s.startsWith('-');
  const key = desc ? s.slice(1) : s;
  if (!Object.hasOwn(map, key)) {
    throw new AppError(422, 'VALIDACION', 'Orden inválido');
  }
  return `${map[key]} ${desc ? 'DESC' : 'ASC'}, ${tie}`;
}

/** Patrón para ILIKE: escapa % _ \ para que el texto del usuario sea literal. */
export const likePattern = (text) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
