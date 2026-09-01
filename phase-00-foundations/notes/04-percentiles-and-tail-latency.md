# 04 · Percentiles & Tail Latency

> **Why this exists:** this is the highest-signal topic in Phase 0. "Why are averages useless?" and "explain
> tail latency amplification" are direct gate questions, and the second one is the reason microservice
> architectures fall over in ways their designers didn't predict.

---

## Reference

### What a percentile is

**p99 = 99% of requests were faster than this.** The slowest 1% were slower.

| Percentile | Means | Who feels it |
|---|---|---|
| p50 (median) | Half of requests | The typical user |
| p95 | 1 in 20 requests is worse | Everyone, several times a day |
| p99 | 1 in 100 requests is worse | **Your most engaged users, constantly** |
| p999 | 1 in 1,000 | Amazon/Google-scale concern; often where the real bug lives |

### Why averages are useless — three independent reasons

**1 · The average hides the shape entirely.**

```
Service A: 100, 100, 100, 100, 100 ms         → avg 100 ms, p99 100 ms  ✅ boring, healthy
Service B:  10,  10,  10,  10, 460 ms         → avg 100 ms, p99 460 ms  ❌ 20% of users suffering
```
Identical averages. Completely different products.

**2 · Latency distributions are not normal — they're long-tailed.**
Response times have a floor (you can't be faster than the work) and no ceiling (GC pause, retry, packet loss,
noisy neighbour, cold cache). The mean gets dragged by the tail while the median doesn't move. There is no
"standard deviation" intuition to fall back on. **Never quote a mean latency.**

**3 · Your best customers live in the tail.**
The user with the most data, the most followers, the most items in their cart — their requests are the
slowest ones. So p99 disproportionately describes your *highest-value* users. Amazon's classic finding: the
customers with the slowest requests are the ones with the most purchase history.

> **The gate answer, compressed:** "Averages hide the shape of a long-tailed distribution, they're dragged
> around by outliers while the median isn't, and the slow requests correlate with your most valuable users —
> so the average describes a user who doesn't exist."

### Tail latency amplification — THE concept

**If a request fans out to N backends and must wait for all of them, its latency is the *maximum* of N
samples, not the average.**

Let each backend be slow (say 200 ms) 1% of the time.

```
P(request is slow) = 1 − P(no backend is slow)
                   = 1 − (0.99)^N
```

| Fan-out N | P(at least one slow) | What the parent request's latency looks like |
|---|---|---|
| 1 | **1%** | p99 is slow — as designed |
| 10 | **9.6%** | ~p90 is now slow |
| 100 | **63%** | **The median request is slow.** Your p50 ≈ the backend's p99. |
| 1,000 | **99.99%** | Essentially every request hits the slow path |

**Read that 100-row again.** A backend that is slow only 1% of the time makes a 100-way fan-out slow *most of
the time*. The parent's p50 has been replaced by the child's p99.

This is why:
- A "fast" service can be built entirely out of "fast" services and still be slow.
- Adding a service to a fan-out path is far more dangerous than adding one to a sequential path.
- **You must measure the p99 of your dependencies, not their average** — because at fan-out, their p99 becomes your p50.

> **Explaining it to a junior (gate question):** "Imagine asking 100 friends a question and you can't leave
> until *everyone* answers. Even if each friend is usually quick, you only need one to be in the shower.
> With 100 friends, someone is basically always in the shower. Your wait time isn't the average friend —
> it's the slowest friend, every single time."

You will produce this table with real measurements in [`../lab/`](../lab/). Do it — the number landing on
your own terminal is what makes it permanent.

### Mitigations (introduced here, deepened in Phase 7)

| Technique | How it works | Cost |
|---|---|---|
| **Reduce fan-out** | Batch/aggregate; denormalise so one call gets everything | Data model complexity |
| **Hedged requests** | After p95 elapses, send a duplicate to another replica; take the first answer | ~5% extra load buys a large p99 win |
| **Tied requests** | Send to two replicas, each cancels the other on start | Extra coordination |
| **Don't wait for everything** | Return partial results when a non-critical backend is slow | Degraded response — usually correct |
| **Deadline propagation** | Pass "you have 40 ms left" down the call chain | Requires framework support (gRPC has it) |
| **Fix the actual tail** | GC tuning, cache warming, removing lock contention | Real work, best ROI |

**The senior framing:** at fan-out, the correct target is *the dependency's p99*, and the right question is
"can I not wait for all of them?"

### Measuring percentiles correctly — three traps

1. **You cannot average percentiles.** `avg(p99 of shard A, p99 of shard B)` is meaningless. Percentiles must
   be computed from the merged distribution — which is why systems store histograms (HDR histogram, t-digest,
   Prometheus buckets), not summary stats.
2. **Coordinated omission.** If your load generator waits for a response before sending the next request
   (closed model), it *stops sending* during a stall — so the stall never appears in your numbers. This makes
   broken systems look fine. Use an open-model / constant-arrival-rate generator. (See note 03.)
3. **Percentile over what window?** p99 over 1 minute vs 1 day are very different claims. Always say the window.

### Where the tail comes from

Worth knowing so you can answer "why is your p99 bad?":

- **GC pauses** (JVM, Go) — stop-the-world
- **Queueing** at any layer — thread pool, connection pool, disk, network buffer
- **Cache misses** — the miss path is 100× the hit path
- **Retries** — one retry doubles that request's latency
- **Noisy neighbours** — shared CPU/disk on virtualised infra
- **Lock contention / hot rows**
- **Connection setup** — TCP + TLS handshake on a cold connection
- **Slow-path code** — pagination deep in a list, a user with 10× the data
- **Background work** — compaction, vacuum, checkpointing, log rotation

---

## In your own words

**Explain why averages are useless. Give your own two-service example with numbers.**

>

**A request fans out to 50 services, each with a 2% slow rate. What fraction of parent requests are slow? Show the math.**

>

**Explain tail latency amplification to a junior dev. Write the actual words you'd say — no jargon.**

>

**Why can't you average two shards' p99 values?**

>

**What is coordinated omission and why does it make a broken system look healthy?**

>

**List the top 3 sources of tail latency in a system you've actually worked on.**

>

---

## Links

- Little's Law and the knee → [03-latency-vs-throughput.md](03-latency-vs-throughput.md)
- Availability multiplies the same way latency amplifies → [05-availability-vs-durability.md](05-availability-vs-durability.md)
- Hedged requests, deadline propagation, straggler mitigation → Phase 4 & Phase 7
- **Measure it yourself** → [`../lab/`](../lab/) Experiment 3
