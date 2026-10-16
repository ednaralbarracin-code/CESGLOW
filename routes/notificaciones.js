const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { db } = require('../config/database');

// Todo requiere sesión iniciada con una cuenta que siga existiendo
router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.use(authenticateToken, (req, res, next) => {
  const id = req.user && (req.user.id || req.user.id_usuario);
  const u = id ? db.prepare('SELECT id_usuario FROM usuarios WHERE id_usuario = ?').get(id) : null;
  if (!u) return res.status(403).json({ error: 'Tu cuenta no está activa. Inicia sesión con una cuenta válida.' });
  req.uid = u.id_usuario;
  next();
});

// Mis notificaciones (las 30 más recientes) y cuántas no he leído
router.get('/', (req, res) => {
  try {
    const items = db.prepare(`
      SELECT id_notificacion, tipo, titulo, mensaje, titulo_en, mensaje_en, id_cita, leida, fecha_creacion
      FROM notificaciones WHERE id_usuario = ?
      ORDER BY id_notificacion DESC LIMIT 30
    `).all(req.uid);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM notificaciones WHERE id_usuario = ? AND leida = 0').get(req.uid);
    res.json({ no_leidas: n, items });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener las notificaciones' });
  }
});

router.put('/leer-todas', (req, res) => {
  try {
    db.prepare('UPDATE notificaciones SET leida = 1 WHERE id_usuario = ? AND leida = 0').run(req.uid);
    res.json({ message: 'Listo' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar las notificaciones' });
  }
});

// Solo se pueden marcar las propias
router.put('/:id/leer', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Notificación inválida' });
    const r = db.prepare('UPDATE notificaciones SET leida = 1 WHERE id_notificacion = ? AND id_usuario = ?').run(id, req.uid);
    if (!r.changes) return res.status(404).json({ error: 'Notificación no encontrada' });
    res.json({ message: 'Listo' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar la notificación' });
  }
});

// ── Push ──
// Clave pública que el navegador necesita para suscribirse (null = push no configurado en el servidor)
router.get('/push/clave', (req, res) => {
  const { pushActivo } = require('../services/notificaciones');
  res.json({ clave: pushActivo() ? process.env.VAPID_PUBLIC_KEY.trim() : null });
});

router.post('/push/suscribir', (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    const idioma = (req.body && req.body.idioma) === 'en' ? 'en' : 'es';
    const p256dh = keys && keys.p256dh, auth = keys && keys.auth;
    if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 800 ||
        typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 200 || auth.length > 100 || !p256dh || !auth) {
      return res.status(400).json({ error: 'Suscripción inválida' });
    }
    db.prepare(`
      INSERT INTO push_suscripciones (id_usuario, endpoint, p256dh, auth, idioma) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET id_usuario = excluded.id_usuario, p256dh = excluded.p256dh, auth = excluded.auth, idioma = excluded.idioma
    `).run(req.uid, endpoint, p256dh, auth, idioma);
    // Máximo 10 dispositivos por persona: se conservan los más recientes
    db.prepare(`
      DELETE FROM push_suscripciones WHERE id_usuario = ? AND id NOT IN
        (SELECT id FROM push_suscripciones WHERE id_usuario = ? ORDER BY id DESC LIMIT 10)
    `).run(req.uid, req.uid);
    res.status(201).json({ message: 'Avisos activados en este dispositivo' });
  } catch (error) {
    res.status(500).json({ error: 'Error al activar los avisos' });
  }
});

router.delete('/push/suscribir', (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (typeof endpoint !== 'string') return res.status(400).json({ error: 'Suscripción inválida' });
    db.prepare('DELETE FROM push_suscripciones WHERE endpoint = ? AND id_usuario = ?').run(endpoint, req.uid);
    res.json({ message: 'Avisos desactivados en este dispositivo' });
  } catch (error) {
    res.status(500).json({ error: 'Error al desactivar los avisos' });
  }
});

module.exports = router;
