'use strict';
/**
 * Part B — a zero-downtime column rename, with writes flowing throughout.
 *
 *   docker compose run --rm migration node run.js
 *
 * Gate Q3: "walk through a zero-downtime column rename on a 500M-row table."
 *
 * The naive `ALTER TABLE users RENAME COLUMN email TO email_address` is
 * instant in Postgres -- and it BREAKS EVERY RUNNING APP INSTANCE the moment
 * it commits, because old code still selects `email`. You cannot deploy code
 * and schema atomically. Hence EXPAND -> MIGRATE -> CONTRACT.
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST ?? 'postgres',
  user: process.env.PGUSER ?? 'lab',
  password: process.env.PGPASSWORD ?? 'lab',
  database: process.env.PGDATABASE ?? 'lab',
  max: 10,
});

const ROWS = Number(process.env.ROWS ?? 200000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hr = (t) => {
  console.log('\n' + '='.repeat(72));
  console.log('  ' + t);
  console.log('='.repeat(72));
};

// ---------------------------------------------------------------- the writer
//
// Simulates production traffic: continuous INSERTs and UPDATEs for the whole
// duration of the migration. If ANY of these fail, the migration was not
// zero-downtime.
const writer = {
  running: false,
  inserts: 0, updates: 0, errors: 0, errorSamples: [],
  // Which column the CURRENTLY DEPLOYED app version writes to.
  phase: 'old',   // old | dual | new
  nextId: ROWS + 1,
};

async function writeOnce() {
  const id = writer.nextId++;
  const email = `user${id}@example.com`;
  try {
    if (writer.phase === 'old') {
      await pool.query('INSERT INTO users (id, name, email) VALUES ($1,$2,$3)', [id, `u${id}`, email]);
    } else if (writer.phase === 'dual') {
      // ⭐ The deploy that writes BOTH columns. This is the version that must
      //    be running before any backfill, and it must be able to run
      //    alongside the OLD version (which writes only `email`).
      await pool.query(
        'INSERT INTO users (id, name, email, email_address) VALUES ($1,$2,$3,$3)',
        [id, `u${id}`, email],
      );
    } else {
      await pool.query('INSERT INTO users (id, name, email_address) VALUES ($1,$2,$3)', [id, `u${id}`, email]);
    }
    writer.inserts++;

    // Also UPDATE an existing row -- updates are what make a backfill racy.
    const target = Math.floor(Math.random() * ROWS) + 1;
    const newEmail = `updated${Date.now()}@example.com`;
    if (writer.phase === 'old') {
      await pool.query('UPDATE users SET email=$1 WHERE id=$2', [newEmail, target]);
    } else if (writer.phase === 'dual') {
      await pool.query('UPDATE users SET email=$1, email_address=$1 WHERE id=$2', [newEmail, target]);
    } else {
      await pool.query('UPDATE users SET email_address=$1 WHERE id=$2', [newEmail, target]);
    }
    writer.updates++;
  } catch (err) {
    writer.errors++;
    if (writer.errorSamples.length < 5) writer.errorSamples.push(err.message.split('\n')[0]);
  }
}

async function runWriter() {
  writer.running = true;
  while (writer.running) {
    await writeOnce();
    await sleep(2);
  }
}

function writerReport(label) {
  console.log(
    `    [writer] ${label.padEnd(28)} inserts=${writer.inserts} updates=${writer.updates} ` +
      (writer.errors ? `\x1b[31mERRORS=${writer.errors}\x1b[0m` : '\x1b[32merrors=0\x1b[0m'),
  );
}

// ------------------------------------------------------------------- setup
async function setup() {
  await pool.query('DROP TABLE IF EXISTS users');
  await pool.query(`CREATE TABLE users (
      id int PRIMARY KEY, name text NOT NULL, email text NOT NULL)`);
  await pool.query(
    `INSERT INTO users (id, name, email)
     SELECT g, 'u'||g, 'user'||g||'@example.com' FROM generate_series(1,$1) g`, [ROWS]);
  await pool.query('ANALYZE users');
}

(async () => {
  hr('SETUP');
  await setup();
  const { rows: c } = await pool.query('SELECT count(*)::int n FROM users');
  console.log(`    ${c[0].n.toLocaleString()} rows in users(id, name, email)`);
  console.log(`
    Goal: rename  email -> email_address  with ZERO downtime and ZERO errors,
    while writes are flowing the entire time.
`);

  // ================================================== why not just rename
  hr('WHY NOT JUST `ALTER TABLE ... RENAME COLUMN`?');
  console.log(`
    In Postgres the rename itself is instant (a catalog update). The problem
    is not the lock -- it is that you CANNOT DEPLOY CODE AND SCHEMA ATOMICALLY.

    At the moment it commits, every running instance of the OLD code is still
    executing  SELECT email FROM users  -> immediate errors across the fleet
    until the deploy finishes rolling.

    ⭐ The schema and the code must be compatible in BOTH directions during
       the rollout, because both versions run simultaneously. That is the
       whole reason for expand -> migrate -> contract.
`);

  // start production traffic
  const writerTask = runWriter();
  await sleep(1500);
  writerReport('baseline (writes to `email`)');

  // ================================================== EXPAND
  hr('STEP 1 · EXPAND — add the new column (nullable, no default)');
  console.log(`
    ALTER TABLE users ADD COLUMN email_address text;
`);
  let t = Date.now();
  await pool.query('ALTER TABLE users ADD COLUMN email_address text');
  console.log(`    took ${Date.now() - t}ms`);
  writerReport('during ADD COLUMN');
  console.log(`
    ⭐ NULLABLE and NO DEFAULT is what makes this safe and instant. Adding a
       NOT NULL column, or a default on older Postgres, REWRITES THE WHOLE
       TABLE while holding ACCESS EXCLUSIVE -- on 500M rows that is your
       outage.

       (PG11+ optimises a constant default, but "nullable, no default, add
       the constraint later" is the rule that is always safe.)
`);

  // ================================================== DUAL WRITE
  hr('STEP 2 · DEPLOY DUAL-WRITE — the app writes BOTH columns');
  writer.phase = 'dual';
  await sleep(2000);
  writerReport('after dual-write deploy');
  console.log(`
    ⭐ THE ORDERING RULE: dual-write must be deployed BEFORE the backfill.
       Otherwise rows written between "backfill finished" and "deploy landed"
       have a NULL email_address -- a gap you would have to find later.

    Note this version is compatible with the OLD version still running
    alongside it during a rolling deploy: old instances write only \`email\`,
    new instances write both. Reads still use \`email\`, so nothing breaks.
`);

  // ================================================== BACKFILL
  hr('STEP 3 · BACKFILL — in batches, without blocking writes');
  console.log(`
    UPDATE users SET email_address = email
     WHERE id BETWEEN ... AND email_address IS NULL;      -- batched
`);
  t = Date.now();
  let done = 0;
  let passes = 0;
  const BATCH = 5000;
  // ⭐ LOOP UNTIL NOTHING IS LEFT -- do NOT iterate a fixed id range.
  //    Rows are being created WHILE the backfill runs, and an earlier version
  //    of this lab iterated `id 1..ROWS` and left 309 rows un-backfilled
  //    (everything inserted during the migration itself). A backfill must
  //    converge on "zero remaining", not "I walked the range I planned for".
  for (;;) {
    const { rowCount } = await pool.query(
      `UPDATE users SET email_address = email
        WHERE ctid IN (SELECT ctid FROM users WHERE email_address IS NULL LIMIT $1)`,
      [BATCH],
    );
    done += rowCount;
    passes++;
    if (rowCount === 0) break;
    // ⭐ Throttle. A backfill competes with production traffic; unthrottled
    //    it saturates I/O, spikes replication lag, and bloats the table.
    await sleep(15);
  }
  console.log(`    backfilled ${done.toLocaleString()} rows in ${((Date.now() - t) / 1000).toFixed(1)}s (${passes} passes, batches of ${BATCH}, throttled)`);
  writerReport('during backfill');
  console.log(`
    ⭐ THE RACE, and this is the detail that shows experience:
       \`AND email_address IS NULL\` means the backfill NEVER OVERWRITES a
       value a live write already set. Without it, the backfill can read an
       old \`email\`, then clobber a newer \`email_address\` written
       concurrently -- silently reverting a user's change.

       Batched + throttled + resumable + idempotent. All four matter.
`);

  // ================================================== VERIFY
  hr('STEP 4 · VERIFY — before you trust it');
  const { rows: v } = await pool.query(`
    SELECT count(*) FILTER (WHERE email_address IS NULL)::int AS nulls,
           count(*) FILTER (WHERE email_address IS DISTINCT FROM email)::int AS mismatched,
           count(*)::int AS total
      FROM users`);
  console.log(`    total rows      : ${v[0].total.toLocaleString()}`);
  console.log(`    NULL new column : ${v[0].nulls}`);
  console.log(`    mismatched      : ${v[0].mismatched}`);
  console.log(`
    ⭐ Both must be ZERO before you switch reads. In production this runs
       continuously as a reconciliation job, and you would also SHADOW READ:
       read both columns, serve the old one, log any mismatch. That is how
       you gain confidence rather than hope.
`);

  // ================================================== SWITCH READS
  hr('STEP 5 · SWITCH READS to the new column (behind a flag)');
  const { rows: sample } = await pool.query('SELECT email_address FROM users WHERE id = 1');
  console.log(`    reading email_address for id=1 -> ${sample[0].email_address}`);
  console.log(`
    ⭐ Behind a FEATURE FLAG, ramped: 1% -> 10% -> 50% -> 100%, watching
       error rate at each step. Still dual-writing, so rollback is instant
       and costs nothing -- flip the flag back.

       ⭐ This is the last fully reversible step.
`);

  // ================================================== RELAX THE CONSTRAINT
  hr('STEP 6 · DROP NOT NULL on the old column');
  console.log(`
    ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
`);
  t = Date.now();
  await pool.query('ALTER TABLE users ALTER COLUMN email DROP NOT NULL');
  console.log(`    took ${Date.now() - t}ms`);
  console.log(`
    ⭐ THE STEP EVERYONE FORGETS. \`email\` was declared NOT NULL. Until that
       constraint is dropped, the moment you deploy code that stops writing it
       EVERY INSERT FAILS:

         null value in column "email" violates not-null constraint

       An earlier version of this lab skipped this and produced 398 write
       errors -- a self-inflicted outage in a migration whose entire purpose
       was zero downtime. Dropping NOT NULL is metadata-only and instant.
`);

  // ================================================== STOP DUAL WRITE
  hr('STEP 7 · STOP WRITING THE OLD COLUMN');
  writer.phase = 'new';
  await sleep(2000);
  writerReport('writes to email_address only');
  console.log(`
    Deploy the version that writes only the new column. Keep the old column
    around -- readable, no longer written -- for a soak period.
`);

  // ================================================== CONTRACT
  hr('STEP 8 · CONTRACT — drop the old column (days later)');
  t = Date.now();
  await pool.query('ALTER TABLE users DROP COLUMN email');
  console.log(`    ALTER TABLE users DROP COLUMN email;  -- took ${Date.now() - t}ms`);
  writerReport('after DROP COLUMN');
  console.log(`
    ⭐ In production this happens DAYS later, not seconds. Once you drop it,
       rollback requires a restore. Everything before this point was
       reversible; this step is not.

       ⚠️ And set lock_timeout before ANY DDL: the ALTER waits for an
          ACCESS EXCLUSIVE lock, and every query arriving behind the WAITING
          DDL queues behind it too. One slow query + one migration = the
          table is down. \`SET lock_timeout = '3s'\` and retry instead.
`);

  // ================================================== RESULT
  writer.running = false;
  await writerTask;

  hr('RESULT');
  const { rows: fin } = await pool.query('SELECT count(*)::int n FROM users');
  console.log(`
    writes attempted during the migration : ${writer.inserts + writer.updates}
    ⭐ WRITE ERRORS                        : ${writer.errors}
    final row count                       : ${fin[0].n.toLocaleString()}
    final schema                          : users(id, name, email_address)
`);
  if (writer.errors) {
    console.log('    error samples:', writer.errorSamples);
  } else {
    console.log('    ✅ ZERO ERRORS. Every write succeeded, through all seven steps,');
    console.log('       including two deploys and two schema changes.\n');
  }

  console.log(`  ⭐ THE PATTERN (this is gate Q3, and it generalises):

     EXPAND    add the new thing, nullable, no default
     DEPLOY    dual-write -- BEFORE the backfill
     BACKFILL  batched, throttled, resumable, guarded against overwriting a
               concurrent write, and LOOPED UNTIL ZERO REMAIN
     VERIFY    reconcile + shadow reads. The step people skip.
     SWITCH    reads over, gradually, behind a flag  <- last reversible step
     RELAX     drop NOT NULL on the old column  <- the step everyone forgets
     STOP      writing the old thing
     CONTRACT  drop it, days later

     It is exactly the same shape as a shard-key migration (3d-05) and a
     store-to-store migration. Learn it once; it applies everywhere.
`);

  await pool.end();
})().catch((e) => { console.error('FAILED:', e.message, e.stack); process.exit(1); });
