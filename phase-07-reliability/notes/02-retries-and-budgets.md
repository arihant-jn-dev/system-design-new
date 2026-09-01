# 07·02 · Retries, Backoff & Budgets

> **Why this exists:** you **measured retries making things worse** — dependency calls went 5,601 → 7,405
> while the success rate went *down*. Retries are the most common way engineers turn a small problem into an
> outage.

---

## Reference

### ⭐ Retry only when all three hold

1. **The operation is idempotent** (or has an idempotency key — [3b-05](../../phase-03-databases/notes/3b-05-idempotency-at-the-db-layer.md))
2. **The failure is transient** — timeout, connection refused, 503, 502, 429
3. **You have retry budget left**

**Never retry:**

| Error | Why |
|---|---|
| **4xx** (except 429) | The request is wrong. It will fail identically. |
| **Non-idempotent ops without a key** | You may double-charge |
| **Business failures** ("insufficient funds") | Won't change |
| **When the deadline has passed** | Nobody is listening ([01](01-timeouts-and-deadlines.md)) |
| ⭐ **When the failure is SYSTEMIC** | See below — the lab result |

### ⭐ The measurement that matters

| Mode | Success | Dependency calls |
|---|---|---|
| timeout only | 25.7% | 5,601 |
| **+ retry** | **25.0%** ⬇ | **7,405** ⬆ |

> ⭐ **Retrying a dependency that is slow FOR EVERYONE cannot help — the next attempt is just as slow.** You
> multiplied load by 1.3× on a struggling system and the success rate went *down*.
>
> **Retries are for transient, INDEPENDENT failures.** During a systemic failure they are actively harmful.
> This is why retries and circuit breakers ship together: the breaker is what tells retries to stop.

### The retry storm, and multiplication across layers

```
service at capacity starts timing out
  -> every client retries        -> load x2 (or x3)
  -> degrades further            -> more timeouts
  -> more retries                -> load x4
  -> DOWN, and the retry traffic prevents recovery   ⭐ metastable
```

**And it multiplies through the stack:**
```
client (3) -> gateway (3) -> service A (3) -> service B
                = 27 requests to B for ONE user request
```

> ⭐ **Retry at ONE layer only** — usually the outermost that knows the operation is idempotent, or the
> mesh/gateway. **Set everything below it to zero retries, and say so explicitly in your design.**

### Backoff and jitter

**Exponential backoff alone is not enough:**
```
10,000 clients fail at the same instant.
All back off exponentially and retry at exactly t+1s -> 10,000 simultaneous requests
All fail. All retry at exactly t+3s               -> 10,000 simultaneous requests
```
**Backoff spread them in time but kept them in lockstep** — a distributed metronome pointed at your service.

| Strategy | Formula |
|---|---|
| No jitter | `base × 2^n` ❌ synchronised herds |
| ⭐ **Full jitter** | `random(0, base × 2^n)` — **AWS's recommendation and the default answer** |
| Equal jitter | `base × 2^n / 2 + random(0, base × 2^n / 2)` |
| Decorrelated | `min(cap, random(base, prev × 3))` |

```python
delay = random.uniform(0, min(cap, base * (2 ** attempt)))
```

⚠️ **But note what jitter does and doesn't do: it SPREADS load, it doesn't REDUCE it.** In the lab, full
jitter was already enabled in the retry case and the dependency still received 32% more calls. **Jitter
prevents spikes; only a breaker or a budget prevents amplification.**

### ⭐ Retry budgets — the modern answer

**A fixed "3 attempts" is a bad policy: it's 3× load precisely when the system can least afford it.**

**A retry budget caps retries as a fraction of total traffic** — e.g. retries may not exceed **10%** of
requests.

```
normal operation  -> occasional failures, plenty of budget, retries help
systemic failure  -> everything failing, budget exhausted instantly
                  -> ⭐ RETRIES STOP AUTOMATICALLY
```

**Implemented by gRPC, Envoy and Finagle.** The answer to "how many retries?":

> ⭐ *"I wouldn't use a fixed count. I'd use a retry budget capped at about 10% of traffic, so retries help
> with isolated failures and switch themselves off during a widespread one — which is exactly the case where
> a fixed count makes things worse."*

### Retry amplification checklist

- [ ] ⭐ **Retries at ONE layer only**
- [ ] **Retry budget**, not a fixed count
- [ ] **Full jitter** always
- [ ] ⭐ **Circuit breaker** to stop retrying into a systemic failure
- [ ] **Only idempotent operations** (or an idempotency key)
- [ ] **Respect `Retry-After`** on 429/503
- [ ] **Cap total time**, not just attempts — 3 × 300 ms is a 900 ms+ operation
- [ ] ⭐ **Alert on retry rate** — a rising retry rate is the earliest signal of trouble, well before errors

**That last one is underrated:** retries succeed, so the error rate stays flat while retry rate climbs.
**Retry rate is a leading indicator; error rate is a lagging one.**

---

## In your own words

**State the three conditions for retrying, and five cases where you must not.**

>

**Cite your lab numbers. Why did retries make it worse?**

>

**Walk the retry storm. Why is it metastable?**

>

**3 layers × 3 attempts — how many requests reach the bottom? What's the rule?**

>

**Why is exponential backoff insufficient? What does jitter fix, and what does it NOT fix?**

>

**Explain a retry budget and why it beats a fixed count.**

>

**Why is retry rate a leading indicator?**

>

---

## Links

- ⭐ **You measured the retry storm** → [`../lab/`](../lab/) Part A case 3
- Timeouts → [01-timeouts-and-deadlines.md](01-timeouts-and-deadlines.md)
- ⭐ **Circuit breakers — what stops the amplification** → [03-circuit-breakers.md](03-circuit-breakers.md)
- Idempotency → [3b-05](../../phase-03-databases/notes/3b-05-idempotency-at-the-db-layer.md)
- Metastable failure → [08-failure-modes.md](08-failure-modes.md)
- The Phase 1 introduction → [Phase 1 note 11](../../phase-01-networking/notes/11-timeouts-retries-backoff.md)
