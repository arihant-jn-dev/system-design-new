'use strict';
/**
 * Six index strategies for the SAME query. The point is NOT "indexes are fast".
 *
 * The points are:
 *   1. COLUMN ORDER in a composite index decides whether it's used at all
 *   2. SELECTIVITY decides whether the planner will touch your index
 *   3. A covering index removes the heap fetch entirely
 *   4. A function on a column DISABLES a plain index on it
 *   5. An index you built can be completely IGNORED -- and the planner is right
 */

const { pool, waitForDb } = require('../db');

const REPEATS = Number(process.env.REPEATS ?? 5);

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const ms = (n) => `${n.toFixed(2)} ms`;

async function dropAllTestIndexes() {
  const { rows } = await pool.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'events' AND indexname LIKE 'ix_%'
  `);
  for (const r of rows) await pool.query(`DROP INDEX IF EXISTS ${r.indexname}`);
}

async function planFor(sql, params = []) {
  const { rows } = await pool.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
    params,
  );
  const root = rows[0]['QUERY PLAN'][0];
  const flat = [];
  (function walk(n) {
    flat.push(n);
    (n.Plans ?? []).forEach(walk);
  })(root.Plan);

  const scan = flat.find((n) => /Scan/.test(n['Node Type'])) ?? root.Plan;
  return {
    execMs: root['Execution Time'],
    nodeType: scan['Node Type'] + (scan['Index Name'] ? ` (${scan['Index Name']})` : ''),
    scanned: scan['Actual Rows'],
    removedByFilter: scan['Rows Removed by Filter'] ?? 0,
    heapFetches: scan['Heap Fetches'] ?? null,
    buffers: (scan['Shared Hit Blocks'] ?? 0) + (scan['Shared Read Blocks'] ?? 0),
    usedIndex: /Index/.test(scan['Node Type']) || /Bitmap/.test(scan['Node Type']),
    sortMethod: flat.find((n) => n['Sort Method'])?.['Sort Method'] ?? null,
  };
}

async function timeIt(sql, params = []) {
  const times = [];
  for (let i = 0; i < REPEATS; i++) {
    const t = performance.now();
    await pool.query(sql, params);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

// The query under test, in every scenario.
//
// Deliberately an AGGREGATE with no LIMIT. An earlier version of this lab used
// `ORDER BY created_at DESC LIMIT 20` and the "wrong column order" index came
// out just as fast -- because leading with created_at DESC happens to match the
// ORDER BY, so the planner could walk backwards from now() and stop after 20
// matches. That is a real and useful subtlety, but it MASKS the column-order
// lesson. An aggregate has no early exit, so the index must actually cover the
// predicate.
const QUERY = `
  SELECT count(*), sum(amount_cents)
  FROM events
  WHERE tenant_id = 42
    AND event_type = 'purchase'
    AND created_at > now() - interval '30 days'
`;

const SCENARIOS = [
  {
    name: '1. no index at all',
    setup: [],
    note: 'baseline: sequential scan of 10M rows',
  },
  {
    name: '2. WRONG column order',
    setup: ['CREATE INDEX ix_wrong ON events (created_at, tenant_id, event_type)'],
    note: 'range column FIRST -> equality predicates cannot seek',
  },
  {
    name: '3. single column only',
    setup: ['CREATE INDEX ix_tenant ON events (tenant_id)'],
    note: 'seeks on tenant, then FILTERS the rest -> wasted work',
  },
  {
    name: '4. RIGHT column order',
    setup: ['CREATE INDEX ix_right ON events (tenant_id, event_type, created_at DESC)'],
    note: 'equality, equality, then range/sort',
  },
  {
    name: '5. covering (INCLUDE)',
    setup: [
      'CREATE INDEX ix_cover ON events (tenant_id, event_type, created_at DESC) INCLUDE (amount_cents)',
    ],
    note: 'index has every column the query needs -> no heap fetch',
  },
];

(async () => {
  await waitForDb();

  const { rows: c } = await pool.query('SELECT count(*)::bigint n FROM events');
  console.log(`\n  events: ${Number(c[0].n).toLocaleString()} rows   ·  median of ${REPEATS} runs`);
  console.log("\n  Query: SELECT count(*), sum(amount_cents) FROM events");
  console.log("         WHERE tenant_id = 42 AND event_type = 'purchase'");
  console.log("           AND created_at > now() - interval '30 days'\n");

  console.log('='.repeat(112));
  console.log(
    '  ' + pad('strategy', 24) + padL('time', 11) + '   ' + pad('plan node', 34) +
      padL('scanned', 11) + padL('filtered', 11) + padL('buffers', 10),
  );
  console.log('='.repeat(112));

  const results = [];
  for (const s of SCENARIOS) {
    await dropAllTestIndexes();
    for (const stmt of s.setup) await pool.query(stmt);
    await pool.query('ANALYZE events');

    const t = await timeIt(QUERY);
    const p = await planFor(QUERY);
    results.push({ ...s, t, p });

    console.log(
      '  ' + pad(s.name, 24) + padL(ms(t), 11) + '   ' + pad(p.nodeType.slice(0, 33), 34) +
        padL(p.scanned.toLocaleString(), 11) +
        padL(p.removedByFilter.toLocaleString(), 11) +
        padL(p.buffers.toLocaleString(), 10),
    );
  }
  console.log('='.repeat(112));

  const base = results[0].t;
  const best = results[results.length - 1].t;
  console.log(`\n  no index -> covering index:  ${ms(base)} -> ${ms(best)}   (${(base / best).toFixed(0)}x faster)`);
  console.log(
    `  wrong order (${ms(results[1].t)}, ${results[1].p.buffers.toLocaleString()} buffers) vs ` +
      `right order (${ms(results[3].t)}, ${results[3].p.buffers.toLocaleString()} buffers)\n` +
      `      -> ${(results[1].t / results[3].t).toFixed(1)}x time, ` +
      `${(results[1].p.buffers / results[3].p.buffers).toFixed(1)}x pages read. SAME COLUMNS, different order.`,
  );
  console.log(
    `  scenario 3 read ${results[2].p.removedByFilter.toLocaleString()} rows only to THROW THEM AWAY\n` +
      `      ("filtered" column) — that is the signature of a predicate missing from the index.`,
  );
  const cover = results[4].p;
  console.log(
    `  covering index heap fetches: ${cover.heapFetches ?? 'n/a'}  ` +
      `(0 = truly index-only; >0 means the visibility map is stale -> run VACUUM)`,
  );

  // ======================================================= SELECTIVITY
  console.log('\n' + '='.repeat(112));
  console.log('  EXPERIMENT 2 — selectivity: an index the planner REFUSES to use');
  console.log('='.repeat(112));

  await dropAllTestIndexes();
  await pool.query('CREATE INDEX ix_type ON events (event_type)');
  await pool.query('CREATE INDEX ix_status ON events (status)');
  await pool.query('ANALYZE events');

  // NOTE: these select a NON-indexed column (amount_cents) on purpose. A bare
  // count(*) can often be answered index-only, which hides the bitmap-scan
  // middle ground we're trying to show.
  const selTests = [
    ["status = 'failed'", '0.5%', `SELECT sum(amount_cents) FROM events WHERE status = 'failed'`],
    ["event_type = 'purchase'", '33%', `SELECT sum(amount_cents) FROM events WHERE event_type = 'purchase'`],
    ["status = 'ok'", '99.5%', `SELECT sum(amount_cents) FROM events WHERE status = 'ok'`],
  ];

  console.log('\n  ' + pad('predicate', 26) + pad('selectivity', 16) + pad('plan chosen', 40) + 'index used?');
  console.log('  ' + '-'.repeat(100));
  for (const [label, sel, sql] of selTests) {
    const p = await planFor(sql);
    console.log(
      '  ' + pad(label, 26) + pad(sel, 16) + pad(p.nodeType.slice(0, 39), 40) +
        (p.usedIndex ? '✅ yes' : '❌ NO — seq scan'),
    );
  }
  console.log(
    '\n  Read this as a SPECTRUM, not a binary:\n' +
      '    0.5%   -> Index (Only) Scan   — few rows, index wins outright\n' +
      '    33%    -> BITMAP scan         — too many rows for random I/O, so Postgres\n' +
      '                                     collects row-ids first and reads the heap in\n' +
      '                                     PHYSICAL order. The middle ground.\n' +
      '    99.5%  -> Seq Scan            — index IGNORED ENTIRELY, and correctly so\n' +
      '\n  That last index exists, costs you on every write, and will never be used.\n' +
      '  It should be dropped. An index the planner refuses is pure write amplification.',
  );

  // ================================================= PARTIAL vs FULL
  console.log('\n' + '='.repeat(112));
  console.log("  EXPERIMENT 3 — partial index on the skewed column ('failed' = 0.5%)");
  console.log('='.repeat(112));

  await pool.query(`CREATE INDEX ix_partial ON events (created_at) WHERE status = 'failed'`);
  await pool.query('ANALYZE events');

  const { rows: sizes } = await pool.query(`
    SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) size
    FROM pg_indexes WHERE tablename='events' AND indexname IN ('ix_status','ix_partial')
    ORDER BY indexname
  `);
  console.log('');
  for (const r of sizes) console.log(`    ${pad(r.indexname, 14)} ${r.size}`);

  const partialSql = `SELECT id, created_at FROM events WHERE status='failed' ORDER BY created_at DESC LIMIT 20`;
  const pp = await planFor(partialSql);
  console.log(`\n    query on status='failed' -> ${pp.nodeType}`);
  console.log(
    '\n  A partial index stores only the 0.5% of rows you actually query. Far smaller,\n' +
      '  cheaper to maintain on writes, and the planner will happily use it.',
  );

  // ================================================= FUNCTION KILLS INDEX
  console.log('\n' + '='.repeat(112));
  console.log('  EXPERIMENT 4 — a function on a column disables the index');
  console.log('='.repeat(112));

  await dropAllTestIndexes();
  await pool.query('CREATE INDEX ix_email ON events (email)');
  await pool.query('ANALYZE events');

  const plainSql = `SELECT id FROM events WHERE email = 'User500000@Example.COM'`;
  const funcSql = `SELECT id FROM events WHERE lower(email) = 'user500000@example.com'`;

  const p1 = await planFor(plainSql);
  const t1 = await timeIt(plainSql);
  const p2 = await planFor(funcSql);
  const t2 = await timeIt(funcSql);

  console.log(`\n    WHERE email = '...'         ${padL(ms(t1), 11)}   ${p1.nodeType}`);
  console.log(`    WHERE lower(email) = '...'  ${padL(ms(t2), 11)}   ${p2.nodeType}   ← index ignored`);

  await pool.query('CREATE INDEX ix_email_lower ON events (lower(email))');
  await pool.query('ANALYZE events');
  const p3 = await planFor(funcSql);
  const t3 = await timeIt(funcSql);
  console.log(`    ...after CREATE INDEX ON events (lower(email)):`);
  console.log(`    WHERE lower(email) = '...'  ${padL(ms(t3), 11)}   ${p3.nodeType}   ← fixed`);
  console.log(
    `\n  ${(t2 / t3).toFixed(0)}x difference. Any function applied to a column in WHERE — lower(),\n` +
      '  date(), casts — makes a plain index on that column unusable. Either build an\n' +
      '  expression index or rewrite the predicate as a range.',
  );

  // ================================================= WRITE COST
  console.log('\n' + '='.repeat(112));
  console.log('  EXPERIMENT 5 — what indexes cost on WRITES');
  console.log('='.repeat(112));

  async function insertCost(label) {
    const { rows } = await pool.query(`
      SELECT count(*)::int n FROM pg_indexes WHERE tablename='events'
    `);
    const t = performance.now();
    await pool.query(`
      INSERT INTO events (tenant_id, event_type, status, email, amount_cents, created_at)
      SELECT (random()*99)::int+1, 'click', 'ok', 'x'||g||'@e.com', 1, now()
      FROM generate_series(1, 50000) g
    `);
    const el = performance.now() - t;
    console.log(`    ${pad(label, 34)} ${padL(rows[0].n + ' indexes', 12)}  ${padL(ms(el), 12)}`);
    return el;
  }

  console.log('');
  await dropAllTestIndexes();
  const fast = await insertCost('50k inserts, PK only');
  await pool.query('CREATE INDEX ix_a ON events (tenant_id, event_type, created_at)');
  await pool.query('CREATE INDEX ix_b ON events (email)');
  await pool.query('CREATE INDEX ix_c ON events (created_at)');
  await pool.query('CREATE INDEX ix_d ON events (status, amount_cents)');
  const slow = await insertCost('50k inserts, PK + 4 indexes');
  console.log(
    `\n  ${(slow / fast).toFixed(1)}x slower with 4 extra indexes. Every index is a tax on every\n` +
      '  write. This is why "just add an index" is a trade, not a free win.',
  );

  await dropAllTestIndexes();
  // Experiment 5 inserted 100k rows; remove them so re-runs start from the same
  // 10M baseline rather than growing the table each time.
  await pool.query(`DELETE FROM events WHERE email LIKE 'x%@e.com'`);
  console.log('\n  -> record these in ../RESULTS.md\n');
  await pool.end();
})().catch((err) => {
  console.error('  FAILED:', err.message);
  process.exit(1);
});
