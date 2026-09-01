# 06 · Reliability, Fault Tolerance & Resilience

> **Why this exists:** three words used interchangeably in casual conversation that mean different things.
> Using them precisely is a cheap, immediate seniority signal. Using them loosely is a cheap, immediate
> junior signal.

---

## Reference

### The vocabulary, precisely

| Term | Definition | Test question |
|---|---|---|
| **Fault** | A *component* deviating from spec | "A disk died." Faults are **inevitable** |
| **Failure** | The *system as a whole* stops providing service | "The API is down." Failures are **preventable** |
| **Error** | A wrong result produced by a fault | "Returned the wrong balance" |
| **Reliability** | The system continues to work correctly *even when things go wrong* | "How often does it fail?" |
| **Fault tolerance** | Specific faults are *anticipated and handled* — no visible failure | "Which faults survive?" |
| **Resilience** | Ability to **recover** and adapt, including from *unanticipated* problems | "How fast do we come back?" |
| **Robustness** | Withstanding *expected* variation in input/load | "Does bad input break it?" |

**The one sentence to internalise (Kleppmann):**
> **The goal of fault tolerance is to prevent faults from becoming failures.**

Faults are inevitable — disks die, networks partition, someone deploys on a Friday. You cannot build a
system with no faults. You build one where a fault does not become a failure.

**Fault tolerance vs resilience — the distinction that matters:**
- **Fault tolerance** is about faults you *listed in advance*: "a node can die → we have 3 replicas."
- **Resilience** is about the ones you *didn't*: recovery, degradation, adaptation, chaos engineering,
  a rollback path, a runbook, an on-call human. It assumes you'll be surprised.

You cannot be fault-tolerant against an unknown fault. You can be resilient to it.

### Failure taxonomy — know the names

| Type | Meaning | Why it's hard |
|---|---|---|
| **Crash-stop** | Node dies and stays dead | The *easy* case |
| **Crash-recovery** | Node dies, comes back, maybe with stale state | Must reconcile state |
| **Omission** | Messages silently dropped | Looks like slowness |
| **Timing** | Response arrives, but too late to matter | Did it happen or not? |
| **Partial failure** | **Some** parts work, others don't | **The defining problem of distributed systems** |
| **Gray failure** | Degraded but passing health checks — "limping" | **The worst kind.** Your monitoring says green while users suffer |
| **Byzantine** | Component lies / behaves arbitrarily | Know the word; you'll never design for it outside blockchain/aerospace |

**Partial failure is the whole game.** In a single process, things work or crash. In a distributed system,
half of it works, which means you must decide what to do with the other half — every single time.

**Gray failure deserves special attention.** A node at 100% CPU still answers `/health` with 200 OK. A disk
returning data slowly isn't "down." These are the outages that last hours, because the dashboard is green.
→ This is why health checks are a design topic in Phase 2, and why you alert on *symptoms* (user-visible
latency/errors) not *causes* (CPU) in Phase 7.

### The fundamental problem (previewing Phase 4)

**You cannot distinguish a slow node from a dead one.**

You send a request. No response. Possible explanations:
- The node is dead
- The node is alive but slow (GC pause, overload)
- The request was lost in the network
- The response was lost in the network
- The node processed it and is about to answer

**All of these look identical from outside.** Every timeout is a guess. This single fact is the root of most
distributed-systems difficulty, and it's why "just retry" is dangerous (the work may have already happened →
you need idempotency). Fully unpacked in Phase 4.

### Where reliability comes from

| Layer | Techniques |
|---|---|
| **Hardware** | Redundant disks (RAID), dual PSU, multi-AZ, ECC memory |
| **Software** | Retries + backoff, timeouts, circuit breakers, bulkheads, idempotency, graceful degradation |
| **Data** | Replication, backups, checksums, WAL, erasure coding |
| **Process** | Canary deploys, code review, staged rollout, feature flags, **rollback**, chaos engineering, game days, blameless postmortems |

**The uncomfortable statistic: most outages are caused by change, not by hardware.** Deploys, config pushes,
migrations. Which means *deployment safety is a reliability feature* — canaries and one-click rollback buy
more reliability than another replica. → Phase 7.

### Human error is a design input, not an excuse

Systems must be reliable *despite* humans, because humans are the leading cause of incidents:

- Make the wrong thing hard to do (confirmation on destructive ops, no prod access by default)
- Make recovery fast and boring (one-click rollback, tested restores)
- Decouple the place mistakes happen from the place they're expensive (staging, dry-run, canary)
- **Blameless postmortems** — if people hide mistakes, you lose the data that prevents the next one

"Human error" as a postmortem root cause is a non-answer. The question is always: *why did the system permit
it, and why wasn't it caught before production?*

---

## In your own words

**Fault vs failure — define both, and state the relationship in one sentence.**

>

**Fault tolerance vs resilience — what can resilience handle that fault tolerance can't?**

>

**What is a gray failure? Why is it worse than a crash? Give an example from your own experience.**

>

**Why can't you tell a slow node from a dead one? Why does that make retries dangerous?**

>

**Most outages come from change, not hardware. What does that imply about where to spend reliability effort?**

>

---

## Links

- Failure models, partial failure, the eight fallacies → Phase 4
- Circuit breakers, bulkheads, load shedding, chaos engineering → Phase 7
- Health checks and why deep ones cause correlated failure → Phase 2
- Idempotency as the answer to "did my retry double-charge them?" → Phase 3E / Phase 6
