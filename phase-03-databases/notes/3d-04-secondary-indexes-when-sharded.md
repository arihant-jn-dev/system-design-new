# 3D·04 · Secondary Indexes in a Sharded World

> **Why this exists:** on one machine a secondary index is free and obvious. Once sharded, **there is no
> good answer** — only two bad ones, and knowing both (plus which to pick) is a real depth signal.

---

## Reference

### The problem

You shard by `user_id`. Now: `SELECT * FROM orders WHERE status = 'pending'`.

**`status` tells you nothing about which shard.** The matching rows are scattered across all of them.

### Option 1 · Local (document-partitioned) index

**Each shard indexes only its own data.**

```
shard 1: index on status -> {its own pending orders}
shard 2: index on status -> {its own pending orders}
shard 3: index on status -> {its own pending orders}
```

| ✅ Writes | ❌ Reads |
|---|---|
| **A write touches ONE shard** — the local index updates in the same local transaction | **Every read is scatter-gather:** query all N shards, merge results |
| Simple, consistent, fast writes | Latency = the **slowest** shard (tail latency amplification, [Phase 0 note 04](../../phase-00-foundations/notes/04-percentiles-and-tail-latency.md)) |
| No cross-shard coordination | Cost grows linearly with shard count |
| | Sorting/pagination across shards is hard (3D·06) |

**The tail-latency point is the killer at scale:** scatter-gather to 50 shards means your p50 is the shards'
p98. You measured this effect in Phase 0's lab.

**Used by:** MongoDB, Elasticsearch (each shard has its own inverted index), Cassandra secondary indexes,
Riak.

> ⚠️ **This is why "Cassandra secondary indexes are a trap"** — they're local, so every query without the
> partition key hits every node. Fine at 3 nodes, catastrophic at 100. The Cassandra idiom is a **separate
> denormalised table** keyed for that query instead.

---

### Option 2 · Global (term-partitioned) index

**The index itself is a separate sharded structure, partitioned by the *indexed term*.**

```
index shard A: status='pending'   -> [order ids across ALL data shards]
index shard B: status='shipped'   -> [order ids across ALL data shards]
```

| ✅ Reads | ❌ Writes |
|---|---|
| **A read hits ONE index shard** — no scatter-gather | **A write touches TWO shards**: the data shard and the index shard |
| Scales with read volume | **Cross-shard write → needs a distributed transaction, or accept inconsistency** |
| | Usually updated **asynchronously**, so the index is eventually consistent |
| | Index shards can be hot (a popular term) |

**In practice global indexes are updated asynchronously** — because doing it synchronously means 2PC on every
write. **So the index lags: a newly-created order may not appear in a `status` query for a moment.**

**Used by:** DynamoDB **GSI** (explicitly eventually consistent, and documented as such), Vitess lookup
vindexes, most custom implementations.

> **DynamoDB is the clearest example to cite:** its Local Secondary Index (same partition key) is
> strongly consistent; its **Global** Secondary Index is **only** eventually consistent. That's not an
> implementation shortcut — it's the fundamental trade in this note, made visible in a product's API.

---

### The comparison

| | **Local (document-partitioned)** | **Global (term-partitioned)** |
|---|---|---|
| Index lives | With the data | **Separately sharded by term** |
| Write cost | **1 shard** | **2 shards** (or async) |
| Read cost | **All N shards** | **1 shard** |
| Consistency | **Strong** | **Eventual** (usually) |
| Best for | **Write-heavy**, few index queries, small shard counts | **Read-heavy**, many index queries, large shard counts |

> **The one-line trade: local indexes make writes cheap and reads expensive; global indexes make reads cheap
> and writes expensive (or inconsistent).** There is no third option — you're choosing which side pays.

### The third answer: don't use a secondary index at all

Often the best move, and worth proposing:

| Approach | How |
|---|---|
| ⭐ **Denormalise into a query-specific table** | Maintain `orders_by_status` keyed for that query. **The Cassandra/DynamoDB idiom** — model per query, not per entity. |
| ⭐ **Push it to a search engine** | Ship changes via CDC to Elasticsearch, which is built for arbitrary-field queries. **The standard production answer.** |
| **Async/offline queries** | If "all pending orders" is an admin report, run it against the warehouse, not the OLTP shards |
| **Add the shard key to the query** | Often the query *can* be scoped: "pending orders **for this user**" hits one shard |
| Materialised view | Precompute the answer |

> **The strong interview answer:** *"For anything queried by a non-shard-key field at high volume, I'd
> replicate into Elasticsearch via CDC rather than build a global secondary index. That keeps the OLTP path
> single-shard, and search engines are designed for exactly this. I'd accept the index being a second or two
> behind — and I'd say so explicitly, because it means it's not a system of record."*

That answer connects 3C·03 (logical replication/CDC), 3D·04, and 3F, which is why it lands well.

### And the simplest fix of all

**Check whether the query really needs to be global.** `WHERE status = 'pending'` is scatter-gather;
`WHERE user_id = 42 AND status = 'pending'` is a single-shard query with a local index.

**Adding the shard key to a query converts scatter-gather into a point query.** Frequently the query pattern
can be scoped and nobody had asked.

---

## In your own words

**State the problem in one sentence: why is a secondary index hard once sharded?**

>

**Local index — where does the cost land, on reads or writes? Why?**

>

**Global index — same question, and why is it usually eventually consistent?**

>

**Give the one-line trade between them, and pick one for a write-heavy system with 100 shards.**

>

**Why are Cassandra secondary indexes considered a trap? What's the idiomatic alternative?**

>

**What does DynamoDB's LSI-vs-GSI consistency difference demonstrate?**

>

**Give the "don't use a secondary index" answer you'd actually propose in an interview.**

>

---

## Links

- Scatter-gather tail latency → [Phase 0 note 04](../../phase-00-foundations/notes/04-percentiles-and-tail-latency.md)
- CDC as the pipe to a search index → [3c-03-replication-methods.md](3c-03-replication-methods.md) and Phase 6
- Shard key choice determines which queries are cheap → [3d-03-shard-key-selection.md](3d-03-shard-key-selection.md)
- Cross-shard queries generally → [3d-06-cross-shard-operations.md](3d-06-cross-shard-operations.md)
- Query-first modelling, Elasticsearch → Phase 3F
- Search internals → Phase 9
- **DDIA ch. 6**, "Partitioning and Secondary Indexes"
