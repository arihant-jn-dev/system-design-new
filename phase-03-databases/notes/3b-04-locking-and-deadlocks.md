# 3B·04 · Locking & Deadlocks

> **Why this exists:** the roadmap asks for locks, 2PL, optimistic vs pessimistic, `SELECT FOR UPDATE`, and
> **"how to design deadlocks away."** That last phrase is the important one — the senior answer to deadlocks
> isn't "retry", it's a design change.

---

## Reference

### Lock modes

| Lock | Also called | Blocks | Used by |
|---|---|---|---|
| **Shared (S)** | Read lock | Exclusive locks | `SELECT ... FOR SHARE` |
| **Exclusive (X)** | Write lock | Everything | `UPDATE`, `DELETE`, `SELECT ... FOR UPDATE` |

**Compatibility:** S+S ✅ · S+X ❌ · X+X ❌

### Granularity — the trade

| Level | Concurrency | Overhead | Notes |
|---|---|---|---|
| **Row** | **Highest** | Most locks to track | The normal case |
| **Page** | Medium | Medium | SQL Server escalates here |
| **Table** | Lowest | Cheapest | DDL, some bulk operations |
| **Gap / next-key** | — | — | **InnoDB only** — locks the *range between* index entries to prevent phantoms |

**Gap locks are worth knowing** because they surprise people: InnoDB at Repeatable Read locks the *gaps*
between index values, so `SELECT ... WHERE id > 100 FOR UPDATE` blocks **inserts** into that range, not just
updates to existing rows. It's how InnoDB prevents phantoms — and it's a common source of unexpected
deadlocks in MySQL.

**Lock escalation:** some engines convert many row locks into one table lock to save memory. Postgres
**doesn't** escalate (it stores lock info in the tuple itself), which is a genuine advantage.

### Two-Phase Locking (2PL)

The classic protocol behind lock-based serializability:

```
Phase 1 (growing):    acquire locks, never release
Phase 2 (shrinking):  release locks, never acquire
```

In practice **Strict 2PL**: hold *all* locks until commit/abort. This is what MySQL's `SERIALIZABLE` does.

**Cost:** readers block writers and writers block readers — the exact problem MVCC was invented to avoid.
**This is why Postgres's SSI (optimistic) is generally preferred over 2PL (pessimistic) for serializability.**

> ⚠️ **Don't confuse 2PL with 2PC.** Two-Phase **Locking** is single-node concurrency control. Two-Phase
> **Commit** is a distributed atomic-commit protocol (Phase 3E). Unrelated, similar names — and mixing them
> up is noticeable.

### Pessimistic vs optimistic

| | **Pessimistic** | **Optimistic** |
|---|---|---|
| Assumes | Conflicts are **likely** | Conflicts are **rare** |
| Method | **Lock first**, then work | Work, then **check for conflict at commit** |
| Implementation | `SELECT ... FOR UPDATE`, 2PL | Version column, or Postgres SSI |
| On conflict | Wait (or deadlock) | **Abort and retry** |
| Good when | High contention, short transactions | **Low contention**, long transactions, read-heavy |
| Cost | Blocking, deadlock risk, reduced throughput | Wasted work on abort; **you must write retry logic** |

**Optimistic concurrency control (OCC) in practice — the version-column pattern:**

```sql
-- read
SELECT id, quantity, version FROM inventory WHERE id = 1;   -- version = 5

-- write, guarded by the version we read
UPDATE inventory
   SET quantity = 8, version = 6
 WHERE id = 1 AND version = 5;

-- if 0 rows affected -> somebody else changed it -> re-read and retry
```

**The `WHERE version = 5` is doing the whole job.** It's a compare-and-set, and it's the same idea as an
idempotency guard ([3b-05](3b-05-idempotency-at-the-db-layer.md)) and as HTTP's `If-Match`/ETag.

> **When to pick which:** *"For a shopping cart — low contention, and a conflict is rare — I'd use optimistic
> concurrency with a version column, so reads never block. For seat booking during a flash sale, contention
> is the norm and optimistic retries would thrash, so I'd take a pessimistic row lock (or serialise on the
> seat) instead."* **Contention rate is the deciding variable.**

### `SELECT ... FOR UPDATE` and friends

```sql
BEGIN;
SELECT * FROM seats WHERE id = 42 FOR UPDATE;   -- lock the row NOW
-- ... check availability, decide ...
UPDATE seats SET booked_by = 'user1' WHERE id = 42;
COMMIT;                                          -- lock released
```

| Variant | Behaviour |
|---|---|
| `FOR UPDATE` | Exclusive lock; others **wait** |
| `FOR NO KEY UPDATE` | Weaker; allows concurrent FK reference checks |
| `FOR SHARE` | Shared lock; blocks writers, allows readers |
| **`FOR UPDATE NOWAIT`** | **Error immediately** instead of waiting — good for interactive flows ("seat is being booked") |
| **`FOR UPDATE SKIP LOCKED`** | **Skip locked rows.** ⭐ The idiom for **queue-like tables** — N workers each grab different rows with no contention. |

> **`SKIP LOCKED` is worth remembering by name.** "Implement a job queue in Postgres" is a common question,
> and `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1` is the answer that makes it work without workers fighting
> over the same row.

