# 06·13 · Stream Processing

> **Why this exists:** gate Q4 — *"explain event time vs processing time and why watermarks exist."* That
> distinction is the single most important idea in stream processing, and it's the one people consistently
> get wrong.

---

## Reference

### Stateless vs stateful operations

| Stateless | Stateful |
|---|---|
| `map`, `filter`, `flatMap` | `aggregate`, `count`, `join`, windowed ops |
| Each record independent | **Needs memory of past records** |
| Trivially parallel; restart is free | ⭐ **State must survive a crash** |

**Stateful is where all the difficulty lives**, because "remember the last 5 minutes" has to survive
restarts, rebalances and reprocessing.

### ⭐ Event time vs processing time (gate Q4)

| | Meaning |
|---|---|
| **Event time** | When the event **actually happened** — a timestamp in the record, set at the source |
| **Processing time** | When your system **got around to it** |
| **Ingestion time** | When it arrived at the broker |

**They differ, sometimes enormously:**

```
19:00  user's phone goes offline; they keep using the app
19:05  events buffered locally
20:30  phone reconnects -> events arrive, 90 MINUTES LATE
```

**Count "events per minute" by processing time and you get a huge spike at 20:30 that never happened.** Count
by event time and you correctly attribute them to 19:00–19:05.

**Other causes of lateness:** mobile/offline clients · network partitions · consumer lag after an outage ·
**replaying a topic** (all events arrive "now") · a rebalance pausing a partition · batch uploads.

> ⭐ **The rule: any analytical or billing result must use EVENT time.** Processing time is fine only when
> "now" genuinely is the question — a live dashboard of *current* system throughput, say.
>
> **And note the killer case: reprocessing.** If you replay last week's topic to fix a bug, processing-time
> windows produce completely different (wrong) results, while event-time windows reproduce the original
> answer exactly. **Determinism under replay is the strongest argument for event time.**

### ⭐ Why watermarks exist

**The problem event time creates:** you're computing "count per 1-minute window." The 19:00–19:01 window
needs every event in that range. **When can you close it and emit the result?**

- Wait forever → never emit anything
- Close immediately at 19:01 processing time → miss every late event

> ⭐ **A watermark is an assertion: "I believe I have seen all events with event time ≤ T."**
> It's a heuristic, not a fact — and it exists precisely because **you cannot know whether more late data is
> coming.** The watermark is how a stream processor decides it's allowed to stop waiting.

```
watermark = max_event_time_seen − allowed_lateness
```

**When the watermark passes a window's end, the window fires and emits its result.**

**And the trade is explicit:**

| Watermark | Result |
|---|---|
| **Aggressive** (small lateness allowance) | ⭐ **Low latency**, more data excluded as late |
| **Conservative** (large allowance) | More complete, ⭐ **higher latency** — results appear minutes later |

**Handling data that arrives after the watermark:**

| Strategy | |
|---|---|
| **Drop it** | Simplest. Track a dropped-records metric — silently dropping data is how numbers quietly go wrong. |
| ⭐ **Side output / dead-letter** | Route late records somewhere for inspection or a batch fix-up |
| **Allowed lateness + update** | Keep window state a while longer and **re-emit a corrected result** — downstream must handle updates |
| **Batch reconciliation** | Stream gives the fast approximate answer; a nightly batch job gives the exact one → lambda architecture |

**For billing, the last row is the honest answer**: a real-time approximate number for dashboards, and a
batch job that reconciles the exact figure. You saw that shape in the ad-tech estimation drill
([Phase 0 drill 7](../../phase-00-foundations/drills/estimation-solutions.md)).

### Windowing

| Window | Shape | Use |
|---|---|---|
| **Tumbling** | Fixed, non-overlapping (every 5 min) | "Orders per 5 minutes" |
| **Hopping / sliding** | Fixed size, overlapping (5 min, every 1 min) | Moving averages |
| **Session** | ⭐ Grouped by activity, closed after a **gap** of inactivity | User sessions, where the boundary is behavioural not clock-based |
| **Global** | One unbounded window | Running totals |

**Session windows are the interesting one** — the window boundary is defined by the *data* (a gap in
activity), not by the clock, so window length varies per key.

### Joins

