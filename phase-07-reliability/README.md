# Phase 7 — Reliability, Resilience & Observability

**Week 11 · ~10 hrs**

---

## Why this phase exists

The roadmap is unambiguous:

> *"The 'senior' phase. Mid-level candidates design the happy path. Senior candidates design the failure
> path — **this is the most reliable single differentiator in the whole round**."*

Everything up to now was about making systems *work*. This phase is about what happens when they don't — and
about **volunteering that analysis before you're asked**, which is the behaviour being marked.

**You prove it rather than assert it.** The lab takes a healthy service, degrades its dependency to a
5-second response, and walks four configurations from **28% success with a 6.41 s p99** to **100% success
with 4.5× less load on the struggling dependency.**

---

## How to work this phase

| Step | Do this | Time |
|---|---|---|
| 1 | Read [`notes/`](notes/) 01 → 14. Reference half, once. | ~2 hrs |
| 2 | Fill in the "In your own words" halves. **The actual work.** | ~3 hrs |
| 3 | [`lab/`](lab/) **Part A** — four resilience configurations, measured | ~1.5 hrs |
| 4 | [`lab/`](lab/) **Part B** — a zero-downtime column rename with writes flowing | ~1.5 hrs |
| 5 | ⭐ **Recite the ten failure modes with mitigations, timed.** Under 90 seconds. | ~30 min |
| 6 | ⭐ **Take a design you've already drawn and annotate every failure path.** | ~30 min |
| 7 | [`GATE.md`](GATE.md) out loud. | ~1 hr |

**Read *Release It!* (Nygard) alongside this** — it's the source of most of these patterns — plus **Google
SRE Book ch. 21–22** (free) on overload and cascading failures.

---

## Topics

| # | Note | The one thing it's for |
|---|---|---|
| 01 | [Timeouts & deadlines](notes/01-timeouts-and-deadlines.md) | Pick from p99 · **deadline propagation** · cancellation |
| 02 | [Retries & budgets](notes/02-retries-and-budgets.md) | ⭐ **Retries measured making things worse** · budgets, jitter |
| 03 | [Circuit breakers](notes/03-circuit-breakers.md) | ⭐ The pattern that got 100% success with 4.5× less load |
| 04 | [Bulkheads & isolation](notes/04-bulkheads-and-isolation.md) | How much capacity one dependency may consume |
| 05 | [Load shedding](notes/05-load-shedding.md) | ⭐ **The honest answer to overload** · prioritised shedding |
| 06 | [Graceful degradation](notes/06-graceful-degradation.md) | ⭐ The only pattern that keeps the *product* working |
| 07 | [Rate limiting](notes/07-rate-limiting.md) | ⭐ **Gate Q2** — distributed accuracy/latency trade |
| 08 | [Failure modes](notes/08-failure-modes.md) | ⭐ **Gate Q1 & Q4** — all ten, by name |
| 09 | [Observability](notes/09-observability.md) | Metrics/logs/traces and what each is **bad at** · cardinality |
| 10 | [Alerting & SLOs](notes/10-alerting-and-slos.md) | Symptoms not causes · **burn-rate alerting** · postmortems |
| 11 | [Deployment safety](notes/11-deployment-safety.md) | ⭐ **Most outages come from change** · canary · rollback |
| 12 | [Zero-downtime migrations](notes/12-zero-downtime-migrations.md) | ⭐ **Gate Q3** — expand → migrate → contract |
| 13 | [Multi-region & DR](notes/13-multi-region-and-dr.md) | RPO/RTO as numbers · **cells & shuffle sharding** |
| 14 | [Chaos & capacity](notes/14-chaos-and-capacity.md) | ⭐ **Every claim in this phase is untested until you test it** |

---

## Lab

[`lab/`](lab/) — a service, a flaky dependency, and Postgres.

**Part A — four configurations, one failure.** The dependency slows to 5 seconds mid-test:

| Mode | Success | p99 | Dependency calls |
|---|---|---|---|
| none | 28.4% | **6.41 s** | 1,588 |
| timeout | 25.7% | 154 ms | 5,601 |
| + retry | 25.0% | 571 ms | ⚠️ **7,405** |
| **+ breaker + fallback** | ⭐ **100%** | 152 ms | ⭐ **1,655** |

**Retries made it worse.** The breaker made it better *for both sides* — that's the result to remember.

**Part B — a real expand–contract migration.** Rename a column on a live table with a writer inserting and
updating throughout: **2,742 writes, zero errors, zero NULLs, zero mismatches** across eight steps and two
deploys.

---

## Definition of done

- [ ] All 14 notes have the "In your own words" half filled in
- [ ] `lab/RESULTS.md` has your own numbers for both parts
- [ ] You watched retries make a systemic failure worse
- [ ] You performed a zero-downtime migration with writes flowing
- [ ] You can name **ten failure modes with mitigations in under 90 seconds**
- [ ] You can annotate any design's failure paths **unprompted**
- [ ] You can walk the eight-step migration in under two minutes
- [ ] [`GATE.md`](GATE.md) passed out loud
