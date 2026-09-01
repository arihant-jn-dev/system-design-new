# 06·01 · Why Async At All

> **Why this exists:** rule 2 of the roadmap — *"never learn a topic without a 'why does this exist'
> answer."* Async messaging is a **response to specific failures of synchronous calls**, and it introduces a
> specific, expensive set of new problems. Knowing both halves is what lets you say "actually, a cron job is
> fine here."

---

## Reference

### What synchronous calls cost you

```
checkout ──▶ payment ──▶ inventory ──▶ email ──▶ analytics ──▶ recommendations
```

| Problem | |
|---|---|
| ⭐ **Availability multiplies** | 6 services at 99.9% = **99.4%** ([Phase 0 note 05](../../phase-00-foundations/notes/05-availability-vs-durability.md)). The email service being down fails your checkout. |
| ⭐ **Latency adds** | The user waits for all of it, including analytics they don't care about |
| **Tail latency amplifies** | ([Phase 0 note 04](../../phase-00-foundations/notes/04-percentiles-and-tail-latency.md)) |
| **No load absorption** | A traffic spike hits every downstream simultaneously |
| **Tight coupling** | Adding a consumer means changing the caller |
| **Retry storms** | Each layer retrying multiplies ([Phase 1 note 11](../../phase-01-networking/notes/11-timeouts-retries-backoff.md)) |

### The five benefits of async

| Benefit | What it buys |
|---|---|
| ⭐ **Decoupling** | The producer doesn't know who consumes. **Add a consumer with zero changes to the producer** — the single biggest architectural win. |
| ⭐ **Load levelling / buffering** | The queue absorbs spikes. A 10× burst becomes a longer queue, not a crash. |
| **Failure isolation** | The email service being down delays emails; it doesn't fail checkout |
| **Retry isolation** | Retries happen in the consumer, not on the user's request |
| **Fan-out** | One event, many independent consumers |

**And a sixth that's underrated: replay.** With a log ([02](02-queue-pubsub-log.md)) you can reprocess
history — fix a bug and re-derive, add a new consumer and backfill it from the beginning.

### ⭐ The costs — say these too

**This is the half that separates a considered answer from buzzword soup:**

| Cost | |
|---|---|
| ⭐ **Eventual consistency** | The write returns before the work is done. **The UI must handle "processing…"** — that's a product change, not just a technical one. |
| **Ordering is no longer free** | Per-partition only ([03](03-kafka-fundamentals.md)) |
| ⭐ **Debugging is much harder** | No stack trace across the boundary. You need correlation IDs and distributed tracing or you are blind. |
| **Duplicates** | At-least-once means idempotency everywhere ([07](07-delivery-semantics.md)) |
| **Operational surface** | A broker to run, monitor, upgrade, secure, be paged for |
| **Error handling is inverted** | You can't return an error to the caller — they've gone. DLQs, retries, alerts ([08](08-consumer-hygiene.md)). |
| **Unbounded queue growth** | The buffer can become the problem |
| **Testing** | Integration tests need a broker; timing bugs are non-deterministic |

> ⭐ **The honest framing:** *"Async buys decoupling, spike absorption and failure isolation, and it costs
> eventual consistency, harder debugging, and a whole new class of error handling. For an email that can
> take 30 seconds, that's an obvious trade. For a payment authorisation the user is waiting on, it isn't."*

### ⭐ When NOT to go async

**Being willing to say this is a strong signal — reflexive Kafka is a junior tell:**

| Situation | Do this instead |
|---|---|
| **The user needs the result now** | Synchronous. Don't make them poll for something you could return. |
| **You need a transaction across the work** | Keep it in one database ([3e-01](../../phase-03-databases/notes/3e-01-why-distributed-transactions-are-hard.md)) |
| **Low volume, simple schedule** | ⭐ **A cron job.** "Kafka in a design that needs a cron job" is explicitly on the roadmap's list of failure patterns. |
| **Two services always in the same transaction** | They're probably one service (Phase 8) |
| **You have one consumer and always will** | A direct call or a simple job table is less machinery |
| **The team has no broker experience** | The operational cost is real |

**And the middle grounds worth naming:** a **database-backed job table** with `SELECT ... FOR UPDATE SKIP
LOCKED` ([3b-04](../../phase-03-databases/notes/3b-04-locking-and-deadlocks.md)) gives you queueing with **no
new infrastructure** and transactional enqueue for free — for many systems it's the right answer for years.
Managed **SQS** removes the ops burden if you just need a queue.

### The decision

```
Does the caller need the result to respond?          -> SYNCHRONOUS
Is it one consumer, low volume, on a schedule?       -> CRON or a job table
Is it one consumer, needs durability + retries?      -> a QUEUE (SQS, or a DB table)
Many independent consumers of the same event?        -> PUB/SUB or a LOG
Need replay, history, or ordering guarantees?        -> a LOG (Kafka)
```

### What to make async — the pattern

**Split the request into "what must happen now" and "what can happen shortly."**

```
POST /orders
  SYNCHRONOUS (the user waits):
    · validate
    · reserve inventory        ← correctness-critical
    · charge the card          ← the user must know if this failed
    · write the order          ← + outbox row, one transaction
    · return 201
  ASYNC (from the outbox):
    · confirmation email
    · search index update
    · analytics
    · recommendation refresh
    · warehouse notification
```

> ⭐ **The rule: anything that could fail without the user needing to know goes async.** And the transition
> point is the **outbox** ([09](09-outbox-and-cdc.md)) — that's what makes "return 201 now, do the rest
> later" safe rather than lossy.

---

## In your own words

**Six services at 99.9% each, called synchronously. What's the availability, and what does that argue?**

>

**Name the five benefits of async, plus the underrated sixth.**

>

**Name five costs. Which is a product change rather than a technical one?**

>

**Give three situations where async is the wrong answer.**

>

**What are the two middle grounds between "synchronous call" and "Kafka"?**

>

**Take a request flow you know. Split it into sync and async, and say what makes the split safe.**

>

---

## Links

- The three primitives → [02-queue-pubsub-log.md](02-queue-pubsub-log.md)
- Availability multiplies → [Phase 0 note 05](../../phase-00-foundations/notes/05-availability-vs-durability.md)
- Job tables with `SKIP LOCKED` → [3b-04](../../phase-03-databases/notes/3b-04-locking-and-deadlocks.md)
- Outbox as the sync/async boundary → [09-outbox-and-cdc.md](09-outbox-and-cdc.md)
- Sync vs async as a **coupling** decision → Phase 8
