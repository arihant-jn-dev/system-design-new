# 06·02 · Queue vs Pub/Sub vs Log

> **Why this exists:** three primitives that people call "a message queue." They have genuinely different
> semantics, and choosing the wrong one shows up months later as "we can't replay" or "we can't add a
> consumer."

---

## Reference

### The three

**1 · QUEUE — work distribution, competing consumers**

```
producer ──▶ [ A B C D ] ──▶ consumer 1  (gets A, C)
                         └─▶ consumer 2  (gets B, D)
```
**Each message goes to exactly ONE consumer.** Consuming **removes** it. Add consumers to go faster.

*SQS, RabbitMQ (work queue), Redis Lists, a DB job table.*

**2 · PUB/SUB — fan-out**

```
publisher ──▶ topic ──┬──▶ subscriber A  (gets everything)
                      ├──▶ subscriber B  (gets everything)
                      └──▶ subscriber C  (gets everything)
```
**Every subscriber gets every message.** ⚠️ **Classically ephemeral: a subscriber that's offline misses
messages permanently** (Redis pub/sub, raw SNS).

**3 · LOG — replayable, ordered, retained** ⭐

```
producer ──▶ [0][1][2][3][4][5]...   an append-only log, RETAINED
                  ▲        ▲
            group A     group B      each tracks its OWN offset
```
**Consuming doesn't remove anything.** Consumers track a position. **Multiple independent groups read the
same data; any of them can rewind.**

*Kafka, Kinesis, Pulsar, Redis Streams.*

### The comparison

| | **Queue** | **Pub/Sub** | **Log** |
|---|---|---|---|
| Delivery | One consumer | All subscribers | All groups, each at its own offset |
| Message removed on read | ✅ Yes | ✅ Effectively | ❌ **No — retained** |
| ⭐ **Replay** | ❌ | ❌ | ✅ **Rewind to any offset** |
| ⭐ **History for a NEW consumer** | ❌ Gone | ❌ Missed it | ✅ **Read from the beginning** |
| Ordering | ➖ Weak (FIFO queues excepted) | ➖ | ✅ **Per partition** |
| Scaling consumers | ✅ Just add them | Each gets everything | ⚠️ **Capped by partition count** |
| Retention | Until consumed | None | ⭐ Time/size based |
| Per-message ack/retry/priority | ✅ **Excellent** | ➖ | ⚠️ **Offset-based — awkward** |

### ⭐ The log's superpower, and its cost

**Superpower — "the past is still there":**

| Enables | |
|---|---|
| **Replay after a bug** | Fix the consumer, reset the offset, reprocess |
| ⭐ **Add a consumer later and backfill it** | A new analytics service reads 6 months of history. **Impossible with a queue.** |
| **Multiple independent consumers** | Billing, search indexing and analytics all read the same topic without coordinating |
| **The log as source of truth** | Event sourcing ([11](11-event-driven-design.md)) |
| **Debugging** | Inspect exactly what was published |

**Cost — Kafka is bad at things queues are good at:**

| Weakness | Why |
|---|---|
| ⚠️ **Per-message retry** | Offsets are sequential. You can't ack message 5 and leave 3 pending — hence retry topics ([08](08-consumer-hygiene.md)) |
| ⚠️ **Per-message delay / scheduling** | No native "deliver this in 10 minutes" |
| ⚠️ **Priority** | No native priorities — you use separate topics |
| ⚠️ **Consumer parallelism** | Capped by partition count; a queue scales to any number of workers |
| **Head-of-line blocking** | One slow message blocks its partition |

> ⭐ **The clearest way to say it: a queue tracks state PER MESSAGE; a log tracks state PER CONSUMER
> (an offset).** That single difference explains every row in both tables — why replay works, and why
> per-message retry doesn't.

### Choosing

```
Distribute work to workers, per-message retry, priorities, delays?  -> QUEUE (SQS/RabbitMQ)
Notify many independent systems, don't care about history?          -> PUB/SUB (SNS)
Need replay, history, ordering, or many independent consumers?      -> LOG (Kafka)
Both work-distribution AND fan-out?                                 -> LOG with consumer groups
```

⭐ **A log gives you both patterns in one primitive** ([03](03-kafka-fundamentals.md)): within a group it
behaves like a queue (each partition to one member); across groups it behaves like pub/sub. That's a real
part of Kafka's appeal.

**And the combination that's very common:** SNS (fan-out) → SQS (per-consumer queue with retries and a DLQ).
You get pub/sub semantics with a queue's per-message error handling — **often a better fit than Kafka for
task-style work.**

### The mental model

| Primitive | Is like |
|---|---|
| **Queue** | A **to-do list** — take a task, do it, cross it off. Gone. |
| **Pub/Sub** | A **radio broadcast** — hear it if you're listening; otherwise it's gone. |
| **Log** | A **journal** — everyone reads at their own pace, and the past is still there. |

---

## In your own words

**Define each primitive in one line, focusing on what happens to a message when it's read.**

>

**Give the "per message vs per consumer" framing and derive two consequences from it.**

>

**Name three things a log enables that a queue cannot.**

>

**Name three things a queue does better than a log.**

>

**How does one Kafka topic provide both queue and pub/sub semantics?**

>

**Why is SNS → SQS often a better fit than Kafka for task-style work?**

>

---

## Links

- Why async at all → [01-why-async.md](01-why-async.md)
- Kafka's partitions and consumer groups → [03-kafka-fundamentals.md](03-kafka-fundamentals.md)
- Retry topics (working around the log's weakness) → [08-consumer-hygiene.md](08-consumer-hygiene.md)
- Broker comparison → [10-broker-comparison.md](10-broker-comparison.md)
- **DDIA ch. 11**, "Messaging Systems"
