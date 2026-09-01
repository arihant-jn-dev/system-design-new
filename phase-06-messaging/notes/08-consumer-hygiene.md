# 06·08 · Consumer Hygiene — Retries, DLQs & Backpressure

> **Why this exists:** gate Q3 asks you to design a notification system **with retries, DLQ and dedupe, end
> to end**. And the roadmap's sharpest line in this phase: **"the DLQ needs an owner and an alarm, or it's a
> silent data-loss bucket."**

---

## Reference

### The failure taxonomy — retry the right things

**Not all failures are the same, and treating them identically is the bug:**

| Failure | Example | Action |
|---|---|---|
| **Transient** | Downstream 503, timeout, connection reset | ⭐ **Retry with backoff** |
| **Rate-limited** | 429 | Retry, **respecting `Retry-After`** |
| **Poison message** | Malformed JSON, missing field, schema violation | ⚠️ **Never retry — it will fail identically forever.** Straight to DLQ. |
| **Business rejection** | "Account closed", "insufficient funds" | Not an error. Handle it; don't retry. |
| **Bug in the consumer** | NullPointerException | **DLQ**, fix, replay |

> ⭐ **A poison message retried forever is a self-inflicted outage:** the consumer never advances past that
> offset, **the partition stops**, lag grows without bound, and everything behind it starves. **This is the
> single most common Kafka consumer incident.** One bad message blocks a partition permanently.

### Retry strategies — and why in-line retry is dangerous

| Strategy | How | Problem |
|---|---|---|
| **In-line retry** | Retry inside the handler | ⭐ **Blocks the partition** while you sleep. Head-of-line blocking. |
| ⭐ **Retry topics** | Publish to `orders.retry.5s` → `retry.1m` → `retry.10m`, each with a consumer that waits then reprocesses | **Doesn't block the main partition.** The standard pattern. |
| **Delay queue** | SQS `DelaySeconds`, RabbitMQ TTL + DLX | Broker-native |
| **Re-publish to the tail** | Send back to the same topic | ⚠️ **Loses ordering**, can loop forever |

**The retry-topic ladder — the answer to give:**

```
main topic ──fail──▶ retry-5s ──fail──▶ retry-1m ──fail──▶ retry-10m ──fail──▶ DLQ
                                                                     (max attempts)
```
**Each retry topic has its own consumer that waits the delay, then reprocesses.** The main partition keeps
moving. Attempt count travels in a header.

**Always: exponential backoff + jitter**
([Phase 1 note 11](../../phase-01-networking/notes/11-timeouts-retries-backoff.md)). Without jitter, N failed
messages retry in lockstep and hammer the already-struggling downstream.

### ⭐ The DLQ — and the rule that matters

**A dead-letter queue holds messages that could not be processed after all retries.**

> ⭐ **The roadmap's line, and it's the one to remember: a DLQ needs an OWNER and an ALARM, or it's a silent
> data-loss bucket.**
>
> A DLQ nobody watches is worse than no DLQ, because it *looks* like error handling. Messages go in, nobody
> looks, and six months later you discover 40,000 unprocessed orders. **The queue did its job; the process
> around it didn't exist.**

**What a real DLQ setup requires:**

| Requirement | |
|---|---|
| ⭐ **An alarm on depth > 0** | Not > 1000. **Any** message in the DLQ is an incident. |
| ⭐ **A named owner** | A team, in a runbook |
| **Original context preserved** | Original topic/partition/offset, the error, the stack trace, attempt count, timestamps |
| **A replay mechanism** | ⭐ **Getting messages *out* is the part people forget.** Build it before you need it. |
| Retention long enough to fix the bug | Days, not hours |
| Dashboards | Rate in, age of oldest, breakdown by error type |

**The replay flow:** fix the bug → deploy → replay the DLQ into the main topic → **verify** the count drains
to zero. ⚠️ **Replayed messages are duplicates from the consumer's perspective** — this is exactly why your
dedupe window must cover *operator-triggered replay*, not just automatic retries
([07](07-delivery-semantics.md)).

### Consumer lag — the metric that matters

```
lag = log-end-offset − consumer-committed-offset      (per partition)
```

| Signal | Meaning |
|---|---|
| **Lag near zero** | Healthy |
| **Lag steady but non-zero** | Keeping up, just behind. Fine. |
| ⭐ **Lag GROWING** | **Consumers can't keep up. It will never self-correct.** |
| **Lag growing on ONE partition** | ⭐ A hot key, or a stuck/poisoned consumer |

⭐ **Alert on the *derivative*, not the value.** A lag of 100,000 that's shrinking is recovery; a lag of 5,000
that's growing is an outage in progress. And **time-based lag** ("we're 4 minutes behind") is far more
meaningful to humans than a message count.

**When lag grows, your options:**
1. **Add consumers** — ⚠️ only up to the partition count ([03](03-kafka-fundamentals.md)). You measured the ceiling.
2. **Make processing faster** — batch DB writes, parallelise within a partition
3. **Add partitions** — helps future data; ⚠️ breaks per-key ordering for existing keys
4. **Shed load** — drop low-priority messages
5. **Accept the delay** — the queue is a *buffer*; that's its job

