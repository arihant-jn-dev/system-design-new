# 08 · SLI / SLO / SLA & Error Budgets

> **Why this exists:** this is how availability stops being a slogan and becomes an *engineering decision
> tool*. It's also the vocabulary that lets you say "we should stop shipping features this month" with data
> instead of opinion — which is a distinctly senior thing to be able to do.

---

## Reference

### The three terms

| Term | What it is | Who it's for | Example |
|---|---|---|---|
| **SLI** — Service Level *Indicator* | A **measurement**. A number you actually collect. | Engineers | "Fraction of HTTP requests returning < 300 ms with a 2xx/3xx status" |
| **SLO** — Service Level *Objective* | Your **internal target** for that SLI | Engineering + product | "99.9% of requests meet the SLI, measured over 28 days" |
| **SLA** — Service Level *Agreement* | A **contract** with a customer, including **penalties** | Legal / sales / customers | "99.5% monthly uptime or you get a 10% credit" |

**The relationship, and the rule:**

```
SLI  = what you measure
SLO  = the target        (internal, strict)
SLA  = the promise       (external, looser, has money attached)

                 SLA (99.5%)  ←  always LOOSER than the SLO
                  SLO (99.9%) ←  your alerting fires here
                   SLI (actual)
```

**The SLA must always be weaker than the SLO.** The gap is your safety margin: you want to be paging
yourself and fixing things long before a customer is owed money. Getting this backwards — promising more
than you target — is a classic mistake.

Also: **not every service has an SLA.** Internal services usually have SLOs only. An SLA without a penalty
clause is just an SLO with better marketing.

### Choosing a good SLI

**Measure what the user experiences, not what's easy to collect.**

| Bad SLI | Why it's bad | Better SLI |
|---|---|---|
| CPU utilisation | Users don't care about CPU. High CPU with happy users is fine. | Request success rate |
| "Server is up" | A server can be up and returning 500s or hanging | Fraction of requests that succeed *and* are fast |
| Average latency | Long tail; describes a user who doesn't exist (note 04) | **p99** latency below a threshold |
| Internal queue depth | A cause, not a symptom | End-to-end time from enqueue to user-visible result |

**The standard SLI shape:**

```
SLI = good events / valid events

e.g.  (requests with status < 500 AND latency < 300 ms) / (all non-bot requests)
```

Note that a good availability SLI usually **folds latency in**. A 200 OK after 30 seconds is not a success —
that's precisely how a 99.99% service delivers a terrible experience (note 05).

**Measure from as close to the user as possible.** Server-side metrics miss DNS failures, CDN problems,
network issues and client errors. Real User Monitoring (RUM) shows the truth; your load balancer shows a
flattering version of it.

### Error budgets — the actually useful idea

```
Error budget = 100% − SLO
```

An SLO of 99.9% over 28 days gives you:

```
28 days = 40,320 minutes
0.1% of that = 40.3 minutes of "allowed badness" per 28 days
```

**Reframe:** you are not *trying* to have zero errors. You have a **budget** of 40 minutes, and it is a
resource to *spend deliberately*.

| Budget state | What it means | The decision it drives |
|---|---|---|
| **Budget remaining** | You're beating the SLO | **Spend it.** Ship faster, deploy more often, run a chaos experiment, do the risky migration. Unspent budget is over-engineering. |
| **Budget exhausted** | You've missed the SLO | **Freeze features.** All effort to reliability until the budget recovers. |

This is the mechanism that ends the eternal argument between "ship faster" and "be more stable." It converts
it from a values disagreement into a number both sides already agreed on.

> **The senior sentence:** "100% is the wrong reliability target for essentially everything. The right one
> is the level at which users stop noticing improvements — anything beyond that is money spent on nothing.
> The error budget is how you spend the remainder on velocity, on purpose."

**Burn rate** — how fast you're consuming the budget:

```
burn rate = (budget consumed) / (fraction of window elapsed)
```

- Burn rate 1 → you'll exactly exhaust the budget at the end of the window
- Burn rate 10 → you'll exhaust a 28-day budget in **2.8 days** → page someone now
- Burn rate 0.1 → you're over-provisioned; consider spending it

**Alert on burn rate, not on raw error rate.** A brief error spike that consumes 0.1% of your budget is not
worth waking anyone. This is the single biggest cure for alert fatigue. (Multi-window, multi-burn-rate
alerting is the standard pattern — Google SRE Workbook Ch. 5.)

### Availability targets in practice

Do **not** default to "four nines" because it sounds impressive.

| Service | Realistic target | Why |
|---|---|---|
| Internal analytics dashboard | 99% | Nobody dies. Fix it Monday. |
| Standard B2B SaaS API | 99.9% | The sane default |
| Payments / checkout | 99.99% | Direct revenue loss per minute |
| Auth service | 99.99%+ | Everything else depends on it — its failures are *correlated* across every product surface |
| Recommendations widget | 99% | Should degrade to "popular items," never fail the page |

**The pattern:** availability targets should be set per-component based on **blast radius and business
impact**, not uniformly. A shared dependency (auth, config, service discovery) needs a higher target than
anything that depends on it, because its failures are correlated (note 05).

### The trap to name in an interview

If your service consistently *exceeds* its SLA, **users start depending on the actual level, not the
promised one.** Chubby (Google's lock service) was so reliable that teams stopped handling its downtime —
so its owners began deliberately taking it down to keep dependents honest. That's the origin of chaos
engineering as a discipline, and it's a great thing to mention.

---

## In your own words

**SLI, SLO, SLA — define each in one line, and say who each is for.**

>

**Why must the SLA be looser than the SLO?**

>

**Write a good SLI for an API you've worked on. Include the latency threshold and the denominator.**

>

**Your SLO is 99.9%/28 days. How many minutes of error budget? Show the math.**

>

**You have 80% of your budget left with 3 days to go. What should you do — and why is "nothing" the wrong answer?**

>

**Why is alerting on burn rate better than alerting on error rate?**

>

---

## Links

- The nines table and where these numbers come from → [05-availability-vs-durability.md](05-availability-vs-durability.md)
- Why latency belongs inside the availability SLI → [04-percentiles-and-tail-latency.md](04-percentiles-and-tail-latency.md)
- Alerting on symptoms not causes, RED/USE, observability → Phase 7
- Free and genuinely excellent: Google *SRE Book* Ch. 3–4 and *SRE Workbook* Ch. 2 & 5 (sre.google/books)
