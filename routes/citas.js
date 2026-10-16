// CESGLOW-main/routes/citas.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { crearNotificacion } = require('../services/notificaciones');

// 1. CREACIÓN
router.post('/', (req, res) => {
  const { usuario_id, servicio_id, fecha, hora, notas, nombre_cliente, telefono_cliente } = req.body;

  db.get('SELECT nombre FROM servicios WHERE id = ?', [servicio_id], (err, serv) => {
    const servicio = serv ? serv.nombre : 'Servicio';
    const cliente = nombre_cliente || 'Cliente';

    const sql = `INSERT INTO citas (usuario_id, servicio_id, fecha, hora, notas, nombre_cliente, telefono_cliente, estado) VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente')`;
    db.run(sql, [usuario_id || null, servicio_id, fecha, hora, notas || '', cliente, telefono_cliente || ''], async function(errInsert) {
      if (errInsert) return res.status(500).json({ error: 'Error al agendar cita' });
      
      const citaId = this.lastID;

      // Alerta al Cliente
      await crearNotificacion({
        usuario_id,
        rol: 'cliente',
        tipo: 'creacion',
        titulo: '✨ Cita Solicitada con Éxito',
        mensaje: `Has agendado tu cita para ${servicio} el ${fecha} a las ${hora}.`,
        cita_id: citaId
      });

      // Alerta al Admin
      await crearNotificacion({
        usuario_id: null,
        rol: 'admin',
        tipo: 'creacion',
        titulo: '📅 ¡Nueva Cita Agendada!',
        mensaje: `${cliente} ha solicitado una cita para ${servicio} el ${fecha} a las ${hora}.`,
        cita_id: citaId
      });

      res.status(201).json({ success: true, citaId });
    });
  });
});

// 2. CONFIRMACIÓN (Admin confirma -> Notifica a Cliente)
router.put('/:id/confirmar', (req, res) => {
  const citaId = req.params.id;
  db.get('SELECT c.*, s.nombre as servicio_nombre FROM citas c LEFT JOIN servicios s ON c.servicio_id = s.id WHERE c.id = ?', [citaId], (err, cita) => {
    if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });

    db.run('UPDATE citas SET estado = "confirmada" WHERE id = ?', [citaId], async () => {
      await crearNotificacion({
        usuario_id: cita.usuario_id,
        rol: 'cliente',
        tipo: 'confirmacion',
        titulo: '✅ ¡Tu Cita ha sido Confirmada!',
        mensaje: `CESGLOW ha confirmado tu cita de ${cita.servicio_nombre} para el ${cita.fecha} a las ${cita.hora}.`,
        cita_id: citaId
      });
      res.json({ success: true });
    });
  });
});

// 3. CANCELACIÓN (Notifica a Cliente y Admin)
router.put('/:id/cancelar', (req, res) => {
  const citaId = req.params.id;
  db.get('SELECT c.*, s.nombre as servicio_nombre, u.nombre as cliente_nombre FROM citas c LEFT JOIN servicios s ON c.servicio_id = s.id LEFT JOIN usuarios u ON c.usuario_id = u.id WHERE c.id = ?', [citaId], (err, cita) => {
    if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });

    db.run('UPDATE citas SET estado = "cancelada" WHERE id = ?', [citaId], async () => {
      const cliente = cita.cliente_nombre || cita.nombre_cliente || 'Cliente';

      await crearNotificacion({
        usuario_id: cita.usuario_id,
        rol: 'cliente',
        tipo: 'cancelacion',
        titulo: '❌ Cita Cancelada',
        mensaje: `Tu cita de ${cita.servicio_nombre} el ${cita.fecha} a las ${cita.hora} fue cancelada.`,
        cita_id: citaId
      });

      await crearNotificacion({
        usuario_id: null,
        rol: 'admin',
        tipo: 'cancelacion',
        titulo: '⚠️ Cita Cancelada',
        mensaje: `La cita de ${cliente} para ${cita.servicio_nombre} fue cancelada.`,
        cita_id: citaId
      });

      res.json({ success: true });
    });
  });
});

// 4. REAGENDACIÓN (Notifica a Cliente y Admin)
router.put('/:id/reagendar', (req, res) => {
  const citaId = req.params.id;
  const { nueva_fecha, nueva_hora } = req.body;

  db.get('SELECT c.*, s.nombre as servicio_nombre, u.nombre as cliente_nombre FROM citas c LEFT JOIN servicios s ON c.servicio_id = s.id LEFT JOIN usuarios u ON c.usuario_id = u.id WHERE c.id = ?', [citaId], (err, cita) => {
    if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });

    db.run('UPDATE citas SET fecha = ?, hora = ?, notificado_24h = 0, notificado_12h = 0 WHERE id = ?', [nueva_fecha, nueva_hora, citaId], async () => {
      const cliente = cita.cliente_nombre || cita.nombre_cliente || 'Cliente';

      await crearNotificacion({
        usuario_id: cita.usuario_id,
        rol: 'cliente',
        tipo: 'reagendacion',
        titulo: '🔄 Cita Reagendada con Éxito',
        mensaje: `Tu cita para ${cita.servicio_nombre} se reagendó para el ${nueva_fecha} a las ${nueva_hora}.`,
        cita_id: citaId
      });

      await crearNotificacion({
        usuario_id: null,
        rol: 'admin',
        tipo: 'reagendacion',
        titulo: '🔄 Cita Reagendada',
        mensaje: `La cita de ${cliente} (${cita.servicio_nombre}) se reagendó para el ${nueva_fecha} a las ${nueva_hora}.`,
        cita_id: citaId
      });

      res.json({ success: true });
    });
  });
});

module.exports = router;