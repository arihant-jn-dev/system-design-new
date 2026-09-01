# 07·07 · Rate Limiting

> **Why this exists:** gate Q2 — *"design a distributed rate limiter and defend the accuracy/latency
> tradeoff."* The roadmap flags this as **a standalone interview question**. You built three algorithms in
> Phase 5; this note is the distributed and product side.

---

## Reference

### The algorithms — recap with your measurements

| Algorithm | Accuracy | Memory/key | Bursts | Cost |
|---|---|---|---|---|
| **Fixed window** | ❌ **2× at the boundary** | O(1) | At edges | 1 `INCR` |
| **Sliding window log** | ✅ Exact | ⚠️ **O(requests)** | None | ZSET ops |
| **Sliding window counter** | ~Approximate (weighted) | O(1) | Smoothed | 2 counters |
| ⭐ **Token bucket** | ✅ Good | O(1) | ⭐ **Tunable** | 1 Lua call |
| **Leaky bucket** | ✅ Good | O(1) | None — smooths output | Queue |

**Your Phase 5 measurements:** fixed window let **20 through a 10-per-window limit** by straddling the
boundary; sliding window held at exactly 10; token bucket burst to 10 then refilled at 5/s.

> ⭐ **Token bucket is the usual production answer** — O(1) memory, one round trip, and burst behaviour you
> can tune. **A user clicking 10 things quickly is normal; sustaining 10/s forever is not**, and only token
> bucket expresses that distinction naturally.

**Sliding window counter** is worth knowing as the pragmatic middle: weight the previous window by how far
into the current one you are — `count = prev × (1 − elapsed%) + current`. **O(1) memory, no boundary
exploit, slight approximation.** Cloudflare's published approach.

### ⭐ Distributed rate limiting — the gate question

**The problem:** you have 50 API gateway instances. A limit of "1,000 req/min per user" must hold **across all
of them.**

| Approach | Accuracy | Latency | Failure behaviour |
|---|---|---|---|
| ⭐ **Centralised counter** (Redis) | ✅ **Exact** | ⚠️ **+1 RTT (~0.5–1 ms) per request** | Redis down = ? (fail open or closed) |
| **Local only** (limit ÷ N per instance) | ❌ **Wrong** — uneven load makes real limits arbitrary | ✅ **Zero** | Perfect |
| ⭐ **Local + periodic sync** | ~Approximate; overshoots by up to (N × sync window) | ✅ **Zero on the hot path** | Degrades gracefully |
| **Sticky routing per user** | Exact per user | Zero extra | Rebalancing breaks it |
| **Two-tier** | Local fast path + central truth | Low | Good |

**The trade, stated:**

> ⭐ *"Centralised is exact but adds a network round trip to every request and makes Redis a hard dependency
> on the hot path. Local-only is free but wrong — with uneven load balancing, `limit/N` per instance means
> the effective limit is arbitrary. **I'd use local counters synced to Redis every second: the hot path stays
> local, and the worst-case overshoot is bounded by (instances × sync interval × per-instance rate). For a
> 1,000/min limit an overshoot of a few percent is irrelevant — but if the limit is protecting something
> where exactness matters, like a paid quota, I'd take the round trip and be exact."*

**The bounded-overshoot argument is the key move**: don't say "approximate," say **how approximate**, and
then say whether that matters for this specific limit.

### ⚠️ What happens when the rate limiter is down?

**A question people forget, and it's a real design decision:**

| Choice | Meaning |
|---|---|
| ⭐ **Fail open** (allow) | Availability over protection. **Usually right** — a rate limiter shouldn't take down the API it protects. |
| **Fail closed** (deny) | Protection over availability. Right when the limit protects something expensive or abusable. |
| **Fall back to local limits** | ⭐ **The best of both** — degrade to approximate rather than to nothing |

> **Say which you'd choose and why.** *"Fail open, because the limiter exists to protect against abuse, and
> turning a Redis blip into a full API outage is a worse failure than briefly allowing excess traffic — with
> the exception of endpoints where excess traffic costs real money, which fail closed."*

