// Notificaciones de CESGLOW: cita agendada, confirmada, cancelada, reprogramada y recordatorios de 24 y 12 horas.
// Canales: campanita dentro de la página (siempre), correo, push y WhatsApp.
// Cada canal se activa solo si están sus variables de entorno; si falta alguna, ese canal se omite sin errores.
const { db } = require('../config/database');

// web-push es opcional: si no está instalado (npm install web-push) el canal push queda apagado.
let webpush = null;
try { webpush = require('web-push'); } catch (e) { /* sin push */ }

const env = (k, d) => String(process.env[k] == null || process.env[k] === '' ? (d == null ? '' : d) : process.env[k]).trim();
const TZ = () => env('TZ_NEGOCIO', 'America/Los_Angeles');         // zona horaria del negocio (las citas se guardan sin zona)
const SITIO = () => env('SITE_URL', 'https://cesglowbeauty.com').replace(/\/$/, '');
const WA_NEGOCIO = () => env('WHATSAPP_NEGOCIO', '17144739747');      // número al que escriben los clientes
const lista = (txt) => String(txt || '').split(',').map(s => s.trim()).filter(Boolean);

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ───────────────── Fechas ─────────────────
function fechaLarga(iso, idioma) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  });
}
function hora12(hhmm) {
  const h = parseInt(String(hhmm).slice(0, 2), 10), m = String(hhmm).slice(3, 5);
  return ((h % 12) || 12) + ':' + m + ' ' + (h >= 12 ? 'PM' : 'AM');
}
// "YYYY-MM-DDTHH:MM:SS" en la zona horaria del negocio (así se comparan con fecha_cita)
function aLocalISO(ms, tz) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(ms)).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

// ───────────────── Canal: correo (Resend) ─────────────────
const correoActivo = () => !!(env('RESEND_API_KEY') && env('MAIL_FROM'));

async function enviarCorreo(para, asunto, html, texto) {
  if (!correoActivo() || !para) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env('RESEND_API_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env('MAIL_FROM'), to: [para], subject: asunto, html, text: texto })
    });
    if (!r.ok) { console.error('[correo] error', r.status, String(await r.text()).slice(0, 200)); return false; }
    return true;
  } catch (e) { console.error('[correo]', e.message); return false; }
}

// Correo con diseño sencillo, en español y en inglés (el servidor no sabe qué idioma usa cada cliente)
function correoHTML(es, en) {
  const bloque = (t) => `
    <h2 style="font-family:Georgia,serif;color:#242020;font-size:20px;margin:0 0 12px;">${esc(t.titulo)}</h2>
    ${t.lineas.map(l => `<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#333;">${l}</p>`).join('')}
    ${t.boton ? `<p style="margin:16px 0 0;"><a href="${esc(t.boton.url)}" style="background:#D8B4A0;color:#fff;text-decoration:none;padding:11px 22px;border-radius:24px;font-size:14px;display:inline-block;">${esc(t.boton.texto)}</a></p>` : ''}`;
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4eeea;">
  <div style="max-width:560px;margin:0 auto;padding:24px 14px;font-family:Arial,Helvetica,sans-serif;">
    <div style="background:#242020;border-radius:14px 14px 0 0;padding:18px;text-align:center;">
      <span style="font-family:Georgia,serif;font-size:26px;letter-spacing:3px;color:#D8B4A0;">CESGLOW</span>
    </div>
    <div style="background:#ffffff;border-radius:0 0 14px 14px;padding:26px 24px;">
      ${bloque(es)}
      ${en ? `<hr style="border:none;border-top:1px solid #eadfd8;margin:22px 0;">${bloque(en)}` : ''}
    </div>
  </div></body></html>`;
}
const quitarHTML = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
function correoTexto(es, en) {
  const bl = (t) => [t.titulo, ...t.lineas.map(quitarHTML), t.boton ? `${t.boton.texto}: ${t.boton.url}` : ''].filter(Boolean).join('\n');
  return bl(es) + (en ? '\n\n---\n\n' + bl(en) : '');
}

