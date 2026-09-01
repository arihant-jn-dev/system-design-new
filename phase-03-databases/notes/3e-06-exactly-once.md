# 3E·06 · "Exactly Once" — and What Actually Exists

> **Why this exists:** the Phase 3 gate asks you to *"explain why 'exactly-once delivery' is a marketing
> term."* It's a great question because the correct answer is short, definite, and demonstrates you
> understand the fundamental constraint rather than a vendor's feature list.

---

## Reference

### The three delivery semantics

| Semantic | Guarantee | Implementation | Risk |
|---|---|---|---|
| **At-most-once** | Never duplicated; **may be lost** | Send and forget; ack before processing | **Data loss** |
| **At-least-once** | Never lost; **may be duplicated** | Retry until acked; ack after processing | **Duplicates** |
| **Exactly-once** | Neither lost nor duplicated | ⚠️ **Impossible as a *delivery* guarantee** | — |

### Why exactly-once delivery is impossible

**The two-generals argument, in three lines:**

```
Sender sends a message. No ack arrives.
  Was the message lost?   -> if I don't resend, it's LOST         (at-most-once)
  Was the ACK lost?       -> if I resend, it's DUPLICATED         (at-least-once)

The sender CANNOT DISTINGUISH THESE CASES. Ever.
```

**So it must choose: risk losing, or risk duplicating.** There is no third behaviour. No amount of
acknowledgements fixes it — the *last* message in any protocol can always be the one that's lost, and
whoever sent it can't know.

This is the same fact as [Phase 0 note 06](../../phase-00-foundations/notes/06-reliability-fault-tolerance-resilience.md):
**you cannot distinguish a slow node from a dead one**, and the network can lose anything.

> **The gate answer:** *"Exactly-once **delivery** is impossible, because when a sender doesn't get an ack it
> can't tell whether the message was lost or the ack was lost — so it must either not resend and risk loss,
> or resend and risk duplication. What systems actually give you is **at-least-once delivery plus idempotent
> processing**, which produces exactly-once *effects*. Kafka's 'exactly-once semantics' is that: idempotent
> producers with sequence numbers, and transactional read-process-write within Kafka. It doesn't extend to
> side effects outside Kafka — if your consumer charges a card, that's on you to make idempotent."*

### What actually exists: exactly-once **effects**

```
AT-LEAST-ONCE DELIVERY  +  IDEMPOTENT PROCESSING  =  EFFECTIVELY-ONCE
```

**The message may arrive five times. The *effect* happens once.** You move the problem from the transport
(where it's unsolvable) to the processing (where a unique constraint solves it).

**How to make processing idempotent** — all of this is [3b-05](3b-05-idempotency-at-the-db-layer.md):

| Technique | Example |
|---|---|
| ⭐ **Dedupe store on a message ID** | `INSERT INTO processed(msg_id)` with a `UNIQUE` — `23505` means "already done" |
| ⭐ **Inbox pattern** | Dedupe row + effect **in the same transaction** ([3e-04](3e-04-outbox-and-cdc.md)) |
| **Natural business key** | `UNIQUE(order_id)` on payments |
| **Conditional update** | `UPDATE ... WHERE status = 'pending'` — a replay affects 0 rows |
| **Absolute not relative** | `SET balance = 400`, never `balance = balance - 100` |
| **Upsert** | `ON CONFLICT DO UPDATE` |

### Kafka's "exactly-once semantics" — what it really is

Worth being precise about, because it's frequently overclaimed:

| Feature | What it actually does |
|---|---|
| **Idempotent producer** | Producer ID + per-partition **sequence numbers**, so the broker discards duplicates from producer retries. **Scope: one producer session, one partition.** |
| **Transactions** | Atomically write to several partitions **and** commit consumer offsets — so a **read-process-write loop within Kafka** is atomic |
| **`read_committed` consumers** | Don't see records from aborted transactions |

**What it does NOT cover:**
- ❌ Side effects **outside** Kafka — a database write, an HTTP call, an email
- ❌ Consumers that aren't part of the transactional read-process-write loop
- ❌ The producer's own application crashing before it produced

> **So Kafka EOS is real and useful, and it is exactly-once *within Kafka*.** The moment your consumer
> touches anything else, you're back to at-least-once + idempotency. Saying this precisely is a strong
> signal. → Phase 6.

### The dedupe store — the practical details

| Question | Answer |
|---|---|
| **Key on what?** | A **producer-assigned** message/event ID. Never a hash of the payload (two legitimate identical events would collide). |
| **Where?** | The same database as the effect, so both commit together. Redis only if you can tolerate losing the dedupe state. |
| **How long?** | Longer than your **maximum possible redelivery window**: retry policy + DLQ replay + operator-triggered reprocessing. Hours to days. |
| **Cost?** | ~50–100 bytes per message. At 1 M msg/day with 7-day retention that's under 1 GB. **Cheap.** |
| **Cleanup?** | TTL, or partition by day and drop partitions ([3d-02](3d-02-partitioning-strategies.md)) |

⚠️ **The window matters more than people expect.** If you keep dedupe keys for 24 hours but an operator
replays a week-old topic to fix a bug, **every one of those messages is processed again.** Size the window
for your *worst* replay scenario, not your normal retry.

### Choosing the semantic

| Data | Semantic | Why |
|---|---|---|
| **Payments, orders, inventory** | **At-least-once + strict idempotency** | Loss is unacceptable; duplicates are catastrophic |
| Metrics, logs, clickstream | **At-least-once**, dedupe optional | A slightly-inflated count is fine |
| **Ad impressions/clicks (billing)** | **At-least-once + idempotency** | Double-counting is revenue fraud |
| Live video frames, telemetry samples | **At-most-once** | Late data is worthless; loss is fine ([Phase 1 note 02](../../phase-01-networking/notes/02-tcp-vs-udp.md)) |
| Cache invalidation | At-least-once | Naturally idempotent |
| **Emails, SMS, push** | At-least-once + dedupe | ⚠️ **Duplicates are user-visible and cannot be compensated.** Dedupe before sending. |

**The email row is worth noting:** unlike a database write, you cannot un-send an email. Notification systems
need a dedupe check immediately before the irreversible send. → Phase 9.

---

## In your own words

**Explain in three lines why exactly-once delivery is impossible.**

>

**Write the equation for what actually exists.**

>

**Give four ways to make processing idempotent.**

>

**What does Kafka's EOS actually cover, and what does it not?**

>

**Why key the dedupe store on a producer-assigned ID rather than a payload hash?**

>

**How long should you keep dedupe keys, and what scenario should set that number?**

>

**Give one case where at-most-once is the right choice, and one where duplicates can't be compensated.**

>

---

## Links

- Can't distinguish slow from dead → [Phase 0 note 06](../../phase-00-foundations/notes/06-reliability-fault-tolerance-resilience.md)
- Idempotency, the API contract → [Phase 1 note 09](../../phase-01-networking/notes/09-idempotency.md)
- Idempotency, the DB mechanism → [3b-05](3b-05-idempotency-at-the-db-layer.md)
- Outbox & inbox → [3e-04-outbox-and-cdc.md](3e-04-outbox-and-cdc.md)
- **Kafka delivery semantics, DLQs, replay** → **Phase 6**
- Notification dedupe → Phase 9
