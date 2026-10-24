// HASHTAG Lounge & Hookah Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push bildirim desteği (Web Push API - Kilit Ekranı)
self.addEventListener('push', (event) => {
  let data = {
    title: '🔥 HASHTAG Servis Çağrısı',
    body: 'Yeni bir masa çağrısı geldi!',
    icon: 'hashtag-logo.jpg',
    tag: 'hashtag-call'
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = Object.assign(data, payload);
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || 'hashtag-logo.jpg',
    badge: 'hashtag-logo.jpg',
    vibrate: [300, 150, 300, 150, 450],
    tag: data.tag || 'hashtag-call',
    renotify: true,
    requireInteraction: true,
    data: { url: '/personel' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('personel') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/personel');
      }
    })
  );
});
