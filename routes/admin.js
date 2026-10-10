const express = require('express');
const router = express.Router();
const { db, userQueries } = require('../config/database');
const { authenticateToken, isAdmin, generateToken } = require('../middleware/auth');
const citas = require('./citas');

const aMin = (f) => parseInt(f.substr(11, 2), 10) * 60 + parseInt(f.substr(14, 2), 10);
const aHora = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const err = (res, code, msg) => res.status(code).json({ error: msg });

// Login del administrador (solo cuentas con rol admin)
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = email && userQueries.findByEmail(String(email).trim().toLowerCase());
  if (!u || u.rol !== 'admin' || !userQueries.verifyPassword(String(password || ''), u.password_hash)) {
    return err(res, 401, 'Correo o contraseña incorrectos');
  }
  res.json({
    token: generateToken(u),
    nombre: u.nombre,
    cambiar: userQueries.verifyPassword('admin123', u.password_hash) // aún usa la clave de fábrica
  });
});

// Todo lo de abajo exige estar logueado como admin
router.use(authenticateToken, isAdmin);

// ── CITAS ──
router.get('/citas', (req, res) => {
  res.json(db.prepare(`
    SELECT c.id_cita, c.fecha_cita, c.estado, c.notas, s.nombre AS servicio, s.precio, s.duracion_minutos,
           u.nombre, u.apellido, u.telefono, u.email
    FROM citas c
    JOIN servicios s ON s.id_servicio = c.id_servicio
    JOIN usuarios u ON u.id_usuario = c.id_usuario
    ORDER BY c.fecha_cita DESC
  `).all());
});

// Confirmar, cancelar, completar y/o reagendar
router.put('/citas/:id', (req, res) => {
  const c = db.prepare(`
    SELECT c.*, s.duracion_minutos AS dur FROM citas c
    JOIN servicios s ON s.id_servicio = c.id_servicio WHERE c.id_cita = ?`).get(req.params.id);
  if (!c) return err(res, 404, 'Cita no encontrada');

  const { estado, fecha_cita } = req.body || {};
  if (estado && !['pendiente', 'confirmada', 'cancelada', 'completada'].includes(estado)) {
    return err(res, 400, 'Estado no válido');
  }
  let nueva = c.fecha_cita;
  if (fecha_cita) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(fecha_cita)) return err(res, 400, 'Fecha u hora no válida');
    const dia = fecha_cita.substr(0, 10);
    const ini = aMin(fecha_cita);
    const fin = ini + (c.dur || 60);
    const choca = db.prepare(`
      SELECT c2.fecha_cita, s.duracion_minutos FROM citas c2
      JOIN servicios s ON s.id_servicio = c2.id_servicio
      WHERE substr(c2.fecha_cita, 1, 10) = ? AND c2.estado != 'cancelada' AND c2.id_cita != ?
    `).all(dia, c.id_cita).some(o => {
      const i = aMin(o.fecha_cita);
      return ini < i + (o.duracion_minutos || 60) && fin > i;
    });
    if (choca) return err(res, 400, 'Ya hay otra cita en ese horario. Elige otra hora.');
    nueva = `${dia}T${aHora(ini)}:00`;
  }
  db.prepare('UPDATE citas SET fecha_cita = ?, estado = ? WHERE id_cita = ?').run(nueva, estado || c.estado, c.id_cita);
  citas.notificar(String(c.fecha_cita).substr(0, 10));
  citas.notificar(nueva.substr(0, 10));
  res.json({ message: 'Cita actualizada' });
});

// ── SERVICIOS (precios y duración) ──
router.get('/servicios', (req, res) => {
  res.json(db.prepare('SELECT * FROM servicios ORDER BY id_servicio').all());
});

