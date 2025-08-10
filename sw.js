// sw.js - Service Worker für Metabolic Base
const CACHE_NAME = 'metabolic-base-v2';
const STATIC_CACHE = 'metabolic-base-static-v2';
const DYNAMIC_CACHE = 'metabolic-base-dynamic-v2';

// Statische Dateien die immer gecacht werden
const STATIC_FILES = [
    '/metabolic-base/',
    '/metabolic-base/index.html',
    '/metabolic-base/js/auto-discovery.js',
    '/metabolic-base/js/content-indexer.js',
    '/metabolic-base/js/smart-search.js',
    '/metabolic-base/js/sync-manager.js',
    '/metabolic-base/manifest.json'
];

// Modul-Ordner für dynamisches Caching
const MODULE_FOLDERS = [
    '/metabolic-base/modules/01-notfaelle/',
    '/metabolic-base/modules/02-befundung/',
    '/metabolic-base/modules/03-differentialdiagnostik/',
    '/metabolic-base/modules/04-aminosaeuren/',
    '/metabolic-base/modules/05-kohlenhydrate/',
    '/metabolic-base/modules/06-carnitin/',
    '/metabolic-base/modules/07-energie/',
    '/metabolic-base/modules/08-lipide/',
    '/metabolic-base/modules/09-purin-pyrimidin/',
    '/metabolic-base/modules/10-lysosomal/',
    '/metabolic-base/modules/11-cdg/',
    '/metabolic-base/modules/12-sonstige/'
];

// Globale Variablen
let isOnline = true;
let pendingRequests = [];
let cacheVersion = 2;

/**
 * Service Worker Installation
 */
self.addEventListener('install', event => {
    console.log('🔧 Service Worker wird installiert...');
    
    event.waitUntil(
        Promise.all([
            // Statische Dateien cachen
            caches.open(STATIC_CACHE).then(cache => {
                console.log('📦 Cache statische Dateien...');
                return Promise.allSettled(
                    STATIC_FILES.map(url =>
                        cache.add(url).catch(err => {
                            console.warn(`⚠️ Konnte ${url} nicht cachen:`, err);
                            return null;
                        })
                    )
                );
            }),
            
            // Skip Waiting für sofortiges Aktivieren
            self.skipWaiting()
        ])
    );
});

/**
 * Service Worker Aktivierung
 */
self.addEventListener('activate', event => {
    console.log('✅ Service Worker wird aktiviert...');
    
    event.waitUntil(
        Promise.all([
            // Alte Caches löschen
            cleanupOldCaches(),
            
            // Kontrolle über alle Clients übernehmen
            self.clients.claim(),
            
            // Auto-Discovery für Module starten
            discoverAndCacheModules()
        ])
    );
});

/**
 * Fetch Event Handler - Hauptlogik für Caching und Offline-Funktionalität
 */
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Nur HTTP(S) Requests behandeln
    if (!request.url.startsWith('http')) return;
    
    // Strategie basierend auf Request-Typ wählen
    if (isStaticFile(url.pathname)) {
        event.respondWith(cacheFirstStrategy(request));
    } else if (isModuleFile(url.pathname)) {
        event.respondWith(staleWhileRevalidateStrategy(request));
    } else if (isAPIRequest(url.pathname)) {
        event.respondWith(networkFirstStrategy(request));
    } else {
        event.respondWith(networkWithCacheFallbackStrategy(request));
    }
});

/**
 * Background Sync für offline Aktionen
 */
self.addEventListener('sync', event => {
    console.log('🔄 Background Sync Event:', event.tag);
    
    if (event.tag === 'background-sync-modules') {
        event.waitUntil(syncModulesInBackground());
    } else if (event.tag === 'background-sync-userdata') {
        event.waitUntil(syncUserDataInBackground());
    }
});

/**
 * Push Notifications (für zukünftige Features)
 */
self.addEventListener('push', event => {
    if (event.data) {
        const data = event.data.json();
        
        const options = {
            body: data.body || 'Neue Module verfügbar!',
            icon: '/metabolic-base/icons/icon-192x192.png',
            badge: '/metabolic-base/icons/badge-72x72.png',
            tag: data.tag || 'metabolic-base-notification',
            vibrate: [100, 50, 100],
            data: data.data || {},
            actions: [
                {
                    action: 'open',
                    title: 'Öffnen',
                    icon: '/metabolic-base/icons/open-icon.png'
                },
                {
                    action: 'dismiss',
                    title: 'Schließen'
                }
            ]
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title || 'Metabolic Base', options)
        );
    }
});

/**
 * Notification Click Handler
 */
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'open') {
        event.waitUntil(
            self.clients.openWindow('/metabolic-base/')
        );
    }
});

/**
 * Caching-Strategien
 */

