# 07·05 · Load Shedding & Admission Control

> **Why this exists:** the honest answer to overload. Autoscaling is too slow, queues make it worse, and
> retries amplify it. **The only reliable response to more traffic than you can serve is to serve less of
> it — deliberately.**

---

## Reference

### The principle

> ⭐ **It is better to serve 70% of requests well than 100% of requests badly.**

**Under overload you have three choices, and only one is good:**

| Response | Result |
|---|---|
| **Queue it** | ⚠️ Latency grows without bound; you produce answers nobody is waiting for |
| **Try to serve everything** | ⚠️ Everything degrades; **you may enter a metastable state and not recover** |
| ⭐ **Shed the excess** | Some requests fail **fast**; the rest are served **normally** |

**And the arithmetic that makes it obvious** ([Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md)):
a 10,000-deep queue draining at 1,000/s means **every request waits 10 seconds** — long after every client
has timed out. **You are spending 100% of your capacity on work whose results will be discarded.**

### Where to shed — as early as possible

```
CDN / edge     -> volumetric, bot traffic          ⭐ cheapest -- costs you nothing
Load balancer  -> connection limits, queue caps
API gateway    -> rate limits, admission control   ⭐ the main layer
Service        -> concurrency limits, priority shedding
Database       -> connection limits, statement_timeout   (last resort)
```

⭐ **A request rejected at the edge costs nothing. One rejected after three service hops has already consumed
capacity across your whole stack** — which is why shedding late barely helps.

### ⭐ Prioritised shedding — the senior version

**Don't shed randomly. Shed what matters least.**

| Shed first | Protect |
|---|---|
| ⭐ **Retries** (mark them with a header) | First attempts |
| Bots, crawlers, scrapers | Real users |
| Anonymous traffic | Logged-in users |
| Analytics, tracking, recommendations | ⭐ **Checkout, payments, auth** |
| Batch/background work | Interactive requests |
| Free tier | Paying customers |
| Prefetch / speculative requests | Explicit user actions |

> ⭐ **Shedding retries first is the highest-leverage rule.** During overload retries are a large fraction of
> traffic and each one is duplicated work ([02](02-retries-and-budgets.md)). **Mark retries with a header at
> the client and drop them first** — you cut load without dropping a single new user request.

**And the framing that scores:** *"I'd shed the cheap traffic and keep checkout."* Prioritised shedding turns
overload from "the site is down" into "recommendations are missing" — **a product decision, made in advance.**

### How to decide you're overloaded

| Signal | Note |
|---|---|
| ⭐ **Concurrency / in-flight requests** | Little's Law — **the best single signal**; catches both more traffic and slower processing |
| ⭐ **Queue depth or wait time** | Direct measure of demand exceeding capacity |
| **Latency above a threshold** | Lagging, but real |
| CPU utilisation | ⚠️ Poor for I/O-bound services |
| **Rejection by a bulkhead** | Already shedding ([04](04-bulkheads-and-isolation.md)) |

⭐ **Adaptive concurrency limits** are the modern approach (Netflix `concurrency-limits`, TCP-Vegas-style):
**measure latency and adjust the concurrency limit automatically** — no magic number to tune, and it adapts
as your service changes. Worth naming.

### ⚠️ Shedding must be CHEAP

**If rejecting a request costs almost as much as serving it, you cannot shed your way out.**

- Reject **before** authentication, database lookups, deserialisation of large bodies
- **Return immediately** — no retries, no logging of every rejection (sample it)
- ⭐ **`503` + `Retry-After`**, not 429 — *we're* overloaded, not *you're* over your limit
- Make sure the client **backs off with jitter** rather than retrying instantly

⚠️ **And this is the trap: an expensive rejection path is how shedding fails.** If your 503 path still parses
the JSON body and hits the auth service, you've saved nothing.

### The relationship to other patterns

| | |
|---|---|
| **Rate limiting** ([07](07-rate-limiting.md)) | ⭐ **Per-client fairness** — "you've had your share." Proactive. `429`. |
| **Load shedding** | ⭐ **System-wide survival** — "we can't take more." Reactive. `503`. |
| **Bulkheads** | Bound how much one dependency consumes |
| **Backpressure** | Tell the *producer* to slow down ([Phase 4 note 11](../../phase-04-distributed-systems/notes/11-backpressure-and-flow-control.md)) |

**They're different tools:** rate limiting is fair even when you have capacity; shedding is unfair by design
because survival beats fairness. **You need both.**

### ⭐ Why shedding beats autoscaling under overload

| Autoscaling | Load shedding |
|---|---|
| ⚠️ **2–10 minutes** to add capacity | ⭐ **Immediate** |
| Cold instances hammer the database — **death spiral** ([Phase 2 note 09](../../phase-02-stateless-scaling/notes/09-autoscaling.md)) | No new load |
| May scale into a *different* bottleneck | Protects whatever the bottleneck is |
| Costs money | Free |

> ⭐ **The answer: "Shed first, then scale."** Shedding stabilises the system immediately; autoscaling
> restores capacity over minutes. **Relying on autoscaling alone to survive a spike means being down for the
> several minutes it takes to react** — and possibly entering a death spiral on the way.

### Graceful behaviour when shedding

- **Tell the client clearly**: `503` + `Retry-After` + a useful error body
- ⭐ **Shed a WHOLE request, not part of one** — half-completing work wastes capacity and may corrupt state
- ⭐ **Serve a degraded response instead of an error where possible** ([06](06-graceful-degradation.md)) —
  cached, partial, or default beats a 503
- **Alert on shed rate** — it means you're under-provisioned or under attack
- **Never shed health checks** (you'll be removed from the LB) or admin/recovery endpoints

⚠️ **"Never shed health checks" is a real trap** — an overload-triggered shed that catches your own health
endpoint removes every instance from rotation and turns degradation into a total outage.

---

## In your own words

**State the principle. Why is queueing worse than rejecting?**

>

**Why shed as early as possible?**

>

**Design a prioritised shedding policy for e-commerce at 3× traffic. What goes first, and why retries?**

>

**What's the best single overload signal, and why? What is adaptive concurrency?**

>

**Why must rejection be cheap? Give the failure mode.**

>

**Rate limiting vs load shedding — different purposes, different status codes.**

>

**Why "shed first, then scale"?**

>

---

## Links

- Little's Law → [Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md)
- Bulkheads → [04-bulkheads-and-isolation.md](04-bulkheads-and-isolation.md)
- Rate limiting → [07-rate-limiting.md](07-rate-limiting.md)
- Degradation → [06-graceful-degradation.md](06-graceful-degradation.md)
- Metastable failure → [08-failure-modes.md](08-failure-modes.md)
- Backpressure → [Phase 4 note 11](../../phase-04-distributed-systems/notes/11-backpressure-and-flow-control.md)
- **Google SRE Book ch. 21–22, "Handling Overload" / "Addressing Cascading Failures"**
