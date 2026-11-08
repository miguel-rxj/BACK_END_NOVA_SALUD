import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { send } from '../utils/http.js';

const router = Router();
router.use(authenticate);

// Productos activos con stock vendible <= stock mínimo (condición 2 del caso)
router.get('/reposicion', async (_req, res) => {
  const { rows } = await query(
    `SELECT a.id_producto, p.codigo_barras, a.nombre, a.stock_disponible, a.stock_minimo, a.faltante,
            CASE WHEN a.stock_disponible <= 0 THEN 'agotado' ELSE 'bajo' END AS nivel
     FROM public.v_alertas_reposicion a
     JOIN public.productos p ON p.id_producto = a.id_producto
     ORDER BY a.stock_disponible, a.nombre
     LIMIT 500`,
  );
  send(res, rows);
});

// Lotes con stock que ya vencieron o vencen en los próximos 90 días
router.get('/vencimiento', async (_req, res) => {
  const { rows } = await query(
    `SELECT a.*,
            CASE WHEN a.dias_restantes < 0 THEN 'vencido'
                 WHEN a.dias_restantes <= 30 THEN 'critico'
                 ELSE 'por_vencer' END AS nivel
     FROM public.v_alertas_vencimiento a
     ORDER BY a.fecha_vencimiento, a.id_lote
     LIMIT 500`,
  );
  send(res, rows);
});

// Contadores para la campanita del frontend
router.get('/resumen', async (_req, res) => {
  const [rep, ven] = await Promise.all([
    query('SELECT count(*)::int AS n FROM public.v_alertas_reposicion'),
    query('SELECT count(*)::int AS n FROM public.v_alertas_vencimiento'),
  ]);
  send(res, { reposicion: rep.rows[0].n, vencimiento: ven.rows[0].n, total: rep.rows[0].n + ven.rows[0].n });
});

export default router;
