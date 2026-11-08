export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = 'Recurso') =>
  new AppError(404, 'NO_ENCONTRADO', `${what} no encontrado`);

const DUPLICADOS = {
  productos_codigo_barras_key: 'Ya existe un producto con ese código de barras',
  contactos_documento_key: 'Ya existe un contacto con ese documento',
  categorias_nombre_key: 'Ya existe una categoría con ese nombre',
  uq_lote_producto_codigo: 'Ya existe un lote con ese código para el producto',
};

/**
 * Traduce errores de PostgreSQL a errores HTTP.
 * Los mensajes NS00x los escribe nuestra propia BD (funciones de negocio), son seguros de mostrar.
 * Cualquier otro error devuelve null y termina como 500 genérico (sin filtrar detalles internos).
 */
export function fromPgError(err) {
  switch (err?.code) {
    case 'NS001': return new AppError(409, 'STOCK_INSUFICIENTE', err.message);
    case 'NS002': return new AppError(403, 'SIN_PERMISO', err.message);
    case 'NS003': return new AppError(422, 'DATOS_INVALIDOS', err.message);
    case 'NS004': return new AppError(409, 'HISTORIAL_INMUTABLE', err.message);
    case '23505':
      return new AppError(409, 'DUPLICADO', DUPLICADOS[err.constraint] ?? 'El registro ya existe');
    case '23503':
      return new AppError(409, 'REFERENCIA_INVALIDA', 'El registro referenciado no existe o está en uso');
    case '23514':
      return new AppError(422, 'DATOS_INVALIDOS', 'Un valor no cumple las reglas del sistema');
    case '22P02': case '22007': case '22008': case '22003': case '22001':
      return new AppError(422, 'DATOS_INVALIDOS', 'Un valor tiene formato o tamaño inválido');
    default:
      return null;
  }
}
