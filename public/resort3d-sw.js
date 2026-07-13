// Cache-first service worker for 3D terrain artifacts.
//
// Supabase Storage's public serving layer ignores object cacheControl and
// serves everything `cache-control: no-cache` (supabase/storage#250), so the
// browser revalidates every tile on every use — the map visibly re-loads on
// each pan/zoom. The engine already versions every artifact URL with
// ?v=<manifest generated_at>, so full-URL cache-first is safe: republished
// artifacts get new URLs, and stale entries are dropped with the cache name.
// AWS Terrarium tiles ship no cache-control either (immutable data) — cached
// under the same policy.
//
// Scope is deliberately narrow: two read-only artifact prefixes, GET only.
// Site HTML/JS/API traffic is never touched.

const CACHE = "resort3d-tiles-v2";   // bump: evict any V1-era cached tiles (activate deletes old names)
const PREFIXES = [
  "https://ryiitcblrrqvjvxkobpf.supabase.co/storage/v1/object/public/ride-tracker-static/",
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/",
];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("resort3d-tiles-") && name !== CACHE)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  if (event.request.method !== "GET") return;
  if (!PREFIXES.some((prefix) => url.startsWith(prefix))) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const response = await fetch(event.request);
      if (response.ok || response.type === "opaque") {
        cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
    })()
  );
});
