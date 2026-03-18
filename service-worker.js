// service-worker.js - v2.0.0 с поддержкой напоминаний
const CACHE_NAME = 'events-diary-v2.0.0';
const CACHE_PREFIX = 'events-diary';

const INITIAL_CACHE = [
  '/events-diary/',
  '/events-diary/index.html',
  '/events-diary/manifest.json',
  '/events-diary/privacy.html',
  '/events-diary/service-worker.js',
  '/events-diary/maskable_icon_x192.png',
  '/events-diary/maskable_icon_x512.png'
];

self.addEventListener('install', event => {
  console.log('[SW] Установка версии:', CACHE_NAME);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return Promise.allSettled(
          INITIAL_CACHE.map(url => {
            return cache.add(url).catch(error => {
              console.error('[SW] Ошибка кэширования:', url, error.message);
            });
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Активация новой версии');
  
  event.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(name => {
            if (name !== CACHE_NAME && name.startsWith(CACHE_PREFIX)) {
              console.log('[SW] Удаляем старый кэш:', name);
              return caches.delete(name);
            }
          })
        );
      }),
      self.clients.claim()
    ])
  );
});

// ==================== СИСТЕМА НАПОМИНАНИЙ ====================

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SCHEDULE_REMINDER') {
    const { eventId, title, datetime, repeat } = event.data;
    scheduleReminder(eventId, title, datetime, repeat);
  }
  
  if (event.data && event.data.type === 'CANCEL_REMINDER') {
    const { eventId } = event.data;
    cancelReminder(eventId);
  }
});

function scheduleReminder(eventId, title, datetime, repeat) {
  const reminderTime = new Date(datetime).getTime();
  const now = Date.now();
  const delay = reminderTime - now;
  
  if (delay <= 0) return;
  
  self.registration.showNotification(
    `🔔 Напоминание: ${title}`,
    {
      body: `Мероприятие запланировано на ${new Date(datetime).toLocaleString('ru-RU')}`,
      icon: '/events-diary/maskable_icon_x192.png',
      badge: '/events-diary/maskable_icon_x72.png',
      tag: `reminder-${eventId}`,
      renotify: true,
      requireInteraction: true,
      data: {
        eventId: eventId,
        datetime: datetime,
        repeat: repeat
      },
      actions: [
        { action: 'open', title: '📋 Открыть' },
        { action: 'snooze15', title: '⏰ +15 мин' },
        { action: 'snooze60', title: '⏰ +1 час' },
        { action: 'complete', title: '✅ Выполнено' }
      ]
    }
  );
  
  if (repeat !== 'none') {
    scheduleNextRepeat(eventId, title, new Date(datetime), repeat);
  }
}

function scheduleNextRepeat(eventId, title, lastDate, repeat) {
  let nextDate = new Date(lastDate);
  
  switch(repeat) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'yearly':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
    default:
      return;
  }
  
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'SCHEDULE_NEXT_REMINDER',
        eventId: eventId,
        nextDatetime: nextDate.toISOString(),
        repeat: repeat
      });
    });
  });
}

function cancelReminder(eventId) {
  self.registration.getNotifications({ tag: `reminder-${eventId}` })
    .then(notifications => {
      notifications.forEach(notification => notification.close());
    });
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const action = event.action;
  const data = event.notification.data;
  
  if (action === 'open') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clientList => {
          for (const client of clientList) {
            if (client.url.includes('/events-diary/') && 'focus' in client) {
              client.postMessage({
                type: 'OPEN_EVENT',
                eventId: data.eventId
              });
              return client.focus();
            }
          }
          return clients.openWindow(`/events-diary/?event=${data.eventId}`);
        })
    );
  }
  
  if (action === 'snooze15') {
    const newTime = new Date(data.datetime);
    newTime.setMinutes(newTime.getMinutes() + 15);
    
    event.waitUntil(
      clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SNOOZE_REMINDER',
            eventId: data.eventId,
            newDatetime: newTime.toISOString()
          });
        });
      })
    );
  }
  
  if (action === 'snooze60') {
    const newTime = new Date(data.datetime);
    newTime.setHours(newTime.getHours() + 1);
    
    event.waitUntil(
      clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SNOOZE_REMINDER',
            eventId: data.eventId,
            newDatetime: newTime.toISOString()
          });
        });
      })
    );
  }
  
  if (action === 'complete') {
    event.waitUntil(
      clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'COMPLETE_EVENT',
            eventId: data.eventId
          });
        });
      })
    );
  }
});

self.addEventListener('fetch', event => {
  const { request } = event;
  
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, networkResponse.clone());
            return networkResponse;
          }
        } catch (error) {
          console.log('[SW] Сеть недоступна, ищем в кэше');
        }

        const urlsToTry = [
          request.url,
          '/events-diary/',
          '/events-diary/index.html'
        ];
        
        for (const url of urlsToTry) {
          const cachedResponse = await caches.match(url);
          if (cachedResponse) return cachedResponse;
        }

        return new Response(
          `<!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>Дневник Мероприятий</title>
              <style>
                body { 
                  font-family: system-ui, -apple-system, sans-serif; 
                  text-align: center; 
                  padding: 2rem;
                  background: #1a1a2e;
                  color: #f0f0f0;
                }
                .offline { 
                  color: #9d4edd; 
                  margin: 2rem 0;
                }
              </style>
            </head>
            <body>
              <h3>Мой Дневник Мероприятий</h3>
              <p class="offline">Вы в офлайн-режиме</p>
              <p>Для обновления данных подключитесь к интернету</p>
            </body>
          </html>`,
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) return cachedResponse;

      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        return new Response('', { status: 404 });
      }
    })()
  );
});