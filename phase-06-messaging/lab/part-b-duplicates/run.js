'use strict';
/**
 * Part B — duplicate delivery, and absorbing it.
 *
 *   B1  a consumer that crashes AFTER processing but BEFORE committing its
 *       offset reprocesses those messages on restart -> DUPLICATES
 *   B2  the same crash, with an idempotent consumer (dedupe table)
 *       -> the duplicate is absorbed and the EFFECT happens once
 *
 * This is the concrete demonstration that "exactly-once delivery" is not a
 * thing, and that at-least-once + idempotent processing is what you actually
 * build.
 */

const { Kafka, logLevel } = require('kafkajs');
const { Pool } = require('pg');

const kafka = new Kafka({
  clientId: 'p6-dup',
  brokers: [process.env.KAFKA_BROKER ?? 'kafka:9092'],
  logLevel: logLevel.NOTHING,
});
const pool = new Pool({
  host: process.env.PGHOST ?? 'postgres',
  user: process.env.PGUSER ?? 'lab',
  password: process.env.PGPASSWORD ?? 'lab',
  database: process.env.PGDATABASE ?? 'lab',
});

const TOPIC = 'payments';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hr = (t) => {
  console.log('\n' + '='.repeat(72));
  console.log('  ' + t);
  console.log('='.repeat(72));
};

async function setup(numMessages) {
  const admin = kafka.admin();
  await admin.connect();
  const topics = await admin.listTopics();
  if (topics.includes(TOPIC)) {
    await admin.deleteTopics({ topics: [TOPIC] });
    await sleep(2000);
  }
  await admin.createTopics({ topics: [{ topic: TOPIC, numPartitions: 1, replicationFactor: 1 }] });
  await sleep(1500);
  await admin.disconnect();

  const producer = kafka.producer();
  await producer.connect();
  const msgs = [];
  for (let i = 1; i <= numMessages; i++) {
    msgs.push({
      key: `payment-${i}`,
      // ⭐ A STABLE, PRODUCER-ASSIGNED event id. This is what makes dedupe
      //    possible at all -- never hash the payload (two legitimate
      //    identical events would collide).
      value: JSON.stringify({ eventId: `evt-${i}`, paymentId: `pay-${i}`, amount: 100 }),
    });
  }
  await producer.send({ topic: TOPIC, messages: msgs });
  await producer.disconnect();
}

async function resetTables() {
  await pool.query('DROP TABLE IF EXISTS charges, processed_events');
  await pool.query(`CREATE TABLE charges (
      id serial PRIMARY KEY, payment_id text NOT NULL, amount int NOT NULL)`);
  await pool.query(`CREATE TABLE processed_events (
      event_id text PRIMARY KEY, processed_at timestamptz NOT NULL DEFAULT now())`);
}

async function chargeSummary() {
  const { rows } = await pool.query(`
    SELECT count(*)::int total, count(DISTINCT payment_id)::int distinct_payments,
           sum(amount)::int total_charged FROM charges`);
  return rows[0];
}

/**
 * @param idempotent  use the inbox pattern (dedupe row + effect in ONE tx)
 * @param crashAfter  crash after processing this many messages, before commit
 */
async function runConsumer({ idempotent, crashAfter, groupId }) {
  const consumer = kafka.consumer({
    groupId,
    sessionTimeout: 10000,
    heartbeatInterval: 3000,
    // ⭐ MANUAL commits. autoCommit would hide the whole lesson: the gap
    //    between "processed" and "offset committed" is exactly where
    //    duplicates come from.
  });
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: true });

  let processed = 0;
  let skipped = 0;
  let crashed = false;
  const BATCH = 5;              // commit offsets every 5 messages
  const pending = [];

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      if (crashed) return;
      const evt = JSON.parse(message.value.toString());

      if (idempotent) {
        // ⭐ THE INBOX PATTERN: the dedupe record and the effect commit
        //    ATOMICALLY. A duplicate hits the PK and the whole tx aborts,
        //    harmlessly.
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('INSERT INTO processed_events (event_id) VALUES ($1)', [evt.eventId]);
          await client.query('INSERT INTO charges (payment_id, amount) VALUES ($1, $2)',
            [evt.paymentId, evt.amount]);
          await client.query('COMMIT');
          processed++;
        } catch (err) {
          await client.query('ROLLBACK');
          if (err.code === '23505') skipped++;   // unique_violation = already done
          else throw err;
        } finally {
          client.release();
        }
      } else {
        await pool.query('INSERT INTO charges (payment_id, amount) VALUES ($1, $2)',
          [evt.paymentId, evt.amount]);
        processed++;
      }

      if (crashAfter && processed + skipped >= crashAfter) {
        // ⭐ THE CRASH: the work is done and committed to Postgres, but the
        //    OFFSETS for this whole batch were never committed to Kafka.
        //    Kafka still believes NONE of these were consumed.
        crashed = true;
        return;
      }

      // ⭐ BATCH COMMIT -- this is what real consumers do (commit every N
      //    messages or every N seconds, not once per message, because each
      //    commit is a network round trip).
      //
      //    It also widens the duplicate window: a crash mid-batch redelivers
      //    the ENTIRE uncommitted batch, not just one message.
      pending.push({ topic, partition, offset: (Number(message.offset) + 1).toString() });
      if (pending.length >= BATCH) {
        await consumer.commitOffsets(pending.splice(0, pending.length));
      }
    },
  });

  // let it work
  await sleep(crashAfter ? 4000 : 6000);
  if (!crashed && pending.length) {
    await consumer.commitOffsets(pending.splice(0, pending.length));
  }
  await consumer.disconnect();
  return { processed, skipped, crashed };
}

