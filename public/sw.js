const CACHE_PREFIX = "index-boundary";
const CACHE_VERSION = "shell-v1";
const SHELL_CACHE = `${CACHE_PREFIX}-${CACHE_VERSION}`;

function scopePath() {
  const pathname = new URL(self.registration.scope).pathname.replace(/\/$/, "");
  return pathname === "/" ? "" : pathname;
}

function scoped(path) {
  return `${scopePath()}${path}` || "/";
}

const OPTIONAL_SHELL_ASSETS = [
  scoped("/manifest.json"),
  scoped("/favicon.svg"),
  scoped("/icon.svg"),
  scoped("/android-chrome-192x192.png"),
  scoped("/android-chrome-512x512.png"),
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Root HTML is required; optional icons must not block installation.
    await cache.add(scoped("/"));
    await Promise.allSettled(OPTIONAL_SHELL_ASSETS.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(`${CACHE_PREFIX}-`) && key !== SHELL_CACHE)
        .map((key) => caches.delete(key)),
    );
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

async function networkFirstNavigation(event) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const preload = await event.preloadResponse;
    const response = preload || await fetch(event.request);
    if (response && response.ok && new URL(event.request.url).pathname === scoped("/")) {
      await cache.put(scoped("/"), response.clone());
    }
    return response;
  } catch {
    return (await cache.match(scoped("/"))) || new Response("离线状态下暂时无法打开页面。", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => undefined);
  return cached || (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const base = scopePath();
  const relativePath = base && url.pathname.startsWith(base)
    ? url.pathname.slice(base.length)
    : url.pathname;

  // API、认证和云存档永不进入缓存，避免离线返回陈旧私有数据。
  if (relativePath === "/api" || relativePath.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  if (relativePath.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (/\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(relativePath)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
