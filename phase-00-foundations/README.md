# Phase 0 — Foundations & Vocabulary

**Week 1 · ~8 hrs**

---

## Why this phase exists

Every later phase is *expressed in this vocabulary*. When you say "this design is highly available" in an
interview and the interviewer hears a word you can't define precisely, they stop trusting the rest of the
answer. Vagueness here is not a small leak — it's a permanent one, because it contaminates every sentence
you say for the next 45 minutes.

This is also the cheapest phase to get right. The content is small. The precision is what takes the week.

**The specific failure this phase prevents:** saying *"we'll scale it"* / *"it'll be fast"* / *"it's reliable"*
instead of *"12 K QPS at peak, p99 under 200 ms, 99.9% monthly, and here's what breaks first."*

---

## How to work this phase (in order)

| Step | Do this | Time |
|---|---|---|
| 1 | Read [`notes/`](notes/) 01 → 11. Read the Reference half **once**. | ~1 hr |
| 2 | Fill in the "In your own words" half of each note. **This is the actual work.** | ~2.5 hrs |
| 3 | Run [`drills/`](drills/) — 10 estimation problems, timed, on paper. | ~1.5 hrs |
| 4 | Run the [`lab/`](lab/) and write real numbers into `lab/RESULTS.md`. | ~1.5 hrs |
| 5 | Attempt [`GATE.md`](GATE.md) out loud, from memory. Re-do steps 2–4 on whatever you fumbled. | ~1 hr |

Do **not** do step 3 before step 2. Estimation drills feel productive and are a very comfortable place to
hide from the harder work of defining "availability" precisely.

---

## Topics covered (maps 1:1 to the roadmap)

| # | Note | The one thing it's for |
|---|---|---|
| 01 | [Napkin math](notes/01-napkin-math.md) | Turn "100 M users" into QPS, TB/year, Gbps — in under 3 minutes |
| 02 | [Latency numbers](notes/02-latency-numbers.md) | Know instantly whether an idea is off by 1000× |
| 03 | [Latency vs throughput](notes/03-latency-vs-throughput.md) | Why optimising one can destroy the other |
| 04 | [Percentiles & tail latency](notes/04-percentiles-and-tail-latency.md) | Why averages are useless; why fan-out is dangerous |
| 05 | [Availability vs durability](notes/05-availability-vs-durability.md) | Nines cost; availability *multiplies* across dependencies |
| 06 | [Reliability, fault tolerance, resilience](notes/06-reliability-fault-tolerance-resilience.md) | Three words most people use interchangeably and shouldn't |
| 07 | [Consistency (informal)](notes/07-consistency-informal.md) | Enough to reason now; formalised in Phase 4 |
| 08 | [SLI / SLO / SLA & error budgets](notes/08-sli-slo-sla-error-budgets.md) | Availability as an engineering *decision tool*, not a slogan |
| 09 | [Scalability & elasticity](notes/09-scalability-and-elasticity.md) | Vertical vs horizontal, and when vertical is genuinely right |
| 10 | [Workload shape](notes/10-workload-shape.md) | Read-heavy vs write-heavy — drives half of all design decisions |
| 11 | [Cost dimensions](notes/11-cost-dimensions.md) | The senior axis nobody mentions: egress, ops burden, TCO |

---

## Lab

[`lab/`](lab/) — a two-service system (app → dependency) in Docker, load-tested with k6.

You will measure three things with your own eyes:

1. **Baseline p50 vs p99** on a healthy service — and see how far apart they already are.
2. **What a 200 ms dependency does to your p99** — the roadmap's assignment.
3. **Tail latency amplification** — the same dependency, fanned out to 1 / 10 / 100 calls. A 1%-slow
   dependency makes a 100-way fan-out slow **63% of the time**. Watching that number appear on your own
   terminal is worth more than reading the formula ten times.

No local installs needed beyond Docker — k6 runs from its own image.

---

## Gate

[`GATE.md`](GATE.md) — three questions, answered out loud, from memory, no notes.

Record yourself on the third one. It is unpleasant and it is the fastest feedback available.

---

## Definition of done

- [ ] All 11 notes have the "In your own words" half filled in
- [ ] 10/10 estimation drills done; the last 3 took under 3 minutes each
- [ ] `lab/RESULTS.md` contains **real numbers you measured**, not placeholders
- [ ] All 3 gate questions answered out loud from memory
- [ ] You can state the difference between availability and durability without pausing
