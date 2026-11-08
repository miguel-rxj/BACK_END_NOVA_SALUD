// Contrato OpenAPI 3.0. Se sirve en /api/docs (Swagger UI) y /api/openapi.json (importable en Postman).
const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const json = (schema) => ({ content: { 'application/json': { schema } } });
const data = (schema) => ({ type: 'object', properties: { data: schema } });
const list = (name) => ({
  type: 'object',
  properties: { data: { type: 'array', items: ref(name) }, meta: ref('Meta') },
});
const resp = (desc, schema) => ({ description: desc, ...(schema ? json(schema) : {}) });
const err = (desc) => resp(desc, ref('Error'));
const ERR = {
  401: err('No autenticado o token expirado'),
  403: err('Sin permiso'),
  404: err('No encontrado'),
  409: err('Conflicto (duplicado, stock insuficiente, referencia en uso)'),
  422: err('Datos inválidos (details lista cada campo)'),
};
const errs = (...c) => Object.fromEntries(c.map((k) => [k, ERR[k]]));
const body = (schema) => ({ required: true, ...json(schema) });
const q = (name, schema, description) => ({ name, in: 'query', schema, ...(description ? { description } : {}) });
const idp = { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } };
const pg = [q('page', { type: 'integer', minimum: 1, default: 1 }), q('page_size', { type: 'integer', minimum: 1, maximum: 100, default: 20 })];
const sort = (vals) => q('sort', { type: 'string', enum: vals.flatMap((v) => [v, `-${v}`]) }, 'Prefijo - para descendente');
const search = q('search', { type: 'string', maxLength: 100 });
const sec = [{ bearerAuth: [] }];
const op = (tag, summary, extra = {}) => ({ tags: [tag], summary, security: sec, ...extra });
const str = { type: 'string' };
const int = { type: 'integer' };
const num = { type: 'number' };
const date = { type: 'string', format: 'date' };
const estado = { type: 'string', enum: ['activo', 'inactivo'] };

