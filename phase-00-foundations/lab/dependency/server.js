'use strict';
/**
 * The DEPENDENCY service.
 *
 * Stands in for whatever your service calls: a database, another microservice,
 * a third-party API. Its latency is configurable AT RUNTIME so you can change
 * the experiment without restarting anything.
 *
 * The important design detail: latency is NOT a fixed number. It is
 *
 *     mostly fast  (baseMs, jittered)
 *     occasionally slow  (baseMs + slowMs), with probability slowProbability
 *
 * That bimodal shape is what real systems look like — a GC pause, a cache miss,
 * a lock, a noisy neighbour. A fixed-latency fake dependency would hide the
 * entire lesson of this lab, because tail latency amplification only exists
 * when there IS a tail.
 */

const http = require('node:http');

const config = {
  baseMs: Number(process.env.BASE_MS ?? 5), // the fast path
  slowMs: Number(process.env.SLOW_MS ?? 200), // extra ms on the slow path
  slowProbability: Number(process.env.SLOW_PROBABILITY ?? 0.01), // 1% slow by default
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function nextLatencyMs() {
  // Jitter the fast path so p50 isn't an artificially flat line.
  const fast = config.baseMs * (0.5 + Math.random());
  return Math.random() < config.slowProbability ? fast + config.slowMs : fast;
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') {
    return json(res, 200, { ok: true });
  }

  // Inspect the current latency profile.
  if (url.pathname === '/admin/config' && req.method === 'GET') {
    return json(res, 200, config);
  }

  // Change the latency profile live, e.g.
  //   curl -XPOST localhost:4000/admin/config -d '{"baseMs":205}'
  if (url.pathname === '/admin/config' && req.method === 'POST') {
    let patch;
    try {
      patch = await readJsonBody(req);
    } catch {
      return json(res, 400, { error: 'invalid JSON body' });
    }
    for (const key of ['baseMs', 'slowMs', 'slowProbability']) {
      if (patch[key] !== undefined) config[key] = Number(patch[key]);
    }
    console.log('[dependency] config updated ->', JSON.stringify(config));
    return json(res, 200, config);
  }

  // The actual unit of work.
  if (url.pathname === '/work') {
    const waitedMs = nextLatencyMs();
    await sleep(waitedMs);
    return json(res, 200, { ok: true, waitedMs: Math.round(waitedMs) });
  }

  return json(res, 404, { error: 'not found' });
});

const PORT = Number(process.env.PORT ?? 4000);
server.listen(PORT, () => {
  console.log(`[dependency] listening on :${PORT} ->`, JSON.stringify(config));
});
