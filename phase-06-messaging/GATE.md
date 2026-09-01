# Phase 6 — Gate

> **Rules:** Out loud. From memory. No notes.
> **Q1 is a whiteboard performance — draw it. Target: under two minutes.**

---

## Q1 · Explain the dual-write problem and solve it with the outbox pattern, on a whiteboard

**The six beats:**

- [ ] **1.** Draw `[service] → [DB]` and `[service] → [Kafka]`. *"Two writes, no shared commit point."*
- [ ] **2.** ⭐ **X the second arrow.** *"The process dies here. The order exists, the event was never sent, and **nothing errored**."*
- [ ] **3.** Redraw as `BEGIN; insert order; insert outbox; COMMIT;` — **one transaction, one database**
- [ ] **4.** `[DB] --relay (CDC or poll)--> [Kafka] --> [consumers]`
- [ ] **5.** *"Delivery is at-least-once — the relay can publish then crash before marking sent. So consumers dedupe on the event ID."*
- [ ] **6.** *"Key by aggregate ID so one order's events stay ordered."*

**And the marks that separate a strong answer:**

- [ ] ⭐ **The reframing**: *"I traded a distributed transaction — which I can't have — for a local transaction plus at-least-once delivery, which is a solved problem."*
- [ ] You noted **reversing the order doesn't help** (you'd announce orders that don't exist)
- [ ] **`FOR UPDATE SKIP LOCKED`** for a scalable polling relay, or **CDC/Debezium** as the better option
- [ ] ⭐ **CDC catches write paths you forgot** — migrations, admin scripts, another service
- [ ] **The inbox pattern** on the consumer side → effectively-once end to end
- [ ] You cited **your own lab numbers** (dual write lost 4 of 10; outbox lost 0)
- [ ] Outbox cleanup, and **monitoring relay lag**

**Self-score:** ___ / 13 · **Time: ____**

---

## Q2 · Explain why Kafka can't give you global ordering, and design around that

- [ ] Kafka orders **within a partition**, never across
- [ ] ⭐ **Why it can't**: a global order needs every record through a single sequencer — **that's one partition's throughput.** Total ordering and horizontal scale are mutually exclusive.
- [ ] **The design**: choose a partition key so everything requiring an order shares one — `order_id`, `user_id`, `conversation_id`, `account_id`
- [ ] Different entities interleave, **and you almost never care**
- [ ] ⭐ **Push back on the requirement**: *"'ordered' usually means 'ordered per entity'."* Truly global = 1 partition = one consumer's throughput.
- [ ] ⚠️ **A null key means no ordering guarantee at all** — a silent bug
- [ ] ⭐ **Partition count is effectively permanent**: `hash(key) % N` re-maps keys, breaking per-key ordering for existing data
- [ ] **The parallelism ceiling** — cite your lab result (4th consumer idle on 3 partitions)
- [ ] Bonus: to truly re-partition, replay into a new topic — the same dual-write → backfill → verify → cut-over shape as a shard migration

**Self-score:** ___ / 9

---

## Q3 · Design a notification system with retries, DLQ and dedupe — end to end

- [ ] **Produce via the outbox** so the notification event can't be lost
- [ ] **Key by `user_id`** — per-user ordering and load spreading
- [ ] ⭐ **Dedupe on `event_id`**, in the same transaction as the send record
- [ ] **Retry topics** with backoff **+ jitter** for transient failures
- [ ] ⭐ **Never retry in-line** — it blocks the partition (head-of-line blocking)
- [ ] ⭐ **Poison messages go straight to the DLQ** — never retried, or the partition stops forever
- [ ] ⭐ **The DLQ has an alarm on depth > 0, a named owner, and a tested replay path** — *"otherwise it's a silent data-loss bucket"*
- [ ] ⭐ **Dedupe immediately before the irreversible send** — **you cannot un-send an email**
- [ ] **Provider failover**, user preferences, quiet hours
- [ ] **Monitor consumer lag — alert on its growth, not its value**
- [ ] Bonus: priority lanes (OTP separate from marketing), batching/digest, per-user rate limits
- [ ] Bonus: ⭐ distinguish *"this message is bad"* from *"everything is failing"* — a circuit breaker, or you DLQ the entire stream during a downstream outage

**Self-score:** ___ / 12

---

## Q4 · Explain event time vs processing time, and why watermarks exist

