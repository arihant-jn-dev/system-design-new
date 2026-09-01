# 06·07 · Delivery Semantics

> **Why this exists:** you **measured** this. In the lab a consumer crash before an offset commit charged
> 5 payments twice — billing the customer 1500 instead of 1000 — and an idempotent consumer absorbed the
> identical redelivery. This note is the framework around that.

---

## Reference

### The three semantics

| Semantic | Guarantee | How | Risk |
|---|---|---|---|
| **At-most-once** | Never duplicated; **may be lost** | **Commit offset THEN process** | ❌ **Data loss** |
| **At-least-once** | Never lost; **may be duplicated** | **Process THEN commit offset** | ⚠️ Duplicates |
| **Exactly-once** | Neither | ⚠️ **Impossible as a delivery guarantee** | — |

> ⭐ **The order of two operations is the entire choice.** You saw it in the lab:
> - `commit offset` → crash → `process` never happens = **message lost**
> - `process` → crash → `commit offset` never happens = **message redelivered**
>
> **At-least-once is almost always right, because duplicates are fixable and loss isn't.**

⚠️ **And the default betrays you:** Kafka's `enable.auto.commit=true` commits periodically in the background
— including offsets for messages you *haven't finished processing*. **That's at-most-once by accident**, and
it's the most common silent data-loss bug in Kafka consumers.

### Why exactly-once delivery is impossible

```
Sender sends. No ack arrives.
   Was the MESSAGE lost?  -> don't resend, and it's LOST
   Was the ACK lost?      -> resend, and it's DUPLICATED
The sender cannot distinguish these. Ever.
```

This is the two-generals problem, and it's the same fact as
[Phase 4 note 01](../../phase-04-distributed-systems/notes/01-fallacies-and-failure-models.md): **you cannot
distinguish a slow node from a dead one.**

### ⭐ What actually exists

```
AT-LEAST-ONCE DELIVERY  +  IDEMPOTENT PROCESSING  =  EFFECTIVELY-ONCE
```

**You didn't fix delivery — you made duplicate delivery harmless.** That's the only achievable thing, and in
the lab it was achieved with a `UNIQUE` constraint.

**The inbox pattern, which you built:**
```sql
BEGIN;
  INSERT INTO processed_events (event_id) VALUES ($1);  -- PK → 23505 on a duplicate
  INSERT INTO charges (payment_id, amount) VALUES (...);
COMMIT;   -- ⭐ dedupe record and effect commit ATOMICALLY
```
**A duplicate hits the primary key, the whole transaction aborts, and nothing happens twice.**

**Other idempotency mechanisms** ([3b-05](../../phase-03-databases/notes/3b-05-idempotency-at-the-db-layer.md)):
unique constraint on the natural key · conditional update (`WHERE status='pending'`) · absolute not relative
(`SET balance = 400`, never `balance - 100`) · upsert.

### Kafka's "exactly-once semantics" — be precise

**Three separate features, frequently overclaimed:**

| Feature | What it actually does |
|---|---|
| **Idempotent producer** (`enable.idempotence=true`) | Producer ID + **per-partition sequence numbers**, so the broker discards duplicates caused by **producer retries**. Scope: one producer session, one partition. **On by default in modern Kafka.** |
| **Transactions** (`transactional.id`) | Atomically write to several partitions **and** commit consumer offsets — so a **read-process-write loop within Kafka** is atomic |
| **`isolation.level=read_committed`** | Consumers don't see records from aborted transactions |

**What it does NOT cover:**
- ❌ Side effects **outside** Kafka — a database write, an HTTP call, an email
- ❌ Your consumer crashing after a DB write but before the offset commit — **exactly the lab scenario**
- ❌ The producing application dying before it produced

> ⭐ **So Kafka EOS is real, and it is exactly-once *within Kafka*.** The moment your consumer touches
> anything else, you're back to at-least-once plus idempotency. **Saying that precisely is a strong
> signal** — most candidates either dismiss EOS or overclaim it.

**The read-process-write loop it *does* make atomic:**
```
consume from topic A -> transform -> produce to topic B -> commit offsets
                        ⭐ all three in ONE Kafka transaction
```
That's genuinely useful for stream processing (Kafka Streams uses it), and useless for "consume and write to
Postgres."

### The dedupe store — practical details

| Question | Answer |
|---|---|
| **Key on what?** | ⭐ A **producer-assigned event ID**. **Never a payload hash** — two legitimate identical events would collide. |
| **Where?** | ⭐ The **same database as the effect**, so both commit together. Redis only if losing dedupe state is acceptable. |
| **How long?** | ⚠️ Longer than your **worst redelivery window** — retry policy + DLQ replay + *operator-triggered reprocessing*. Hours to days. |
| **Cost?** | ~50–100 bytes/message. 1 M/day × 7 days ≈ under 1 GB. Trivial. |
| **Cleanup?** | TTL, or partition by day and drop partitions |

⚠️ **The window matters more than people expect.** Keep keys 24 hours, then an operator replays a week-old
topic to fix a bug — **and every message is processed again.** Size for your worst replay, not your normal
retry.

### Choosing per data type

| Data | Semantic | Why |
|---|---|---|
| **Payments, orders, inventory** | At-least-once + **strict idempotency** | Loss unacceptable; duplicates catastrophic |
| **Ad impressions/clicks (billing)** | At-least-once + idempotency | Double-counting is revenue fraud |
| Metrics, logs, clickstream | At-least-once, dedupe optional | A slightly inflated count is fine |
| Live video frames, telemetry | **At-most-once** | Late data is worthless; loss is fine |
| Cache invalidation | At-least-once | Naturally idempotent |
| **Emails, SMS, push** | At-least-once + dedupe **before sending** | ⚠️ **You cannot un-send an email** |

---

## In your own words

**Give the three semantics and the single implementation choice that decides between the first two.**

>

**Why is `enable.auto.commit=true` dangerous? What semantic does it silently give you?**

>

**Explain in three lines why exactly-once delivery is impossible.**

>

**Write the equation, and describe the inbox pattern that implements it.**

>

**What does Kafka's EOS actually cover? What does it not? Be precise.**

>

**Why key the dedupe store on a producer-assigned ID rather than a payload hash?**

>

**Cite your own lab numbers for the duplicate-charge scenario.**

>

---

## Links

- ⭐ **You measured this** → [`../lab/`](../lab/) Part B
- Idempotency at the DB layer → [3b-05](../../phase-03-databases/notes/3b-05-idempotency-at-the-db-layer.md)
- The Phase 3 treatment → [3e-06](../../phase-03-databases/notes/3e-06-exactly-once.md)
- Can't tell slow from dead → [Phase 4 note 01](../../phase-04-distributed-systems/notes/01-fallacies-and-failure-models.md)
- Outbox + inbox together → [09-outbox-and-cdc.md](09-outbox-and-cdc.md)
- Consumer offsets → [05-kafka-consumers.md](05-kafka-consumers.md)
