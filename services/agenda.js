// Agenda: "visitas" (una o varias citas seguidas del mismo cliente), cambio de estado y reprogramación.
// Una visita con varios servicios se guarda como varias filas en la tabla citas, una detrás de otra.
const { db } = require('../config/database');
const { aLocalISO, zonaNegocio } = require('./notificaciones');

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const aMin = (f) => parseInt(String(f).slice(11, 13), 10) * 60 + parseInt(String(f).slice(14, 16), 10);
const hmAMin = (h) => parseInt(h.slice(0, 2), 10) * 60 + parseInt(h.slice(3, 5), 10);
const aHora = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

function fechaValida(f) {
  if (!RE_FECHA.test(f || '')) return false;
  const d = new Date(f + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === f;
}

// Filas de la visita a la que pertenece una cita: mismo cliente, mismo día, una pegada a la siguiente.
// estados: lista de estados que cuentan (por ejemplo ['pendiente','confirmada'])
function visitaDe(idCita, estados) {
  const cita = db.prepare('SELECT id_cita, id_usuario, fecha_cita FROM citas WHERE id_cita = ?').get(idCita);
  if (!cita) return null;
  const marcas = estados.map(() => '?').join(',');
  const filas = db.prepare(`
    SELECT c.id_cita, c.id_usuario, c.fecha_cita, c.estado, COALESCE(s.duracion_minutos, 60) AS duracion, s.nombre AS servicio, s.precio
    FROM citas c LEFT JOIN servicios s ON s.id_servicio = c.id_servicio
    WHERE c.id_usuario = ? AND substr(c.fecha_cita, 1, 10) = ? AND c.estado IN (${marcas})
    ORDER BY c.fecha_cita, c.id_cita
  `).all(cita.id_usuario, String(cita.fecha_cita).slice(0, 10), ...estados);
  const pos = filas.findIndex(f => f.id_cita === idCita);
  if (pos === -1) return { cita, filas: [] };
  let ini = pos, fin = pos;
  while (ini > 0 && aMin(filas[ini - 1].fecha_cita) + filas[ini - 1].duracion === aMin(filas[ini].fecha_cita)) ini--;
  while (fin < filas.length - 1 && aMin(filas[fin].fecha_cita) + filas[fin].duracion === aMin(filas[fin + 1].fecha_cita)) fin++;
  return { cita, filas: filas.slice(ini, fin + 1) };
}

// Intervalos ocupados de un día (citas no canceladas + bloqueos), sin contar las filas que se están moviendo
function intervalosOcupados(fecha, excluirIds) {
  const ex = new Set(excluirIds || []);
  const citas = db.prepare(`
    SELECT c.id_cita, c.fecha_cita, COALESCE(s.duracion_minutos, 60) AS duracion
    FROM citas c LEFT JOIN servicios s ON s.id_servicio = c.id_servicio
    WHERE substr(c.fecha_cita, 1, 10) = ? AND c.estado != 'cancelada'
  `).all(fecha).filter(c => !ex.has(c.id_cita)).map(c => ({ inicio: aMin(c.fecha_cita), fin: aMin(c.fecha_cita) + c.duracion }));
  const bloqueos = db.prepare('SELECT hora_inicio, hora_fin FROM bloqueos WHERE fecha = ?').all(fecha).map(b =>
    b.hora_inicio && b.hora_fin ? { inicio: hmAMin(b.hora_inicio), fin: hmAMin(b.hora_fin) } : { inicio: 0, fin: 1439 });
  return citas.concat(bloqueos);
}

// Mueve la visita completa a otra fecha y hora. Devuelve { error, status } o { datos }.
//   opciones.minHorasAntes: si se indica, la visita actual debe empezar dentro de al menos esas horas (regla para clientes)
function reprogramarVisita(idCita, fecha, hora, opciones) {
  opciones = opciones || {};
  if (!fechaValida(fecha)) return { error: 'Fecha inválida', status: 400 };
  if (!RE_HORA.test(hora || '')) return { error: 'Hora inválida', status: 400 };

  const v = visitaDe(idCita, ['pendiente', 'confirmada']);
  if (!v) return { error: 'Cita no encontrada', status: 404 };
  if (!v.filas.length) return { error: 'Esta cita ya no se puede reprogramar', status: 400 };
  if (opciones.idUsuario && v.cita.id_usuario !== opciones.idUsuario) return { error: 'Cita no encontrada', status: 404 };

  const tz = zonaNegocio(), ahora = Date.now();
  const inicioActual = v.filas[0].fecha_cita;
  if (opciones.minHorasAntes && String(inicioActual).slice(0, 19) <= aLocalISO(ahora + opciones.minHorasAntes * 3600e3, tz)) {
    return { error: `Con menos de ${opciones.minHorasAntes} horas de anticipación no puedes reprogramar desde la página. Escríbenos por WhatsApp.`, status: 400 };
  }

  let inicio = hmAMin(hora);
  const nuevas = v.filas.map(f => { const x = { fila: f, inicio, fin: inicio + f.duracion }; inicio += f.duracion; return x; });
  if (nuevas[nuevas.length - 1].fin > 24 * 60) return { error: 'La visita no cabe en ese día. Elige una hora más temprana.', status: 400 };
  if (`${fecha}T${aHora(nuevas[0].inicio)}:00` <= aLocalISO(ahora, tz)) return { error: 'Elige una fecha y hora que todavía no hayan pasado.', status: 400 };
  if (String(inicioActual).slice(0, 16) === `${fecha}T${aHora(nuevas[0].inicio)}`) return { error: 'Elige un día u hora diferente al actual.', status: 400 };

  const ocupados = intervalosOcupados(fecha, v.filas.map(f => f.id_cita));
  if (nuevas.some(n => ocupados.some(o => n.inicio < o.fin && n.fin > o.inicio))) {
    return { error: 'Ese horario no está disponible. Elige otro.', status: 409 };
  }

  // Si la nueva hora ya está dentro de las próximas 24 h, el aviso de reprogramación cumple: no se manda además el recordatorio
  const nuevoInicio = `${fecha}T${aHora(nuevas[0].inicio)}:00`;
  const dentro24 = nuevoInicio <= aLocalISO(ahora + 24 * 3600e3, tz) ? 1 : 0;
  const dentro12 = nuevoInicio <= aLocalISO(ahora + 12 * 3600e3, tz) ? 1 : 0;
  const actualizar = db.prepare('UPDATE citas SET fecha_cita = ?, recordatorio_enviado = ?, recordatorio_24_enviado = ?, recordatorio_12_enviado = ? WHERE id_cita = ?');
  db.transaction(() => nuevas.forEach(n => actualizar.run(`${fecha}T${aHora(n.inicio)}:00`, dentro24, dentro24, dentro12, n.fila.id_cita)))();

  return { datos: {
    id_usuario: v.cita.id_usuario, citaIds: v.filas.map(f => f.id_cita),
    servicios: v.filas.map(f => ({ nombre: f.servicio || 'Servicio', precio: f.precio })),
    fecha, hora: aHora(nuevas[0].inicio),
    fechaAnterior: String(inicioActual).slice(0, 10), horaAnterior: String(inicioActual).slice(11, 16)
  } };
}

// Horas que faltan para que empiece una cita (fecha_cita está en hora del negocio, sin zona)
function horasHasta(fechaCita) {
  const pedazos = (s) => { const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/); return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]); };
  return (pedazos(fechaCita) - pedazos(aLocalISO(Date.now(), zonaNegocio()))) / 3600e3;
}

module.exports = { visitaDe, reprogramarVisita, intervalosOcupados, fechaValida, horasHasta };
