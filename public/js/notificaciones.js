/* CESGLOW · Campanita de notificaciones (clientes y administrador)
 * Se carga con una sola línea:  <script src="js/notificaciones.js"></script>
 * - Si existe un elemento con id="bscBell" se dibuja ahí; si no, aparece una campanita flotante abajo a la derecha.
 * - Solo se muestra con la sesión iniciada. Usa la misma sesión del sitio (beautyToken).
 */
(function () {
  'use strict';
  if (window.__bscNotificaciones) return;
  window.__bscNotificaciones = true;

  var BACKEND_URL = 'https://bsc-beauty-skin-care-production.up.railway.app';
  var TOKEN_KEY = 'beautyToken';
  var POLL_MS = 60000;

  var TXT = {
    es: {
      titulo: 'Notificaciones', vacio: 'No tienes notificaciones.', leerTodas: 'Marcar todas como leídas',
      activar: 'Activar avisos en este dispositivo', desactivar: 'Desactivar avisos en este dispositivo',
      activados: 'Avisos activados en este dispositivo.',
      bloqueado: 'Los avisos están bloqueados en tu navegador. Actívalos en la configuración del sitio.',
      noDisponible: 'Los avisos en el dispositivo aún no están disponibles.',
      iphone: 'En iPhone: toca Compartir y elige "Añadir a pantalla de inicio" para recibir avisos.',
      ahora: 'ahora', min: 'hace {n} min', h: 'hace {n} h', d: 'hace {n} d',
      error: 'No se pudo completar la acción. Intenta de nuevo.', aria: 'Notificaciones',
      avisoPush: '¿Quieres recibir avisos de tus citas en este dispositivo?', activarCorto: 'Activar', ahoraNo: 'Ahora no'
    },
    en: {
      titulo: 'Notifications', vacio: 'You have no notifications.', leerTodas: 'Mark all as read',
      activar: 'Turn on alerts on this device', desactivar: 'Turn off alerts on this device',
      activados: 'Alerts are on for this device.',
      bloqueado: 'Alerts are blocked in your browser. Enable them in the site settings.',
      noDisponible: 'Device alerts are not available yet.',
      iphone: 'On iPhone: tap Share and choose "Add to Home Screen" to receive alerts.',
      ahora: 'now', min: '{n} min ago', h: '{n} h ago', d: '{n} d ago',
      error: 'The action could not be completed. Please try again.', aria: 'Notifications',
      avisoPush: 'Would you like to get alerts about your appointments on this device?', activarCorto: 'Turn on', ahoraNo: 'Not now'
    }
  };
  function lang() { try { return localStorage.getItem('bscLang') === 'en' ? 'en' : 'es'; } catch (e) { return 'es'; } }
  function t(k, n) { return String(TXT[lang()][k]).replace('{n}', n); }

  function token() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }

  // ───────── estilos ─────────
  var css = [
    '.bscn-host{position:relative;display:inline-block;font-family:Poppins,Arial,sans-serif}',
    '.bscn-host[hidden]{display:none}',
    '.bscn-flotante{position:fixed;right:16px;bottom:16px;z-index:1500}',
    '.bscn-btn{width:46px;height:46px;border-radius:50%;border:1px solid rgba(216,180,160,.55);background:#2d2828;color:#D8B4A0;cursor:pointer;display:flex;align-items:center;justify-content:center;position:relative;box-shadow:0 4px 14px rgba(0,0,0,.35);padding:0}',
    '.bscn-host:not(.bscn-flotante) .bscn-btn{width:38px;height:38px;box-shadow:none}',
    '.bscn-btn:hover{border-color:#D8B4A0;background:#342e2e}',
    '.bscn-btn svg{width:22px;height:22px}',
    '.bscn-badge{position:absolute;top:-5px;right:-5px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#ef4444;color:#fff;font:600 11px/20px Poppins,Arial,sans-serif;text-align:center}',
    '.bscn-badge[hidden]{display:none}',
    '.bscn-panel{position:fixed;width:min(360px,calc(100vw - 24px));max-height:min(70vh,520px);display:flex;flex-direction:column;background:#2d2828;color:#fff;border:1px solid rgba(216,180,160,.35);border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.5);overflow:hidden;z-index:1600;text-align:left}',
    '.bscn-panel[hidden]{display:none}',
    '.bscn-flotante .bscn-panel{right:16px;bottom:74px}',
    '.bscn-host:not(.bscn-flotante) .bscn-panel{right:16px;top:64px}',
    '@media (max-width:480px){.bscn-panel{left:12px;right:12px;width:auto}.bscn-flotante .bscn-panel{right:12px}.bscn-host:not(.bscn-flotante) .bscn-panel{right:12px}}',
    '.bscn-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(216,180,160,.25)}',
    '.bscn-head strong{font-size:15px}',
    '.bscn-link{background:none;border:none;color:#D8B4A0;font:500 12px Poppins,Arial,sans-serif;cursor:pointer;padding:2px 0;text-decoration:underline}',
    '.bscn-link:disabled{opacity:.5;cursor:default}',
    '.bscn-lista{list-style:none;margin:0;padding:0;overflow-y:auto;flex:1}',
    '.bscn-item{display:grid;grid-template-columns:10px 1fr;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(216,180,160,.15);cursor:pointer}',
    '.bscn-item:hover{background:#342e2e}',
    '.bscn-punto{width:8px;height:8px;border-radius:50%;margin-top:6px;background:transparent}',
    '.bscn-item.nueva .bscn-punto{background:#D8B4A0}',
    '.bscn-tit{font-size:14px;font-weight:600;line-height:1.3;word-break:break-word}',
    '.bscn-msg{font-size:13px;color:#e3e3e3;margin-top:2px;line-height:1.45;word-break:break-word}',
    '.bscn-hora{font-size:12px;color:#b9b0b0;margin-top:4px}',
    '.bscn-vacio{padding:26px 14px;text-align:center;color:#cfcfcf;font-size:14px}',
    '.bscn-pie{padding:10px 14px;border-top:1px solid rgba(216,180,160,.25);font-size:12px;color:#cfcfcf;display:grid;gap:6px}',
    '.bscn-pie[hidden]{display:none}',
    '.bscn-aviso{position:fixed;width:min(320px,calc(100vw - 24px));background:#2d2828;color:#fff;border:1px solid rgba(216,180,160,.5);border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.5);padding:14px;z-index:1550;font-family:Poppins,Arial,sans-serif;font-size:14px;line-height:1.5}',
    '.bscn-aviso.flotante{right:16px;bottom:74px}',
    '.bscn-aviso.inline{right:16px;top:64px}',
    '.bscn-aviso .bscn-fila{display:flex;gap:8px;margin-top:10px;justify-content:flex-end}',
    '.bscn-aviso button{font:500 13px Poppins,Arial,sans-serif;padding:7px 14px;border-radius:18px;cursor:pointer;border:1px solid rgba(216,180,160,.5);background:transparent;color:#fff}',
    '.bscn-aviso button.si{background:#D8B4A0;border-color:#D8B4A0}',
    '@media (max-width:480px){.bscn-aviso{left:12px;right:12px;width:auto}}'
  ].join('');
  var estilo = document.createElement('style');
  estilo.textContent = css;
  document.head.appendChild(estilo);

  // ───────── estructura ─────────
  var host, btn, badge, panel, lista, pie, btnTodas, tituloEl;
  function montar() {
    host = document.getElementById('bscBell');
    var flotante = !host;
    if (flotante) {
      host = document.createElement('div');
      host.id = 'bscBell';
      host.className = 'bscn-flotante';
      document.body.appendChild(host);
    }
    host.classList.add('bscn-host');
    host.hidden = true;
    host.innerHTML =
      '<button type="button" class="bscn-btn" aria-haspopup="true" aria-expanded="false">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>' +
        '<span class="bscn-badge" hidden>0</span>' +
      '</button>' +
      '<div class="bscn-panel" role="dialog" hidden>' +
        '<div class="bscn-head"><strong></strong><button type="button" class="bscn-link bscn-todas"></button></div>' +
        '<ul class="bscn-lista"></ul>' +
        '<div class="bscn-pie" hidden></div>' +
      '</div>';
    btn = host.querySelector('.bscn-btn');
    badge = host.querySelector('.bscn-badge');
    panel = host.querySelector('.bscn-panel');
    lista = host.querySelector('.bscn-lista');
    pie = host.querySelector('.bscn-pie');
    btnTodas = host.querySelector('.bscn-todas');
    tituloEl = host.querySelector('.bscn-head strong');

    btn.addEventListener('click', function (e) { e.stopPropagation(); alternar(); });
    btnTodas.addEventListener('click', marcarTodas);
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', cerrar);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrar(); });
  }

  // ───────── estado y servidor ─────────
  var items = [], noLeidas = 0, abierto = false, sesionInvalida = false, ultimoToken = null;
  var pushDisponible = null;   // null = aún no se sabe; true/false

  function api(ruta, opc) {
    opc = opc || {};
    return fetch(BACKEND_URL + '/api/notificaciones' + ruta, {
      method: opc.method || 'GET',
      headers: Object.assign({ 'Authorization': 'Bearer ' + token() }, opc.body ? { 'Content-Type': 'application/json' } : {}),
      body: opc.body ? JSON.stringify(opc.body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
    });
  }

  function cargar() {
    if (!token() || sesionInvalida) return Promise.resolve();
    return api('/').then(function (r) {
      if (r.status === 401 || r.status === 403) { sesionInvalida = true; host.hidden = true; return; }
      if (!r.ok) return;
      items = r.data.items || [];
      noLeidas = r.data.no_leidas || 0;
      host.hidden = false;
      pintar();
      ofrecerPush();
    }).catch(function () { /* sin conexión: se reintenta en el próximo ciclo */ });
  }

  function hace(fecha) {
    var ms = Date.now() - new Date(String(fecha).replace(' ', 'T') + 'Z').getTime();
    var min = Math.max(0, Math.floor(ms / 60000));
    if (min < 1) return t('ahora');
    if (min < 60) return t('min', min);
    if (min < 1440) return t('h', Math.floor(min / 60));
    return t('d', Math.floor(min / 1440));
  }

  function pintar() {
    tituloEl.textContent = t('titulo');
    btnTodas.textContent = t('leerTodas');
    btnTodas.hidden = noLeidas === 0;
    btn.setAttribute('aria-label', t('aria') + (noLeidas ? ' (' + noLeidas + ')' : ''));
    badge.hidden = noLeidas === 0;
    badge.textContent = noLeidas > 99 ? '99+' : String(noLeidas);
    lista.textContent = '';
    if (!items.length) {
      var vacio = document.createElement('li');
      vacio.className = 'bscn-vacio';
      vacio.textContent = t('vacio');
      lista.appendChild(vacio);
      return;
    }
    var en = lang() === 'en';
    items.forEach(function (n) {
      var li = document.createElement('li');
      li.className = 'bscn-item' + (n.leida ? '' : ' nueva');
      var punto = document.createElement('span'); punto.className = 'bscn-punto';
      var cuerpo = document.createElement('div');
      var tit = document.createElement('div'); tit.className = 'bscn-tit'; tit.textContent = (en && n.titulo_en) || n.titulo;
      var msg = document.createElement('div'); msg.className = 'bscn-msg'; msg.textContent = (en && n.mensaje_en) || n.mensaje;
      var hora = document.createElement('div'); hora.className = 'bscn-hora'; hora.textContent = hace(n.fecha_creacion);
      cuerpo.appendChild(tit); cuerpo.appendChild(msg); cuerpo.appendChild(hora);
      li.appendChild(punto); li.appendChild(cuerpo);
      li.addEventListener('click', function () { marcarLeida(n); });
      lista.appendChild(li);
    });
  }

  function marcarLeida(n) {
    if (n.leida) return;
    n.leida = 1; noLeidas = Math.max(0, noLeidas - 1); pintar();
    api('/' + n.id_notificacion + '/leer', { method: 'PUT' }).catch(function () {});
  }
  function marcarTodas() {
    items.forEach(function (n) { n.leida = 1; });
    noLeidas = 0; pintar();
    api('/leer-todas', { method: 'PUT' }).catch(function () {});
  }

  function alternar() { abierto ? cerrar() : abrir(); }
  function abrir() {
    abierto = true; panel.hidden = false; btn.setAttribute('aria-expanded', 'true');
    cargar();
    pintarPie();
  }
  function cerrar() {
    if (!abierto) return;
    abierto = false; panel.hidden = true; btn.setAttribute('aria-expanded', 'false');
  }

  // ───────── avisos push en este dispositivo ─────────
  function soportaPush() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function esIphone() { return /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.navigator.standalone; }
  function b64aBytes(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function suscripcionActual() {
    return navigator.serviceWorker.getRegistration('/').then(function (reg) { return reg ? reg.pushManager.getSubscription() : null; });
  }

  function pintarPie() {
    pie.textContent = '';
    if (!soportaPush()) {
      if (esIphone()) { pie.hidden = false; var p = document.createElement('div'); p.textContent = t('iphone'); pie.appendChild(p); }
      else pie.hidden = true;
      return;
    }
    var preparar = pushDisponible === null
      ? api('/push/clave').then(function (r) { pushDisponible = !!(r.ok && r.data.clave); }).catch(function () { pushDisponible = false; })
      : Promise.resolve();
    preparar.then(function () {
      if (!pushDisponible) { pie.hidden = true; return; }
      return suscripcionActual().then(function (sub) {
        pie.hidden = false; pie.textContent = '';
        if (Notification.permission === 'denied') {
          var b = document.createElement('div'); b.textContent = t('bloqueado'); pie.appendChild(b); return;
        }
        if (sub) {
          var ok = document.createElement('div'); ok.textContent = t('activados'); pie.appendChild(ok);
          pie.appendChild(boton(t('desactivar'), desactivarPush));
        } else {
          pie.appendChild(boton(t('activar'), activarPush));
        }
      });
    }).catch(function () { pie.hidden = true; });
  }
  // Aviso amable para activar las notificaciones del dispositivo. Los navegadores no permiten pedir el permiso
  // "a ciegas" al entrar: hace falta un clic, por eso se muestra este cuadro con el botón Activar.
  var ofrecido = false;
  function ofrecerPush() {
    if (ofrecido || !soportaPush()) return;
    ofrecido = true;
    if (Notification.permission !== 'default') return;
    try { var no = parseInt(localStorage.getItem('bscPushNo') || '0', 10); if (no && Date.now() - no < 7 * 86400000) return; } catch (e) {}
    api('/push/clave').then(function (r) {
      if (!(r.ok && r.data.clave)) return;
      pushDisponible = true;
      return suscripcionActual().then(function (sub) { if (!sub) mostrarAviso(); });
    }).catch(function () {});
  }
  function mostrarAviso() {
    if (document.querySelector('.bscn-aviso')) return;
    var a = document.createElement('div');
    a.className = 'bscn-aviso ' + (host.classList.contains('bscn-flotante') ? 'flotante' : 'inline');
    a.setAttribute('role', 'dialog');
    var p = document.createElement('div'); p.textContent = t('avisoPush');
    var fila = document.createElement('div'); fila.className = 'bscn-fila';
    var no = document.createElement('button'); no.type = 'button'; no.textContent = t('ahoraNo');
    var si = document.createElement('button'); si.type = 'button'; si.className = 'si'; si.textContent = t('activarCorto');
    no.addEventListener('click', function () { try { localStorage.setItem('bscPushNo', String(Date.now())); } catch (e) {} a.remove(); });
    si.addEventListener('click', function () {
      si.disabled = true;
      activarPush().then(function () { a.remove(); pintarPie(); }, function () { a.remove(); });
    });
    fila.appendChild(no); fila.appendChild(si); a.appendChild(p); a.appendChild(fila);
    document.body.appendChild(a);
  }

  function boton(texto, fn) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'bscn-link'; b.textContent = texto;
    b.addEventListener('click', function () { b.disabled = true; fn().then(pintarPie, function () { b.disabled = false; aviso(t('error')); }); });
    return b;
  }
  function aviso(texto) {
    var d = document.createElement('div'); d.textContent = texto; d.style.color = '#FF8A8A';
    pie.appendChild(d); setTimeout(function () { d.remove(); }, 4000);
  }
  function activarPush() {
    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') return;
      return api('/push/clave').then(function (r) {
        if (!r.ok || !r.data.clave) throw new Error('sin clave');
        return navigator.serviceWorker.register('/sw.js').then(function () { return navigator.serviceWorker.ready; }).then(function (reg) {
          return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(r.data.clave) });
        });
      }).then(function (sub) {
        var j = sub.toJSON();
        return api('/push/suscribir', { method: 'POST', body: { endpoint: j.endpoint, keys: j.keys } }).then(function (res) { if (!res.ok) throw new Error('no se guardó'); });
      });
    });
  }
  function desactivarPush() {
    return suscripcionActual().then(function (sub) {
      if (!sub) return;
      var endpoint = sub.endpoint;
      return sub.unsubscribe().then(function () { return api('/push/suscribir', { method: 'DELETE', body: { endpoint: endpoint } }); });
    });
  }

  // ───────── ciclo ─────────
  montar();
  window.addEventListener('bsc:languagechange', function () { if (!host.hidden) { pintar(); if (abierto) pintarPie(); } });

  var ultimoSondeo = 0;
  function ciclo() {
    var tk = token();
    if (tk !== ultimoToken) {                 // inició o cerró sesión (o cambió de cuenta)
      ultimoToken = tk; sesionInvalida = false; items = []; noLeidas = 0;
      if (!tk) { host.hidden = true; cerrar(); return; }
      ultimoSondeo = Date.now(); cargar(); return;
    }
    if (tk && !sesionInvalida && document.visibilityState === 'visible' && Date.now() - ultimoSondeo >= POLL_MS) {
      ultimoSondeo = Date.now(); cargar();
    }
  }
  setInterval(ciclo, 3000);       // revisar si cambió la sesión es gratis (no usa la red); el servidor solo se consulta cada minuto
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { ultimoSondeo = 0; ciclo(); } });
  ciclo();
})();
