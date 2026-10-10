const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initializeDatabase } = require('./config/database');
const authRoutes = require('./routes/auth');
const citasRoutes = require('./routes/citas');
const resenasRoutes = require('./routes/resenas');
const adminRoutes = require('./routes/admin');
const { checkSession } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

initializeDatabase();

// ── HELMET — cabeceras de seguridad HTTP ──────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Lo manejamos con Cloudflare
  crossOriginEmbedderPolicy: false
}));

// ── RATE LIMITING ─────────────────────────────────────────

// General: 100 peticiones por 15 minutos por IP
const limiterGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta de nuevo en 15 minutos.' }
});

// Login/Registro: 10 intentos por 15 minutos por IP
const limiterAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Por favor espera 15 minutos antes de intentarlo de nuevo.' }
});

// Reseñas: 5 por hora por IP
const limiterResenas = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Has enviado demasiadas reseñas. Intenta más tarde.' }
});

app.use(limiterGeneral);

// ── CORS ──────────────────────────────────────────────────
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://bsc-beautyskincare.com',
    'https://www.bsc-beautyskincare.com',
    'https://bsc-beautyskincare.pages.dev',
    'https://cesglowbeauty.com',
    'https://www.cesglowbeauty.com'
  ];
  // Dominio(s) del panel de administración, separados por coma (variable ADMIN_ORIGIN en Railway)
  (process.env.ADMIN_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean).forEach(o => allowedOrigins.push(o));
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '10kb' })); // Limitar tamaño del body
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());
app.use(checkSession);

app.use(express.static(path.join(__dirname, 'public')));

// Aplicar rate limit estricto a auth y reseñas
app.use('/api/auth/login', limiterAuth);
app.use('/api/auth/register', limiterAuth);
app.use('/api/resenas', limiterResenas);
app.use('/api/admin/login', limiterAuth);

app.use('/api/auth', authRoutes);
app.use('/api/citas', citasRoutes);
app.use('/api/resenas', resenasRoutes);
app.use('/api/admin', adminRoutes);

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Algo salió mal. Por favor, inténtalo de nuevo.' });
});

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
