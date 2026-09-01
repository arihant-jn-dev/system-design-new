# 07·10 · Alerting, SLOs & On-Call

> **Why this exists:** the roadmap's phrasing — *"alerting on **symptoms not causes**, alert fatigue,
> runbooks, on-call"* and *"SLI/SLO/error budgets as an engineering decision-making tool."* Alerting badly is
> how teams end up ignoring the page that mattered.

---

## Reference

### ⭐ Alert on symptoms, not causes

| ❌ Cause-based | ✅ Symptom-based |
|---|---|
| CPU > 80% | **Error rate > 1%** |
| Disk 85% full | **p99 latency > 500 ms** |
| A pod restarted | **Checkout success rate dropped 20%** |
| Replication lag > 10 s | **Users are seeing stale data** |
| Queue depth > 10,000 | **Processing lag > 5 minutes** |

> ⭐ **Why: causes are infinite and mostly harmless; symptoms are finite and always matter.** High CPU with
> happy users needs no page. Low CPU with failing users absolutely does.
>
> **The test: "would a user notice?"** If no, it's a dashboard, not a page.

**The exception — predictive alerts:** disk filling at a rate that hits 100% in 4 hours is a *cause*, but it's
worth alerting on because **there's no symptom until it's too late to prevent.** Same for certificate
expiry. **Alert on causes only when the symptom is unrecoverable.**

### The three severity tiers

| Tier | Means | Response |
|---|---|---|
| ⭐ **Page** | **Users are affected NOW and a human must act** | Wake someone |
| **Ticket** | Needs attention, not urgently | Next business day |
| **Dashboard/log** | Context for investigation | No notification |

> ⭐ **The rule: every page must be ACTIONABLE and URGENT.** If the responder's action is "acknowledge and go
> back to sleep," it should never have been a page. **That single filter eliminates most alert fatigue.**

### ⭐ Burn-rate alerting — the SLO-based approach

From [Phase 0 note 08](../../phase-00-foundations/notes/08-sli-slo-sla-error-budgets.md):
```
error budget = 100% − SLO
99.9% over 28 days = 40.3 minutes of allowed badness
burn rate = (budget consumed) / (fraction of window elapsed)
```

| Burn rate | Budget gone in | Action |
|---|---|---|
| 1× | Exactly at window end | Normal |
| **14.4×** | ⚠️ **2 days** | **Page** |
| 6× | 4.7 days | Page (slower window) |
| 3× | 9 days | Ticket |
| 1× | 28 days | Ignore |

⭐ **Multi-window, multi-burn-rate** (Google SRE Workbook ch. 5) is the standard: a **fast** window (5 min)
catches sudden outages; a **slow** window (6 h) catches gradual degradation; **requiring both to fire**
avoids paging on a 30-second blip.

> ⭐ **This is the single biggest cure for alert fatigue.** A brief spike consuming 0.1% of your budget isn't
> worth waking anyone. **Alerting on raw error rate pages you for noise; alerting on burn rate pages you for
> things that will actually breach the SLO.**

### Alert fatigue — the real failure mode

| Symptom | |
|---|---|
| Alerts routinely acknowledged without action | The alert is noise |
| "That one always fires" | ⭐ **You have trained people to ignore it — and one day it'll be real** |
| More than a few pages per shift | Unsustainable; people burn out and quit |
| Alerts with no runbook | The responder has to improvise at 3 a.m. |

**Fixes:** delete alerts nobody acts on · ⭐ **every alert gets a runbook link** · tune thresholds from
real data · group related alerts into one incident · ⭐ **review every page in a weekly on-call handover and
delete or fix the noisy ones**.

> ⭐ **The best metric for alert quality: what fraction of pages resulted in an action?** Below ~50% and your
> alerting is training people to ignore you.

### Runbooks

**Every alert links to a runbook containing:**
1. **What this alert means** (in plain language)
2. **User impact** — what's broken for whom
3. **How to confirm** — the dashboard/query to check first
4. **Immediate mitigation** — ⭐ **the kill switch, the rollback, the scale-up. Mitigate before diagnosing.**
5. **Escalation** — who to call
6. **Links** to relevant dashboards and past incidents

> ⭐ **"Mitigate first, diagnose later" is the on-call rule.** Roll back, flip the flag, shed load — restore
> service, *then* find out why. **A runbook that starts with "check the logs to understand the cause" is
> written backwards.**

### SLOs as a decision tool

| Budget state | Decision |
|---|---|
| ⭐ **Remaining** | **Spend it** — ship faster, run a chaos experiment, do the risky migration |
| ⭐ **Exhausted** | **Freeze features.** All effort to reliability until it recovers. |

**This is what turns "ship faster" vs "be more stable" from a values argument into a number both sides
already agreed on.**

**And set targets by blast radius, not uniformly:** auth and payments need more nines than a
recommendations widget, because their failures are *correlated* across every product surface
([Phase 0 note 08](../../phase-00-foundations/notes/08-sli-slo-sla-error-budgets.md)).

### On-call and postmortems

| Practice | |
|---|---|
| **Sustainable rotation** | ⭐ Google's guidance: **≤2 incidents per 12-hour shift** — more means you're understaffed or your alerting is noisy |
| **Follow-the-sun or compensated** | Night pages have a real human cost |
| **Handover** | What's degraded, what's fragile, what's deferred |
| ⭐ **Blameless postmortems** | Ask *"why did the system permit this?"* not *"who did it?"* |
| **Action items with owners and dates** | ⭐ **A postmortem with no completed actions is theatre** |

> ⭐ **"Human error" is never a root cause.** The questions are: why did the system *allow* it, why wasn't it
> caught before production, and why did it take so long to detect? **If people are punished for mistakes,
> they hide them — and you lose the data that prevents the next one.**

**A good postmortem includes:** a timeline (detection → mitigation → resolution), **user impact quantified**,
what went well, what didn't, ⭐ **where you got lucky** — and action items that are actually tracked.

**"Where we got lucky" is the most underrated section:** it surfaces the near-misses that would otherwise be
invisible.

---

## In your own words

**Symptoms vs causes — give the test, and the one legitimate exception.**

>

**What must be true of every page?**

>

**Explain burn-rate alerting. Why is it the cure for alert fatigue?**

>

**What's the best measure of alerting quality?**

>

**List a runbook's six sections. Why is "mitigate first" the rule?**

>

**How does an error budget end the ship-fast vs be-stable argument?**

>

**Why is "human error" never a root cause? What do you ask instead?**

>

---

## Links

- SLI/SLO/error budgets → [Phase 0 note 08](../../phase-00-foundations/notes/08-sli-slo-sla-error-budgets.md)
- What to measure → [09-observability.md](09-observability.md)
- Gray failure — what only p99 catches → [08-failure-modes.md](08-failure-modes.md)
- Deploy safety and rollback → [11-deployment-safety.md](11-deployment-safety.md)
- **Google SRE Book ch. 6 · SRE Workbook ch. 5 (multi-window burn rate)** — free at sre.google/books
