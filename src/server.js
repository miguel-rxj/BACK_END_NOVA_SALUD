const app = require('./app');

// Configurar el puerto del servidor (por defecto 3000 o el provisto por el entorno)
const port = Number(process.env.PORT) || 3000;

// Iniciar el servidor escuchando en todas las interfaces de red ('0.0.0.0')
app.listen(port, '0.0.0.0', () => {
  console.log(`Botica API en puerto ${port}`);
});