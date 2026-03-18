// service-worker.js - v2.2.0 с проверкой каждую минуту
const CACHE_NAME = 'events-diary-v2.2.0';
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

// Хранилище напоминаний
let reminders = [];

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
    ]).then(() => {
      // Запускаем проверку напоминаний каждую минуту
      setInterval(checkReminders, 60000);
      checkReminders(); // сразу проверим
    })
  );
});

// ==================== СИСТЕМА НАПОМИНАНИЙ ====================

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SCHEDULE_REMINDER') {
    const { eventId, title, datetime, repeat } = event.data;
    addReminder(eventId, title, datetime, repeat);
    console.log('[SW] Добавлено напоминание:', eventId, datetime);
  }
  
  if (event.data && event.data.type === 'CANCEL_REMINDER') {
    const { eventId } = event.data;
    removeReminder(eventId);
    console.log('[SW] Удалено напоминание:', eventId);
  }
  
  if (event.data && event.data.type === 'LOAD_REMINDERS') {
    const { reminders: loadedReminders } = event.data;
    reminders = loadedReminders;
    console.log('[SW] Загружено напоминаний:', reminders.length);
  }
  
  if (event.data && event.data.type === 'TEST_NOTIFICATION') {
    testNotification();
  }
});

function testNotification() {
  self.registration.showNotification('🔔 Тестовое уведомление', {
    body: 'Если вы это видите, уведомления работают!',
    icon: '/events-diary/maskable_icon_x192.png',
    badge: '/events-diary/maskable_icon_x72.png',
    tag: 'test-' + Date.now(),
    requireInteraction: true,
    actions: [
      { action: 'close', title: 'Закрыть' }
    ]
  });
}

function addReminder(eventId, title, datetime, repeat) {
  // Удаляем старое напоминание с таким же ID
  reminders = reminders.filter(r => r.eventId !== eventId);
  
  reminders.push({
    eventId,
    title,
    datetime,
    repeat,
    triggered: false
  });
  
  console.log('[SW] Текущие напоминания:', reminders);
}

function removeReminder(eventId) {
  reminders = reminders.filter(r => r.eventId !== eventId);
}

function checkReminders() {
  const now = Date.now();
  console.log('[SW] Проверка напоминаний...', new Date().toLocaleTimeString());
  
  reminders.forEach(reminder => {
    const reminderTime = new Date(reminder.datetime).getTime();
    
    // Проверяем, что время наступило (с погрешностью в 1 минуту)
    if (reminderTime <= now && !reminder.triggered) {
      console.log('[SW] ПОРА! Показываем напоминание:', reminder.eventId);
      
      // Показываем уведомление
      self.registration.showNotification(
        `🔔 Напоминание: ${reminder.title}`,
        {
          body: `Мероприятие запланировано на ${new Date(reminder.datetime).toLocaleString('ru-RU')}`,
          icon: '/events-diary/maskable_icon_x192.png',
          badge: '/events-diary/maskable_icon_x72.png',
          tag: `reminder-${reminder.eventId}`,
          renotify: true,
          requireInteraction: true,
          data: {
            eventId: reminder.eventId,
            datetime: reminder.datetime,
            repeat: reminder.repeat
          },
          actions: [
            { action: 'open', title: '📋 Открыть' },
            { action: 'snooze15', title: '⏰ +15 мин' },
            { action: 'snooze60', title: '⏰ +1 час' },
            { action: 'complete', title: '✅ Выполнено' }
          ]
        }
      );
      
      reminder.triggered = true;
      
      // Если напоминание повторяющееся, планируем следующее
      if (reminder.repeat && reminder.repeat !== 'none') {
        scheduleNextRepeat(reminder);
      }
    }
  });
  
  // Очищаем старые (более суток) напоминания
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  reminders = reminders.filter(r => {
    const reminderTime = new Date(r.datetime).getTime();
    return reminderTime > oneDayAgo || r.repeat !== 'none';
  });
}

function scheduleNextRepeat(reminder) {
  const currentDate = new Date(reminder.datetime);
  let nextDate = new Date(currentDate);
  
  switch(reminder.repeat) {
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
  
  // Добавляем следующее напоминание
  reminders.push({
    eventId: reminder.eventId + '_' + Date.now(),
    title: reminder.title,
    datetime: nextDate.toISOString(),
    repeat: reminder.repeat,
    triggered: false
  });
  
  // Сообщаем клиенту, чтобы обновил данные
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'REMINDER_TRIGGERED',
        eventId: reminder.eventId
      });
    });
  });
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const action = event.action;
  const data = event.notification.data;
  
  if (!data) return;
  
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
    const newTime = new Date();
    newTime.setMinutes(newTime.getMinutes() + 15);
    
    // Добавляем новое напоминание
    addReminder(
      data.eventId + '_snooze',
      data.title || 'Мероприятие',
      newTime.toISOString(),
      'none'
    );
    
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
    const newTime = new Date();
    newTime.setHours(newTime.getHours() + 1);
    
    addReminder(
      data.eventId + '_snooze',
      data.title || 'Мероприятие',
      newTime.toISOString(),
      'none'
    );
    
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

// ==================== КЭШИРОВАНИЕ ====================

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