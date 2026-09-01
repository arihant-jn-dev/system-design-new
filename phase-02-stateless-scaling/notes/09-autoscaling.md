# 09 · Autoscaling

> **Why this exists:** the roadmap flags one specific thing — *"why autoscaling can **worsen** an overload."*
> That's the non-obvious part, and it's a favourite follow-up because the intuitive answer ("add capacity") is
> exactly what makes it worse.

---

## Reference

### The three triggers

| Type | Trigger | Good for | Weakness |
|---|---|---|---|
| **Reactive** | Metric crosses a threshold (CPU > 70%, QPS, queue depth) | General purpose, the default | **Always late** — it reacts after users are already suffering |
| **Scheduled** | Time of day / known events | Predictable diurnal traffic, sales, market open | Blind to surprises |
| **Predictive** | Forecast from history / ML | Large, regular patterns | Complex; wrong exactly when the pattern breaks |

**Best practice is to combine them:** scheduled as the baseline (you *know* traffic triples at 9 a.m.),
reactive on top for surprises.

### Choosing the metric — this matters more than the algorithm

| Metric | Good? | Notes |
|---|---|---|
| **CPU utilisation** | ➖ The default, often wrong | Useless for I/O-bound services that sit at 20% CPU while saturating their thread pool |
| **Memory** | ➖ | Usually indicates a leak, not load. Scaling out won't fix it. |
| **Request rate (QPS)** | ✅ Good | Direct, leading indicator |
| **Concurrency / in-flight requests** | ✅ **Best for services** | Little's Law says this *is* load: `L = λ × W`. Captures both arrival rate and slowdown. |
| **Queue depth / consumer lag** | ✅ **Best for workers** | Directly measures "we're falling behind" |
| **p99 latency** | ⚠️ Careful | A *lagging* indicator — by the time it moves, users already suffered. And it rises for reasons scaling can't fix. |

> **Concurrency is the underrated answer for request-serving tiers.** From
> [Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md): concurrency = throughput ×
> latency. If either rises, concurrency rises — so one metric catches both "more traffic" and "everything got
> slower." Saying that in an interview is a strong signal.

### Why autoscaling can make an overload WORSE

**Four distinct mechanisms.** Knowing more than one is the differentiator.

**1 · Cold instances are slow instances (and the death spiral)**

```
Traffic spike → CPU rises → autoscaler adds instances
  → new instances start with: cold JIT, empty connection pools, EMPTY LOCAL CACHE
  → their cache hit rate is ~0%, so every request goes to the DATABASE
  → database load spikes from the new instances
  → the database slows down
  → ALL instances (old and new) get slower
  → CPU/latency rises further
  → autoscaler adds MORE instances
  → more cold caches, more database load
  → the database falls over
```

**Adding capacity made it worse, because the new capacity's first act was to hammer the shared bottleneck.**
This is the **death spiral**, and it's the answer the question is looking for.

**2 · You scale into a different bottleneck**

The stateless tier scales; the database does not. 10× the app instances = 10× the **connections** to a
database whose connection limit was already the constraint. You've turned a slow service into a dead database.

> **Connection pool exhaustion is the classic version.** 100 instances × 20 pool connections = 2,000
> connections to a Postgres configured for 500. **This is why pgbouncer exists** (Phase 3A).

**3 · Scaling is too slow to matter**

```
Provision + boot + JIT warm + cache fill + LB registration = 2-10 minutes
Your traffic spike lasted 90 seconds.
```

You scaled up in time to serve traffic that already left — then scaled back down and paid for nothing.
**Reactive autoscaling cannot handle spikes shorter than its own reaction time.**

**4 · Scaling down cuts live requests**

Terminating an instance without draining (note 06) turns cost savings into 5xx errors. Aggressive
scale-in policies cause user-visible errors on a *quiet* system — a particularly annoying way to break.

> **Compressed answer:** *"Autoscaling can make overload worse because new instances start cold — empty
> caches and connection pools — so their first act is to hammer the shared database, which slows everyone
> down, which triggers more scaling. That's a death spiral. And it's often solving the wrong problem: if the
> bottleneck is the database, adding app instances just adds connections to a database that's already the
> constraint. The mitigations are load shedding so you fail fast instead of scaling into the wall, slow-start
> ramping so cold instances warm up before taking full load, and enough headroom that you're not depending on
> a 5-minute reaction to a 90-second spike."*