- [ ] **Event time** = when it happened (a timestamp in the record). **Processing time** = when you got to it.
- [ ] ⭐ A concrete example: an **offline phone** buffering events for 90 minutes; processing time shows a spike that never happened
- [ ] Other causes: consumer lag, rebalances, **replay**, batch uploads
- [ ] ⭐ **The killer argument: reprocessing.** Replay last week's topic and processing-time windows give different (wrong) answers; **event-time windows reproduce the original result exactly.** Determinism under replay.
- [ ] **The problem event time creates**: when can you close a window? You can't know if more late data is coming.
- [ ] ⭐ **A watermark is an assertion**: *"I believe I've seen all events with event time ≤ T."* **A heuristic, not a fact** — it's how the processor decides it's allowed to stop waiting.
- [ ] **The trade**: aggressive = low latency, more dropped; conservative = complete, higher latency
- [ ] **Late-data handling**: drop (with a metric) · side output · allowed lateness + re-emit · **batch reconciliation**
- [ ] Bonus: for **billing**, the honest answer is streaming-approximate + batch-exact (lambda)
- [ ] Bonus: windows — tumbling, hopping, **session** (boundary defined by the data, not the clock)

**Self-score:** ___ / 10

---

## Extra checks

- [ ] **Six services at 99.9% synchronously** — what's the availability, and what does it argue?
- [ ] Name **five costs** of going async. Which is a product change?
- [ ] ⭐ **When is a cron job or a DB table the right answer** instead of Kafka?
- [ ] **Queue vs pub/sub vs log** — the per-message vs per-consumer framing
- [ ] Three things a **log** enables that a queue can't; three things a queue does better
- [ ] ⭐ **Why `acks=all` alone can still lose data.** Give the full fix and the tolerance arithmetic.
- [ ] What does the **idempotent producer** actually dedupe? State the boundary.
- [ ] **`linger.ms`** as a latency/throughput trade
- [ ] **ISR** — what is it, and why does it exist?
- [ ] ⭐ **Unclean leader election as a CAP flag** — what do you set, and what must you say out loud?
- [ ] **Log compaction** — what does it unlock? State the **stream–table duality**.
- [ ] ⭐ **`enable.auto.commit=true`** — what semantic does it silently produce?
- [ ] ⭐ **The rebalance-loop bug** — walk it end to end. Why is it hard to spot?
- [ ] **`session.timeout.ms` vs `max.poll.interval.ms`**
- [ ] What does **Kafka EOS** actually cover, and what does it not?
- [ ] ⭐ **Hybrid fan-out** — the threshold logic, and what a read actually does
- [ ] Why **store post IDs, not bodies**?
- [ ] **Backward vs forward compatibility** — which matters most for a log, and why?
- [ ] The most dangerous **schema change** that no tool catches
- [ ] ⭐ **Why in-app cron breaks with 3 replicas**, and the unique-constraint fix
- [ ] **Kafka has no delay** — how do retry topics work around it?

---

## Scoring

| Result | Do this |
|---|---|
| All four passed + most extras | ✅ Advance to **Phase 7 — Reliability, Resilience & Observability** |
| Fumbled any of Q1–Q4 | ⛔ Redo that note's "own words" section, retry in 2 days |

| Fumbled | Redo |
|---|---|
| Q1 | [notes/09](notes/09-outbox-and-cdc.md) — **whiteboard it twice more**; re-run lab Part C |
| Q2 | [notes/03](notes/03-kafka-fundamentals.md) + re-run lab Part A |
| Q3 | [notes/08](notes/08-consumer-hygiene.md) — design it for three different products |
| Q4 | [notes/13](notes/13-stream-processing.md) |

---

## Before Phase 7

Phase 7 is **the senior differentiator** — the roadmap calls designing the failure path *"the most reliable
single differentiator in the whole round."*

- [ ] ⭐ **Practice problems: you should be at 10–12 by now** (roadmap Weeks 9–10). If you're behind, this is
      the gap that matters most — the roadmap wants **2/week from Week 6**.
- [ ] **DDIA ch. 10–12 finished.**
- [ ] ⭐ **Mock interviews start at Week 14** — but the roadmap's rule is *"bad early is cheap."* If you
      haven't recorded yourself doing a 45-minute design yet, do it this week.

---

## Gate log

| Attempt | Date | Q1 (time) | Q2 | Q3 | Q4 | Notes |
|---|---|---|---|---|---|---|
| 1 |  | /13 ( ) | /9 | /12 | /10 |  |
| 2 |  | /13 ( ) | /9 | /12 | /10 |  |
