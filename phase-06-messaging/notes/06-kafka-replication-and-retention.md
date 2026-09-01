# 06·06 · Kafka Replication & Retention

> **Why this exists:** **ISR** and **unclean leader election** are the durability story, and **log
> compaction** is what turns a topic into a queryable state store — which is the foundation of
> event-carried state transfer and Kafka Streams' tables.

---

## Reference

## Replication

```
topic partition 0, RF=3:
   broker 1: LEADER      ← all reads and writes
   broker 2: follower    ← fetches from the leader
   broker 3: follower
```

**Leader handles everything; followers fetch and replicate.** Same single-leader model as
[3c-01](../../phase-03-databases/notes/3c-01-single-leader-replication.md).

### ⭐ ISR — the In-Sync Replica set

**Replicas that are "caught up enough"** — within `replica.lag.time.max.ms` (default 30 s) of the leader.

```
ISR = {1, 2, 3}     all healthy
broker 3 falls behind (GC, slow disk, network)
ISR = {1, 2}        ⭐ 3 is REMOVED -- it is still a replica, just not in-sync
broker 3 catches up
ISR = {1, 2, 3}     re-added
```

**Why ISR exists:** `acks=all` waits for the ISR, **not for every replica**. So one slow broker doesn't block
writes — it's ejected from the ISR and writes continue. **That's the availability mechanism**, and it's the
same idea as removing a slow node from a quorum.

⚠️ **And it's the gotcha from [04](04-kafka-producers.md):** if the ISR shrinks to just the leader,
`acks=all` waits for one replica. **Hence `min.insync.replicas=2`.**

### ⭐ Unclean leader election — the explicit durability/availability choice

**All in-sync replicas are down. Only an out-of-sync replica remains. Now what?**

| `unclean.leader.election.enable` | Behaviour |
|---|---|
| **`false`** (default, modern) | ⭐ **The partition stays OFFLINE** until an in-sync replica returns. **No data loss; no availability.** |
| **`true`** | ⭐ **Promote the out-of-sync replica.** Available immediately — and **every message it hadn't replicated is permanently lost.** |

> ⭐ **This is CAP as a configuration flag** ([Phase 4 note 02](../../phase-04-distributed-systems/notes/02-cap-and-pacelc.md)).
> `false` = CP: refuse to serve rather than diverge. `true` = AP: serve, and accept silent data loss.
>
> **Default to `false` for anything that matters.** Set `true` only for data where availability genuinely
> beats correctness — metrics, logs — and **say out loud that you're accepting data loss.**

### Retention — two completely different modes

| Mode | `cleanup.policy` | Keeps |
|---|---|---|
| **Delete** (default) | `delete` | Everything for `retention.ms` / `retention.bytes`, then drops **whole segments** |
| ⭐ **Compact** | `compact` | **The LATEST value per KEY, forever** |
| Both | `compact,delete` | Compacted, with an overall age limit |

**Retention is per-topic, not per-consumer.** Kafka doesn't know or care whether anyone read a message.
⚠️ **A consumer down longer than the retention period loses data permanently** — and `auto.offset.reset`
decides whether it then jumps to `earliest` or `latest`, both of which are bad in different ways.

### ⭐ Log compaction — what it unlocks

**Keep only the most recent value for each key. Older versions are eventually removed.**

```
before:  (user1, A) (user2, X) (user1, B) (user3, Q) (user1, C) (user2, Y)
after:   (user2, Y) (user3, Q) (user1, C)
         ⭐ the topic is now a SNAPSHOT of current state, keyed
```

| Enables | |
|---|---|
| ⭐ **Event-carried state transfer** | A topic that IS the current state of every entity ([11](11-event-driven-design.md)) |
| ⭐ **Bootstrapping a new consumer** | Read the compacted topic from the start → the full current state, without a database |
| **Changelog topics** | How Kafka Streams makes local state durable ([13](13-stream-processing.md)) |
| `__consumer_offsets` | Kafka's own offsets topic is compacted |
| **Deletion** | A **tombstone** — a record with a **null value** — marks the key deleted |

**Details worth knowing:**
- Compaction is **background and lazy** — duplicates exist for a while; it's eventual, not immediate
- The **active segment is never compacted**, so the newest data always has its full history
- `min.compaction.lag.ms` / `delete.retention.ms` control timing
- ⚠️ **Every record must have a key** — compaction is keyed by definition, and null-key records are never
  compacted away

> ⭐ **The framing: a delete-retention topic is a *stream of events*; a compacted topic is a *table of
> current state*.** That's the "stream–table duality" behind Kafka Streams, and being able to say it is a
> strong signal.

### Storage mechanics — why Kafka is fast

| Mechanism | |
|---|---|
| ⭐ **Sequential disk I/O** | Append-only. Sequential writes are far faster than random — **even on SSD** ([3a-02](../../phase-03-databases/notes/3a-02-lsm-tree.md)). |
| ⭐ **OS page cache** | Kafka doesn't maintain its own cache — it lets the kernel do it, so a broker restart keeps a warm cache |
| **Zero-copy** (`sendfile`) | Data goes from page cache to socket **without passing through userspace** |
| **Batching + compression** | Amortises per-message overhead; compression is per batch |
| **Segments** | The log is split into files; deletion drops whole segments (cheap) |

**"Kafka is fast because it does the simplest possible thing with the disk" is the honest summary** — it's an
append-only log with no random access, which is exactly what disks and page caches are best at.

### Tiered storage & KRaft — the modern shape

| Feature | |
|---|---|
| ⭐ **Tiered storage** (KIP-405) | Old segments move to **object storage** (S3). **Retention becomes cheap and effectively unlimited**, decoupling storage from broker disk — so "keep everything forever" stops being absurd. |
| ⭐ **KRaft** (KIP-500) | ⭐ **ZooKeeper removed.** Metadata lives in an internal **Raft** quorum ([Phase 4 note 06](../../phase-04-distributed-systems/notes/06-raft.md)). Simpler ops, faster failover, far more partitions per cluster. |

**KRaft is what the lab runs** — a single process that is both broker and controller, with no ZooKeeper.
Kafka 4.0 removed ZooKeeper support entirely. **If someone mentions ZooKeeper for Kafka, that's dated.**

---

## In your own words

**What is the ISR and why does it exist? Connect it to `acks=all`.**

>

**Explain unclean leader election as a CAP choice. What do you set, and what must you say out loud?**

>

**Delete vs compact retention — what does each keep, and what does compaction unlock?**

>

**State the stream–table duality in one sentence.**

>

**How do you delete a key from a compacted topic?**

>

**Give three reasons Kafka is fast. What's the one-line summary?**

>

**What did KRaft replace, and why does it matter?**

>

---

## Links

- `acks` and `min.insync.replicas` → [04-kafka-producers.md](04-kafka-producers.md)
- Single-leader replication generally → [3c-01](../../phase-03-databases/notes/3c-01-single-leader-replication.md)
- CAP as a config flag → [Phase 4 note 02](../../phase-04-distributed-systems/notes/02-cap-and-pacelc.md)
- Raft (inside KRaft) → [Phase 4 note 06](../../phase-04-distributed-systems/notes/06-raft.md)
- Compacted topics as state → [11-event-driven-design.md](11-event-driven-design.md)
- Changelog topics → [13-stream-processing.md](13-stream-processing.md)
