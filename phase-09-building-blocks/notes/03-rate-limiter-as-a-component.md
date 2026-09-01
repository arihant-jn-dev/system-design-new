# 09·03 · The Rate Limiter, as a 10-Minute Component

> **Why this exists:** the roadmap says it plainly — *"from Phase 7 — **treat it as a component you can
> design in 10 minutes**."* You've already measured all four algorithms in [Phase 5](../../phase-05-caching/lab/).
> ⭐ **This note is a drill, not new material: it's the script.**

---

## Reference

### The algorithms — say the trade, not just the name

| Algorithm | State | Trade |
|---|---|---|
| **Fixed window** | one counter + window start | ⭐ **Cheapest. ⚠️ Boundary problem — you measured 20 through a 10-per-window limit** by straddling two windows |
| **Sliding log** | every timestamp (a sorted set) | ⭐ **Exact.** ⚠️ Memory ∝ requests; you measured it holding at exactly 10 |
| **Sliding window counter** | 2 counters + a weighted estimate | ⭐ **The practical default** — near-exact at fixed-window cost |
| ⭐ **Token bucket** | tokens + last-refill time | ⭐ **The usual answer**: O(1), tiny state, ⭐ **allows a configurable BURST** — which is what real traffic looks like |
| **Leaky bucket** | a queue | Smooths output to a constant rate; ⚠️ adds latency, hides burst info |

⭐ **Default to token bucket, and mention sliding-window-counter as the alternative when burst tolerance is
unwanted.**

### ⭐ The distributed question — this is what's actually being marked

| Approach | Accuracy | Cost |
|---|---|---|
| **Centralised (Redis)** | ⭐ exact | ⚠️ a round trip on every request; the limiter is now a dependency |
| **Local only** | ⚠️ **wrong by N×** (N instances each allow the full limit) | free |
| ⭐ **Local + periodic sync** | ⭐ **near-exact, and you can BOUND the error** | cheap |

> ⭐ **STATE THE OVERSHOOT BOUND, don't hand-wave:**
> **`instances × sync interval × per-instance rate`** — *"a few percent, which is irrelevant for a
> 1,000/min throttle."*
>
> ⭐ **And name when you'd pay for the round trip instead: when the limit is a PAID QUOTA.** Throttling
> tolerates error; **billing does not.**

### ⭐ The questions people forget

| | |
|---|---|
| ⭐ **What happens when the limiter is DOWN?** | **Fail open** (usually — don't let the limiter cause the outage) · **fail closed** for expensive/dangerous endpoints · ⭐ **or degrade to local-only limits**, which is the best answer |
| ⭐ **Where do you enforce?** | **As early as possible** — edge/CDN/gateway. Work you reject at the LB costs nothing; work you reject after auth + a DB call has already cost you |
| **On what dimension?** | user · API key · IP · tenant · endpoint · **and globally**. ⚠️ **IP breaks behind NAT/CGNAT** and punishes whole offices |
| ⭐ **The client contract** | `429` + **`Retry-After`** + `X-RateLimit-Limit/Remaining/Reset` ⭐ **on successful responses too**, so clients can self-throttle. ⚠️ Clients still need jitter or they retry in lockstep |
| ⭐ **`429` vs `503`** | *"**you** are over **your** limit"* vs *"**we** are overloaded"*. Different causes, different client behaviour |
| **Atomicity** | ⭐ read-modify-write across instances must be atomic — **a Lua script in Redis**, or `INCR`+`EXPIRE` carefully ordered |

### ⭐ The 10-minute script

> *"Token bucket, because it's O(1), needs two numbers per key, and gives me a tunable burst.*
>
> *State in Redis, updated by **a Lua script so the check-and-decrement is atomic**. Key is
> `rl:{dimension}:{id}`, with a TTL so idle keys evict themselves.*
>
> *⭐ At high volume I wouldn't take a Redis round trip per request — I'd hold local buckets and sync
> periodically. **The overshoot is bounded by instances × sync interval × rate**, a few percent, which is
> fine for a throttle. **If the limit were a paid quota I'd take the round trip**, because billing needs
> accuracy.*
>
> *Enforce at the gateway, before auth. Limit on several dimensions. Return `429` with `Retry-After` and
> limit headers on every response. ⭐ **If Redis is down I fail open to local limits** — the limiter must not
> become the outage.*
>
> *And I'd expose per-key rejection metrics, because ⭐ **the first sign of a bad integration is one key
> eating the whole limit.**"*

⭐ **That's ~90 seconds. The remaining 8 minutes are for whatever they push on.**

### Related components built the same way

**Quotas** (long-window, billing-accurate, needs durability) · **concurrency limiters** (in-flight count, not
rate — ⭐ *often the better control for protecting a dependency*, and it's just a bulkhead) · **load
shedding** (⭐ *you're overloaded*, not *they're over-limit*) · **backpressure**.

---

## In your own words

**Five algorithms, one line of trade-off each.**

>

**⭐ Which is your default, and why?**

>

**Cite your Phase 5 measurement of the fixed-window boundary problem.**

>

**⭐ State the distributed trade and the overshoot bound formula.**

>

**⭐ When would you pay for the round trip instead?**

>

**What happens when the limiter is down — three options, and your pick?**

>

**Why enforce early? What does IP-based limiting break?**

>

**⭐ `429` vs `503`. What headers, and why on successful responses too?**

>

**⭐ Now deliver the whole design out loud in 90 seconds.**

>

---

## Links

- ⭐ **You measured all of these** → [Phase 5 lab Part B](../../phase-05-caching/lab/)
- The full treatment → [Phase 7 note 07](../../phase-07-reliability/notes/07-rate-limiting.md)
- Concurrency limiting = bulkheads → [Phase 7 note 04](../../phase-07-reliability/notes/04-bulkheads-and-isolation.md)
- Shedding vs limiting → [Phase 7 note 05](../../phase-07-reliability/notes/05-load-shedding.md)
- Per-tenant limits → [Phase 8 note 10](../../phase-08-architecture/notes/10-multi-tenancy.md)
