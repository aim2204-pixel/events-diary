// service-worker.js - v1.0.0
const CACHE_NAME = 'events-diary-v1.0.0';
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