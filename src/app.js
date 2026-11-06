// Inicializar conexiones
require('./config/connections');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const errorHandler = require('./middlewares/errors');

const app = express();

// Configuraciones de seguridad y cabeceras
app.disable('x-powered-by');
app.use(helmet());

// Configuración de CORS basada en las URLs permitidas del frontend
const allowed = process.env.FRONTEND_URL.split(',').map((x) => x.trim());
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || allowed.includes(origin)),
  })
);

// Parseo de peticiones JSON con límite de tamaño
app.use(express.json({ limit: '64kb' }));

// Limitador de tasa de peticiones (Rate Limiting) para la API
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  })
);

// Ruta de verificación de estado (Health Check)
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Registro dinámico de las rutas de la API
const routeNames = ['auth', 'catalog', 'inventory', 'operations', 'users'];
for (const name of routeNames) {
  app.use('/api', require(`./routes/${name}.routes`));
}

// Manejador para rutas no encontradas (404)
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Middleware centralizado de manejo de errores
app.use(errorHandler);

module.exports = app;