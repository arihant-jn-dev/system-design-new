# 06·04 · Kafka Producers

> **Why this exists:** `acks` is a **durability/latency trade you must be able to state as a number**, and
> the `acks=all` + `min.insync.replicas` interaction is a genuine gotcha that has caused real data loss.

---

## Reference

### `acks` — the durability dial

| `acks` | Leader waits for | Durability | Latency |
|---|---|---|---|
| **0** | **Nothing** — fire and forget | ❌ **Loses data freely.** Not even network errors are noticed. | Lowest |
| **1** | The **leader** has written it | ⚠️ **Lost if the leader dies before followers replicate** | Low |
| ⭐ **all** (`-1`) | **All in-sync replicas** have it | ✅ Survives leader failure | +1 round trip |

> ⭐ **`acks=all` is the only setting that survives a broker failure**, and it's the default in modern Kafka
> (3.0+). `acks=0` is for data you genuinely don't mind losing — metrics samples, perhaps — and nothing else.

### ⚠️ The gotcha: `acks=all` alone is not enough

**`acks=all` means "all *in-sync* replicas." If only ONE replica is in sync, that's one replica.**

```
RF=3, but 2 followers have fallen behind and been removed from the ISR.
ISR = {leader}.
acks=all  ->  waits for... the leader only.
The leader dies  ->  ⭐ ACKNOWLEDGED DATA IS LOST, despite acks=all.
```

**The fix — set both:**
```
acks=all
min.insync.replicas=2      ⭐ on the TOPIC (or broker)
```
Now if fewer than 2 replicas are in sync, the producer gets
`NotEnoughReplicasException` **instead of a false success.**

> ⭐ **The senior framing: `acks=all` + `min.insync.replicas=2` with RF=3 is the standard durable
> configuration.** It tolerates one broker down (2 in sync, writes proceed) and **refuses writes** when two
> are down — deliberately choosing consistency over availability. **That refusal is the feature.**

**And the arithmetic to state:** RF=3 with `min.insync.replicas=2` tolerates **one** broker failure for
writes. `min.insync.replicas=3` tolerates **zero** — same trap as Cassandra's `CL=ALL`
([3f-03](../../phase-03-databases/notes/3f-03-wide-column.md)).

### The idempotent producer

`enable.idempotence=true` (**default in Kafka 3.0+**).

**The problem it solves:** a producer sends, the broker writes it, the **ack is lost**, the producer retries →
**the message is written twice.** Classic at-least-once ([07](07-delivery-semantics.md)).

**How:** each producer gets a **producer ID**, and each message carries a **per-partition sequence number**.
The broker tracks the last sequence per (producer, partition) and **discards duplicates**.

**Scope, precisely:** one producer session, one partition, and **only duplicates caused by producer retries**.
It does not dedupe application-level double-sends, and it doesn't survive a producer restart with a new
producer ID. **Know the boundary** — it's often overclaimed.

**It also enables ordering guarantees with retries:** without idempotence, `max.in.flight.requests > 1` plus
retries can **reorder** messages (message 2 succeeds, message 1 is retried and lands after it). With
idempotence, Kafka preserves order for up to 5 in-flight requests. **A subtle and important detail** — if
ordering matters and you disabled idempotence, you must set `max.in.flight.requests.per.connection=1` and
take the throughput hit.

### Batching — the throughput lever

| Setting | Meaning |
|---|---|
| **`batch.size`** | Max bytes per batch, per partition (default 16 KB) |
| ⭐ **`linger.ms`** | **How long to WAIT for more messages before sending** (default 0) |
| `compression.type` | `lz4`/`snappy`/`zstd` — compression applies **per batch**, so bigger batches compress better |
| `buffer.memory` | Total producer buffer; when full, `send()` **blocks** (`max.block.ms`) → backpressure |

> ⭐ **`linger.ms` is the classic latency/throughput trade**
> ([Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md)): `linger.ms=0` sends
> immediately (lowest latency, small batches); `linger.ms=10` waits up to 10 ms to fill a batch —
> **dramatically higher throughput and better compression, for 10 ms of added latency.**
>
> For a user-facing write path, 0. For an analytics firehose, 10–100 is free money.

**`buffer.memory` filling up is backpressure** ([Phase 4 note 11](../../phase-04-distributed-systems/notes/11-backpressure-and-flow-control.md)) —
the producer blocks rather than growing without bound. **That's correct behaviour, and you should alert on
it** rather than raising the buffer.

### The partitioner

| Case | Behaviour |
|---|---|
| **Key present** | `partition = hash(key) % numPartitions` (murmur2) — **deterministic** |
| **No key** (modern) | **Sticky partitioner** — fills one batch, then switches. Better batching than round-robin. |
| Explicit partition | You specify it |
| Custom | Implement your own (e.g. to isolate a big tenant) |

⚠️ **No key = no ordering guarantee.** If you need ordering and forgot the key, you don't have it — a silent
bug ([03](03-kafka-fundamentals.md)).

### Producer configuration by use case

| Use case | Config |
|---|---|
| ⭐ **Financial / orders** | `acks=all`, `min.insync.replicas=2`, `enable.idempotence=true`, `retries=MAX`, `linger.ms=0` |
| **High-volume analytics** | `acks=1`, `linger.ms=50`, `compression=lz4`, larger `batch.size` |
| **Metrics you can lose** | `acks=0`, big batches |
| **Strict per-key ordering** | Key set, idempotence on (or `max.in.flight=1`) |

### Error handling

| Error | Meaning |
|---|---|
| **Retriable** (`NotLeaderForPartition`, `NetworkException`, timeouts) | Kafka retries automatically |
| **`NotEnoughReplicasException`** | ⭐ `min.insync.replicas` not met — **the broker correctly refusing a write it can't make durable** |
| `RecordTooLargeException` | Exceeds `max.request.size` / broker `message.max.bytes` |
| **Non-retriable** (serialisation, authorisation) | Your bug |
| **`TimeoutException`** after `delivery.timeout.ms` | ⚠️ **Ambiguous — it may or may not have been written.** Retrying needs idempotence, or you may duplicate. |

**That last row is the producer-side version of the fundamental problem**
([Phase 4 note 01](../../phase-04-distributed-systems/notes/01-fallacies-and-failure-models.md)): a timeout
tells you nothing about whether the work happened.

---

## In your own words

**State the three `acks` settings and what each survives.**

>

**Explain why `acks=all` alone can still lose data. Give the full fix and the failure-tolerance arithmetic.**

>

**What exactly does the idempotent producer dedupe? State its boundary precisely.**

>

**How can retries reorder messages, and what prevents it?**

>

**Explain `linger.ms` as a latency/throughput trade. Give a setting for two different workloads.**

>

**What does a `TimeoutException` after `delivery.timeout.ms` actually tell you?**

>

---

## Links

- Partitions and keys → [03-kafka-fundamentals.md](03-kafka-fundamentals.md)
- ISR and replication → [06-kafka-replication-and-retention.md](06-kafka-replication-and-retention.md)
- Delivery semantics → [07-delivery-semantics.md](07-delivery-semantics.md)
- Latency vs throughput → [Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md)