**The critical point about `FOR UPDATE`:** it's what makes a read-then-write decision safe. The write-skew
fix in Lab B works because locking the rows you *read* turns an invisible read-write dependency into a
visible lock conflict.

### Deadlocks

```
T1: lock A ──▶ wants B
T2: lock B ──▶ wants A          circular wait -> neither can proceed
```

**Detection vs prevention:**

| Approach | How |
|---|---|
| **Detection** (Postgres, InnoDB) | Build a wait-for graph; on a cycle, **abort the cheapest victim**. Postgres checks after `deadlock_timeout` (default 1 s). |
| **Prevention** | Order acquisition consistently; timeouts; `NOWAIT` |
| **Avoidance** | Wait-die / wound-wait schemes using transaction age |

**Your application always sees a deadlock as an error** (Postgres `40P01`, MySQL 1213) on one of the
transactions. **Retry is mandatory** — but retrying alone is treating the symptom.

### Designing deadlocks away — the senior answer

| Technique | How it helps |
|---|---|
| ⭐ **Consistent lock ordering** | **The single most effective fix.** Always lock rows in the same order — e.g. ascending primary key. A cycle becomes impossible. `ORDER BY id` your `FOR UPDATE` and your bulk updates. |
| **Shorter transactions** | Less time holding locks = smaller window. Do validation and external calls *before* `BEGIN`. |
| **Never hold locks across network calls** | An HTTP call inside a transaction turns a 5 ms lock into a 2 s lock |
| **Lock fewer rows** | Narrow predicates; avoid table-level operations in hot paths |
| **Single-statement atomic updates** | `UPDATE ... SET x = x + 1` takes and releases the lock atomically — nothing to interleave |
| **Use `SKIP LOCKED`** for queues | Workers never contend |
| **Avoid the escalation** | In MySQL, be aware gap locks widen what you're locking |
| **Serialise on one object** | An advisory lock keyed by e.g. account ID — coarser, but deadlock-free |

> **The answer to give:** *"I'd retry, because deadlocks are always possible — but the real fix is consistent
> lock ordering. Most deadlocks come from two transactions touching the same two rows in opposite orders, so
> sorting by primary key before locking eliminates the cycle. After that, shortening transactions and never
> holding a lock across an external call covers almost everything else."*

**The classic example, worth having ready:**
```sql
-- Transfer A->B locks A then B.  Transfer B->A locks B then A.  DEADLOCK.
-- Fix: always lock the LOWER id first, regardless of transfer direction.
SELECT * FROM accounts WHERE id IN (:from, :to) ORDER BY id FOR UPDATE;
```

### Advisory locks

Application-defined locks that aren't tied to any row:

```sql
SELECT pg_advisory_xact_lock(hashtext('invoice-run-2024-01'));
```

**Use for:** singleton jobs (only one worker runs the nightly batch), serialising a logical operation,
leader-election-lite.

**Use `pg_advisory_xact_lock` (transaction-scoped), not `pg_advisory_lock` (session-scoped)** — session-level
advisory locks leak through transaction-mode PgBouncer and are a nasty source of stuck locks
([3a-08](3a-08-connection-pooling.md)).

### Lock-related symptoms

| Symptom | Cause |
|---|---|
| Queries hanging on one row | Lock contention — a hot row |
| Deadlock errors under load | Inconsistent lock ordering |
| `ALTER TABLE` hangs and blocks *everything* | DDL wants `ACCESS EXCLUSIVE`; one long query holds it up, and **new queries queue behind the DDL**. Use `lock_timeout` before DDL. |
| Throughput collapses at high concurrency | Convoy on a hot row — needs a design change (sharded counters, queueing) |

**The `ALTER TABLE` one is a genuinely common outage:** the DDL waits for a lock, and every subsequent query
queues behind the *waiting* DDL. One slow query plus one migration takes the table down. **Always set
`lock_timeout` before DDL in production.** → Phase 7 (zero-downtime migrations).

---

## In your own words

**Explain 2PL, and why Postgres's SSI is usually preferred over it. Don't confuse it with 2PC.**

>

**Optimistic vs pessimistic — what's the deciding variable? Give one scenario for each.**

>

**Write the version-column OCC pattern from memory. What does `WHERE version = 5` actually do?**

>

**What does `SKIP LOCKED` enable, and why does it matter for job queues?**

>

**Why is retrying a deadlock treating the symptom? What's the actual fix?**

>

**Give the transfer-deadlock example and its one-line fix.**

>

**Why can one slow query plus an `ALTER TABLE` take down a whole table?**

>

**Why transaction-scoped advisory locks rather than session-scoped?**

>

---

## Links

- What isolation levels these implement → [3b-02-isolation-levels-and-anomalies.md](3b-02-isolation-levels-and-anomalies.md)
- MVCC — why readers don't need locks → [3b-03-mvcc.md](3b-03-mvcc.md)
- Compare-and-set as an idempotency tool → [3b-05-idempotency-at-the-db-layer.md](3b-05-idempotency-at-the-db-layer.md)
- Advisory locks + PgBouncer → [3a-08-connection-pooling.md](3a-08-connection-pooling.md)
- **`FOR UPDATE` as a write-skew fix** → [`../lab/lab-b-write-skew/`](../lab/lab-b-write-skew/)
- 2P**C** (the distributed one) → Phase 3E
- Zero-downtime migrations and `lock_timeout` → Phase 7
