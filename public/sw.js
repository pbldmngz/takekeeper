// Takekeeper offline shell. Same-origin GET only: the speech model and the fonts come from other
// origins and keep their own caches, and nothing here ever touches a recording, which never leaves the page.

const CACHE = 'takekeeper-v1';
const SHELL = ['/', '/es/', '/favicon.svg', '/logo.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))) // a missing one must not fail the install
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const save = (req, res) => {
  if (res.ok && res.type === 'basic') {
    const copy = res.clone();
    void caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // pages come from the network first, so a deploy is picked up; the cache is the offline fallback
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => save(req, r)).catch(() => caches.match(req).then((m) => m || caches.match('/'))));
    return;
  }
  // hashed assets never change under the same name
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => save(req, r))));
});
