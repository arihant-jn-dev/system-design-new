# Phase 6 Lab — Kafka, Duplicates & the Outbox

> Roadmap: *"Kafka in Docker. Produce to a 3-partition topic, consume with a 2-consumer group, then add a
> third and observe rebalancing. Kill a consumer mid-batch and demonstrate duplicate delivery. Then make the
> consumer idempotent with a dedupe table and prove the duplicate is absorbed. Finally implement the outbox
> pattern."*

**Time: ~3.5 hrs.**

```bash
cd phase-06-messaging/lab
docker compose up -d --build
docker compose build lab            # ⚠️ the `lab` service is behind a tools profile,
                                    #    so `up --build` SKIPS it

docker compose run --rm lab node part-a-partitions/run.js
docker compose run --rm lab node part-b-duplicates/run.js
docker compose run --rm lab node part-c-outbox/run.js
```

Kafka on host **29092**, Postgres on **5438**. Uses **KRaft** — no ZooKeeper, which is how modern Kafka
works (4.0 removed ZooKeeper entirely).

> *You'll see a `TimeoutNegativeWarning` from kafkajs. It's a benign client-side warning, not a broker issue.*

---

# Part A — partitions, ordering and the parallelism ceiling

## A1 · The key determines the partition, and therefore the order

```
partition 0:  order-B:created@0  order-B:paid@1  order-B:shipped@2
              order-C:created@3  order-C:paid@4  order-C:shipped@5
partition 2:  order-A:created@0  order-A:paid@1  order-A:shipped@2
```

**Every event for one order landed in one partition, in order.** `partition = hash(key) % numPartitions`.

⭐ **Across partitions there is no order at all.** Is `order-B:created` before or after `order-A:shipped`?
**The question has no answer** — there's no cross-partition clock. That's why global ordering is impossible,
and why you choose a key so that whatever must be ordered shares a partition.

## A2–A4 · The consumer-group ceiling

```
1 consumer:   [0, 1, 2]
2 consumers:  [0, 1]  and  [2]
3 consumers:  [0]  [1]  [2]              ⭐ maximum useful parallelism
4 consumers:  [0]  [1]  [2]  and  []     ⚠️ IDLE
```

> ⭐ **A partition is consumed by exactly one member of a group, so partition count is a hard ceiling on
> parallelism.** The 4th consumer isn't slow — it gets nothing at all.

**And that's why partition count must be chosen for your *future* consumer count**: you can add partitions,
but `hash(key) % N` re-maps keys, so existing keys land in different partitions and **per-key ordering breaks
for data already written.**

> **A note on the implementation:** the script queries `admin.describeGroups()` rather than listening for
> `GROUP_JOIN` events. The event fires asynchronously and races the first join, so any snapshot taken from it
> lags a rebalance behind — the first version of this lab reported "1 consumer: 0 partitions" for exactly
> that reason. **Ask the broker, don't infer from events.**

---

# Part B — duplicate delivery ⭐

## The setup

10 payment events. The consumer **processes**, then **commits its offset** — and commits in **batches of 5**,
which is what real consumers do (each commit is a network round trip). We kill it after 5 messages: **the
work is committed to Postgres, the offsets never reached Kafka.**

## B1 · No idempotency ❌

```
before crash:  5 rows, total charged 500
>>> restart
after restart: processed 10
charges table: 15 rows, 10 distinct payments, total charged 1500
```

> ❌ **5 payments were charged twice. The customer was billed 1500 instead of 1000.**
>
> ⭐ **Nothing malfunctioned.** Kafka delivered correctly; the consumer processed correctly. The messages
> whose offsets were never committed were simply redelivered — **which is exactly what at-least-once means.**

**This is why exactly-once *delivery* is not a thing:** the consumer cannot atomically "finish the work" and
"record that it finished" when those live in two different systems.

⭐ **Note the batch size *is* the duplicate window.** Committing every 5 messages redelivered 5; committing
per-message would have redelivered 1. Bigger batches are faster and duplicate more — which is fine, because:

## B2 · Idempotent consumer ✅