router.post('/servicios', (req, res) => {
  const { nombre, nombre_en, categoria, precio, precio_max, duracion_minutos } = req.body || {};
  const n = String(nombre || '').trim().slice(0, 80);
  const en = String(nombre_en || '').trim().slice(0, 80);
  const p = Number(precio), d = parseInt(duracion_minutos, 10);
  const pm = precio_max === '' || precio_max == null ? null : Number(precio_max);
  if (!n) return err(res, 400, 'Escribe el nombre del servicio');
  if (!en) return err(res, 400, 'Escribe el nombre del servicio en inglés');
  if (!db.prepare('SELECT 1 FROM servicios WHERE categoria = ?').get(categoria)) return err(res, 400, 'Elige una categoría de la lista');
  if (db.prepare('SELECT 1 FROM servicios WHERE lower(nombre) = lower(?)').get(n)) return err(res, 400, 'Ya existe un servicio con ese nombre');
  if (!(p >= 0) || precio === '' || !(d > 0) || (pm !== null && !(pm >= p))) return err(res, 400, 'Revisa el precio y la duración');
  db.prepare("INSERT INTO servicios (nombre, nombre_en, descripcion, precio, precio_max, categoria, duracion_minutos, activo) VALUES (?, ?, '', ?, ?, ?, ?, 1)")
    .run(n, en, p, pm, categoria, d);
  res.status(201).json({ message: 'Servicio agregado' });
});

router.put('/servicios/:id', (req, res) => {
  const { precio, precio_max, duracion_minutos, activo, nombre_en } = req.body || {};
  const en = typeof nombre_en === 'string' ? nombre_en.trim().slice(0, 80) : null;
  if (en === '') return err(res, 400, 'El nombre en inglés no puede quedar vacío');
  const p = Number(precio), d = parseInt(duracion_minutos, 10);
  const pm = precio_max === '' || precio_max == null ? null : Number(precio_max);
  if (!(p >= 0) || !(d > 0) || (pm !== null && !(pm >= p))) return err(res, 400, 'Revisa el precio y la duración');
  const r = db.prepare('UPDATE servicios SET precio = ?, precio_max = ?, duracion_minutos = ?, activo = ?, nombre_en = COALESCE(?, nombre_en) WHERE id_servicio = ?')
    .run(p, pm, d, activo ? 1 : 0, en, req.params.id);
  if (!r.changes) return err(res, 404, 'Servicio no encontrado');
  res.json({ message: 'Servicio actualizado' });
});

// ── CLIENTES ──
router.get('/clientes', (req, res) => {
  res.json(db.prepare(`
    SELECT u.id_usuario, u.nombre, u.apellido, u.email, u.telefono, u.fecha_creacion,
           COUNT(c.id_cita) AS total_citas, MAX(c.fecha_cita) AS ultima_cita
    FROM usuarios u LEFT JOIN citas c ON c.id_usuario = u.id_usuario
    WHERE u.rol = 'cliente' GROUP BY u.id_usuario ORDER BY u.fecha_creacion DESC
  `).all());
});

// Eliminar un cliente (se borran también sus citas y reseñas)
router.delete('/clientes/:id', (req, res) => {
  const u = db.prepare("SELECT id_usuario FROM usuarios WHERE id_usuario = ? AND rol = 'cliente'").get(req.params.id);
  if (!u) return err(res, 404, 'Cliente no encontrado');
  const dias = db.prepare('SELECT DISTINCT substr(fecha_cita, 1, 10) AS d FROM citas WHERE id_usuario = ?').all(u.id_usuario);
  db.transaction(() => {
    db.prepare('DELETE FROM resenas WHERE id_usuario = ?').run(u.id_usuario);
    db.prepare('DELETE FROM citas WHERE id_usuario = ?').run(u.id_usuario);
    db.prepare('DELETE FROM usuarios WHERE id_usuario = ?').run(u.id_usuario);
  })();
  dias.forEach(x => citas.notificar(x.d));
  res.json({ message: 'Cliente eliminado' });
});

// ── CAMBIAR CONTRASEÑA ──
router.put('/password', (req, res) => {
  const { actual, nueva } = req.body || {};
  const u = db.prepare('SELECT * FROM usuarios WHERE id_usuario = ?').get(req.user.id);
  if (!u || !userQueries.verifyPassword(String(actual || ''), u.password_hash)) return err(res, 400, 'La contraseña actual no es correcta');
  if (String(nueva || '').length < 8) return err(res, 400, 'La nueva contraseña debe tener al menos 8 caracteres');
  db.prepare('UPDATE usuarios SET password_hash = ? WHERE id_usuario = ?')
    .run(require('bcryptjs').hashSync(String(nueva), 10), u.id_usuario);
  res.json({ message: 'Contraseña cambiada' });
});

module.exports = router;
