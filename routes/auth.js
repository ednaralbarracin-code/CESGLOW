const express = require('express');
const router = express.Router();
const { userQueries } = require('../config/database');
const { generateToken } = require('../middleware/auth');

// Ruta de registro
router.post('/register', (req, res) => {
  try {
    const { nombre, apellido, email, telefono, password, confirmPassword } = req.body;

    // Validaciones básicas
    if (!nombre || !apellido || !email || !password) {
      return res.status(400).json({ error: 'Todos los campos marcados son obligatorios.' });
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
      nombre,
      apellido,
      email,
      telefono,
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

    // Validaciones básicas
    if (!email || !password) {
      return res.status(400).json({ error: 'Correo electrónico y contraseña son obligatorios.' });
    }

    // Buscar usuario por email
    const user = userQueries.findByEmail(email);
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
