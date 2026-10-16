// CESGLOW-main/routes/citas.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { crearNotificacion } = require('../services/notificaciones');

// 0. LISTAR TODAS LAS CITAS
router.get('/', (req, res) => {
  const query = `
    SELECT c.*, s.nombre as servicio_nombre, s.nombre_en as servicio_nombre_en, u.nombre as cliente_nombre
    FROM citas c
    LEFT JOIN servicios s ON c.servicio_id = s.id
    LEFT JOIN usuarios u ON c.usuario_id = u.id
    ORDER BY c.fecha DESC, c.hora DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener citas' });
    res.json(rows || []);
  });
});

// 1. CREACIÓN DE CITA (Notifica a Cliente y a Admin)
router.post('/', (req, res) => {
  const { usuario_id, servicio_id, fecha, hora, notas, nombre_cliente, telefono_cliente, email_cliente } = req.body;

  if (!servicio_id || !fecha || !hora) {
    return res.status(400).json({ error: 'Servicio, fecha y hora son obligatorios.' });
  }

  db.get('SELECT nombre, nombre_en FROM servicios WHERE id = ?', [servicio_id], (errServ, serv) => {
    const nombreServicio = serv ? serv.nombre : 'Servicio CESGLOW';
    const nombreCliente = nombre_cliente || 'Cliente';

    const insertQuery = `
      INSERT INTO citas (usuario_id, servicio_id, fecha, hora, notas, nombre_cliente, telefono_cliente, email_cliente, estado, fecha_creacion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', datetime('now', 'localtime'))
    `;

    db.run(
      insertQuery,
      [usuario_id || null, servicio_id, fecha, hora, notas || '', nombreCliente, telefono_cliente || '', email_cliente || ''],
      async function (err) {
        if (err) {
          console.error('Error al agendar cita:', err);
          return res.status(500).json({ error: 'No se pudo agendar la cita.' });
        }

        const citaId = this.lastID;

        // NOTIFICACIÓN AL CLIENTE (Creación)
        await crearNotificacion({
          usuario_id,
          rol: 'cliente',
          tipo: 'creacion',
          titulo: '✨ Cita Solicitada con Éxito',
          mensaje: `Has agendado tu cita de ${nombreServicio} para el ${fecha} a las ${hora}. Pendiente de confirmación.`,
          cita_id: citaId
        });

        // NOTIFICACIÓN AL ADMINISTRADOR (Creación)
        await crearNotificacion({
          usuario_id: null,
          rol: 'admin',
          tipo: 'creacion',
          titulo: '📅 ¡Nueva Cita Agendada!',
          mensaje: `El cliente ${nombreCliente} solicitó una cita para ${nombreServicio} el ${fecha} a las ${hora}.`,
          cita_id: citaId
        });

        res.status(201).json({
          mensaje: 'Cita creada exitosamente con notificaciones enviadas.',
          citaId
        });
      }
    );
  });
});

// 2. CONFIRMACIÓN DE CITA (Admin confirma -> Notifica al Cliente)
router.put('/:id/confirmar', (req, res) => {
  const citaId = req.params.id;

  const selectQuery = `
    SELECT c.*, s.nombre as servicio_nombre
    FROM citas c
    LEFT JOIN servicios s ON c.servicio_id = s.id
    WHERE c.id = ?
  `;

  db.get(selectQuery, [citaId], (err, cita) => {
    if (err || !cita) return res.status(404).json({ error: 'Cita no encontrada.' });

    db.run('UPDATE citas SET estado = "confirmada" WHERE id = ?', [citaId], async (updateErr) => {
      if (updateErr) return res.status(500).json({ error: 'Error al confirmar la cita.' });

      // NOTIFICACIÓN AL CLIENTE (Confirmación)
      await crearNotificacion({
        usuario_id: cita.usuario_id,
        rol: 'cliente',
        tipo: 'confirmacion',
        titulo: '✅ ¡Tu Cita ha sido Confirmada!',
        mensaje: `CESGLOW ha confirmado tu cita de ${cita.servicio_nombre} el ${cita.fecha} a las ${cita.hora}. ¡Te esperamos con gusto!`,
        cita_id: citaId
      });

      res.json({ mensaje: 'Cita confirmada exitosamente y notificación enviada al cliente.' });
    });
  });
});

// 3. CANCELACIÓN DE CITA (Notifica a Cliente y a Admin)
router.put('/:id/cancelar', (req, res) => {
  const citaId = req.params.id;
  const { motivo, cancelado_por } = req.body;

  const selectQuery = `
    SELECT c.*, s.nombre as servicio_nombre, u.nombre as cliente_nombre
    FROM citas c
    LEFT JOIN servicios s ON c.servicio_id = s.id
    LEFT JOIN usuarios u ON c.usuario_id = u.id
    WHERE c.id = ?
  `;

  db.get(selectQuery, [citaId], (err, cita) => {
    if (err || !cita) return res.status(404).json({ error: 'Cita no encontrada.' });

    db.run('UPDATE citas SET estado = "cancelada" WHERE id = ?', [citaId], async (updateErr) => {
      if (updateErr) return res.status(500).json({ error: 'Error al cancelar la cita.' });

      const clienteNombre = cita.cliente_nombre || cita.nombre_cliente || 'Cliente';

      // NOTIFICACIÓN AL CLIENTE (Cancelación)
      await crearNotificacion({
        usuario_id: cita.usuario_id,
        rol: 'cliente',
        tipo: 'cancelacion',
        titulo: '❌ Cita Cancelada',
        mensaje: `Tu cita para ${cita.servicio_nombre} el ${cita.fecha} a las ${cita.hora} ha sido cancelada.`,
        cita_id: citaId
      });

      // NOTIFICACIÓN AL ADMINISTRADOR (Cancelación)
      await crearNotificacion({
        usuario_id: null,
        rol: 'admin',
        tipo: 'cancelacion',
        titulo: '⚠️ Cita Cancelada',
        mensaje: `La cita de ${clienteNombre} para ${cita.servicio_nombre} el ${cita.fecha} a las ${cita.hora} fue cancelada.`,
        cita_id: citaId
      });

      res.json({ mensaje: 'Cita cancelada y notificaciones enviadas a cliente y admin.' });
    });
  });
});

// 4. REAGENDACIÓN DE CITA (Notifica a Cliente y a Admin)
router.put('/:id/reagendar', (req, res) => {
  const citaId = req.params.id;
  const { nueva_fecha, nueva_hora } = req.body;

  if (!nueva_fecha || !nueva_hora) {
    return res.status(400).json({ error: 'Se requiere nueva fecha y nueva hora.' });
  }

  const selectQuery = `
    SELECT c.*, s.nombre as servicio_nombre, u.nombre as cliente_nombre
    FROM citas c
    LEFT JOIN servicios s ON c.servicio_id = s.id
    LEFT JOIN usuarios u ON c.usuario_id = u.id
    WHERE c.id = ?
  `;

  db.get(selectQuery, [citaId], (err, cita) => {
    if (err || !cita) return res.status(404).json({ error: 'Cita no encontrada.' });

    const updateQuery = `
      UPDATE citas
      SET fecha = ?, hora = ?, notificado_24h = 0, notificado_12h = 0
      WHERE id = ?
    `;

    db.run(updateQuery, [nueva_fecha, nueva_hora, citaId], async (updateErr) => {
      if (updateErr) return res.status(500).json({ error: 'Error al reagendar la cita.' });

      const clienteNombre = cita.cliente_nombre || cita.nombre_cliente || 'Cliente';

      // NOTIFICACIÓN AL CLIENTE (Reagendación)
      await crearNotificacion({
        usuario_id: cita.usuario_id,
        rol: 'cliente',
        tipo: 'reagendacion',
        titulo: '🔄 Cita Reagendada con Éxito',
        mensaje: `Tu cita para ${cita.servicio_nombre} fue reagendada para el ${nueva_fecha} a las ${nueva_hora}.`,
        cita_id: citaId
      });

      // NOTIFICACIÓN AL ADMINISTRADOR (Reagendación)
      await crearNotificacion({
        usuario_id: null,
        rol: 'admin',
        tipo: 'reagendacion',
        titulo: '🔄 Cita Reagendada',
        mensaje: `La cita de ${clienteNombre} (${cita.servicio_nombre}) fue reagendada para el ${nueva_fecha} a las ${nueva_hora}.`,
        cita_id: citaId
      });

      res.json({ mensaje: 'Cita reagendada con éxito y alertas enviadas a ambas partes.' });
    });
  });
});

module.exports = router;