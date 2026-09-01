# Phase 3A + 3B — Gate

> **Rules:** Out loud. From memory. No notes.
>
> Phase 3's full gate (in the roadmap) also covers replication, sharding and datastore choice — those come
> with parts 3C–3F. **This gate covers only what 3A and 3B taught.** Pass it before moving to 3C.

---

## Q1 · Given a workload, pick a storage engine and defend it against a hostile follow-up

**Prompt yourself with each of these and answer out loud:**

- *"Ingest 1 M sensor readings/sec, query the last hour by device."*
- *"E-commerce orders, 5 K QPS, frequent status updates, needs joins and transactions."*
- *"Audit log, append-only, 500 M rows/day, queried rarely by ID."*

**You pass if:**

- [ ] You named the **workload properties first** (write-heavy? append-only? range scans? updates? deletes?
      p99 requirement?) and *then* the engine — never the reverse
- [ ] You stated the core tradeoff: **B-tree = read-optimised, update-in-place; LSM = write-optimised,
      append-only**
- [ ] You explained the *mechanism* — LSM turns random writes into sequential appends
- [ ] ⭐ You distinguished **write-heavy from append-heavy** — LSM is a poor fit for frequent updates to the
      same keys, because every update becomes a version compaction must reconcile
- [ ] ⭐ You raised **compaction as a p99 problem** — LSM throughput is great, but background compaction
      spikes read/write tails, so B-trees are more predictable under a strict latency SLA
- [ ] You named a compaction strategy and its trade (size-tiered = write-optimised, costs space and reads;
      leveled = read/space-optimised, costs write amplification)
- [ ] You mentioned **tombstones** — deletes make an LSM bigger and slower until compaction runs
- [ ] Bonus: the **RUM conjecture** — read, update, memory: optimise two

**Self-score:** ___ / 8

---

## Q2 · Explain MVCC, and what a long-running read transaction does to your database

**You pass if:**

- [ ] MVCC keeps **multiple versions** of each row so readers see a consistent snapshot
- [ ] **Readers don't block writers; writers don't block readers** (writers still block writers on the same row)
- [ ] In Postgres: `xmin`/`xmax`, and **an UPDATE is an INSERT plus a mark-dead** — the row is not modified
      in place
- [ ] Therefore dead tuples accumulate and need **`VACUUM`**
- [ ] ⭐ **Vacuum can only remove versions older than the OLDEST RUNNING TRANSACTION** — that's the key fact
- [ ] ⭐ So one long transaction pins dead tuples **across the entire database**, not just tables it touched
- [ ] Consequences: table and index **bloat**, slower scans, **index-only scans stop working** (stale
      visibility map)
- [ ] ⭐ Extreme case: **transaction ID wraparound** → Postgres refuses all writes to protect itself
- [ ] You named the causes: analytics on the primary, `idle in transaction`, a transaction held across an
      HTTP call, an ORM `BEGIN` with no `COMMIT`
- [ ] You named the fix: **`idle_in_transaction_session_timeout`**, `statement_timeout`, keep analytics off
      the primary
- [ ] Bonus: **InnoDB differs** — old versions go to the undo log, so the table stays compact but the undo
      log grows and reads walk longer chains

**Self-score:** ___ / 10

---

## Q3 · Explain write skew with a concrete example, and fix it three ways

**You pass if:**

- [ ] You gave a **concrete scenario** — doctors on call, room booking, joint account
- [ ] You defined it precisely: **two transactions read an overlapping set, each decides based on what it
      read, then each writes a DIFFERENT row.** No write-write conflict exists, but the invariant breaks.
- [ ] ⭐ You explained **why snapshot isolation / RR misses it** — different rows, so there's nothing to detect
- [ ] **Fix 1 — `SERIALIZABLE`**: Postgres SSI detects the read-write dependency cycle, aborts with `40001`.
      ⭐ **And you said the application MUST retry.**
- [ ] **Fix 2 — `SELECT ... FOR UPDATE`**: locking the rows you *read* turns an invisible read-write
      dependency into a visible lock conflict
- [ ] **Fix 3 — unique constraint**: works by making the storage layer arbitrate the race
- [ ] ⭐⭐ **You named the limitation:** a unique constraint only works when the conflict can be
      **materialised into a row**. For an aggregate invariant ("at least 2 on call", "sum ≥ 0") no constraint
      expresses it — you need SSI or locks.
- [ ] Bonus: `EXCLUDE USING gist (... WITH &&)` for overlapping ranges
- [ ] Bonus: Postgres SSI is **optimistic** (aborts) while MySQL Serializable is **2PL** (blocks) — which
      changes how your application must be written

**The double-starred item is the differentiator.** Anyone can recite three fixes; knowing when the third one
is impossible means you've actually reasoned about it.

**Self-score:** ___ / 9

---

## Extra checks

- [ ] **Fanout** — why is a B+Tree over 13 billion rows only ~4 levels deep?
- [ ] **Why UUIDv4 primary keys hurt** inserts, and what to use instead
- [ ] **Composite index column order** — state the rule for equality vs range columns
- [ ] **Leftmost prefix** — can an index on `(a,b,c)` serve a query filtering on `b` and `c`?
- [ ] **Why the planner ignores an index** at 30% selectivity — and is it right?
- [ ] ⭐ **`WHERE lower(email) = ...`** — why sequential scan, and both fixes
- [ ] **`Rows Removed by Filter` is high** — what does that tell you?
- [ ] **Index Only Scan with `Heap Fetches: 500000`** — what's wrong, what's the fix?
- [ ] **Write-ahead rule** — state it, and say where durability actually happens
- [ ] **`synchronous_commit = off`** — what exactly do you lose? Give the number.
- [ ] ⭐ **Why does connection count cap your database?** Give the `2×cores` rule and the autoscaling failure
- [ ] **Transaction-mode pooling** — where does the multiplexing come from, and name three things it breaks
- [ ] **The C in ACID vs the C in CAP**
- [ ] **Lost update** — example plus all four fixes
- [ ] **Deadlock** — why is retrying the symptom, not the cure?
- [ ] **Why you don't run analytics on the OLTP primary** — three reasons, and which is subtlest
- [ ] **Check-then-act** — why is `SELECT` before `INSERT` broken, and what replaces it?

---

## Scoring

| Result | Do this |
|---|---|
| All three passed + most extras | ✅ Move to **3C — Replication** |
| Passed Q1–Q3, fumbled extras | Move on; re-read the specific notes this week |
| Fumbled any of Q1–Q3 | ⛔ Don't advance. Redo that note's "own words" section, retry in 2 days. |

| Fumbled | Redo |
|---|---|
| Q1 | [3a-01](notes/3a-01-btree.md), [3a-02](notes/3a-02-lsm-tree.md), [3a-03](notes/3a-03-btree-vs-lsm.md) |
| Q2 | [3b-03](notes/3b-03-mvcc.md) + [3a-06](notes/3a-06-row-vs-column.md) |
| Q3 | [3b-02](notes/3b-02-isolation-levels-and-anomalies.md) + re-run [Lab B](lab/lab-b-write-skew/) |

---

## Gate log

| Attempt | Date | Q1 | Q2 | Q3 | Notes |
|---|---|---|---|---|---|
| 1 |  | /8 | /10 | /9 |  |
| 2 |  | /8 | /10 | /9 |  |
