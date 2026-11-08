import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.isTest ? 'silent' : config.isProd ? 'info' : 'debug',
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});
