const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const { db } = require('../config/database');

function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
}

// Obtener reseñas aprobadas (público)
router.get('/', (req, res) => {
  try {
    const resenas = db.prepare(`
      SELECT r.id_resena, r.calificacion, r.comentario, r.fecha_creacion,
             u.nombre, u.apellido
      FROM resenas r
      JOIN usuarios u ON r.id_usuario = u.id_usuario
      WHERE r.estado = 'aprobada'
      ORDER BY r.fecha_creacion DESC
    `).all();
    res.json(resenas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener reseñas' });
  }
});

// Enviar reseña (requiere login)
router.post('/', verificarToken, (req, res) => {
  try {
    const { calificacion, comentario } = req.body;
    const id_usuario = req.user.id || req.user.id_usuario;

    if (!calificacion || !comentario) {
      return res.status(400).json({ error: 'Calificación y comentario son obligatorios' });
    }
    if (calificacion < 1 || calificacion > 5) {
      return res.status(400).json({ error: 'La calificación debe ser entre 1 y 5' });
    }

    // Verificar si ya dejó una reseña
    const existente = db.prepare('SELECT * FROM resenas WHERE id_usuario = ?').get(id_usuario);
    if (existente) {
      return res.status(400).json({ error: 'Ya dejaste una reseña anteriormente' });
    }

    db.prepare(`
      INSERT INTO resenas (id_usuario, calificacion, comentario, estado)
      VALUES (?, ?, ?, 'aprobada')
    `).run(id_usuario, calificacion, comentario);

    res.status(201).json({ message: '¡Reseña enviada! Será publicada pronto.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al enviar la reseña' });
  }
});

module.exports = router;