(async () => {
  const N = 10;

  // ================================================================== B1
  hr('B1 — crash before committing offsets  ->  DUPLICATE DELIVERY');
  await setup(N);
  await resetTables();

  console.log(`
  ${N} payment events. The consumer:
     1. processes a message (INSERT into charges)
     2. THEN commits its offset to Kafka

  We kill it after 5 messages -- work done, offsets NOT committed.
`);
  const r1 = await runConsumer({ idempotent: false, crashAfter: 5, groupId: 'g-dup' });
  console.log(`    before crash: processed ${r1.processed}`);
  let s = await chargeSummary();
  console.log(`    charges table: ${s.total} rows, ${s.distinct_payments} distinct payments, total charged ${s.total_charged}`);

  console.log('\n    >>> restarting the consumer (same group)...\n');
  const r2 = await runConsumer({ idempotent: false, groupId: 'g-dup' });
  console.log(`    after restart: processed ${r2.processed}`);
  s = await chargeSummary();
  console.log(`    charges table: ${s.total} rows, ${s.distinct_payments} distinct payments, total charged ${s.total_charged}`);

  console.log(`
  ❌ ${s.total} charge rows for ${s.distinct_payments} distinct payments.
     ${s.total - s.distinct_payments} payments were charged TWICE, and the customer was
     billed ${s.total_charged} instead of ${s.distinct_payments * 100}.

     ⭐ Nothing malfunctioned. Kafka delivered correctly, the consumer
        processed correctly. The messages whose offsets were never committed
        were simply redelivered -- which is exactly what AT-LEAST-ONCE means.

        This is why "exactly-once delivery" is not a thing: the consumer
        cannot atomically "finish the work" and "record that it finished"
        when those live in two different systems.`);

  // ================================================================== B2
  hr('B2 — the same crash, with an IDEMPOTENT consumer');
  await setup(N);
  await resetTables();

  console.log(`
  Identical scenario. The only change: the dedupe row and the charge commit
  in ONE Postgres transaction (the inbox pattern).

     BEGIN;
       INSERT INTO processed_events (event_id) VALUES (...);   -- PK
       INSERT INTO charges ...;
     COMMIT;
`);
  const r3 = await runConsumer({ idempotent: true, crashAfter: 5, groupId: 'g-idem' });
  console.log(`    before crash: processed ${r3.processed}, skipped ${r3.skipped}`);
  s = await chargeSummary();
  console.log(`    charges table: ${s.total} rows, total charged ${s.total_charged}`);

  console.log('\n    >>> restarting the consumer (same group)...\n');
  const r4 = await runConsumer({ idempotent: true, groupId: 'g-idem' });
  console.log(`    after restart: processed ${r4.processed}, ⭐ skipped as duplicates: ${r4.skipped}`);
  s = await chargeSummary();
  console.log(`    charges table: ${s.total} rows, ${s.distinct_payments} distinct payments, total charged ${s.total_charged}`);

  console.log(`
  ✅ ${s.total} rows for ${s.distinct_payments} payments. Every payment charged EXACTLY ONCE.

     ${r4.skipped} messages were redelivered -- exactly as before. The difference
     is that the consumer RECOGNISED them (unique violation on event_id)
     and did nothing.

  ⭐ THE EQUATION:
        at-least-once delivery  +  idempotent processing  =  effectively-once

     Delivery is still at-least-once. You did not fix delivery -- you made
     duplicate delivery HARMLESS. That is the only thing that is achievable,
     and it is achieved with a UNIQUE constraint.`);

  hr('WHY THE ORDER OF OPERATIONS MATTERS');
  console.log(`
  We committed the offset AFTER the work. Reversing it changes the failure:

    commit offset THEN process   -> AT-MOST-ONCE. A crash between them means
                                    the message is never processed. DATA LOSS.
    process THEN commit offset   -> AT-LEAST-ONCE. A crash between them means
                                    redelivery. DUPLICATES.   ⭐ almost always
                                    the right choice, because duplicates are
                                    fixable and loss is not.

  ⚠️ And note: enable.auto.commit (the default!) commits periodically in the
     background, which means it can commit offsets for messages you have not
     finished processing -- giving you AT-MOST-ONCE semantics by accident.
`);

  await pool.end();
})().catch((e) => { console.error('FAILED:', e.message, e.stack); process.exit(1); });
