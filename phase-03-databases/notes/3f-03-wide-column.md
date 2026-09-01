# 3F·03 · Wide-Column Stores (Cassandra)

> **Why this exists:** the roadmap flags exactly what matters — **"query-first data modeling, partition key
> vs clustering key, tunable consistency, why 'no joins' changes everything."** This is also the lab
> (roadmap lab 4), where you'll write at `QUORUM`, kill a node, and watch consistency levels behave.

---

## Reference

### The model

**Not** "rows with many columns." A wide-column store is closer to:

```
partition key  ->  a SORTED MAP of (clustering key -> columns)
```

```cql
CREATE TABLE messages_by_conversation (
    conversation_id uuid,        -- PARTITION KEY: which node
    sent_at         timestamp,   -- CLUSTERING KEY: sort order WITHIN the partition
    message_id      uuid,
    sender_id       uuid,
    body            text,
    PRIMARY KEY ((conversation_id), sent_at, message_id)
) WITH CLUSTERING ORDER BY (sent_at DESC);
```

| Part | Determines |
|---|---|
| **Partition key** | `hash(key)` → **which node(s)**. All rows with the same partition key live together. |
| **Clustering key** | **Sort order within the partition.** Enables efficient range scans there. |

**This is hash-of-range partitioning** ([3d-02](3d-02-partitioning-strategies.md)) exposed directly in the
schema. Even distribution *and* efficient ranges — but only *within* a partition.

### ⭐ Query-first data modelling

**In a relational database you model the *data*, then query it however you like. In Cassandra you model the
*queries*, and the data layout follows.**

```
Relational:  entities -> normalise -> write queries -> add indexes
Cassandra:   list the QUERIES -> design one TABLE PER QUERY -> duplicate data freely
```

**The rules that follow:**

1. **One table per query pattern.** Need messages by conversation *and* by sender? **Two tables.**
2. **Denormalise aggressively.** Duplicate `sender_name` into every table that displays it. Storage is
   cheap; a join is impossible.
3. **The application maintains consistency between the copies** (or a batch/CDC job does).
4. **You cannot query by a non-key column efficiently.** No ad-hoc queries. Ever.

```cql
-- Same data, THREE tables, because there are three queries.
CREATE TABLE messages_by_conversation (...) PRIMARY KEY ((conversation_id), sent_at);
CREATE TABLE messages_by_sender       (...) PRIMARY KEY ((sender_id), sent_at);
CREATE TABLE message_by_id            (...) PRIMARY KEY (message_id);
```

> **"Why 'no joins' changes everything":** without joins, the *only* way to answer a query in one round trip
> is to have already stored the answer in that shape. So **writes become the expensive, thoughtful part**
> (write to N tables) and reads become trivial. It's the exact inverse of the relational bargain, and it's
> why adding a new query later can mean a **backfill**, not a new index.

### Partition sizing — the operational constraint

| Guideline | |
|---|---|
| Target partition size | **< 100 MB**, ideally < 10 MB |
| Rows per partition | **< 100,000** |
| ⚠️ **Unbounded partitions** | **The #1 Cassandra modelling mistake** |

**The classic failure:** `PRIMARY KEY ((sensor_id), timestamp)` — one partition per sensor, growing forever.
After a year it's gigabytes, and reads, compaction and repair all degrade.

**The fix — bucketing:**
```cql
PRIMARY KEY ((sensor_id, day), timestamp)     -- a new partition each day
```
You now query per-day (and fan out across days for longer ranges). **Bucketing an unbounded partition by
time is the standard Cassandra pattern**, and knowing it is a strong signal.

### Tunable consistency — the lab's core

Per-query consistency levels over `R + W > N` ([3c-06](3c-06-leaderless-quorum.md)):

| Level | Replicas that must respond |
|---|---|
| `ONE` / `TWO` / `THREE` | That many |
| **`QUORUM`** | `floor(RF/2) + 1` — **2 of 3** |
| **`LOCAL_QUORUM`** | Quorum **within the local DC** — the multi-DC standard |
| `ALL` | Every replica — **no failure tolerance** |
| `ANY` (writes) | Even just a hinted handoff. Almost no guarantee. |

