/* CESGLOW · Botón "Reprogramar" en Mis citas (clientes)
 * Se carga con una línea:  <script src="js/reprogramar.js"></script>   (después de auth.js)
 * Agrega un botón "Reprogramar" junto a "Cancelar cita" de cada cita. Reglas (las hace cumplir el servidor):
 *  - solo citas pendientes o confirmadas, con al menos 24 horas de anticipación
 *  - se mueve la visita completa (si reservó varios servicios seguidos, se mueven juntos)
 */
(function () {
  'use strict';
  var BACKEND_URL = 'https://bsc-beauty-skin-care-production.up.railway.app';
  var TOKEN_KEY = 'beautyToken';
  var lista = document.getElementById('listaCitas');
  if (!lista) return;

  function tr(s) { return typeof window.t === 'function' ? window.t(s) : s; }
  function token() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hoyISO() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function hora12(hhmm) { var h = parseInt(hhmm.slice(0, 2), 10); return ((h % 12) || 12) + ':' + hhmm.slice(3, 5) + ' ' + (h >= 12 ? 'PM' : 'AM'); }
  function fechaLarga(iso) {
    var p = String(iso).slice(0, 10).split('-');
    var loc = typeof window.getLocale === 'function' ? window.getLocale() : 'es-ES';
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  // ───────── botón junto a "Cancelar cita" ─────────
  function inyectar() {
    lista.querySelectorAll('button[onclick^="cancelarCita("]').forEach(function (cancelar) {
      if (cancelar.dataset.bscReprog) return;
      cancelar.dataset.bscReprog = '1';
      var m = /cancelarCita\((\d+)/.exec(cancelar.getAttribute('onclick') || '');
      if (!m) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'bsc-reprog-btn';
      b.textContent = tr('Reprogramar');
      b.style.cssText = cancelar.style.cssText;
      b.style.background = 'transparent';
      b.style.color = '#D8B4A0';
      b.style.border = '1px solid #D8B4A0';
      b.style.marginRight = '8px';
      b.addEventListener('click', function () { abrir(m[1], cancelar.dataset.fecha, cancelar.dataset.servicio); });
      cancelar.parentNode.insertBefore(b, cancelar);
    });
  }
  new MutationObserver(inyectar).observe(lista, { childList: true, subtree: true });
  inyectar();
  document.addEventListener('bsc:languagechange', function () {
    document.querySelectorAll('.bsc-reprog-btn').forEach(function (b) { b.textContent = tr('Reprogramar'); });
  });

  // ───────── ventana para elegir la fecha y hora nuevas ─────────
  function abrir(id, fechaActual, servicio) {
    var previo = document.getElementById('bscReprogPopup'); if (previo) previo.remove();
    var horas = [];
    for (var h = 9; h <= 17; h++) { horas.push(String(h).padStart(2, '0') + ':00'); if (h < 17) horas.push(String(h).padStart(2, '0') + ':30'); }
    var actual = String(fechaActual || '');
    var pop = document.createElement('div');
    pop.id = 'bscReprogPopup';
    pop.className = 'wa-popup';
    pop.style.zIndex = '7000';
    pop.innerHTML =
      '<form class="wa-popup-box" style="text-align:left;max-width:380px;" novalidate>' +
        '<h3 class="wa-popup-title" style="text-align:center;">' + esc(tr('Reprogramar cita')) + '</h3>' +
        '<p style="margin:0 0 4px;font-weight:600;">' + esc(tr(servicio || '')) + '</p>' +
        '<p style="margin:0 0 14px;font-size:14px;color:#CFCFCF;">' + esc(tr('Ahora:')) + ' ' + esc(fechaLarga(actual)) + (actual.length >= 16 ? ', ' + esc(hora12(actual.slice(11, 16))) : '') + '</p>' +
        '<label style="display:block;font-size:13px;margin-bottom:4px;">' + esc(tr('Nueva fecha')) + '</label>' +
        '<input type="date" id="bscRpFecha" min="' + hoyISO() + '" style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(216,180,160,.5);background:#242020;color:#fff;margin-bottom:12px;color-scheme:dark;">' +
        '<label style="display:block;font-size:13px;margin-bottom:4px;">' + esc(tr('Nueva hora')) + '</label>' +
        '<select id="bscRpHora" style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(216,180,160,.5);background:#242020;color:#fff;margin-bottom:8px;">' +
          horas.map(function (x) { return '<option value="' + x + '">' + hora12(x) + '</option>'; }).join('') +
        '</select>' +
        '<p id="bscRpOcupado" style="font-size:12px;color:#CFCFCF;margin:0 0 10px;min-height:16px;"></p>' +
        '<p style="font-size:12px;color:#CFCFCF;margin:0 0 12px;">' + esc(tr('Puedes reprogramar con al menos 24 horas de anticipación.')) + '</p>' +
        '<div id="bscRpError" style="display:none;color:#FF8A8A;font-size:14px;margin-bottom:10px;"></div>' +
        '<button type="submit" class="btn btn-primary btn-full" id="bscRpOk">' + esc(tr('Confirmar cambio')) + '</button>' +
        '<button type="button" class="wa-popup-cancel" id="bscRpNo" style="display:block;margin:10px auto 0;">' + esc(tr('Cancelar')) + '</button>' +
      '</form>';
    document.body.appendChild(pop);
    var $ = function (s) { return pop.querySelector(s); };
    function cerrar() { document.removeEventListener('keydown', tecla); pop.remove(); }
    function tecla(e) { if (e.key === 'Escape') cerrar(); }
    document.addEventListener('keydown', tecla);
    $('#bscRpNo').addEventListener('click', cerrar);
    var f = $('#bscRpFecha'); f.focus();

    // horarios ya ocupados ese día (informativo; el servidor revisa de verdad al confirmar)
    f.addEventListener('change', function () {
      var el = $('#bscRpOcupado'); el.textContent = '';
      if (!f.value) return;
      fetch(BACKEND_URL + '/api/citas/ocupadas?fecha=' + encodeURIComponent(f.value))
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (lista) {
          if (Array.isArray(lista) && lista.length) {
            el.textContent = tr('Horarios ocupados ese día:') + ' ' + lista.map(function (x) { return hora12(x.inicio) + ' – ' + hora12(x.fin); }).join(', ');
          }
        }).catch(function () {});
    });

    $('form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var err = $('#bscRpError'); err.style.display = 'none';
      if (!f.value) { err.textContent = tr('Elige la nueva fecha.'); err.style.display = 'block'; return; }
      var ok = $('#bscRpOk'); ok.disabled = true;
      fetch(BACKEND_URL + '/api/citas/' + id + '/reprogramar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() },
        body: JSON.stringify({ fecha: f.value, hora: $('#bscRpHora').value })
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) {
            var sesion = (res.status === 401 || res.status === 403) && /^(No autorizado|Token)/.test(data.error || '');
            throw new Error(sesion ? tr('Tu sesión expiró. Inicia sesión de nuevo.') : tr(data.error || 'Ocurrió un error. Intenta de nuevo.'));
          }
          cerrar();
          if (typeof showNotification === 'function') showNotification(tr('Cita reprogramada'), 'success');
          if (typeof mostrarMisCitas === 'function') mostrarMisCitas({ preventDefault: function () {} });
          if (typeof refreshCalendar === 'function' && refreshCalendar) { try { refreshCalendar(); } catch (e) {} }
        });
      }).catch(function (e) {
        ok.disabled = false;
        err.textContent = e && e.message && e.message !== 'Failed to fetch' ? e.message : tr('Error de conexión. Intenta de nuevo.');
        err.style.display = 'block';
      });
    });
  }
})();
