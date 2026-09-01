'use strict';
/**
 * REASON 1 — PERFORMANCE.
 *
 * Same table, same index, same 20 rows returned. The only difference is how we
 * ask for them. Watch the "rows scanned" column: OFFSET makes the database
 * walk and throw away everything before the page.
 */

const { pool, waitForDb } = require('./db');

const PAGE = 20;
const DEPTHS = [0, 1_000, 10_000, 100_000, 500_000, 900_000];
const REPEATS = Number(process.env.REPEATS ?? 5);

const ms = (n) => `${n.toFixed(1)} ms`;
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

async function timeQuery(sql, params) {
  const times = [];
  for (let i = 0; i < REPEATS; i++) {
    const t = performance.now();
    await pool.query(sql, params);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)]; // median
}

async function explain(sql, params) {
  const { rows } = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, params);
  const plan = rows[0]['QUERY PLAN'][0];
  return {
    actualRows: plan.Plan['Actual Rows'],
    // For a Limit node the interesting number is what its CHILD produced.
    scanned: findScanned(plan.Plan),
    execMs: plan['Execution Time'],
    buffers: plan.Plan['Shared Hit Blocks'] + (plan.Plan['Shared Read Blocks'] ?? 0),
  };
}

function findScanned(node) {
  // Walk to the deepest scan node and report the rows it actually produced.
  if (!node.Plans || node.Plans.length === 0) return node['Actual Rows'];
  return Math.max(...node.Plans.map(findScanned), node['Actual Rows']);
}

(async () => {
  await waitForDb();

  const { rows: countRows } = await pool.query('SELECT count(*)::bigint AS n FROM events');
  const total = Number(countRows[0].n);
  console.log(`\n  table: events (${total.toLocaleString()} rows), index on (created_at DESC, id DESC)`);
  console.log(`  page size: ${PAGE}   median of ${REPEATS} runs\n`);

  console.log('=' .repeat(88));
  console.log(
    '  ' +
      pad('page depth (OFFSET)', 22) +
      padL('OFFSET time', 14) +
      padL('rows scanned', 15) +
      padL('KEYSET time', 14) +
      padL('rows scanned', 15),
  );
  console.log('='.repeat(88));

  const results = [];

  for (const depth of DEPTHS) {
    // ---- OFFSET -----------------------------------------------------------
    const offsetSql = `
      SELECT id, created_at, user_id, event_type
      FROM events
      ORDER BY created_at DESC, id DESC
      LIMIT ${PAGE} OFFSET ${depth}
    `;
    const offsetMs = await timeQuery(offsetSql, []);
    const offsetPlan = await explain(offsetSql, []);

    // ---- KEYSET -----------------------------------------------------------
    // Fetch the cursor that corresponds to this depth so the comparison is
    // apples-to-apples: both return the SAME 20 rows.
    const { rows: cursorRows } = await pool.query(`
      SELECT created_at, id FROM events
      ORDER BY created_at DESC, id DESC
      OFFSET ${depth} LIMIT 1
    `);
    if (cursorRows.length === 0) continue;
    const cursor = cursorRows[0];

    const keysetSql = `
      SELECT id, created_at, user_id, event_type
      FROM events
      WHERE (created_at, id) <= ($1, $2)
      ORDER BY created_at DESC, id DESC
      LIMIT ${PAGE}
    `;
    const keysetParams = [cursor.created_at, cursor.id];
    const keysetMs = await timeQuery(keysetSql, keysetParams);
    const keysetPlan = await explain(keysetSql, keysetParams);

    results.push({ depth, offsetMs, keysetMs, offsetScanned: offsetPlan.scanned, keysetScanned: keysetPlan.scanned });

    console.log(
      '  ' +
        pad(depth.toLocaleString(), 22) +
        padL(ms(offsetMs), 14) +
        padL(offsetPlan.scanned.toLocaleString(), 15) +
        padL(ms(keysetMs), 14) +
        padL(keysetPlan.scanned.toLocaleString(), 15),
    );
  }

  console.log('='.repeat(88));

  const first = results[0];
  const last = results[results.length - 1];
  console.log(
    `\n  OFFSET got ${(last.offsetMs / first.offsetMs).toFixed(1)}x slower from page 1 to the deepest page.`,
  );
  console.log(
    `  KEYSET stayed flat (${ms(first.keysetMs)} -> ${ms(last.keysetMs)}), scanning ${last.keysetScanned} rows either way.`,
  );
  console.log(
    `  At the deepest page KEYSET is ${(last.offsetMs / last.keysetMs).toFixed(0)}x faster.\n`,
  );

  // Show one real plan so the mechanism is visible, not just the timing.
  console.log('  --- EXPLAIN ANALYZE, OFFSET 500000 -------------------------------------');
  const { rows: p1 } = await pool.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT id, created_at FROM events
    ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET 500000
  `);
  p1.forEach((r) => console.log('    ' + r['QUERY PLAN']));

  console.log('\n  --- EXPLAIN ANALYZE, KEYSET at the same depth ---------------------------');
  const { rows: cur } = await pool.query(
    'SELECT created_at, id FROM events ORDER BY created_at DESC, id DESC OFFSET 500000 LIMIT 1',
  );
  const { rows: p2 } = await pool.query(
    `
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT id, created_at FROM events
    WHERE (created_at, id) <= ($1, $2)
    ORDER BY created_at DESC, id DESC LIMIT 20
  `,
    [cur[0].created_at, cur[0].id],
  );
  p2.forEach((r) => console.log('    ' + r['QUERY PLAN']));

  console.log(
    '\n  Read the plans: OFFSET reports "Rows Removed by ..." / a huge actual-rows count\n' +
      '  on the index scan. KEYSET seeks straight to the cursor. Same index, same 20 rows.\n',
  );

  await pool.end();
})().catch((err) => {
  console.error('  FAILED:', err.message);
  process.exit(1);
});
