// Preloaded into the app server during e2e runs (NODE_OPTIONS=--require ./e2e/block-network.cjs).
// Outside sources (npm, OSV, endoflife.date, status feeds) are never called: any fetch to a host
// other than this machine fails, so monitoring reports "unavailable" exactly as it would offline.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const realFetch = globalThis.fetch;

globalThis.fetch = function blockedFetch(input, init) {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    return Promise.reject(new TypeError(`e2e: outside network blocked (${url.hostname})`));
  }
  return realFetch(input, init);
};
