# 07·04 · Bulkheads & Isolation

> **Why this exists:** the pattern that decides *how much* of your capacity one failing dependency can
> consume. In the lab it's what turned "the process accumulates in-flight requests until it dies" into
> "4,013 requests rejected fast while the service stayed alive."

---

## Reference

### The metaphor

**A ship's hull is divided into watertight compartments. A breach floods one compartment, not the ship.**

**In software: partition your resources so one failure can't consume all of them.**

```
❌ ONE shared pool of 100 threads
     dependency A hangs -> all 100 threads block on A -> B and C are starved too
     ⭐ A's failure became everyone's failure

✅ per-dependency pools:  A:40   B:40   C:20
     A hangs -> 40 threads block -> B and C keep working at full speed
```

### What to partition

| Resource | Bulkhead |
|---|---|
| ⭐ **Thread / concurrency pools** | Per dependency |
| ⭐ **Connection pools** | Per database, per downstream |
| **Queues** | Per job type — a bulk import can't starve user-facing work |
| **Instances/clusters** | Per tenant, or per criticality |
| **Rate-limit buckets** | Per tenant |
| **Cells** | ⭐ Whole stacks per user subset ([13](13-multi-region-and-dr.md)) |

### What you measured

The lab app had `MAX_CONCURRENCY = 50`. When the dependency slowed to 5 s:

```
ok:                  1588
failed:              4013
rejectedByBulkhead:  4013      ⭐ ALL failures were fast rejections
```

> ⭐ **The bulkhead is what converted "hang forever" into "fail in microseconds."** Without it the process
> would have accumulated in-flight requests without bound until memory or file descriptors ran out — which is
> what "a slow dependency took us down" actually looks like from the inside.
>
> **Note it didn't make requests succeed.** It bounded the damage. That's what a bulkhead does: it's the
> reason a timeout and a circuit breaker have a healthy process to run in.

### Sizing a bulkhead

**Little's Law** ([Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md)):

```
concurrency = throughput × latency

200 req/s to a dependency at p99 = 200ms  ->  200 × 0.2 = 40 concurrent
Size the pool at ~40, plus headroom.
```

⭐ **And check what it becomes when the dependency degrades**: at 5 s, sustaining 200 req/s would need
**1,000 concurrent** — far past any sane pool. **That's the point: the bulkhead makes the system reject the
excess instead of trying (and dying).**

**Sizing rules:**
- Big enough for normal load + headroom
- ⭐ **Small enough that exhausting it doesn't exhaust the process**
- Sum of all bulkheads ≤ total capacity — **and leave slack for critical paths**
- ⭐ **A rejected request must be CHEAP** — reject before allocating anything

### Semaphore vs thread-pool isolation

| | **Semaphore** (a counter) | **Thread pool** |
|---|---|---|
| Cost | ⭐ **Nearly free** | A thread per pool |
| Isolation | Limits concurrency; caller's thread still blocks | ⭐ **Full — the caller's thread is freed** |
| Timeout enforcement | ⚠️ Can't interrupt a blocked call | Can abandon the task |
| Use | ⭐ **Async runtimes (Node, Go), fast dependencies** | Blocking I/O, slow dependencies |

**In async runtimes a semaphore is usually right** — there's no thread to block, so the counter *is* the
bulkhead. That's what the lab uses (`active >= MAX_CONCURRENCY`).

⚠️ **Hystrix's thread-pool isolation was heavy** (a thread pool per dependency); modern libraries default to
semaphores for this reason.

### Isolation at larger scales

| Level | |
|---|---|
| **Process** | Pools within one service |
| **Service** | Separate deployments for critical vs non-critical paths |
| ⭐ **Tenant** | Dedicated instances/shards for large customers — noisy-neighbour protection |
| **AZ / region** | ([13](13-multi-region-and-dr.md)) |
| ⭐ **Cell** | Complete independent stacks per user subset — **the ultimate bulkhead** |

**Separating read and write paths, or critical and non-critical endpoints, into different deployments is a
bulkhead** — a batch export can no longer starve checkout.

### ⭐ Where bulkheads sit in the resilience stack

```
BULKHEAD        caps how much capacity one dependency can consume  <- keeps the PROCESS alive
TIMEOUT         bounds how long any single call can take           <- keeps requests moving
CIRCUIT BREAKER stops calling something known to be broken         <- lets it recover
FALLBACK        gives the user an answer anyway                    <- keeps the PRODUCT working
LOAD SHEDDING   rejects excess early                               <- keeps the SYSTEM stable
```

> ⭐ **They compose, and each is insufficient alone.** A timeout without a bulkhead still lets unbounded
> requests pile up. A bulkhead without a timeout fills up and never drains. A breaker without a fallback
> still returns errors. **Ship them together** — which is exactly what the lab's four cases demonstrate.

---

## In your own words

**Explain the metaphor and give the shared-pool failure it prevents.**

>

**Cite your lab numbers. What did the bulkhead convert, and what did it NOT do?**

>

**Size a pool with Little's Law for 500 req/s at 100 ms p99. What happens at 2 s?**

>

**Semaphore vs thread pool — which for an async runtime, and why?**

>

**Give three levels of isolation beyond the process.**

>

**Why is each resilience pattern insufficient on its own?**

>

---

## Links

- ⭐ **You measured this** → [`../lab/`](../lab/) Part A
- Little's Law → [Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md)
- Timeouts → [01](01-timeouts-and-deadlines.md) · Breakers → [03](03-circuit-breakers.md) · Shedding → [05](05-load-shedding.md)
- Connection pools → [3a-08](../../phase-03-databases/notes/3a-08-connection-pooling.md)
- Cells and blast radius → [13-multi-region-and-dr.md](13-multi-region-and-dr.md)
- **Michael Nygard, *Release It!***
