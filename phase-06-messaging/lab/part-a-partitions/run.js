'use strict';
/**
 * Part A — partitions, consumer groups and rebalancing.
 *
 *   A1  keys determine partitions, and that determines ORDERING
 *   A2  2 consumers share 3 partitions
 *   A3  add a 3rd  -> rebalance, 1 partition each
 *   A4  add a 4th  -> ⭐ ONE SITS IDLE. Partition count caps parallelism.
 */

const { Kafka, logLevel, AssignerProtocol } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'p6-lab',
  brokers: [process.env.KAFKA_BROKER ?? 'kafka:9092'],
  logLevel: logLevel.NOTHING,
});

const TOPIC = 'orders';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hr = (t) => {
  console.log('\n' + '='.repeat(72));
  console.log('  ' + t);
  console.log('='.repeat(72));
};

async function recreateTopic(partitions) {
  const admin = kafka.admin();
  await admin.connect();
  const existing = await admin.listTopics();
  if (existing.includes(TOPIC)) {
    await admin.deleteTopics({ topics: [TOPIC] });
    await sleep(2000);
  }
  await admin.createTopics({
    topics: [{ topic: TOPIC, numPartitions: partitions, replicationFactor: 1 }],
  });
  await sleep(1500);
  await admin.disconnect();
}

(async () => {
  hr('A1 — the key determines the partition, and therefore the ORDER');
  await recreateTopic(3);

  const producer = kafka.producer();
  await producer.connect();

  // Three orders, several events each. Key = orderId.
  const events = [];
  for (const orderId of ['order-A', 'order-B', 'order-C']) {
    for (const type of ['created', 'paid', 'shipped']) {
      events.push({ key: orderId, value: JSON.stringify({ orderId, type }) });
    }
  }
  const meta = await producer.send({ topic: TOPIC, messages: events });
  void meta;

  // Read everything back and show which partition each key landed in.
  const admin = kafka.admin();
  await admin.connect();
  const consumer = kafka.consumer({ groupId: 'inspect-' + Date.now() });
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: true });

  const byPartition = new Map();
  await consumer.run({
    eachMessage: async ({ partition, message }) => {
      const v = JSON.parse(message.value.toString());
      if (!byPartition.has(partition)) byPartition.set(partition, []);
      byPartition.get(partition).push(`${v.orderId}:${v.type}@${message.offset}`);
    },
  });
  await sleep(4000);
  await consumer.disconnect();

  console.log('');
  for (const p of [...byPartition.keys()].sort()) {
    console.log(`    partition ${p}:  ${byPartition.get(p).join('  ')}`);
  }
  console.log(`
  ⭐ Every event for one order is in ONE partition, in order.
     partition = hash(key) %% numPartitions

     Across partitions there is NO order. Is order-B's 'created' before or
     after order-A's 'shipped'? The question has no answer -- there is no
     cross-partition clock. That is why global ordering is impossible, and
     why you pick a key so that whatever must be ordered shares one.`);

  // ------------------------------------------------------------------ A2-A4
  hr('A2-A4 — consumer group scaling and rebalancing');
  console.log(`
  A partition is consumed by exactly ONE consumer in a group. So the
  partition count is a hard ceiling on parallelism.
`);

  const GROUP = 'billing';

  async function makeConsumer(name) {
    const c = kafka.consumer({
      groupId: GROUP,
      groupInstanceId: undefined,
      sessionTimeout: 10000,
      heartbeatInterval: 3000,
      rebalanceTimeout: 10000,
    });
    await c.connect();
    await c.subscribe({ topic: TOPIC, fromBeginning: true });
    await c.run({ eachMessage: async () => {} });
    c.__name = name;
    return c;
  }

  // Ask the BROKER who holds what, rather than listening for GROUP_JOIN
  // events. The event fires asynchronously and races the first join, which
  // makes any snapshot taken from it lag a rebalance behind.
  async function report(label) {
    const { groups } = await admin.describeGroups([GROUP]);
    const g = groups[0];
    console.log(`\n  ${label}   (state: ${g.state})`);
    let total = 0;
    const rows = g.members
      .map((m) => {
        const decoded = AssignerProtocol.MemberAssignment.decode(m.memberAssignment);
        const parts = (decoded && decoded.assignment[TOPIC]) || [];
        total += parts.length;
        return { id: m.clientId + ':' + m.memberId.slice(-6), parts: parts.sort((a, b) => a - b) };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const r of rows) {
      console.log(
        `    member ${r.id.padEnd(22)} partitions: [${r.parts.join(', ')}]` +
          (r.parts.length === 0 ? '   ⚠️  IDLE' : ''),
      );
    }
    console.log(`    ${total} partitions across ${rows.length} members`);
  }

  const c1 = await makeConsumer('consumer-1');
  await sleep(5000);
  await report('1 consumer:');

  const c2 = await makeConsumer('consumer-2');
  await sleep(8000);
  await report('2 consumers  -> REBALANCE:');

  const c3 = await makeConsumer('consumer-3');
  await sleep(8000);
  await report('3 consumers  -> REBALANCE:');

  const c4 = await makeConsumer('consumer-4');
  await sleep(8000);
  await report('4 consumers  -> REBALANCE:');

  console.log(`
  ⭐ THE CEILING: with 3 partitions, the 4th consumer gets NOTHING. Adding
     consumers beyond the partition count does not add throughput -- it adds
     an idle process.

     This is why partition count must be chosen for your FUTURE consumer
     count: you can add partitions later, but doing so re-maps keys
     (hash %% N) and breaks per-key ordering for existing data.`);

  for (const c of [c1, c2, c3, c4]) await c.disconnect();
  await admin.disconnect();
  await producer.disconnect();

  hr('WHAT A REBALANCE COSTS');
  console.log(`
  Every time group membership changes, partitions are reassigned.

    EAGER (older default)      : ALL consumers stop, revoke everything,
                                 re-join, get new assignments.
                                 ⚠️ A "stop-the-world" pause for the group.

    COOPERATIVE STICKY (modern): only the partitions that MUST move are
                                 revoked. Everyone else keeps consuming.

  Rebalances are triggered by: a consumer joining, leaving, CRASHING, or
  failing to heartbeat within session.timeout.ms -- and also by a consumer
  taking too long in poll() (max.poll.interval.ms), which is the classic
  "my consumer keeps rebalancing" bug: slow processing looks like death.

  STATIC MEMBERSHIP (group.instance.id) avoids a rebalance when a consumer
  restarts quickly -- valuable for rolling deploys.
`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