### Where to enforce

```
CDN/edge      -> volumetric, per-IP, DDoS               (cheapest -- rejects before it costs you anything)
API gateway   -> ⭐ per API key / per user / per plan     (the main layer)
Service       -> per-tenant, per-expensive-operation
Database      -> connection limits, statement timeout   (last resort)
```

⭐ **Reject as early as possible.** A request rejected at the edge costs nothing; one rejected after three
service hops has already consumed capacity across your whole stack.

**And limit on multiple dimensions** — per user, per IP, per API key, per endpoint, and globally.
A per-user limit doesn't stop 10,000 users hitting one expensive endpoint simultaneously.

### The client contract

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 30
RateLimit-Limit: 1000
RateLimit-Remaining: 0
RateLimit-Reset: 1735689600
```

| Rule | |
|---|---|
| ⭐ **`Retry-After` is mandatory on 429** | It converts a retry storm into an orderly queue |
| **Return limit headers on SUCCESS too** | So clients self-throttle *before* hitting the wall |
| ⚠️ **Clients must still add jitter** | Tell 10,000 clients "retry in 30s" and they all return at the same instant ([Phase 1 note 11](../../phase-01-networking/notes/11-timeouts-retries-backoff.md)) |
| **429 vs 503** | 429 = *you* are over your limit. 503 = *we* are overloaded ([05](05-load-shedding.md)). Different meanings; don't conflate. |

### Quotas vs throttling — a distinction worth making

| | **Throttling** | **Quota** |
|---|---|---|
| Window | Short (per second/minute) | Long (per month) |
| Purpose | Protect the system | **Commercial** — enforce the plan |
| Exceed | 429, retry shortly | 402/403, upgrade your plan |
| Enforcement | Real-time, approximate is fine | ⭐ **Must be accurate — it's billing** |

**A monthly quota is a billing artefact and needs to be exact.** Per-second throttling protecting your
database does not. **Different accuracy requirements for different purposes** — that's the nuance.

### Designing one — the checklist

- [ ] **What's the limit protecting?** Your system (throttling) or your revenue (quota)?
- [ ] **What's the key?** user / API key / IP / tenant / endpoint — usually several
- [ ] **Algorithm?** ⭐ Token bucket by default
- [ ] **Where enforced?** As early as possible
- [ ] ⭐ **Distributed strategy?** Local + sync, with the overshoot bound stated
- [ ] ⭐ **Failure mode?** Fail open, closed, or degrade to local
- [ ] **Client contract?** 429 + `Retry-After` + limit headers
- [ ] **Exemptions?** Internal traffic, health checks, allowlisted partners
- [ ] **Observability?** Rate of 429s per key — ⭐ **a spike is either an attack or a broken client, and you
      want to know which**

⚠️ **The IP-based caveat:** rate limiting by IP breaks behind corporate NAT and carrier-grade mobile NAT,
where thousands of users share one address. **Use it as a coarse DDoS defence, not as a per-user limit.**

---

## In your own words

**Name the five algorithms with their trades. Which do you ship, and why?**

>

**Explain why local-only limiting is "free but wrong."**

>

**State the distributed trade, including the bounded-overshoot argument.**

>

**What happens when the rate limiter itself is down? Give your choice and the exception.**

>

**Why enforce as early as possible? Why limit on several dimensions?**

>

**Quotas vs throttling — why do they have different accuracy requirements?**

>

**Design a limiter for a public API with free and paid tiers. Run the checklist.**

>

---

## Links

- ⭐ **You built three of these** → [Phase 5 lab](../../phase-05-caching/lab/) Part B
- Redis sorted sets and Lua → [Phase 5 note 08](../../phase-05-caching/notes/08-redis-beyond-caching.md)
- 429 / `Retry-After` contract → [Phase 1 note 10](../../phase-01-networking/notes/10-api-design-mechanics.md)
- Load shedding (503, not 429) → [05-load-shedding.md](05-load-shedding.md)
- Where to enforce → [Phase 2 note 07](../../phase-02-stateless-scaling/notes/07-proxy-gateway-mesh.md)
