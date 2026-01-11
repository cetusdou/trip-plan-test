// Service Worker for PWA
const CACHE_NAME = 'trip-plan-cache-v1';
const CACHE_VERSION = '1.0.0';
const FILES_TO_CACHE = [
  './index.html',
  './script.js',
  './styles.css',
  './manifest.json',
  './trip-plan.html',
  './modules/app-initializer.js',
  './modules/auth-manager.js',
  './modules/card-slider.js',
  './modules/cloudinary.js',
  './modules/data-manager.js',
  './modules/event-bus.js',
  './modules/expense-manager.js',
  './modules/like-handler.js',
  './modules/state-manager.js',
  './modules/ui-renderer.js',
  './modules/utils.js',
  './sync-firebase.js',
  './trip-data-structure.js'
];

// Install event - cache essential files
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files...');
        return cache.addAll(FILES_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve cached files when offline
self.addEventListener('fetch', (event) => {
  console.log('Service Worker: Fetching:', event.request.url);
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached file if found
        if (response) {
          console.log('Service Worker: Serving cached file:', event.request.url);
          return response;
        }
        // Fetch from network if not cached
        return fetch(event.request)
          .then((response) => {
            // Only cache GET requests and successful responses
            if (event.request.method !== 'GET' || !response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            // Clone the response before caching
            const responseToCache = response.clone();
            // Cache the new response
            caches.open(CACHE_NAME)
              .then((cache) => {
                console.log('Service Worker: Caching new file:', event.request.url);
                cache.put(event.request, responseToCache);
              });
            return response;
          })
          .catch(() => {
            // Return a fallback if network is unavailable and file is not cached
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
      })
  );
});

// Background sync - sync data when network is available
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync event:', event.tag);
  if (event.tag === 'data-sync') {
    event.waitUntil(syncData());
  }
});

// Sync data function (to be implemented)
async function syncData() {
  console.log('Service Worker: Syncing data...');
  // Implement your data sync logic here
  // For example, upload local changes to server
  return Promise.resolve();
}

// Push notification - handle push notifications
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received');
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: data.icon || '/favicon.ico',
    badge: '/favicon.ico',
    data: {
      url: data.url || './index.html'
    }
  };
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click - handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked');
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});

// Update mechanism
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});