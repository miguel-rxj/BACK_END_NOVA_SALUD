const { z, id, optText, money, date } = require('./common');

// Esquema para un ítem individual dentro de una venta
const saleItem = z.object({
  id_producto: id,
  cantidad: z.number().int().positive().max(1000000),
}).strict();

// Esquema de validación para el registro de ventas
const sale = z.object({
  items: z.array(saleItem).min(1).max(100),
  id_contacto: id.nullable().optional(),
  metodo_pago: z.string().trim().max(20).default('efectivo'),
}).strict();

// Esquema para un ítem individual dentro de una compra (extiende a saleItem)
const purchaseItem = saleItem.extend({
  precio_unitario: money,
  codigo_lote: optText(50),
  fecha_vencimiento: date,
});

// Esquema de validación para el registro de compras
const purchase = z.object({
  id_contacto: id,
  items: z.array(purchaseItem).min(1).max(100),
  metodo_pago: z.string().trim().max(20).nullable().optional(),
}).strict();

module.exports = {
  sale,
  purchase,
};