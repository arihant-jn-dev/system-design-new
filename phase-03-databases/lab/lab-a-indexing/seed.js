'use strict';
/**
 * 10,000,000 rows for the indexing lab.
 *
 * The column distributions are chosen deliberately so the lab can demonstrate
 * SELECTIVITY, not just "index vs no index":
 *
 *   tenant_id    100 values          -> 1% selectivity   (good index candidate)
 *   event_type   4 values            -> 25% selectivity  (planner will REFUSE an index)
 *   status       99.5% 'ok'          -> skewed           (partial index shines)
 *   email        unique-ish          -> for the functional-index demo
 */

const { pool, waitForDb } = require('../db');

const ROWS = Number(process.env.ROWS ?? 10_000_000);

(async () => {
  console.log('  waiting for postgres...');
  await waitForDb();

  console.log(`  seeding ${ROWS.toLocaleString()} rows — this takes ~1-3 minutes...`);
  const t = Date.now();

  await pool.query('DROP TABLE IF EXISTS events');
  await pool.query(`
    CREATE TABLE events (
      id          bigserial PRIMARY KEY,
      tenant_id   int         NOT NULL,
      event_type  text        NOT NULL,
      status      text        NOT NULL,
      email       text        NOT NULL,
      amount_cents int        NOT NULL,
      created_at  timestamptz NOT NULL
    )
  `);

  // Insert in chunks so we don't build one enormous WAL transaction.
  const CHUNK = 1_000_000;
  for (let offset = 0; offset < ROWS; offset += CHUNK) {
    const n = Math.min(CHUNK, ROWS - offset);
    await pool.query(
      `
      INSERT INTO events (tenant_id, event_type, status, email, amount_cents, created_at)
      SELECT
        (random() * 99)::int + 1,
        (ARRAY['click','view','purchase','signup'])[1 + (random()*3)::int],
        CASE WHEN random() < 0.005 THEN 'failed' ELSE 'ok' END,
        'User' || g || '@Example.COM',
        (random() * 100000)::int,
        now() - (interval '1 second' * (g + $2))
      FROM generate_series(1, $1) AS g
      `,
      [n, offset],
    );
    process.stdout.write(`\r  ${(offset + n).toLocaleString()} / ${ROWS.toLocaleString()}`);
  }
  console.log('');

  console.log('  ANALYZE (planner statistics — without this every plan is a guess)...');
  await pool.query('ANALYZE events');

  const { rows: c } = await pool.query('SELECT count(*)::bigint n FROM events');
  const { rows: s } = await pool.query(
    "SELECT pg_size_pretty(pg_total_relation_size('events')) size",
  );
  const { rows: d } = await pool.query(`
    SELECT event_type, count(*)::bigint n FROM events GROUP BY 1 ORDER BY 2 DESC
  `);
  const { rows: st } = await pool.query(`
    SELECT status, count(*)::bigint n FROM events GROUP BY 1 ORDER BY 2 DESC
  `);

  console.log(`\n  done in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  console.log(`  rows: ${Number(c[0].n).toLocaleString()}   size: ${s[0].size}\n`);
  console.log('  selectivity of the columns you will index:');
  console.log(`    tenant_id:   100 distinct  ->  ~1% per value`);
  for (const r of d) {
    console.log(`    event_type='${r.event_type}':`.padEnd(32) + `${((r.n / c[0].n) * 100).toFixed(1)}%`);
  }
  for (const r of st) {
    console.log(`    status='${r.status}':`.padEnd(32) + `${((r.n / c[0].n) * 100).toFixed(2)}%`);
  }
  console.log('');

  await pool.end();
})().catch((err) => {
  console.error('  FAILED:', err.message);
  process.exit(1);
});
