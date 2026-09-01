# 07·03 · Circuit Breakers

> **Why this exists:** the pattern that turned your lab from **25% success into 100% success** while
> *reducing* load on the struggling dependency by 4.5×. It's the difference between "we retry" and "we know
> when to stop."

---

## Reference

### The three states

```
        failures >= threshold
CLOSED ──────────────────────▶ OPEN
  ▲                              │  cooldown elapsed
  │                              ▼
  └────── probes succeed ──── HALF-OPEN
             ▲                    │
             └── any probe fails ─┘
```

| State | Behaviour |
|---|---|
| **Closed** | Normal. Requests flow; failures are counted. |
| ⭐ **Open** | ⭐ **Fail FAST — don't call the dependency at all.** Return a fallback or an error immediately. |
| **Half-open** | After a cooldown, let **a few probes** through to test recovery. Success → closed. **One failure → straight back to open.** |

### ⭐ Why "open" is the whole point

**The breaker's value isn't detecting failure — it's *not calling*.**

| Benefit | |
|---|---|
| ⭐ **You stop consuming your own capacity** waiting on something known to be broken |
| ⭐ **The dependency gets breathing room to recover** — you stop adding load to a struggling system |
| **Users get an instant answer** (a fallback) instead of a slow error |
| **Recovery is automatic** via half-open probes — no human, no restart |

> ⭐ **Without a breaker, a struggling dependency receives MORE traffic as it degrades** (retries), which is
> exactly the metastable failure from [08](08-failure-modes.md). **The breaker is what lets the system
> recover on its own.**

### What you measured

| Mode | Success | p99 | Dependency calls |
|---|---|---|---|
| timeout only | 25.7% | 154 ms | 5,601 |
| + retry | 25.0% | 571 ms | ⚠️ **7,405** |
| ⭐ **+ breaker + fallback** | ⭐ **100%** | 152 ms | ⭐ **1,655** |

> ⭐ **100% success with 4.5× LESS load on the dependency.** That's the result to remember: the breaker
> simultaneously made the user experience better *and* the dependency's situation better. Almost nothing
> else in reliability engineering does both.

**How:** after 10 consecutive failures the breaker opened; from then on the app served **4,182 fallback
responses** without calling the dependency at all.

### Tuning

| Knob | Guidance |
|---|---|
| **Failure threshold** | ⭐ Prefer a **failure *rate* over a window** (e.g. >50% of 20 requests) to a raw consecutive count — a low-traffic service can take minutes to hit "10 consecutive" |
| **Minimum throughput** | Don't trip on 2 requests. Require a sample size (e.g. ≥20 in the window) or you'll flap. |
| **Cooldown / open duration** | Long enough for real recovery (5–60 s). Too short = flapping; too long = slow recovery. |
| **Half-open probes** | A handful. **Not full traffic** — that re-kills a recovering dependency. |
| **What counts as a failure?** | ⭐ Timeouts and 5xx: **yes.** 4xx: **no** — a client error isn't the dependency being unhealthy. Getting this wrong trips the breaker on your own bad requests. |

⚠️ **Scope the breaker correctly: one breaker PER DEPENDENCY (and often per endpoint).** A single global
breaker means one failing dependency stops calls to healthy ones — you've built a correlated failure.

### ⭐ A breaker without a fallback is just a faster error

**This is the point people miss.** Opening the breaker converts a slow failure into a fast one — genuinely
useful, because you stop consuming capacity. **But the user still gets an error.**

**The breaker's value is fully realised only with graceful degradation** ([06](06-graceful-degradation.md)):

| While open, serve | Example |
|---|---|
| ⭐ **Stale cached data** | Yesterday's recommendations |
| **A sensible default** | "Popular items" instead of personalised ones |
| **A partial response** | The page without the reviews section |
| **A queued acknowledgement** | "We'll process this shortly" |
| Only then: an error | If nothing else is possible |

**In the lab, `fallback` was returned 4,182 times — that's why success was 100% rather than 25%.**

### Where breakers live

| Layer | |
|---|---|
| **In the client library** | Resilience4j, Polly, Hystrix (retired), gobreaker |
| ⭐ **In the service mesh / sidecar** | Envoy outlier detection — **policy for every language, no code** ([Phase 2 note 07](../../phase-02-stateless-scaling/notes/07-proxy-gateway-mesh.md)) |
| **At the load balancer** | Outlier ejection ([Phase 2 note 06](../../phase-02-stateless-scaling/notes/06-lb-operations-and-types.md)) |

> **Envoy's *outlier detection* is a per-host breaker** — it ejects an individual bad instance. **A
> client-side breaker is per-dependency** — it stops calling the service entirely. **You want both**: eject
> one sick replica, and stop calling a service that's wholly down.

### Observability

- **Breaker state as a metric** (0/1/2 per dependency) — ⭐ **alert on it; an open breaker is an incident**
- Trip and reset counts
- Fallback rate — ⭐ **you're "up" but degraded, and someone should know**
- **Time spent open**

⚠️ **A breaker that's been open for an hour and nobody noticed means you've been serving degraded responses
all morning.** Success rate looked fine — that's the trap.

---

## In your own words

**Draw the state machine. What happens on a single failure in half-open, and why so strict?**

>

**Why is "open" the valuable state? Give two beneficiaries.**

>

**Cite your lab numbers. How did it improve BOTH success rate and dependency load?**

>

**Why prefer a failure rate over a consecutive count?**

>

**Should 4xx count as a failure? Why not?**

>

**Why is a breaker without a fallback only half the pattern?**

>

**Why alert on breaker state and fallback rate, even when success rate looks fine?**

>

---

## Links

- ⭐ **You measured this** → [`../lab/`](../lab/) Part A case 4
- Timeouts (the prerequisite) → [01-timeouts-and-deadlines.md](01-timeouts-and-deadlines.md)
- Retries — dangerous without a breaker → [02-retries-and-budgets.md](02-retries-and-budgets.md)
- ⭐ **Fallbacks — what makes the breaker useful** → [06-graceful-degradation.md](06-graceful-degradation.md)
- Metastable failure → [08-failure-modes.md](08-failure-modes.md)
- Outlier ejection → [Phase 2 note 06](../../phase-02-stateless-scaling/notes/06-lb-operations-and-types.md)
- **Michael Nygard, *Release It!*** — the origin of the pattern
