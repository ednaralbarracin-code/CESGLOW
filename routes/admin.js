const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { db } = require('../config/database');
const citasRouter = require('./citas');   // se usa para avisar a los navegadores abiertos (tiempo real)
const agenda = require('../services/agenda');
const notificaciones = require('../services/notificaciones');

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
    // Queda en los registros (logs) de Railway para saber por qué no entró
    if (u) {
      const n = correosAdmin().length;
      console.warn(`[admin] acceso denegado a ${u.email}: ADMIN_EMAILS ${n ? 'tiene ' + n + ' correo(s) y ese no está en la lista' : 'está vacío o no existe en este servicio'}`);
    }
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

// Cambiar el estado de una cita: pendiente, confirmada, completada o cancelada.
// El cambio se aplica a toda la visita (si el cliente reservó varios servicios seguidos, se mueven juntos)
// y se avisa al cliente cuando la cita se confirma o se cancela.
router.put('/citas/:id/estado', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { estado } = req.body || {};
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Cita inválida' });
    if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });

    const cita = db.prepare('SELECT id_cita, id_usuario, fecha_cita, estado FROM citas WHERE id_cita = ?').get(id);
    if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });

    const v = agenda.visitaDe(id, ['pendiente', 'confirmada', 'completada']);
    let filas = v && v.filas.length ? v.filas : [{ id_cita: id, estado: cita.estado, servicio: null }];
    if (estado === 'cancelada') filas = filas.filter(f => f.estado === 'pendiente' || f.estado === 'confirmada');   // no se cancela lo ya completado
    const actualizar = db.prepare('UPDATE citas SET estado = ? WHERE id_cita = ?');
    db.transaction(() => filas.forEach(f => actualizar.run(estado, f.id_cita)))();
    citasRouter.notificar(String(cita.fecha_cita).slice(0, 10));

    const antes = cita.estado;
    const conServicios = filas.length && filas.every(f => f.servicio);
    if (conServicios && ((estado === 'confirmada' && antes === 'pendiente') || (estado === 'cancelada' && (antes === 'pendiente' || antes === 'confirmada')))) {
      notificaciones.notificarCambioCita(estado === 'confirmada' ? 'confirmada' : 'cancelada', {
        id_usuario: cita.id_usuario, por: 'admin', abonoPagado: antes === 'confirmada',
        servicios: filas.map(f => ({ nombre: f.servicio })), citaIds: filas.map(f => f.id_cita),
        fecha: String(filas[0].fecha_cita).slice(0, 10), hora: String(filas[0].fecha_cita).slice(11, 16)
      }).catch(e => console.error('notificaciones:', e.message));
    }
    res.json({ message: 'Estado actualizado', estado, citas_actualizadas: filas.length });
  } catch (error) {
    console.error('admin/citas/estado:', error);
    res.status(500).json({ error: 'Error al actualizar la cita' });
  }
});

