# 11 · Timeouts, Retries, Backoff & Jitter

> **Why this exists:** introduced here, deepened in Phase 7. The roadmap's instruction is specific:
> understand **why jitter is mandatory**. Retries are the most common way engineers turn a small problem into
> an outage, and "we added retries" is a sentence that has caused a great many incidents.

---

## Reference

### Timeouts — every network call, always

**A call with no timeout is a resource leak with a delay fuse.** It holds a thread, a connection, and memory
until something else gives up — and under load, "something else" is your whole service.

**The types you must set separately:**

| Timeout | What it bounds | Typical |
|---|---|---|
| **Connect** | TCP (+TLS) establishment | 1–3 s (same DC: 100–500 ms) |
| **Read / socket** | Gap between bytes | Depends on the call |
| **Total / request** | **The whole operation.** The one people forget. | The one that matters |
| **Idle / keep-alive** | How long an unused pooled connection lives | 30–90 s |

**Setting only a read timeout is a classic bug:** a server dribbling one byte every 4 seconds never trips a
5-second read timeout and hangs forever. **Always set a total deadline.**

**How to pick the value — from data, not from a guess:**

> **Start at the dependency's p99, add headroom (~1.5–2×), then sanity-check against your own SLO.**
>
> Dependency p99 = 200 ms → timeout ≈ 300–400 ms.

