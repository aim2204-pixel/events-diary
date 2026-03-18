// service-worker.js - v2.3.0 - ПРИНУДИТЕЛЬНЫЙ СБРОС
const CACHE_NAME = 'events-diary-v2.3.0-' + Date.now();
const CACHE_PREFIX = 'events-diary';

// УНИЧТОЖАЕМ ВСЁ СТАРОЕ ПРИ АКТИВАЦИИ
self.addEventListener('activate', event => {
  console.log('[SW] АКТИВАЦИЯ НОВОЙ ВЕРСИИ');
  
  event.waitUntil(
    Promise.all([
      // Удаляем ВСЕ старые кэши без разбора
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(name => {
            console.log('[SW] Удаляем кэш:', name);
            return caches.delete(name);
          })
        );
      }),
      // Захватываем контроль над всеми клиентами
      self.clients.claim()
    ]).then(() => {
      console.log('[SW] ГОТОВ К РАБОТЕ');
      // Запускаем проверку напоминаний каждую минуту
      setInterval(checkReminders, 60000);
      checkReminders();
    })
  );
});

// Хранилище напоминаний
let reminders = [];

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'LOAD_REMINDERS') {
    reminders = event.data.reminders || [];
    console.log('[SW] Загружено напоминаний:', reminders.length);
  }
  
  if (event.data && event.data.type === 'TEST_NOTIFICATION') {
    testNotification();
  }
});

function testNotification() {
  self.registration.showNotification('🔔 Тестовое уведомление', {
    body: 'Уведомления работают!',
    icon: '/events-diary/maskable_icon_x192.png',
    badge: '/events-diary/maskable_icon_x72.png',
    tag: 'test-' + Date.now(),
    requireInteraction: true
  });
}

function checkReminders() {
  const now = Date.now();
  console.log('[SW] Проверка напоминаний...', new Date().toLocaleTimeString());
  
  reminders.forEach(reminder => {
    const reminderTime = new Date(reminder.datetime).getTime();
    
    // Проверяем, что время наступило (погрешность 1 минута)
    if (reminderTime <= now && !reminder.triggered) {
      console.log('[SW] ПОКАЗЫВАЕМ НАПОМИНАНИЕ:', reminder.title);
      
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
    }
  });
}

// Простой fetch для кэширования
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});