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

// Obtener servicios disponibles
router.get('/servicios', (req, res) => {
  try {
    const servicios = db.prepare('SELECT * FROM servicios WHERE activo = 1').all();
    res.json(servicios);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

// Obtener horarios ocupados para una fecha
router.get('/ocupadas', (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: 'Fecha requerida' });
    const ocupadas = db.prepare(`
      SELECT strftime('%H:%M', fecha_cita) as hora
      FROM citas
      WHERE date(fecha_cita) = ? AND estado != 'cancelada'
    `).all(fecha);
    res.json(ocupadas.map(c => c.hora));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener horarios' });
  }
});

// Crear una cita (acepta múltiples servicios)
router.post('/', verificarToken, (req, res) => {
  try {
    const { servicios, id_servicio, fecha_cita, notas } = req.body;
    const id_usuario = req.user.id || req.user.id_usuario;

    // Soportar tanto array de servicios como id_servicio único
    const listaServicios = servicios && servicios.length > 0
      ? servicios
      : id_servicio ? [id_servicio] : [];

    if (listaServicios.length === 0 || !fecha_cita) {
      return res.status(400).json({ error: 'Servicio y fecha son obligatorios' });
    }

    // Verificar que no haya otra cita en esa fecha/hora
    const citaExistente = db.prepare(
      "SELECT * FROM citas WHERE fecha_cita = ? AND estado != 'cancelada'"
    ).get(fecha_cita);

    if (citaExistente) {
      return res.status(400).json({ error: 'Ya hay una cita agendada en ese horario' });
    }

    // Crear una cita por cada servicio seleccionado
    const insertCita = db.prepare(`
      INSERT INTO citas (id_usuario, id_servicio, fecha_cita, estado, notas)
      VALUES (?, ?, ?, 'pendiente', ?)
    `);

    const ids = [];
    for (const sid of listaServicios) {
      const result = insertCita.run(id_usuario, sid, fecha_cita, notas || null);
      ids.push(result.lastInsertRowid);
    }

    res.status(201).json({
      message: '¡Cita agendada exitosamente!',
      ids_cita: ids
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
