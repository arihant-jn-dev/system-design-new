# 04·12 · Tail Latency, Stragglers & Hedged Requests

> **Why this exists:** you measured tail latency amplification back in
> [Phase 0's lab](../../phase-00-foundations/lab/) — at fan-out 100, your p50 became the dependency's p99.
> This note is the set of techniques that fight back, and **hedged requests** is the one worth knowing by
> name.

---

## Reference

### The recap you already measured

**A request that fans out to N backends and waits for all of them has a latency equal to the MAXIMUM of N
samples.**

```
P(slow) = 1 − (1 − p)^N        p = per-backend slow probability

p = 1%,  N = 100   ->   63% of parent requests are slow
```

**Your own measurement:** fan-out 1 → p50 = 6.6 ms; fan-out 100 → **p50 = 212 ms**, and the **average fell
below the median** because the distribution went bimodal.

### Where the tail comes from

| Source | Note |
|---|---|
| **GC pauses** | JVM/Go stop-the-world |
| **Queueing** at any layer | Thread pool, connection pool, disk, NIC |
| **Cache misses** | The miss path is often 100× the hit path |
| **Retries** | One retry doubles that request's latency |
| **Noisy neighbours** | Shared CPU/disk on virtualised infra |
| **Background work** | Compaction ([3a-02](../../phase-03-databases/notes/3a-02-lsm-tree.md)), vacuum, checkpointing, log rotation |
| **Head-of-line blocking** | See below |
| **Slow-path code** | The user with 10× the data |

**Dean & Barroso's framing (*The Tail at Scale*): tail latency is not a bug to be fixed, it's a statistical
property of large systems.** Variability is inevitable, so you build systems that are **tail-tolerant**
rather than trying to eliminate it.

### Head-of-line blocking — the same idea at four layers

**One slow item blocks everything queued behind it**, even when those items are independent:

| Layer | Manifestation | Fix |
|---|---|---|
| **TCP** | One lost packet stalls all later bytes | QUIC/HTTP-3 ([Phase 1 note 02](../../phase-01-networking/notes/02-tcp-vs-udp.md)) |
| **HTTP/1.1** | One slow response blocks the connection | HTTP/2 multiplexing |
| **HTTP/2 over TCP** | Loss stalls *all* streams (shared connection) | HTTP/3 |
| **A work queue** | One slow job blocks the queue | Multiple partitions/consumers; separate queues by cost |
| **A thread pool** | One blocked thread reduces capacity | Bulkheads (Phase 7) |

**Naming it at multiple layers is a good signal** — it shows you see it as a pattern rather than an HTTP fact.

### ⭐ Hedged requests — the technique to know

**After waiting p95, send a duplicate request to another replica. Take whichever answers first, cancel the
other.**

```
t=0     send to replica A
t=p95   A hasn't answered -> also send to replica B
        take the first response, cancel the loser
```

**Why it's so effective:** you only hedge the **5% of requests that are already slow**, so extra load is
~5% — but you've removed almost the entire tail. Google reported (in *The Tail at Scale*) a **p99 dropping
from 1,800 ms to 74 ms for ~2% extra load** on a real service.

> **The trade to state: hedging spends throughput to buy tail latency.** It's the right trade when you have
> spare capacity and the tail matters — and exactly the wrong one when you're already overloaded, because
> then it adds load precisely when you can least afford it. **Always cap the hedge rate** (e.g. no more than
> 5% of requests may be hedged).

⚠️ **Hedged requests require idempotency** ([Phase 1 note 09](../../phase-01-networking/notes/09-idempotency.md)).
You are deliberately sending the same operation twice.

**Tied requests** — a refinement: send to two replicas immediately, but each request carries the identity of
the other, and whichever starts work first tells the other to cancel. Lower latency than waiting for p95,
less wasted work than pure duplication.

### The full toolkit

| Technique | How | Cost |
|---|---|---|
| ⭐ **Hedged requests** | Duplicate after p95 | ~5% extra load |
| **Tied requests** | Send to 2, mutual cancellation | Coordination |
| **Reduce fan-out** | Batch, denormalise, cache | Data model complexity |
| **Don't wait for everyone** | Return partial results when a non-critical backend is slow | Degraded response — **usually correct** |
| **Deadline propagation** | Pass the remaining budget down each hop; drop expired work | Framework support (gRPC has it) |
| **Micro-partitioning** | Many small tasks, not one per machine — so a slow machine gets fewer | Scheduling overhead |
| **Selective replication** | Extra replicas for hot/slow partitions | Storage |
| **Latency-aware routing** | P2C on measured latency ([Phase 2 note 03](../../phase-02-stateless-scaling/notes/03-load-balancing-algorithms.md)) | Needs measurement |
| **Outlier ejection** | Remove the consistently-slow replica ([Phase 2 note 06](../../phase-02-stateless-scaling/notes/06-lb-operations-and-types.md)) | — |
| **Fix the actual tail** | GC tuning, cache warming, removing lock contention | Real work, **best ROI** |

**"Don't wait for everyone" deserves emphasis** — it's the cheapest and most under-used. In the Phase 0
capacity drill for ad serving, the answer to a 100 ms budget with 5 bidders was exactly this: **set a hard
timeout and run the auction with whoever replied.**

### Straggler mitigation in batch systems

Same problem, different domain: one slow task delays the whole job.

- **Speculative execution** (MapReduce/Spark): near the end of a stage, re-launch the slowest tasks on other
  nodes and take whichever finishes first. **Hedging for batch jobs.**
- **Skew handling:** one partition is 100× bigger — salt the key
  ([3d-03](../../phase-03-databases/notes/3d-03-shard-key-selection.md))
- **Backup tasks** as a scheduled policy rather than a reaction

---

## In your own words

**Recall your own fan-out measurements. What happened to p50 and to the average at N=100?**

>

**Give the formula and compute P(slow) for N=50, p=2%.**

>

**Name head-of-line blocking at four different layers.**

>

**Explain hedged requests. Why is the extra load so small, and when is it exactly the wrong tool?**

>

**Why do hedged requests require idempotency?**

>

**Give the cheapest, most under-used tail-latency technique, and an example where it's the whole answer.**

>

---

## Links

- ⭐ **Where you measured this** → [Phase 0 note 04](../../phase-00-foundations/notes/04-percentiles-and-tail-latency.md) and its [lab](../../phase-00-foundations/lab/)
- HOL blocking at the transport layer → [Phase 1 note 02](../../phase-01-networking/notes/02-tcp-vs-udp.md)
- Latency-aware LB, outlier ejection → [Phase 2 notes 03 & 06](../../phase-02-stateless-scaling/notes/03-load-balancing-algorithms.md)
- Backpressure, the related discipline → [11-backpressure-and-flow-control.md](11-backpressure-and-flow-control.md)
- Timeouts, deadlines, circuit breakers → **Phase 7**
- **Dean & Barroso, *The Tail at Scale* (CACM 2013)** — short and excellent
