# 07·06 · Graceful Degradation

> **Why this exists:** what turned the lab from **25% success into 100% success**. Every other resilience
> pattern makes failure *faster and more contained*. **Degradation is the only one that keeps the product
> working.**

---

## Reference

### The idea

**When something fails, serve something WORSE rather than nothing.**

```
❌ recommendations service down  ->  the whole product page 500s
✅ recommendations service down  ->  the page renders with "Popular items"
```

> ⭐ **The user's experience is degraded, not broken.** And most users won't notice — nobody knows the
> recommendations they didn't get.

### ⭐ The degradation ladder

**In order of preference:**

| # | Serve | Example |
|---|---|---|
| 1 | ⭐ **Stale cached data** | Yesterday's prices, last known inventory |
| 2 | **A cheaper computation** | Popular items instead of personalised ranking |
| 3 | **A static default** | A generic banner instead of a targeted one |
| 4 | ⭐ **A partial response** | The page without the reviews section |
| 5 | **Queue it and acknowledge** | "We've received your request; we'll email you" |
| 6 | **Reduce fidelity** | Lower-resolution images, fewer results |
| 7 | Only now: an error | And make it a *good* error |

**Rows 1 and 4 carry the most weight.** "Serve stale" is nearly always available if you cached anything, and
"partial response" is what makes a page with 8 sections survive one of them failing.

### ⭐ Critical vs non-critical — decide in advance

**The design work is classifying every dependency BEFORE the incident:**

| Critical — fail the request | Non-critical — degrade |
|---|---|
| Authentication | Recommendations |
| Payment authorisation | "Customers also bought" |
| Inventory check (at checkout) | Review counts |
| Order write | Personalisation |
| Fraud check (for a large order) | Analytics / tracking |

> ⭐ **The rule: if a dependency is non-critical, its failure must NEVER fail the request.** That has to be a
> deliberate, coded decision — a `try/catch` with a fallback around each optional call — because the default
> behaviour of an exception is to fail everything.
>
> **This is the single most valuable thing in the note:** most outages where "the recommendations service took
> down checkout" are just a missing try/catch.

**And it should be visible in the design:** when you draw a diagram, mark each arrow **critical** or
**optional**. Doing that unprompted is a strong signal.

### Feature flags and kill switches

⭐ **A kill switch is degradation you can trigger manually, instantly, without a deploy.**

| Use | |
|---|---|
| Disable an expensive feature under load | Turn off personalisation during a spike |
| Disable a broken integration | A partner API is failing |
| Shed a whole feature | Turn off search suggestions |
| ⭐ **Reduce fidelity globally** | Serve smaller images, fewer results |

**Requirements:** changeable **without a deploy** (seconds, not minutes) · **default-safe** if the flag store
is unavailable · **audited** · ⭐ **tested** — an untested kill switch is a hypothesis.

⚠️ **And the flag store must not become a SPOF**: cache flag values locally with a safe default, or an outage
in your config service takes down everything.

### Degradation in practice

| System | Degraded mode |
|---|---|
| **Product page** | Cached prices, no personalisation, no live stock |
| **Search** | Simpler ranking, cached popular queries, fewer facets |
| **Feed** | Chronological instead of ranked; cached page |
| **Checkout** | ⭐ **Rarely degradable — this is what you protect by degrading everything else** |
| **Notifications** | Queue and send later |
| **Analytics** | Drop samples (sampling *is* degradation) |

### ⭐ What you measured

| Mode | Success | Fallbacks served |
|---|---|---|
| timeout + retry | 25.0% | 0 |
| **+ breaker + fallback** | ⭐ **100%** | **4,182** |

> **The breaker stopped the calls; the FALLBACK is what made the user experience acceptable.** Without it,
> the breaker would have converted slow errors into fast errors — real progress for system stability,
> **but still 100% errors for users.**
>
> ⭐ **A circuit breaker without a fallback is only half the pattern.**

### Making degradation visible

- ⭐ **A `degraded: true` flag in the response** — so clients and dashboards know (the lab does this)
- **Metrics on fallback rate per dependency** — ⭐ **alert on it**
- **Log which fallback fired and why**
- **Tell the user when it matters**: "Live inventory unavailable — showing last known"

⚠️ **The trap: silent degradation.** If you serve stale data for six hours and nobody notices, you have a
correctness problem you can't see. **Your success rate looks perfect — that's exactly why fallback rate must
be its own alert.**

### The honest limits

**Not everything can degrade:**
- **Payments** — you cannot "approximately" charge someone
- **Inventory at checkout** — overselling is a real cost
- **Auth** — you cannot degrade to "probably logged in"

⭐ **For these, the correct degradation is to fail cleanly and fast with a good error** — and to have
protected them by degrading everything else first.

---

## In your own words

**State the idea in one sentence, and give the ladder in order.**

>

**Classify five dependencies of a system you know as critical or non-critical.**

>

**What's the coded rule for a non-critical dependency, and what's the default behaviour without it?**

>

**What's a kill switch, and what must be true of the flag store?**

>

**Cite your lab numbers. Why is a breaker without a fallback only half the pattern?**

>

**What's the trap of silent degradation, and what do you alert on?**

>

**Name three things that cannot degrade. What's the right behaviour there?**

>

---

## Links

- ⭐ **You measured this** → [`../lab/`](../lab/) Part A case 4
- Circuit breakers → [03-circuit-breakers.md](03-circuit-breakers.md)
- Load shedding → [05-load-shedding.md](05-load-shedding.md)
- `stale-if-error` at the CDN → [Phase 2 note 08](../../phase-02-stateless-scaling/notes/08-cdn.md)
- Feature flags in deploys → [11-deployment-safety.md](11-deployment-safety.md)
- Availability multiplies → [Phase 0 note 05](../../phase-00-foundations/notes/05-availability-vs-durability.md)
