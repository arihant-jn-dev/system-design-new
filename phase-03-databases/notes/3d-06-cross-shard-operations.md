# 3D·06 · Cross-Shard Queries, Joins & Pagination

> **Why this exists:** the roadmap lists these as *"all hard — know why."* The valuable skill isn't solving
> them (mostly you can't) — it's **recognising them early and designing so they don't arise.**

---

## Reference

### Scatter-gather — the base primitive

Any query without the shard key must ask every shard and merge:

```
query -> shard1, shard2, ... shardN  -> merge -> result
```

**Three costs, and the third is the one people miss:**

| Cost | Detail |
|---|---|
| **Latency = the SLOWEST shard** | Not the average. **Tail latency amplification** ([Phase 0 note 04](../../phase-00-foundations/notes/04-percentiles-and-tail-latency.md)): with 50 shards each 1% slow, ~40% of queries are slow. |
| **Load = N× the work** | One user query becomes N database queries |
| **Availability = the product** | ⭐ All N shards must be up. At 99.9% each, **50 shards = 95% availability** ([Phase 0 note 05](../../phase-00-foundations/notes/05-availability-vs-durability.md)). |

**That availability point is the strongest argument against routine scatter-gather** and it's rarely
mentioned. Every scatter-gather query is only as available as the *product* of all your shards.

**Mitigations:** partial results (return what answered), hedged requests, per-shard timeouts, caching the
merged result.

### Joins

**Cross-shard joins don't exist.** Your options:

| Approach | How | Trade |
|---|---|---|
| ⭐ **Colocate** | Shard both tables by the **same key** so related rows land together | **The real answer.** Users and their orders both by `user_id` → the join is local. |
| **Application-side join** | Query shard A, then query shard B with the results | N+1 round trips; batch them |
| **Denormalise** | Embed what you need — store `user_name` on the order | Storage + update anomalies. **Usually correct.** |
| **Broadcast/reference tables** | Replicate small lookup tables (countries, plans) to **every** shard | Only for small, slow-changing data |
| **Move it offline** | Join in the warehouse, not the OLTP path | Not for user-facing queries |

> **Colocation is what shard-key choice is really deciding.** *"I chose `tenant_id` so that everything a
> single request touches lives on one shard"* — that sentence covers joins, transactions **and** latency at
> once.

### Aggregations & counts

`SELECT count(*)`, `SUM`, `AVG` across shards:

| Approach | Note |
|---|---|
| **Fan out and merge** | Works for `COUNT`/`SUM`/`MIN`/`MAX` (they're associative). ⚠️ **`AVG` must be computed from `SUM` and `COUNT` separately** — you cannot average the averages. |
| **Maintained counter** | Increment on write. Fast reads; needs care under concurrency (sharded counters, Phase 9). |
| **Approximate** | **HyperLogLog** for distinct counts, count-min sketch for frequencies → Phase 9 |
| **Precomputed rollups** | Batch/stream aggregation into a summary table → Phase 6 |
| **Push to OLAP** | ClickHouse/Druid via CDC. **The production answer for analytics.** |

**"You cannot average the averages"** is a small, sharp detail worth knowing — the same trap as
[not averaging percentiles](../../phase-00-foundations/notes/04-percentiles-and-tail-latency.md).

**`COUNT(*)` on a sharded table is expensive.** Approximate it, cache it, or maintain it.

### Distributed pagination — genuinely hard

**The problem:** "page 2, 20 items, sorted by `created_at`" across 10 shards.

**Naive and wrong:** ask each shard for `LIMIT 20 OFFSET 20`. **The global page 2 is not the union of each
shard's page 2** — the 20 globally-newest items might all be on one shard.

**Correct but expensive:** ask each shard for `LIMIT 40` (offset + limit), merge all 400, sort, take rows
21–40. **Work grows with page depth × shard count** — deep pagination becomes impossible.

| Approach | Note |
|---|---|
| ⭐ **Keyset/cursor pagination** | ([Phase 1 note 08](../../phase-01-networking/notes/08-pagination.md)) Ask each shard for `WHERE created_at < cursor LIMIT 20`, merge, take 20, and the new cursor is the 20th item's key. **Constant work per page.** |
| **Cap the depth** | "Results beyond 1,000 aren't available." What Google and Elasticsearch do (ES caps `from+size` at 10,000). |
| **Sort by the shard key** | Then pages are contiguous per shard |
| **Precompute the ordered list** | For feeds: materialise the timeline (Phase 9) |

> **Distributed pagination is the clearest case where the right answer is "constrain the product."** Deep
> paging across shards has no cheap implementation, so cap it — and say so, because pretending otherwise is
> how you design something that can't be built.

### Transactions

**ACID is per-shard.** Cross-shard atomicity needs:

- **2PC** — expensive, blocking on coordinator failure → 3E
- **Sagas** — compensating transactions, eventual consistency → 3E
- ⭐ **Or: design so you don't need it** — keep everything a transaction touches on one shard

Full treatment in **3E**. The framing to carry there: **cross-shard transactions are a design smell that
usually means the shard key is wrong.**

### Uniqueness & IDs

| Problem | Answer |
|---|---|
| **`AUTO_INCREMENT` breaks** | Every shard would reissue the same IDs |
| Globally unique IDs | **UUIDv7 / ULID / Snowflake** — time-sortable, generated anywhere → Phase 9 |
| **Global uniqueness (e.g. usernames)** | ⭐ **Shard the constraint by the value itself** — put usernames in their own table sharded by `hash(username)`, so the uniqueness check is a single-shard operation with a real unique constraint |

**That last one is a lovely trick and a good interview answer:** you can't have a global unique index, but you
*can* make the uniqueness check single-shard by choosing the shard key to be the thing you're making unique.

### The recognition checklist

Ask these in every sharded design:

- [ ] Which queries **don't** include the shard key? (→ scatter-gather)
- [ ] Which queries **join** across entities? (→ colocate or denormalise)
- [ ] Are there **aggregations**? (→ precompute or approximate)
- [ ] Is there **deep pagination**? (→ cursor, or cap it)
- [ ] Does any transaction span shards? (→ **redesign the key**, or saga)
- [ ] Does anything need **global uniqueness**? (→ shard by that value)

**Running this checklist out loud during a design is itself a strong signal** — it shows you know where the
bodies are buried.

---

## In your own words

**Name the three costs of scatter-gather. Which is least mentioned and why does it matter?**

>

**50 shards at 99.9% each. What's the availability of a scatter-gather query? What does that imply?**

>

**Why can't you join across shards, and what's the real answer?**

>

**Why can't you average the averages? What's the correct approach?**

>

**Why is "ask each shard for page 2" wrong? Give a concrete counterexample.**

>

**How do you enforce globally-unique usernames in a sharded system?**

>

**Run the recognition checklist against a system you know.**

>

---

## Links

- Tail latency amplification → [Phase 0 note 04](../../phase-00-foundations/notes/04-percentiles-and-tail-latency.md)
- Availability multiplies → [Phase 0 note 05](../../phase-00-foundations/notes/05-availability-vs-durability.md)
- Keyset pagination → [Phase 1 note 08](../../phase-01-networking/notes/08-pagination.md)
- Shard key & colocation → [3d-03-shard-key-selection.md](3d-03-shard-key-selection.md)
- Secondary indexes → [3d-04-secondary-indexes-when-sharded.md](3d-04-secondary-indexes-when-sharded.md)
- **2PC and sagas** → **Phase 3E**
- Snowflake IDs, HLL, sharded counters, feed materialisation → **Phase 9**