- **Too long** → you hold resources through an outage; your latency becomes the dependency's latency; you
  cascade (Phase 0, note 03 — Little's Law)
- **Too short** → you fail requests that would have succeeded, and you *amplify* load by retrying work the
  server is still doing
- **The timeout must be shorter than your caller's timeout**, or you do work nobody is waiting for

**Deadline propagation** is the grown-up version: pass the remaining budget down each hop ("you have 120 ms
left"). gRPC has this built in. Without it, a service 4 hops deep happily spends 5 seconds on a request whose
client gave up 4 seconds ago — **pure wasted capacity during exactly the incident where you need it most.**

### Retries — and when NOT to

**Only retry when all three hold:**

1. **The operation is idempotent** (or you have an idempotency key — note 09)
2. **The error is transient** — timeout, connection refused, 503, 429, 502/504
3. **You have retry budget left** (see below)

**Never retry:**

| Error | Why |
|---|---|
| **4xx** (except 429) | The request is wrong. Retrying it identically will fail identically. |
| **Non-idempotent operations without a key** | You may double-charge |
| **Business-logic failures** | "Insufficient funds" won't change on retry |
| When the caller's deadline has passed | Nobody is listening |

**The counter-intuitive one: 429 and 503 should be retried, but only with `Retry-After` respected.** The
server is telling you it's overloaded; ignoring that and retrying immediately is how you finish the job of
taking it down.

### The retry storm — why naive retries cause outages

```
Service is at 100% capacity, starts timing out
  → every client retries          → load ×2  (or ×3 with 3 attempts)
  → service degrades further      → more timeouts
  → more retries                  → load ×4
  → service is now DOWN, and the retry traffic prevents it from ever recovering
```

**A service at 100% load that starts failing receives *more* traffic, not less.** This is a **metastable
failure**: even after the original trigger disappears, the retry load keeps the system down. Recovery often
requires shedding all traffic to let it drain.

**Retries multiply through layers — the killer detail:**

```
Client (3 attempts) → Gateway (3 attempts) → Service A (3 attempts) → Service B
                                                        = 27 requests to B for 1 user request
```

**Retry amplification is multiplicative across hops.** Three layers of "sensible" 3× retry policy is a 27×
load multiplier during an incident.

> **The rule: retry at ONE layer.** Usually the outermost one that knows the operation is idempotent — or the
> mesh/gateway, once, with everything below it set to zero retries. Then say so explicitly in your design.

### Backoff — and why jitter is mandatory

**Exponential backoff**: wait 1 s, 2 s, 4 s, 8 s… so a struggling service gets progressively more room.

**But exponential backoff alone is not enough**, and this is the part the roadmap wants you to nail:

```
A dependency blips. 10,000 clients fail at the same instant.
All back off exponentially and retry at exactly t+1s.
                                   → 10,000 simultaneous requests
All fail again. All retry at exactly t+3s.
                                   → 10,000 simultaneous requests
```

**Synchronised retries. Backoff spread them out in time but kept them in lockstep.** You've built a
distributed metronome pointed at your own service. This is a **thundering herd**, and it recurs at every
backoff interval.

**Jitter breaks the synchronisation by randomising the wait:**

| Strategy | Formula | Notes |
|---|---|---|
| No jitter | `base × 2^n` | ❌ Synchronised herds |
| **Full jitter** | `random(0, base × 2^n)` | ✅ **Best spread.** AWS's recommendation. |
| Equal jitter | `base × 2^n / 2 + random(0, base × 2^n / 2)` | Compromise: guarantees a minimum wait |
| Decorrelated jitter | `min(cap, random(base, prev × 3))` | Good for long-running retry loops |

**Full jitter is the default answer.** AWS's "Exponential Backoff and Jitter" article measured it and it wins
on both total work and completion time.

```python
delay = random.uniform(0, min(cap, base * (2 ** attempt)))
```

> **The gate-worthy sentence:** *"Exponential backoff without jitter just synchronises the herd — every client
> retries at the same instant, so you get repeated load spikes at 1s, 2s, 4s. Full jitter randomises across
> the whole interval, which spreads the load smoothly and is strictly better."*

**Jitter isn't only for retries.** Use it for cache TTLs (prevents mass simultaneous expiry — Phase 5), cron
schedules, health-check intervals, and reconnect delays after a deploy. **Any time N clients would otherwise
act in unison.**

### Retry budgets — the modern approach

Fixed "3 attempts" is a bad policy: it's 3× load precisely when the system can least afford it.

**A retry budget caps retries as a *fraction of total traffic*** — e.g. retries may not exceed 10% of
requests. Under normal conditions there's plenty of budget for the occasional blip; during an outage, when
everything is failing, the budget is exhausted immediately and **retries stop automatically**.

This is what gRPC, Envoy and Finagle implement, and it's the right answer to "how many retries?" —
> *"I wouldn't use a fixed count. I'd use a retry budget capped at ~10% of traffic, so retries help with
> isolated failures and switch themselves off during a widespread one."*

### The full resilience stack (previewing Phase 7)

Retries alone are dangerous. The complete set:

| Layer | Purpose |
|---|---|
| **Timeout** | Bound the wait. Non-negotiable. |
| **Retry + full jitter + budget** | Recover from transient failures without amplifying |
| **Circuit breaker** | After N failures, **stop calling entirely** for a while. Turns a slow failure into a fast one and lets the dependency recover. |
| **Bulkhead** | Isolate thread/connection pools per dependency so one slow dependency can't consume everything |
| **Load shedding** | Reject early when overloaded — better to fail 10% fast than 100% slow |
| **Fallback** | Serve stale, partial, or default |

**Circuit breaker + retries is the pairing to name.** Retries handle blips; the breaker handles outages. With
retries alone you hammer a dead service forever.

---

## In your own words

**Why is a call without a timeout a resource leak? Connect it to Little's Law.**

>

**How do you pick a timeout value? Why is "too short" also dangerous?**

>

**Walk through a retry storm, step by step, and explain why it's metastable.**

>

**Three services each retry 3×. How many requests reach the bottom for one user request? What's the rule?**

>

**Why is exponential backoff without jitter insufficient? Describe what actually happens on the wire.**

>

**Explain a retry budget and why it beats a fixed retry count.**

>

**Name three places OTHER than retries where you should add jitter.**

>

---

## Links

- Idempotency — the precondition for any retry → [09-idempotency.md](09-idempotency.md)
- `Retry-After` and the 429 contract → [10-api-design-mechanics.md](10-api-design-mechanics.md)
- Little's Law, the latency knee → [Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md)
- Circuit breakers, bulkheads, load shedding, cascading failure → **Phase 7**
- Cache stampede and TTL jitter → Phase 5
- AWS Builders' Library: *Timeouts, retries and backoff with jitter* — short, excellent, free
