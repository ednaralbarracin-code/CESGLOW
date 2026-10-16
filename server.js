// CESGLOW-main/server.js
const express = require('express');
const app = express();
const path = require('path');
const { iniciarMonitoreoAlertas } = require('./services/notificaciones');

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rutas
app.use('/api/citas', require('./routes/citas'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/notificaciones', require('./routes/notificaciones'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor CESGLOW corriendo en http://localhost:${PORT}`);
  // Inicia el cron de recordatorios automáticos de 24h y 12h:
  iniciarMonitoreoAlertas();
});