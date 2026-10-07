const express = require('express');
const router = express.Router();
const { userQueries } = require('../config/database');
const { generateToken } = require('../middleware/auth');

// ── Sanitización y validación ─────────────────────────────
function sanitizar(texto) {
  if (typeof texto !== 'string') return '';
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim()
    .slice(0, 200);
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarTelefono(tel) {
  if (!tel) return true; // opcional
  return /^[0-9\+\-\s]{7,20}$/.test(tel);
}
// ─────────────────────────────────────────────────────────



// Ruta de registro
router.post('/register', (req, res) => {
  try {
    const { nombre, apellido, email, telefono, password, confirmPassword } = req.body;

    // Sanitizar inputs
    const nombreLimpio = sanitizar(nombre);
    const apellidoLimpio = sanitizar(apellido);
    const emailLimpio = email ? email.trim().toLowerCase().slice(0, 200) : '';
    const telefonoLimpio = telefono ? sanitizar(telefono) : '';

    // Validaciones
    if (!nombreLimpio || !apellidoLimpio || !emailLimpio || !password) {
      return res.status(400).json({ error: 'Todos los campos marcados son obligatorios.' });
    }

    if (nombreLimpio.length < 2) {
      return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres.' });
    }

    if (!validarEmail(emailLimpio)) {
      return res.status(400).json({ error: 'El correo electrónico no es válido.' });
    }

    if (!validarTelefono(telefonoLimpio)) {
      return res.status(400).json({ error: 'El teléfono solo puede contener números y símbolos + - .' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Las contraseñas no coinciden.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    // Verificar si el email ya existe
    const existingUser = userQueries.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Este correo electrónico ya está registrado.' });
    }

    // Crear usuario
    const newUser = userQueries.create({
      nombre: nombreLimpio,
      apellido: apellidoLimpio,
      email: emailLimpio,
      telefono: telefonoLimpio,
      password
    });

    // Generar token
    const token = generateToken(newUser);

    res.status(201).json({
      message: 'Usuario registrado exitosamente.',
      token,
      user: {
        id: newUser.id,
        nombre: newUser.nombre,
        apellido: newUser.apellido,
        email: newUser.email,
        rol: 'cliente'
      }
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error al registrar usuario. Por favor, inténtalo de nuevo.' });
  }
});

// Ruta de inicio de sesión
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    // Sanitizar y validar
    const emailLogin = email ? email.trim().toLowerCase().slice(0, 200) : '';

    if (!emailLogin || !password) {
      return res.status(400).json({ error: 'Correo electrónico y contraseña son obligatorios.' });
    }

    if (!validarEmail(emailLogin)) {
      return res.status(400).json({ error: 'El correo electrónico no es válido.' });
    }

    // Buscar usuario por email
    const user = userQueries.findByEmail(emailLogin);
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas. Verifica tu correo y contraseña.' });
    }

    // Verificar contraseña
    const isValidPassword = userQueries.verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas. Verifica tu correo y contraseña.' });
    }

    // Generar token
    const token = generateToken(user);

    res.json({
      message: 'Inicio de sesión exitoso.',
      token,
      user: {
        id: user.id_usuario,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        rol: user.rol
      }
    });
  } catch (error) {
    console.error('Error en inicio de sesión:', error);
    res.status(500).json({ error: 'Error al iniciar sesión. Por favor, inténtalo de nuevo.' });
  }
});

// Ruta de verificación de sesión
router.get('/me', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ authenticated: false, user: null });
  }

  const jwt = require('jsonwebtoken');
  const { JWT_SECRET } = require('../middleware/auth');

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ authenticated: false, user: null });
    }
    res.json({ authenticated: true, user });
  });
});

// Ruta de cierre de sesión
router.post('/logout', (req, res) => {
  res.json({ message: 'Sesión cerrada correctamente.' });
});

module.exports = router;
