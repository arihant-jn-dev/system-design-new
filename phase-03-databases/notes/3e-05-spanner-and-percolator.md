# 3E·05 · Spanner & Percolator (Awareness Level)

> **Why this exists:** the roadmap marks this *"awareness level: TrueTime, external consistency."* You don't
> need to implement these. You **do** need to know that "you can't have distributed ACID transactions at
> scale" stopped being true in 2012, and to be able to say *how* — because it's the answer to "why is
> CockroachDB interesting?"

---

## Reference

### Google Percolator (2010) — transactions on top of a KV store

Built to make Google's search index **incrementally updatable** rather than fully rebuilt by MapReduce.

**The idea: implement snapshot-isolation transactions on top of Bigtable using only per-row atomic
operations.**

```
· A timestamp oracle hands out globally increasing timestamps
· Each transaction gets a start_ts and a commit_ts
· 2PC where the LOCK LIVES IN THE DATA ITSELF (a special column), not in a coordinator
· One row is designated the PRIMARY LOCK -- committing it is the atomic commit point
· A crashed client's locks are cleaned up LAZILY, by whichever transaction next
  encounters them
```

**The two ideas worth taking away:**

1. ⭐ **Locks stored in the data, not in a coordinator.** So there's no coordinator to lose — any client that
   trips over a stale lock can resolve it by checking the primary lock's state.
2. ⭐ **Lazy recovery.** No recovery process is needed; cleanup happens on encounter. This is what removes
   2PC's blocking problem *without* 3PC.

**Used by:** TiDB's transaction model is Percolator-derived. So is much of what "distributed SQL on a KV
store" means today.

### Google Spanner (2012) — TrueTime and external consistency

**The claim that shocked people: a globally-distributed, strongly-consistent, externally-consistent
relational database with distributed transactions.**

**External consistency (= linearizability for transactions):** if transaction T1 commits before T2 *starts*
in real time, then every observer sees T1 before T2 — **even across continents, with no communication
between them.**

**The problem:** ordering transactions globally normally requires them to talk to each other, because
[clocks can't be trusted](../../phase-00-foundations/notes/02-latency-numbers.md) — clock skew means one
node's "now" isn't another's.

**TrueTime's answer: don't pretend the clock is exact. Expose the uncertainty.**

```
TT.now() returns an INTERVAL, not a point:   [earliest, latest]

Backed by GPS receivers and atomic clocks in every datacentre,
so the interval is small -- typically under 7 ms.
```

**The commit-wait trick — this is the whole idea:**

```
1. Assign the transaction a commit timestamp s = TT.now().latest
2. ⭐ WAIT until TT.now().earliest > s
      i.e. deliberately sleep until you are CERTAIN s is in the past everywhere
3. Only then release the locks and make the commit visible
```

**Spanner makes writes artificially slower — waiting out the clock uncertainty — to buy a global ordering
guarantee with no cross-node coordination.** Typical commit-wait: a few milliseconds.

> **The sentence that captures it: "Spanner spends latency to buy consistency, and TrueTime is what bounds
> how much latency it has to spend."** Tighter clocks → shorter waits. That's why the hardware matters.

**The architecture underneath:** data in **Paxos groups** (each shard is a replicated state machine),
**2PC across those groups** for multi-shard transactions. Because each participant is itself a consensus
group, **the coordinator is not a single point of failure** — which is exactly the fix 2PC needed
([3e-02](3e-02-two-phase-commit.md)).

### The descendants — what you'll actually meet

| System | Approach | Note |
|---|---|---|
| **CockroachDB** | Spanner-like, **without** atomic clocks. Uses HLCs + a bounded "max clock offset"; transactions that hit uncertainty are **restarted**. | Open source, Postgres wire protocol. **The one to name.** |
| **YugabyteDB** | Similar; Postgres-compatible | |
| **TiDB** | Percolator-derived, MySQL-compatible | |
| **Google Cloud Spanner** | The real thing, with the hardware | |
| **AWS Aurora DSQL** | Distributed SQL with a similar time-based approach | Newer |
| **FoundationDB** | Deterministic simulation testing; the storage layer under several products | Famous for its testing methodology |

**CockroachDB's tradeoff is the instructive one:** without atomic clocks it must assume a *worst-case* clock
offset (default 500 ms). Rather than waiting that long on every commit, it detects reads that fall inside the
uncertainty window and **restarts the transaction**. **So the cost moves from latency to retries**, and your
application must handle retryable errors — the same `40001`-style discipline as
[Postgres SSI](3b-02-isolation-levels-and-anomalies.md).

### What this means for your designs

| Take-away | |
|---|---|
| **"Distributed ACID at scale is impossible" is outdated** | It's a product you can buy. Say so if someone asserts otherwise. |
| **But it isn't free** | Commit-wait latency, or transaction restarts; cross-region writes still cost an RTT; higher cost per operation |
| ⭐ **It may still be cheaper than a saga** | A distributed SQL database can remove an entire category of application complexity. Compare *total* cost, not per-query latency. |
| **Consider it before hand-rolling sharding** | [3d-01](3d-01-why-and-when-to-shard.md) — CockroachDB/Vitess/Citus before your own shard router |
| **Physics is unchanged** | A globally-synchronous write is still ≥ one cross-region RTT. Spanner doesn't beat the speed of light — it avoids *extra* coordination beyond it. |

> **A strong, mature answer:** *"If we genuinely need cross-shard transactions at scale, I'd evaluate
> CockroachDB before building sagas everywhere — Spanner-style systems make distributed transactions a
> product feature rather than application complexity. The cost is either commit-wait latency or transaction
> restarts, and cross-region writes still pay an RTT. But comparing that against writing and operating
> compensations for every workflow, it can easily be the cheaper option."*

---

## In your own words

**What two ideas from Percolator remove 2PC's coordinator problem?**

>

**Define external consistency in one sentence.**

>

**What does TrueTime actually return, and why is that the key design decision?**

>

**Explain commit-wait. What is Spanner trading, and for what?**

>

**Why is the coordinator not a SPOF in Spanner's 2PC?**

>

**How does CockroachDB manage without atomic clocks, and where does the cost show up instead?**

>

**When would you propose distributed SQL over sagas? Argue it on total cost.**

>

---

## Links

- 2PC and its coordinator problem → [3e-02-two-phase-commit.md](3e-02-two-phase-commit.md)
- The alternative you're comparing against → [3e-03-sagas.md](3e-03-sagas.md)
- Retryable serialization errors → [3b-02](3b-02-isolation-levels-and-anomalies.md)
- Distributed SQL instead of hand-rolled sharding → [3d-01](3d-01-why-and-when-to-shard.md)
- **Clocks, HLCs, linearizability, Paxos/Raft** → **Phase 4**
- Papers: *Percolator* (2010) · **Spanner** (2012) · *Spanner: Becoming a SQL System* (2017)
