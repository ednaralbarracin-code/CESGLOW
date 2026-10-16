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
  // Nombre, descripción y categoría en inglés (para quien usa la página en English)
  try { db.exec('ALTER TABLE servicios ADD COLUMN nombre_en TEXT'); } catch(e) {}
  try { db.exec('ALTER TABLE servicios ADD COLUMN descripcion_en TEXT'); } catch(e) {}
  try { db.exec('ALTER TABLE servicios ADD COLUMN categoria_en TEXT'); } catch(e) {}

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

  // Lista base de servicios (con su nombre en inglés). Se sincroniza UNA sola vez (queda anotado en "ajustes"):
  //  - los servicios de esta lista se crean o se actualizan (por nombre, conservando el mismo id para no romper citas)
  //  - los que no están en la lista se ocultan (activo = 0), sin borrarlos, para que las citas viejas sigan mostrando su servicio
  // Después de eso los servicios y precios se manejan desde el panel de administración y ya no se tocan al reiniciar.
  // (Para volver a sincronizar con una lista nueva, cambia CATALOGO_VERSION.)
  db.exec('CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT)');
  const CATALOGO_VERSION = 'catalogo_servicios_v1';
  const FACIAL = ['Tratamientos Faciales', 'Facial Treatments'];
  const CORPORAL = ['Tratamientos Corporales', 'Body Treatments'];
  const catalogo = [
    // nombre, nombre_en, descripcion, descripcion_en, precio, precio_max, [categoria, categoria_en], duracion_minutos
    ['Limpieza facial básica', 'Basic facial cleansing', '', '', 150, null, FACIAL, 60],
    ['Limpieza facial profunda', 'Deep facial cleansing', '', '', 200, null, FACIAL, 75],
    ['Luxury facial', 'Luxury facial', '', '', 200, null, FACIAL, 90],
    ['Tratamiento de acné', 'Acne treatment', '', '', 200, null, FACIAL, 60],
    ['Tratamiento de manchas', 'Dark spot treatment', '', '', 200, null, FACIAL, 60],
    ['Rejuvenecimiento', 'Rejuvenation', '', '', 200, null, FACIAL, 60],
    ['Peelling Químico', 'Chemical peel', '', '', 200, null, FACIAL, 60],
    ['Depilación', 'Waxing', 'Precio según área', 'Price depends on area', 40, 200, FACIAL, 30],
    ['Reductores', 'Body contouring', '', '', 180, null, CORPORAL, 60],
    ['Celulitis', 'Cellulite treatment', '', '', 180, null, CORPORAL, 60],
    ['Posoperatorio', 'Post-surgery care', '', '', 170, null, CORPORAL, 60],
    ['Tonificación', 'Body toning', '', '', 180, null, CORPORAL, 60],
    ['Peelling de algas natural', 'Natural seaweed peel', '', '', 300, null, CORPORAL, 75]
  ];
  if (!db.prepare('SELECT 1 FROM ajustes WHERE clave = ?').get(CATALOGO_VERSION)) {
    const sincronizar = db.transaction(() => {
      const buscar = db.prepare('SELECT id_servicio FROM servicios WHERE nombre = ? ORDER BY id_servicio');
      const actualizar = db.prepare(`UPDATE servicios SET nombre_en = ?, descripcion = ?, descripcion_en = ?, precio = ?, precio_max = ?,
                                     categoria = ?, categoria_en = ?, duracion_minutos = ?, activo = 1 WHERE id_servicio = ?`);
      const insertar = db.prepare(`
        INSERT INTO servicios (nombre, nombre_en, descripcion, descripcion_en, precio, precio_max, categoria, categoria_en, duracion_minutos, activo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      const ocultar = db.prepare('UPDATE servicios SET activo = 0 WHERE id_servicio = ?');
      const nombres = new Set();
      catalogo.forEach(([nombre, nombreEn, desc, descEn, precio, max, cat, dur]) => {
        nombres.add(nombre);
        const filas = buscar.all(nombre);
        if (!filas.length) {
          insertar.run(nombre, nombreEn, desc, descEn, precio, max, cat[0], cat[1], dur);
        } else {
          actualizar.run(nombreEn, desc, descEn, precio, max, cat[0], cat[1], dur, filas[0].id_servicio);
          filas.slice(1).forEach(f => ocultar.run(f.id_servicio));   // nombres repetidos: se conserva uno
        }
      });
      db.prepare('SELECT id_servicio, nombre FROM servicios').all().forEach(f => {
        if (!nombres.has(f.nombre)) ocultar.run(f.id_servicio);
      });
      db.prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?)').run(CATALOGO_VERSION, new Date().toISOString());
    });
    sincronizar();
  }
  // Bases que ya se sincronizaron antes de que existiera el inglés: se rellena SOLO lo que esté vacío
  // (nunca se pisa un nombre en inglés que el administrador haya escrito).
  {
    const rellenar = db.transaction(() => {
      const enNombre = db.prepare("UPDATE servicios SET nombre_en = ? WHERE nombre = ? AND (nombre_en IS NULL OR nombre_en = '')");
      const enDesc = db.prepare("UPDATE servicios SET descripcion_en = ? WHERE nombre = ? AND descripcion = ? AND (descripcion_en IS NULL OR descripcion_en = '')");
      const enCat = db.prepare("UPDATE servicios SET categoria_en = ? WHERE categoria = ? AND (categoria_en IS NULL OR categoria_en = '')");
      catalogo.forEach(([nombre, nombreEn, desc, descEn, , , cat]) => {
        enNombre.run(nombreEn, nombre);
        if (desc && descEn) enDesc.run(descEn, nombre, desc);
        enCat.run(cat[1], cat[0]);
      });
    });
    rellenar();
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
  console.log(adminEmails.length
    ? 'Administradores configurados (ADMIN_EMAILS): ' + adminEmails.join(', ')
    : 'ADMIN_EMAILS no está configurado: nadie podrá entrar al panel de administración');
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
