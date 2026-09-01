# Phase 4 — Gate

> **Rules:** Out loud. From memory. No notes.
> Q2 should be done **at a whiteboard**, drawing as you talk.

---

## Q1 · State CAP correctly, and explain why "CP vs AP" is an incomplete way to describe a database

**You pass if:**

- [ ] ⭐ **Stated precisely:** *during a network partition*, choose between **linearizability** and
      **availability**
- [ ] **You do not choose P** — partitions are a fact of the environment, not a design option. So "pick two
      of three" is wrong.
- [ ] ⭐ **CAP says nothing about normal operation** — which is 99.9% of the time
- [ ] The C is **linearizability specifically**, not the C in ACID
- [ ] "Available" has **no latency bound** — a 30-second response counts

**Why CP/AP is incomplete — you need at least two of these four:**

- [ ] ⭐ **It's a per-operation choice, not a database personality** — Cassandra at `QUORUM` vs `ONE`
      behaves oppositely. **Cite your own lab measurement.**
- [ ] It ignores the no-partition case entirely
- [ ] "Not CP" spans everything from causal consistency to eventual — a whole spectrum
- [ ] "Available" doesn't mean "usable"

**And:**
- [ ] ⭐ **PACELC**: *if Partitioned → A or C; Else → Latency or Consistency*, and the **"else" half is the
      trade you're actually making every day**
- [ ] Bonus: CAP is a poor design tool; reason about specific consistency models instead

**Self-score:** ___ / 9

---

## Q2 · Whiteboard Raft: leader election and log replication

**Election — you pass if:**

- [ ] Three roles (leader/follower/candidate) and the **term** as a logical clock
- [ ] ⭐ **"A node seeing a higher term immediately becomes a follower"** — the rule that makes stale leaders
      step down
- [ ] Timeout → increment term → candidate → vote for self → RequestVote
- [ ] **One vote per term**; majority wins
- [ ] ⭐ **Election timeouts are randomised** — otherwise permanent split votes
- [ ] ⭐ **A vote is only granted if the candidate's log is at least as up to date** — which is why a new
      leader always has every committed entry, so Raft never transfers missing entries to a leader
- [ ] Three outcomes: win / see a higher term and step down / split vote → retry

**Log replication — you pass if:**

- [ ] Client → leader → append locally → AppendEntries in parallel
- [ ] ⭐ **Commit point = a MAJORITY has acked** (not all; not the client reply)
- [ ] Then apply, reply to client, propagate `commitIndex`
- [ ] **Log Matching Property** and the preceding-index consistency check
- [ ] ⭐ **The leader's log is authoritative** — conflicting follower entries are overwritten
- [ ] Bonus: a leader may not directly commit entries from a **previous term** (commits a no-op instead)
- [ ] Bonus: **ReadIndex** — a leader must confirm it still leads before serving a linearizable read
- [ ] Bonus: majority arithmetic — 3 and 4 both tolerate 1, so **always odd**

**Self-score:** ___ / 15

---

## Q3 · Explain why a distributed lock without fencing is unsafe, with a concrete failure sequence

**You pass if you walked the sequence:**

- [ ] A acquires the lock with a lease
- [ ] ⭐ **A stalls** — GC pause, blocked disk, VM migration — **and does not know it stalled**
- [ ] The lease expires; the lock is free; A still believes it holds it
- [ ] B acquires the lock and writes
- [ ] **A wakes and writes, overwriting B**
- [ ] ⭐ **The lock service was never wrong** — both clients behaved correctly. A lock tells you only what
      was true *at the moment you asked*.

**The fix:**

- [ ] Monotonically increasing **fencing token** per grant
- [ ] ⭐⭐ **The RESOURCE enforces it** — not the lock service, not the client
- [ ] ⭐ **You cannot fix this with a better lock service** — the stall window always exists; you can only
      make the late write **harmless**
- [ ] Where tokens come from: etcd revision · ZooKeeper zxid · Raft term · a DB version column
- [ ] Bonus: **Redis has no native token** — the heart of the Redlock critique, and your position on it
      (efficiency vs correctness)
