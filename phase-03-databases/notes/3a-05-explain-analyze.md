# 3A·05 · Reading EXPLAIN ANALYZE

> **Why this exists:** the roadmap asks you to *"read `EXPLAIN ANALYZE` output and reason about it."* This is
> a concrete, checkable skill — and being able to read a plan out loud is a strong practical signal, because
> it's something you can only learn by doing.

---

## Reference

### EXPLAIN vs EXPLAIN ANALYZE

| | Does what |
|---|---|
| `EXPLAIN` | Shows the **estimated** plan. Doesn't run the query. |
| `EXPLAIN ANALYZE` | **Actually runs it** and shows real timings and row counts. ⚠️ *It executes the query — wrap `UPDATE`/`DELETE` in a transaction you roll back.* |
| `EXPLAIN (ANALYZE, BUFFERS)` | **Use this one.** Adds page-level I/O — the most useful column. |

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) SELECT ...;
```

### Anatomy of a node

```
Index Scan using idx_events_tenant on events  (cost=0.43..842.11 rows=250 width=48)
                                              (actual time=0.031..1.204 rows=1183 loops=1)
  Index Cond: (tenant_id = 42)
  Filter: (status = 'active'::text)
  Rows Removed by Filter: 4210
  Buffers: shared hit=312 read=48
```

| Field | Means |
|---|---|
| `cost=0.43..842.11` | **Estimated** startup..total cost, in arbitrary units. Only useful for *comparing* plans. |
| `rows=250` | **Estimated** rows |
| `actual time=0.031..1.204` | **Real** startup..total ms, **per loop** |
| `rows=1183` | **Actual** rows |
| `loops=1` | How many times this node ran |
| **`Index Cond`** | Predicate the **index** used to seek. ✅ This is the good one. |
| **`Filter`** | Predicate applied **after** fetching rows. ⚠️ Work you did and threw away. |
| **`Rows Removed by Filter`** | **How much work was wasted.** High = missing/wrong index. |
| `Buffers: shared hit / read` | Pages from **cache** / from **disk**. `read` is the expensive one. |

### The four things to check, in order

**1 · Estimated rows vs actual rows.**
```
rows=250  ...  actual rows=1183      ← 5x off
```
**A large mismatch is the root cause of most bad plans.** The planner chose this strategy believing 250 rows;
at 1183 it might have chosen differently. Causes: stale statistics (`ANALYZE`), correlated columns
(`CREATE STATISTICS`), or expressions the planner can't estimate.

**2 · `Rows Removed by Filter`.**
High numbers mean you fetched rows only to discard them → **the predicate isn't in the index.** This is the
signal that your composite index has the wrong column order.

**3 · `Buffers: read` (actual disk I/O).**
`shared hit` = cache. `shared read` = disk. In Lab B of Phase 1 you saw `hit=10540` vs `hit=5` — that ratio
*is* the story.

**4 · Where the time actually goes.**
`actual time` is **cumulative and per-loop**. A node's own cost = its total − its children's totals. And with
`loops=1000`, the real cost is `actual time × loops` — easy to misread.

### Scan types

| Node | Means | When it's right |
|---|---|---|
| **Seq Scan** | Read the whole table | Small tables, or returning >5–20% of rows. **Not automatically bad.** |
| **Index Scan** | Walk the index, fetch each row from the heap | Selective predicates, few rows |
| **Index Only Scan** | ✅ **Answer entirely from the index** | Covering index. Check `Heap Fetches`! |
| **Bitmap Heap Scan** | Collect matching row-ids from index(es), sort them, then read the heap **in physical order** | The middle ground — too many rows for an index scan, too few for a seq scan. **Also how Postgres combines multiple indexes.** |
| **Tid Scan** | Direct by physical location | Rare |

> **Bitmap scans are the node people misread.** Seeing one isn't a problem — it's Postgres saying "many
> matches, so let me convert random I/O into sequential I/O." A `BitmapAnd` across two indexes is often the
> right plan, and it's why you sometimes don't need a composite index.

### Join types

| Node | How | Good when |
|---|---|---|
| **Nested Loop** | For each outer row, look up inner | **Outer side is small** and inner has an index. Catastrophic if the outer estimate is wrong. |
| **Hash Join** | Build a hash table from one side, probe with the other | Large, unsorted inputs. Needs memory — watch for `Batches > 1`. |
| **Merge Join** | Sort both, walk together | Both sides already sorted (indexes) |

> **The classic incident: a Nested Loop chosen because the planner estimated 10 outer rows, when there were
> 100,000.** The plan degrades from milliseconds to minutes. Whenever you see a slow Nested Loop, check the
> estimate-vs-actual on its outer side first.

### Red flags — the checklist

| Symptom | Likely cause | Fix |
|---|---|---|
| Estimate off by >10× | Stale stats, correlated columns | `ANALYZE`; `CREATE STATISTICS` |
| High `Rows Removed by Filter` | Predicate not in the index | Add the column to the index (right position) |
| `Seq Scan` on a big table with a selective predicate | Missing index, or a function on the column | Add index / expression index |
| `Index Only Scan` with high `Heap Fetches` | Visibility map stale | `VACUUM` |
| Sort with `Sort Method: external merge Disk:` | Not enough `work_mem` | Raise `work_mem`, or index the sort |
| `Hash Join` with `Batches: 8` | Hash spilled to disk | Raise `work_mem` |
| Nested Loop with huge `loops=` | Bad outer estimate | Fix stats; consider a hint/rewrite |
| `Rows Removed by Join Filter` high | Join condition not indexed | Index the FK |

**Index the foreign key** deserves its own mention: Postgres does **not** automatically index FK columns, and
an unindexed FK makes both joins and cascading deletes slow.

### Worked reading

```
Limit  (actual time=55.838..55.841 rows=20 loops=1)
  Buffers: shared hit=10540
  ->  Index Only Scan using idx_events_created_id on events
        (actual time=0.013..45.575 rows=500020 loops=1)
        Heap Fetches: 500020
        Buffers: shared hit=10540
