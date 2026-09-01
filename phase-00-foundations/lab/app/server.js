'use strict';
/**
 * The APP service — the thing you are measuring.
 *
 * Two endpoints, and the difference between them is the whole lab:
 *
 *   GET /api/simple        calls the dependency ONCE
 *   GET /api/fanout?n=K    calls the dependency K times IN PARALLEL and waits
 *                          for all of them (Promise.all)
 *
 * /api/fanout is the interesting one. Its latency is the MAXIMUM of K samples
 * from the dependency's latency distribution, not the average. That is tail
 * latency amplification, and you are about to watch it happen.
 *
 * Note the keep-alive Agent below. Without it, every downstream call pays a TCP
 * handshake (~1 RTT) before doing any work — which at fan-out 100 means 100
 * handshakes per request. Connection reuse is not a micro-optimisation.
 * Set KEEP_ALIVE=false to see the difference for yourself.
 */

const http = require('node:http');

const DEP_HOST = process.env.DEP_HOST ?? 'dependency';
const DEP_PORT = Number(process.env.DEP_PORT ?? 4000);
const KEEP_ALIVE = (process.env.KEEP_ALIVE ?? 'true') !== 'false';

// maxSockets caps how many downstream calls can be in flight at once.
// Lower it and you create a queue INSIDE your own process — see the bonus
// experiment in the lab README.
const MAX_SOCKETS = Number(process.env.MAX_SOCKETS ?? 1024);

const agent = new http.Agent({
  keepAlive: KEEP_ALIVE,
  maxSockets: MAX_SOCKETS,
});

function callDependency() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: DEP_HOST, port: DEP_PORT, path: '/work', method: 'GET', agent },
      (res) => {
        res.resume(); // drain the body; we only care about timing
        res.on('end', () => resolve(res.statusCode));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') {
    return json(res, 200, { ok: true });
  }

  // One downstream call. Baseline.
  if (url.pathname === '/api/simple') {
    try {
      await callDependency();
      return json(res, 200, { ok: true, calls: 1 });
    } catch (err) {
      return json(res, 502, { error: err.message });
    }
  }

  // K downstream calls in parallel; wait for ALL of them.
  // Latency = max(K samples), which is the point of the exercise.
  if (url.pathname === '/api/fanout') {
    const n = Math.min(500, Math.max(1, Number(url.searchParams.get('n') ?? 10)));
    try {
      await Promise.all(Array.from({ length: n }, () => callDependency()));
      return json(res, 200, { ok: true, calls: n });
    } catch (err) {
      return json(res, 502, { error: err.message });
    }
  }

  return json(res, 404, { error: 'not found' });
});

const PORT = Number(process.env.PORT ?? 3000);
server.listen(PORT, () => {
  console.log(
    `[app] listening on :${PORT} -> dependency=${DEP_HOST}:${DEP_PORT} ` +
      `keepAlive=${KEEP_ALIVE} maxSockets=${MAX_SOCKETS}`,
  );
});