// Cache First - für statische Dateien
async function cacheFirstStrategy(request) {
    try {
        const cache = await caches.open(STATIC_CACHE);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            // Cache-Hit: Aktualisierung im Hintergrund
            fetchAndUpdateCache(request, STATIC_CACHE);
            return cachedResponse;
        }
        
        // Cache-Miss: Netzwerk versuchen
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
        
    } catch (error) {
        console.warn('⚠️ Cache First Fehler:', error);
        return createErrorResponse('Inhalt nicht verfügbar (offline)');
    }
}

// Stale While Revalidate - für Module
async function staleWhileRevalidateStrategy(request) {
    try {
        const cache = await caches.open(DYNAMIC_CACHE);
        const cachedResponse = await cache.match(request);
        
        // Netzwerk-Request im Hintergrund starten
        const networkPromise = fetch(request).then(response => {
            if (response.ok) {
                cache.put(request, response.clone());
            }
            return response;
        }).catch(() => null);
        
        // Cached Version sofort zurückgeben wenn verfügbar
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Sonst auf Netzwerk warten
        const networkResponse = await networkPromise;
        if (networkResponse) {
            return networkResponse;
        }
        
        return createErrorResponse('Modul nicht verfügbar');
        
    } catch (error) {
        console.warn('⚠️ Stale While Revalidate Fehler:', error);
        return createErrorResponse('Fehler beim Laden des Moduls');
    }
}

// Network First - für API Requests
async function networkFirstStrategy(request) {
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
        
    } catch (error) {
        // Fallback zu Cache
        const cache = await caches.open(DYNAMIC_CACHE);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        return createErrorResponse('API nicht verfügbar (offline)');
    }
}

// Network with Cache Fallback - für andere Requests
async function networkWithCacheFallbackStrategy(request) {
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
        
    } catch (error) {
        const cache = await caches.open(DYNAMIC_CACHE);
        const cachedResponse = await cache.match(request);
        
        return cachedResponse || createErrorResponse('Inhalt nicht verfügbar');
    }
}

/**
 * Hilfsfunktionen
 */

// Prüft ob Datei statisch ist
function isStaticFile(pathname) {
    return pathname.endsWith('.js') || 
           pathname.endsWith('.css') || 
           pathname.endsWith('.json') ||
           pathname.includes('/js/') ||
           pathname === '/metabolic-base/' ||
           pathname === '/metabolic-base/index.html';
}

// Prüft ob Datei ein Modul ist
function isModuleFile(pathname) {
    return pathname.includes('/modules/') && pathname.endsWith('.html');
}

// Prüft ob Request eine API-Anfrage ist
function isAPIRequest(pathname) {
    return pathname.includes('/api/') || pathname.includes('modules-config.json');
}

// Erstellt Error Response
function createErrorResponse(message) {
    return new Response(
        `<!DOCTYPE html>
        <html>
        <head>
            <title>Metabolic Base - Offline</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    margin: 0; padding: 2rem; background: #f8fafc; color: #2d3436;
                    display: flex; align-items: center; justify-content: center; min-height: 100vh;
                }
                .error-container {
                    text-align: center; background: white; padding: 3rem; border-radius: 16px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 400px;
                }
                .error-icon { font-size: 4rem; margin-bottom: 1rem; }
                h1 { margin: 0 0 1rem 0; color: #ff6b6b; }
                p { margin: 0 0 2rem 0; color: #636e72; }
                button {
                    background: #667eea; color: white; border: none; padding: 12px 24px;
                    border-radius: 8px; cursor: pointer; font-size: 1rem;
                }
                button:hover { background: #5a6fd8; }
            </style>
        </head>
        <body>
            <div class="error-container">
                <div class="error-icon">📴</div>
                <h1>Offline</h1>
                <p>${message}</p>
                <button onclick="window.location.reload()">Erneut versuchen</button>
            </div>
        </body>
        </html>`,
        {
            status: 503,
            headers: { 'Content-Type': 'text/html' }
        }
    );
}

// Lädt und cached Datei im Hintergrund
async function fetchAndUpdateCache(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
    } catch (error) {
        // Ignoriere Fehler beim Background-Update
    }
}

// Entfernt alte Caches
async function cleanupOldCaches() {
    const cacheNames = await caches.keys();
    const validCaches = [STATIC_CACHE, DYNAMIC_CACHE];
    
    const deletionPromises = cacheNames
        .filter(cacheName => !validCaches.includes(cacheName))
        .map(cacheName => caches.delete(cacheName));
    
    await Promise.all(deletionPromises);
    console.log('🧹 Alte Caches gelöscht');
}

// Entdeckt und cached Module automatisch
async function discoverAndCacheModules() {
    console.log('🔍 Starte automatische Modul-Entdeckung...');
    
    try {
        const cache = await caches.open(DYNAMIC_CACHE);
        
        // Gehe durch alle Modul-Ordner
        for (const folder of MODULE_FOLDERS) {
            await discoverModulesInFolder(folder, cache);
        }
        
        console.log('✅ Automatische Modul-Entdeckung abgeschlossen');
        
    } catch (error) {
        console.warn('⚠️ Fehler bei Modul-Entdeckung:', error);
    }
}

