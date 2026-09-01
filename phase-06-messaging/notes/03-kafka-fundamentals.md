# 06·03 · Kafka Fundamentals — Partitions & Ordering

> **Why this exists:** gate Q2 — *"explain why Kafka can't give you global ordering, and design around
> that."* Almost everything surprising about Kafka follows from one fact: **the partition is simultaneously
> the unit of ordering AND the unit of parallelism.** Those two things are in permanent tension.

---

## Reference

### The model

```
TOPIC: orders
  partition 0:  [0][1][2][3][4]...      ← an append-only, immutable LOG
  partition 1:  [0][1][2][3]...            offsets are per-partition
  partition 2:  [0][1][2][3][4][5]...
```

| Concept | Is |
|---|---|
| **Topic** | A named stream of records |
| **Partition** | An **ordered, immutable, append-only log**. The unit of everything. |
| **Offset** | A record's position **within its partition**. Monotonic, never reused. |
| **Record** | key, value, timestamp, headers |
| **Retention** | Records stay for a configured time/size — ⭐ **reading does not delete them** |

**Kafka is a log, not a queue.** Consuming doesn't remove anything; a consumer just advances its offset. That
single difference is why replay, multiple independent consumer groups, and rewinding to reprocess are all
possible — and none of them work with a traditional queue.

### ⭐ Why there is no global ordering

**Kafka guarantees ordering *within a partition*. Across partitions, there is none.**

**Why it can't:** a global order would require every record to pass through a single point that assigns
sequence numbers — which is exactly one partition's throughput. **Total ordering and horizontal scale are
mutually exclusive**, and Kafka chose scale.

```
partition 0: [order-created A][order-shipped A]      ← A's events are ordered ✅
partition 1: [order-created B]
      Is "order-created B" before or after "order-shipped A"?
      ⭐ THE QUESTION HAS NO ANSWER. There is no cross-partition clock.
```

### ⭐ How you design around it

**The technique: choose a partition key such that everything requiring an order shares one.**

```
producer.send({ topic: 'orders', key: orderId, value: event })
       partition = hash(key) % numPartitions
```

**All events for one order → same partition → strictly ordered.** Different orders may interleave — and you
almost never care.

| Ordering you need | Partition key |
|---|---|
| Per user | `user_id` |
| Per order / aggregate | `order_id` |
| Per conversation | `conversation_id` |
| Per account (ledger) | `account_id` |
| **Global** | ⚠️ **1 partition — and you've capped throughput at one consumer** |

> **The gate answer:** *"Kafka orders records within a partition, not across them — because a global order
> would need every record through a single sequencer, which is one partition's throughput. You design around
> it by picking a partition key so that everything needing an order shares a partition: key by `order_id` and
> every event for that order is strictly ordered, while different orders interleave harmlessly. If you truly
> need global ordering you use one partition and accept one consumer's worth of throughput — and I'd push
> back hard on whether the requirement is real, because usually 'ordered' means 'ordered per entity'."*

### ⚠️ The consequence that catches people

**`partition = hash(key) % numPartitions`** — that's **modulo hashing**, not consistent hashing
([Phase 2 note 04](../../phase-02-stateless-scaling/notes/04-consistent-hashing.md)).

> ⭐ **So changing the partition count re-maps keys**, and a key's events can land in a *different* partition
> from its history — **breaking ordering permanently for existing keys.**
>
> **Partition count is effectively a one-way decision.** You can add partitions; you cannot do so without
> breaking per-key ordering for data already written. Kafka does not rebalance existing records.

**Practical implications:**
- **Over-provision partitions up front.** They're cheap-ish; re-partitioning is not.
- Partition count caps consumer parallelism (below), so pick for your *future* consumer count
- To truly re-partition: create a new topic with the new count, replay through it, cut consumers over —
  the same **dual-write → backfill → verify → cut over** shape as
  [3d-05](../../phase-03-databases/notes/3d-05-resharding-without-downtime.md)

### Partitions as the unit of parallelism

```
3 partitions, consumer group with:
  1 consumer  -> it reads all 3
  2 consumers -> 2 + 1
  3 consumers -> 1 each        ⭐ maximum useful parallelism
  4 consumers -> 1 each + ONE IDLE      ← you measured this in the lab
```

> ⭐ **A partition is consumed by exactly ONE consumer in a group.** So **partition count is a hard ceiling
> on consumer parallelism.** Adding a fourth consumer to a 3-partition topic does nothing at all.

**And that's the tension:** more partitions = more parallelism, but each key still lands in exactly one, so
**per-key throughput is always one partition's worth**. A hot key is a hot partition, and no amount of
partitions fixes it (same shape as the hot-key problem in
[3d-03](../../phase-03-databases/notes/3d-03-shard-key-selection.md) and
[Phase 5 note 05](../../phase-05-caching/notes/05-failure-modes.md)).

**How many partitions?**

| Consideration | |
|---|---|
| ≥ your maximum expected consumer count | It's the parallelism ceiling |
| Throughput per partition | ~10 MB/s is a reasonable planning figure |
| ⚠️ **Too many** | More open files, more memory, **longer leader elections**, slower rebalances |
| Rule of thumb | Start with 2–3× your expected consumer count; **thousands per cluster is fine, hundreds of thousands is not** |

### The record key does three jobs

| Job | |
|---|---|
| **Partition assignment** | `hash(key) % partitions` |
| **Ordering scope** | Same key ⇒ same partition ⇒ ordered |
| ⭐ **Compaction identity** | With log compaction, Kafka keeps only the **latest value per key** ([06](06-kafka-replication-and-retention.md)) |

⚠️ **A null key means round-robin (or sticky) partitioning — so no ordering guarantee at all.** If ordering
matters and you forgot to set a key, you don't have ordering. This is a common, silent bug.

### Consumer groups — the two access patterns in one primitive

```
topic ──▶ consumer-group "billing"     each partition to exactly one member  (QUEUE semantics)
      └─▶ consumer-group "analytics"   reads EVERYTHING independently        (PUB/SUB semantics)
```

**One topic serves both patterns simultaneously**, because each group tracks its own offsets. That's the
thing a plain queue can't do, and it's why "just add another consumer" is usually free in Kafka and
expensive elsewhere.

---

## In your own words

**Why is Kafka a log rather than a queue? Name three things that follow.**

>

**Explain why global ordering is impossible, in terms of throughput.**

>

**Give the gate answer out loud, including the pushback on the requirement.**

>

**Why is partition count effectively permanent? What breaks if you change it?**

>

**3 partitions, 4 consumers in a group — what happens? What's the general rule?**

>

**What three jobs does the record key do? What happens if it's null?**

>

**How does one topic give you both queue and pub/sub semantics?**

>

---

## Links

- The three primitives → [02-queue-pubsub-log.md](02-queue-pubsub-log.md)
- Producers and partitioners → [04-kafka-producers.md](04-kafka-producers.md)
- Consumer groups & rebalancing → [05-kafka-consumers.md](05-kafka-consumers.md)
- Compaction → [06-kafka-replication-and-retention.md](06-kafka-replication-and-retention.md)
- Modulo vs consistent hashing → [Phase 2 note 04](../../phase-02-stateless-scaling/notes/04-consistent-hashing.md)
- ⭐ **Measure partition assignment yourself** → [`../lab/`](../lab/) Part A
- **DDIA ch. 11**
