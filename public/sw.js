// Service worker de CESGLOW: recibe los avisos push y los muestra, incluso con la página cerrada.
// Debe quedar en la RAÍZ del sitio (junto a index.html) para poder abrir cualquier página.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { mensaje: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.titulo || 'CESGLOW', {
    body: d.mensaje || '',
    icon: '/images/logo-icon.png',
    badge: '/images/logo-icon.png',
    tag: d.tag || undefined,
    data: { url: d.url || '/' }
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var destino = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (ventanas) {
    for (var i = 0; i < ventanas.length; i++) {
      if (ventanas[i].url === destino && 'focus' in ventanas[i]) return ventanas[i].focus();
    }
    return self.clients.openWindow(destino);
  }));
});
