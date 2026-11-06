const { z, id, optText, money } = require('./common');

// Esquema de validación para categorías
const category = z.object({
  nombre: optText(100),
}).strict();

// Esquema de validación para contactos (clientes o proveedores)
const contact = z.object({
  tipo: z.enum(['cliente', 'proveedor']),
  nombre: optText(150),
  documento: z.string().trim().max(20).nullable().optional(),
  telefono: z.string().trim().max(20).nullable().optional(),
}).strict();

// Esquema de validación para productos
const product = z.object({
  codigo_barras: z.string().trim().max(50).nullable().optional(),
  nombre: optText(150),
  id_categoria: id.nullable().optional(),
  principio_activo: z.string().trim().max(150).nullable().optional(),
  presentacion: z.string().trim().max(100).nullable().optional(),
  precio_venta: money,
  stock_minimo: z.number().int().min(0).max(2147483647).optional(),
  estado: z.enum(['activo', 'inactivo']).optional(),
}).strict();

// Lista de campos extraídos del esquema de productos para operaciones CRUD
const productFields = Object.keys(product.shape);

module.exports = {
  category,
  contact,
  product,
  productFields,
};