# Phase 3A/3B Labs — Indexing & Write Skew

> Roadmap labs **3** and **2**:
> *"10 M-row table. Query it without an index, with a wrong-order composite index, and with a covering index.
> Record `EXPLAIN ANALYZE` each time."*
> *"Run the write-skew anomaly at `REPEATABLE READ`, then fix it three ways: `SERIALIZABLE`,
> `SELECT FOR UPDATE`, and a unique constraint."*

**Time: ~4 hrs.** Docker only.

```bash
cd phase-03-databases/lab
docker compose up -d
docker compose run --rm lab node lab-a-indexing/seed.js     # ~25s, 10M rows, ~1 GB
docker compose run --rm lab node lab-a-indexing/bench.js
docker compose run --rm lab node lab-b-write-skew/run.js
```

Postgres is on host port **5434** (5432 and 5433 are commonly taken):
`psql postgresql://lab:lab@localhost:5434/lab`

---

# Lab A — indexing

## A1 · Six strategies, one query

```sql
SELECT count(*), sum(amount_cents) FROM events
WHERE tenant_id = 42 AND event_type = 'purchase'
  AND created_at > now() - interval '30 days'
```

**Reference result** (10 M rows, ~1 GB):

| Strategy | Time | Plan node | Rows scanned | Rows *filtered* | Buffers |
|---|---|---|---|---|---|
| 1. no index | 218.65 ms | Seq Scan | 2,957 | **3,397,043** | 110,042 |
| 2. **wrong** column order | 40.11 ms | Index Scan (ix_wrong) | 8,871 | 0 | 20,561 |
| 3. single column only | 86.68 ms | Bitmap Heap Scan | 8,871 | **93,814** | 67,010 |
| 4. **right** column order | 8.49 ms | Bitmap Heap Scan | 8,871 | 0 | 7,660 |
| 5. **covering (INCLUDE)** | **0.72 ms** | **Index Only Scan** | 8,871 | 0 | **59** |

**No index → covering index: 302× faster. 110,042 buffers → 59.**

### The three things to take from this table

**1 · Column order alone is 4.7× time and 2.7× pages.** Scenarios 2 and 4 contain **exactly the same three
columns** — `(created_at, tenant_id, event_type)` vs `(tenant_id, event_type, created_at)`. The only
difference is order. Leading with the *range* column means the equality predicates can't seek.

**2 · The `filtered` column is the diagnostic.** Scenario 3 (`tenant_id` only) read 93,814 rows and threw away
93,814 of them. **That's the signature of a predicate missing from your index** — `Rows Removed by Filter` in
raw `EXPLAIN`. Scenario 1 threw away 3.4 million.

**3 · `Index Only Scan` with `Heap Fetches: 0`** is the goal. The index contained every column the query
needed, so the table was never touched — 59 buffers instead of 110,042.

> ⚠️ **A note on how this lab was built, because it's a real lesson.** The first version used
> `ORDER BY created_at DESC LIMIT 20`, and the "wrong" index came out **just as fast**. Why? Leading with
> `created_at DESC` happened to match the `ORDER BY`, so Postgres walked backwards from `now()` and stopped
> after 20 matches — the wrong index was accidentally right *for that query*.
>
> **The lesson isn't "column order doesn't matter" — it's that the right column order depends on the whole
> query, `ORDER BY` and `LIMIT` included.** An index that's wrong for an aggregate can be perfect for a
> top-N. This lab uses an aggregate so the column-order effect isn't masked.

## A2 · Selectivity — the planner refusing your index

**Reference result** (index on `event_type` and on `status`, both exist throughout):

| Predicate | Selectivity | Plan chosen | Index used? |
|---|---|---|---|
| `status = 'failed'` | **0.5%** | Index Scan | ✅ yes |
| `event_type = 'purchase'` | **33%** | **Bitmap Heap Scan** | ✅ yes, but differently |
| `status = 'ok'` | **99.5%** | **Seq Scan** | ❌ **ignored entirely** |

**Read it as a spectrum, not a binary:**

- **0.5%** → plain **Index Scan**. Few rows; random I/O is worth it.
- **33%** → **Bitmap** scan. Too many rows for random I/O, so Postgres collects row-ids from the index,
  sorts them, and reads the heap in *physical* order. **The middle ground** — and seeing a bitmap scan is not
  a problem.
- **99.5%** → **Seq Scan**. The index is ignored and **the planner is right.**

> **That last index costs you on every single write and will never be read.** An index the planner refuses is
> pure write amplification. This is why "add an index" is a trade, and why auditing
> `pg_stat_user_indexes` for unused indexes is real work.

## A3 · Partial index on skewed data

```
ix_status   (full index on status)        66 MB
ix_partial  (WHERE status = 'failed')   1112 kB     ← 60x smaller
```
Same queries served. A partial index stores only the 0.5% of rows you actually query — far cheaper to
maintain on writes, and the planner uses it happily.

## A4 · A function on a column disables the index