### ⭐ Backpressure and unbounded queue growth

**This is the honest part the roadmap calls out.**

A queue absorbs a *temporary* mismatch between producer and consumer rates. **If the mismatch is sustained,
the queue grows without bound** — and Kafka will happily let it, until retention or disk stops you.

> ⭐ **A growing queue is not "handling load." It's deferring a failure and making it worse.** By Little's
> Law ([Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md)), latency = depth ÷
> throughput: a 10 M-message backlog draining at 1,000/s is **~3 hours** behind. Every message you process is
> answering a question nobody is waiting for.

**What Kafka's model changes:** consumers **pull**, so a slow consumer doesn't crash — it just falls behind.
That's much better than a push system collapsing, but **it converts an availability problem into a
freshness problem**, which is easier to miss.

| Response | |
|---|---|
| ⭐ **Alert on lag growth** | The earliest honest signal |
| **Bound retention deliberately** | Decide what happens when the buffer is full — Kafka drops the *oldest* |
| **Load shed at the producer** | Reject/sample low-value events rather than enqueue them |
| **Prioritised topics** | Separate topics per priority; starve the low one under pressure |
| **Autoscale consumers on lag** | KEDA ([Phase 2 note 09](../../phase-02-stateless-scaling/notes/09-autoscaling.md)) — ⚠️ capped by partition count |

### Poison-message defence checklist

- [ ] **Validate on consume**; malformed → DLQ immediately, never retry
- [ ] **Cap attempts** (3–5), with the count in a header
- [ ] ⭐ **Never block the partition** — use retry topics, not in-line sleeps
- [ ] **Schema validation at produce time** ([11](11-event-driven-design.md)) — the best defence is not
      publishing bad messages
- [ ] Log the offset, so you can inspect the exact record
- [ ] Add a circuit breaker: if *everything* is failing, the downstream is down — stop and back off rather
      than DLQ-ing the entire topic

**That last one matters:** if a downstream service is down, naive per-message retry logic will exhaust
attempts on *every* message and dump the whole stream into the DLQ. **Distinguish "this message is bad" from
"everything is failing"** — a circuit breaker (Phase 7) handles the second.

### ⭐ Gate Q3 — notification system, end to end

```
                        ┌─── dedupe (event_id) ──┐
producer ──▶ notifications topic ──▶ consumer group
   (outbox)         key=user_id             │
                                            ├─ transient fail ──▶ retry-1m ──▶ retry-10m ──▶ DLQ
                                            │                                       │
                                            ├─ poison ─────────────────────────────▶ DLQ (no retry)
                                            │                                       │
                                            └─ success ──▶ provider (APNs/FCM/SES)  └─▶ ALARM + owner
                                                              │
                                                        provider failover
```

**Say these, in this order:**

1. **Produce via the outbox** so the notification event can't be lost ([09](09-outbox-and-cdc.md))
2. **Key by `user_id`** — per-user ordering, and it spreads load
3. ⭐ **Dedupe on `event_id`** in the same transaction as the send record — delivery is at-least-once
4. **Retry topics with backoff + jitter** for transient failures; **never in-line**, or you block the partition
5. **Poison messages go straight to the DLQ** — no retries
6. ⭐ **DLQ has an alarm on depth > 0, a named owner, and a tested replay path**
7. ⭐ **Dedupe immediately before the irreversible send** — you cannot un-send an email
8. **Provider failover** (APNs → fallback), **user preferences and quiet hours** checked at send time
9. **Monitor consumer lag** and alert on its growth
10. Bonus: **priority lanes** (OTP separate from marketing), **batching/digest**, **per-user rate limiting**

**Point 7 is the one most people miss** and it's specific to notifications: unlike a database write, a sent
email cannot be compensated.

---

## In your own words

**Why is a poison message worse than a transient failure? What exactly happens to the partition?**

>

**Why is in-line retry dangerous? Draw the retry-topic ladder.**

>

**State the DLQ rule. Why is an unwatched DLQ worse than none?**

>

**Why alert on lag growth rather than lag value? What does one lagging partition suggest?**

>

**Why is a growing queue "deferring a failure"? Use Little's Law.**

>

**How do you distinguish "this message is bad" from "everything is failing"? Why does it matter?**

>

**Walk gate Q3 out loud, all ten points, in order.**

>

---

## Links

- Delivery semantics and dedupe → [07-delivery-semantics.md](07-delivery-semantics.md)
- Backoff + jitter → [Phase 1 note 11](../../phase-01-networking/notes/11-timeouts-retries-backoff.md)
- Backpressure as a systems concept → [Phase 4 note 11](../../phase-04-distributed-systems/notes/11-backpressure-and-flow-control.md)
- Outbox → [09-outbox-and-cdc.md](09-outbox-and-cdc.md)
- Circuit breakers, load shedding → **Phase 7**
- Notification systems in depth → **Phase 9**