const itemsVenta = { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', required: ['id_producto', 'cantidad'], properties: { id_producto: int, cantidad: { type: 'integer', minimum: 1 } } } };
const itemsCompra = { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', required: ['id_producto', 'cantidad', 'precio_unitario', 'codigo_lote', 'fecha_vencimiento'], properties: { id_producto: int, cantidad: { type: 'integer', minimum: 1 }, precio_unitario: num, codigo_lote: { type: 'string', maxLength: 50 }, fecha_vencimiento: date } } };
const opsList = (tag, who) => op(tag, `Listar (${who})`, {
  parameters: [...pg, q('estado', { type: 'string', enum: ['completada', 'anulada'] }), q('desde', date), q('hasta', date), q('id_contacto', int), q('id_usuario', { type: 'string', format: 'uuid' }, 'Solo admin'), sort(['fecha', 'total', 'id'])],
  responses: { 200: resp('OK', list('Operacion')), ...errs(401, 403, 422) },
});
const opsGet = (tag) => op(tag, 'Detalle con items', { parameters: [idp], responses: { 200: resp('OK', data(ref('OperacionDetalle'))), ...errs(401, 403, 404) } });
const anular = (tag) => op(tag, 'Anular y revertir stock (solo admin)', {
  parameters: [idp], requestBody: body({ type: 'object', required: ['motivo'], properties: { motivo: { type: 'string', minLength: 3, maxLength: 300 } } }),
  responses: { 200: resp('Anulada', data(ref('OperacionDetalle'))), ...errs(401, 403, 404, 409, 422) },
});

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Botica API',
    version: '1.0.0',
    description: 'API REST de inventario, ventas y compras.\n\nÉxito: `{ data, meta? }`. Error: `{ error: { code, message, details? } }`.\nFechas ISO 8601; dinero como número con 2 decimales; paginación con `page` y `page_size`.',
  },
  servers: [{ url: '/api/v1' }],
  tags: ['Auth', 'Usuarios', 'Categorias', 'Contactos', 'Productos', 'Lotes', 'Ventas', 'Compras', 'Alertas', 'Movimientos', 'Reportes'].map((name) => ({ name })),
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'object', properties: { code: str, message: str, details: { type: 'array', items: { type: 'object', properties: { en: str, campo: str, mensaje: str } } } } } } },
      Meta: { type: 'object', properties: { page: int, page_size: int, total: int, total_pages: int } },
      Sesion: { type: 'object', properties: { access_token: str, refresh_token: str, token_type: str, expires_in: int, expires_at: int, usuario: ref('UsuarioBasico') } },
      UsuarioBasico: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, nombre: str, email: str, rol: { type: 'string', enum: ['admin', 'vendedor'] } } },
      Usuario: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, nombre: str, email: str, rol: { type: 'string', enum: ['admin', 'vendedor'] }, estado } },
      Categoria: { type: 'object', properties: { id_categoria: int, nombre: str, total_productos: int } },
      Contacto: { type: 'object', properties: { id_contacto: int, tipo: { type: 'string', enum: ['cliente', 'proveedor'] }, nombre: str, documento: { ...str, nullable: true }, telefono: { ...str, nullable: true } } },
      Producto: { type: 'object', properties: { id_producto: int, codigo_barras: { ...str, nullable: true }, nombre: str, principio_activo: { ...str, nullable: true }, presentacion: { ...str, nullable: true }, precio_venta: num, stock_minimo: int, estado, id_categoria: { ...int, nullable: true }, categoria: { ...str, nullable: true }, stock_disponible: { ...int, description: 'Solo lotes no vencidos' }, nivel_stock: { type: 'string', enum: ['agotado', 'bajo', 'normal'] }, proximo_vencimiento: { ...date, nullable: true } } },
      ProductoDetalle: { allOf: [ref('Producto'), { type: 'object', properties: { lotes: { type: 'array', items: ref('Lote') } } }] },
      Lote: { type: 'object', properties: { id_lote: int, id_producto: int, producto: str, codigo_lote: str, fecha_vencimiento: date, stock_actual: int, vencido: { type: 'boolean' } } },
      Operacion: { type: 'object', properties: { id_operacion: int, tipo: { type: 'string', enum: ['venta', 'compra'] }, fecha: { type: 'string', format: 'date-time' }, estado: { type: 'string', enum: ['completada', 'anulada'] }, metodo_pago: { ...str, nullable: true }, total: num, id_contacto: { ...int, nullable: true }, contacto: { ...str, nullable: true }, id_usuario: str, usuario: str } },
      OperacionDetalle: { allOf: [ref('Operacion'), { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { id_producto: int, nombre: str, codigo_barras: { ...str, nullable: true }, cantidad: int, precio_unitario: num, subtotal: num, lotes: { type: 'array', items: { type: 'object', properties: { id_lote: int, codigo_lote: str, fecha_vencimiento: date, cantidad: int } } } } } } } }] },
    },
  },
  paths: {
    '/auth/login': { post: { tags: ['Auth'], summary: 'Iniciar sesión', requestBody: body({ type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: str } }), responses: { 200: resp('OK', data(ref('Sesion'))), 401: err('Credenciales inválidas'), 403: err('Usuario inactivo'), 422: ERR[422], 429: err('Demasiados intentos') } } },
    '/auth/refresh': { post: { tags: ['Auth'], summary: 'Renovar sesión con refresh_token', requestBody: body({ type: 'object', required: ['refresh_token'], properties: { refresh_token: str } }), responses: { 200: resp('OK', data(ref('Sesion'))), 401: err('Refresh inválido'), 422: ERR[422] } } },
    '/auth/me': { get: op('Auth', 'Usuario actual', { responses: { 200: resp('OK', data(ref('UsuarioBasico'))), ...errs(401, 403) } }) },
    '/auth/logout': { post: op('Auth', 'Cerrar sesión', { responses: { 200: resp('OK'), ...errs(401) } }) },

    '/usuarios': {
      get: op('Usuarios', 'Listar (admin)', { parameters: [...pg, search, q('rol', { type: 'string', enum: ['admin', 'vendedor'] }), q('estado', estado), sort(['nombre', 'rol', 'estado'])], responses: { 200: resp('OK', list('Usuario')), ...errs(401, 403, 422) } }),
      post: op('Usuarios', 'Crear usuario (admin)', { requestBody: body({ type: 'object', required: ['email', 'password', 'nombre'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8, maxLength: 72 }, nombre: str, rol: { type: 'string', enum: ['admin', 'vendedor'], default: 'vendedor' } } }), responses: { 201: resp('Creado', data(ref('Usuario'))), ...errs(401, 403, 409, 422) } }),
    },
    '/usuarios/{id}': {
      get: op('Usuarios', 'Detalle (admin)', { parameters: [{ ...idp, schema: { type: 'string', format: 'uuid' } }], responses: { 200: resp('OK', data(ref('Usuario'))), ...errs(401, 403, 404, 422) } }),
      patch: op('Usuarios', 'Editar nombre, rol, estado o contraseña (admin)', { parameters: [{ ...idp, schema: { type: 'string', format: 'uuid' } }], requestBody: body({ type: 'object', properties: { nombre: str, rol: { type: 'string', enum: ['admin', 'vendedor'] }, estado, password: { type: 'string', minLength: 8 } } }), responses: { 200: resp('OK', data(ref('Usuario'))), ...errs(401, 403, 404, 409, 422) } }),
    },

    '/categorias': {
      get: op('Categorias', 'Listar todas', { responses: { 200: resp('OK', { type: 'object', properties: { data: { type: 'array', items: ref('Categoria') } } }), ...errs(401) } }),
      post: op('Categorias', 'Crear (admin)', { requestBody: body({ type: 'object', required: ['nombre'], properties: { nombre: str } }), responses: { 201: resp('Creada', data(ref('Categoria'))), ...errs(401, 403, 409, 422) } }),
    },
    '/categorias/{id}': { patch: op('Categorias', 'Renombrar (admin)', { parameters: [idp], requestBody: body({ type: 'object', required: ['nombre'], properties: { nombre: str } }), responses: { 200: resp('OK', data(ref('Categoria'))), ...errs(401, 403, 404, 409, 422) } }) },

    '/contactos': {
      get: op('Contactos', 'Listar. El vendedor solo ve clientes', { parameters: [...pg, search, q('tipo', { type: 'string', enum: ['cliente', 'proveedor'] }, 'Solo admin'), sort(['nombre', 'id'])], responses: { 200: resp('OK', list('Contacto')), ...errs(401, 422) } }),
      post: op('Contactos', 'Crear. El vendedor solo puede crear clientes', { requestBody: body({ type: 'object', required: ['tipo', 'nombre'], properties: { tipo: { type: 'string', enum: ['cliente', 'proveedor'] }, nombre: str, documento: { ...str, nullable: true, description: '6 a 20 letras/números' }, telefono: { ...str, nullable: true } } }), responses: { 201: resp('Creado', data(ref('Contacto'))), ...errs(401, 403, 409, 422) } }),
    },
    '/contactos/{id}': {
      get: op('Contactos', 'Detalle', { parameters: [idp], responses: { 200: resp('OK', data(ref('Contacto'))), ...errs(401, 404) } }),
      patch: op('Contactos', 'Editar nombre, documento o teléfono', { parameters: [idp], requestBody: body({ type: 'object', properties: { nombre: str, documento: { ...str, nullable: true }, telefono: { ...str, nullable: true } } }), responses: { 200: resp('OK', data(ref('Contacto'))), ...errs(401, 404, 409, 422) } }),
    },

    '/productos': {
      get: op('Productos', 'Buscar productos con stock. El vendedor solo ve activos', { parameters: [...pg, search, q('codigo_barras', str, 'Coincidencia exacta (lector de barras)'), q('id_categoria', int), q('estado', estado, 'Solo admin'), q('nivel_stock', { type: 'string', enum: ['agotado', 'bajo', 'normal'] }), sort(['nombre', 'precio_venta', 'stock_disponible', 'categoria', 'id'])], responses: { 200: resp('OK', list('Producto')), ...errs(401, 422) } }),
      post: op('Productos', 'Crear (admin)', { requestBody: body({ type: 'object', required: ['nombre', 'precio_venta'], properties: { codigo_barras: { ...str, nullable: true }, nombre: str, id_categoria: { ...int, nullable: true }, principio_activo: { ...str, nullable: true }, presentacion: { ...str, nullable: true }, precio_venta: num, stock_minimo: { type: 'integer', minimum: 0, default: 0 } } }), responses: { 201: resp('Creado', data(ref('ProductoDetalle'))), ...errs(401, 403, 409, 422) } }),
    },
    '/productos/{id}': {
      get: op('Productos', 'Detalle con lotes', { parameters: [idp], responses: { 200: resp('OK', data(ref('ProductoDetalle'))), ...errs(401, 404) } }),
      patch: op('Productos', 'Editar o desactivar (admin). Todos los campos son opcionales', { parameters: [idp], requestBody: body({ type: 'object', properties: { codigo_barras: { ...str, nullable: true }, nombre: str, id_categoria: { ...int, nullable: true }, principio_activo: { ...str, nullable: true }, presentacion: { ...str, nullable: true }, precio_venta: num, stock_minimo: int, estado } }), responses: { 200: resp('OK', data(ref('ProductoDetalle'))), ...errs(401, 403, 404, 409, 422) } }),
    },

    '/lotes': { get: op('Lotes', 'Listar lotes (admin)', { parameters: [...pg, q('id_producto', int), q('con_stock', { type: 'boolean' }), q('vencido', { type: 'boolean' }), sort(['vencimiento', 'producto', 'stock'])], responses: { 200: resp('OK', list('Lote')), ...errs(401, 403, 422) } }) },
    '/lotes/{id}/ajustes': { post: op('Lotes', 'Ajuste manual de stock (admin)', { parameters: [idp], requestBody: body({ type: 'object', required: ['cantidad', 'motivo'], properties: { cantidad: { type: 'integer', description: 'Positivo suma, negativo resta, no 0' }, motivo: str } }), responses: { 200: resp('Lote con stock actualizado', data(ref('Lote'))), ...errs(401, 403, 409, 422) } }) },

    '/ventas': {
      get: opsList('Ventas', 'el vendedor solo ve las suyas'),
      post: op('Ventas', 'Registrar venta (descuenta stock por vencimiento más próximo)', { requestBody: body({ type: 'object', required: ['items'], properties: { id_contacto: { ...int, nullable: true }, metodo_pago: { type: 'string', enum: ['efectivo', 'tarjeta', 'yape', 'plin', 'transferencia'], default: 'efectivo' }, items: itemsVenta } }), responses: { 201: resp('Venta registrada', data(ref('OperacionDetalle'))), ...errs(401, 403, 409, 422) } }),
    },
    '/ventas/{id}': { get: opsGet('Ventas') },
    '/ventas/{id}/anular': { post: anular('Ventas') },

    '/compras': {
      get: opsList('Compras', 'admin'),
      post: op('Compras', 'Registrar compra: crea lotes y sube stock (admin)', { requestBody: body({ type: 'object', required: ['id_contacto', 'items'], properties: { id_contacto: { ...int, description: 'Proveedor' }, metodo_pago: str, items: itemsCompra } }), responses: { 201: resp('Compra registrada', data(ref('OperacionDetalle'))), ...errs(401, 403, 409, 422) } }),
    },
    '/compras/{id}': { get: opsGet('Compras') },
    '/compras/{id}/anular': { post: anular('Compras') },

    '/alertas/reposicion': { get: op('Alertas', 'Productos con stock <= mínimo', { responses: { 200: resp('OK', { type: 'object', properties: { data: { type: 'array', items: { type: 'object', properties: { id_producto: int, codigo_barras: str, nombre: str, stock_disponible: int, stock_minimo: int, faltante: int, nivel: { type: 'string', enum: ['agotado', 'bajo'] } } } } } }), ...errs(401) } }) },
    '/alertas/vencimiento': { get: op('Alertas', 'Lotes vencidos o por vencer (90 días)', { responses: { 200: resp('OK', { type: 'object', properties: { data: { type: 'array', items: { type: 'object', properties: { id_lote: int, nombre: str, codigo_lote: str, fecha_vencimiento: date, stock_actual: int, dias_restantes: int, nivel: { type: 'string', enum: ['vencido', 'critico', 'por_vencer'] } } } } } }), ...errs(401) } }) },
    '/alertas/resumen': { get: op('Alertas', 'Contadores para la campanita', { responses: { 200: resp('OK', data({ type: 'object', properties: { reposicion: int, vencimiento: int, total: int } })), ...errs(401) } }) },

    '/movimientos': { get: op('Movimientos', 'Kardex (admin)', { parameters: [...pg, q('id_producto', int), q('id_lote', int), q('id_operacion', int), q('tipo', { type: 'string', enum: ['compra', 'venta', 'anulacion', 'ajuste'] }), q('desde', date), q('hasta', date), sort(['fecha', 'id'])], responses: { 200: resp('OK', { type: 'object', properties: { data: { type: 'array', items: { type: 'object' } }, meta: ref('Meta') } }), ...errs(401, 403, 422) } }) },
    '/reportes/resumen': { get: op('Reportes', 'Dashboard del admin', { responses: { 200: resp('OK', data({ type: 'object', properties: { ventas_hoy: { type: 'object', properties: { cantidad: int, total: num } }, ventas_mes: { type: 'object', properties: { cantidad: int, total: num } }, top_productos_mes: { type: 'array', items: { type: 'object', properties: { id_producto: int, nombre: str, unidades: int, total: num } } }, alertas: { type: 'object', properties: { reposicion: int, vencimiento: int } } } })), ...errs(401, 403) } }) },
  },
};
