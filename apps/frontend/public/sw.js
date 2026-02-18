const CACHE_NAME = 'motopartes-v3';
const urlsToCache = [
    '/',
    '/index.html',
    '/logo.png',
    '/favicon.png',
    '/manifest.json'
];

// Install event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting();
});

// Fetch event
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // SKIP API requests — let them go directly to the Vite proxy / backend
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/api')) {
        return;
    }

    // Para navegación (HTML), usar Network First
    if (event.request.mode === 'navigate' ||
        (event.request.method === 'GET' && event.request.headers.get('accept')?.includes('text/html'))) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                    return response;
                })
                .catch(() => {
                    return caches.match('/index.html') || caches.match('/');
                })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
            .catch(() => {
                if (event.request.destination === 'script' || event.request.destination === 'style') {
                    console.log('Resource fetch failed, might be offline or old hash');
                }
                // Return a proper error response instead of undefined
                return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
            })
    );
});

// Activate event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});
