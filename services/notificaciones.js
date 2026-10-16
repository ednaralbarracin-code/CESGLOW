// CESGLOW-main/services/notificaciones.js
const db = require('../config/database');

/**
 * Guarda la notificación en base de datos y la envía al navegador
 */
async function crearNotificacion({ usuario_id, rol, tipo, titulo, mensaje, cita_id = null }) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO notificaciones (usuario_id, rol, tipo, titulo, mensaje, cita_id, leida, fecha_creacion)
      VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now', 'localtime'))
    `;

    db.run(query, [usuario_id || null, rol, tipo, titulo, mensaje, cita_id], function (err) {
      if (err) {
        console.error('Error al guardar notificación:', err);
        return reject(err);
      }
      console.log(`[NOTIFICACIÓN] [${rol.toUpperCase()}] [${tipo}]: ${titulo}`);
      resolve({ id: this.lastID, titulo, mensaje });
    });
  });
}

/**
 * Monitorea citas para disparar aviso automático de 24h y 12h a Cliente y Admin
 */
async function verificarCitasProximas() {
  const query = `
    SELECT c.*, u.nombre as cliente_nombre, s.nombre as servicio_nombre
    FROM citas c
    LEFT JOIN usuarios u ON c.usuario_id = u.id
    LEFT JOIN servicios s ON c.servicio_id = s.id
    WHERE c.estado IN ('pendiente', 'confirmada')
  `;

  db.all(query, [], async (err, citas) => {
    if (err || !citas) return;
    const ahora = new Date();

    for (const cita of citas) {
      const fechaCita = new Date(`${cita.fecha}T${cita.hora || '10:00'}:00`);
      const diffHoras = (fechaCita.getTime() - ahora.getTime()) / (1000 * 60 * 60);

      const cliente = cita.cliente_nombre || cita.nombre_cliente || 'Cliente';
      const servicio = cita.servicio_nombre || cita.nombre_servicio || 'Servicio';

      // 1. Alerta de 24 horas
      if (diffHoras <= 24 && diffHoras > 12 && !cita.notificado_24h) {
        await crearNotificacion({
          usuario_id: cita.usuario_id,
          rol: 'cliente',
          tipo: 'aviso_24h',
          titulo: '⏰ Recordatorio: Cita en 24 Horas',
          mensaje: `Tienes una cita pendiente de ${servicio} mañana a las ${cita.hora}.`,
          cita_id: cita.id
        });

        await crearNotificacion({
          usuario_id: null,
          rol: 'admin',
          tipo: 'aviso_24h',
          titulo: '⏰ Aviso Admin: Cita en 24 Horas',
          mensaje: `Cita pendiente dentro de 24h con ${cliente} (${servicio}) a las ${cita.hora}.`,
          cita_id: cita.id
        });

        db.run('UPDATE citas SET notificado_24h = 1 WHERE id = ?', [cita.id]);
      }

      // 2. Alerta de 12 horas
      if (diffHoras <= 12 && diffHoras > 0 && !cita.notificado_12h) {
        await crearNotificacion({
          usuario_id: cita.usuario_id,
          rol: 'cliente',
          tipo: 'aviso_12h',
          titulo: '⚡ Recordatorio Urgente: Cita en 12 Horas',
          mensaje: `¡Atención! Tu cita para ${servicio} es hoy a las ${cita.hora}.`,
          cita_id: cita.id
        });

        await crearNotificacion({
          usuario_id: null,
          rol: 'admin',
          tipo: 'aviso_12h',
          titulo: '⚡ Aviso Admin: Cita en 12 Horas',
          mensaje: `Cita próxima en menos de 12h con ${cliente} (${servicio}) a las ${cita.hora}.`,
          cita_id: cita.id
        });

        db.run('UPDATE citas SET notificado_12h = 1, notificado_24h = 1 WHERE id = ?', [cita.id]);
      }
    }
  });
}

function iniciarMonitoreoAlertas() {
  verificarCitasProximas();
  setInterval(verificarCitasProximas, 5 * 60 * 1000); // Revisa cada 5 minutos
}

module.exports = { crearNotificacion, verificarCitasProximas, iniciarMonitoreoAlertas };