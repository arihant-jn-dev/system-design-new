# 06·10 · Broker Comparison

> **Why this exists:** the roadmap wants these compared on **ordering, retention, delivery semantics,
> throughput and ops cost** — because "we'll use Kafka" is frequently the wrong answer, and SQS or a database
> table is frequently the right one.

---

## Reference

### The comparison table

| | **Kafka** | **RabbitMQ** | **SQS** | **Kinesis** | **Pulsar** | **NATS** | **Redis Streams** |
|---|---|---|---|---|---|---|---|
| Model | ⭐ **Log** | Queue + exchanges | Queue | Log | Log + queue | Pub/sub + JetStream | Log |
| **Retention** | ⭐ Time/size, **replayable** | Until acked | 14 days max | 24 h–365 d | Tiered | JetStream only | Capped stream |
| **Replay** | ✅ | ❌ | ❌ | ✅ | ✅ | ➖ JetStream | ✅ |
| **Ordering** | Per partition | Per queue | ⭐ **FIFO queues only** | Per shard | Per partition/key | ➖ | Per stream |
| Delivery | At-least-once (EOS in-Kafka) | At-least-once | At-least-once (FIFO: exactly-once-ish) | At-least-once | At-least/exactly | At-most/at-least | At-least-once |
| **Per-message ack** | ❌ Offsets | ⭐ ✅ **Excellent** | ⭐ ✅ | ❌ | ✅ | ✅ | ✅ |
| Priority / delay | ❌ | ⭐ ✅ Both | ✅ Delay | ❌ | ✅ | ➖ | ❌ |
| Throughput | ⭐ **Very high** | Medium | High | High | Very high | ⭐ **Extreme (low latency)** | High |
| **Ops cost** | ⚠️ **High** | Medium | ⭐ **Zero (managed)** | Low | ⚠️ High | Low | Low |

### When each is right

**⭐ Kafka** — replay, history, many independent consumers, high throughput, stream processing, event
sourcing. **Cost: real operational weight.** *"We need Kafka" is true far less often than it's said.*

**⭐ RabbitMQ** — **task queues where per-message semantics matter**: priorities, per-message TTL,
delayed delivery, complex routing (topic/fanout/direct exchanges), per-message ack/nack/requeue.
**Everything Kafka is bad at** ([02](02-queue-pubsub-log.md)). Choose it for **work distribution**, not event
streaming.

**⭐ SQS** — ⭐ **the default for task queues on AWS.** Zero ops, effectively infinite scale, per-message
visibility timeout, a built-in DLQ. **Standard** = at-least-once, unordered, very high throughput.
**FIFO** = ordered + dedupe within a 5-minute window, capped at ~3,000 msg/s with batching.
> *"Would SQS do?"* is a question worth asking before every Kafka proposal.

**Kinesis** — Kafka-like on AWS, managed, shard-based. Simpler ops than Kafka; less flexible, and you pay
per shard-hour.

**Pulsar** — segmented storage (BookKeeper) separates compute from storage, so **scaling brokers doesn't move
data**, plus native multi-tenancy, geo-replication and tiered storage. Technically elegant; **a smaller
ecosystem and more moving parts** than Kafka.

**NATS / JetStream** — extremely low latency and light. Core NATS is fire-and-forget; **JetStream** adds
persistence and replay. Great for service-to-service messaging and IoT.

**Redis Streams** — a lightweight log with consumer groups and acks. ⭐ **Good if you already run Redis** and
need modest durability — but Redis's async replication means a failover can lose acknowledged messages
([Phase 5 note 07](../../phase-05-caching/notes/07-redis-persistence-and-ha.md)).

### ⭐ The one people forget: a database table

```sql
SELECT * FROM jobs WHERE status='pending'
 ORDER BY created_at LIMIT 10
 FOR UPDATE SKIP LOCKED;
```

| ✅ | ❌ |
|---|---|
| ⭐ **Zero new infrastructure** | Doesn't scale to very high throughput |
| ⭐ **Transactional enqueue for free** — no dual-write problem at all | Polling overhead |
| Trivially inspectable and fixable with SQL | No fan-out |
| Retries, priorities, scheduling = plain columns | You build the tooling |

> ⭐ **For many systems this is the right answer for years**, and proposing it is a strong signal —
> especially because **enqueueing in the same transaction as the business write eliminates the dual-write
> problem by construction** ([09](09-outbox-and-cdc.md)).

### The decision path

```
Already on AWS, need a task queue?              -> SQS
Low volume, single consumer, want simplicity?   -> ⭐ a DB table with SKIP LOCKED
Need per-message priority/delay/routing?        -> RabbitMQ (or SQS + delay)
Need replay, history, many consumers?           -> Kafka
Need Kafka semantics without the ops?           -> Kinesis / MSK / Confluent Cloud
Ultra-low-latency service messaging?            -> NATS
Already run Redis, modest needs?                -> Redis Streams
```

### Combinations worth naming

| Combination | Why |
|---|---|
| ⭐ **SNS → SQS** | Pub/sub fan-out **plus** per-consumer queues with independent retries and DLQs. **Often a better fit than Kafka for task-style work.** |
| **Kafka → S3** | Archive for analytics ([3f-05](../../phase-03-databases/notes/3f-05-object-storage-and-olap.md)) |
| **CDC → Kafka → many** | The outbox at scale ([09](09-outbox-and-cdc.md)) |
| **Kafka + a DB table** | Kafka for events, a table for scheduled/delayed jobs (Kafka has no native delay) |

### The answer to give

> *"I'd default to SQS for task queues on AWS — zero ops, per-message retries, a built-in DLQ — and to Kafka
> only when I need replay, ordering guarantees, or several independent consumers of the same events. Kafka's
> operational cost is real, and 'we need a queue' usually doesn't mean 'we need a distributed log'. For low
> volume with a single consumer, I'd start with a jobs table using `SKIP LOCKED`, because enqueueing in the
> same transaction as the business write removes the dual-write problem entirely."*

---

## In your own words

**Compare Kafka and RabbitMQ on the four axes that matter. When is each right?**

>

**What does SQS FIFO give you, and what does it cost?**

>

**Why is a database job table underrated? What problem does it eliminate by construction?**

>

**Why is SNS → SQS often better than Kafka for task-style work?**

>

**Give the answer you'd say when someone proposes Kafka for a task queue.**

>

---

## Links

- The three primitives → [02-queue-pubsub-log.md](02-queue-pubsub-log.md)
- `SKIP LOCKED` job tables → [3b-04](../../phase-03-databases/notes/3b-04-locking-and-deadlocks.md)
- Redis Streams caveats → [Phase 5 note 08](../../phase-05-caching/notes/08-redis-beyond-caching.md)
- Outbox → [09-outbox-and-cdc.md](09-outbox-and-cdc.md)
- Build vs buy, TCO → [Phase 0 note 11](../../phase-00-foundations/notes/11-cost-dimensions.md)
