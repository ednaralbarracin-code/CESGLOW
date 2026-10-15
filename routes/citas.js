const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const { db } = require('../config/database');
const notificaciones = require('../services/notificaciones');

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

// ── Utilidades de horario (minutos desde las 00:00) ──
const aMin = (f) => parseInt(f.substr(11, 2), 10) * 60 + parseInt(f.substr(14, 2), 10);
const aHora = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

// Intervalos ocupados de un día (citas no canceladas, según la duración de cada servicio)
const hmAMin = (h) => parseInt(h.substr(0, 2), 10) * 60 + parseInt(h.substr(3, 2), 10);

// Intervalos no disponibles de un día: citas no canceladas + bloqueos del administrador.
// (LEFT JOIN: una cita cuyo servicio ya no existe sigue ocupando su horario, 60 min por defecto)
function obtenerIntervalos(fecha) {
  const filas = db.prepare(`
    SELECT c.fecha_cita, s.duracion_minutos
    FROM citas c LEFT JOIN servicios s ON c.id_servicio = s.id_servicio
    WHERE substr(c.fecha_cita, 1, 10) = ? AND c.estado != 'cancelada'
  `).all(fecha);
  const citas = filas.map(f => {
    const inicio = aMin(f.fecha_cita);
    return { inicio, fin: inicio + (f.duracion_minutos || 60) };
  });
  // Bloqueo sin horas = día completo (00:00 a 23:59)
  const bloqueos = db.prepare('SELECT hora_inicio, hora_fin FROM bloqueos WHERE fecha = ?').all(fecha).map(b =>
    b.hora_inicio && b.hora_fin ? { inicio: hmAMin(b.hora_inicio), fin: hmAMin(b.hora_fin) } : { inicio: 0, fin: 1439 }
  );
  return citas.concat(bloqueos);
}

// ── Tiempo real (Server-Sent Events) ──
// Cada navegador abierto se conecta aquí y recibe un aviso cuando alguien agenda o cancela una cita.
const clientes = new Set();

router.get('/eventos', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 3000\n\n');
  clientes.add(res);
  req.on('close', () => clientes.delete(res));
});

// Señal periódica para que el proxy no cierre conexiones inactivas
setInterval(() => clientes.forEach(r => r.write(': ping\n\n')), 25000).unref();

function notificar(fecha) {
  const msg = `event: citas\ndata: ${JSON.stringify({ fecha })}\n\n`;
  clientes.forEach(r => r.write(msg));
}

// Horarios ocupados de un día (público): /api/citas/ocupadas?fecha=2025-01-31
router.get('/ocupadas', (req, res) => {
  try {
    const { fecha } = req.query;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return res.status(400).json({ error: 'Fecha inválida' });
    res.json(obtenerIntervalos(fecha).map(i => ({ inicio: aHora(i.inicio), fin: aHora(i.fin) })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener horarios ocupados' });
  }
});

// Obtener servicios disponibles
router.get('/servicios', (req, res) => {
  try {
    const servicios = db.prepare('SELECT * FROM servicios WHERE activo = 1').all();
    res.json(servicios);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

// Crear una cita (uno o varios servicios: se agendan uno tras otro desde la hora elegida)
router.post('/', verificarToken, (req, res) => {
  try {
    const { id_servicio, ids_servicio, fecha_cita, notas } = req.body;
    const id_usuario = req.user.id || req.user.id_usuario;

    const lista = Array.isArray(ids_servicio) && ids_servicio.length ? ids_servicio : (id_servicio ? [id_servicio] : []);
    const ids = [...new Set(lista.map(String))];

    if (!ids.length || !fecha_cita) {
      return res.status(400).json({ error: 'Servicio y fecha son obligatorios' });
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(fecha_cita)) {
      return res.status(400).json({ error: 'Fecha inválida' });
    }

    const servicios = ids.map(id => db.prepare('SELECT * FROM servicios WHERE id_servicio = ? AND activo = 1').get(id));
    if (servicios.some(s => !s)) {
      return res.status(400).json({ error: 'Servicio no válido' });
    }

    const fecha = fecha_cita.substr(0, 10);
    let inicio = aMin(fecha_cita);
    const nuevos = servicios.map(s => {
      const dur = s.duracion_minutos || 60;
      const item = { servicio: s, inicio, fin: inicio + dur };
      inicio += dur;
      return item;
    });

    // Verificar que ningún tramo choque con citas existentes
    const ocupados = obtenerIntervalos(fecha);
    if (nuevos.some(n => ocupados.some(o => n.inicio < o.fin && n.fin > o.inicio))) {
      return res.status(400).json({ error: 'Ese horario ya no está disponible. Elige otro.' });
    }

    const insertar = db.prepare(`
      INSERT INTO citas (id_usuario, id_servicio, fecha_cita, estado, notas)
      VALUES (?, ?, ?, 'pendiente', ?)
    `);
    const crear = db.transaction(() => nuevos.map(n =>
      insertar.run(id_usuario, n.servicio.id_servicio, `${fecha}T${aHora(n.inicio)}:00`, notas || null).lastInsertRowid
    ));
    const ids_cita = crear();
    notificar(fecha);

    // Avisos (campanita, correo, push, WhatsApp) al cliente y al administrador. No bloquea la respuesta.
    notificaciones.notificarCitaAgendada({
      id_usuario, fecha, hora: aHora(nuevos[0].inicio), notas,
      servicios: servicios.map(s => ({ nombre: s.nombre, precio: s.precio })), citaIds: ids_cita
    }).catch(e => console.error('notificaciones:', e.message));

    res.status(201).json({ message: '¡Cita agendada exitosamente!', id_cita: ids_cita[0], ids_cita });
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
    if (!['pendiente', 'confirmada'].includes(cita.estado)) {
      return res.status(400).json({ error: 'Esta cita ya no se puede cancelar' });
    }

    db.prepare("UPDATE citas SET estado = 'cancelada' WHERE id_cita = ?").run(id);
    notificar(String(cita.fecha_cita).substr(0, 10));
    res.json({ message: 'Cita cancelada correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al cancelar la cita' });
  }
});

// El panel de administración usa esto para avisar a los navegadores abiertos cuando cambia la agenda
router.notificar = notificar;

module.exports = router;