// ───────────────── Canal: push (web-push) ─────────────────
let vapidListo = false;
function pushActivo() {
  if (!webpush || !env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY')) return false;
  if (!vapidListo) {
    webpush.setVapidDetails(env('VAPID_SUBJECT', SITIO()), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
    vapidListo = true;
  }
  return true;
}
async function enviarPush(idUsuario, payload) {
  if (!pushActivo()) return 0;
  const subs = db.prepare('SELECT id, endpoint, p256dh, auth, idioma FROM push_suscripciones WHERE id_usuario = ?').all(idUsuario);
  let enviados = 0;
  for (const s of subs) {
    try {
      // Cada dispositivo recibe el aviso en el idioma que eligió en la página (si hay versión en inglés)
      const en = s.idioma === 'en' && payload.titulo_en && payload.mensaje_en;
      const cuerpo = { titulo: en ? payload.titulo_en : payload.titulo, mensaje: en ? payload.mensaje_en : payload.mensaje, url: payload.url, tag: payload.tag };
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(cuerpo), { TTL: 3600 });
      enviados++;
    } catch (e) {
      // 404/410: el dispositivo ya no existe (desinstaló o revocó el permiso) → se borra
      if (e && (e.statusCode === 404 || e.statusCode === 410)) db.prepare('DELETE FROM push_suscripciones WHERE id = ?').run(s.id);
      else console.error('[push]', (e && (e.statusCode || e.message)) || e);
    }
  }
  return enviados;
}

// ───────────────── Canal: WhatsApp (API oficial de Meta) ─────────────────
const whatsappActivo = () => !!(env('WHATSAPP_TOKEN') && env('WHATSAPP_PHONE_ID'));

// Deja solo dígitos con código de país. Los números de 10 dígitos reciben WA_PAIS_POR_DEFECTO (1 = EE. UU./Canadá).
function normalizarTelefono(t) {
  const crudo = String(t == null ? '' : t).trim();
  let d = crudo.replace(/\D/g, '');
  if (!d) return null;
  if (!crudo.startsWith('+')) {
    if (d.startsWith('00')) d = d.slice(2);
    else if (d.length === 10) d = env('WA_PAIS_POR_DEFECTO', '1') + d;
  }
  return d.length >= 8 && d.length <= 15 ? d : null;
}
async function enviarWhatsApp(telefono, plantilla, parametros) {
  const to = normalizarTelefono(telefono);
  if (!whatsappActivo() || !to || !plantilla) return false;
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${env('WHATSAPP_PHONE_ID')}/messages`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env('WHATSAPP_TOKEN'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'template',
        template: {
          name: plantilla, language: { code: env('WA_IDIOMA', 'es') },
          components: [{ type: 'body', parameters: parametros.map(p => ({ type: 'text', text: String(p == null || p === '' ? '-' : p).replace(/[\n\t]+/g, ' ').slice(0, 200) })) }]
        }
      })
    });
    if (!r.ok) { console.error('[whatsapp] error', r.status, String(await r.text()).slice(0, 300)); return false; }
    return true;
  } catch (e) { console.error('[whatsapp]', e.message); return false; }
}
const PLANTILLAS = () => ({
  clienteNueva: env('WA_TPL_CLIENTE_NUEVA', 'cita_registrada_cliente'),
  clienteRecordatorio: env('WA_TPL_CLIENTE_RECORDATORIO', 'recordatorio_cita_cliente'),
  adminNueva: env('WA_TPL_ADMIN_NUEVA', 'nueva_cita_admin'),
  adminRecordatorio: env('WA_TPL_ADMIN_RECORDATORIO', 'recordatorio_cita_admin'),
  clienteConfirmada: env('WA_TPL_CLIENTE_CONFIRMADA', 'cita_confirmada_cliente'),
  clienteCancelada: env('WA_TPL_CLIENTE_CANCELADA', 'cita_cancelada_cliente'),
  clienteReprogramada: env('WA_TPL_CLIENTE_REPROGRAMADA', 'cita_reprogramada_cliente'),
  adminCancelada: env('WA_TPL_ADMIN_CANCELADA', 'cita_cancelada_admin'),
  adminReprogramada: env('WA_TPL_ADMIN_REPROGRAMADA', 'cita_reprogramada_admin')
});

// ───────────────── Entrega por todos los canales ─────────────────
function guardarNotificacion(idUsuario, n) {
  db.prepare(`INSERT INTO notificaciones (id_usuario, tipo, titulo, mensaje, titulo_en, mensaje_en, id_cita)
              VALUES (?, ?, ?, ?, ?, ?, ?)`).run(idUsuario, n.tipo, n.titulo, n.mensaje, n.titulo_en || null, n.mensaje_en || null, n.id_cita || null);
}

// destino: { id_usuario, email, telefono (para WhatsApp) }
async function entregar(destino, n) {
  if (destino.id_usuario) { try { guardarNotificacion(destino.id_usuario, n); } catch (e) { console.error('[campanita]', e.message); } }
  const tareas = [];
  if (destino.email && n.correo) tareas.push(enviarCorreo(destino.email, n.correo.asunto, n.correo.html, n.correo.texto));
  if (destino.id_usuario && n.push) tareas.push(enviarPush(destino.id_usuario, Object.assign({}, n.push, { titulo: n.titulo, mensaje: n.mensaje, titulo_en: n.titulo_en, mensaje_en: n.mensaje_en })));
  if (destino.telefono && n.whatsapp) tareas.push(enviarWhatsApp(destino.telefono, n.whatsapp.plantilla, n.whatsapp.parametros));
  await Promise.allSettled(tareas);
}

// A quién avisar en el lado del negocio: cada administrador (campanita + push) y los correos / WhatsApp configurados
function destinosAdmin() {
  const admins = db.prepare("SELECT id_usuario, email FROM usuarios WHERE rol = 'admin'").all();
  const correos = lista(env('ADMIN_NOTIFY_EMAIL'));
  const whats = lista(env('ADMIN_WHATSAPP'));
  const destinos = admins.map((a, i) => ({
    id_usuario: a.id_usuario,
    email: correos.length ? correos[i] : a.email,
    telefono: whats[i]
  }));
  // Correos o WhatsApp adicionales (más que administradores): solo reciben correo / WhatsApp
  for (let i = admins.length; i < Math.max(correos.length, whats.length); i++) destinos.push({ id_usuario: null, email: correos[i], telefono: whats[i] });
  return destinos;
}

const nombreDe = (u) => `${u.nombre || ''} ${u.apellido || ''}`.trim();
const textoServicios = (servicios) => servicios.map(s => s.nombre).join(', ');
// Nombre en inglés de cada servicio (columna nombre_en); si no tiene, se usa el nombre en español
const textoServiciosEn = (servicios) => servicios.map(s => {
  try { const r = db.prepare('SELECT nombre_en FROM servicios WHERE nombre = ?').get(s.nombre); return (r && r.nombre_en) || s.nombre; }
  catch (e) { return s.nombre; }
}).join(', ');
const enlaceWhatsAppNegocio = (texto) => `https://wa.me/${WA_NEGOCIO()}?text=${encodeURIComponent(texto)}`;

// ───────────────── Evento 1: alguien agenda una cita ─────────────────
async function notificarCitaAgendada({ id_usuario, fecha, hora, servicios, citaIds, notas }) {
  const u = db.prepare('SELECT id_usuario, nombre, apellido, email, telefono FROM usuarios WHERE id_usuario = ?').get(id_usuario);
  if (!u || !servicios || !servicios.length) return;

  // Si la cita es dentro de las próximas 24 horas, este aviso ya cumple: no se manda además el recordatorio.
  const ahora = Date.now();
  const inicioLocal = `${fecha}T${hora}:00`;
  // Igual con las 12 horas: solo se marcan las ventanas que ya quedaron dentro del plazo.
  const dentro24 = inicioLocal <= aLocalISO(ahora + 24 * 3600 * 1000, TZ());
  const dentro12 = inicioLocal <= aLocalISO(ahora + 12 * 3600 * 1000, TZ());
  if (dentro24) {
    const marcar = db.prepare('UPDATE citas SET recordatorio_enviado = 1, recordatorio_24_enviado = 1, recordatorio_12_enviado = ? WHERE id_cita = ?');
    (citaIds || []).forEach(id => marcar.run(dentro12 ? 1 : 0, id));
  }

  const nombre = nombreDe(u), lista_ = textoServicios(servicios), listaEn = textoServiciosEn(servicios), h = hora12(hora);
  const fEs = fechaLarga(fecha, 'es'), fEn = fechaLarga(fecha, 'en');
  const idCita = (citaIds || [])[0];
  const pl = PLANTILLAS();

  // — Cliente —
  const clienteEs = {
    titulo: 'Cita registrada',
    mensaje: `Tu cita de ${lista_} quedó registrada para el ${fEs} a las ${h}. Para confirmarla, envía tu abono de $50 por WhatsApp.`
  };
  const clienteEn = {
    titulo: 'Appointment booked',
    mensaje: `Your appointment for ${listaEn} is booked for ${fEn} at ${h}. To confirm it, send your $50 deposit via WhatsApp.`
  };
  const tEs = {
    titulo: clienteEs.titulo,
    lineas: [
      `Hola ${esc(u.nombre)}, tu cita quedó registrada:`,
      `<strong>Servicio:</strong> ${esc(lista_)}<br><strong>Fecha:</strong> ${esc(fEs)}<br><strong>Hora:</strong> ${esc(h)}`,
      'Para confirmarla necesitamos tu abono de <strong>$50</strong>. Escríbenos por WhatsApp con tu medio de pago.',
      'Recuerda: cancelar con menos de 24 horas de anticipación implica perder el abono.'
    ],
    boton: { texto: 'Enviar abono por WhatsApp', url: enlaceWhatsAppNegocio(`Hola, agendé una cita en CESGLOW (${lista_}, ${fecha} ${h}). Quiero confirmar mi abono de $50.`) }
  };
  const tEn = {
    titulo: clienteEn.titulo,
    lineas: [
      `Hi ${esc(u.nombre)}, your appointment is booked:`,
      `<strong>Service:</strong> ${esc(listaEn)}<br><strong>Date:</strong> ${esc(fEn)}<br><strong>Time:</strong> ${esc(h)}`,
      'To confirm it we need your <strong>$50</strong> deposit. Message us on WhatsApp with your payment method.',
      'Please note: cancelling with less than 24 hours notice means losing the deposit.'
    ],
    boton: { texto: 'Send deposit via WhatsApp', url: tEs.boton.url }
  };
  const entregaCliente = entregar({ id_usuario: u.id_usuario, email: u.email, telefono: u.telefono }, {
    tipo: 'cita_agendada', id_cita: idCita,
    titulo: clienteEs.titulo, mensaje: clienteEs.mensaje, titulo_en: clienteEn.titulo, mensaje_en: clienteEn.mensaje,
    correo: { asunto: 'Cita registrada / Appointment booked – CESGLOW', html: correoHTML(tEs, tEn), texto: correoTexto(tEs, tEn) },
    push: { titulo: `${clienteEs.titulo} / ${clienteEn.titulo}`, mensaje: clienteEs.mensaje, url: '/', tag: 'cita-' + idCita },
    whatsapp: { plantilla: pl.clienteNueva, parametros: [u.nombre, fEs, h, lista_] }
  });

  // — Administrador(es) —
  const adminMsg = `${lista_} · ${fEs}, ${h}${u.telefono ? ' · ' + u.telefono : ''}. Pendiente de abono.`;
  const aEs = {
    titulo: `Nueva cita: ${nombre}`,
    lineas: [
      `<strong>${esc(nombre)}</strong> agendó una cita:`,
      `<strong>Servicio:</strong> ${esc(lista_)}<br><strong>Fecha:</strong> ${esc(fEs)}<br><strong>Hora:</strong> ${esc(h)}`
        + `<br><strong>Correo:</strong> ${esc(u.email)}<br><strong>Teléfono:</strong> ${esc(u.telefono || '—')}`
        + (notas ? `<br><strong>Notas:</strong> ${esc(notas)}` : ''),
      'Está <strong>pendiente de abono</strong>. Confírmala en el panel cuando llegue el pago.'
    ],
    boton: { texto: 'Abrir el panel', url: SITIO() + '/admin.html' }
  };
  const entregasAdmin = destinosAdmin().map(dest => entregar(dest, {
    tipo: 'nueva_cita', id_cita: idCita,
    titulo: `Nueva cita: ${nombre}`, mensaje: adminMsg,
    correo: { asunto: `Nueva cita: ${nombre} – ${fEs}, ${h}`, html: correoHTML(aEs), texto: correoTexto(aEs) },
    push: { titulo: `Nueva cita: ${nombre}`, mensaje: adminMsg, url: '/admin.html', tag: 'cita-' + idCita },
    whatsapp: { plantilla: pl.adminNueva, parametros: [nombre, u.telefono || u.email, lista_, fEs, h] }
  }));

  await Promise.allSettled([entregaCliente, ...entregasAdmin]);
}

// ───────────────── Evento 2: faltan 24 y 12 horas ─────────────────
// Se revisa primero la ventana de 12 h: si el servidor estuvo apagado y la cita ya está a menos de 12 h,
// se manda solo el aviso de 12 h (y se marca también el de 24 h para no duplicar).
const VENTANAS = [
  { horas: 12, col: 'recordatorio_12_enviado' },
  { horas: 24, col: 'recordatorio_24_enviado' }
];
let revisando = false;
async function revisarRecordatorios(ahora) {
  if (revisando) return 0;
  revisando = true;
  try {
    ahora = ahora == null ? Date.now() : ahora;
    const tz = TZ();
    const desde = aLocalISO(ahora, tz);
    let avisos = 0;

    for (const v of VENTANAS) {
      const hasta = aLocalISO(ahora + v.horas * 3600 * 1000, tz);
      // Una persona puede tener varias filas el mismo día (varios servicios en una visita): se avisa una sola vez
      const candidatas = db.prepare(`
        SELECT DISTINCT id_usuario, substr(fecha_cita, 1, 10) AS dia
        FROM citas
        WHERE ${v.col} = 0 AND estado IN ('pendiente', 'confirmada')
          AND fecha_cita > ? AND fecha_cita <= ?
      `).all(desde, hasta);

      for (const g of candidatas) {
        const filas = db.prepare(`
          SELECT c.id_cita, c.fecha_cita, c.estado, s.nombre AS servicio
          FROM citas c LEFT JOIN servicios s ON s.id_servicio = c.id_servicio
          WHERE c.id_usuario = ? AND substr(c.fecha_cita, 1, 10) = ? AND c.${v.col} = 0
            AND c.estado IN ('pendiente', 'confirmada')
          ORDER BY c.fecha_cita
        `).all(g.id_usuario, g.dia);
        if (!filas.length) continue;

        // Se marca ANTES de enviar: si algo falla no se repite en bucle ni se manda doble
        const marcar = v.horas === 12
          ? db.prepare('UPDATE citas SET recordatorio_enviado = 1, recordatorio_24_enviado = 1, recordatorio_12_enviado = 1 WHERE id_cita = ?')
          : db.prepare('UPDATE citas SET recordatorio_enviado = 1, recordatorio_24_enviado = 1 WHERE id_cita = ?');
        filas.forEach(f => marcar.run(f.id_cita));

        const u = db.prepare('SELECT id_usuario, nombre, apellido, email, telefono FROM usuarios WHERE id_usuario = ?').get(g.id_usuario);
        if (!u) continue;
        await recordatorioCita(u, filas, v.horas);
        avisos++;
      }
    }
    return avisos;
  } catch (e) {
    console.error('[recordatorios]', e.message);
    return 0;
  } finally { revisando = false; }
}

async function recordatorioCita(u, filas, horas) {
  horas = horas || 24;
  const fecha = String(filas[0].fecha_cita).slice(0, 10);
  const hora = String(filas[0].fecha_cita).slice(11, 16);
  const pendiente = filas.some(f => f.estado === 'pendiente');
  const lista_ = filas.map(f => f.servicio || 'Servicio').join(', ');
  const listaEn = textoServiciosEn(filas.map(f => ({ nombre: f.servicio || 'Servicio' })));
  const nombre = nombreDe(u), h = hora12(hora);
  const fEs = fechaLarga(fecha, 'es'), fEn = fechaLarga(fecha, 'en');
  const idCita = filas[0].id_cita;
  const pl = PLANTILLAS();

  const msgEs = pendiente
    ? `Te esperamos el ${fEs} a las ${h}. Aún no recibimos tu abono de $50: escríbenos por WhatsApp para confirmarla.`
    : `Te esperamos el ${fEs} a las ${h}. Recuerda que cancelar con menos de 24 horas de anticipación implica perder el abono de $50.`;
  const msgEn = pendiente
    ? `We look forward to seeing you on ${fEn} at ${h}. We have not received your $50 deposit yet: message us on WhatsApp to confirm.`
    : `We look forward to seeing you on ${fEn} at ${h}. Please remember that cancelling with less than 24 hours notice means losing the $50 deposit.`;
  const tEs = {
    titulo: `Tu cita es en menos de ${horas} horas`,
    lineas: [
      `Hola ${esc(u.nombre)}, te recordamos tu cita:`,
      `<strong>Servicio:</strong> ${esc(lista_)}<br><strong>Fecha:</strong> ${esc(fEs)}<br><strong>Hora:</strong> ${esc(h)}`,
      esc(pendiente ? 'Aún no recibimos tu abono de $50. Escríbenos por WhatsApp para confirmar tu cita.' : 'Tu cita está confirmada. ¡Te esperamos!'),
      'Recuerda: cancelar con menos de 24 horas de anticipación implica perder el abono de $50.'
    ],
    boton: pendiente ? { texto: 'Confirmar por WhatsApp', url: enlaceWhatsAppNegocio(`Hola, tengo una cita en CESGLOW (${lista_}, ${fecha} ${h}). Quiero confirmar mi abono de $50.`) } : null
  };
  const tEn = {
    titulo: `Your appointment is in less than ${horas} hours`,
    lineas: [
      `Hi ${esc(u.nombre)}, a reminder of your appointment:`,
      `<strong>Service:</strong> ${esc(listaEn)}<br><strong>Date:</strong> ${esc(fEn)}<br><strong>Time:</strong> ${esc(h)}`,
      esc(pendiente ? 'We have not received your $50 deposit yet. Message us on WhatsApp to confirm your appointment.' : 'Your appointment is confirmed. See you soon!'),
      'Please note: cancelling with less than 24 hours notice means losing the $50 deposit.'
    ],
    boton: pendiente ? { texto: 'Confirm via WhatsApp', url: tEs.boton.url } : null
  };
  const entregaCliente = entregar({ id_usuario: u.id_usuario, email: u.email, telefono: u.telefono }, {
    tipo: `recordatorio_${horas}h`, id_cita: idCita,
    titulo: tEs.titulo, mensaje: msgEs, titulo_en: tEn.titulo, mensaje_en: msgEn,
    correo: { asunto: 'Recordatorio de tu cita / Appointment reminder – CESGLOW', html: correoHTML(tEs, tEn), texto: correoTexto(tEs, tEn) },
    push: { titulo: `Tu cita es en menos de ${horas} horas / Your appointment is in under ${horas}h`, mensaje: msgEs, url: '/', tag: `recordatorio-${horas}h-` + idCita },
    whatsapp: { plantilla: pl.clienteRecordatorio, parametros: [u.nombre, fEs, h, lista_] }
  });

  const estadoTxt = pendiente ? 'pendiente de abono' : 'confirmada';
  const adminMsg = `${lista_} · ${fEs}, ${h} · ${estadoTxt}${u.telefono ? ' · ' + u.telefono : ''}`;
  const aEs = {
    titulo: `Cita en menos de ${horas} horas: ${nombre}`,
    lineas: [
      `En menos de ${horas} horas tienes cita con <strong>${esc(nombre)}</strong>:`,
      `<strong>Servicio:</strong> ${esc(lista_)}<br><strong>Fecha:</strong> ${esc(fEs)}<br><strong>Hora:</strong> ${esc(h)}<br><strong>Estado:</strong> ${esc(estadoTxt)}<br><strong>Teléfono:</strong> ${esc(u.telefono || '—')}`
    ],
    boton: { texto: 'Abrir el panel', url: SITIO() + '/admin.html' }
  };
  const entregasAdmin = destinosAdmin().map(dest => entregar(dest, {
    tipo: `recordatorio_${horas}h_admin`, id_cita: idCita,
    titulo: `Cita en menos de ${horas} horas: ${nombre}`, mensaje: adminMsg,
    correo: { asunto: `Cita en menos de ${horas} horas: ${nombre} – ${fEs}, ${h}`, html: correoHTML(aEs), texto: correoTexto(aEs) },
    push: { titulo: `Cita en menos de ${horas} horas: ${nombre}`, mensaje: adminMsg, url: '/admin.html', tag: `recordatorio-${horas}h-admin-` + idCita },
    whatsapp: { plantilla: pl.adminRecordatorio, parametros: [nombre, lista_, fEs, h] }
  }));
  await Promise.allSettled([entregaCliente, ...entregasAdmin]);
}

// ───────────────── Evento 3: la cita cambia (confirmada, cancelada o reprogramada) ─────────────────
// evento: 'confirmada' | 'cancelada' | 'reprogramada'
// d: { id_usuario, servicios, fecha, hora, citaIds, por: 'admin' | 'cliente',
//      abonoPagado (la cita estaba confirmada), horasAntes (al cancelar el cliente), fechaAnterior, horaAnterior (al reprogramar) }
async function notificarCambioCita(evento, d) {
  const u = db.prepare('SELECT id_usuario, nombre, apellido, email, telefono FROM usuarios WHERE id_usuario = ?').get(d.id_usuario);
  if (!u || !d.servicios || !d.servicios.length) return;
  const nombre = nombreDe(u), lista_ = textoServicios(d.servicios), listaEn = textoServiciosEn(d.servicios), h = hora12(d.hora);
  const fEs = fechaLarga(d.fecha, 'es'), fEn = fechaLarga(d.fecha, 'en');
  const idCita = (d.citaIds || [])[0];
  const pl = PLANTILLAS();
  const datosEs = `<strong>Servicio:</strong> ${esc(lista_)}<br><strong>Fecha:</strong> ${esc(fEs)}<br><strong>Hora:</strong> ${esc(h)}`;
  const datosEn = `<strong>Service:</strong> ${esc(listaEn)}<br><strong>Date:</strong> ${esc(fEn)}<br><strong>Time:</strong> ${esc(h)}`;
  const boton = (es, en) => ({
    es: { texto: 'Escribir por WhatsApp', url: enlaceWhatsAppNegocio(es) },
    en: { texto: 'Message us on WhatsApp', url: enlaceWhatsAppNegocio(en) }
  });
  const perdioAbono = d.horasAntes != null && d.horasAntes < 24;
  let cli, adm = null;

  if (evento === 'confirmada') {
    cli = {
      tipo: 'cita_confirmada', plantilla: pl.clienteConfirmada, params: [u.nombre, fEs, h, lista_],
      tEs: 'Cita confirmada', tEn: 'Appointment confirmed',
      mEs: `Tu cita de ${lista_} del ${fEs} a las ${h} está confirmada. ¡Recibimos tu abono, te esperamos!`,
      mEn: `Your appointment for ${listaEn} on ${fEn} at ${h} is confirmed. We received your deposit, see you soon!`,
      lEs: [`Hola ${esc(u.nombre)}, ¡tu cita está confirmada!`, datosEs, 'Recibimos tu abono de <strong>$50</strong>. ¡Te esperamos!', 'Recuerda: cancelar con menos de 24 horas de anticipación implica perder el abono.'],
      lEn: [`Hi ${esc(u.nombre)}, your appointment is confirmed!`, datosEn, 'We received your <strong>$50</strong> deposit. See you soon!', 'Please note: cancelling with less than 24 hours notice means losing the deposit.']
    };
  } else if (evento === 'cancelada') {
    const porCliente = d.por === 'cliente';
    const dineroEs = !d.abonoPagado ? '' : (porCliente
      ? (perdioAbono ? ' Según nuestros términos y condiciones, al cancelar con menos de 24 horas de anticipación se pierde el abono de $50.' : ' Para solicitar el reembolso de tu abono, escríbenos por WhatsApp.')
      : ' Si tienes dudas sobre tu abono, escríbenos por WhatsApp.');
    const dineroEn = !d.abonoPagado ? '' : (porCliente
      ? (perdioAbono ? ' According to our terms and conditions, cancelling with less than 24 hours notice means losing the $50 deposit.' : ' To request a refund of your deposit, message us on WhatsApp.')
      : ' If you have questions about your deposit, message us on WhatsApp.');
    cli = {
      tipo: 'cita_cancelada', plantilla: pl.clienteCancelada, params: [u.nombre, fEs, h, lista_],
      tEs: 'Cita cancelada', tEn: 'Appointment cancelled',
      mEs: (porCliente ? `Cancelaste tu cita de ${lista_} del ${fEs} a las ${h}.` : `Tu cita de ${lista_} del ${fEs} a las ${h} fue cancelada.`) + dineroEs,
      mEn: (porCliente ? `You cancelled your appointment for ${listaEn} on ${fEn} at ${h}.` : `Your appointment for ${listaEn} on ${fEn} at ${h} was cancelled.`) + dineroEn,
      lEs: [`Hola ${esc(u.nombre)}, ${porCliente ? 'cancelaste' : 'se canceló'} esta cita:`, datosEs].concat(dineroEs ? [esc(dineroEs.trim())] : []),
      lEn: [`Hi ${esc(u.nombre)}, ${porCliente ? 'you cancelled' : 'we cancelled'} this appointment:`, datosEn].concat(dineroEn ? [esc(dineroEn.trim())] : []),
      boton: dineroEs ? boton(`Hola, cancelé mi cita en CESGLOW (${lista_}, ${d.fecha} ${h}). Quiero hablar sobre mi abono.`, `Hi, I cancelled my CESGLOW appointment (${listaEn}, ${d.fecha} ${h}). I'd like to talk about my deposit.`) : null
    };
    if (porCliente) {
      const nota = !d.abonoPagado ? 'Aún no tenía abono confirmado.' : (perdioAbono ? 'Canceló con menos de 24 horas: pierde el abono de $50.' : 'Canceló con 24 horas o más: puede pedir el reembolso del abono.');
      adm = {
        tipo: 'cita_cancelada_admin', plantilla: pl.adminCancelada, params: [nombre, fEs, h, lista_],
        titulo: `Cita cancelada: ${nombre}`, mensaje: `${lista_} · ${fEs}, ${h}. ${nota}`,
        lineas: [`<strong>${esc(nombre)}</strong> canceló su cita:`, datosEs + `<br><strong>Teléfono:</strong> ${esc(u.telefono || '—')}`, esc(nota)]
      };
    }
  } else if (evento === 'reprogramada') {
    const fAntesEs = fechaLarga(d.fechaAnterior, 'es'), fAntesEn = fechaLarga(d.fechaAnterior, 'en'), hAntes = hora12(d.horaAnterior);
    cli = {
      tipo: 'cita_reprogramada', plantilla: pl.clienteReprogramada, params: [u.nombre, fEs, h, lista_],
      tEs: 'Cita reprogramada', tEn: 'Appointment rescheduled',
      mEs: `Tu cita de ${lista_} se reprogramó para el ${fEs} a las ${h} (antes: ${fAntesEs}, ${hAntes}).`,
      mEn: `Your appointment for ${listaEn} was rescheduled to ${fEn} at ${h} (before: ${fAntesEn}, ${hAntes}).`,
      lEs: [`Hola ${esc(u.nombre)}, tu cita se reprogramó:`, datosEs, `Antes era: ${esc(fAntesEs)}, ${esc(hAntes)}.`],
      lEn: [`Hi ${esc(u.nombre)}, your appointment was rescheduled:`, datosEn, `It used to be: ${esc(fAntesEn)}, ${esc(hAntes)}.`]
    };
    if (d.por === 'cliente') {
      adm = {
        tipo: 'cita_reprogramada_admin', plantilla: pl.adminReprogramada, params: [nombre, fEs, h, lista_],
        titulo: `Cita reprogramada: ${nombre}`, mensaje: `${lista_} · ahora ${fEs}, ${h} (antes ${fAntesEs}, ${hAntes})`,
        lineas: [`<strong>${esc(nombre)}</strong> reprogramó su cita:`, datosEs + `<br><strong>Teléfono:</strong> ${esc(u.telefono || '—')}`, `Antes era: ${esc(fAntesEs)}, ${esc(hAntes)}.`]
      };
    }
  } else { return; }

  const tag = `${cli.tipo}-${idCita}`;
  const tEs = { titulo: cli.tEs, lineas: cli.lEs, boton: cli.boton ? cli.boton.es : null };
  const tEn = { titulo: cli.tEn, lineas: cli.lEn, boton: cli.boton ? cli.boton.en : null };
  const entregas = [entregar({ id_usuario: u.id_usuario, email: u.email, telefono: u.telefono }, {
    tipo: cli.tipo, id_cita: idCita, titulo: cli.tEs, mensaje: cli.mEs, titulo_en: cli.tEn, mensaje_en: cli.mEn,
    correo: { asunto: `${cli.tEs} / ${cli.tEn} – CESGLOW`, html: correoHTML(tEs, tEn), texto: correoTexto(tEs, tEn) },
    push: { titulo: `${cli.tEs} / ${cli.tEn}`, mensaje: cli.mEs, url: '/', tag },
    whatsapp: { plantilla: cli.plantilla, parametros: cli.params }
  })];
  if (adm) {
    const aEs = { titulo: adm.titulo, lineas: adm.lineas, boton: { texto: 'Abrir el panel', url: SITIO() + '/admin.html' } };
    destinosAdmin().forEach(dest => entregas.push(entregar(dest, {
      tipo: adm.tipo, id_cita: idCita, titulo: adm.titulo, mensaje: adm.mensaje,
      correo: { asunto: adm.titulo, html: correoHTML(aEs), texto: correoTexto(aEs) },
      push: { titulo: adm.titulo, mensaje: adm.mensaje, url: '/admin.html', tag: tag + '-admin' },
      whatsapp: { plantilla: adm.plantilla, parametros: adm.params }
    })));
  }
  await Promise.allSettled(entregas);
}

// Revisión periódica (cada 10 minutos) + limpieza de avisos viejos
let temporizador = null;
function iniciarRecordatorios() {
  if (temporizador) return;
  const ciclo = async () => {
    await revisarRecordatorios();
    try { db.prepare("DELETE FROM notificaciones WHERE fecha_creacion < datetime('now', '-60 days')").run(); } catch (e) {}
  };
  temporizador = setInterval(ciclo, 10 * 60 * 1000);
  temporizador.unref();
  setTimeout(ciclo, 15000).unref();     // al arrancar, por si el servidor estuvo apagado un rato
  const activos = [correoActivo() && 'correo', pushActivo() && 'push', whatsappActivo() && 'whatsapp'].filter(Boolean);
  console.log('Notificaciones activas: campanita' + (activos.length ? ', ' + activos.join(', ') : '') + ` · zona horaria: ${TZ()}`);
}

module.exports = {
  notificarCitaAgendada, notificarCambioCita, revisarRecordatorios, iniciarRecordatorios, zonaNegocio: TZ,
  // se exportan para pruebas y para la ruta de suscripción push
  pushActivo, normalizarTelefono, aLocalISO
};