| Join | How | Note |
|---|---|---|
| **Stream–stream** | Both sides windowed; matches within a time window | ⭐ **Needs buffered state on both sides.** The ad **impression → click** join is exactly this — the click may arrive minutes later. |
| **Stream–table** | Enrich each event by looking up current state | The common case (event + user profile) |
| **Table–table** | Materialised view join | Changelog-driven |

**Stream–stream joins are memory-hungry** — you must retain one side for the whole join window. Widening the
window from 5 minutes to 1 hour is a 12× state increase.

### State stores & checkpointing

**Where does "the count so far" live?**

```
local state store (RocksDB) on the processing node   ← fast
        │
        └─ backed by a CHANGELOG TOPIC in Kafka      ← durable, replayable
```

⭐ **This is the pattern from [Phase 3F](../../phase-03-databases/notes/3f-01-relational-the-default.md)'s
"stateful is fine if you have a durable log":** local state for speed, a log for recovery. On failure the
state is rebuilt by replaying the changelog onto a new node.

| Concept | |
|---|---|
| **Checkpointing** (Flink) | Periodic consistent snapshots of all operator state; on failure, rewind to the last checkpoint and replay |
| **Changelog topic** (Kafka Streams) | Every state update is also written to a compacted topic |
| **Standby replicas** | Warm copies so recovery doesn't require a full replay |
| ⚠️ **Recovery time = state size ÷ replay rate** | Large state means slow failover. Standbys exist for this. |

### Kafka Streams vs Flink vs Spark Streaming

| | **Kafka Streams** | **Flink** | **Spark Structured Streaming** |
|---|---|---|---|
| Model | ⭐ **A library in your app** — no cluster | Distributed cluster | Micro-batch (continuous mode exists) |
| Deployment | Just a JVM app; scale by adding instances | Job manager + task managers | Spark cluster |
| Latency | Low (ms) | ⭐ **Lowest, true streaming** | Higher (micro-batch) |
| State | RocksDB + changelog | RocksDB + checkpoints | |
| Best for | ⭐ **Kafka-to-Kafka in a Java shop** | Complex event-time processing, big state, multiple sources | Reusing Spark/batch skills |

> **"Kafka Streams is a library, not a cluster" is the distinguishing fact** — it means no extra
> infrastructure, which is often the deciding factor for a small team.

### Batch vs streaming, and Lambda vs Kappa

| Architecture | |
|---|---|
| **Lambda** | ⭐ **Two paths**: a streaming layer for fast approximate results + a batch layer for exact ones, merged at query time. Robust; **you maintain the same logic twice.** |
| **Kappa** | ⭐ **One path**: everything is a stream; "batch" is just replaying history through the same code. Simpler; needs enough retention and replay throughput. |

**Kappa's core insight: if your stream processor can reprocess from the beginning of the log, you don't need
a separate batch layer.** Kafka's retention makes that possible.

> **When Lambda is still right: when the streaming answer must be *approximate* for latency reasons but an
> *exact* answer is also required.** Ad billing is the canonical case — a real-time approximate dashboard
> plus a nightly exact reconciliation. **And be willing to say batch is simply the right answer** when
> freshness genuinely doesn't matter; a cron job is much cheaper to operate than a streaming topology.

---

## In your own words

**Define event time vs processing time. Give the offline-phone example.**

>

**Why is reprocessing the strongest argument for event time?**

>

**What is a watermark, and what question does it answer? Why is it a heuristic?**

>

**State the watermark trade in one sentence.**

>

**Name four ways to handle late data. Which is honest for billing?**

>

**Why are stream–stream joins memory-hungry? Give the ad-tech example.**

>

**Explain local state + changelog. What determines recovery time?**

>

**Lambda vs Kappa — what's Kappa's core insight, and when is Lambda still right?**

>

---

## Links

- Kafka fundamentals → [03-kafka-fundamentals.md](03-kafka-fundamentals.md)
- Local state + durable log → [3f-01](../../phase-03-databases/notes/3f-01-relational-the-default.md)
- Ad-tech pipeline shape → [Phase 0 drill 7](../../phase-00-foundations/drills/estimation-drills.md) and [3f-05](../../phase-03-databases/notes/3f-05-object-storage-and-olap.md)
- Real-time OLAP (Druid/ClickHouse/Pinot) → Phase 9
- **DDIA ch. 11**, "Processing Streams" · Tyler Akidau, *The Dataflow Model* / "Streaming 101 & 102"
