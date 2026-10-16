const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { db } = require('../config/database');
const citasRouter = require('./citas');   // se usa para avisar a los navegadores abiertos (tiempo real)

const ESTADOS = ['pendiente', 'confirmada', 'completada', 'cancelada'];
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const hmAMin = (h) => parseInt(h.slice(0, 2), 10) * 60 + parseInt(h.slice(3, 5), 10);
const fechaMin = (f) => parseInt(String(f).slice(11, 13), 10) * 60 + parseInt(String(f).slice(14, 16), 10);

function fechaValida(f) {
  if (!RE_FECHA.test(f || '')) return false;
  const d = new Date(f + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === f;
}

// Solo administradores. El rol se lee de la base de datos en cada petición (no del token),
// así que quitarle el rol a alguien o borrar su cuenta corta su acceso de inmediato.
const correosAdmin = () => (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

function soloAdmin(req, res, next) {
  const id = req.user && (req.user.id || req.user.id_usuario);
  const u = id ? db.prepare('SELECT id_usuario, nombre, apellido, email, rol FROM usuarios WHERE id_usuario = ?').get(id) : null;
  // Si el correo está en ADMIN_EMAILS (variable de Railway) la cuenta es administradora,
  // aunque se haya registrado después de que arrancó el servidor: no hace falta reiniciar.
  if (u && u.rol !== 'admin' && correosAdmin().includes(String(u.email).toLowerCase())) {
    db.prepare("UPDATE usuarios SET rol = 'admin' WHERE id_usuario = ?").run(u.id_usuario);
    u.rol = 'admin';
  }
  if (!u || u.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere permisos de administrador.' });
  }
  req.admin = u;
  next();
}

router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.use(authenticateToken, soloAdmin);

// ── Quién soy (la página lo usa para saber si la sesión sirve como administrador) ──
router.get('/yo', (req, res) => {
  res.json({ nombre: req.admin.nombre, apellido: req.admin.apellido, email: req.admin.email });
});

// ── CITAS ─────────────────────────────────────────────────
// /api/admin/citas?desde=2026-10-01&hasta=2026-10-31&estado=pendiente&orden=asc
router.get('/citas', (req, res) => {
  try {
    const { desde, hasta, estado, orden } = req.query;
    const where = [];
    const params = [];
    if (desde) {
      if (!fechaValida(desde)) return res.status(400).json({ error: 'Fecha "desde" inválida' });
      where.push('substr(c.fecha_cita, 1, 10) >= ?'); params.push(desde);
    }
    if (hasta) {
      if (!fechaValida(hasta)) return res.status(400).json({ error: 'Fecha "hasta" inválida' });
      where.push('substr(c.fecha_cita, 1, 10) <= ?'); params.push(hasta);
    }
    if (estado) {
      if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
      where.push('c.estado = ?'); params.push(estado);
    }
    const dir = orden === 'desc' ? 'DESC' : 'ASC';
    const filas = db.prepare(`
      SELECT c.id_cita, c.fecha_cita, c.estado, c.notas, c.fecha_solicitud,
             u.id_usuario, u.nombre, u.apellido, u.email, u.telefono,
             s.nombre AS servicio, s.precio AS servicio_precio, s.precio_max AS servicio_precio_max, s.duracion_minutos
      FROM citas c
      LEFT JOIN usuarios u ON u.id_usuario = c.id_usuario
      LEFT JOIN servicios s ON s.id_servicio = c.id_servicio
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY c.fecha_cita ${dir}
      LIMIT 500
    `).all(...params);
    res.json(filas);
  } catch (error) {
    console.error('admin/citas:', error);
    res.status(500).json({ error: 'Error al obtener las citas' });
  }
});

// Cambiar el estado de una cita: pendiente, confirmada, completada o cancelada
router.put('/citas/:id/estado', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { estado } = req.body || {};
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Cita inválida' });
    if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });

    const cita = db.prepare('SELECT id_cita, fecha_cita FROM citas WHERE id_cita = ?').get(id);
    if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });

    db.prepare('UPDATE citas SET estado = ? WHERE id_cita = ?').run(estado, id);
    citasRouter.notificar(String(cita.fecha_cita).slice(0, 10));
    res.json({ message: 'Estado actualizado', estado });
  } catch (error) {
    console.error('admin/citas/estado:', error);
    res.status(500).json({ error: 'Error al actualizar la cita' });
  }
});

// ── CLIENTES ──────────────────────────────────────────────
router.get('/clientes', (req, res) => {
  try {
    const clientes = db.prepare(`
      SELECT u.id_usuario, u.nombre, u.apellido, u.email, u.telefono, u.rol, u.fecha_creacion,
             (SELECT COUNT(*) FROM citas c WHERE c.id_usuario = u.id_usuario) AS total_citas
      FROM usuarios u
      ORDER BY u.fecha_creacion DESC, u.id_usuario DESC
    `).all();
    res.json(clientes);
  } catch (error) {
    console.error('admin/clientes:', error);
    res.status(500).json({ error: 'Error al obtener los clientes' });
  }
});

