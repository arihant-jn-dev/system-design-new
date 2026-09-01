# 05·11 · Precomputation — Caching by Another Name

> **Why this exists:** the roadmap's phrasing is the insight — *"materialized views and precomputation as
> caching by another name."* Sometimes the right answer isn't to cache the expensive query. It's to make
> sure the expensive query never has to run.

---

## Reference

### The reframing

**A cache stores the answer to a question someone already asked. Precomputation stores the answer before
anyone asks.**

| | **Cache** | **Precomputation** |
|---|---|---|
| Populated | **Lazily**, on first miss | **Eagerly**, on write or on a schedule |
| First request | ⚠️ **Slow** (the miss) | ✅ **Fast** |
| Unused entries | None — only what was requested | Wasted work for answers nobody wants |
| Staleness | TTL-bounded | Until the next refresh |
| Failure | Degrades to the source | Serves stale, or nothing |

**They're the same idea at different points on one axis: how eagerly you compute.** Refresh-ahead
([02](02-caching-patterns.md)) is literally the midpoint.

### The forms

| Form | What it is |
|---|---|
| **Materialised view** | The database maintains a stored query result (Postgres `MATERIALIZED VIEW`, Oracle, ClickHouse) |
| **Summary / rollup table** | You maintain it: daily aggregates, counters, `product_stats` |
| **Denormalised column** | `post.comment_count` instead of `COUNT(*)` at read time |
| ⭐ **Precomputed feed / timeline** | Fan-out on write ([Phase 0 note 10](../../phase-00-foundations/notes/10-workload-shape.md)) |
| **Search index** | An inverted index *is* a precomputed answer to "which documents contain X" |
| **OLAP cube / pre-aggregation** | Druid, Pinot roll-ups |
| **Static site generation** | Render pages at build time — the most extreme form |

### Postgres materialised views — and their catch

```sql
CREATE MATERIALIZED VIEW product_stats AS
  SELECT product_id, count(*) AS reviews, avg(stars) AS avg_stars
  FROM reviews GROUP BY product_id;

REFRESH MATERIALIZED VIEW CONCURRENTLY product_stats;   -- needs a UNIQUE index
```

⚠️ **They do not update automatically.** You must `REFRESH`, and a plain `REFRESH` takes an
`ACCESS EXCLUSIVE` lock — **blocking all reads** for the duration.
**`CONCURRENTLY` avoids the lock but requires a unique index and is slower.**

**So a materialised view is a *scheduled batch job* with nice syntax**, not a live view. Knowing that
distinction prevents a real production surprise.

**Incremental alternatives:** triggers maintaining a summary table; CDC-driven updates
([3c-03](../../phase-03-databases/notes/3c-03-replication-methods.md)); a stream processor keeping a
materialised view live (Phase 6); or ClickHouse's incremental materialised views, which *do* update on
insert.

### ⭐ When to precompute instead of cache

| Precompute when | Cache when |
|---|---|
| The computation is **expensive** and the inputs change **rarely** | Inputs change often |
| **The first request must be fast** (no cold-miss penalty acceptable) | A slow first request is fine |
| The answer set is **small and bounded** | The key space is huge/unpredictable |
| Reads **massively** outnumber writes | Mixed |
| ⭐ **You can't afford a stampede** — there's nothing to stampede on | Stampedes are manageable |

**The read:write ratio is the deciding variable.** At 1000:1, doing work on write is obviously right — you
pay once and read a thousand times. At 1:1 you'd be computing answers nobody reads.

### The classic case: feed generation

**This is the clearest instance, and it's Phase 9's news-feed question in miniature:**

| Strategy | Write cost | Read cost |
|---|---|---|
| **Fan-out on read** (compute the feed per request) | 1 write | ⚠️ Expensive: fetch N followees, merge, sort |
| ⭐ **Fan-out on write** (precompute each follower's timeline) | ⚠️ **N writes** — 1M followers = 1M inserts | ✅ One read |
| ⭐ **Hybrid** | Precompute for normal users; compute at read time for celebrities | Merge two sources |

> **The hybrid is the real answer**, and it's precomputation with an explicit exception for the hot keys —
> exactly the hot-key mitigation from [05](05-failure-modes.md), applied at the data-model level.

### The costs — be honest

| Cost | |
|---|---|
| **Wasted computation** | You precompute answers nobody asks for |
| **Write amplification** | One write triggers many updates (fan-out) |
| ⚠️ **Staleness with no TTL to bound it** | A cache expires; a stale rollup table just stays wrong |
| ⭐ **Correctness drift** | The precomputed value diverges from the truth after a bug, a failed job, or a manual DB edit — **and nothing tells you** |
| Backfill pain | Changing the computation means recomputing everything |

> ⭐ **The drift problem is the one that bites.** A `comment_count` column that's been wrong since a failed
> migration in March will stay wrong forever. **Always have a reconciliation job** that recomputes from
> source and reports discrepancies — the same instinct as verifying a data migration
> ([3d-05](../../phase-03-databases/notes/3d-05-resharding-without-downtime.md)).

### The decision, stated

> *"I'd precompute when reads massively outnumber writes and the first request must be fast — a feed, a
> dashboard, a product's review count. I'd cache when the key space is large or unpredictable and a slow
> first request is acceptable. And whenever I precompute I'd add a reconciliation job, because unlike a cache
> there's no TTL to eventually correct a drifted value."*

---

## In your own words

**State the difference between caching and precomputation in one sentence.**

>

**Why is a Postgres materialised view really a scheduled batch job? What's the `REFRESH` trap?**

>

**What's the deciding variable between caching and precomputing? Give a ratio where each wins.**

>

**Explain fan-out on write vs on read, and why the hybrid is the real answer.**

>

**Why is correctness drift worse in a precomputed table than in a cache? What do you add?**

>

---

## Links

- Refresh-ahead, the midpoint → [02-caching-patterns.md](02-caching-patterns.md)
- Hot keys and the hybrid exception → [05-failure-modes.md](05-failure-modes.md)
- Workload shape and fan-out → [Phase 0 note 10](../../phase-00-foundations/notes/10-workload-shape.md)
- CDC-driven incremental updates → [3c-03](../../phase-03-databases/notes/3c-03-replication-methods.md)
- **Stream processing keeping views live** → Phase 6
- **Feed generation, ranking, real-time OLAP** → Phase 9
