# 06·09 · The Dual-Write Problem & the Outbox Pattern

> **Why this exists:** gate Q1 — *"explain the dual-write problem and solve it with the outbox pattern on a
> whiteboard."* You met this in [3e-04](../../phase-03-databases/notes/3e-04-outbox-and-cdc.md); this note is
> the Kafka-side detail and the whiteboard performance.

---

## Reference

### The problem

```js
await db.insert(order);                    // ✅ committed
await kafka.send('OrderCreated', order);   // ❌ fails, or the process dies here
```

**The order exists. No event was published.** The search index, the email service, analytics and the
recommendation engine never learn about it. **Silent, permanent divergence** — and nothing errors.

**Reversing the order is worse:**
```js
await kafka.send('OrderCreated', order);   // ✅ the event is out there
await db.insert(order);                    // ❌ fails
```
Now you've published an event about an order that doesn't exist. **Downstream acts on a lie** — sends a
confirmation email for an order nobody can find.

**And you cannot wrap them in a transaction.** Postgres and Kafka share no commit point
([3e-01](../../phase-03-databases/notes/3e-01-why-distributed-transactions-are-hard.md)).

> ⭐ **Every "save X and publish an event about X" is this problem.** It is everywhere, and it's usually
> unnoticed until someone asks why the search index is missing 0.3% of orders.

### The outbox pattern

**Write the event into the same database, in the same transaction, then relay it separately.**

```sql
BEGIN;
  INSERT INTO orders (id, user_id, total) VALUES (...);

  INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload)
  VALUES (gen_random_uuid(), 'order', :order_id, 'OrderCreated', :json);
COMMIT;          -- ⭐ ONE local transaction. Both, or neither.
```

```
┌────────────────────────────────┐
│  Postgres                      │
│   orders  ─┐                   │
│            ├── ONE TRANSACTION │
│   outbox  ─┘                   │
└────────────┬───────────────────┘
             │  relay (poll, or CDC)
             ▼
          Kafka ──▶ consumers
```

> ⭐ **The reframing — say this out loud, it's the insight:** you have converted a **distributed-transaction
> problem** into a **local-transaction problem plus an at-least-once delivery problem** — and at-least-once
> delivery is *solved* (idempotent consumers, [07](07-delivery-semantics.md)).

### The relay — two ways

| | **Polling publisher** | ⭐ **CDC / log tailing** |
|---|---|---|
| How | `SELECT ... WHERE sent_at IS NULL` on a loop | **Debezium tails the WAL**; outbox inserts appear as change events |
| Latency | Poll interval (100 ms–1 s) | Near real-time |
| DB load | Constant polling, index churn | ⭐ **None** — reads the replication log, not the table |
| Ordering | Needs care | **WAL order is a total order** |
| Complexity | Trivial | Kafka Connect + Debezium |
| Use | Start here | Production at volume |

**The polling relay, done properly:**
```sql
SELECT * FROM outbox
 WHERE sent_at IS NULL
 ORDER BY id
 LIMIT 100
 FOR UPDATE SKIP LOCKED;     -- ⭐ many relay workers, zero contention
```
**`SKIP LOCKED` is what makes it horizontally scalable** ([3b-04](../../phase-03-databases/notes/3b-04-locking-and-deadlocks.md)).

**The CDC relay** is where [3c-03](../../phase-03-databases/notes/3c-03-replication-methods.md) pays off:
logical replication decodes the WAL into row-level changes, so an `INSERT` into `outbox` **becomes a Kafka
message with no polling at all.** Debezium's *outbox event router* even unwraps the payload into a proper
topic with the aggregate ID as the key.

### The details that matter

| Detail | Why |
|---|---|
| ⭐ **Delivery is at-least-once, never exactly-once** | The relay can publish then crash before marking sent → **consumers must dedupe** |
| **Stable event ID** in the payload | So consumers *can* dedupe |
| ⭐ **Partition key = aggregate ID** | All events for one order land in one partition → **per-aggregate ordering preserved** ([03](03-kafka-fundamentals.md)) |
| **Clean up the outbox** | Delete/archive sent rows, or partition by day and drop partitions |
| **Monitor relay lag** | `now() - created_at` for the oldest unsent row. **A stalled relay is silent.** |
| Schema the payload | It's a public contract → [11](11-event-driven-design.md) |

