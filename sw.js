// HASHTAG Lounge & Hookah Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push bildirim desteği (Web Push API)
self.addEventListener('push', (event) => {
  let data = { title: 'HASHTAG Çağrı', body: 'Yeni masa çağrısı var!' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || 'Masa çağrısı',
    icon: 'hashtag-logo.jpg',
    badge: 'hashtag-logo.jpg',
    vibrate: [200, 100, 200, 100, 300],
    data: { url: '/personel' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'HASHTAG Personel', options)
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
