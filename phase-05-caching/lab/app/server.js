'use strict';
/**
 * A read-through cache in front of Postgres — and the thing that saves it.
 *
 *   GET  /api/product/:id     read-through: Redis -> Postgres on miss
 *   GET  /stats               hit/miss counts and LIVE DB QPS
 *   POST /admin/coalesce      {on: true|false}   toggle request coalescing
 *   POST /admin/reset-stats
 *
 * The experiment: warm the cache, then FLUSHALL under load. Every request
 * misses at once, and they all go to a database sized for ~5% of that traffic.
 * That is a cold-cache outage, and it is how losing a PERFORMANCE component
 * causes an AVAILABILITY failure.
 */

const http = require('node:http');
const { Pool } = require('pg');
const Redis = require('ioredis');

const CACHE_TTL = Number(process.env.CACHE_TTL ?? 60);
let COALESCE = (process.env.COALESCE ?? 'false') === 'true';

const pool = new Pool({
  host: process.env.PGHOST ?? 'postgres',
  user: process.env.PGUSER ?? 'lab',
  password: process.env.PGPASSWORD ?? 'lab',
  database: process.env.PGDATABASE ?? 'lab',
  // Deliberately small: a real service does not get unlimited DB connections,
  // and connection exhaustion is part of how a cold-cache outage actually
  // manifests (Phase 3A note 08).
  max: 20,
  connectionTimeoutMillis: 2000,
});

const redis = new Redis({ host: process.env.REDIS_HOST ?? 'redis', port: 6379 });

// ------------------------------------------------------------------ metrics
const stats = {
  requests: 0,
  hits: 0,
  misses: 0,
  dbQueries: 0,
  coalesced: 0, // misses that piggybacked on an in-flight query
  errors: 0,
  dbQueryTimestamps: [], // rolling window for live QPS
};

function recordDbQuery() {
  stats.dbQueries += 1;
  const now = Date.now();
  stats.dbQueryTimestamps.push(now);
  // keep only the last second
  while (stats.dbQueryTimestamps.length && stats.dbQueryTimestamps[0] < now - 1000) {
    stats.dbQueryTimestamps.shift();
  }
}
const dbQps = () => stats.dbQueryTimestamps.length;

// ------------------------------------------------------- request coalescing
//
// ⭐ THE FIX. Also called "singleflight" or "request collapsing".
//
// Without it: 500 concurrent misses for the SAME key produce 500 identical
// database queries. With it: the first miss starts the query, and the other
// 499 await THAT SAME PROMISE. One query serves all of them.
//
// This is an in-process version. Across many instances you would additionally
// need a distributed lock or probabilistic early expiry -- see note 05.
const inFlight = new Map();

async function loadFromDb(id) {
  recordDbQuery();
  // A deliberately non-trivial query, so a miss is genuinely more expensive
  // than a hit rather than being lost in the noise.
  const { rows } = await pool.query(
    `SELECT id, name, description, price_cents, category,
            (SELECT count(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
       FROM products p WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

async function getProduct(id) {
  const key = `product:${id}`;

  const cached = await redis.get(key);
  if (cached !== null) {
    stats.hits += 1;
    return JSON.parse(cached);
  }
  stats.misses += 1;

  if (COALESCE) {
    const pending = inFlight.get(key);
    if (pending) {
      stats.coalesced += 1;
      return pending; // ride along with the in-flight query
    }
    const p = (async () => {
      try {
        const row = await loadFromDb(id);
        if (row) await redis.set(key, JSON.stringify(row), 'EX', CACHE_TTL);
        return row;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, p);
    return p;
  }

  // No coalescing: every miss goes straight to the database.
  const row = await loadFromDb(id);
  if (row) await redis.set(key, JSON.stringify(row), 'EX', CACHE_TTL);
  return row;
}

// ------------------------------------------------------------------- server
function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req) {
  let raw = '';
  req.setEncoding('utf8');
  for await (const c of req) raw += c;
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') return json(res, 200, { ok: true });

  if (url.pathname === '/stats') {
    const total = stats.hits + stats.misses;
    return json(res, 200, {
      ...stats,
      dbQueryTimestamps: undefined,
      hitRate: total ? +(stats.hits / total).toFixed(4) : 0,
      dbQpsNow: dbQps(),
      coalesce: COALESCE,
    });
  }

  if (url.pathname === '/admin/coalesce' && req.method === 'POST') {
    const b = await readBody(req).catch(() => ({}));
    COALESCE = b.on !== false;
    return json(res, 200, { coalesce: COALESCE });
  }

  if (url.pathname === '/admin/reset-stats' && req.method === 'POST') {
    Object.assign(stats, {
      requests: 0, hits: 0, misses: 0, dbQueries: 0, coalesced: 0, errors: 0,
      dbQueryTimestamps: [],
    });
    return json(res, 200, { ok: true });
  }

  const m = url.pathname.match(/^\/api\/product\/(\d+)$/);
  if (m) {
    stats.requests += 1;
    try {
      const product = await getProduct(Number(m[1]));
      if (!product) return json(res, 404, { error: 'not found' });
      return json(res, 200, product);
    } catch (err) {
      stats.errors += 1;
      return json(res, 503, { error: err.message });
    }
  }

  return json(res, 404, { error: 'not found' });
});

server.listen(Number(process.env.PORT ?? 3000), () =>
  console.log(`[app] listening :${process.env.PORT ?? 3000}  coalesce=${COALESCE} ttl=${CACHE_TTL}s`),
);
