# 3F·02 · Key-Value & Document Stores

> **Why this exists:** these are the two families people reach for first and understand least. The useful
> distinctions: **Redis is not a database**, **DynamoDB is not a document store you query freely**, and
> **MongoDB's real question is embed vs reference.**

---

## Reference

## Key-value

**The simplest model: `get(key)`, `put(key, value)`, `delete(key)`. No queries, no joins, no schema.**
Because the access path is trivial, it partitions perfectly and scales horizontally without limit.

### Redis

**In-memory, single-threaded, with rich data structures.** The data structures are the point — they're what
turn Redis from a cache into a toolkit.

| Structure | Unlocks |
|---|---|
| String | Cache, counters (`INCR`), locks |
| **Hash** | Objects with field-level access |
| **List** | Queues, recent-items |
| **Set** | Membership, unique visitors |
| ⭐ **Sorted set (ZSET)** | **Leaderboards, rate limiters (sliding window), priority queues, time-ordered feeds** |
| HyperLogLog | Approximate distinct counts in ~12 KB |
| Bitmap | Per-user daily-activity flags in tiny space |
| Stream | An append-only log with consumer groups |
| Geo | Radius queries |

> **Sorted sets are the single most reusable Redis feature** — a sliding-window rate limiter, a leaderboard,
> and a delayed-job queue are all `ZADD`/`ZRANGEBYSCORE`. → Phase 5, Phase 7, Phase 9.

**Being precise about Redis:**
- ⭐ **It's a cache by default, not a system of record.** Persistence (RDB snapshots, AOF) exists, but the
  common configuration accepts a loss window. **Decide deliberately whether you can lose it.**
- **Single-threaded** for command execution — so one `KEYS *` or a big `ZRANGE` **blocks everything**. Use
  `SCAN`. This is also why one Redis node caps at ~100 K–1 M ops/sec: it's one CPU core.
- **Lua scripts execute atomically** — the way to do multi-step read-modify-write safely.
- **Sentinel** (HA for a single instance) vs **Cluster** (sharded, 16,384 hash slots). Cluster restricts
  multi-key operations to one slot.

### DynamoDB

**Managed, serverless, effectively unlimited scale — provided you model for the access pattern up front.**

```
PARTITION KEY  -> which partition (hashed)
SORT KEY       -> ordering WITHIN the partition   <- this is hash-of-range (3d-02)
```

| Property | Detail |
|---|---|
| **Query** | Only by partition key (+ optional sort-key range). **Anything else is a `Scan`, which reads the whole table.** |
| **LSI** | Same partition key, different sort key. **Strongly consistent.** |
| **GSI** | Different partition key. ⚠️ **Eventually consistent** — the fundamental trade from [3d-04](3d-04-secondary-indexes-when-sharded.md) |
| Consistency | Eventually consistent reads by default; **strongly consistent reads cost 2×** |
| Transactions | `TransactWriteItems` — up to 100 items, at 2× cost |
| Limits | **400 KB per item**; hot partitions still exist despite adaptive capacity |
| Cost | Pay per request or provisioned. ⚠️ **A `Scan` on a large table is a genuinely expensive mistake.** |

> **The DynamoDB rule: you must know your queries before you design the table.** That's the same
> query-first discipline as Cassandra ([3f-03](3f-03-wide-column.md)), and it's why "we'll figure out the
> queries later" is fatal here and fine in Postgres.

**Single-table design** — putting multiple entity types in one table with a generic `PK`/`SK`, so one query
fetches a parent and its children together. Powerful, and genuinely hard to read and evolve. **Propose it
only when you can justify it.**

---

## Document stores

**Store JSON-like documents. Schema-flexible; nested structure; query by fields inside the document.**

### MongoDB

| ✅ | ❌ |
|---|---|
| Flexible schema — evolve without migrations | ⚠️ **Flexible schema means the schema lives in your application code** |
| Nested data fetched in one read | Joins (`$lookup`) exist but are weak |
| Good secondary indexes (local — [3d-04](3d-04-secondary-indexes-when-sharded.md)) | Multi-document transactions exist but cost |
| Aggregation pipeline is genuinely powerful | Historically poor defaults; much improved |
| Sharding built in | Shard key is **permanent-ish** and hard to change |

### ⭐ The real question: embed or reference

**This is the document-modelling decision, and it's what interviewers probe.**

```javascript
// EMBED — one read gets everything
{ _id: 1, title: "Post", comments: [ {...}, {...} ] }

// REFERENCE — normalised
{ _id: 1, title: "Post" }
{ _id: 9, post_id: 1, text: "..." }
```

| Embed when | Reference when |
|---|---|
| Read together, always | Accessed independently |
| **Bounded** in size | ⭐ **Unbounded growth** (comments, events, logs) |
| Updated together | Updated at different rates |
| One-to-few | One-to-many/huge, or many-to-many |
| Consistency needed within the document | Shared between parents |

⚠️ **The classic failure: embedding an unbounded array.** MongoDB's 16 MB document limit turns "comments on a
viral post" into a hard wall — and long before that, every update rewrites the whole document. **If it grows
without bound, reference it.**

**Duplication is expected in document stores** — store `author_name` on the post to avoid a lookup. The cost
is update anomalies (renaming an author means updating N documents), which you accept deliberately and
usually fix with an async job.

### Postgres JSONB — the honest comparison

```sql
CREATE TABLE events (id bigserial PRIMARY KEY, data jsonb);
CREATE INDEX ON events USING gin (data);
SELECT * FROM events WHERE data @> '{"type":"click"}';
```

**You get document flexibility plus real transactions, joins and constraints.** For a great many "we need a
document store" requirements this is the better answer — **especially when only *part* of your data is
schemaless**, which is the common case.

**Choose MongoDB over JSONB when:** you need built-in horizontal sharding, the aggregation pipeline
specifically, or a genuinely document-shaped domain at large scale.

---

## In your own words

**Why is Redis's single-threaded model both a feature and a constraint? Name a command that exploits it badly.**

>

**What do sorted sets unlock? Name three distinct uses.**

>

**Is Redis a database? Answer carefully.**

>

**Why must you know your queries before designing a DynamoDB table? What happens if you don't?**

>

**Why is a DynamoDB GSI eventually consistent? (Connect it to 3d-04.)**

>

**Give the embed-vs-reference rule, and the classic failure mode of getting it wrong.**

>

**When would you choose Postgres JSONB over MongoDB, and when not?**

>

---

## Links

- Hash-of-range partitioning → [3d-02](3d-02-partitioning-strategies.md) · Secondary indexes → [3d-04](3d-04-secondary-indexes-when-sharded.md)
- Query-first modelling in depth → [3f-03-wide-column.md](3f-03-wide-column.md)
- **Redis in depth — persistence, eviction, cluster, Redlock** → **Phase 5**
- Rate limiters, leaderboards, HLL → Phase 7, Phase 9
