// service-worker.js - v2.2.2
const CACHE_NAME = 'events-diary-v2.2.2-' + Date.now();

self.addEventListener('install', event => {
  console.log('[SW] Установка');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW] Активация');
  event.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(name => {
            console.log('[SW] Удаляем кэш:', name);
            return caches.delete(name);
          })
        );
      }),
      self.clients.claim()
    ]).then(() => {
      setInterval(checkReminders, 60000);
      checkReminders();
    })
  );
});

let reminders = [];

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'LOAD_REMINDERS') {
    reminders = event.data.reminders || [];
    console.log('[SW] Загружено напоминаний:', reminders.length);
  }
  
  if (event.data && event.data.type === 'SCHEDULE_REMINDER') {
    const { eventId, title, datetime, repeat } = event.data;
    reminders = reminders.filter(r => r.eventId !== eventId);
    reminders.push({ eventId, title, datetime, repeat, triggered: false });
    console.log('[SW] Добавлено напоминание:', eventId);
  }
  
  if (event.data && event.data.type === 'CANCEL_REMINDER') {
    reminders = reminders.filter(r => r.eventId !== eventId);
    console.log('[SW] Удалено напоминание:', eventId);
  }
});

function checkReminders() {
  const now = Date.now();
  
  reminders.forEach(reminder => {
    const reminderTime = new Date(reminder.datetime).getTime();
    
    if (reminderTime <= now && !reminder.triggered) {
      self.registration.showNotification(
        `🔔 ${reminder.title}`,
        {
          body: new Date(reminder.datetime).toLocaleString('ru-RU'),
          icon: '/events-diary/maskable_icon_x192.png',
          badge: '/events-diary/maskable_icon_x72.png',
          tag: `reminder-${reminder.eventId}`,
          requireInteraction: true,
          data: reminder,
          actions: [
            { action: 'open', title: '📋 Открыть' }
          ]
        }
      );
      
      reminder.triggered = true;
      
      if (reminder.repeat && reminder.repeat !== 'none') {
        scheduleNextRepeat(reminder);
      }
    }
  });
}

function scheduleNextRepeat(reminder) {
  const currentDate = new Date(reminder.datetime);
  let nextDate = new Date(currentDate);
  
  switch(reminder.repeat) {
    case 'daily': nextDate.setDate(nextDate.getDate() + 1); break;
    case 'weekly': nextDate.setDate(nextDate.getDate() + 7); break;
    case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
    case 'yearly': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
    default: return;
  }
  
  reminders.push({
    eventId: reminder.eventId + '_' + Date.now(),
    title: reminder.title,
    datetime: nextDate.toISOString(),
    repeat: reminder.repeat,
    triggered: false
  });
  
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'SCHEDULE_NEXT_REMINDER',
        eventId: reminder.eventId,
        nextDatetime: nextDate.toISOString(),
        repeat: reminder.repeat
      });
    });
  });
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data;
  
  if (event.action === 'open' && data) {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        for (const client of clientList) {
          if (client.url.includes('/events-diary/') && 'focus' in client) {
            client.postMessage({ type: 'OPEN_EVENT', eventId: data.eventId });
            return client.focus();
          }
        }
        return clients.openWindow(`/events-diary/?event=${data.eventId}`);
      })
    );
  }
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
