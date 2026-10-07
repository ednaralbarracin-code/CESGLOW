const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('⚠️  ADVERTENCIA: JWT_SECRET no está configurado en las variables de entorno.');
  process.exit(1); // El servidor no arranca sin esta variable
}

// Verificar token JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado.' });
    }
    req.user = user;
    next();
  });
}

// Verificar si es administrador
function isAdmin(req, res, next) {
  if (req.user && req.user.rol === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Acceso denegado. Se requiere permisos de administrador.' });
  }
}

// Generar token JWT
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id_usuario || user.id,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      rol: user.rol
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// Verificar sesión desde cookie
function checkSession(req, res, next) {
  const token = req.cookies && req.cookies.token;

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      req.user = null;
    } else {
      req.user = user;
    }
    next();
  });
}

module.exports = {
  authenticateToken,
  isAdmin,
  generateToken,
  checkSession,
  JWT_SECRET
};
