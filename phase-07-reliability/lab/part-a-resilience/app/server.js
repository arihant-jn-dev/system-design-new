'use strict';
/**
 * The service under test, with resilience patterns you can switch on one at
 * a time:
 *
 *   MODE=none      no timeout, no retry, no breaker   -> the naive version
 *   MODE=timeout   bounded wait
 *   MODE=retry     timeout + retry with FULL JITTER
 *   MODE=breaker   timeout + retry + CIRCUIT BREAKER + fallback
 *
 * The whole point: watch what a SLOW dependency does to a service that has
 * no protection, and then watch each pattern change the outcome.
 */

const http = require('node:http');

const DEP = process.env.DEP_URL ?? 'http://dependency:4000/work';
let MODE = process.env.MODE ?? 'none';

// A bounded concurrency pool -- a real service does not have infinite
// threads/connections, and running out is HOW a slow dependency kills you.
const MAX_CONCURRENCY = Number(process.env.MAX_CONCURRENCY ?? 50);
let active = 0;

const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 150);
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS ?? 3);

const stats = {
  requests: 0, ok: 0, failed: 0, fallback: 0,
  depCalls: 0, timeouts: 0, retries: 0, rejectedByBulkhead: 0,
  breakerOpen: 0, breakerState: 'closed',
};

// ----------------------------------------------------------- circuit breaker
//
// closed    -> requests flow; count failures
// open      -> ⭐ FAIL FAST. Don't call the dependency at all. Give it room.
// half-open -> after a cooldown, let a FEW probes through to test recovery.
const breaker = {
  state: 'closed',
  failures: 0,
  successes: 0,
  openedAt: 0,
  probes: 0,
  FAILURE_THRESHOLD: Number(process.env.BREAKER_THRESHOLD ?? 10),
  COOLDOWN_MS: Number(process.env.BREAKER_COOLDOWN ?? 3000),
  HALF_OPEN_PROBES: 3,
};

function breakerAllows() {
  if (breaker.state === 'closed') return true;
  if (breaker.state === 'open') {
    if (Date.now() - breaker.openedAt >= breaker.COOLDOWN_MS) {
      breaker.state = 'half-open';
      breaker.probes = 0;
      breaker.successes = 0;
      return true;
    }
    return false;
  }
  // half-open: allow a limited number of probes
  return breaker.probes < breaker.HALF_OPEN_PROBES;
}

function breakerRecord(ok) {
  if (breaker.state === 'half-open') {
    breaker.probes++;
    if (ok) {
      breaker.successes++;
      if (breaker.successes >= breaker.HALF_OPEN_PROBES) {
        breaker.state = 'closed';
        breaker.failures = 0;
      }
    } else {
      // ⭐ one failure in half-open sends it straight back to open
      breaker.state = 'open';
      breaker.openedAt = Date.now();
    }
    return;
  }
  if (ok) {
    breaker.failures = Math.max(0, breaker.failures - 1);
  } else {
    breaker.failures++;
    if (breaker.failures >= breaker.FAILURE_THRESHOLD) {
      breaker.state = 'open';
      breaker.openedAt = Date.now();
      stats.breakerOpen++;
    }
  }
}

// ------------------------------------------------------------------ calling
async function callDependency(timeoutMs) {
  stats.depCalls++;
  const ctrl = new AbortController();
  const t = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(DEP, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`dep ${res.status}`);
    await res.arrayBuffer();
    return true;
  } catch (err) {
    if (err.name === 'AbortError') { stats.timeouts++; throw new Error('timeout'); }
    throw err;
  } finally {
    if (t) clearTimeout(t);
  }
}

// ⭐ FULL JITTER: random(0, base * 2^attempt).
// Without jitter every failed caller retries at the SAME instant and you have
// built a distributed metronome pointed at a struggling dependency.
const backoff = (attempt) => Math.random() * Math.min(1000, 20 * 2 ** attempt);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function handle() {
  switch (MODE) {
    case 'none':
      // No timeout at all: we wait as long as the dependency takes.
      return callDependency(0);

    case 'timeout':
      return callDependency(TIMEOUT_MS);

    case 'retry': {
      let lastErr;
      for (let a = 0; a < MAX_ATTEMPTS; a++) {
        try { return await callDependency(TIMEOUT_MS); }
        catch (e) { lastErr = e; stats.retries++; await sleep(backoff(a)); }
      }
      throw lastErr;
    }

    case 'breaker': {
      if (!breakerAllows()) {
        // ⭐ FAIL FAST + FALLBACK. We do not call the dependency at all.
        stats.fallback++;
        return 'fallback';
      }
      let lastErr;
      for (let a = 0; a < MAX_ATTEMPTS; a++) {
        try {
          const r = await callDependency(TIMEOUT_MS);
          breakerRecord(true);
          return r;
        } catch (e) {
          lastErr = e;
          breakerRecord(false);
          if (breaker.state === 'open') break;   // stop retrying into a tripped breaker
          stats.retries++;
          await sleep(backoff(a));
        }
      }
      // ⭐ GRACEFUL DEGRADATION: serve a default rather than an error.
      stats.fallback++;
      void lastErr;
      return 'fallback';
    }

    default:
      return callDependency(TIMEOUT_MS);
  }
}

function json(res, status, body) {
  const p = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(p) });
  res.end(p);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/health') return json(res, 200, { ok: true });

  if (url.pathname === '/stats') {
    return json(res, 200, { ...stats, breakerState: breaker.state, mode: MODE, active });
  }

  if (url.pathname === '/admin/mode' && req.method === 'POST') {
    let raw = ''; req.setEncoding('utf8');
    for await (const c of req) raw += c;
    MODE = (raw ? JSON.parse(raw) : {}).mode ?? MODE;
    breaker.state = 'closed'; breaker.failures = 0;
    return json(res, 200, { mode: MODE });
  }

  if (url.pathname === '/admin/reset' && req.method === 'POST') {
    Object.assign(stats, {
      requests: 0, ok: 0, failed: 0, fallback: 0, depCalls: 0,
      timeouts: 0, retries: 0, rejectedByBulkhead: 0, breakerOpen: 0,
    });
    breaker.state = 'closed'; breaker.failures = 0;
    return json(res, 200, { ok: true });
  }

  if (url.pathname === '/api/thing') {
    stats.requests++;

    // ⭐ THE BULKHEAD. A real service has finite capacity. Without this the
    //    process just accumulates in-flight requests until it dies -- which
    //    is exactly what "a slow dependency took us down" looks like.
    if (active >= MAX_CONCURRENCY) {
      stats.rejectedByBulkhead++;
      stats.failed++;
      return json(res, 503, { error: 'overloaded' });
    }

    active++;
    try {
      const r = await handle();
      stats.ok++;
      return json(res, 200, { ok: true, degraded: r === 'fallback' });
    } catch (err) {
      stats.failed++;
      return json(res, 503, { error: err.message });
    } finally {
      active--;
    }
  }

  return json(res, 404, { error: 'not found' });
});

server.listen(Number(process.env.PORT ?? 3000), () =>
  console.log(`[app] :${process.env.PORT ?? 3000} mode=${MODE} timeout=${TIMEOUT_MS} maxConc=${MAX_CONCURRENCY}`),
);
