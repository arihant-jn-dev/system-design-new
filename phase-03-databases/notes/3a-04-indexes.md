# 3A·04 · Indexes

> **Why this exists:** the single most practically useful topic in 3A. **Composite column order** and
> **selectivity** decide whether an index gets used *at all* — and an index the planner ignores is pure write
> cost with zero benefit. You measure all of this in Lab A.

---

## Reference

### The mental model

An index is a **sorted copy of some columns, plus a pointer back to the row.** That's it. Everything follows:

- Sorted → range scans and `ORDER BY` are cheap
- A copy → **every write must update it too**
- A pointer → the DB may still need to fetch the row (unless the index has everything: a *covering* index)

### Selectivity & cardinality — why the planner ignores your index

| Term | Meaning |
|---|---|
| **Cardinality** | Number of distinct values. `user_id` = high; `is_active` = 2. |
| **Selectivity** | Fraction of rows a predicate returns. **Lower = more selective = better.** |

**The critical fact:**

> **If a query returns more than roughly 5–20% of the table, the planner will choose a sequential scan
> instead of your index — and it is right to.**

Why: an index scan does **random** I/O (jump to index entry → jump to heap row → repeat). A sequential scan
does **sequential** I/O and reads pages in bulk. Past a threshold, reading everything in order beats
scattered lookups.

**Consequences:**
- An index on a **boolean** or low-cardinality column is usually useless — unless the distribution is very
  skewed (`WHERE status = 'failed'` when 0.1% failed), in which case a **partial index** is right.
- The planner uses **statistics** (`ANALYZE`) to estimate selectivity. **Stale statistics → wrong plan.**
  "The query was fast yesterday" is very often stale stats.
- You will build an index in Lab A that the planner refuses to use. That's the lesson, not a bug.

### Composite indexes — column ORDER is everything

Index on `(a, b, c)` is sorted by `a`, then `b` within equal `a`, then `c`.

**The leftmost-prefix rule: an index on `(a, b, c)` can serve queries filtering on:**

| Query filters on | Usable? |
|---|---|
| `a` | ✅ |
| `a, b` | ✅ |
| `a, b, c` | ✅ |
| `b` alone | ❌ |
| `c` alone | ❌ |
| `b, c` | ❌ |
| `a, c` | ⚠️ Partially — uses `a` to seek, then filters `c` |

**Think of a phone book sorted by (last name, first name).** Finding "Smith, John" is easy. Finding everyone
named "John" means reading the whole book. That's the leftmost-prefix rule.

**Ordering rules, in priority order:**

1. **Equality columns first, then range columns.** `WHERE a = 1 AND b > 5` → index `(a, b)`, not `(b, a)`.
   Once you hit a range predicate, columns after it can't be used for seeking.
2. **`ORDER BY` columns after the equality columns** — then the index provides the sort for free, and the
   plan avoids an explicit sort step.
3. **Most selective first** among equality columns — *usually*, though matching the actual query pattern
   matters more than raw selectivity.

```sql
-- Query
SELECT * FROM events
WHERE tenant_id = 42 AND event_type = 'click' AND created_at > now() - interval '1 day'
ORDER BY created_at DESC;

-- Right index:  equality, equality, then range/sort
CREATE INDEX ON events (tenant_id, event_type, created_at DESC);
```

> **The single most common real-world index bug is column order**, and it's invisible — the index exists, the
> query "has an index," and it's still slow. Lab A makes this visible.

### Covering indexes (index-only scans)

If the index contains **every column the query needs**, the DB never touches the table.

```sql
-- Query needs: user_id (filter), created_at (sort), status (output)
CREATE INDEX ON orders (user_id, created_at) INCLUDE (status);   -- Postgres 11+
```

`INCLUDE` stores extra columns in the **leaf pages only** — they can't be searched or sorted on, but they can
be *returned*. This keeps the tree narrow while still covering the query.

**In `EXPLAIN` you're looking for `Index Only Scan`.** Often 2–10× faster because it eliminates the heap
fetch entirely.

> **The Postgres gotcha worth knowing:** an "Index Only Scan" can still fetch from the heap if the
> **visibility map** isn't current — `EXPLAIN ANALYZE` shows `Heap Fetches: N`. If N is high, run `VACUUM`.
> This connects directly to MVCC ([3b-03](3b-03-mvcc.md)) and it's an excellent detail to mention.

### Index types beyond B-tree

