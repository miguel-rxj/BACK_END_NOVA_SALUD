import { app } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { pool } from './db.js';

const server = app.listen(config.PORT, () => {
  logger.info(`API escuchando en http://localhost:${config.PORT} (docs: /api/docs)`);
});

async function shutdown(signal) {
  logger.info(`${signal} recibido, cerrando...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
