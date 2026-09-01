# 09·05 · Counters at Scale

> **Why this exists:** "add a view counter" sounds trivial and is the fastest way to build a hot-key problem.
> ⭐ **A counter is a single row that every write contends on** — the purest contention primitive there is.

---

## Reference

### ⭐ Why one row is a problem

`UPDATE posts SET views = views + 1 WHERE id = 42` takes a **row lock**. Every concurrent increment on the
same post **serialises**. At 50k writes/sec on one viral post you are asking a single row to accept 50k
sequential locked updates — ⭐ **it doesn't matter how big your database is; you're limited by one row's lock
throughput and by replication of that row.**

⚠️ **This is the same hot-key problem as** a hot cache key ([Phase 5](../../phase-05-caching/notes/)), a hot
partition ([Phase 3D](../../phase-03-databases/notes/)), and a celebrity in a feed
([09](09-feed-and-timeline.md)). ⭐ **One problem, four costumes — and largely the same fixes.**

### ⭐ The fixes, cheapest first

| | Technique | How | Cost |
|---|---|---|---|
| 1 | ⭐ **Do you need it exact?** | "1.2M views" — nobody audits it | ⭐ **free; ask first** |
| 2 | ⭐ **Redis `INCR`** | single-threaded, atomic, ~100k+ ops/s per key | ⚠️ durability — it's memory; persist periodically |
| 3 | ⭐ **Write-combining / batching** | each app instance holds a local delta and flushes every N ms | ⭐ **the biggest single win** |
| 4 | ⭐ **Sharded counters** | N sub-counters; increment a random one; read = **SUM** | reads get more expensive |
| 5 | **Kafka + aggregation** | emit an event, aggregate in a stream job | a pipeline; eventual |
| 6 | **Approximate (CMS/HLL)** | for "how many times" / "how many unique" | bounded error |

### ⭐ Write-combining — the technique to reach for first

```
100 app instances × 500 increments/s = 50,000 writes/s at the database
              ↓  each instance buffers locally, flushes once per second
100 app instances ×   1 flush/s      =      100 writes/s   ⭐ 500x fewer
```

⭐ **A 500× reduction for one second of staleness.** Almost every counter can afford that.

⚠️ **The cost you must name: an instance that crashes loses its buffered delta.** For view counts, fine. For
anything billable, ⭐ **you must not buffer in memory — emit an event and aggregate durably** (Kafka +
outbox).

### Sharded counters

```
counter:42:0 … counter:42:15        write: INCR a random shard
                                    read:  SUM all 16
```

⭐ **Spreads contention across 16 rows/keys instead of 1.** Reads cost 16 lookups (cache the sum). ⭐ **Choose
N from expected write rate ÷ per-key capacity**, and note you can **shard per-instance** (each instance owns
a shard → zero contention *and* no random-write skew).

⚠️ **Adding shards later is awkward** — old shards keep their values, so the read must sum *all* historical
shards. Size generously up front.

### The layered design people actually ship

```
app ──INCR──▶ Redis (hot, exact-ish, fast reads)
              │
              └─ flush every N seconds ──▶ Postgres (durable source of truth)
```

⭐ **Reads hit Redis; the database is the durable record; a reconciliation job repairs drift.** Say this
shape and then the two failure modes: ⚠️ **Redis restarts → recover from the DB and lose ≤N seconds** ·
⚠️ **flush fails → the delta must be idempotent or replayable** (store an absolute value, or use an
idempotency key per flush window).

### ⭐ Choosing by what the counter is FOR

| Counter | Answer |
|---|---|
| **Page/video views** | ⭐ Redis `INCR` + write-combining. Approximate is fine |
| **Likes** (user-visible, must reflect *your own* like) | ⭐ Redis for the total + **read-your-own-writes** for your action ([Phase 8 CQRS](../../phase-08-architecture/notes/05-cqrs.md)) |
| **Unique viewers** | ⭐ **HyperLogLog** ([04](04-probabilistic-structures.md)) — not a counter at all |
| **Rate-limit counters** | ⭐ Redis + Lua, TTL'd ([03](03-rate-limiter-as-a-component.md)) |
| ⚠️ **Inventory / balance / quota** | ⭐ **NOT any of this.** A real transaction with a constraint (`CHECK qty >= 0`). ⭐ **These are not counters — they're invariants**, and approximation is a bug |
| **Analytics / trending** | Kafka → stream aggregation → OLAP ([15](15-analytics-pipelines.md)) |

> ⭐ **THE DIVIDING LINE: is the number a STATISTIC or an INVARIANT?** Statistics can be sharded,
> approximated, buffered and eventually consistent. Invariants need a transaction. **Deciding which you have
> is the whole design.**

### Trending / top-K

**"Most viewed in the last hour"** is a counter question with a time window:

- **Redis sorted set** (`ZINCRBY` + `ZREVRANGE`) per time bucket — simple, exact, works to surprising scale
- ⭐ **Count-Min Sketch + a heap** when the key space is too large to hold — approximate, constant memory
- **Decay** (multiply by 0.9 per interval) so old activity fades — ⭐ *otherwise "trending" just means "popular forever"*
- ⚠️ **Time-bucket your keys** (`trending:2026-08-08T14`) and let old buckets **expire by TTL**, rather than deleting

---

## In your own words

**⭐ Why is a single-row counter a scaling problem, regardless of database size?**

>

**Name the other three problems this is the same as.**

>

**⭐ Explain write-combining with the arithmetic. What does it cost, and when can't you use it?**

>

**How do sharded counters work? What gets more expensive, and what's awkward later?**

>

**Draw the Redis + Postgres layered design and name its two failure modes.**

>

**⭐ State the statistic-vs-invariant dividing line, and give an example of each.**

>

**⭐ Which counter problems are actually a different structure entirely?**

>

**How would you build "trending in the last hour", and why does it need decay?**

>

---

## Links

- ⭐ Hot keys, Redis semantics → [Phase 5](../../phase-05-caching/notes/)
- Hot partitions — the same problem → [Phase 3D](../../phase-03-databases/notes/)
- HLL and Count-Min Sketch → [04-probabilistic-structures.md](04-probabilistic-structures.md)
- Celebrity fan-out — the same problem again → [09-feed-and-timeline.md](09-feed-and-timeline.md)
- Durable aggregation → [15-analytics-pipelines.md](15-analytics-pipelines.md)
- Balances are *not* counters → [16-payments-primitives.md](16-payments-primitives.md)
