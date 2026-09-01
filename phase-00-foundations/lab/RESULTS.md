# Lab Results — Phase 0

**Fill this in with YOUR numbers, not the reference ones.**
The recording is the deliverable — an unrecorded measurement is one you won't have in an interview.

Date run: ______________
Machine: ______________ (cores / RAM — it affects the numbers)

---

## Experiment 1 — Baseline (`/api/simple`, RPS=200, 30s)

| Metric | Value |
|---|---|
| min |  |
| **p50 (med)** |  |
| avg |  |
| p90 |  |
| p95 |  |
| **p99** |  |
| max |  |

**p99 ÷ p50 ratio = ______**

**Q: This system is healthy and doing almost no work. Why is p99 still several times p50?**

>

**Q: Is your avg above or below your median? What does that tell you about the distribution?**

>

---

## Experiment 2 — 200 ms injected into the dependency (`baseMs=205`)

| Metric | Baseline | With 200 ms delay | Change |
|---|---|---|---|
| p50 |  |  | ×___ |
| p95 |  |  | ×___ |
| **p99** |  |  | ×___ |
| max |  |  | ×___ |

**Q: Your service's own code didn't change at all. What does that prove about where your latency comes from?**

>

**Q: Little's Law — at 200 req/s and your measured p50, how many requests are in flight?**
`L = λ × W = ______ × ______ = ______`

>

**Q: At what dependency latency can your service no longer sustain 200 req/s?**
Compute it first, then verify by raising `baseMs` until it breaks. Predicted: ______  Actual: ______

>

**Q: Nothing crashed and nothing alerted, but users saw a 30× regression. What is this failure called, and
why is it worse than a crash?**

>

---

## Experiment 3 — Tail latency amplification

Dependency unchanged throughout: fast 99% of the time, +205 ms 1% of the time.

| Fan-out N | p50 | p90 | p95 | p99 | avg |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 10 |  |  |  |  |  |
| 100 |  |  |  |  |  |

### Predicted vs measured

`P(at least one slow) = 1 − 0.99^N`

| N | Predicted % slow | Predicted percentile where slow path starts | Measured — did it match? |
|---|---|---|---|
| 1 | 1.0% | p99 |  |
| 10 | 9.6% | p90.4 |  |
| 100 | 63.4% | p36.6 (**the median**) |  |

**Q: At fan-out 100, what happened to your p50, and what does it equal?**

>

**Q: Compare avg and p50 at fan-out 100. Which is larger? Explain why, and what that means for anyone
reporting "average latency" on a dashboard.**

>

**Q: Why does p99 barely change between fan-out 10 and fan-out 100?**

>

**Q: A colleague proposes adding one more service to a call path that already fans out to 50. Using your own
numbers, what do you tell them?**

>

---

## Bonus experiments (if run)

| Experiment | What changed | Result | What it taught me |
|---|---|---|---|
| A · keep-alive off |  |  |  |
| B · maxSockets=10 |  |  |  |
| C · slowProbability=0.05 |  |  |  |
| D · closed-model (constant-vus) |  |  |  |

---

## The three sentences I'd say in an interview

Write these as you'd actually say them out loud. These are what you're taking out of this lab.

**1 · On why averages are useless:**

>

**2 · On tail latency amplification:**

>

**3 · On what happens when a dependency slows down (not fails):**

>
