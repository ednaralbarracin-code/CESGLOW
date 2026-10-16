// CESGLOW-main/public/js/notificaciones.js
let swRegistration = null;

async function initNotificaciones() {
  if (!('Notification' in window)) return;

  if ('serviceWorker' in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register('/sw.js');
    } catch (e) {
      console.warn('SW no registrado:', e);
    }
  }

  // Polling para chequear notificaciones en segundo plano
  setInterval(async () => {
    try {
      const res = await fetch('/api/notificaciones/no-leidas');
      if (!res.ok) return;
      const notifs = await res.json();
      notifs.forEach((n) => {
        mostrarNotificacionNavegador(n.titulo, n.mensaje);
        fetch(`/api/notificaciones/${n.id}/marcar-leida`, { method: 'PUT' });
      });
    } catch (err) {}
  }, 25000);
}

async function solicitarPermisoNotificaciones() {
  if (!('Notification' in window)) return;
  const permiso = await Notification.requestPermission();
  if (permiso === 'granted') {
    mostrarNotificacionNavegador('✨ CESGLOW', '¡Notificaciones fuera de la página activadas!');
  }
}

async function mostrarNotificacionNavegador(titulo, mensaje, data = {}) {
  if (Notification.permission !== 'granted') return;

  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    const reg = await navigator.serviceWorker.ready;
    return reg.showNotification(titulo, {
      body: mensaje,
      icon: '/images/favicon.png',
      tag: `cesglow-${Date.now()}`,
      requireInteraction: true,
      data
    });
  }

  new Notification(titulo, { body: mensaje, icon: '/images/favicon.png' });
}

document.addEventListener('DOMContentLoaded', initNotificaciones);