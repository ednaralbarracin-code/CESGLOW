const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

// DB_PATH permite guardar la base en un Volume (si no, se borra en cada despliegue)
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'beauty_care.db');
const db = new Database(dbPath);

// Inicializar la base de datos con la estructura del archivo SQL
function initializeDatabase() {
  // Crear tabla de usuarios si no existe
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      telefono TEXT,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'cliente',
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Crear tabla de servicios
  db.exec(`
    CREATE TABLE IF NOT EXISTS servicios (
      id_servicio INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      precio REAL NOT NULL,
      precio_max REAL,
      categoria TEXT DEFAULT 'General',
      duracion_minutos INTEGER,
      activo INTEGER DEFAULT 1,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Agregar columnas nuevas si no existen (para bases de datos existentes)
  try { db.exec('ALTER TABLE servicios ADD COLUMN categoria TEXT DEFAULT "General"'); } catch(e) {}
  try { db.exec('ALTER TABLE servicios ADD COLUMN precio_max REAL'); } catch(e) {}

  // Crear tabla de citas
  db.exec(`
    CREATE TABLE IF NOT EXISTS citas (
      id_cita INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL,
      id_servicio INTEGER NOT NULL,
      fecha_cita DATETIME NOT NULL,
      estado TEXT DEFAULT 'pendiente',
      notas TEXT,
      fecha_solicitud DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
      FOREIGN KEY (id_servicio) REFERENCES servicios(id_servicio)
    )
  `);


  // Crear tabla de reseñas
  db.exec(`
    CREATE TABLE IF NOT EXISTS resenas (
      id_resena INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL,
      calificacion INTEGER NOT NULL CHECK(calificacion BETWEEN 1 AND 5),
      comentario TEXT NOT NULL,
      estado TEXT DEFAULT 'pendiente',
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
    )
  `);

  // Bloqueos de agenda: días completos (sin horas) o rangos de horas
  db.exec(`
    CREATE TABLE IF NOT EXISTS bloqueos (
      id_bloqueo INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      hora_inicio TEXT,
      hora_fin TEXT,
      motivo TEXT,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_bloqueos_fecha ON bloqueos(fecha)');

  // Notificaciones dentro de la página (campanita). Una fila por persona que debe verlas.
  db.exec(`
    CREATE TABLE IF NOT EXISTS notificaciones (
      id_notificacion INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      titulo TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      titulo_en TEXT,
      mensaje_en TEXT,
      id_cita INTEGER,
      leida INTEGER NOT NULL DEFAULT 0,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_notif_usuario ON notificaciones(id_usuario, leida)');

  // Dispositivos que activaron las notificaciones push
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_suscripciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
    )
  `);

  // Marca para no enviar dos veces el aviso de "falta menos de 24 horas"
  try { db.exec('ALTER TABLE citas ADD COLUMN recordatorio_enviado INTEGER NOT NULL DEFAULT 0'); } catch (e) {}

  // Insertar servicios predeterminados solo si la tabla está vacía
  // (Antes se borraban y reinsertaban en cada arranque: las citas perdían su servicio y los precios
  //  editados se perdían. Ahora los precios se editan desde el panel de administración.)
  if (db.prepare('SELECT COUNT(*) AS n FROM servicios').get().n === 0) {
    const insertService = db.prepare(`
      INSERT INTO servicios (nombre, descripcion, precio, precio_max, categoria, duracion_minutos, activo)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);

    // Tratamientos Faciales
    insertService.run('Limpieza facial básica', '', 150, null, 'Tratamientos Faciales', 60);
    insertService.run('Limpieza facial profunda', '', 200, null, 'Tratamientos Faciales', 75);
    insertService.run('Luxury facial', '', 200, null, 'Tratamientos Faciales', 90);
    insertService.run('Tratamiento de acné', '', 200, null, 'Tratamientos Faciales', 60);
    insertService.run('Tratamiento de manchas', '', 200, null, 'Tratamientos Faciales', 60);
    insertService.run('Rejuvenecimiento', '', 200, null, 'Tratamientos Faciales', 60);
    insertService.run('Peelling Químico', '', 200, null, 'Tratamientos Faciales', 60);
    insertService.run('Depilación', 'Precio según área', 40, 200, 'Tratamientos Faciales', 30);

    // Tratamientos Corporales
    insertService.run('Reductores', '', 180, null, 'Tratamientos Corporales', 60);
    insertService.run('Celulitis', '', 180, null, 'Tratamientos Corporales', 60);
    insertService.run('Posoperatorio', '', 170, null, 'Tratamientos Corporales', 60);
    insertService.run('Tonificación', '', 180, null, 'Tratamientos Corporales', 60);
    insertService.run('Peelling de algas natural', '', 300, null, 'Tratamientos Corporales', 75);
  }

  // SEGURIDAD: ya no se crea un administrador con contraseña conocida (admin@beautysite.com / admin123).
  // Si esa cuenta existe todavía con la contraseña por defecto, se le quitan los permisos de administrador.
  const adminViejo = db.prepare('SELECT * FROM usuarios WHERE email = ?').get('admin@beautysite.com');
  if (adminViejo && adminViejo.rol === 'admin' && bcrypt.compareSync('admin123', adminViejo.password_hash)) {
    db.prepare("UPDATE usuarios SET rol = 'cliente' WHERE id_usuario = ?").run(adminViejo.id_usuario);
    console.warn('Se quitaron los permisos de administrador a admin@beautysite.com (usaba la contraseña por defecto).');
  }

  // Administradores: correos separados por coma en la variable de entorno ADMIN_EMAILS.
  // La cuenta debe existir (registrada desde el sitio) antes de reiniciar el servidor.
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const promover = db.prepare("UPDATE usuarios SET rol = 'admin' WHERE lower(email) = ? AND rol != 'admin'");
  adminEmails.forEach(e => { if (promover.run(e).changes) console.log('Administrador activado:', e); });

  console.log('Base de datos inicializada correctamente');
}

// Funciones de usuario
const userQueries = {
  // Buscar usuario por email
  findByEmail: (email) => {
    return db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  },

  // Buscar usuario por ID
  findById: (id) => {
    return db.prepare('SELECT id_usuario, nombre, apellido, email, telefono, rol, fecha_creacion FROM usuarios WHERE id_usuario = ?').get(id);
  },

  // Crear nuevo usuario
  create: (userData) => {
    const hashedPassword = bcrypt.hashSync(userData.password, 10);
    const result = db.prepare(`
      INSERT INTO usuarios (nombre, apellido, email, telefono, password_hash, rol)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userData.nombre, userData.apellido, userData.email, userData.telefono || null, hashedPassword, 'cliente');

    return { id: result.lastInsertRowid, ...userData };
  },

  // Verificar contraseña
  verifyPassword: (plainPassword, hashedPassword) => {
    return bcrypt.compareSync(plainPassword, hashedPassword);
  },

  // Obtener todas las citas de un usuario
  getUserAppointments: (userId) => {
    return db.prepare(`
      SELECT c.*, s.nombre as servicio_nombre, s.precio as servicio_precio
      FROM citas c
      JOIN servicios s ON c.id_servicio = s.id_servicio
      WHERE c.id_usuario = ?
      ORDER BY c.fecha_cita DESC
    `).all(userId);
  }
};

module.exports = {
  db,
  initializeDatabase,
  userQueries
};