// Entdeckt Module in einem spezifischen Ordner
async function discoverModulesInFolder(folderPath, cache) {
    const commonFiles = [
        'index.html',
        'teil1.html', 'teil2.html', 'teil3.html', 'teil4.html', 'teil5.html',
        'part1.html', 'part2.html', 'part3.html', 'part4.html', 'part5.html',
        'modul1.html', 'modul2.html', 'modul3.html', 'modul4.html', 'modul5.html',
        'grundlagen.html', 'diagnostik.html', 'therapie.html', 'klinik.html'
    ];
    
    for (const fileName of commonFiles) {
        const moduleUrl = folderPath + fileName;
        
        try {
            const response = await fetch(moduleUrl, { method: 'HEAD' });
            if (response.ok) {
                // Datei existiert, lade vollständigen Inhalt
                const fullResponse = await fetch(moduleUrl);
                if (fullResponse.ok) {
                    await cache.put(moduleUrl, fullResponse);
                    console.log(`📄 Modul gecacht: ${moduleUrl}`);
                }
            }
        } catch (error) {
            // Datei existiert nicht, weitermachen
        }
    }
}

// Background Sync für Module
async function syncModulesInBackground() {
    console.log('🔄 Background Sync für Module...');
    
    try {
        await discoverAndCacheModules();
        
        // Benachrichtige alle Clients über neue Module
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'modules-updated',
                timestamp: Date.now()
            });
        });
        
    } catch (error) {
        console.warn('⚠️ Background Module Sync Fehler:', error);
    }
}

// Background Sync für Benutzerdaten
async function syncUserDataInBackground() {
    console.log('🔄 Background Sync für Benutzerdaten...');
    
    try {
        // Hier würde normalerweise ein API-Call zur Cloud gemacht werden
        // Für jetzt simulieren wir es nur
        
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'userdata-synced',
                timestamp: Date.now()
            });
        });
        
    } catch (error) {
        console.warn('⚠️ Background User Data Sync Fehler:', error);
    }
}

/**
 * Message Handler für Kommunikation mit der Hauptanwendung
 */
self.addEventListener('message', event => {
    const { type, data } = event.data;
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'CACHE_MODULE':
            cacheSpecificModule(data.url);
            break;
            
        case 'CLEAR_CACHE':
            clearCaches();
            break;
            
        case 'GET_CACHE_SIZE':
            getCacheSize().then(size => {
                event.ports[0].postMessage({ size });
            });
            break;
            
        case 'FORCE_UPDATE':
            forceUpdateCaches();
            break;
    }
});

// Cached spezifisches Modul
async function cacheSpecificModule(url) {
    try {
        const cache = await caches.open(DYNAMIC_CACHE);
        const response = await fetch(url);
        
        if (response.ok) {
            await cache.put(url, response);
            console.log(`📄 Modul manuell gecacht: ${url}`);
        }
    } catch (error) {
        console.warn(`⚠️ Fehler beim Cachen von ${url}:`, error);
    }
}

// Löscht alle Caches
async function clearCaches() {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    console.log('🧹 Alle Caches gelöscht');
}

// Berechnet Cache-Größe
async function getCacheSize() {
    let totalSize = 0;
    const cacheNames = await caches.keys();
    
    for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        
        for (const request of keys) {
            const response = await cache.match(request);
            if (response) {
                const text = await response.text();
                totalSize += text.length;
            }
        }
    }
    
    return totalSize;
}

// Aktualisiert alle Caches forciert
async function forceUpdateCaches() {
    console.log('🔄 Forciere Cache-Update...');
    
    await cleanupOldCaches();
    await discoverAndCacheModules();
    
    // Statische Dateien neu laden
    const staticCache = await caches.open(STATIC_CACHE);
    await Promise.all(
        STATIC_FILES.map(async url => {
            try {
                await staticCache.delete(url);
                const response = await fetch(url);
                if (response.ok) {
                    await staticCache.put(url, response);
                }
            } catch (error) {
                console.warn(`⚠️ Fehler beim Update von ${url}:`, error);
            }
        })
    );
    
    console.log('✅ Cache-Update abgeschlossen');
}

// Periodische Wartung
setInterval(() => {
    // Cache-Größe überwachen
    getCacheSize().then(size => {
        const sizeMB = (size / (1024 * 1024)).toFixed(2);
        if (sizeMB > 50) { // Wenn Cache > 50MB
            console.log(`⚠️ Cache ist groß (${sizeMB}MB), erwäge Aufräumen`);
        }
    });
}, 30 * 60 * 1000); // Alle 30 Minuten

console.log('🚀 Metabolic Base Service Worker geladen');

// Export für Tests (falls nötig)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CACHE_NAME,
        STATIC_CACHE,
        DYNAMIC_CACHE,
        STATIC_FILES,
        MODULE_FOLDERS
    };
}