| Type | Good for | Notes |
|---|---|---|
| **B-tree** | Equality, ranges, sorting, prefix `LIKE 'abc%'` | The default; 95% of cases |
| **Hash** | Equality **only** | Rarely worth it; B-tree does equality nearly as well and more |
| **GIN** | **Arrays, JSONB, full-text** | Inverted index. Slow to update, great for containment queries. |
| **GiST** | **Geometric, ranges, nearest-neighbour** | Extensible framework |
| **BRIN** | **Huge, naturally-ordered tables** (time-series) | **Tiny** — stores min/max per block range. Useless if data isn't physically ordered. |
| **Bitmap** | Low-cardinality columns in OLAP | Postgres builds these on the fly, not as stored indexes |

**BRIN is worth knowing** — on a 10 M-row append-only time-series table, a BRIN index on `created_at` may be
a few hundred KB where a B-tree is hundreds of MB. The catch: it only works if physical order matches logical
order.

### Partial & functional indexes

```sql
-- PARTIAL: index only the rows you actually query
CREATE INDEX ON orders (created_at) WHERE status = 'pending';
--   'pending' is 0.1% of rows -> index is 1000x smaller, and the planner WILL use it

-- FUNCTIONAL / expression: index the computed value
CREATE INDEX ON users (lower(email));
--   required for  WHERE lower(email) = '...'  to use an index at all
```

> **Critical rule: a function applied to a column in the `WHERE` clause disables a plain index on that
> column.** `WHERE lower(email) = 'x'`, `WHERE date(created_at) = '2024-01-01'`, `WHERE user_id::text = '42'`
> — all of these force a sequential scan unless you have a matching expression index. **Rewrite the query as
> a range (`created_at >= X AND < Y`) or build the expression index.** This is one of the highest-yield
> practical facts in the whole phase.

### The cost of indexes — why not index everything

| Cost | Detail |
|---|---|
| **Write amplification** | Every `INSERT`/`DELETE` updates **every** index. An `UPDATE` updates indexes on changed columns. 10 indexes ≈ 10× the index write work. |
| **Storage** | Indexes commonly exceed table size in total |
| **Memory pressure** | Indexes compete for the buffer cache with actual data |
| **Planner cost** | More options to consider; more chances to pick wrong |
| **Lock/maintenance** | Building blocks writes unless `CREATE INDEX CONCURRENTLY` |
| **HOT update loss** (Postgres) | Postgres can skip index updates when no indexed column changed *and* the new row version fits on the same page. **More indexes = fewer HOT updates = more bloat.** |

> **Interview line:** *"Indexes aren't free — they're a read/write trade. On a write-heavy table I'd be
> deliberate: audit for unused indexes (`pg_stat_user_indexes`), and check whether a composite index can
> replace two single-column ones."*

### When an index makes a query SLOWER

Genuinely happens — worth being able to name:

1. **Low selectivity** — index scan's random I/O loses to a sequential scan, but the planner picks it anyway
   due to bad statistics
2. **Wrong plan from stale stats** — the classic: table grew 100×, `ANALYZE` never ran
3. **Index scan + high heap-fetch rate** — many random heap lookups; a bitmap scan or seq scan would win
4. **Bloated index** — the index has grown far past its useful size
5. **On writes** — always. Every index is a tax on every write.
6. **Correlation** — the planner assumes independent columns; correlated predicates make it badly
   underestimate row counts (Postgres: fix with `CREATE STATISTICS`)

---

## In your own words

**What is an index, in one sentence? Derive three consequences from that definition.**

>

**Why does the planner ignore an index when a query returns 30% of the table? Is it wrong to?**

>

**State the leftmost-prefix rule. Which of `(a,b,c)` can serve a query filtering on `b` and `c` only?**

>

**Give the ordering rule for equality vs range columns, and write the right index for a 3-predicate query.**

>

**What's a covering index, what do you look for in EXPLAIN, and what's the Postgres gotcha?**

>

**Why does `WHERE lower(email) = 'x'` do a sequential scan? Give both fixes.**

>

**Name four costs of adding an index.**

>

**Give three distinct ways an index can make things slower.**

>

---

## Links

- The structure underneath → [3a-01-btree.md](3a-01-btree.md)
- Reading the plans → [3a-05-explain-analyze.md](3a-05-explain-analyze.md)
- Heap fetches & the visibility map → [3b-03-mvcc.md](3b-03-mvcc.md)
- **Measure all of this** → [`../lab/lab-a-indexing/`](../lab/lab-a-indexing/)
- Secondary indexes in a **sharded** world (much harder) → Phase 3D
