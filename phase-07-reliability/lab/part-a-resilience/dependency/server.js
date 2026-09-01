'use strict';
/**
 * The flaky downstream dependency.
 *
 * Configurable at runtime so one load test can walk it through health ->
 * degradation -> recovery:
 *
 *   POST /admin/config {baseMs, p99Ms, slowProbability, errorProbability}
 *
 * The interesting failure is NOT "it returns 500". It is "it becomes SLOW"
 * -- because slowness propagates upstream and consumes YOUR capacity, while
 * errors are cheap and obvious.
 */

const http = require('node:http');

const config = {
  baseMs: Number(process.env.BASE_MS ?? 20),
  p99Ms: Number(process.env.P99_MS ?? 50),
  slowProbability: Number(process.env.SLOW_PROBABILITY ?? 0.01),
  errorProbability: Number(process.env.ERROR_PROBABILITY ?? 0),
};

let inFlight = 0;
let served = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function nextLatency() {
  const base = config.baseMs * (0.5 + Math.random());
  return Math.random() < config.slowProbability ? base + config.p99Ms : base;
}

function json(res, status, body) {
  const p = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(p) });
  res.end(p);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/health') return json(res, 200, { ok: true });
  if (url.pathname === '/admin/stats') return json(res, 200, { inFlight, served, ...config });

  if (url.pathname === '/admin/config' && req.method === 'POST') {
    let raw = '';
    req.setEncoding('utf8');
    for await (const c of req) raw += c;
    const patch = raw ? JSON.parse(raw) : {};
    for (const k of ['baseMs', 'p99Ms', 'slowProbability', 'errorProbability']) {
      if (patch[k] !== undefined) config[k] = Number(patch[k]);
    }
    console.log('[dep] config ->', JSON.stringify(config));
    return json(res, 200, config);
  }

  if (url.pathname === '/admin/reset' && req.method === 'POST') {
    served = 0;
    return json(res, 200, { ok: true });
  }

  if (url.pathname === '/work') {
    inFlight++;
    served++;
    try {
      await sleep(nextLatency());
      if (Math.random() < config.errorProbability) return json(res, 500, { error: 'injected' });
      return json(res, 200, { ok: true });
    } finally {
      inFlight--;
    }
  }

  return json(res, 404, { error: 'not found' });
});

server.listen(Number(process.env.PORT ?? 4000), () =>
  console.log(`[dep] :${process.env.PORT ?? 4000}`, JSON.stringify(config)),
);