// Reprogramar una visita completa a otra fecha y hora (el cliente recibe el aviso)
router.put('/citas/:id/reprogramar', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Cita inválida' });
    const { fecha, hora } = req.body || {};
    const r = agenda.reprogramarVisita(id, fecha, hora);
    if (r.error) return res.status(r.status).json({ error: r.error });
    citasRouter.notificar(r.datos.fechaAnterior);
    citasRouter.notificar(r.datos.fecha);
    notificaciones.notificarCambioCita('reprogramada', Object.assign({ por: 'admin' }, r.datos))
      .catch(e => console.error('notificaciones:', e.message));
    res.json({ message: 'Cita reprogramada', fecha: r.datos.fecha, hora: r.datos.hora, citas_movidas: r.datos.citaIds.length });
  } catch (error) {
    console.error('admin/citas/reprogramar:', error);
    res.status(500).json({ error: 'Error al reprogramar la cita' });
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

// ── SERVICIOS Y PRECIOS ───────────────────────────────────
// Cada servicio tiene su nombre (y descripción y categoría) en español y en inglés.
const limpiarTexto = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
const COLUMNAS_SERVICIO = 'id_servicio, nombre, nombre_en, descripcion, descripcion_en, categoria, categoria_en, precio, precio_max, duracion_minutos, activo';

function validarServicio(d) {
  const nombre = limpiarTexto(d.nombre, 101);
  if (!nombre) return { error: 'Escribe el nombre del servicio' };
  if (nombre.length > 100) return { error: 'El nombre es demasiado largo (máximo 100 letras)' };
  const nombre_en = limpiarTexto(d.nombre_en, 101);
  if (nombre_en.length > 100) return { error: 'El nombre en inglés es demasiado largo (máximo 100 letras)' };
  const descripcion = limpiarTexto(d.descripcion, 201), descripcion_en = limpiarTexto(d.descripcion_en, 201);
  if (descripcion.length > 200 || descripcion_en.length > 200) return { error: 'La descripción es demasiado larga (máximo 200 letras)' };
  const categoria = limpiarTexto(d.categoria, 61) || 'General', categoria_en = limpiarTexto(d.categoria_en, 61);
  if (categoria.length > 60 || categoria_en.length > 60) return { error: 'La categoría es demasiado larga (máximo 60 letras)' };

  if (d.precio === '' || d.precio == null) return { error: 'Precio inválido' };
  const precio = Number(d.precio);
  if (!Number.isFinite(precio) || precio < 0 || precio > 100000) return { error: 'Precio inválido' };
  let precio_max = null;
  if (!(d.precio_max === '' || d.precio_max == null)) {
    precio_max = Number(d.precio_max);
    if (!Number.isFinite(precio_max) || precio_max < precio || precio_max > 100000) {
      return { error: 'El precio máximo debe ser mayor o igual al precio' };
    }
  }
  const duracion = (d.duracion_minutos === '' || d.duracion_minutos == null) ? 60 : Number(d.duracion_minutos);
  if (!Number.isInteger(duracion) || duracion < 5 || duracion > 600) return { error: 'La duración debe ser de 5 a 600 minutos' };
  const activo = d.activo == null ? 1 : (Number(d.activo) ? 1 : 0);

  return { v: {
    nombre, nombre_en: nombre_en || null, descripcion, descripcion_en: descripcion_en || null,
    categoria, categoria_en: categoria_en || null, precio, precio_max, duracion_minutos: duracion, activo
  } };
}

// Si la categoría ya existe se usa tal cual está escrita (y su inglés), para no crear "Faciales" y "faciales" por separado
function unificarCategoria(v) {
  const c = db.prepare('SELECT categoria, categoria_en FROM servicios WHERE lower(categoria) = lower(?) ORDER BY (categoria_en IS NULL OR categoria_en = \'\'), id_servicio LIMIT 1').get(v.categoria);
  if (c) {
    v.categoria = c.categoria;
    if (c.categoria_en) v.categoria_en = c.categoria_en;
    else if (v.categoria_en) db.prepare("UPDATE servicios SET categoria_en = ? WHERE categoria = ? AND (categoria_en IS NULL OR categoria_en = '')").run(v.categoria_en, v.categoria);
  }
  return v;
}

router.get('/servicios', (req, res) => {
  try {
    res.json(db.prepare(`SELECT ${COLUMNAS_SERVICIO} FROM servicios ORDER BY activo DESC, categoria, id_servicio`).all());
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los servicios' });
  }
});

// Agregar un servicio nuevo
router.post('/servicios', (req, res) => {
  try {
    const r = validarServicio(req.body || {});
    if (r.error) return res.status(400).json({ error: r.error });
    const v = unificarCategoria(r.v);

    const igual = db.prepare('SELECT id_servicio, activo FROM servicios WHERE lower(nombre) = lower(?) ORDER BY activo DESC, id_servicio LIMIT 1').get(v.nombre);
    if (igual && igual.activo) return res.status(409).json({ error: 'Ya existe un servicio con ese nombre' });

    const campos = [v.nombre, v.nombre_en, v.descripcion, v.descripcion_en, v.categoria, v.categoria_en, v.precio, v.precio_max, v.duracion_minutos];
    if (igual) {   // estaba oculto: se vuelve a mostrar con los datos nuevos (sus citas viejas siguen ligadas al mismo servicio)
      db.prepare(`UPDATE servicios SET nombre = ?, nombre_en = ?, descripcion = ?, descripcion_en = ?, categoria = ?, categoria_en = ?,
                  precio = ?, precio_max = ?, duracion_minutos = ?, activo = 1 WHERE id_servicio = ?`).run(...campos, igual.id_servicio);
      return res.json({ message: 'Servicio restaurado', id_servicio: igual.id_servicio, restaurado: true });
    }
    const ins = db.prepare(`INSERT INTO servicios (nombre, nombre_en, descripcion, descripcion_en, categoria, categoria_en, precio, precio_max, duracion_minutos, activo)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(...campos);
    res.status(201).json({ message: 'Servicio agregado', id_servicio: Number(ins.lastInsertRowid) });
  } catch (error) {
    console.error('admin/servicios POST:', error);
    res.status(500).json({ error: 'Error al agregar el servicio' });
  }
});

// Editar un servicio: precios, nombres (español / inglés), categoría, duración, o ocultarlo/mostrarlo (activo)
router.put('/servicios/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Servicio inválido' });
    const actual = db.prepare('SELECT * FROM servicios WHERE id_servicio = ?').get(id);
    if (!actual) return res.status(404).json({ error: 'Servicio no encontrado' });

    const b = req.body || {};
    const mezcla = {};
    ['nombre', 'nombre_en', 'descripcion', 'descripcion_en', 'categoria', 'categoria_en', 'precio', 'precio_max', 'duracion_minutos', 'activo']
      .forEach(k => { mezcla[k] = Object.prototype.hasOwnProperty.call(b, k) ? b[k] : actual[k]; });
    const r = validarServicio(mezcla);
    if (r.error) return res.status(400).json({ error: r.error });
    const v = unificarCategoria(r.v);

    if (v.activo) {   // no puede haber dos servicios activos con el mismo nombre
      const otro = db.prepare('SELECT id_servicio FROM servicios WHERE lower(nombre) = lower(?) AND activo = 1 AND id_servicio != ?').get(v.nombre, id);
      if (otro) return res.status(409).json({ error: 'Ya existe un servicio con ese nombre' });
    }
    db.prepare(`UPDATE servicios SET nombre = ?, nombre_en = ?, descripcion = ?, descripcion_en = ?, categoria = ?, categoria_en = ?,
                precio = ?, precio_max = ?, duracion_minutos = ?, activo = ? WHERE id_servicio = ?`)
      .run(v.nombre, v.nombre_en, v.descripcion, v.descripcion_en, v.categoria, v.categoria_en, v.precio, v.precio_max, v.duracion_minutos, v.activo, id);
    res.json({ message: 'Servicio actualizado', precio: v.precio, precio_max: v.precio_max, servicio: db.prepare(`SELECT ${COLUMNAS_SERVICIO} FROM servicios WHERE id_servicio = ?`).get(id) });
  } catch (error) {
    console.error('admin/servicios PUT:', error);
    res.status(500).json({ error: 'Error al actualizar el servicio' });
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