```sql
BEGIN;
  INSERT INTO processed_events (event_id) VALUES ($1);  -- PK
  INSERT INTO charges (payment_id, amount) VALUES (...);
COMMIT;   -- ⭐ dedupe record and effect commit ATOMICALLY
```

```
after restart: processed 5, ⭐ skipped as duplicates: 5
charges table: 10 rows, 10 distinct payments, total charged 1000
```

> ✅ **Every payment charged exactly once.** The same 5 messages were redelivered — the consumer just
> **recognised** them (unique violation on `event_id`) and did nothing.

### ⭐ The equation

```
at-least-once delivery  +  idempotent processing  =  effectively-once
```

**You did not fix delivery.** Delivery is still at-least-once. **You made duplicate delivery harmless** —
with a `UNIQUE` constraint.

### Why the order of operations matters

| Order | Semantic | Failure |
|---|---|---|
| commit offset **then** process | **At-most-once** | ⚠️ **Data loss** |
| ⭐ process **then** commit offset | **At-least-once** | Duplicates — **fixable** |

⚠️ **And `enable.auto.commit=true` (the default) commits in the background**, including offsets for messages
you haven't finished — **at-most-once by accident.** The single most common silent data-loss bug in Kafka
consumers.

---

# Part C — the outbox ⭐

## C1 · Dual write ❌

10 orders created; the broker becomes unreachable after 6.

```
orders in the database : 10
events in Kafka        : 6
❌ MISSING events      : 4  (order-7, order-8, order-9, order-10)
```

> ❌ **4 orders exist and were never announced.** The search index will never contain them, no confirmation
> email was sent, analytics is short by 4 — **and nothing errored at the database.** The orders committed
> perfectly.
>
> ⭐ **Silent, permanent divergence.** Typically discovered months later when two systems disagree.

**Reversing the order doesn't help** — publish-then-write announces orders that don't exist, and downstream
acts on a lie.

## C2 · The outbox ✅

```sql
BEGIN;
  INSERT INTO orders ...;
  INSERT INTO outbox ...;    -- the event, SAME transaction
COMMIT;                       -- ⭐ both, or neither
```

```
orders written : 10
outbox pending : 10        ⭐ nothing published yet -- and nothing lost
>>> broker recovers; relay runs
events in Kafka: 10
✅ MISSING events: 0
```

> ✅ **Zero divergence, with the broker down for the entire write phase** — because the events were never in
> flight to Kafka. They were rows in Postgres, committed atomically with the orders.

### ⭐ The reframing (this is the gate answer)

> **You did not solve the distributed transaction. You removed it** — trading it for a **local transaction
> plus at-least-once delivery**, and at-least-once delivery is a solved problem (Part B).

The relay is at-least-once too: it can publish and crash before setting `sent_at`, republishing on restart.
**That's fine, because consumers dedupe on the event ID** — which is exactly what Part B built.

```
OUTBOX (producer side) + INBOX (consumer side) = effectively-once end to end,
                                                  using only local transactions
```

**Two details in the relay worth noting:**
- `FOR UPDATE SKIP LOCKED` — many relay workers, zero contention
- **key = aggregate ID** — all events for one order land in one partition, preserving per-order ordering

---

## Things to try

| Try | How | Expect |
|---|---|---|
| **Ordering breaks without a key** | Remove `key` from the producer in Part A | Round-robin; per-order ordering gone |
| **The rebalance-loop bug** | `sleep(60s)` inside `eachMessage` with default `max.poll.interval.ms` | Consumer kicked mid-batch, rejoins, repeats — lag grows while each message processes fine |
| **Log compaction** | Create a topic with `cleanup.policy=compact`, write the same key repeatedly | Only the latest value survives — a *table*, not a stream |
| **Consumer lag** | `kafka-consumer-groups.sh --describe --group billing` | Per-partition lag |
| **A poison message** | Produce invalid JSON | Without a DLQ, the partition stops permanently |
| **Replay** | `--reset-offsets --to-earliest` | The whole point of a log |

```bash
docker compose down -v
```
