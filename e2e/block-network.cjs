// Preloaded into the app server during e2e runs (NODE_OPTIONS=--require ./e2e/block-network.cjs).
// Outside sources (npm, OSV, endoflife.date, status feeds) are never called: fetch and Node's
// http/https requests to any host other than this machine fail, so monitoring reports
// "unavailable" exactly as it would offline. The browser under test only talks to the app.
const http = require('node:http');
const https = require('node:https');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const blocked = (host) => new TypeError(`e2e: outside network blocked (${host})`);

const realFetch = globalThis.fetch;
globalThis.fetch = function blockedFetch(input, init) {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  return LOCAL_HOSTS.has(url.hostname) ? realFetch(input, init) : Promise.reject(blocked(url.hostname));
};

function hostOf(args) {
  const [first] = args;
  if (typeof first === 'string' || first instanceof URL) {
    return new URL(first).hostname;
  }
  return (first && (first.hostname || first.host)) || 'localhost';
}

for (const mod of [http, https]) {
  for (const name of ['request', 'get']) {
    const real = mod[name];
    mod[name] = function guarded(...args) {
      const host = String(hostOf(args)).replace(/:\d+$/, '');
      if (!LOCAL_HOSTS.has(host)) {
        throw blocked(host);
      }
      return real.apply(this, args);
    };
  }
}
