'use strict';
/**
 * FAILOVER — and the data loss window nobody wants to quantify.
 *
 * Run this from the HOST (it needs to stop the primary container), not inside
 * the lab container:
 *
 *     node lab-c-replication/failover.js
 *
 * Sequence:
 *   1. write continuously to the primary, recording every ACKNOWLEDGED commit
 *   2. kill the primary abruptly (SIGKILL — a crash, not a graceful shutdown)
 *   3. promote the replica
 *   4. compare: which acknowledged writes SURVIVED?
 *
 * The gap is your RPO, measured rather than assumed.
 */

const { execSync } = require('node:child_process');
const { Client } = require('pg');

const PRIMARY_PORT = Number(process.env.PRIMARY_PORT ?? 5435);
const REPLICA_PORT = Number(process.env.REPLICA_PORT ?? 5436);
const HOST = process.env.PGHOST_LOCAL ?? 'localhost';

const mk = (port) =>
  new Client({ host: HOST, port, user: 'lab', password: 'lab', database: 'lab' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd) => execSync(cmd, { stdio: 'pipe' }).toString().trim();
const hr = (t) => {
  console.log('\n' + '='.repeat(76));
  console.log('  ' + t);
  console.log('='.repeat(76));
};

(async () => {
  hr('FAILOVER — measuring the real data-loss window');

  const p = mk(PRIMARY_PORT);
  await p.connect();

  await p.query('DROP TABLE IF EXISTS committed');
  await p.query(`
    CREATE TABLE committed (
      n bigint PRIMARY KEY,
      at timestamptz NOT NULL DEFAULT clock_timestamp()
    )
  `);
  await sleep(500);

  // ------------------------------------------------- write until killed
  console.log('\n  Writing to the primary. Every INSERT that returns is a commit the');
  console.log('  database ACKNOWLEDGED to the client — i.e. one the user was told succeeded.\n');

  const acked = [];
  let running = true;
  const writer = (async () => {
    let n = 0;
    while (running) {
      try {
        await p.query('INSERT INTO committed (n) VALUES ($1)', [++n]);
        acked.push(n); // only after the ack
      } catch {
        running = false; // primary died mid-write
      }
    }
  })();

  await sleep(2000);
  const ackedWhileHealthy = acked.length;
  console.log(`    ${ackedWhileHealthy} commits acknowledged while the replica was keeping up`);

  // ------------------------------------------------- make the replica LAG
  //
  // On an idle local network the replica keeps up trivially, so an abrupt kill
  // loses nothing and the lab would teach the WRONG lesson ("async is safe").
  //
  // NOTE: `docker pause` is NOT enough here, and the reason is instructive --
  // it freezes the container's PROCESSES, but the kernel keeps accepting data
  // into the TCP socket buffer and ACKing at the transport layer. The WAL still
  // arrives; the replica just drains it on unpause. Zero loss.
  //
  // STOPPING the replica actually severs the replication connection, which is
  // the realistic scenario: the standby is down (or unreachable) at the moment
  // the primary dies. THAT is when RPO stops being zero.
  console.log('\n  >>> docker stop the replica — the replication connection is severed');
  console.log('      (simulating a standby that is down when disaster strikes)\n');
  sh('docker stop p3c-replica');

  await sleep(4000);
  const ackedWhileLagging = acked.length - ackedWhileHealthy;
  console.log(`    ${ackedWhileLagging} MORE commits acknowledged while the replica was gone`);
  console.log('    (the primary happily kept accepting writes — that IS async replication)');

  // ------------------------------------------------- kill the primary
  console.log('\n  >>> SIGKILL the primary (an abrupt crash, no graceful shutdown)\n');
  sh('docker kill p3c-primary');
  running = false;
  await writer;
  try { await p.end(); } catch {}

  const lastAcked = acked[acked.length - 1] ?? 0;
  console.log(`    total acknowledged commits before the crash: ${acked.length} (last n = ${lastAcked})`);

  console.log('\n  >>> starting the replica — it comes back to find the primary gone\n');
  sh('docker start p3c-replica');
  // Wait for it to accept read-only connections again.
  for (let i = 0; i < 60; i++) {
    try {
      const probe = mk(REPLICA_PORT);
      await probe.connect();
      await probe.query('SELECT 1');
      await probe.end();
      break;
    } catch {
      await sleep(1000);
    }
  }

  // ------------------------------------------------- promote the replica
  console.log('\n  >>> promoting the replica\n');
  const r = mk(REPLICA_PORT);
  await r.connect();

  const before = await r.query('SELECT pg_is_in_recovery() AS r');
  console.log(`    replica in recovery before promotion: ${before.rows[0].r}`);

  await r.query('SELECT pg_promote(true, 60)');
  for (let i = 0; i < 60; i++) {
    const { rows } = await r.query('SELECT pg_is_in_recovery() AS r');
    if (!rows[0].r) break;
    await sleep(500);
  }
  const after = await r.query('SELECT pg_is_in_recovery() AS r');
  console.log(`    replica in recovery after promotion:  ${after.rows[0].r}   <- false = it is now a PRIMARY`);

  // ------------------------------------------------- measure the loss
  hr('THE DATA LOSS WINDOW');

  const { rows: cnt } = await r.query('SELECT count(*)::int c, COALESCE(max(n),0)::int m FROM committed');
  const survived = cnt[0].c;
  const maxN = cnt[0].m;
  const lost = acked.length - survived;

  console.log(`
    acknowledged by the old primary : ${acked.length}   (last n = ${lastAcked})
    present on the promoted replica : ${survived}   (last n = ${maxN})
    ------------------------------------------------------
    LOST                            : ${lost}  (${((lost / Math.max(acked.length, 1)) * 100).toFixed(2)}%)
`);

  if (lost > 0) {
    console.log(`    Those ${lost} transactions were COMMITTED. The database returned success.`);
    console.log('    A user saw "your order was placed". The data is gone.\n');
    console.log('    That is asynchronous replication working exactly as designed —');
    console.log('    your RPO is whatever had not yet been shipped when the primary died.');
  } else {
    console.log('    No loss this run — the replica happened to be fully caught up.');
    console.log('    Do NOT read that as "async replication is safe". Re-run under write');
    console.log('    load (or with a bigger burst) and the gap appears. RPO is a');
    console.log('    DISTRIBUTION, not a constant.');
  }

  console.log(`
    ── the second-order problem ────────────────────────────────────────
    Those lost writes may already exist in OTHER systems: a cache, a Kafka
    topic, an email that was sent, a payment captured at Stripe. Failover
    does not just lose data — it creates CROSS-SYSTEM INCONSISTENCY.

    ── and the old primary ─────────────────────────────────────────────
    It still has those ${lost} transactions on disk. If it came back up thinking
    it was still primary, you would have SPLIT BRAIN and two divergent
    datasets. This is why fencing exists: Postgres bumps the TIMELINE ID on
    promotion, and the old primary cannot rejoin without pg_rewind.
`);

  // The control file's timeline only updates at a checkpoint, so force one
  // before reading it -- otherwise you see the pre-promotion value.
  await r.query('CHECKPOINT');
  const { rows: tl } = await r.query('SELECT timeline_id FROM pg_control_checkpoint()');
  console.log(`    promoted replica timeline ID: ${tl[0].timeline_id}   (was 1 — this IS the fencing token)`);

  // ------------------------------------------------- SPLIT BRAIN, live
  hr('SPLIT BRAIN — demonstrated, not described');
  console.log('\n  Restarting the old primary, exactly as a careless recovery would.\n');
  sh('docker start p3c-primary');
  await sleep(8000);

  const old = mk(PRIMARY_PORT);
  try {
    await old.connect();
    const { rows: oldRows } = await old.query('SELECT count(*)::int c FROM committed');
    const { rows: oldRec } = await old.query('SELECT pg_is_in_recovery() AS r');
    const { rows: newRec } = await r.query('SELECT pg_is_in_recovery() AS r');

    console.log(`    OLD primary : ${oldRows[0].c} rows,  in_recovery = ${oldRec[0].r}`);
    console.log(`    NEW primary : ${survived} rows,  in_recovery = ${newRec[0].r}`);
    console.log(`
    BOTH report in_recovery = false. BOTH believe they are the primary.
    They hold DIFFERENT datasets — ${oldRows[0].c} rows vs ${survived}.

    If a load balancer or a stale DNS entry sent any client to the old node,
    it would accept writes, and the two histories would diverge permanently.
    That is split brain, and no automatic process can merge them afterwards.

    What prevents it in practice:
      · the TIMELINE ID (${tl[0].timeline_id} vs 1) — the old node cannot rejoin as a replica
        without pg_rewind, because its history has diverged
      · fencing / STONITH — forcibly stop the old node before promoting
      · quorum — only the side with a majority may elect a leader
`);
    await old.end();
  } catch (e) {
    console.log(`    (old primary did not come back: ${e.message})`);
  }

  await r.end();

  console.log(`
  ── to reset the lab ────────────────────────────────────────────────
    docker compose -f docker-compose.replication.yml down -v
    docker compose -f docker-compose.replication.yml up -d
`);
})().catch((e) => {
  console.error('  FAILED:', e.message);
  console.error('  (run this from the HOST, not inside the lab container)');
  process.exit(1);
});
