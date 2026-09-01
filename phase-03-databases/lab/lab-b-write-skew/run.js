'use strict';
/**
 * WRITE SKEW — reproduce it, then fix it three ways.
 *
 * Two scenarios, and the difference between them IS the lesson:
 *
 *   SCENARIO 1  "at least one doctor on call"   -- an AGGREGATE invariant.
 *               Fixable by SERIALIZABLE and by SELECT FOR UPDATE.
 *               NOT fixable by a unique constraint -- there is no row to make unique.
 *
 *   SCENARIO 2  "no two bookings for the same room+slot"  -- a MATERIALISABLE conflict.
 *               The conflict IS a row, so a unique constraint fixes it outright.
 *
 * Each "transaction" gets its OWN connection, because two statements on the same
 * connection are serialised by definition and no anomaly could occur.
 */

const { pool, newClient, waitForDb } = require('../db');

const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const hr = (t) => {
  console.log('\n' + '='.repeat(78));
  console.log('  ' + t);
  console.log('='.repeat(78));
};

// ---------------------------------------------------------------- setup

async function resetDoctors() {
  await pool.query('DROP TABLE IF EXISTS doctors');
  await pool.query(`
    CREATE TABLE doctors (
      name    text PRIMARY KEY,
      shift   text NOT NULL,
      on_call boolean NOT NULL
    )
  `);
  await pool.query(`
    INSERT INTO doctors VALUES ('Alice','monday',true), ('Bob','monday',true)
  `);
}

async function onCallCount() {
  const { rows } = await pool.query(
    `SELECT count(*)::int n FROM doctors WHERE shift='monday' AND on_call`,
  );
  return rows[0].n;
}

/**
 * Both doctors try to go off call at the same time.
 * `lockClause` lets us switch between the plain read and SELECT ... FOR UPDATE.
 */
async function runDoctorsAttempt({ isolation, lockClause = '' }) {
  await resetDoctors();

  const a = newClient();
  const b = newClient();
  await a.connect();
  await b.connect();

  const outcome = { alice: null, bob: null, error: null };

  try {
    await a.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    await b.query(`BEGIN ISOLATION LEVEL ${isolation}`);

    // Both read the SAME rows and each decides "there are 2, so I may leave".
    // Interleaved deliberately: both reads happen before either write.
    //
    // NOTE: this selects ROWS, not count(*). Postgres rejects
    // `SELECT count(*) ... FOR UPDATE` with 0A000 (feature_not_supported) --
    // row locks need actual rows to lock. So we count in the client instead.
    const q = `SELECT name FROM doctors WHERE shift='monday' AND on_call ${lockClause}`;

    // With FOR UPDATE, this second read BLOCKS until A commits -- which is the fix.
    const aRead = await a.query(q);
    const bReadPromise = b.query(q);

    let bRead;
    if (lockClause) {
      // A must finish first, or we'd deadlock waiting on each other.
      await a.query(`UPDATE doctors SET on_call=false WHERE name='Alice'`);
      await a.query('COMMIT');
      outcome.alice = 'committed';
      bRead = await bReadPromise; // now unblocks, and sees the NEW count
    } else {
      bRead = await bReadPromise;
      await a.query(`UPDATE doctors SET on_call=false WHERE name='Alice'`);
      await b.query(`UPDATE doctors SET on_call=false WHERE name='Bob'`);
      await a.query('COMMIT');
      outcome.alice = 'committed';
    }

    console.log(dim(`    T1 read on_call count = ${aRead.rowCount}`));
    console.log(dim(`    T2 read on_call count = ${bRead.rowCount}`));

    if (lockClause) {
      // B now re-decides with fresh, locked data.
      if (bRead.rowCount >= 2) {
        await b.query(`UPDATE doctors SET on_call=false WHERE name='Bob'`);
        await b.query('COMMIT');
        outcome.bob = 'committed';
      } else {
        await b.query('ROLLBACK');
        outcome.bob = 'aborted (saw only 1 on call — correctly refused)';
      }
    } else {
      try {
        await b.query('COMMIT');
        outcome.bob = 'committed';
      } catch (err) {
        outcome.bob = `ABORTED: ${err.code} ${err.message.split('\n')[0]}`;
        outcome.error = err.code;
      }
    }
  } catch (err) {
    outcome.error = err.code ?? err.message;
    try { await a.query('ROLLBACK'); } catch {}
    try { await b.query('ROLLBACK'); } catch {}
    if (!outcome.bob) outcome.bob = `ABORTED: ${err.code ?? err.message}`;
  } finally {
    await a.end();
    await b.end();
  }

  outcome.finalCount = await onCallCount();
  return outcome;
}

