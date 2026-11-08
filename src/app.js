import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import { logger } from './logger.js';
import { query } from './db.js';
import { openapi } from './docs/openapi.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import usuariosRoutes from './routes/usuarios.js';
import categoriasRoutes from './routes/categorias.js';
import contactosRoutes from './routes/contactos.js';
import productosRoutes from './routes/productos.js';
import lotesRoutes from './routes/lotes.js';
import { ventasRouter, comprasRouter } from './routes/operaciones.js';
import alertasRoutes from './routes/alertas.js';
import movimientosRoutes from './routes/movimientos.js';
import reportesRoutes from './routes/reportes.js';

export const app = express();

app.set('trust proxy', 1); // detrás del proxy de Render/Railway
app.disable('x-powered-by');

app.use(pinoHttp({ logger, autoLogging: !config.isTest }));
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: (_req, res) =>
    res.status(429).json({ error: { code: 'DEMASIADAS_PETICIONES', message: 'Demasiadas peticiones, intenta en un momento' } }),
}));
app.use(express.json({ limit: '100kb' }));

app.get('/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ data: { status: 'ok' } });
  } catch {
    res.status(503).json({ error: { code: 'BD_NO_DISPONIBLE', message: 'Base de datos no disponible' } });
  }
});

app.get('/api/openapi.json', (_req, res) => res.json(openapi));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'Botica API' }));

const v1 = express.Router();
v1.use('/auth', authRoutes);
v1.use('/usuarios', usuariosRoutes);
v1.use('/categorias', categoriasRoutes);
v1.use('/contactos', contactosRoutes);
v1.use('/productos', productosRoutes);
v1.use('/lotes', lotesRoutes);
v1.use('/ventas', ventasRouter);
v1.use('/compras', comprasRouter);
v1.use('/alertas', alertasRoutes);
v1.use('/movimientos', movimientosRoutes);
v1.use('/reportes', reportesRoutes);
app.use('/api/v1', v1);

app.use(notFoundHandler);
app.use(errorHandler);
