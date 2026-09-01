'use strict';
/**
 * One replica behind nginx.
 *
 * It reports which instance served each request (so you can see the balancing),
 * and it can be BROKEN AT RUNTIME in three different ways — because "a backend
 * failed" is not one failure mode, it's at least three, and they behave
 * completely differently from the load balancer's point of view:
 *
 *   healthy   normal
 *   error     returns 500 immediately        -> fast, loud failure
 *   hang      never responds                 -> GRAY FAILURE. the interesting one.
 *   (crash)   docker kill                    -> connection refused
 *
 * The hang is the one worth your attention. The process is alive, the TCP
 * connection is accepted, a shallow health check passes -- and it poisons your
 * p99 while nginx keeps sending it traffic.
 */

const http = require('node:http');

const INSTANCE = process.env.INSTANCE_ID ?? 'unknown';
const PORT = Number(process.env.PORT ?? 8080);

let mode = 'healthy'; // healthy | error | hang
let served = 0;
let shuttingDown = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    'x-instance': INSTANCE,
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // ---- health check -----------------------------------------------------
  // Deliberately SHALLOW (note 05): it reports on THIS process only, and it
  // does NOT check any shared dependency. It fails during graceful shutdown so
  // the load balancer removes us before we stop accepting connections.
  //
  // Note it also passes while mode === 'hang'. That is not a bug in the lab --
  // that IS the gray failure. A shallow check cannot see slowness.
  if (url.pathname === '/health') {
    if (shuttingDown) return json(res, 503, { ok: false, reason: 'draining' });
    return json(res, 200, { ok: true, instance: INSTANCE, mode, served });
  }

  // ---- runtime failure injection ----------------------------------------
  //   curl -XPOST localhost:8081/admin/mode -d '{"mode":"hang"}'
  if (url.pathname === '/admin/mode' && req.method === 'POST') {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    try {
      const next = JSON.parse(raw || '{}').mode;
      if (!['healthy', 'error', 'hang'].includes(next)) {
        return json(res, 400, { error: 'mode must be healthy | error | hang' });
      }
      mode = next;
      console.log(`[${INSTANCE}] mode -> ${mode}`);
      return json(res, 200, { instance: INSTANCE, mode });
    } catch {
      return json(res, 400, { error: 'invalid JSON' });
    }
  }

  if (url.pathname === '/admin/stats') {
    return json(res, 200, { instance: INSTANCE, mode, served, shuttingDown });
  }

  // ---- the actual work --------------------------------------------------
  if (url.pathname === '/api/work') {
    served += 1;

    if (mode === 'error') {
      return json(res, 500, { error: 'injected failure', instance: INSTANCE });
    }

    if (mode === 'hang') {
      // Never respond. The client (and nginx) will sit here until a timeout.
      // We deliberately do NOT close the socket -- a closed socket is a fast,
      // detectable failure. A hang is not.
      return;
    }

    await sleep(5 + Math.random() * 5); // ~5-10ms of "work"
    return json(res, 200, { ok: true, instance: INSTANCE, served });
  }

  return json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => console.log(`[${INSTANCE}] listening on :${PORT}`));

// ---- graceful shutdown (note 01 + note 06) --------------------------------
// The ordering here is the whole point:
//   1. fail the health check          -> LB begins removing us
//   2. WAIT for the LB to notice      <- the step everyone omits
//   3. stop accepting new connections
//   4. finish in-flight requests
//
// Without step 2 you get 502s on every deploy, because the LB is still sending
// traffic to a socket you already closed.
const DRAIN_MS = Number(process.env.DRAIN_MS ?? 3000);

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[${INSTANCE}] ${signal} -> draining for ${DRAIN_MS}ms (health check now failing)`);

  setTimeout(() => {
    console.log(`[${INSTANCE}] closing listener, finishing in-flight requests`);
    server.close(() => {
      console.log(`[${INSTANCE}] clean exit`);
      process.exit(0);
    });
    // Backstop: don't hang forever waiting on a slow in-flight request.
    setTimeout(() => process.exit(0), 10_000).unref();
  }, DRAIN_MS);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
