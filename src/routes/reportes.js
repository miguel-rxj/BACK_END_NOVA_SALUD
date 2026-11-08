import { Router } from 'express';
import { query } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { send } from '../utils/http.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

const HOY = "(public.fn_hoy())::timestamp AT TIME ZONE 'America/Lima'";
const MES = "(date_trunc('month', public.fn_hoy()))::timestamp AT TIME ZONE 'America/Lima'";
const resumenVentas = (desde) => query(
  `SELECT count(*)::int AS cantidad, COALESCE(sum(total), 0) AS total
   FROM public.operaciones WHERE tipo = 'venta' AND estado = 'completada' AND fecha >= ${desde}`,
);

// Datos del dashboard del administrador (todo en hora de Lima)
router.get('/resumen', async (_req, res) => {
  const [hoy, mes, top, rep, ven] = await Promise.all([
    resumenVentas(HOY),
    resumenVentas(MES),
    query(
      `SELECT p.id_producto, p.nombre, sum(d.cantidad)::int AS unidades, sum(d.subtotal) AS total
       FROM public.detalle_operacion d
       JOIN public.operaciones o ON o.id_operacion = d.id_operacion
       JOIN public.productos p ON p.id_producto = d.id_producto
       WHERE o.tipo = 'venta' AND o.estado = 'completada' AND o.fecha >= ${MES}
       GROUP BY p.id_producto, p.nombre
       ORDER BY unidades DESC, p.nombre LIMIT 5`,
    ),
    query('SELECT count(*)::int AS n FROM public.v_alertas_reposicion'),
    query('SELECT count(*)::int AS n FROM public.v_alertas_vencimiento'),
  ]);
  send(res, {
    ventas_hoy: hoy.rows[0],
    ventas_mes: mes.rows[0],
    top_productos_mes: top.rows,
    alertas: { reposicion: rep.rows[0].n, vencimiento: ven.rows[0].n },
  });
});

export default router;
