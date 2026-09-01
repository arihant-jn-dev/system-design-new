# 07·11 · Deployment & Change Safety

> **Why this exists:** the roadmap's blunt framing — ***"most outages are caused by deploys."*** Which means
> deployment safety isn't a DevOps concern bolted on at the end; **it's a reliability feature**, and often a
> better investment than another replica.

---

## Reference

### ⭐ Why this matters more than redundancy

**Multi-AZ protects against infrastructure failure. But most outages come from CHANGE — a deploy, a config
push, a migration — and change propagates to every AZ simultaneously**
([08](08-failure-modes.md): correlated failure).

> ⭐ **Redundancy defends the rarer cause. Canaries and fast rollback defend the common one.** If you've built
> multi-AZ but deploy to 100% at once with no rollback path, you've defended the wrong flank.

### The strategies

| Strategy | How | Rollback | Cost |
|---|---|---|---|
| **Recreate** | Stop old, start new | Redeploy | ⚠️ **Downtime** |
| ⭐ **Rolling** | Replace instances gradually | Roll forward/back gradually | Two versions run together |
| **Blue-green** | Two full environments; flip traffic | ⭐ **Instant** | 2× infrastructure |
| ⭐ **Canary** | Small % to the new version, watch, ramp | Fast — shift traffic back | Needs good metrics |
| ⭐ **Shadow / dark traffic** | Mirror real traffic to the new version, **discard responses** | n/a — no user impact | 2× load on the new version |
| **Feature flags** | Deploy dark, enable per cohort | ⭐ **Instant, no deploy** | Flag debt |

### ⭐ The critical constraint of rolling deploys

**During a rolling deploy, both versions run simultaneously.** Everything must be compatible in **both**
directions:

| Must be | Because |
|---|---|
| **Schema compatible both ways** | Old code reads a new-schema DB ([12](12-zero-downtime-migrations.md)) |
| **API compatible both ways** | v1 and v2 instances behind one LB |
| **Message formats compatible** | An old consumer reads a new producer's events ([Phase 6 note 11](../../phase-06-messaging/notes/11-event-driven-design.md)) |
| **Caches compatible** | Both versions read the same keys → ⭐ **version your cache keys** |

> ⭐ **This is the same "expand–contract" discipline as a schema migration**, applied to every contract you
> own. **Never make a breaking change in one deploy** — expand, migrate, contract.

### Canary — done properly

```
1. Deploy to 1% of instances (or route 1% of traffic)
2. ⭐ WAIT -- long enough for real signal (not 30 seconds)
3. Compare canary vs baseline: error rate, p99, business metrics
4. Ramp 1% -> 10% -> 50% -> 100%, checking at each step
5. ⭐ AUTOMATED ANALYSIS: roll back automatically on regression
```

| Detail | |
|---|---|
| ⭐ **Compare canary to baseline, not to history** | Traffic varies; a same-time comparison controls for it |
| **Include business metrics** | ⭐ Technical metrics can be green while checkout conversion drops |
| **Wait long enough** | Slow leaks, GC issues and cache effects take minutes to appear |
| **Sticky routing for the canary** | Or a user bounces between versions mid-session |
| ⚠️ **1% may be too small to detect anything** | For a rare error you need enough traffic for statistical signal |

**Shadow traffic is the safest of all** — mirror production requests to the new version and **throw the
responses away**. You get real-traffic behaviour with zero user risk. ⚠️ **The catch: side effects.** A
shadowed request must not charge a card or send an email. **Shadow reads are easy; shadow writes need care.**

### ⭐ Rollback vs roll-forward

| | Rollback | Roll-forward |
|---|---|---|
| Speed | ⭐ **Fast, tested, predictable** | Requires diagnosis + a fix + a deploy |
| Risk | Low — you've run this version before | Unknown — the fix is untested under load |
| When | ⭐ **The default during an incident** | When rollback is impossible |

**When you CANNOT roll back:**
- ⚠️ **A migration that dropped a column** ([12](12-zero-downtime-migrations.md))
- Data written in a new format the old code can't read
- ⭐ **An event published with a new schema** — it's in the log forever
- An irreversible external effect (emails sent, payments captured)

> ⭐ **The rule: know BEFORE you deploy whether you can roll back.** *"Is this change reversible?"* should be
> a line in the deploy checklist. Irreversible changes need extra care, staged rollout, and a tested
> forward-fix plan — because your normal safety net doesn't exist.
>
> **And: rollback must be TESTED.** An untested rollback path is a hypothesis, and you'll be testing it for
> the first time during an incident.

### Feature flags — deploy ≠ release

⭐ **Separating deployment from release is the highest-leverage idea here.** Ship the code dark, enable it
when you choose, disable it instantly without a deploy.

| Use | |
|---|---|
| Gradual rollout by cohort | 1% of users, then 10%… |
| ⭐ **Kill switch** | Instant disable ([06](06-graceful-degradation.md)) |
| A/B testing | Same machinery |
| Trunk-based development | Merge incomplete work safely |

⚠️ **The costs:** flag debt (⭐ **remove flags once fully rolled out** — every permanent flag doubles your
untested code paths) · combinatorial testing · **the flag store must not be a SPOF** (cache locally,
default safe).

### The deploy checklist

- [ ] **Is it backward compatible?** (schema, API, messages, cache keys)
- [ ] ⭐ **Can I roll back?** If not, why, and what's the forward-fix plan?
- [ ] **Is it behind a flag?**
- [ ] **Canary with automated analysis?**
- [ ] **What metrics tell me it's bad** — and how fast?
- [ ] ⭐ **`lock_timeout` set** if there's DDL ([12](12-zero-downtime-migrations.md))
- [ ] **Graceful shutdown / connection draining** ([Phase 2 note 06](../../phase-02-stateless-scaling/notes/06-lb-operations-and-types.md))
- [ ] **Deploying during business hours?** ⭐ **Yes — with people awake to fix it.** Friday-night deploys are
      how a small problem becomes a weekend.
- [ ] **Error budget available?** ([10](10-alerting-and-slos.md))

### Config changes are deploys too

⚠️ **Config pushes cause outages at least as often as code deploys — and usually have none of the safety
machinery.**

> ⭐ **Treat config as code:** version it, review it, **canary it**, and be able to roll it back. A config
> change that goes to 100% of the fleet in one second, with no canary and no rollback, is the least safe
> change you can make — and it's often the one nobody guards.
>
> **Several of the largest cloud outages on record were config pushes, not code.**

---

## In your own words

**Why is deployment safety a reliability feature? Which cause does redundancy fail to defend?**

>

**What must be true during a rolling deploy? Name four compatibility surfaces.**

>

**Describe a proper canary. Why compare to baseline rather than history?**

>

**What's shadow traffic, and what's the one thing to be careful of?**

>

**Give four cases where you cannot roll back. What should the deploy checklist ask?**

>

**Why is "deploy ≠ release" the highest-leverage idea, and what's the cost?**

>

**Why are config changes the least safe change you can make?**

>

---

## Links

- Correlated failure via deploys → [08-failure-modes.md](08-failure-modes.md)
- ⭐ **Zero-downtime migrations** → [12-zero-downtime-migrations.md](12-zero-downtime-migrations.md)
- Kill switches → [06-graceful-degradation.md](06-graceful-degradation.md)
- Error budgets → [10-alerting-and-slos.md](10-alerting-and-slos.md)
- Connection draining → [Phase 2 note 06](../../phase-02-stateless-scaling/notes/06-lb-operations-and-types.md)
- Schema evolution → [Phase 6 note 11](../../phase-06-messaging/notes/11-event-driven-design.md)
