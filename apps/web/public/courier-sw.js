/* global self */
// Online-only: no CacheStorage, IndexedDB, queues, push or background synchronization.
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (
    request.method !== 'GET' ||
    request.mode !== 'navigate' ||
    new URL(request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    fetch(request, { cache: 'no-store' }).catch(
      () =>
        new Response(
          '<!doctype html><html lang="ro"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Livrări — fără conexiune</title><body><main><h1>Conexiunea nu este disponibilă</h1><p>Livrările și încasările se confirmă numai online. Nicio acțiune nu a fost trimisă în fundal.</p><p>După revenirea conexiunii, reîncarcă această pagină și verifică orice tentativă cu rezultat necunoscut.</p><a href="">Reîncarcă aplicația</a></main></body></html>',
          {
            status: 503,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store',
              'Content-Security-Policy':
                "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            },
          },
        ),
    ),
  );
});
