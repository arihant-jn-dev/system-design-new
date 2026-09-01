'use strict';
/**
 * Replication lag, measured four ways.
 *
 *   C1  baseline propagation delay  — how fast does a write actually appear?
 *   C2  read-your-own-writes        — the anomaly, quantified
 *   C3  lag under write load        — in SECONDS and in BYTES
 *   C4  sync vs async commit cost   — the durability/latency trade, as a number
 */

const { Client } = require('pg');

const mk = (host) =>
  new Client({
    host,
    port: 5432,
    user: process.env.PGUSER ?? 'lab',
    password: process.env.PGPASSWORD ?? 'lab',
    database: process.env.PGDATABASE ?? 'lab',
  });

const PRIMARY = process.env.PRIMARY_HOST ?? 'primary';
const REPLICA = process.env.REPLICA_HOST ?? 'replica';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ms = (n) => `${n.toFixed(2)} ms`;
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const bytes = (n) =>
  n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
const hr = (t) => {
  console.log('\n' + '='.repeat(76));
  console.log('  ' + t);
  console.log('='.repeat(76));
};

(async () => {
  const p = mk(PRIMARY);
  const r = mk(REPLICA);
  await p.connect();
  await r.connect();

  // sanity
  const rec = await r.query('SELECT pg_is_in_recovery() AS r');
  if (!rec.rows[0].r) throw new Error('replica is not in recovery — is it actually a standby?');

  await p.query('DROP TABLE IF EXISTS ledger');
  await p.query(`
    CREATE TABLE ledger (
      id     bigserial PRIMARY KEY,
      note   text NOT NULL,
      wrote_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )
  `);
  await sleep(500);

  // ============================================================ C1
  hr('C1 — baseline propagation delay (idle system)');
  console.log('\n  Write on the primary, then poll the replica until the row appears.\n');

  const delays = [];
  for (let i = 0; i < 30; i++) {
    const t0 = performance.now();
    const { rows } = await p.query(
      `INSERT INTO ledger (note) VALUES ($1) RETURNING id`, [`probe-${i}`],
    );
    const id = rows[0].id;
    for (;;) {
      const got = await r.query('SELECT 1 FROM ledger WHERE id = $1', [id]);
      if (got.rowCount) break;
    }
    delays.push(performance.now() - t0);
  }

  console.log(
    `    p50 ${ms(pct(delays, 0.5))}   p95 ${ms(pct(delays, 0.95))}   ` +
      `p99 ${ms(pct(delays, 0.99))}   max ${ms(Math.max(...delays))}`,
  );
  console.log(
    '\n  On an idle local system lag is sub-millisecond. That is exactly why this\n' +
      '  bug hides in development and appears in production: lag is not constant,\n' +
      '  it SPIKES under load — which C3 shows.',
  );

  // ============================================================ C2
  hr('C2 — read-your-own-writes: the anomaly, quantified');
  console.log('\n  Write to the primary, then IMMEDIATELY read the replica (no polling).');
  console.log('  This is exactly what an app does when it round-robins reads across replicas.\n');

  let stale = 0;
  const TRIALS = 200;
  for (let i = 0; i < TRIALS; i++) {
    const { rows } = await p.query(
      `INSERT INTO ledger (note) VALUES ($1) RETURNING id`, [`ryw-${i}`],
    );
    const got = await r.query('SELECT 1 FROM ledger WHERE id = $1', [rows[0].id]);
    if (got.rowCount === 0) stale++;
  }
  console.log(
    `    ${stale}/${TRIALS} reads did NOT see the user's own write  ` +
      `(${((stale / TRIALS) * 100).toFixed(1)}%)`,
  );
  console.log(
    '\n  Every one of those is a user posting a comment and watching it vanish.\n' +
      '  Note this is a LOCAL, IDLE system — the real rate is far higher under load\n' +
      '  and across a network.',
  );

  // --- the fix, demonstrated
  console.log('\n  ── the fix: wait for the replica to reach the write\'s LSN ──\n');
  const fixed = [];
  let stillStale = 0;
  for (let i = 0; i < 50; i++) {
    const { rows } = await p.query(
      `INSERT INTO ledger (note) VALUES ($1) RETURNING id`, [`ryw-fix-${i}`],
    );
    const { rows: lsnRows } = await p.query('SELECT pg_current_wal_lsn() AS lsn');
    const target = lsnRows[0].lsn;

    const t0 = performance.now();
    // Poll until this replica has REPLAYED past our write's LSN.
    // In production you'd hand this LSN to the router as a read token and let
    // it pick a replica that has already caught up — no waiting at all.
    for (;;) {
      const { rows: rr } = await r.query(
        'SELECT pg_last_wal_replay_lsn() >= $1::pg_lsn AS caught_up', [target],
      );
      if (rr[0].caught_up) break;
    }
    fixed.push(performance.now() - t0);

    const got = await r.query('SELECT 1 FROM ledger WHERE id = $1', [rows[0].id]);
    if (got.rowCount === 0) stillStale++;
  }
  console.log(`    stale reads after the fix: ${stillStale}/50`);
  console.log(`    cost of waiting: p50 ${ms(pct(fixed, 0.5))}, p95 ${ms(pct(fixed, 0.95))}`);
  console.log(
    '\n  The LSN token turns "hope the replica caught up" into a CHECK. The simpler\n' +
      '  production variant is to pin that user\'s reads to the primary for a few\n' +
      '  seconds after they write.',
  );

  // ============================================================ C3
  hr('C3 — lag under write load: seconds AND bytes');
  console.log('\n  Hammer the primary with writes and sample lag from both sides.\n');

  const load = mk(PRIMARY);
  await load.connect();
  let running = true;
  const writer = (async () => {
    while (running) {
      await load.query(
        `INSERT INTO ledger (note)
         SELECT repeat('x', 200) FROM generate_series(1, 2000)`,
      );
    }
  })();

  console.log('    ' + 'elapsed'.padEnd(10) + 'time lag'.padEnd(14) + 'bytes behind'.padEnd(16) + 'write/flush/replay lag');
  console.log('    ' + '-'.repeat(68));
  let maxBytes = 0;
  let maxSecs = 0;
  for (let i = 1; i <= 8; i++) {
    await sleep(1000);
    const { rows: st } = await p.query(`
      SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)::bigint AS behind,
             COALESCE(write_lag::text,'-')  AS wl,
             COALESCE(flush_lag::text,'-')  AS fl,
             COALESCE(replay_lag::text,'-') AS rl
      FROM pg_stat_replication LIMIT 1
    `);
    const { rows: rt } = await r.query(`
      SELECT COALESCE(EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())), 0) AS secs
    `);
    const behind = Number(st[0]?.behind ?? 0);
    const secs = Number(rt[0].secs);
    maxBytes = Math.max(maxBytes, behind);
    maxSecs = Math.max(maxSecs, secs);
    console.log(
      '    ' + `${i}s`.padEnd(10) +
        `${secs.toFixed(3)} s`.padEnd(14) +
        bytes(behind).padEnd(16) +
        `${st[0]?.wl ?? '-'} / ${st[0]?.fl ?? '-'} / ${st[0]?.rl ?? '-'}`,
    );
  }
  running = false;
  await writer;
  await load.end();

  console.log(`\n    peak: ${maxSecs.toFixed(3)} s behind, ${bytes(maxBytes)} behind`);
  console.log(
    '\n  BYTES BEHIND is the leading indicator — it rises before time lag does and\n' +
      '  tells you whether the replica is DIVERGING or just briefly behind. Alert on\n' +
      '  both: seconds for user-visible staleness, bytes for "will this self-correct?".',
  );

  // ============================================================ C4
  hr('C4 — synchronous vs asynchronous commit: the trade as a number');

  // NOTE: ALTER SYSTEM cannot run inside a transaction block, and node-postgres
  // wraps a multi-statement string in an implicit one -- so each statement must
  // be its own query() call.
  async function setSyncStandby(value) {
    await p.query(`ALTER SYSTEM SET synchronous_standby_names = $$${value}$$`);
    await p.query('SELECT pg_reload_conf()');
    await sleep(500);
  }

  async function commitLatency(label) {
    const lat = [];
    for (let i = 0; i < 150; i++) {
      const t = performance.now();
      await p.query(`INSERT INTO ledger (note) VALUES ('sync-test')`);
      lat.push(performance.now() - t);
    }
    console.log(
      `    ${label.padEnd(36)} p50 ${ms(pct(lat, 0.5)).padStart(9)}   p95 ${ms(pct(lat, 0.95)).padStart(9)}`,
    );
    return pct(lat, 0.5);
  }

  console.log('');
  await setSyncStandby('');
  const asyncP50 = await commitLatency('async (no synchronous standby)');

  await setSyncStandby('ANY 1 (walreceiver)');
  const syncP50 = await commitLatency('SYNCHRONOUS standby, ANY 1');

  await setSyncStandby('');
  await p.query('SET synchronous_commit = off');
  const offP50 = await commitLatency('synchronous_commit = off');
  await p.query('SET synchronous_commit = on');

  console.log(`
    commit=off is ${(asyncP50 / offP50).toFixed(1)}x faster than async — it skips even the LOCAL
    fsync, at the cost of a ~600 ms window of committed-but-lost transactions.

    async -> sync costs ${(syncP50 - asyncP50).toFixed(2)} ms per commit (${(syncP50 / asyncP50).toFixed(1)}x)
    ...and that is over a LOCAL docker network. Across regions it is one full
    RTT: 50-150 ms per commit, which is a product-level latency change.

    What you buy: RPO = 0. No acknowledged write is lost when the primary dies.
    What you pay: every commit waits for a replica, and if the sync replica is
    slow or down, writes BLOCK. That's why you use 'ANY 1 (a, b)' quorum form
    rather than naming a single required standby.
`);

  console.log('  -> record these in ../RESULTS.md\n');
  await p.end();
  await r.end();
})().catch((e) => {
  console.error('  FAILED:', e.message);
  process.exit(1);
});
