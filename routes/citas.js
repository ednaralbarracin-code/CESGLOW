const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const { db } = require('../config/database');

// Middleware para verificar token
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

// Obtener servicios disponibles
router.get('/servicios', (req, res) => {
  try {
    const servicios = db.prepare('SELECT * FROM servicios WHERE activo = 1').all();
    res.json(servicios);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

// Crear una cita
router.post('/', verificarToken, (req, res) => {
  try {
    const { id_servicio, fecha_cita, notas } = req.body;
    const id_usuario = req.user.id || req.user.id_usuario;

    if (!id_servicio || !fecha_cita) {
      return res.status(400).json({ error: 'Servicio y fecha son obligatorios' });
    }

    // Verificar que no haya otra cita en esa fecha/hora
    const citaExistente = db.prepare(
      'SELECT * FROM citas WHERE fecha_cita = ? AND estado != ?'
    ).get(fecha_cita, 'cancelada');

    if (citaExistente) {
      return res.status(400).json({ error: 'Ya hay una cita agendada en ese horario' });
    }

    const result = db.prepare(`
      INSERT INTO citas (id_usuario, id_servicio, fecha_cita, estado, notas)
      VALUES (?, ?, ?, 'pendiente', ?)
    `).run(id_usuario, id_servicio, fecha_cita, notas || null);

    res.status(201).json({
      message: '¡Cita agendada exitosamente!',
      id_cita: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Error al crear cita:', error);
    res.status(500).json({ error: 'Error al agendar la cita' });
  }
});

// Obtener citas del usuario
router.get('/mis-citas', verificarToken, (req, res) => {
  try {
    const id_usuario = req.user.id || req.user.id_usuario;
    const citas = db.prepare(`
      SELECT c.*, s.nombre as servicio_nombre, s.precio as servicio_precio, s.duracion_minutos
      FROM citas c
      JOIN servicios s ON c.id_servicio = s.id_servicio
      WHERE c.id_usuario = ?
      ORDER BY c.fecha_cita DESC
    `).all(id_usuario);
    res.json(citas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener citas' });
  }
});

// Cancelar una cita
router.put('/:id/cancelar', verificarToken, (req, res) => {
  try {
    const id_usuario = req.user.id || req.user.id_usuario;
    const { id } = req.params;

    const cita = db.prepare('SELECT * FROM citas WHERE id_cita = ? AND id_usuario = ?').get(id, id_usuario);
    if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });

    db.prepare("UPDATE citas SET estado = 'cancelada' WHERE id_cita = ?").run(id);
    res.json({ message: 'Cita cancelada correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al cancelar la cita' });
  }
});

module.exports = router;
