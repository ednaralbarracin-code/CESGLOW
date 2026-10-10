const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'beauty_care.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true }); // evita que el servidor se caiga si la carpeta no existe
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

  // Horario de atención (lo edita el administrador desde el panel)
  db.exec(`CREATE TABLE IF NOT EXISTS horarios (
    dia INTEGER PRIMARY KEY, abierto INTEGER DEFAULT 1,
    apertura TEXT DEFAULT '08:00', cierre TEXT DEFAULT '19:00')`);
  if (db.prepare('SELECT COUNT(*) n FROM horarios').get().n === 0) {
    for (let i = 0; i < 7; i++) db.prepare('INSERT INTO horarios (dia, abierto) VALUES (?, ?)').run(i, i === 0 ? 0 : 1);
  }

  // Servicios predeterminados: solo se crean si la tabla está vacía (así no se pierden los cambios del panel)
  if (db.prepare('SELECT COUNT(*) n FROM servicios').get().n === 0) {
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

  // Crear usuario admin predeterminado si no existe
  const adminExists = db.prepare('SELECT * FROM usuarios WHERE email = ?').get('admin@beautysite.com');
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO usuarios (nombre, apellido, email, telefono, password_hash, rol)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('Samuel', 'Admin', 'admin@beautysite.com', '3000000000', hashedPassword, 'admin');
  }

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
