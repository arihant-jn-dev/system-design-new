# 07·08 · Failure Modes — The Catalogue

> **Why this exists:** gate Q1 — *"for any design you've drawn, list every failure mode and its mitigation,
> **unprompted**."* That word is the whole test. The roadmap calls designing the failure path *"the most
> reliable single differentiator in the whole round"* — mid-level candidates design the happy path.

---

## Reference

## The catalogue — know these by name

| # | Failure | One-line cause |
|---|---|---|
| 1 | **Cascading failure** | One component's failure propagates upstream until everything is down |
| 2 | **Retry storm** | Failures trigger retries which multiply load which cause more failures |
| 3 | **Thundering herd** | N clients act simultaneously after a common trigger |
| 4 | **Metastable failure** | The trigger is gone but the system **cannot recover on its own** |
| 5 | **Queue backup / unbounded growth** | Sustained producer > consumer rate |
| 6 | **Hot shard / hot key** | Load concentrates on one partition |
| 7 | **Correlated failure** | "Independent" replicas share a dependency |
| 8 | **Gray failure** | Degraded but passing health checks |
| 9 | **Autoscaling death spiral** | Adding capacity makes it worse |
| 10 | **Cold cache** | Losing a *performance* component causes an *availability* failure |

---

### 1 · Cascading failure ⭐ — and gate Q4

**You measured this.** A dependency slowed to 5 s and your service failed **71.6% of requests with a p99 of
6.41 s** — while the dependency never returned a single error.

```
dependency slows -> your calls wait -> in-flight requests accumulate
   (Little's Law: 200 req/s x 5 s = 1000 concurrent needed; you have 50)
   -> pool exhausted -> everything queues -> YOU are now down
   -> your callers start timing out -> THEY fill up -> the whole chain fails
```

> ⭐ **"Slow is worse than down."** A dead dependency fails fast and you shed load. A **slow** one silently
> consumes your capacity while you politely wait.

**Mitigations (all measured in the lab):** ⭐ **timeouts** ([01](01-timeouts-and-deadlines.md)) ·
**bulkheads** ([04](04-bulkheads-and-isolation.md)) · ⭐ **circuit breakers** ([03](03-circuit-breakers.md)) ·
**fallbacks** ([06](06-graceful-degradation.md)) · **load shedding** ([05](05-load-shedding.md)).

### 2 · Retry storm ⭐

**Also measured.** Adding retries to a slow dependency took dependency calls from 5,601 → **7,405** while the
success rate went *down* (25.7% → 25.0%).

> ⭐ **Retries are for TRANSIENT, INDEPENDENT failures. During a systemic failure they are actively
> harmful** — you multiply load on the thing that's already struggling.

**And it's multiplicative across layers:** 3 layers × 3 attempts = **27× load** at the bottom.

**Mitigations:** ⭐ **retry budgets** (cap retries at ~10% of traffic) · **retry at ONE layer only** ·
exponential backoff + **full jitter** · ⭐ **a circuit breaker to stop retrying into a systemic failure**.

### 3 · Thundering herd

**N clients act at the same instant** after a shared trigger: a cache key expires ·  a deploy restarts every
consumer · a lease expires · a leader is elected · 10,000 clients told `Retry-After: 30`.

**Mitigation is always the same: ⭐ JITTER.** It's the single most reused fix in the roadmap —
retries ([02](02-retries-and-budgets.md)), cache TTLs
([Phase 5 note 05](../../phase-05-caching/notes/05-failure-modes.md)), Raft election timeouts
([Phase 4 note 06](../../phase-04-distributed-systems/notes/06-raft.md)), cron schedules, health-check
intervals, reconnect delays. **Anything that would make N clients act in unison needs randomisation.**

### 4 · Metastable failure ⭐ — the one to name

**The system enters a state where it cannot recover, *even after the original trigger is gone*.**

```
trigger: a brief latency spike
  -> timeouts -> retries -> 2x load -> more timeouts -> more retries
  -> the spike ENDS
  -> ⭐ but retry load alone is now enough to keep the system saturated
  -> it stays down until you SHED ALL TRAFFIC and let it drain
```

> ⭐ **The diagnostic question: "if the cause disappeared right now, would it recover by itself?"** If the
> answer is no, it's metastable — and the only fix is to remove load (shed, or turn traffic off entirely)
> so the system can drain.
>
> **This is why "we restarted it and it came straight back down" happens.**

**Mitigations:** load shedding · retry budgets · circuit breakers · **enough headroom that you never enter
the bad state**.

### 5 · Queue backup / unbounded growth

A queue absorbs a *temporary* mismatch. A sustained one grows without bound
([Phase 4 note 11](../../phase-04-distributed-systems/notes/11-backpressure-and-flow-control.md)).

**Latency = depth ÷ throughput.** A 10 M backlog draining at 1,000/s is **~3 hours** behind — every message
processed is answering a question nobody is waiting for.

**Mitigations:** ⭐ **alert on lag *growth*, not value** · bounded queues with an explicit full policy ·
backpressure to the producer · shed low-priority work · **decide what happens when the buffer is full.**

### 6 · Hot shard / hot key

