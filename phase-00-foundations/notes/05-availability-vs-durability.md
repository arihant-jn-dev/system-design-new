# 05 · Availability vs Durability

> **Why this exists:** these two get used interchangeably and they are completely different properties.
> Also: **availability multiplies across dependencies**, which is the single most counter-intuitive fact in
> Phase 0 and a direct gate question.

---

## Reference

### The distinction, stated cleanly

| Property | Question it answers | Failure looks like | Typical target |
|---|---|---|---|
| **Availability** | "Can I reach it *right now*?" | 503, timeout, connection refused | 99.9% – 99.99% |
| **Durability** | "Is my data still there *at all*?" | Data loss. **Permanent. Unrecoverable.** | 99.999999999% (11 nines, S3) |

**The key asymmetry:** unavailability is temporary and recoverable — you wait, it comes back.
**Data loss is forever.** That's why durability targets are absurdly higher than availability targets.

**A system can be:**
- Durable but unavailable — S3 during an outage. Your data is perfectly safe; you just can't get it.
- Available but not durable — a Redis cache with no persistence. Always up, loses everything on restart.
- **This is a legitimate design choice, not a bug.** Redis is *supposed* to be that.

> **Interview line:** "I'm choosing availability over durability for the session store — losing sessions
> logs people out, which is annoying but recoverable. For the payment ledger it's the opposite: I'll accept
> write unavailability rather than risk losing a single transaction."

### The nines table — memorise the middle rows

| Availability | Downtime/year | Downtime/month | Downtime/day | What it takes |
|---|---|---|---|---|
| 90% ("one nine") | 36.5 days | 72 hrs | 2.4 hrs | A hobby project |
| 99% ("two nines") | 3.65 days | 7.2 hrs | 14.4 min | Single server, someone on call |
| **99.9% ("three nines")** | **8.77 hrs** | **43.8 min** | **1.44 min** | **Redundancy, health checks, fast rollback. The realistic default.** |
| **99.99% ("four nines")** | **52.6 min** | **4.4 min** | **8.6 s** | **Multi-AZ, automated failover, no manual steps in the recovery path** |
| 99.999% ("five nines") | 5.26 min | 26 s | 0.86 s | Multi-region active-active, no human in the loop. Very expensive. |
| 99.9999% ("six nines") | 31.6 s | 2.6 s | 86 ms | Telco/exchange territory. Usually a marketing claim. |

**Fast recall trick:** each nine divides downtime by 10.
Anchor on **three nines ≈ 8.8 hours/year ≈ 43 minutes/month.**

**The cost curve is not linear.** Each additional nine roughly *multiplies* cost — more redundancy, more
regions, more automation, more engineers on call. Going 99.9% → 99.99% can mean a multi-region rewrite.

> **Senior move:** ask *"what does an extra nine buy the business?"* If the answer is "nothing measurable,"
> you've just saved a fortune, and interviewers notice that. Most products do not need four nines.

### Availability multiplies — the counter-intuitive one

For a request that requires **all** dependencies to work (a serial/dependency chain):

```
A_total = A₁ × A₂ × A₃ × ... × Aₙ
```

| Services in the path | Each at 99.9% | Combined | Downtime/year |
|---|---|---|---|
| 1 | 99.9% | 99.9% | 8.8 hrs |
| 5 | 99.9% | 99.5% | 43.8 hrs |
| **10** | **99.9%** | **99.0%** | **87.6 hrs (3.6 days)** |
| 30 | 99.9% | 97.0% | 262 hrs (11 days) |

**Ten services at "three nines" each give you *two* nines overall.**

**This is the strongest argument against reflexive microservices.** Every service you add to the critical
path *subtracts* availability. And it's exactly parallel to tail latency amplification (note 04) — fan-out
multiplies your exposure to both slowness and failure.

**How you fight back:**

| Technique | Effect |
|---|---|
| **Redundancy** (parallel, not serial) | Availability *adds* instead of multiplying — see below |
| **Remove from critical path** | Make a dependency async / best-effort. An unavailable recommendation service should not fail checkout. |
| **Graceful degradation** | Serve stale/partial/default when a dependency is down |
| **Caching** | A cache hit doesn't need the dependency to be up at all |
| **Circuit breakers** | Fail fast instead of hanging — turns a latency failure into a cheap, contained one |

