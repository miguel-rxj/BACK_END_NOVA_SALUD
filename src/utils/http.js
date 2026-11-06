const { ZodError } = require('zod');

// Envuelve funciones asíncronas para capturar errores automáticamente en Express
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Crea un error personalizado con un código de estado HTTP específico
const fail = (status, message) => Object.assign(new Error(message), { status });

module.exports = { wrap, fail };