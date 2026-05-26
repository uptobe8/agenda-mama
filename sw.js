const CACHE='agenda-cuidados-unificado-bulma-v2';
const FILES=["./", "index.html", "variables.html", "personas.html", "persona.html", "medicacion.html", "seguimiento.html", "informes.html", "ajustes.html", "assets/css/app.css", "assets/js/app.js", "manifest.webmanifest", "assets/icons/icon.svg"];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
