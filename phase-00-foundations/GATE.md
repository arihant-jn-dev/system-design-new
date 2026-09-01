# Phase 0 — Gate

> **Rules:** Out loud. From memory. **No notes, no peeking at this file's hints.**
> If you can't, don't advance to Phase 1. Skipping gates is how people end up "knowing" 40 topics and
> failing every round.

**Record yourself on Q3.** Watching it back is unpleasant and is the fastest feedback available anywhere in
this roadmap.

---

## Q1 · Estimate storage + QPS + bandwidth for a Twitter-scale system in under 3 minutes, on paper

**Setup:** timer, pen, paper, no calculator. Talk the whole time.

**You pass if:**

- [ ] You **stated your assumptions out loud** before computing (DAU, posts/user/day, bytes/post, read:write ratio)
- [ ] You used `1 day ≈ 10^5 s` rather than 86,400
- [ ] You gave **both average and peak** QPS, and said which was which
- [ ] You multiplied storage by **~3 for replication** and mentioned indexes/overhead on top
- [ ] You separated **read** bandwidth from **write** bandwidth
- [ ] You finished **under 3 minutes**
- [ ] ⭐ **You ended with a conclusion, not a number** — something like *"so writes are trivial and the whole
      problem is 1.5 M read QPS and 12 Gbps, which makes this a caching and fan-out problem, not a database
      problem."*

**The last box is the one being marked.** An estimate you don't use is theatre.

**Self-score:** ___ / 7

---

## Q2 · Explain why a service with 99.99% availability can still be a terrible experience

**You pass if you gave at least 3 of these 4 distinct reasons, unprompted:**

- [ ] **Availability ignores latency.** A 200 OK after 30 seconds counts as available. *Slow is the new down.*
- [ ] **It's an average over time, so it hides concentration.** 52 min/year spread as 8 s/day is invisible;
      the same 52 minutes in one block at peak is a company-level incident. Identical SLA number.
- [ ] **It measures response, not correctness.** Stale, empty or wrong data returned with a 200 scores as
      perfect availability. Silent data corruption is 100% available.
- [ ] **It misses partial failure.** Checkout works, search is down — most SLIs read fine while the product
      is unusable.

**Bonus (⭐ strong signal):**

- [ ] You named the fix: **measure SLIs on latency and correctness, not just uptime** — e.g. *"fraction of
      requests returning 2xx **in under 300 ms**"* — and measure from the client, not the load balancer.
- [ ] You mentioned availability **multiplies** across dependencies (10 services × 99.9% = 99%).

**Self-score:** ___ / 4 (+bonus)

---

## Q3 · Explain tail latency amplification to a junior dev

**Constraint: no jargon in the first 30 seconds.** If you open with "the p99 of the fan-out is the max of the
distribution," you have failed the actual skill being tested, which is *communication*.

**You pass if:**

- [ ] You opened with an **analogy or concrete scenario**, not a definition
- [ ] You stated the mechanism: **waiting for all N means your latency is the SLOWEST of N, not the average**
- [ ] You gave **the numbers**: 1% slow each → 10 calls ≈ 10% slow → **100 calls ≈ 63% slow**
- [ ] You said the punchline explicitly: **"your dependency's p99 becomes your p50"**
- [ ] You named at least two mitigations (reduce fan-out / don't wait for all / hedged requests / deadline
      propagation / fix the actual tail)
- [ ] ⭐ **You referenced your own lab measurement** — *"I measured this: at fan-out 100 my median went from
      7 ms to 212 ms and my average dropped below my median"*

**Reference analogy** (only read this after your attempt — use your own):
> *"Imagine you ask 100 friends a question and you can't leave until everyone answers. Even if each friend is
> usually quick, you only need one to be in the shower. With 100 friends, someone always is. Your wait isn't
> the average friend — it's the slowest friend, every single time."*

**Self-score:** ___ / 6

---

## Extra checks — these come up constantly and aren't in the roadmap's gate

Worth being able to answer cold before you move on:

- [ ] **Latency vs throughput** — define both without using the other word. Give a technique that improves one and hurts the other.
- [ ] **Little's Law** — state it, and use it: 500 QPS at 100 ms = how many in flight?
- [ ] **Availability vs durability** — define both. Give a system that should choose each.
- [ ] **Why "we have 3 replicas" is not a backup strategy.**
- [ ] **SLI vs SLO vs SLA** — one line each, and why the SLA must be looser than the SLO.
- [ ] **Error budget** — 99.9% over 28 days = how many minutes? What do you do if 80% is unspent?
- [ ] **Argue for vertical scaling.** Include the trigger that would make you revisit.
- [ ] **Read-heavy vs write-heavy** — why is one a caching problem and the other a partitioning problem?
- [ ] **Name the four latency numbers** (RAM / SSD / same-DC RTT / cross-continent) and one design consequence of each.
- [ ] **Egress** — why is it the sneaky cost? Give a worked example.

---

## Scoring

| Result | Do this |
|---|---|
| **All three gate questions passed + most extras** | ✅ Advance to Phase 1. Update the tracker in [`../README.md`](../README.md). |
| **Passed Q1–Q3 but fumbled extras** | Advance, but re-read the specific notes this week |
| **Fumbled any of Q1–Q3** | ⛔ **Don't advance.** Redo the "In your own words" section of the relevant note, then re-attempt in 2 days. |

**Which note to redo:**

| Fumbled | Redo |
|---|---|
| Q1 | [notes/01](notes/01-napkin-math.md) + all 10 [drills](drills/) |
| Q2 | [notes/05](notes/05-availability-vs-durability.md) + [notes/08](notes/08-sli-slo-sla-error-budgets.md) |
| Q3 | [notes/04](notes/04-percentiles-and-tail-latency.md) + re-run [lab](lab/) Experiment 3 |

---

## Gate log

| Attempt | Date | Q1 | Q2 | Q3 | Notes |
|---|---|---|---|---|---|
| 1 |  | /7 | /4 | /6 |  |
| 2 |  | /7 | /4 | /6 |  |
