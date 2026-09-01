'use strict';
/**
 * Creates a 1,000,000-row table.
 *
 * generate_series does the whole thing server-side in one statement, so this
 * takes seconds rather than the many minutes a row-by-row INSERT loop would.
 */

const { pool, waitForDb } = require('./db');

const ROWS = Number(process.env.ROWS ?? 1_000_000);

(async () => {
  console.log('  waiting for postgres...');
  await waitForDb();

  console.log(`  seeding ${ROWS.toLocaleString()} rows (this takes ~10-30s)...`);
  const t = Date.now();

  await pool.query('DROP TABLE IF EXISTS events');
  await pool.query(`
    CREATE TABLE events (
      id          bigserial PRIMARY KEY,
      created_at  timestamptz NOT NULL,
      user_id     int         NOT NULL,
      event_type  text        NOT NULL,
      payload     text        NOT NULL
    )
  `);

  await pool.query(
    `
    INSERT INTO events (created_at, user_id, event_type, payload)
    SELECT
      now() - (interval '1 second' * g),
      (random() * 100000)::int,
      (ARRAY['click','view','purchase','signup'])[1 + (random()*3)::int],
      repeat('x', 80)
    FROM generate_series(1, $1) AS g
  `,
    [ROWS],
  );

  // The index that BOTH strategies get to use. This is important for a fair
  // fight: offset pagination is not slow because it lacks an index. It is slow
  // because OFFSET must walk and discard rows even WITH a perfect index.
  console.log('  creating index on (created_at, id)...');
  await pool.query('CREATE INDEX idx_events_created_id ON events (created_at DESC, id DESC)');
  await pool.query('ANALYZE events');

  const { rows } = await pool.query('SELECT count(*)::bigint AS n FROM events');
  const size = await pool.query(
    "SELECT pg_size_pretty(pg_total_relation_size('events')) AS size",
  );

  console.log(`  done in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  console.log(`  rows: ${Number(rows[0].n).toLocaleString()}   size: ${size.rows[0].size}`);
  await pool.end();
})().catch((err) => {
  console.error('  FAILED:', err.message);
  process.exit(1);
});
