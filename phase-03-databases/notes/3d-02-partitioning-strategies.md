# 3D·02 · Partitioning Strategies

> **Why this exists:** each strategy is a different answer to *"given a key, which node?"*, and each buys
> something specific at a specific cost. The choice interacts with your **access pattern**, not just your
> data.

---

## Reference

### The strategies

| Strategy | Mapping | Range scans? | Hotspot risk | Rebalancing |
|---|---|---|---|---|
| **Range** | Sorted key ranges: A–F → s1, G–M → s2 | ✅ **Excellent** | ⚠️ **High** | Split/merge ranges |
| **Hash** | `hash(key) mod N` | ❌ **Destroyed** | Low | ⚠️ **Catastrophic** (Phase 2 lab: 75% move) |
| **Consistent hash** | Ring + vnodes | ❌ | Low | ✅ **~1/N moves** |
| **Hash-of-range (composite)** | Hash the partition key, **sort within it** | ✅ **Within a partition** | Low | Good |
| **Directory / lookup** | An explicit key→shard table | Depends | Manageable | ✅ **Total control** |
| **Geo** | By region/jurisdiction | ✅ Within region | Uneven by population | Manual |

---

### 1 · Range partitioning

Keys sorted; contiguous ranges assigned to shards.

| ✅ | ❌ |
|---|---|
| **Range scans stay on one shard** (`WHERE date BETWEEN`) | **Hotspots** — sequential keys all hit one shard |
| Boundaries can adapt to the data | Requires knowing the distribution, or dynamic splitting |
| Natural for time-series | |

> ⚠️ **The classic failure: partitioning by timestamp.** All of *today's* writes go to the newest shard while
> every other shard sits idle. You have N machines and the write throughput of one.
>
> **Fix: put something high-cardinality first** — `(device_id, timestamp)` rather than `(timestamp)`. Writes
> spread across devices; reads for one device's time range stay on one shard. That's **hash-of-range**, below.

**Used by:** HBase, Bigtable, MongoDB (ranged), CockroachDB, and Postgres declarative partitioning.

---

### 2 · Hash partitioning

`shard = hash(key) mod N`. Uniform distribution.

| ✅ | ❌ |
|---|---|
| **Even distribution**, no hotspots from key ordering | **Range scans must hit every shard** (scatter-gather) |
| Simple | **`mod N` rebalances catastrophically** — you measured this: 75% of keys move for 3→4 |
| | Ordering lost entirely |

**Use consistent hashing** ([Phase 2 note 04](../../phase-02-stateless-scaling/notes/04-consistent-hashing.md))
instead of `mod N`, or a fixed large number of logical partitions (below).

---

### 3 · Hash-of-range (compound key) — usually the right answer ⭐

**Hash the partition key to choose the shard; sort by a clustering key within it.**

```
PRIMARY KEY ((device_id), timestamp)
             └─partition─┘ └─clustering─┘
   hash(device_id) -> which node
   timestamp       -> sorted ORDER WITHIN that node
```

**You get both:** even distribution across shards *and* efficient range scans within a partition.

**This is exactly Cassandra's/DynamoDB's primary key model** — Cassandra's partition key + clustering
columns, DynamoDB's partition key + sort key. It's also why their data modelling is "query-first": **you
choose the key to match the query you need.** → 3F.

---

### 4 · Directory / lookup service

An explicit `key → shard` mapping in a metadata service.

| ✅ | ❌ |
|---|---|
| **Total control** — move any key anywhere | **The directory is a SPOF and a hot path** |
| Arbitrary rebalancing, per-tenant placement | Extra lookup (cache it) |
| Handles heterogeneous shards, hot keys | More moving parts |

**Used by:** Vitess (VSchema), many multi-tenant SaaS (`tenant_id → shard`), Facebook's TAO-era design.

> **This is the right answer for multi-tenant systems**, where you want to pin a big customer to their own
> shard, and move them when they grow.

---

### 5 · Geo partitioning

By region — usually for **latency** or **legal data residency** (GDPR, India's data localisation).

**Note it's often not a choice:** "EU user data must be stored in the EU" is a legal constraint that dictates
the partitioning scheme. **Say that out loud** — it's a constraint interviewers respect.

**Costs:** uneven population sizes, cross-region queries are expensive, users who travel.

---

### The key technique: logical partitions ⭐

**Don't map keys directly to physical nodes. Map them to a large, fixed number of *logical* partitions, then
map partitions to nodes.**

```
key  --hash-->  one of 1024 LOGICAL partitions  --lookup-->  physical node

Adding a node = MOVE SOME PARTITIONS. The key->partition mapping NEVER CHANGES.
```

| Benefit | Why |
|---|---|
| **Rebalancing is just moving partitions** | No rehashing; the hash mapping is stable forever |
| Fine-grained load balancing | Move a hot partition off a busy node |
| Heterogeneous nodes | Give a bigger machine more partitions |
| Simple mental model | Partition count is fixed at creation |

**Choose the count generously up front** (1024, 4096) — it caps your maximum node count, and changing it is
the painful operation you were avoiding.

**Used by:** Kafka (topic partitions), Elasticsearch (shards — **fixed at index creation**, hence "reindex to
change shard count"), Riak, Couchbase (1024 vBuckets), Citus.

> **This is the single most useful practical idea in 3D.** It decouples "which partition" (stable, hashed)
> from "which machine" (dynamic, rebalanced) — and it's why Kafka can add brokers without breaking key
> ordering, while *changing partition count* breaks it.

### Postgres declarative partitioning — a different thing, worth not confusing

Postgres `PARTITION BY RANGE/LIST/HASH` splits a table **within one database**, not across machines.

**What it buys:** partition pruning (skip irrelevant partitions), and — the big one — **dropping old data
with `DROP PARTITION` instead of a `DELETE` that generates enormous WAL and bloat.**

> **"Partition by month and drop old partitions"** is the standard answer for time-series retention in
> Postgres, and it's a *single-node* technique. Don't call it sharding.

---

## In your own words

**Range vs hash — state the trade in one sentence.**

>

**Why is partitioning by timestamp a classic mistake? Give the fix.**

>

**Explain hash-of-range and why it's usually the right answer. Which real systems use it?**

>

**When is a directory-based scheme worth its SPOF? Give a concrete case.**

>

**Explain logical partitions. What problem do they solve, and why must you choose the count generously?**

>

**Why does changing Kafka's partition count break key ordering? Connect it to this note.**

>

**How is Postgres declarative partitioning different from sharding, and what's its killer feature?**

>

---

## Links

- Consistent hashing, measured → [Phase 2 note 04](../../phase-02-stateless-scaling/notes/04-consistent-hashing.md)
- **Choosing the key** → [3d-03-shard-key-selection.md](3d-03-shard-key-selection.md)
- Rebalancing → [3d-05-resharding-without-downtime.md](3d-05-resharding-without-downtime.md)
- Cassandra/DynamoDB key modelling → Phase 3F
- Kafka partitions → Phase 6
- **DDIA ch. 6**