Zipfian traffic ([Phase 0 note 10](../../phase-00-foundations/notes/10-workload-shape.md)) concentrates on one
partition. **No amount of sharding splits a single key.**

**Mitigations:** ⭐ **local/near cache** (the most effective) · key salting for writes · dedicated shard ·
special-case celebrities ([3d-03](../../phase-03-databases/notes/3d-03-shard-key-selection.md)) · hot-key
detection (count-min sketch).

### 7 · Correlated failure ⭐

**Redundancy only helps if failures are independent** — and yours usually aren't.

| Shared thing | Correlates |
|---|---|
| ⭐ **The deploy pipeline** | A bad release hits every replica |
| ⭐ **Config / feature flags** | One bad flag, everywhere |
| A shared dependency (auth, config service) | Everything depends on it |
| Same AZ / rack / power | Infrastructure |
| Same certificate expiry | Everything at once |
| ⭐ **A deep health check** | Every instance fails simultaneously ([Phase 2 note 05](../../phase-02-stateless-scaling/notes/05-health-checks.md)) |

> ⭐ **Most outages come from CHANGE, not hardware.** Multi-AZ defends against the rarer cause. Pair it with
> canaries and fast rollback ([11](11-deployment-safety.md)) or you've defended the wrong flank.

### 8 · Gray failure ⭐

**Degraded but passing health checks.** You measured this in Phase 2: a hanging replica gave **0% errors, an
unchanged median, a green health check — and a p99 143× worse.**

**Mitigations:** ⭐ **alert on p99, not error rate or median** · latency-based outlier ejection · client-side
success-rate tracking · **measure from the client, not the server**.

### 9 · Autoscaling death spiral

New instances start cold → hammer the database → everything slows → autoscaler adds more
([Phase 2 note 09](../../phase-02-stateless-scaling/notes/09-autoscaling.md)).

**Mitigations:** slow start / warm-up · connection pooling proxy · ⭐ **load shedding instead of scaling into
the wall** · scale on leading indicators · max instance cap.

### 10 · Cold cache

Measured in Phase 5: `FLUSHALL` under load produced **271 errors and a 2 s p95** with nothing broken except
an empty cache.

> ⭐ **The shape: losing a PERFORMANCE component caused an AVAILABILITY failure**, because the database's
> capacity plan silently assumed a 95% hit rate.

**Mitigations:** warming before taking traffic · persistence for warm restarts · request coalescing ·
⭐ **capacity headroom — or an explicit decision that losing the cache is an outage.**

---

## ⭐ How to answer gate Q1

**Volunteer it. Don't wait to be asked.** After drawing any design, walk the diagram component by component:

```
For each box:  what happens when this DIES?  when it's SLOW?  when it's OVERLOADED?
For each arrow: what's the timeout? the retry policy? the fallback?
```

**The checklist to run out loud:**

| Component | Dies | Slow | Overloaded |
|---|---|---|---|
| **CDN** | Origin gets 100% of traffic, sized for 5% | Latency | — |
| **Load balancer** | Multi-AZ or nothing | — | — |
| **App instance** | LB routes around it (N-1 capacity) | ⭐ **Gray failure** — needs latency ejection | Load shed |
| ⭐ **Cache** | **Cold-cache outage** | Timeout → treat as a miss | Evictions ⇒ hit rate collapse |
| **DB primary** | Writes stop; failover; **split brain** | ⭐ **Cascades upstream** | Connection exhaustion |
| **DB replica** | Reads shift to primary | Stale reads | — |
| **Queue/broker** | Producers block or drop | Lag grows | Unbounded growth |
| **Any dependency** | Fail fast + fallback | ⭐ **The dangerous one** | Circuit breaker |
| ⭐ **DNS provider** | **Total outage** — use two | — | — |
| **Deploy pipeline** | ⭐ **Correlated across everything** | — | — |

**And the three answers most worth volunteering** because they're non-obvious:
1. ⭐ **The cold cache** — a performance component causing an availability failure
2. ⭐ **The slow dependency** — worse than a dead one
3. ⭐ **Correlated failure via deploys** — redundancy doesn't help

---

## In your own words

**Name all ten failure modes with one mitigation each, timed. Under 90 seconds.**

>

**Walk the cascade using your own lab numbers. Why is slow worse than down?**

>

**Cite the retry-storm measurement. Why did retries make it worse?**

>

**Define metastable failure. What's the diagnostic question, and the only fix?**

>

**Give four things that correlate "independent" replicas. Which is most common?**

>

**Run the failure checklist against a design you've drawn.**

>

---

## Links

- ⭐ **You measured the cascade and the retry storm** → [`../lab/`](../lab/) Part A
- Timeouts → [01](01-timeouts-and-deadlines.md) · Retries → [02](02-retries-and-budgets.md) · Breakers → [03](03-circuit-breakers.md)
- Bulkheads → [04](04-bulkheads-and-isolation.md) · Load shedding → [05](05-load-shedding.md)
- Gray failure, measured → [Phase 2 lab](../../phase-02-stateless-scaling/lab/)
- Cold cache, measured → [Phase 5 lab](../../phase-05-caching/lab/)
- Backpressure → [Phase 4 note 11](../../phase-04-distributed-systems/notes/11-backpressure-and-flow-control.md)
