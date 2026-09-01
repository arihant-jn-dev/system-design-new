# Phase 2 — Scaling the Stateless Tier

**Week 3 · ~8 hrs**

---

## Why this phase exists

The roadmap's framing: *"The easy half of scaling. Get it out of the way so you can spend your real energy on
state."*

That's right, and it's the point. Scaling stateless services is a **solved problem** — add machines, put a
load balancer in front. The reason to spend a week on it is that everything genuinely hard in Phases 3–7 is
hard *because state is involved*, and you can only see that clearly once you know how easy the stateless half
is by comparison.

**The specific failures this phase prevents:**

- Drawing a box labelled "load balancer" and being unable to say which algorithm, what happens on failure, or
  how it knows a backend is dead
- Reaching for sticky sessions without naming what they cost you
- Never mentioning health checks — and then being unable to answer *"how does a deep health check take down a
  healthy fleet?"*, which is a favourite follow-up precisely because it punishes the reflexive answer

---

## How to work this phase (in order)

| Step | Do this | Time |
|---|---|---|
| 1 | Read [`notes/`](notes/) 01 → 11. Reference half, once. | ~1 hr |
| 2 | Fill in the "In your own words" half. **The actual work.** | ~2.5 hrs |
| 3 | [`lab/`](lab/) **Part A** — nginx + 3 replicas. Kill one under load. Then break one in three *different* ways and watch how differently the system copes. | ~2 hrs |
| 4 | [`lab/`](lab/) **Part B** — implement consistent hashing. Verify adding a node moves ~1/N of keys. | ~1.5 hrs |
| 5 | [`GATE.md`](GATE.md) out loud. | ~1 hr |

---

## Topics covered (maps 1:1 to the roadmap)

| # | Note | The one thing it's for |
|---|---|---|
| 01 | [Stateless vs stateful](notes/01-stateless-vs-stateful.md) | **The enabler for everything else** — and exactly what you inherit when you break it |
| 02 | [Session management](notes/02-session-management.md) | Sticky vs tokens vs central store — **gate Q2** |
| 03 | [Load balancing algorithms](notes/03-load-balancing-algorithms.md) | RR → least-connections → **power-of-two-choices**, the elegant answer |
| 04 | [Consistent hashing](notes/04-consistent-hashing.md) | The idea that reappears in Phases 3, 5 and 9. **Implement it, don't just describe it.** |
| 05 | [Health checks](notes/05-health-checks.md) | Active vs passive, shallow vs deep, **correlated failure — gate Q3** |
| 06 | [LB operations & types](notes/06-lb-operations-and-types.md) | Draining, slow start, outlier ejection; DNS vs hardware vs software vs cloud; GSLB |
| 07 | [Proxy vs gateway vs mesh](notes/07-proxy-gateway-mesh.md) | What each layer legitimately owns — and the business-logic-in-the-gateway anti-pattern |
| 08 | [CDN](notes/08-cdn.md) | Pull vs push, cache keys, invalidation, origin shielding, signed URLs |
| 09 | [Autoscaling](notes/09-autoscaling.md) | Reactive/scheduled/predictive, cold start, and **why autoscaling can worsen an overload** |
| 10 | [Multi-AZ](notes/10-multi-az.md) | What an AZ buys, what it costs, correlated failure |
| 11 | [The request path](notes/11-the-request-path.md) | **Synthesis — gate Q1.** Every hop and what it owns. |

> **Note:** L4 vs L7 is [Phase 1 note 01](../phase-01-networking/notes/01-l4-vs-l7.md). It's the prerequisite
> for this phase rather than part of it — re-read it before note 03 if it's gone fuzzy.

---

## Lab

[`lab/`](lab/) — two parts.

**Part A — nginx + 3 replicas, broken three different ways.** The roadmap says "kill one mid-load-test and
watch the error rate." You'll do that, and get a **surprising result**: barely any errors, because nginx
retries the next upstream automatically. So the lab goes further and breaks a replica in three distinct ways —
*crash*, *500s*, and *hang* — because they produce completely different failure signatures. The hang is the
important one: it's a **gray failure**, the replica passes its health check while poisoning your p99, and
watching that happen is the best possible preparation for gate Q3.

**Part B — consistent hashing from scratch.** ~50 lines. Then measure what the roadmap asks: adding a node
moves **~1/N of keys, not all of them.** You'll compare it head to head with naive modulo hashing, and see
what virtual nodes actually do for distribution balance.

---

## Definition of done

- [ ] All 11 notes have the "In your own words" half filled in
- [ ] `lab/RESULTS.md` has real measured numbers for both parts
- [ ] You watched a *hanging* replica hurt more than a *dead* one
- [ ] You implemented consistent hashing yourself and measured the key-movement fraction
- [ ] You can name every hop in a 10 M-user request path and what it owns