### Mitigations

| Mitigation | What it fixes |
|---|---|
| **Headroom (run at 60–70%)** | You're on the flat part of the latency curve; scaling is a convenience, not a rescue |
| **Warm pools / pre-provisioned instances** | Removes boot time from the critical path |
| **Slow start / gradual ramp** | Cold instances warm before taking full load — **directly fixes mechanism 1** |
| **Load shedding** | Reject excess *fast* instead of queueing. **The real answer to overload** — Phase 7. |
| **Scale on leading indicators** | Queue depth and concurrency move before latency does |
| **Connection pooling proxy** (pgbouncer) | Decouples app instance count from DB connection count — fixes mechanism 2 |
| **Scale-out fast, scale-in slow** | Asymmetric cooldowns. Add quickly, remove cautiously. |
| **Max instance cap** | Stops a runaway loop from bankrupting you or killing the database |
| **Graceful shutdown + draining** | Fixes mechanism 4 |

> **"Scale out aggressively, scale in conservatively"** is the standard asymmetry, and worth saying: the cost
> of being slightly over-provisioned is money; the cost of being under-provisioned is an outage.

### Scale up vs scale out

Same as [Phase 0 note 09](../../phase-00-foundations/notes/09-scalability-and-elasticity.md), but note that
**vertical scaling usually requires a restart** — so it can't be part of a fast reactive loop. Vertical is a
capacity *planning* decision; horizontal is a runtime one.

### Kubernetes specifics (commonly asked)

| Autoscaler | Scales | Notes |
|---|---|---|
| **HPA** (Horizontal Pod) | Pod count, on CPU/memory/custom metrics | The common one. Use custom metrics (QPS, queue depth) rather than CPU where you can. |
| **VPA** (Vertical Pod) | Pod CPU/memory requests | **Conflicts with HPA on the same metric.** Needs a pod restart. |
| **Cluster Autoscaler** | **Node** count | The layer below. Pods can be `Pending` while nodes provision — that's a second, slower delay stacked on the first. |
| **KEDA** | Pods on event sources (Kafka lag, queue depth) | **The right tool for workers** |

> **The two-layer delay is worth naming:** HPA adds a pod → no node has capacity → Cluster Autoscaler adds a
> node → 2–5 minutes for the node, *then* pod start, *then* warm-up. Your effective reaction time is the sum,
> not the pod start time.

### Cost angle

Autoscaling exists to **save money**, so the cost math is the point:

- **Scaling down is where the savings are**, and it's the part most implementations do badly (or disable
  after an incident)
- **Spot/preemptible instances** are ~70% cheaper and only viable because the tier is stateless (note 01) —
  a strong combination to mention
- **Over-provisioning is often cheaper than the engineering time** to tune autoscaling properly. For a small
  service, just running 3 instances at 30% is fine. **Say this** — knowing when *not* to build something is
  a senior signal.

---

## In your own words

**Explain the autoscaling death spiral, step by step, in your own words.**

>

**Give a second, completely different mechanism by which autoscaling worsens an overload.**

>

**Why is concurrency a better autoscaling metric than CPU? Connect it to Little's Law.**

>

**Your spike lasts 90 seconds and instances take 4 minutes to warm. What actually helps?**

>

**Why "scale out fast, scale in slow"?**

>

**100 app instances × 20 connections each against a Postgres allowing 500. What breaks, and what's the fix?**

>

**When is autoscaling not worth implementing at all?**

>

---

## Links

- Elasticity, the scaling ladder → [Phase 0 note 09](../../phase-00-foundations/notes/09-scalability-and-elasticity.md)
- Little's Law and the latency knee → [Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md)
- Slow start and draining → [06-lb-operations-and-types.md](06-lb-operations-and-types.md)
- Statelessness as the precondition for spot instances → [01-stateless-vs-stateful.md](01-stateless-vs-stateful.md)
- Cold cache after restart → Phase 5
- **Load shedding, metastable failure, the real answer to overload** → Phase 7
- Connection pooling / pgbouncer → Phase 3A