```
RF=3, write QUORUM (2) + read QUORUM (2)  ->  2+2 > 3  ->  read sees the latest ✅
RF=3, write ONE (1)   + read ONE (1)      ->  1+1 ≤ 3  ->  may read stale ⚠️
```

**Tune per query, not per database:** `QUORUM` for the account balance, `ONE` for the activity feed.

**And note what it costs:** with `RF=3` and `QUORUM`, **one node down is fine; two is not.** `ALL` cannot
tolerate a single node being down — which is why it's almost never used.

### Where Cassandra wins and where it hurts

| ✅ Wins | ❌ Hurts |
|---|---|
| **Very high write throughput** (LSM — [3a-02](3a-02-lsm-tree.md)) | **No joins, no ad-hoc queries** |
| **Linear horizontal scaling**, no leader | ⚠️ **Secondary indexes are local → a trap at scale** ([3d-04](3d-04-secondary-indexes-when-sharded.md)) |
| **No SPOF**, no failover — any node coordinates | **No real transactions** (LWT/Paxos exists and is slow) |
| **Multi-DC replication** built in | **LWW conflict resolution silently loses concurrent writes** ([3c-05](3c-05-multi-leader.md)) |
| Time-series and append-heavy workloads | ⚠️ **Deletes are tombstones** — heavy deletes destroy read performance |
| Tunable consistency per query | **Operationally demanding**: compaction, repair, JVM tuning |

> ⚠️ **"Don't use Cassandra as a queue"** — a table you write and delete from accumulates tombstones, reads
> scan past thousands of them, and queries start timing out ([3a-02](3a-02-lsm-tree.md)). It's the most
> famous Cassandra anti-pattern.

**Repair is a real operational duty:** without periodic `nodetool repair` (or incremental repair), replicas
drift, and deleted data can **resurrect** past `gc_grace_seconds`.

### Cassandra vs ScyllaDB vs HBase vs DynamoDB

| | Note |
|---|---|
| **Cassandra** | The reference implementation. JVM; GC pauses are a real p99 factor. |
| **ScyllaDB** | C++ rewrite, shard-per-core, **CQL-compatible**. Typically far better p99 and lower node counts. |
| **HBase** | Range-partitioned (not hash), strongly consistent, needs HDFS + ZooKeeper. Heavier. |
| **DynamoDB** | Managed, same modelling discipline, no ops burden, pay-per-request |
| **Bigtable** | Google's managed original |

> **"I'd use ScyllaDB or DynamoDB rather than self-hosted Cassandra"** is a defensible and mature position —
> Cassandra's operational load (repair, compaction tuning, JVM) is genuinely high.

### When to choose it

**Good fit:** write-heavy · time-series/event data · known, fixed query patterns · needs multi-DC · needs
linear scale with no single leader · eventual consistency acceptable for most reads.

**Bad fit:** ad-hoc queries · joins · transactions · heavy deletes/updates · small data (**a 3-node cluster
to hold 10 GB is absurd** — use Postgres) · a team without ops capacity.

---

## In your own words

**Describe the data model in one line, using "partition key" and "clustering key".**

>

**Explain query-first modelling. Why does it mean one table per query?**

>

**Why does "no joins" make WRITES the expensive part? What's the consequence of adding a new query later?**

>

**What's the #1 modelling mistake, and what's the standard fix?**

>

**RF=3: give a read/write CL pair that guarantees you see the latest, and one that doesn't. Show the arithmetic.**

>

**Why is "don't use Cassandra as a queue" a rule?**

>

**Give three signals Cassandra is the wrong choice.**

>

---

## Links

- LSM trees & tombstones → [3a-02](3a-02-lsm-tree.md)
- R+W>N, hinted handoff, read repair → [3c-06](3c-06-leaderless-quorum.md)
- LWW conflict resolution → [3c-05](3c-05-multi-leader.md)
- Hash-of-range partitioning → [3d-02](3d-02-partitioning-strategies.md) · local indexes → [3d-04](3d-04-secondary-indexes-when-sharded.md)
- ⭐ **Build a 3-node cluster and test all of this** → [`../lab/lab-d-cassandra/`](../lab/lab-d-cassandra/)
- **DDIA ch. 2–3** · the **Cassandra** and **Bigtable** papers
