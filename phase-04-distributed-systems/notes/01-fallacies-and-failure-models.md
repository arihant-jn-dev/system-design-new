# 04·01 · The Eight Fallacies & Failure Models

> **Why this exists:** the roadmap says *"read once, remember forever."* Every distributed-systems bug is
> ultimately someone assuming one of these eight things. And the failure taxonomy gives you the vocabulary to
> say precisely *how* something broke.

---

## Reference

### The eight fallacies of distributed computing

*(Peter Deutsch et al., Sun Microsystems, 1994 — still exactly right.)*

| # | Fallacy | What it actually costs you |
|---|---|---|
| 1 | **The network is reliable** | Packets are lost, connections drop. → retries, idempotency ([Phase 1 note 09](../../phase-01-networking/notes/09-idempotency.md)) |
| 2 | **Latency is zero** | 0.5 ms in-DC, **150 ms cross-continent** ([Phase 0 note 02](../../phase-00-foundations/notes/02-latency-numbers.md)). Chatty designs die. |
| 3 | **Bandwidth is infinite** | Payload size matters; egress costs money ([Phase 0 note 11](../../phase-00-foundations/notes/11-cost-dimensions.md)) |
| 4 | **The network is secure** | mTLS, zero-trust (Phase 10) |
| 5 | **Topology doesn't change** | Autoscaling, failover, redeploys — **it changes constantly**. → service discovery |
| 6 | **There is one administrator** | Multiple teams, cloud providers, third parties. Nobody sees the whole system. |
| 7 | **Transport cost is zero** | Serialisation CPU, connection setup, TLS handshakes ([Phase 1 note 04](../../phase-01-networking/notes/04-tls.md)) |
| 8 | **The network is homogeneous** | Mixed protocols, versions, MTUs, mobile vs fibre |

**Fallacies 1 and 2 cause the most damage** — they're behind retry storms, cascading failures, and every
design that works in staging and dies in production.

### Failure models — the vocabulary

| Model | Meaning | Difficulty |
|---|---|---|
| **Crash-stop (fail-stop)** | Node dies and stays dead | **Easiest.** What most textbook algorithms assume. |
| **Crash-recovery** | Node dies, returns, possibly with stale state | Must reconcile; needs durable state |
| **Omission** | Messages silently dropped (send or receive) | Looks identical to slowness |
| **Timing** | Response arrives, but too late to be useful | Did it happen or not? |
| **Partial failure** | **Some parts work, others don't** | ⭐ **The defining problem of distributed systems** |
| **Gray failure** | Degraded but passing health checks — "limping" | ⭐ **The worst in practice** |
| **Byzantine** | Arbitrary/malicious behaviour, lying | Know the word; you'll never design for it outside blockchain/aerospace |

**Partial failure is the whole discipline.** In a single process, code works or the process crashes. In a
distributed system, **half of it works**, and you must decide what to do about the other half — on every
request.

**Gray failure deserves emphasis** because you *measured* it: in the
[Phase 2 lab](../../phase-02-stateless-scaling/lab/), a hanging replica gave **0% errors, an unchanged
median, and a green health check — with p99 143× worse.** Every dashboard was fine.

### ⭐ The root difficulty: you cannot distinguish a slow node from a dead one

You send a request. No response. The possibilities:

```
· the node is dead
· the node is alive but slow (GC pause, overload, blocked disk)
· the request was lost in the network
· the response was lost in the network
· the node processed it and is about to reply
```

**All five are indistinguishable from outside.** There is no test that separates them — this isn't an
engineering limitation, it's a property of asynchronous networks.

**Everything downstream follows from this one fact:**

| Consequence | Where |
|---|---|
| **Every timeout is a guess** | Failure detection ([09](09-failure-detection-and-gossip.md)) |
| **Retries may duplicate work** → need idempotency | [Phase 1 note 09](../../phase-01-networking/notes/09-idempotency.md) |
| **"Exactly-once delivery" is impossible** | [3e-06](../../phase-03-databases/notes/3e-06-exactly-once.md) |
| **Failover can cause split brain** | [3c-04](../../phase-03-databases/notes/3c-04-failover.md) |
| **A lock holder may stall** → fencing tokens | [08](08-coordination-services-and-fencing.md) |
| **Consensus needs majorities**, not unanimity | [06-raft](06-raft.md) |
| **FLP impossibility** | Below |

> **If you internalise one thing from Phase 4, make it this.** Almost every hard problem in the phase is a
> corollary.

### The two impossibility results

**FLP (Fischer, Lynch, Paterson 1985):** in an **asynchronous** system with **even one** faulty process,
**no deterministic algorithm can guarantee consensus** — because you can't distinguish a crashed process from
a slow one.

**Why consensus works anyway:** real systems sidestep FLP with **randomisation** (randomised election
timeouts — Raft) and **partial synchrony** (assume the network is *eventually* well-behaved). **Raft
guarantees safety always, and liveness only when the network settles.**

> That distinction is worth stating: *"Raft never produces two leaders in one term — that's safety, and it's
> unconditional. It may fail to elect a leader during sustained network chaos — that's liveness, and FLP says
> you can't have it unconditionally."*

**The Two Generals Problem:** two parties over a lossy channel can never be *certain* they agree. This is why
[exactly-once delivery](../../phase-03-databases/notes/3e-06-exactly-once.md) is impossible.

### The synchrony spectrum

| Model | Assumes | Reality |
|---|---|---|
| **Synchronous** | Bounded message delay and processing time | ❌ Doesn't exist |
| **Partially synchronous** | Eventually bounded, after an unknown point | ✅ **What real systems assume** |
| **Asynchronous** | No bounds at all | Theoretically clean; FLP applies |

**Almost everything you'll use assumes partial synchrony**: safety always, liveness eventually.

---

## In your own words

**List the eight fallacies. Which two cause the most damage, and why?**

>

**Why is partial failure "the defining problem"? Contrast with a single process.**

>

**What is a gray failure? Cite the numbers you measured in the Phase 2 lab.**

>

**Enumerate the five possibilities when a request gets no response. Why can't you tell them apart?**

>

**Name four consequences of that single fact.**

>

**State FLP, and explain how Raft works anyway. Distinguish safety from liveness.**

>

---

## Links

- Reliability vocabulary → [Phase 0 note 06](../../phase-00-foundations/notes/06-reliability-fault-tolerance-resilience.md)
- Gray failure, measured → [Phase 2 lab](../../phase-02-stateless-scaling/lab/)
- Failure detection → [09-failure-detection-and-gossip.md](09-failure-detection-and-gossip.md)
- **DDIA ch. 8**, "The Trouble with Distributed Systems"