```

**Read it bottom-up, out loud:**
> "The index-only scan produced **500,020** rows and the Limit above returned **20** — so 500,000 rows were
> produced and thrown away. 10,540 buffers were touched for 20 rows of output. `Heap Fetches: 500020` means
> the index-only scan wasn't actually index-only — the visibility map is stale, so it hit the heap half a
> million times. This is `OFFSET 500000`: the database walked the whole index counting rows."

*(That's the real plan from [Phase 1's pagination lab](../../phase-01-networking/lab/).)*

### Tooling

- **explain.dave.cx** / **explain.depesz.com** — paste a plan, get it visualised with the expensive nodes
  highlighted. Genuinely useful.
- `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` — for programmatic parsing (Lab A does this)
- `auto_explain` — logs plans of slow queries automatically in production
- `pg_stat_statements` — **find *which* queries to explain in the first place.** Start here.

---

## In your own words

**What's the difference between `Index Cond` and `Filter`? Which one indicates a problem, and why?**

>

**Estimate says 250 rows, actual is 50,000. Why does that matter more than the absolute numbers?**

>

**When is a `Seq Scan` the correct plan? Give a concrete case.**

>

**What is a Bitmap Heap Scan actually doing, and why is seeing one not a problem?**

>

**You see `Index Only Scan` with `Heap Fetches: 500000`. What's wrong and what's the fix?**

>

**Read this plan out loud and explain what it's doing:** *(paste one from Lab A)*

>

---

## Links

- Index design → [3a-04-indexes.md](3a-04-indexes.md)
- Visibility map & vacuum → [3b-03-mvcc.md](3b-03-mvcc.md)
- **Practise on real plans** → [`../lab/lab-a-indexing/`](../lab/lab-a-indexing/)
- The `OFFSET` plan above → [Phase 1 lab](../../phase-01-networking/lab/)
