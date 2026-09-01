# Phase 4 — Distributed Systems Theory

**Week 7 · ~10 hrs**

---

## Why this phase exists

The roadmap's framing: *"The layer that lets you **reason** instead of pattern-match. Keep it practical — you
need working intuition, not proofs."*

Phases 0–3 gave you the *mechanisms*: replication lag, quorums, failover, fencing, split brain. This phase
gives you the **theory those mechanisms are instances of** — so that when you meet a system you've never seen,
you can reason about it rather than recall it.

**The one idea underneath everything here:** you cannot distinguish a slow node from a dead one. Almost every
hard problem in this phase is a corollary of that single fact.

---

## How to work this phase

| Step | Do this | Time |
|---|---|---|
| 1 | Read [`notes/`](notes/) 01 → 12. Reference half, once. | ~2 hrs |
| 2 | Fill in the "In your own words" halves. **The actual work.** | ~3 hrs |
| 3 | [`lab/`](lab/) — 3-node etcd: pause the leader, watch re-election | ~1 hr |
| 4 | [`lab/`](lab/) — build the fencing-token demo and break it | ~1 hr |
| 5 | ⭐ **Whiteboard Raft from memory.** Election, then log replication. Twice. | ~1 hr |
| 6 | [`GATE.md`](GATE.md) out loud. | ~1 hr |

> **Read DDIA chapters 5–9 alongside this.** The roadmap calls it *"the single highest-value reading in the
> entire roadmap"* — and by now you should be able to read it fast, with recognition rather than confusion.

---

## Topics

| # | Note | The one thing it's for |
|---|---|---|
| 01 | [Fallacies & failure models](notes/01-fallacies-and-failure-models.md) | The 8 fallacies · partial & gray failure · **why slow ≠ dead** · FLP |
| 02 | [CAP & PACELC](notes/02-cap-and-pacelc.md) | **Gate Q1** — CAP stated correctly, and why CP/AP is incomplete |
| 03 | [Consistency models](notes/03-consistency-models.md) | **Gate Q4** — linearizable → causal → eventual, + client-centric |
| 04 | [Time & clocks](notes/04-time-and-clocks.md) | **Why timestamps are not ordering** · Lamport, vector, HLC, TrueTime |
| 05 | [Quorums & consensus](notes/05-quorums-and-consensus.md) | Why **R+W>N is not consensus** · why even node counts are wasteful |
| 06 | [Raft](notes/06-raft.md) | **Gate Q2** — election and log replication, in detail |
| 07 | [Paxos, ZAB & alternatives](notes/07-paxos-zab-and-alternatives.md) | Awareness — and **why Raft exists** |
| 08 | [Coordination, leases & fencing](notes/08-coordination-services-and-fencing.md) | **Gate Q3** — the unsafe-lock sequence · Redlock |
| 09 | [Failure detection & gossip](notes/09-failure-detection-and-gossip.md) | Heartbeats, phi-accrual, **SWIM** |
| 10 | [CRDTs & collaborative state](notes/10-crdts-and-collaborative-state.md) | G-counter, OR-set, OT vs CRDT |
| 11 | [Backpressure & flow control](notes/11-backpressure-and-flow-control.md) | Unbounded queues are the enemy |
| 12 | [Tail latency & stragglers](notes/12-tail-latency-and-stragglers.md) | **Hedged requests** · HOL blocking at four layers |

---

## Lab

[`lab/`](lab/) — a 3-node **etcd** cluster (Raft) plus a small "resource" service that enforces fencing tokens.

**A · Leader election** — the roadmap is specific: **`kill -STOP` the leader, don't kill it.** A killed
process is the easy failure; a *paused* one is alive, doesn't know it lost anything, and has no idea time
passed when it resumes. That's a GC pause, and it's how split brain actually happens. You'll watch the term
increment, a new leader get elected by majority, and the old leader step down on resume.

**B · Fencing tokens** — the same failure sequence run twice, once with the resource ignoring tokens and once
enforcing them. **Without fencing, the stalled client's late write destroys the new lock-holder's data.**
That's gate Q3, demonstrated rather than described.

Both are fast — etcd starts in seconds, unlike the Phase 3 Cassandra cluster.

---

## Definition of done

- [ ] All 12 notes have the "In your own words" half filled in
- [ ] You watched a Raft term increment and a leader step down
- [ ] You produced **both** fencing outcomes — corrupted, then protected
- [ ] You can whiteboard Raft election + log replication from memory, unprompted
- [ ] You can state CAP correctly **and** say why CP/AP is incomplete
- [ ] You can order five consistency models with a product requirement for each
- [ ] [`GATE.md`](GATE.md) passed out loud
- [ ] DDIA ch. 5–9 read
