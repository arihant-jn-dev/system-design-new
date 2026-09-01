# 3E·02 · Two-Phase Commit (2PC)

> **Why this exists:** 2PC is the textbook answer and it's **rarely the right one in practice**. Knowing the
> protocol matters less than knowing its one fatal flaw — **the coordinator-failure blocking problem** —
> because that's what the follow-up question is about.

---

## Reference

### The protocol

A **coordinator** drives all participants to the same decision.

```
PHASE 1 — PREPARE (voting)
  coordinator ──"can you commit?"──▶ participants
  each participant:
     · does all the work
     · durably writes "I am PREPARED and CAN commit"   ← the irrevocable promise
     · holds its locks
     · replies YES or NO
  coordinator durably logs the DECISION (commit iff all YES)   ← the commit point

PHASE 2 — COMMIT / ABORT
  coordinator ──"commit!"──▶ participants
  each participant commits, releases locks, acks
```

**The key property:** once a participant votes YES, it has **given up the right to abort unilaterally.** It
must be able to commit even after crashing and restarting — which is why the prepared state is written to
durable storage before voting.

**The commit point is when the coordinator writes its decision**, not when participants ack. After that
moment, the transaction *will* complete, however long it takes.

### ⚠️ The fatal flaw: coordinator failure blocks everyone

```
1. All participants vote YES and are now PREPARED
2. The coordinator CRASHES before sending the decision
3. Every participant is stuck:
     · it cannot commit  (it doesn't know if others voted yes)
     · it cannot abort   (it promised it could commit)
     · it HOLDS ITS LOCKS the entire time
4. Those locks block every other transaction touching those rows
5. Recovery requires the coordinator to come back and read its log
   -- or a human to manually resolve each "in-doubt" transaction
```

> **This is why 2PC is called a *blocking* protocol, and it's the single most important fact about it.**
> A crashed coordinator can freeze an unbounded number of rows across multiple databases indefinitely.

**The consequences that follow:**

- **The coordinator is a single point of failure**, so it must itself be replicated — which needs **consensus**
  (Raft), so you've built a consensus system to support your commit protocol
- **The coordinator's log is critical state.** Losing it means orphaned in-doubt transactions that only a
  human can resolve.
- Every DBA who has run XA transactions has a story about manually resolving in-doubt transactions

### Why 2PC is slow

| Cost | Detail |
|---|---|
| **2 round trips minimum** | Prepare + commit, to every participant |
| **Multiple fsyncs** | Each participant on prepare, coordinator on decide, each on commit |
| **Locks held for the whole protocol** | Not just your local work — a full network round trip plus a coordinator decision |
| **Latency = the SLOWEST participant** | Tail latency amplification ([Phase 0 note 04](../../phase-00-foundations/notes/04-percentiles-and-tail-latency.md)) |
| **Availability = the product** | Any participant down = no transaction ([3e-01](3e-01-why-distributed-transactions-are-hard.md)) |

**Measured throughput penalties of 10× or more** compared to single-node transactions are typical.

### 3PC — and why nobody uses it

Three-Phase Commit adds a `pre-commit` phase so participants can reach a decision without the coordinator,
making it **non-blocking**.

**Why it's not used:**
- It assumes **bounded network delay and bounded response times** — a *synchronous* network model. Real
  networks are asynchronous.
- **Under a network partition it can produce inconsistent results** — worse than blocking
- An extra round trip makes it even slower
- **The actual solution to "the coordinator is a SPOF" is consensus (Raft/Paxos), not 3PC**

> **The one-line answer: "3PC trades blocking for the risk of inconsistency under partition, and it requires
> a synchronous network that doesn't exist. In practice you make the coordinator fault-tolerant with Raft
> instead."**

### Where 2PC actually appears

| System | Notes |
|---|---|
| **XA transactions** (JTA, MSDTC) | The classic enterprise implementation. Widely regretted. |
| **Postgres prepared transactions** | `PREPARE TRANSACTION` / `COMMIT PREPARED`. ⚠️ `max_prepared_transactions` is **0 by default** — Postgres ships with it disabled, which tells you something. |
| **Kafka transactions** | A 2PC-like protocol between the producer and the transaction coordinator → Phase 6 |
| **Spanner, TiDB, CockroachDB** | 2PC **on top of Raft-replicated participants** — so the coordinator isn't a SPOF ([3e-05](3e-05-spanner-and-percolator.md)) |
| **MySQL internal XA** | Between the binlog and InnoDB — a 2PC you use without knowing |

**That last row is worth knowing:** MySQL uses 2PC internally to keep the binlog and the storage engine
consistent. **2PC is fine when the participants are inside one process on one machine.** It's the
*distributed* part that hurts.

### When 2PC is defensible

- **Participants are Raft-replicated** so the coordinator and participants don't have single points of
  failure (the Spanner/CockroachDB model)
- **Low volume, high value** — a handful of transactions per second where correctness dominates
- **Within one trust and latency domain** — same datacentre, low RTT
- **A short-lived transaction** so lock hold times stay small

> **The answer to give:** *"I'd avoid 2PC for cross-service transactions. It's blocking — if the coordinator
> dies between prepare and commit, every participant holds locks indefinitely — and the transaction is less
> available than any participant. I'd use a saga with compensations, or restructure so the transaction fits
> in one database. Where I *would* accept 2PC is inside a distributed SQL database like CockroachDB, where
> the participants are Raft groups and the coordinator isn't a single point of failure."*

---

## In your own words

**Walk the protocol. What exactly happens at the commit point?**

>

**Why can't a prepared participant abort on its own?**

>

**Describe the coordinator-failure blocking problem and its full consequences.**

>

**Give four reasons 2PC is slow.**

>

**Why doesn't 3PC solve the problem? What actually does?**

>

**Postgres ships with `max_prepared_transactions = 0`. What does that tell you?**

>

**When is 2PC defensible? Give the condition that makes it acceptable.**

>

---

## Links

- Why distributed transactions are hard at all → [3e-01](3e-01-why-distributed-transactions-are-hard.md)
- **The practical alternative** → [3e-03-sagas.md](3e-03-sagas.md)
- 2PC done right, over Raft → [3e-05-spanner-and-percolator.md](3e-05-spanner-and-percolator.md)
- **Consensus / Raft — the actual fix for a SPOF coordinator** → **Phase 4**
- Kafka transactions → Phase 6
- **DDIA ch. 9**, "Atomic Commit and Two-Phase Commit"