### Redundancy: the math in the other direction

For **N redundant** components where you need only **one** to work:

```
A_total = 1 − (1 − A)^N
```

| Redundancy | Each at 99% | Combined |
|---|---|---|
| 1 | 99% | 99% |
| 2 | 99% | 99.99% |
| 3 | 99% | 99.9999% |

Two mediocre things in parallel beat one good thing. **This is why redundancy is the fundamental tool.**

**The catch — correlated failure.** The formula assumes *independence*. Three replicas in the same rack, on
the same power supply, running the same buggy release, sharing one config service — are not independent.
The formula silently becomes a lie.

> **Senior signal:** "Three replicas gives me six nines *on paper*, but they share an AZ, a deployment
> pipeline and a config store — so my real availability is dominated by correlated failure, not by replica
> count." Naming correlated failure unprompted is a strong differentiator.

### Durability — how 11 nines is actually achieved

S3's "99.999999999%" means: store 10 million objects, expect to lose one every **10,000 years**.

Achieved by:
- **Replication** across ≥3 AZs (physically separate buildings, power, network)
- **Erasure coding** — split into k data + m parity fragments; survive losing any m. Cheaper than 3× replication for the same durability.
- **Continuous background verification** — scrubbing, checksums, auto-repair of bit rot
- **Versioning** and cross-region replication for the human-error cases

**Durability's real enemy is not disk failure — it's you.** `DROP TABLE`, a bad migration, a buggy delete
loop. Replication faithfully copies your mistake to all three replicas, instantly.

**Therefore: replication is not a backup.**

| | Replication | Backup |
|---|---|---|
| Protects against | Hardware/AZ failure | **Human error, bugs, ransomware, corruption** |
| Propagates a bad `DELETE`? | **Yes, immediately** | No — point-in-time recovery |
| Restore time | Seconds (failover) | Hours |

Write that distinction down. It comes up constantly, and "we have replicas" offered as a backup strategy is
a well-known wrong answer.

**And: an untested backup is not a backup.** The restore path is what you actually need, and it's the part
nobody exercises. → RPO/RTO in Phase 7.

### Why 99.99% can still be a terrible experience (gate question)

Four separate reasons, any one of which is a complete answer:

1. **Availability doesn't measure latency.** A request that returns HTTP 200 after 30 seconds counts as
   "available." Users experience it as broken. **Slow is the new down.**
2. **Averaging hides concentration.** 52 minutes of downtime spread as 8s/day is invisible. The same 52
   minutes in one block at Black Friday peak is a company-level incident. Same SLA number.
3. **It measures the wrong thing.** Availability is usually "did the server respond," not "was the answer
   correct." Serving stale, empty, or wrong data at 200 OK scores as perfect availability. Silent
   data corruption is 100% available.
4. **Partial failure isn't captured.** If checkout works but search is down, most SLIs still read ~fine —
   while the product is unusable.

> **Compressed gate answer:** "Because availability only asks 'did it respond', not 'was it fast', 'was it
> correct', or 'when did it fail'. 52 minutes of downtime concentrated at peak, or a service that returns
> 200s with empty results, both score as 99.99% while being a terrible experience. That's why you measure
> SLIs on latency and correctness, not just uptime."

---

## In your own words

**Availability vs durability — define both without using the other word.**

>

**Give an example of a system that should choose availability over durability, and one that shouldn't.**

>

**Ten services at 99.9% each. What's the combined availability, and what does that tell you about microservices?**

>

**Why is "we have 3 replicas" not a valid answer to "what's your backup strategy"?**

>

**Explain why a 99.99% service can still be a terrible experience. Give 3 distinct reasons.**

>

**What is correlated failure, and why does it break the redundancy formula?**

>

---

## Links

- Same multiplication logic as tail latency → [04-percentiles-and-tail-latency.md](04-percentiles-and-tail-latency.md)
- Turning these into engineering decisions → [08-sli-slo-sla-error-budgets.md](08-sli-slo-sla-error-budgets.md)
- Replication, failover, split brain → Phase 3C
- RPO/RTO, multi-region, blast radius → Phase 7
