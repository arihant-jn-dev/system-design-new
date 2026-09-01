'use strict';
/**
 * REASON 2 — CORRECTNESS. The one most candidates never mention, and the more
 * serious of the two.
 *
 * We simulate a paginating client on a live feed: read page 1, some rows get
 * inserted and deleted (as they would on any real feed), then read page 2.
 *
 * OFFSET pagination will DUPLICATE rows and, worse, SILENTLY SKIP them.
 * KEYSET pagination will not.
 *
 * The skip is the dangerous one: a nightly sync/export job paginating with
 * OFFSET drops records permanently, with no error anywhere.
 */

const { pool, waitForDb } = require('./db');

const PAGE = 20;

async function offsetPage(n) {
  const { rows } = await pool.query(
    `SELECT id FROM events ORDER BY created_at DESC, id DESC LIMIT ${PAGE} OFFSET ${n * PAGE}`,
  );
  return rows.map((r) => Number(r.id));
}

async function keysetPage(cursor) {
  const sql = cursor
    ? `SELECT id, created_at FROM events
       WHERE (created_at, id) < ($1, $2)
       ORDER BY created_at DESC, id DESC LIMIT ${PAGE}`
    : `SELECT id, created_at FROM events
       ORDER BY created_at DESC, id DESC LIMIT ${PAGE}`;
  const { rows } = await pool.query(sql, cursor ? [cursor.created_at, cursor.id] : []);
  return {
    ids: rows.map((r) => Number(r.id)),
    cursor: rows.length ? { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id } : null,
  };
}

// Insert rows at the TOP of the feed (newest), the way a live feed grows.
async function insertNewRows(k) {
  const { rows } = await pool.query(
    `INSERT INTO events (created_at, user_id, event_type, payload)
     SELECT now() + (interval '1 second' * g), 999999, 'injected', 'new'
     FROM generate_series(1, $1) AS g
     RETURNING id`,
    [k],
  );
  return rows.map((r) => Number(r.id));
}

async function deleteFromTop(k) {
  const { rows } = await pool.query(
    `DELETE FROM events
     WHERE id IN (
       SELECT id FROM events
       WHERE event_type <> 'injected'
       ORDER BY created_at DESC, id DESC LIMIT $1
     )
     RETURNING id`,
    [k],
  );
  return rows.map((r) => Number(r.id));
}

const overlap = (a, b) => a.filter((x) => b.includes(x));

(async () => {
  await waitForDb();
  await pool.query("DELETE FROM events WHERE event_type = 'injected'");

  console.log('\n' + '='.repeat(78));
  console.log('  SCENARIO 1 — rows INSERTED between page reads  (causes DUPLICATES)');
  console.log('='.repeat(78));

  {
    const p1 = await offsetPage(0);
    console.log(`  offset page 1  -> ${p1.length} rows, first id ${p1[0]}, last id ${p1[p1.length - 1]}`);

    const injected = await insertNewRows(5);
    console.log(`  ...5 new rows arrive at the top of the feed (ids ${injected[0]}..${injected[4]})`);

    const p2 = await offsetPage(1);
    const dupes = overlap(p1, p2);
    console.log(`  offset page 2  -> ${p2.length} rows`);
    console.log(
      dupes.length
        ? `  ❌ DUPLICATES: ${dupes.length} ids appeared on BOTH pages -> ${dupes.slice(0, 5).join(', ')}${dupes.length > 5 ? ' ...' : ''}`
        : '  (no duplicates this run — rerun; timing-dependent)',
    );
  }

  await pool.query("DELETE FROM events WHERE event_type = 'injected'");

  {
    const k1 = await keysetPage(null);
    console.log(`\n  keyset page 1  -> ${k1.ids.length} rows, last id ${k1.ids[k1.ids.length - 1]}`);
    const injected = await insertNewRows(5);
    console.log(`  ...same 5 rows arrive (ids ${injected[0]}..${injected[4]})`);
    const k2 = await keysetPage(k1.cursor);
    const dupes = overlap(k1.ids, k2.ids);
    console.log(`  keyset page 2  -> ${k2.ids.length} rows`);
    console.log(
      dupes.length ? `  ❌ duplicates: ${dupes.join(', ')}` : '  ✅ NO DUPLICATES — the cursor is anchored to a value, not a position',
    );
  }

  await pool.query("DELETE FROM events WHERE event_type = 'injected'");

  console.log('\n' + '='.repeat(78));
  console.log('  SCENARIO 2 — rows DELETED between page reads  (causes SILENT SKIPS)');
  console.log('  This is the one that corrupts sync jobs.');
  console.log('='.repeat(78));

  {
    // Snapshot the true ordering first so we know what SHOULD be on page 2.
    const { rows: truth } = await pool.query(
      `SELECT id FROM events ORDER BY created_at DESC, id DESC LIMIT ${PAGE * 2}`,
    );
    const trueIds = truth.map((r) => Number(r.id));

    const p1 = await offsetPage(0);
    console.log(`  offset page 1  -> ids ${p1[0]} .. ${p1[p1.length - 1]}`);

    const deleted = await deleteFromTop(5);
    console.log(`  ...5 rows deleted from the top (ids ${deleted.slice(0, 3).join(', ')} ...)`);

    const p2 = await offsetPage(1);
    const seen = new Set([...p1, ...p2]);
    // Rows that were in the true page-2 window, still exist, but were never returned.
    const { rows: alive } = await pool.query(
      `SELECT id FROM events WHERE id = ANY($1::bigint[])`,
      [trueIds],
    );
    const aliveIds = alive.map((r) => Number(r.id));
    const skipped = aliveIds.filter((id) => !seen.has(id) && !deleted.includes(id));

    console.log(`  offset page 2  -> ids ${p2[0]} .. ${p2[p2.length - 1]}`);
    console.log(
      skipped.length
        ? `  ❌ SILENTLY SKIPPED: ${skipped.length} rows still exist but were never returned on any page`
        : '  (no skip detected this run)',
    );
    console.log(`     e.g. ${skipped.slice(0, 5).join(', ')}`);
    console.log('     Nothing errored. A sync job would simply lose these records forever.');
  }

  console.log('\n' + '='.repeat(78));
  console.log('  THE POINT');
  console.log('='.repeat(78));
  console.log('  OFFSET addresses a POSITION in a result set that is still changing.');
  console.log('  KEYSET addresses a VALUE, which means the same thing regardless of');
  console.log('  what was inserted or deleted elsewhere.\n');
  console.log('  The performance argument gets the attention. The correctness argument');
  console.log('  is the one that silently corrupts data.\n');

  await pool.query("DELETE FROM events WHERE event_type = 'injected'");
  await pool.end();
})().catch((err) => {
  console.error('  FAILED:', err.message);
  process.exit(1);
});
