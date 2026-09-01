# Phase 3 — Databases

**Weeks 4–6 · ~30 hrs · the heaviest phase in the roadmap**

---

## Why this phase exists

The roadmap is unusually blunt about this one:

> *"This is where senior-level candidates are separated from mid-level ones. Depth here pays back in every
> single interview. Budget three full weeks."*

That's accurate. Everything in Phases 0–2 was the *easy* half — stateless things that scale by adding
machines. This is where state lives, and state is why distributed systems are hard.

**Do not rush this phase and do not skip the labs.** The roadmap flags these four labs as the ones that
matter most in the entire programme.

---

## Build status

Phase 3 is being built in three passes, matching the roadmap's own sub-sections.

| Part | Covers | Status |
|---|---|---|
| **3A** | Storage engines & indexing | ✅ **Built** |
| **3B** | Transactions & isolation | ✅ **Built** |
| **3C** | Replication | ✅ **Built** |
| **3D** | Partitioning & sharding | ✅ **Built** |
| **3E** | Distributed transactions | ✅ **Built** |
| **3F** | Choosing a datastore | ✅ **Built** |

**Phase 3 is complete** — 37 notes, 4 labs, 3 gates.

---

## How to work this (in order)

**Week 4 — 3A + 3B**

| Step | Do this | Time |
|---|---|---|
| 1 | Read [`notes/`](notes/) `3a-01` → `3a-08`. Reference half, once. | ~1.5 hrs |
| 2 | Fill in the "In your own words" halves for 3A. | ~2 hrs |
| 3 | [`lab/lab-a-indexing/`](lab/lab-a-indexing/) — 10 M rows, six index strategies | ~2 hrs |
| 4 | Read `3b-01` → `3b-05` and fill in. | ~2.5 hrs |
| 5 | [`lab/lab-b-write-skew/`](lab/lab-b-write-skew/) — reproduce write skew, fix it three ways | ~2 hrs |
| 6 | [`GATE-3ab.md`](GATE-3ab.md) out loud. | ~1 hr |

**Week 5 — 3C + 3D**

| Step | Do this | Time |
|---|---|---|
| 7 | Read `3c-01` → `3c-06` and fill in. | ~3 hrs |
| 8 | [`lab/lab-c-replication/`](lab/lab-c-replication/) — lag, then failover | ~2 hrs |
| 9 | Read `3d-01` → `3d-06` and fill in. | ~3 hrs |
| 10 | **Write the resharding procedure out longhand, twice.** It's gate Q1. | ~30 min |
| 11 | [`GATE-3cd.md`](GATE-3cd.md) out loud. | ~1 hr |

**Week 6 — 3E + 3F**

| Step | Do this | Time |
|---|---|---|
| 12 | Read `3e-01` → `3e-06` and fill in. | ~3 hrs |
| 13 | **Memorise the outbox answer** (`3e-04`). It recurs constantly. | ~30 min |
| 14 | Read `3f-01` → `3f-06` and fill in. | ~3 hrs |
| 15 | [`lab/lab-d-cassandra/`](lab/lab-d-cassandra/) — query-first modelling, kill a node | ~1.5 hrs |
| 16 | [`GATE-3ef.md`](GATE-3ef.md) out loud. | ~1 hr |
| 17 | ⭐ **Start practice problems** — URL shortener + rate limiter | ~3 hrs |

**Read DDIA chapters 1–4 alongside this.** The roadmap wants them read *during* Phase 3, and chapter 3
("Storage and Retrieval") is exactly 3A.

---

## Topics — 3A · Storage engines & indexing

| # | Note | The one thing it's for |
|---|---|---|
| 01 | [B+Tree](notes/3a-01-btree.md) | Why fanout matters, page splits, write amplification |
| 02 | [LSM tree](notes/3a-02-lsm-tree.md) | Memtable → SSTable, compaction, bloom filters |
| 03 | [B-tree vs LSM](notes/3a-03-btree-vs-lsm.md) | **The core tradeoff. Pick one from a workload description.** |
| 04 | [Indexes](notes/3a-04-indexes.md) | Composite column **order**, covering, cardinality, when an index makes things *slower* |
| 05 | [Reading EXPLAIN ANALYZE](notes/3a-05-explain-analyze.md) | Reason about a real query plan |
| 06 | [Row vs column storage](notes/3a-06-row-vs-column.md) | Why OLAP is columnar |
| 07 | [WAL & durability](notes/3a-07-wal-and-durability.md) | fsync, checkpointing, what "committed" actually means |
| 08 | [Connection pooling](notes/3a-08-connection-pooling.md) | Why connection count is a real scaling limit |

## Topics — 3B · Transactions & isolation

| # | Note | The one thing it's for |
|---|---|---|
| 09 | [ACID](notes/3b-01-acid.md) | Each letter precisely — especially what isolation actually promises |
| 10 | [Isolation levels & anomalies](notes/3b-02-isolation-levels-and-anomalies.md) | **The table to know cold.** Write skew, lost update, phantoms. |
| 11 | [MVCC](notes/3b-03-mvcc.md) | Snapshots, vacuum, and what a long-running transaction does to your database |
| 12 | [Locking & deadlocks](notes/3b-04-locking-and-deadlocks.md) | 2PL, optimistic vs pessimistic, `FOR UPDATE`, designing deadlocks away |
| 13 | [Idempotency at the DB layer](notes/3b-05-idempotency-at-the-db-layer.md) | **Unique constraints as a dedupe primitive** |

