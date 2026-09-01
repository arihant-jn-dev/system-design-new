'use strict';
/**
 * Part C — the dual-write problem, and the outbox pattern.
 *
 *   C1  dual write: DB commit succeeds, publish fails -> SILENT DIVERGENCE
 *   C2  outbox:     both in ONE transaction, relayed separately -> no divergence
 *
 * This is gate Q1, demonstrated.
 */

const { Kafka, logLevel } = require('kafkajs');
const { Pool } = require('pg');

const kafka = new Kafka({
  clientId: 'p6-outbox',
  brokers: [process.env.KAFKA_BROKER ?? 'kafka:9092'],
  logLevel: logLevel.NOTHING,
});
const pool = new Pool({
  host: process.env.PGHOST ?? 'postgres',
  user: process.env.PGUSER ?? 'lab',
  password: process.env.PGPASSWORD ?? 'lab',
  database: process.env.PGDATABASE ?? 'lab',
});

const TOPIC = 'order-events';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hr = (t) => {
  console.log('\n' + '='.repeat(72));
  console.log('  ' + t);
  console.log('='.repeat(72));
};

async function recreateTopic() {
  const admin = kafka.admin();
  await admin.connect();
  const t = await admin.listTopics();
  if (t.includes(TOPIC)) { await admin.deleteTopics({ topics: [TOPIC] }); await sleep(2000); }
  await admin.createTopics({ topics: [{ topic: TOPIC, numPartitions: 3, replicationFactor: 1 }] });
  await sleep(1500);
  await admin.disconnect();
}

async function resetTables() {
  await pool.query('DROP TABLE IF EXISTS orders, outbox');
  await pool.query(`CREATE TABLE orders (
      id text PRIMARY KEY, user_id text NOT NULL, total int NOT NULL)`);
  await pool.query(`CREATE TABLE outbox (
      id bigserial PRIMARY KEY,
      aggregate_id text NOT NULL,
      event_type   text NOT NULL,
      payload      jsonb NOT NULL,
      created_at   timestamptz NOT NULL DEFAULT now(),
      sent_at      timestamptz)`);
}

/** Count how many events actually made it to Kafka. */
async function countPublished() {
  const consumer = kafka.consumer({ groupId: 'verify-' + Date.now() });
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
  const ids = new Set();
  await consumer.run({
    eachMessage: async ({ message }) => {
      ids.add(JSON.parse(message.value.toString()).orderId);
    },
  });
  await sleep(3500);
  await consumer.disconnect();
  return ids;
}