- [ ] Bonus: often the best answer is **no lock at all** — unique constraint, `SKIP LOCKED`, conditional
      update, or partition-by-entity

**Self-score:** ___ / 11

---

## Q4 · Order five consistency models, with a product requirement for each

**You pass if you ordered them and paired each with a requirement:**

- [ ] **Linearizable** — distributed lock / leader election / unique username claim / seat booking
- [ ] **Sequential** — all replicas agree on one order, real time not required
- [ ] **Causal** — comment threads: a reply must never appear before the post
- [ ] **Read-your-own-writes** — posting a comment and seeing it on refresh
- [ ] **Eventual** — like counts, view counts, recommendations

**Bonus:**
- [ ] ⭐ **Causal is the strongest model available while staying available during a partition**
- [ ] The **client-centric** guarantees (read-your-writes, monotonic reads, monotonic writes, consistent
      prefix) are what users actually notice — and are more productive to design around
- [ ] Serializability (transaction interleaving) vs linearizability (real-time recency) are **orthogonal**

**Self-score:** ___ / 8

---

## Extra checks

- [ ] The **eight fallacies** — which two cause the most damage?
- [ ] ⭐ **Why can't you distinguish a slow node from a dead one?** Name four consequences.
- [ ] **Gray failure** — define it and cite your Phase 2 numbers
- [ ] **FLP** — state it, and explain how Raft works anyway (safety vs liveness)
- [ ] ⭐ **Why are timestamps not ordering?** Give the LWW data-loss example.
- [ ] **Lamport vs vector clocks** — what does the vector buy?
- [ ] **HLC** — why is it the practical modern choice?
- [ ] ⭐ **Why is `R + W > N` not consensus?** Three reasons.
- [ ] **Why is an even node count strictly worse?**
- [ ] **Total order broadcast ≡ consensus** — why does that make a log the natural implementation?
- [ ] **How do real systems scale consensus**, given more nodes = slower?
- [ ] **Why does Raft exist** rather than Paxos?
- [ ] **Phi-accrual** — what does it give you over a fixed timeout?
- [ ] **SWIM's indirect probing** — what distinction does it make?
- [ ] **Gossip is not consensus** — what is each for?
- [ ] **CRDT** — the three algebraic properties, and why "convergence ≠ correctness"
- [ ] **Backpressure** — why is an unbounded queue the worst default?
- [ ] ⭐ **Hedged requests** — why is the extra load only ~5%, and when is it the wrong tool?
- [ ] **Head-of-line blocking** at four different layers

---

## Scoring

| Result | Do this |
|---|---|
| All four passed + most extras | ✅ Advance to **Phase 5 — Caching** |
| Fumbled any of Q1–Q4 | ⛔ Redo that note's "own words" section, retry in 2 days |

| Fumbled | Redo |
|---|---|
| Q1 | [notes/02](notes/02-cap-and-pacelc.md) |
| Q2 | [notes/06](notes/06-raft.md) — then whiteboard it twice more, and re-run `leader-election.sh` |
| Q3 | [notes/08](notes/08-coordination-services-and-fencing.md) + re-run `fencing.sh` |
| Q4 | [notes/03](notes/03-consistency-models.md) |

---

## Before Phase 5

- [ ] **DDIA ch. 5–9 finished.** This was the highest-value reading in the roadmap; don't leave it half done.
- [ ] ⭐ **You should be at 3–4 practice problems by now** (roadmap: Week 7). If you're at zero, do URL
      shortener and rate limiter this week — Phase 5 (caching) makes both much richer, and being behind on
      practice is the failure mode the roadmap warns about hardest.

---

## Gate log

| Attempt | Date | Q1 | Q2 | Q3 | Q4 | Notes |
|---|---|---|---|---|---|---|
| 1 |  | /9 | /15 | /11 | /8 |  |
| 2 |  | /9 | /15 | /11 | /8 |  |
