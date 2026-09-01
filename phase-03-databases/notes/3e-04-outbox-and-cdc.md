# 3E·04 · The Outbox Pattern & CDC

> **Why this exists:** the roadmap calls this *"the practical alternative to distributed transactions"* and
> says it's *"enormously reusable in interviews."* Both are true. **It solves the dual-write problem
> exactly**, with no distributed transaction, using nothing but a table and your existing WAL.

---

## Reference

### The dual-write problem

```
BEGIN;
  INSERT INTO orders ...;          ✅
COMMIT;                            ✅

kafka.publish('OrderCreated', ...); ❌ FAILS (or the process dies here)
```

**The order exists. No event was published.** Downstream — search index, email service, analytics, the
recommendation engine — never learns about it. **Silent, permanent inconsistency.**

**Reversing the order doesn't help:**
```
kafka.publish('OrderCreated');     ✅  the event is out there
BEGIN; INSERT INTO orders; COMMIT; ❌  the order doesn't exist
```
Now you've published an event about an order that was never created. Downstream acts on a lie.

**And you cannot wrap them in a transaction** — Kafka and Postgres have no shared commit point
([3e-01](3e-01-why-distributed-transactions-are-hard.md)).

> **Every "save X and publish an event about X" is this problem.** It is astonishingly common and usually
> unnoticed until data diverges.

### The outbox pattern

**Write the event into the *same database*, in the *same transaction*, then relay it separately.**

```sql
BEGIN;
  INSERT INTO orders (id, user_id, total) VALUES (...);

  INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload)
  VALUES (gen_random_uuid(), 'order', :order_id, 'OrderCreated', :json);
COMMIT;          -- ⭐ ONE local transaction. Atomic. Both or neither.
```

Then a separate **relay** reads the outbox and publishes:

```
outbox table ──relay──▶ Kafka ──▶ consumers
             (mark sent / delete)
```

**Why this works:** the business row and the event record are in **one database**, so ordinary ACID
atomicity covers both. You have converted a distributed-transaction problem into a **local-transaction
problem plus an at-least-once delivery problem** — and at-least-once delivery is a solved problem
(idempotent consumers, [3e-06](3e-06-exactly-once.md)).

**That reframing is the insight worth stating out loud.**

### Two ways to run the relay

| | **Polling publisher** | **CDC / log tailing** ⭐ |
|---|---|---|
| How | `SELECT * FROM outbox WHERE sent = false` on a loop | Tail the **WAL** with Debezium; outbox inserts appear as change events |
| Latency | Poll interval (100 ms–1 s) | **Near real-time** |
| DB load | Constant polling; index churn on `sent` | **None** — reads the replication log, not the table |
| Ordering | Needs care | **WAL order is total order** |
| Complexity | Trivial — just code | Needs Debezium/Kafka Connect |
| Good for | Getting started, low volume | **Production, high volume** |

**The polling version, done properly:**
```sql
SELECT * FROM outbox
 WHERE sent_at IS NULL
 ORDER BY id
 LIMIT 100
 FOR UPDATE SKIP LOCKED;      -- ⭐ multiple relay workers, no contention (3b-04)
```

**`SKIP LOCKED` is what makes the polling relay horizontally scalable** — each worker grabs a different batch.

**The CDC version** is where [3c-03](3c-03-replication-methods.md) pays off: logical replication decodes the
WAL into row-level changes, so **an insert into `outbox` becomes a Kafka message with no polling at all.**
Debezium even has an "outbox event router" that unwraps the payload into a proper topic and key.

### The details that matter

| Detail | Why |
|---|---|
| ⭐ **Delivery is at-least-once, never exactly-once** | The relay can publish and crash before marking it sent → **consumers must be idempotent** ([3e-06](3e-06-exactly-once.md)) |
| **Include a stable event ID** | So consumers can dedupe |
| **Partition key = aggregate ID** | Keeps all events for one order in one Kafka partition → **ordering preserved per aggregate** (Phase 6) |
| **Clean up the outbox** | Delete or archive sent rows, or the table grows forever. `DELETE` in batches, or partition by day and drop partitions ([3d-02](3d-02-partitioning-strategies.md)). |
| **The outbox is in the write path** | Adds an insert to every business transaction. Cheap, but not free. |
| **Schema the payload** | It's a public contract. Version it. → schema registry, Phase 6 |
| **Monitor relay lag** | The gap between `created_at` and `sent_at` is your event-delivery lag. **Alert on it** — a stalled relay is silent. |

### The inverse: the inbox pattern

Same idea on the consuming side. Record the processed message ID in the **same transaction** as its effect:

```sql
BEGIN;
  INSERT INTO processed_messages (message_id) VALUES (:id);  -- UNIQUE -> 23505 on a duplicate
  UPDATE inventory SET count = count - 1 WHERE sku = :sku;
COMMIT;
```

**A duplicate delivery hits the unique constraint and the whole transaction aborts — harmlessly.** That's
idempotent consumption implemented with nothing but a `UNIQUE` index
([3b-05](3b-05-idempotency-at-the-db-layer.md)).

**Outbox + inbox together give you effectively-once end to end**, using only local transactions.

### Where else this pattern applies

It generalises well beyond Kafka:

- **DB write + cache invalidation** — outbox the invalidation
- **DB write + search index update** — CDC into Elasticsearch ([3d-04](3d-04-secondary-indexes-when-sharded.md))
- **DB write + third-party API call** — outbox the call, relay retries it
- **DB write + email/SMS** — outbox the notification
- **Sharded writes needing an event stream** — outbox per shard

> **The interview line:** *"For 'save the order and publish an event', I'd use the transactional outbox:
> write the event row in the same transaction as the order, then relay it to Kafka with CDC. That turns a
> distributed transaction into a local one plus at-least-once delivery, and I'd make consumers idempotent on
> the event ID so duplicates are harmless. The alternative — dual writing — silently loses events whenever
> the process dies between the commit and the publish."*
>
> **That's four sentences covering the problem, the mechanism, the reframing and the failure mode of the
> naive approach.** It's one of the highest-return things to have memorised in the whole roadmap.

---

## In your own words

**State the dual-write problem, and show why reversing the order doesn't fix it.**

>

**Explain the outbox pattern. What exactly makes it atomic?**

>

**State the reframing: what problem have you converted it INTO?**

>

**Polling relay vs CDC relay — give the trade, and the SQL that makes polling scalable.**

>

**Why is outbox delivery at-least-once and not exactly-once? What must consumers therefore do?**

>

**Describe the inbox pattern. Which single database feature does it lean on?**

>

**Give three non-Kafka uses of this pattern.**

>

---

## Links

- The dual-write problem → [3e-01](3e-01-why-distributed-transactions-are-hard.md)
- **CDC / logical replication, the mechanism** → [3c-03-replication-methods.md](3c-03-replication-methods.md)
- `SKIP LOCKED` → [3b-04-locking-and-deadlocks.md](3b-04-locking-and-deadlocks.md)
- Unique constraints as dedupe → [3b-05](3b-05-idempotency-at-the-db-layer.md)
- Sagas built on reliable events → [3e-03-sagas.md](3e-03-sagas.md)
- **Kafka, Debezium, schema registry, partitioning for ordering** → **Phase 6**