(async () => {
  const N = 10;
  const FAIL_AFTER = 6;   // the "publish" starts failing after this many

  // ================================================================== C1
  hr('C1 — DUAL WRITE: two systems, no shared commit point');
  await recreateTopic();
  await resetTables();

  console.log(`
  The naive version, which is what almost everyone writes first:

      await db.insert(order);                  // commits
      await kafka.send('OrderCreated', ...);   // separate system

  We create ${N} orders. The broker becomes unreachable after ${FAIL_AFTER}.
`);

  const producer = kafka.producer();
  await producer.connect();

  let published = 0;
  for (let i = 1; i <= N; i++) {
    const id = `order-${i}`;
    // Step 1: the database write COMMITS.
    await pool.query('INSERT INTO orders (id, user_id, total) VALUES ($1,$2,$3)',
      [id, `user-${i}`, i * 100]);

    // Step 2: publish. Simulate the broker being unreachable (or the process
    // dying) at this exact point -- the window between the two writes.
    try {
      if (i > FAIL_AFTER) throw new Error('broker unreachable');
      await producer.send({ topic: TOPIC, messages: [{ key: id, value: JSON.stringify({ orderId: id, type: 'OrderCreated' }) }] });
      published++;
    } catch {
      // In real code this is a log line nobody reads, or an exception that
      // rolls back nothing -- the order is ALREADY COMMITTED.
    }
  }
  await producer.disconnect();

  const { rows: c1 } = await pool.query('SELECT count(*)::int n FROM orders');
  const inKafka1 = await countPublished();
  console.log(`    orders in the database : ${c1[0].n}`);
  console.log(`    events in Kafka        : ${inKafka1.size}`);
  const missing = [...Array(N)].map((_, i) => `order-${i + 1}`).filter((id) => !inKafka1.has(id));
  console.log(`    ❌ MISSING events      : ${missing.length}  (${missing.join(', ')})`);

  console.log(`
  ❌ ${missing.length} orders exist and were never announced.

     The search index will never contain them. No confirmation email was
     sent. Analytics is short by ${missing.length}. And NOTHING ERRORED at the
     database -- the orders committed perfectly.

     ⭐ This is silent, permanent divergence. You typically discover it
        months later when someone asks why two systems disagree.

     Note reversing the order does not help: publish-then-write means you
     announce orders that do not exist, and downstream acts on a lie.`);

  // ================================================================== C2
  hr('C2 — THE OUTBOX PATTERN');
  await recreateTopic();
  await resetTables();

  console.log(`
      BEGIN;
        INSERT INTO orders  ...;
        INSERT INTO outbox  ...;      <- the event, in the SAME transaction
      COMMIT;                          <- ONE local transaction. Atomic.

      ... a separate RELAY reads the outbox and publishes to Kafka.

  Same failure: the broker is unreachable while the first ${FAIL_AFTER} orders are
  created. The difference is that the events are already DURABLE in Postgres.
`);

  // --- the application: one transaction, always
  for (let i = 1; i <= N; i++) {
    const id = `order-${i}`;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO orders (id, user_id, total) VALUES ($1,$2,$3)',
        [id, `user-${i}`, i * 100]);
      await client.query(
        `INSERT INTO outbox (aggregate_id, event_type, payload) VALUES ($1,$2,$3)`,
        [id, 'OrderCreated', JSON.stringify({ orderId: id, type: 'OrderCreated' })],
      );
      await client.query('COMMIT');           // ⭐ both, or neither
    } finally {
      client.release();
    }
  }

  const { rows: pend } = await pool.query('SELECT count(*)::int n FROM outbox WHERE sent_at IS NULL');
  console.log(`    orders written : ${N}`);
  console.log(`    outbox pending : ${pend[0].n}   ⭐ nothing published yet -- and nothing lost`);

  // --- the relay (polling flavour; production would use CDC/Debezium)
  console.log('\n    >>> broker recovers; relay runs...\n');
  const relay = kafka.producer();
  await relay.connect();

  let relayed = 0;
  for (;;) {
    const client = await pool.connect();
    let batch;
    try {
      await client.query('BEGIN');
      // ⭐ SKIP LOCKED lets many relay workers run concurrently with zero
      //    contention -- this is what makes the polling relay scalable.
      const { rows } = await client.query(`
        SELECT id, aggregate_id, payload FROM outbox
         WHERE sent_at IS NULL ORDER BY id LIMIT 5
         FOR UPDATE SKIP LOCKED`);
      batch = rows;
      if (rows.length) {
        await relay.send({
          topic: TOPIC,
          messages: rows.map((r) => ({
            // ⭐ key = aggregate id -> all events for one order land in one
            //    partition -> per-order ordering is preserved.
            key: r.aggregate_id,
            value: JSON.stringify(r.payload),
          })),
        });
        await client.query('UPDATE outbox SET sent_at = now() WHERE id = ANY($1::bigint[])',
          [rows.map((r) => r.id)]);
        relayed += rows.length;
      }
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    if (!batch.length) break;
  }
  await relay.disconnect();

  const { rows: c2 } = await pool.query('SELECT count(*)::int n FROM orders');
  const inKafka2 = await countPublished();
  console.log(`    orders in the database : ${c2[0].n}`);
  console.log(`    events in Kafka        : ${inKafka2.size}`);
  console.log(`    relayed by the relay   : ${relayed}`);
  const missing2 = [...Array(N)].map((_, i) => `order-${i + 1}`).filter((id) => !inKafka2.has(id));
  console.log(`    ✅ MISSING events      : ${missing2.length}`);

  console.log(`
  ✅ Zero divergence. The broker was down for the entire write phase and not
     one event was lost -- because the events were never in flight to Kafka
     in the first place. They were rows in Postgres, committed atomically
     with the orders.

  ⭐ THE REFRAMING (say this on the whiteboard):
     You did not solve the distributed transaction. You REMOVED it -- trading
     it for a LOCAL transaction plus AT-LEAST-ONCE DELIVERY, and
     at-least-once delivery is a solved problem (Part B).

     Note the relay is at-least-once too: it can publish and then crash
     before setting sent_at, republishing on restart. That is fine, because
     consumers dedupe on the event id -- which is exactly what you built in
     Part B.

     Together: OUTBOX (producer side) + INBOX (consumer side)
               = effectively-once end to end, using only local transactions.
`);

  await pool.end();
})().catch((e) => { console.error('FAILED:', e.message, e.stack); process.exit(1); });
