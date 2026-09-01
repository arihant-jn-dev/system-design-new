# Phase 2 — Gate

> **Rules:** Out loud. From memory. No notes.
> If you can't, don't advance to Phase 3 — and Phase 3 is the heaviest phase in the roadmap, so arrive clean.

---

## Q1 · Design the request path for a 10 M-user web app, naming every hop and what it owns

**You pass if:**

- [ ] ⭐ **You did the capacity math FIRST** — and concluded that 10 M users is roughly **4,500 peak QPS**,
      which is *not a large system*. Designing for 10 M QPS is the classic failure here.
- [ ] You named the hops in order: DNS → anycast/global LB → CDN → WAF → L4 LB → L7 LB → API gateway →
      service → cache → database
- [ ] **For each hop you said what it OWNS** — not just its name
- [ ] You said where TLS terminates and why
- [ ] You put **authentication at the gateway** and **fine-grained authorization in the service**
- [ ] You said **business logic lives only in the service**
- [ ] ⭐ **You walked a read path AND a write path end to end**, out loud
- [ ] You said writes go to the primary, reads may go to replicas — **and named the consequence** (replication
      lag → read-your-own-writes)
- [ ] You said what goes **async** (search indexing, notifications, analytics) and why
- [ ] ⭐ **You volunteered what happens when each component dies** — especially the **cold-cache outage** and
      the **CDN-down** case, where losing a *performance* component causes an *availability* failure
- [ ] ⭐ **You said which hops you'd DROP at a smaller scale.** "I'd start with a cloud LB and services; I'd
      add a gateway when we have multiple API consumers needing different rate limits."

**The two marks that separate a strong answer:** doing the arithmetic and concluding *"this is smaller than it
sounds"*, and volunteering the failure path without being asked.

**Self-score:** ___ / 11

---

## Q2 · Explain when sticky sessions are acceptable and when they're a liability

**You pass if you named at least 4 costs:**

- [ ] **Uneven load** — sessions accumulate; the longest-running node holds the most; new nodes get nothing
- [ ] **A node dying logs its users out** — not degraded, *logged out*
- [ ] **Deploys are disruptive** — every rolling restart drops that node's sessions
- [ ] **Scaling down evicts users**; autoscaling is blunted because new capacity only serves new sessions
- [ ] Hot spots can't be rebalanced away
- [ ] It's hidden statefulness — you inherit routing, rebalancing, replication

**And you named when they're acceptable:**

- [ ] ⭐ **WebSockets/SSE — the strongest case, because the connection is inherently pinned.** Stickiness there
      isn't a choice, it's a description of reality.
- [ ] Local caching where losing state is a **performance** problem, not a **correctness** one
- [ ] Legacy systems you can't modify (pragmatic bridge)

**Bonus:**

- [ ] You mentioned **IP-hash stickiness breaks behind NAT** (corporate, carrier-grade mobile)
- [ ] You stated your default: stateless + shared session store, sticky **deliberately, for connections, not
      for identity**
- [ ] You could contrast the three approaches (sticky / JWT / central store) and name **JWT's revocation
      problem**

**Self-score:** ___ / 7 (+bonus)

---

## Q3 · Explain how a deep health check can take down a healthy fleet

**You pass if you walked the full sequence:**

- [ ] Every instance's `/health` checks a **shared** dependency (the database)
- [ ] The database has a **brief, partial** degradation — slow, not dead
- [ ] **Every instance fails its check simultaneously**, because they all check the same thing
- [ ] The LB removes **the entire fleet** from rotation
- [ ] **100% of traffic now 503s** — while every app instance is perfectly healthy and could still serve
      cached reads
- [ ] ⭐ **You named the root cause: the health check made failures perfectly *correlated*, destroying the
      independence that redundancy depends on**

**Bonus — the marks that separate a complete answer:**

- [ ] ⭐ **The second-order effect: the health checks themselves add load** to the struggling dependency
      (100 instances × 1/sec × 3 deps = 300 extra QPS). **The health check helps kill what it's checking.**
- [ ] **Fail-open at the fleet level** — if >X% is unhealthy, assume the check is wrong and route anyway
      (AWS ALB does this)
- [ ] The fix: **shallow check for LB rotation**; dependency health goes to **monitoring and circuit
      breakers**, never to the routing decision
- [ ] The Kubernetes version: a DB call in a **liveness** probe → every pod restarts → CrashLoopBackOff
- [ ] Thresholds math: 30 s interval × 3 failures = **90 seconds of user-visible errors** before ejection

**Self-score:** ___ / 6 (+bonus)

---

## Extra checks

- [ ] **Power of two choices** — explain it, and why it beats true least-connections with multiple LBs
- [ ] **Why is a broken server the "least loaded" server?** What do you add to fix it?
- [ ] **Why is gRPC behind an L4 load balancer effectively unbalanced?**
- [ ] **`hash(key) % N`** — why catastrophic for a cache? Give the number for 3 → 4 nodes.
- [ ] **Two things virtual nodes buy you** (one is distribution — what's the other?)
- [ ] ⭐ **The three failure modes from the lab** — crash, 500s, hang. Which was *least* damaging, and why was
      the hang worst?
- [ ] **Gray failure** — define it, and say what metric catches it
- [ ] **Correct SIGTERM sequence.** Why must the health check fail *before* you stop accepting connections?
- [ ] **The autoscaling death spiral** — full mechanism
- [ ] **Why 3 AZs rather than 2?** (capacity reason *and* quorum reason)
- [ ] **Business logic in the API gateway** — why is it an anti-pattern?
- [ ] **Micro-caching** — why does a 5-second TTL on a hot endpoint matter so much? Do the arithmetic.
- [ ] **`stale-while-revalidate` and `stale-if-error`** — what does each buy?

---

## Scoring

| Result | Do this |
|---|---|
| All three passed + most extras | ✅ Advance to Phase 3. Update the tracker in [`../README.md`](../README.md). |
| Passed Q1–Q3, fumbled extras | Advance; re-read the specific notes this week |
| Fumbled any of Q1–Q3 | ⛔ Don't advance. Redo that note's "own words" section, retry in 2 days. |

| Fumbled | Redo |
|---|---|
| Q1 | [notes/11](notes/11-the-request-path.md) — and write the whole path out longhand, twice |
| Q2 | [notes/02](notes/02-session-management.md) + [notes/01](notes/01-stateless-vs-stateful.md) |
| Q3 | [notes/05](notes/05-health-checks.md) + re-run [lab](lab/) experiment A4 |

---

## Before Phase 3

Phase 3 is **3 weeks and ~30 hours** — the heaviest in the roadmap, and the one that most separates senior
from mid-level candidates. Two things to do first:

- [ ] Re-read all of Phase 0's notes (~20 min). Phase 3 leans hard on percentiles, availability and workload shape.
- [ ] Start **DDIA chapters 1–4** now if you haven't — the roadmap wants them read *during* Phase 3.

---

## Gate log

| Attempt | Date | Q1 | Q2 | Q3 | Notes |
|---|---|---|---|---|---|
| 1 |  | /11 | /7 | /6 |  |
| 2 |  | /11 | /7 | /6 |  |