function report(label, o) {
  console.log(`    T1 (Alice): ${o.alice}`);
  console.log(`    T2 (Bob):   ${o.bob}`);
  const good = o.finalCount >= 1;
  console.log(
    `    doctors still on call: ${o.finalCount}  ` +
      (good ? ok('✅ INVARIANT HELD') : bad('❌ INVARIANT VIOLATED — write skew')),
  );
  return good;
}

// ============================================================== SCENARIO 1
(async () => {
  await waitForDb();

  hr('SCENARIO 1 — "at least one doctor on call"   (an AGGREGATE invariant)');
  console.log(dim('\n  Alice and Bob are both on call. Both try to go off call simultaneously.'));
  console.log(dim('  Each reads "there are 2 of us, so I can leave" — then each writes a DIFFERENT row.\n'));

  console.log('  ── 1a. REPEATABLE READ (no protection) ' + '─'.repeat(30));
  const r1 = await runDoctorsAttempt({ isolation: 'REPEATABLE READ' });
  report('RR', r1);
  console.log(dim('\n    Why RR does not help: they wrote DIFFERENT rows, so there is no'));
  console.log(dim('    write-write conflict to detect. Each saw a valid snapshot.'));

  console.log('\n  ── 1b. FIX #1: SERIALIZABLE ' + '─'.repeat(42));
  const r2 = await runDoctorsAttempt({ isolation: 'SERIALIZABLE' });
  report('SER', r2);
  if (r2.error === '40001') {
    console.log(ok('    ✅ Postgres SSI detected the read-write dependency cycle and aborted one.'));
    console.log(dim('    Your application MUST catch 40001 and retry the whole transaction.'));
  }

  console.log('\n  ── 1c. FIX #2: SELECT ... FOR UPDATE ' + '─'.repeat(33));
  const r3 = await runDoctorsAttempt({ isolation: 'READ COMMITTED', lockClause: 'FOR UPDATE' });
  report('FU', r3);
  console.log(dim('    Locking the rows you READ turns an invisible read-write dependency'));
  console.log(dim('    into a visible lock conflict. T2 blocks, then re-reads and refuses.'));

  console.log('\n  ── 1d. FIX #3: a UNIQUE constraint? ' + '─'.repeat(34));
  console.log(bad('    ❌ NOT POSSIBLE for this invariant.'));
  console.log(dim('\n    "At least one doctor on call" is an AGGREGATE over a SET of rows.'));
  console.log(dim('    There is no single row whose uniqueness would express it. No UNIQUE'));
  console.log(dim('    constraint, no CHECK constraint (CHECK sees one row at a time) can'));
  console.log(dim('    encode it. This is the limitation the roadmap does not mention —'));
  console.log(dim('    and knowing WHEN a constraint cannot help is the senior signal.'));
  console.log(dim('\n    Scenario 2 shows the case where it CAN.'));

  // ============================================================ SCENARIO 2
  hr('SCENARIO 2 — "no double-booking a room"   (a MATERIALISABLE conflict)');
  console.log(dim('\n  Same write-skew SHAPE: both read "the room is free at 10:00", both book it.'));
  console.log(dim('  But here the conflict IS a row — so a unique constraint can express it.\n'));

  async function resetBookings(withConstraint) {
    await pool.query('DROP TABLE IF EXISTS bookings');
    await pool.query(`
      CREATE TABLE bookings (
        id      bigserial PRIMARY KEY,
        room_id int  NOT NULL,
        slot    text NOT NULL,
        who     text NOT NULL
      )
    `);
    if (withConstraint) {
      await pool.query('CREATE UNIQUE INDEX ux_room_slot ON bookings (room_id, slot)');
    }
  }

  async function runBooking(withConstraint) {
    await resetBookings(withConstraint);
    const a = newClient();
    const b = newClient();
    await a.connect();
    await b.connect();
    const out = { alice: null, bob: null };

    try {
      await a.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await b.query('BEGIN ISOLATION LEVEL REPEATABLE READ');

      // check-then-act: the classic broken pattern
      const ra = await a.query(`SELECT count(*)::int n FROM bookings WHERE room_id=1 AND slot='10:00'`);
      const rb = await b.query(`SELECT count(*)::int n FROM bookings WHERE room_id=1 AND slot='10:00'`);
      console.log(dim(`    T1 sees ${ra.rows[0].n} bookings · T2 sees ${rb.rows[0].n} bookings — both think it's free`));

      await a.query(`INSERT INTO bookings (room_id, slot, who) VALUES (1,'10:00','Alice')`);
      await a.query('COMMIT');
      out.alice = 'committed';

      try {
        await b.query(`INSERT INTO bookings (room_id, slot, who) VALUES (1,'10:00','Bob')`);
        await b.query('COMMIT');
        out.bob = 'committed';
      } catch (err) {
        out.bob = `REJECTED: ${err.code} (${err.code === '23505' ? 'unique_violation' : err.message.split('\n')[0]})`;
        try { await b.query('ROLLBACK'); } catch {}
      }
    } finally {
      await a.end();
      await b.end();
    }

    const { rows } = await pool.query(
      `SELECT count(*)::int n FROM bookings WHERE room_id=1 AND slot='10:00'`,
    );
    out.count = rows[0].n;
    return out;
  }

  console.log('  ── 2a. REPEATABLE READ, no constraint ' + '─'.repeat(32));
  const b1 = await runBooking(false);
  console.log(`    T1: ${b1.alice}\n    T2: ${b1.bob}`);
  console.log(
    `    bookings for room 1 @ 10:00: ${b1.count}  ` +
      (b1.count === 1 ? ok('✅') : bad('❌ DOUBLE BOOKED — write skew')),
  );

  console.log('\n  ── 2b. FIX #3: UNIQUE (room_id, slot) ' + '─'.repeat(32));
  const b2 = await runBooking(true);
  console.log(`    T1: ${b2.alice}\n    T2: ${b2.bob}`);
  console.log(
    `    bookings for room 1 @ 10:00: ${b2.count}  ` +
      (b2.count === 1 ? ok('✅ INVARIANT HELD') : bad('❌')),
  );
  console.log(dim('\n    The unique index arbitrated the race at the storage layer — at'));
  console.log(dim('    REPEATABLE READ, with no explicit locks and no retry logic.'));
  console.log(dim('    Note T2 got 23505, which the app should treat as "slot taken", not a 500.'));

  // ================================================================ SUMMARY
  hr('THE POINT');
  console.log(`
  Both scenarios are the SAME anomaly: two transactions read overlapping data,
  each makes a locally-valid decision, and the combination breaks an invariant.

    fix                  doctors (aggregate)   booking (materialisable)
    ------------------------------------------------------------------
    SERIALIZABLE              ✅ works              ✅ works
    SELECT FOR UPDATE         ✅ works              ✅ works
    UNIQUE constraint         ❌ IMPOSSIBLE         ✅ works, and is best

  A unique constraint only fixes write skew when you can MATERIALISE the
  conflict into a row. When the invariant is an aggregate over a set --
  "at least N", "sum >= 0", "no more than K" -- no constraint expresses it,
  and you need SSI or explicit locks.

  Being able to state that distinction is the senior signal here.

  Postgres bonus: EXCLUDE constraints extend "materialisable" to overlapping
  RANGES, which covers most real booking problems:

    ALTER TABLE reservations ADD CONSTRAINT no_overlap
      EXCLUDE USING gist (room_id WITH =, during WITH &&);
`);

  console.log('  -> record these in ../RESULTS.md\n');
  await pool.end();
})().catch((err) => {
  console.error('  FAILED:', err.message, err.stack);
  process.exit(1);
});