// Borrar la cuenta de un cliente (cuando lo solicita): también sus citas y su reseña
router.delete('/clientes/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Cliente inválido' });
    if (id === req.admin.id_usuario) {
      return res.status(400).json({ error: 'No puedes borrar tu propia cuenta de administrador' });
    }
    const cliente = db.prepare('SELECT id_usuario, rol FROM usuarios WHERE id_usuario = ?').get(id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (cliente.rol === 'admin') {
      return res.status(403).json({ error: 'No se puede borrar una cuenta de administrador' });
    }

    // Días con citas activas de este cliente: se liberan horarios, hay que avisar a los navegadores abiertos
    const fechas = db.prepare("SELECT DISTINCT substr(fecha_cita, 1, 10) AS f FROM citas WHERE id_usuario = ? AND estado != 'cancelada'")
      .all(id).map(r => r.f);

    const borrar = db.transaction(() => {
      const citas = db.prepare('DELETE FROM citas WHERE id_usuario = ?').run(id).changes;
      const resenas = db.prepare('DELETE FROM resenas WHERE id_usuario = ?').run(id).changes;
      db.prepare('DELETE FROM notificaciones WHERE id_usuario = ?').run(id);
      db.prepare('DELETE FROM push_suscripciones WHERE id_usuario = ?').run(id);
      db.prepare('DELETE FROM usuarios WHERE id_usuario = ?').run(id);
      return { citas, resenas };
    });
    const r = borrar();
    fechas.forEach(f => citasRouter.notificar(f));

    res.json({ message: 'Cuenta eliminada', citas_borradas: r.citas, resenas_borradas: r.resenas });
  } catch (error) {
    console.error('admin/clientes delete:', error);
    res.status(500).json({ error: 'Error al borrar la cuenta' });
  }
});

// ── PRECIOS ───────────────────────────────────────────────
router.get('/servicios', (req, res) => {
  try {
    res.json(db.prepare(`
      SELECT id_servicio, nombre, categoria, precio, precio_max, duracion_minutos, activo
      FROM servicios WHERE activo = 1 ORDER BY categoria, id_servicio
    `).all());
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los servicios' });
  }
});

router.put('/servicios/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Servicio inválido' });

    const precio = Number(req.body && req.body.precio);
    if (!Number.isFinite(precio) || precio < 0 || precio > 100000) {
      return res.status(400).json({ error: 'Precio inválido' });
    }
    let precioMax = req.body.precio_max;
    if (precioMax === '' || precioMax === null || precioMax === undefined) {
      precioMax = null;
    } else {
      precioMax = Number(precioMax);
      if (!Number.isFinite(precioMax) || precioMax < precio || precioMax > 100000) {
        return res.status(400).json({ error: 'El precio máximo debe ser mayor o igual al precio' });
      }
    }

    const r = db.prepare('UPDATE servicios SET precio = ?, precio_max = ? WHERE id_servicio = ?').run(precio, precioMax, id);
    if (!r.changes) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json({ message: 'Precio actualizado', precio, precio_max: precioMax });
  } catch (error) {
    console.error('admin/servicios:', error);
    res.status(500).json({ error: 'Error al actualizar el precio' });
  }
});

// ── BLOQUEOS (días y horarios cerrados) ───────────────────
router.get('/bloqueos', (req, res) => {
  try {
    const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    res.json(db.prepare(`
      SELECT id_bloqueo, fecha, hora_inicio, hora_fin, motivo
      FROM bloqueos WHERE fecha >= ? ORDER BY fecha, hora_inicio
    `).all(ayer));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los bloqueos' });
  }
});

router.post('/bloqueos', (req, res) => {
  try {
    const { fecha, hora_inicio, hora_fin } = req.body || {};
    const motivo = typeof req.body.motivo === 'string' ? req.body.motivo.trim().slice(0, 200) : '';
    if (!fechaValida(fecha)) return res.status(400).json({ error: 'Fecha inválida' });

    // Sin horas = día completo; con horas = rango (se necesitan las dos)
    const conHoras = !!(hora_inicio || hora_fin);
    let ini = 0, fin = 1439;
    if (conHoras) {
      if (!RE_HORA.test(hora_inicio || '') || !RE_HORA.test(hora_fin || '')) {
        return res.status(400).json({ error: 'Indica la hora de inicio y la de fin (formato HH:MM)' });
      }
      ini = hmAMin(hora_inicio); fin = hmAMin(hora_fin);
      if (ini >= fin) return res.status(400).json({ error: 'La hora de inicio debe ser anterior a la de fin' });
    }

    // Citas activas que ya están dentro de ese rango (no se cancelan solas: se avisa al dueño)
    const citas = db.prepare(`
      SELECT c.fecha_cita, s.duracion_minutos
      FROM citas c LEFT JOIN servicios s ON s.id_servicio = c.id_servicio
      WHERE substr(c.fecha_cita, 1, 10) = ? AND c.estado != 'cancelada'
    `).all(fecha);
    const afectadas = citas.filter(c => {
      const i = fechaMin(c.fecha_cita);
      const f = i + (c.duracion_minutos || 60);
      return i < fin && f > ini;
    }).length;

    const r = db.prepare('INSERT INTO bloqueos (fecha, hora_inicio, hora_fin, motivo) VALUES (?, ?, ?, ?)')
      .run(fecha, conHoras ? hora_inicio : null, conHoras ? hora_fin : null, motivo || null);
    citasRouter.notificar(fecha);
    res.status(201).json({ message: 'Bloqueo creado', id_bloqueo: Number(r.lastInsertRowid), citas_afectadas: afectadas });
  } catch (error) {
    console.error('admin/bloqueos:', error);
    res.status(500).json({ error: 'Error al crear el bloqueo' });
  }
});

router.delete('/bloqueos/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bloqueo inválido' });
    const b = db.prepare('SELECT fecha FROM bloqueos WHERE id_bloqueo = ?').get(id);
    if (!b) return res.status(404).json({ error: 'Bloqueo no encontrado' });
    db.prepare('DELETE FROM bloqueos WHERE id_bloqueo = ?').run(id);
    citasRouter.notificar(b.fecha);
    res.json({ message: 'Bloqueo eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar el bloqueo' });
  }
});

module.exports = router;