| Query | Time | Plan |
|---|---|---|
| `WHERE email = '...'` | 0.19 ms | Index Scan (ix_email) |
| `WHERE lower(email) = '...'` | **1813.83 ms** | **Seq Scan** ← index ignored |
| ...after `CREATE INDEX ON events (lower(email))` | 2.27 ms | Index Scan (ix_email_lower) |

**798× difference.** Any function on a column in `WHERE` — `lower()`, `date()`, a cast — makes a plain index
on that column unusable. **Either build the expression index, or rewrite the predicate as a range**
(`created_at >= X AND created_at < Y` instead of `date(created_at) = X`).

This is probably the highest-yield practical fact in 3A.

## A5 · What indexes cost on writes

```
50k inserts, PK only          1 index      159.01 ms
50k inserts, PK + 4 indexes   5 indexes    413.20 ms      ← 2.6x slower
```

---

# Lab B — write skew

## Scenario 1 — "at least one doctor on call" (an **aggregate** invariant)

Alice and Bob are both on call. Both try to go off call simultaneously. Each reads *"there are 2 of us, so I
can leave"* — then each writes a **different row**.

**Reference results:**

| | T1 (Alice) | T2 (Bob) | Doctors on call | |
|---|---|---|---|---|
| **1a. `REPEATABLE READ`** | committed | committed | **0** | ❌ **write skew** |
| **1b. `SERIALIZABLE`** | committed | **`40001` could not serialize access due to read/write dependencies** | 1 | ✅ |
| **1c. `SELECT ... FOR UPDATE`** | committed | blocked → re-read → saw 1 → **correctly refused** | 1 | ✅ |
| **1d. unique constraint** | — | — | — | ❌ **impossible** |

**Why `REPEATABLE READ` doesn't help:** they wrote **different rows**. There's no write-write conflict to
detect. Each transaction saw a valid snapshot and made a locally-correct decision.

**Why `SERIALIZABLE` works:** Postgres SSI tracks read-write *dependencies*, spots the dangerous cycle, and
aborts one transaction with `40001`. **Your application must catch `40001` and retry the whole transaction** —
this is mandatory, not optional.

**Why `FOR UPDATE` works:** locking the rows you *read* converts an invisible read-write dependency into a
visible lock conflict. T2 blocks until T1 commits, then re-reads, sees only 1 doctor, and refuses.

## Scenario 2 — "no double-booking a room" (a **materialisable** conflict)

Same anomaly shape. Both read "the room is free at 10:00", both book it.

| | T1 | T2 | Bookings | |
|---|---|---|---|---|
| **2a. `REPEATABLE READ`, no constraint** | committed | committed | **2** | ❌ **double booked** |
| **2b. `UNIQUE (room_id, slot)`** | committed | **`23505` unique_violation** | 1 | ✅ |

**The unique index arbitrated the race at the storage layer** — at `REPEATABLE READ`, with no explicit locks
and no retry logic. Note T2 receives `23505`, which the application should treat as *"slot taken"*, **not a
500**.

## ⭐ The point — and the thing the roadmap doesn't mention

|  | doctors (aggregate) | booking (materialisable) |
|---|---|---|
| `SERIALIZABLE` | ✅ works | ✅ works |
| `SELECT FOR UPDATE` | ✅ works | ✅ works |
| **`UNIQUE` constraint** | ❌ **impossible** | ✅ **works, and is best** |

> **A unique constraint only fixes write skew when you can MATERIALISE the conflict into a row.**
>
> - *"No two bookings for room+slot"* → the conflict **is** a row. `UNIQUE(room_id, slot)` expresses it exactly.
> - *"At least 2 doctors on call"* → the invariant is an **aggregate over a set**. There is no row whose
>   uniqueness encodes it, and `CHECK` can't help either — a `CHECK` constraint sees one row at a time.
>
> For aggregate invariants (*"at least N"*, *"sum ≥ 0"*, *"no more than K"*) you need SSI or explicit locks.
> **Being able to state that distinction cleanly is what separates people who've read about write skew from
> people who've fixed one.**

**Postgres bonus:** `EXCLUDE` constraints extend "materialisable" to overlapping **ranges**, which covers most
real booking problems and almost nobody knows about:

```sql
ALTER TABLE reservations ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (room_id WITH =, during WITH &&);
```

---

## Things to try

| Try | How | Expect |
|---|---|---|
| The `FOR UPDATE` deadlock | Make both transactions lock in *opposite* order | `40P01 deadlock_detected` — then fix with `ORDER BY id` |
| SSI abort rate under load | Run scenario 1b in a loop with 10 concurrent pairs | Many `40001`s — this is SSI's throughput cost |
| MySQL comparison | Same test on MySQL RR | It uses **gap locks**, so behaviour differs — and it does *not* detect write skew |
| Watch bloat happen | `BEGIN;` in psql, leave it open, then run updates + `VACUUM` | Dead tuples that vacuum can't remove ([3b-03](../notes/3b-03-mvcc.md)) |
| Stale statistics | Insert 5 M rows, **don't** `ANALYZE`, re-run bench | The planner picks badly on wrong estimates |

```bash
docker compose down -v
```
