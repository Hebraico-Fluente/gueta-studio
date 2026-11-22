/* Service worker da demonstração do Café Modelo (fictício), escopo /demo/cafeteria/.
   Guarda as telas da demonstração para abrir sem internet. Estratégia: rede primeiro (sempre a versão
   mais nova quando há conexão) e, sem conexão, o que está guardado. Não guarda dados: os dados de exemplo
   ficam no localStorage do navegador. */
const CACHE = "cafe-modelo-demo-v1";
const BASE = new URL("./", self.location).pathname;
const ARQUIVOS = [
  "", "painel/", "painel/painel.js", "painel/painel.css",
  "pedido/", "pedido/pedido.js", "pedido/pedido.css",
  "telao/", "telao/telao.js", "telao/telao.css",
  "apresentacao/", "apresentacao/apresentacao.js", "apresentacao/apresentacao.css",
  "comum/catalogo.js", "comum/dados.js", "comum/estado.js", "comum/util.js", "comum/som.js", "comum/app.js",
  "comum/icone.svg", "comum/icone-192.png", "comum/icone-512.png", "manifest.webmanifest",
].map(f => BASE + f).concat(["/fonts/instrument-sans-latin.woff2", "/fonts/instrument-serif-latin.woff2"]);

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ARQUIVOS.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("cafe-modelo-demo-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== self.location.origin) return;
  if (!u.pathname.startsWith(BASE) && !u.pathname.startsWith("/fonts/") && !u.pathname.startsWith("/css/") && !u.pathname.startsWith("/js/")) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok && res.type === "basic") { const copia = res.clone(); caches.open(CACHE).then(c => c.put(r, copia)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: true }).then(c => c || (r.mode === "navigate" ? caches.match(BASE + "painel/") : undefined)).then(c => c || Response.error())));
});
