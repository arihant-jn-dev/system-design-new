# Phase 6 — Asynchronous Processing, Messaging & Streaming

**Weeks 9–10 · ~16 hrs**

---

## Why this phase exists

The roadmap: *"The backbone of every non-trivial design. **Second only to databases in interview weight.**"*

Phases 0–5 built synchronous systems. This phase is about what happens when you stop waiting — which buys
decoupling, spike absorption and failure isolation, and costs eventual consistency, duplicate delivery, and
an entirely new class of error handling.

**The three ideas that carry the most weight:**
1. ⭐ **The outbox pattern** — the answer to the dual-write problem, and reusable in almost every design
2. ⭐ **At-least-once + idempotency = effectively-once** — because exactly-once delivery doesn't exist
3. ⭐ **Partitions are both ordering and parallelism** — the tension behind everything surprising about Kafka

You demonstrate all three in the lab rather than reading about them.

---

## How to work this phase

**Week 9 — fundamentals and Kafka**

| Step | Do this | Time |
|---|---|---|
| 1 | Read [`notes/`](notes/) 01 → 08. Reference half, once. | ~2 hrs |
| 2 | Fill in the "In your own words" halves. | ~2.5 hrs |
| 3 | [`lab/`](lab/) **Part A** — partitions, consumer groups, the parallelism ceiling | ~1 hr |
| 4 | [`lab/`](lab/) **Part B** — produce duplicates, then absorb them | ~1.5 hrs |

**Week 10 — patterns and streaming**

| Step | Do this | Time |
|---|---|---|
| 5 | Read 09 → 14 and fill in. | ~3 hrs |
| 6 | [`lab/`](lab/) **Part C** — the outbox | ~1 hr |
| 7 | ⭐ **Whiteboard the outbox from memory.** Six beats, under two minutes. Twice. | ~30 min |
| 8 | [`GATE.md`](GATE.md) out loud. | ~1.5 hrs |

**Read DDIA chapters 10–12 alongside this.**

---

## Topics

| # | Note | The one thing it's for |
|---|---|---|
| 01 | [Why async](notes/01-why-async.md) | The benefits **and the costs** · when a cron job is the right answer |
| 02 | [Queue vs pub/sub vs log](notes/02-queue-pubsub-log.md) | Per-message vs per-consumer state — the framing that explains everything |
| 03 | [Kafka fundamentals](notes/03-kafka-fundamentals.md) | ⭐ **Gate Q2** — why global ordering is impossible |
| 04 | [Producers](notes/04-kafka-producers.md) | `acks` · the `min.insync.replicas` gotcha · idempotent producer · `linger.ms` |
| 05 | [Consumers & rebalancing](notes/05-kafka-consumers.md) | The parallelism ceiling · the rebalance-loop bug |
| 06 | [Replication & retention](notes/06-kafka-replication-and-retention.md) | ISR · unclean leader election as a CAP flag · **log compaction** |
| 07 | [Delivery semantics](notes/07-delivery-semantics.md) | At-least-once + idempotency · what Kafka EOS really covers |
| 08 | [Consumer hygiene](notes/08-consumer-hygiene.md) | ⭐ **Gate Q3** — retries, DLQs, poison messages, lag |
| 09 | [Outbox & CDC](notes/09-outbox-and-cdc.md) | ⭐ **Gate Q1** — the whiteboard performance |
| 10 | [Broker comparison](notes/10-broker-comparison.md) | Kafka vs RabbitMQ vs SQS · **and a DB table** |
| 11 | [Event-driven design](notes/11-event-driven-design.md) | Notification vs ECST vs event sourcing · schema evolution |
| 12 | [Fan-out patterns](notes/12-fanout-patterns.md) | ⭐ **The news-feed question, solved in advance** |
| 13 | [Stream processing](notes/13-stream-processing.md) | ⭐ **Gate Q4** — event time, watermarks, windows, joins |
| 14 | [Scheduled & delayed work](notes/14-scheduled-and-delayed-work.md) | Cron's limits · Kafka has no delay · dead-man's switch |

---

## Lab

[`lab/`](lab/) — Kafka (KRaft, no ZooKeeper) + Postgres.

**Part A — partitions and the parallelism ceiling.** Watch keys determine partitions and therefore ordering,
then scale a consumer group from 1 to 4 and watch **the 4th consumer sit idle** on a 3-partition topic.

**Part B — duplicate delivery.** A consumer crashes after processing but before committing offsets:
**5 payments charged twice, the customer billed 1500 instead of 1000.** Then the identical crash with an
idempotent consumer: **5 duplicates recognised and skipped, every payment charged exactly once.**

**Part C — the outbox.** Dual-write with an unreachable broker loses **4 of 10 events silently**. The outbox
version loses **zero**, with the broker down the entire time.

---

## Definition of done

- [ ] All 14 notes have the "In your own words" half filled in
- [ ] `lab/RESULTS.md` has your own numbers for all three parts
- [ ] You produced duplicate charges, then absorbed them
- [ ] You watched dual-write lose events, then watched the outbox not
- [ ] You can whiteboard the outbox in **under two minutes**, unprompted
- [ ] You can explain event time vs processing time and why watermarks exist
- [ ] You can design hybrid fan-out with the threshold logic
- [ ] [`GATE.md`](GATE.md) passed out loud
