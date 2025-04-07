const CACHE_NAME = 'box-breathing-cache-v1';
// Adjust the paths if your GitHub repo name causes subdirectories
// For a root deploy (username.github.io), these are fine.
// For repo deploy (username.github.io/repo-name/), you might need /repo-name/ prefix
const urlsToCache = [
    '/', // Caches the root URL (which serves index.html)
    '/index.html', // Explicitly cache index.html as fallback and main file
    '/app.js',     // Cache the JavaScript
    '/manifest.json', // Cache the manifest
    // Add paths to your icon files here if you want them pre-cached
    '/icon-192x192.png', 
    '/icon-512x512.png' 
];

// Install event: Cache essential files
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching app shell');
                // Use addAll for atomic caching
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('Service Worker: Installation complete, skipping waiting.');
                return self.skipWaiting(); // Activate the new SW immediately
            })
            .catch(error => {
                 console.error('Service Worker: Caching failed', error);
            })
    );
});

// Activate event: Clean up old caches and take control
self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    // Remove old caches
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => {
             console.log('Service Worker: Claiming clients.');
             return self.clients.claim(); // Take control of open pages immediately
        })
    );
});

// Fetch event: Serve from cache first (Cache-First Strategy)
self.addEventListener('fetch', event => {
    // We only want to handle GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    console.log('Service Worker: Fetching', event.request.url);
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Cache hit - return response
                if (cachedResponse) {
                    console.log('Service Worker: Serving from cache:', event.request.url);
                    return cachedResponse;
                }

                // Not in cache - try fetching from network
                console.log('Service Worker: Not in cache, fetching from network:', event.request.url);
                return fetch(event.request)
                    .then(networkResponse => {
                        // Check if we received a valid response
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                           // Don't cache error responses or opaque responses
                            return networkResponse;
                        }

                        // IMPORTANT: Clone the response. A response is a stream
                        // and because we want the browser to consume the response
                        // as well as the cache consuming the response, we need
                        // to clone it so we have two streams.
                        const responseToCache = networkResponse.clone();

                        // Cache the new response
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                console.log('Service Worker: Caching new resource:', event.request.url);
                                cache.put(event.request, responseToCache);
                            });

                        return networkResponse;
                    })
                    .catch(error => {
                        // Network request failed, try to serve fallback from cache (offline scenario)
                        console.log('Service Worker: Network fetch failed, trying fallback.', error);
                         // Fallback to the main index.html page for any failed navigation request
                         // Check if it's a navigation request
                        if (event.request.mode === 'navigate') {
                            console.log('Service Worker: Serving offline fallback page.');
                            return caches.match('/index.html');
                        }
                        // For other assets (like potentially images not cached), 
                        // just let the error propagate - we won't return anything specific.
                    });
            })
    );
});