## Topics — 3C · Replication

| # | Note | The one thing it's for |
|---|---|---|
| 14 | [Single-leader replication](notes/3c-01-single-leader-replication.md) | Sync vs async as a **number**; why replicas never scale writes |
| 15 | [Replication lag](notes/3c-02-replication-lag.md) | Read-your-own-writes, monotonic reads, consistent prefix — **and the fix for each** |
| 16 | [Replication methods](notes/3c-03-replication-methods.md) | Statement vs physical vs **logical** — and what logical unlocks (CDC) |
| 17 | [Failover & fencing](notes/3c-04-failover.md) | **Split brain, fencing tokens, RPO/RTO** |
| 18 | [Multi-leader](notes/3c-05-multi-leader.md) | Conflict resolution, LWW's danger, CRDTs |
| 19 | [Leaderless & quorums](notes/3c-06-leaderless-quorum.md) | **R + W > N**, sloppy quorum, read repair, Merkle trees |

## Topics — 3D · Partitioning & sharding

| # | Note | The one thing it's for |
|---|---|---|
| 20 | [Why & when to shard](notes/3d-01-why-and-when-to-shard.md) | **Don't until you must** — and the ladder you climb first |
| 21 | [Partitioning strategies](notes/3d-02-partitioning-strategies.md) | Range/hash/hash-of-range/directory/geo · **logical partitions** |
| 22 | [Shard key selection](notes/3d-03-shard-key-selection.md) | The three properties · hot keys · **gate Q2** |
| 23 | [Secondary indexes when sharded](notes/3d-04-secondary-indexes-when-sharded.md) | Local vs global — there is no good answer |
| 24 | [Resharding without downtime](notes/3d-05-resharding-without-downtime.md) | **The procedure. Gate Q1.** |
| 25 | [Cross-shard operations](notes/3d-06-cross-shard-operations.md) | Joins, aggregations, distributed pagination |

---

## Labs in this pass

**[Lab A — indexing](lab/lab-a-indexing/)** *(roadmap lab 3)*
10 M rows. The same query run six ways: no index, wrong-order composite, right-order composite, covering
index, low-selectivity index the planner refuses to use, and a functional index. `EXPLAIN ANALYZE` for each.
The point isn't "indexes are fast" — it's that **column order and selectivity decide whether an index is used
at all**, and that an index can make things *worse*.

**[Lab B — write skew](lab/lab-b-write-skew/)** *(roadmap lab 2)*
Reproduce the on-call-doctors anomaly at `REPEATABLE READ`, then fix it three ways: `SERIALIZABLE`,
`SELECT FOR UPDATE`, and a unique constraint. There's a catch the roadmap doesn't mention, and the lab makes
it the lesson: **a unique constraint only fixes write skew when you can materialise the conflict into a row.**
For an aggregate invariant ("at least 2 doctors on call") you can't — so the lab runs a second scenario where
you can, and makes you say why they differ.

**[Lab C — replication lag & failover](lab/lab-c-replication/)** *(roadmap lab 1)*
Postgres primary + streaming replica. Measure baseline propagation, quantify the read-your-own-writes
anomaly, watch lag spike under load in **both seconds and bytes**, price synchronous commit — then kill the
primary, promote the replica, and **measure how many acknowledged commits were lost.** Ends with split brain
demonstrated live: two nodes both reporting `pg_is_in_recovery() = false`.

**[Lab D — 3-node Cassandra](lab/lab-d-cassandra/)** *(roadmap lab 4)*
Query-first modelling: two queries become two tables, and Cassandra **refuses** the query that doesn't fit
the key. Then write at every consistency level, kill a node, and watch `ONE` and `QUORUM` survive while
`ALL` fails — **R + W > N, confirmed on real hardware.** Ends with hinted handoff replaying the missed
writes on recovery.

---

## Definition of done

**3A + 3B**
- [ ] All 13 notes (`3a-*`, `3b-*`) have the "In your own words" half filled in
- [ ] `lab/RESULTS.md` has real `EXPLAIN ANALYZE` output you captured
- [ ] You watched the planner **ignore** an index you built, and can say why
- [ ] You reproduced write skew and fixed it three ways
- [ ] You can explain why a unique constraint fixes one write skew and not the other
- [ ] [`GATE-3ab.md`](GATE-3ab.md) passed out loud

**3C + 3D**
- [ ] All 12 notes (`3c-*`, `3d-*`) have the "In your own words" half filled in
- [ ] You measured your own read-your-own-writes stale rate
- [ ] You failed over and **counted the acknowledged commits you lost**
- [ ] You saw two nodes both report `pg_is_in_recovery() = false`
- [ ] You can recite the six-step resharding procedure in under 90 seconds
- [ ] [`GATE-3cd.md`](GATE-3cd.md) passed out loud

**3E + 3F**
- [ ] All 12 notes (`3e-*`, `3f-*`) have the "In your own words" half filled in
- [ ] You can give the **outbox answer** in four sentences, cold
- [ ] You watched Cassandra **refuse** a query that didn't fit the data model
- [ ] You saw `ALL` fail with one node down while `QUORUM` succeeded
- [ ] You can defend Postgres with numbers **and** name the trigger to leave it
- [ ] [`GATE-3ef.md`](GATE-3ef.md) passed out loud