### The inbox pattern — the other side

Record the processed message ID **in the same transaction as its effect**:

```sql
BEGIN;
  INSERT INTO processed_messages (message_id) VALUES (:id);  -- UNIQUE → 23505 on a duplicate
  UPDATE inventory SET count = count - 1 WHERE sku = :sku;
COMMIT;
```

**A duplicate delivery hits the unique constraint and the whole transaction aborts — harmlessly.**
Idempotent consumption using nothing but a `UNIQUE` index
([3b-05](../../phase-03-databases/notes/3b-05-idempotency-at-the-db-layer.md)).

⭐ **Outbox + inbox = effectively-once end to end, using only local transactions.** No 2PC, no distributed
coordination. **That's the whole architecture in one line**, and you built both halves in the lab.

### ⭐ The whiteboard performance (gate Q1)

Draw it in this order and narrate:

```
1.  [service] --insert order--> [DB]
             --publish event--> [Kafka]        "two writes, no shared commit"

2.  X the second arrow.  "process dies here. Order exists, event never sent.
                          Search index is now permanently wrong, and nothing errored."

3.  Redraw:  [service] --BEGIN; insert order; insert outbox; COMMIT--> [DB]
             "one transaction, one database. Atomic by construction."

4.  [DB] --relay (CDC/poll)--> [Kafka] --> [consumers]

5.  "Delivery is at-least-once -- the relay can publish and crash before
     marking the row sent. So consumers dedupe on the event ID."

6.  "Key by aggregate ID so one order's events stay ordered."
```

**Six beats. Under two minutes.** Then the closing line:

> *"The reframing is what makes it work: I traded a distributed transaction — which I can't have — for a
> local transaction plus at-least-once delivery, which is a solved problem."*

### Where else this applies

Not just Kafka:

- DB write + **cache invalidation** → outbox the invalidation ([Phase 5 note 03](../../phase-05-caching/notes/03-invalidation.md))
- DB write + **search index** update → CDC into Elasticsearch
- DB write + **third-party API** call → outbox the call, relay retries it
- DB write + **email/SMS** → outbox the notification
- Sharded writes needing a single event stream → outbox per shard

### The alternative: event-first (event sourcing)

If the **event log is the source of truth**, there's no dual write — you append the event and derive state
from it. That's event sourcing ([11](11-event-driven-design.md)), and it removes this problem entirely at
the cost of a much larger architectural commitment. **Worth naming as the alternative; rarely worth doing
just to avoid an outbox table.**

---

## In your own words

**State the dual-write problem, and show why reversing the order doesn't fix it.**

>

**What exactly makes the outbox atomic?**

>

**State the reframing: what problem did you convert it into, and why is that better?**

>

**Polling vs CDC relay — give the trade, and the SQL that makes polling scalable.**

>

**Why is outbox delivery at-least-once? What must consumers do?**

>

**Why key by aggregate ID?**

>

**Perform the whiteboard walkthrough, timed. Under two minutes.**

>

---

## Links

- The Phase 3 version → [3e-04](../../phase-03-databases/notes/3e-04-outbox-and-cdc.md)
- CDC mechanism → [3c-03](../../phase-03-databases/notes/3c-03-replication-methods.md)
- `SKIP LOCKED` → [3b-04](../../phase-03-databases/notes/3b-04-locking-and-deadlocks.md)
- Unique constraints as dedupe → [3b-05](../../phase-03-databases/notes/3b-05-idempotency-at-the-db-layer.md)
- Delivery semantics → [07-delivery-semantics.md](07-delivery-semantics.md)
- ⭐ **You built outbox + inbox** → [`../lab/`](../lab/) Part C
