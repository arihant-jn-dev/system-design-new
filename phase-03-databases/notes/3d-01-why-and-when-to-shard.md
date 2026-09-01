# 3D·01 · Why and When to Shard

> **Why this exists:** the roadmap's answer is blunt — *"why shard, and the honest answer: **don't until you
> must**."* Reflexively proposing sharding is a mid-level tell. Knowing the ladder you climb first, and the
> specific trigger that forces the decision, is the senior version.

---

## Reference

### What sharding is (and isn't)

**Sharding / partitioning: splitting one dataset across multiple machines so each holds only a subset.**

| | Replication | Sharding |
|---|---|---|
| Each node holds | **The whole dataset** | **A subset** |
| Scales | **Reads**, availability | **Writes**, storage, memory |
| Adds | Lag, failover | **Routing, cross-shard queries, rebalancing** |

**They're orthogonal and you almost always want both:** shard for capacity, replicate each shard for
availability. A "shard" in production is really a replica set.

### The four reasons to shard — be specific about which one

| Driver | Symptom | Note |
|---|---|---|
| **Write throughput** | The single leader can't keep up | **The main legitimate reason.** Replicas can't help. |
| **Data size** | Dataset exceeds one machine's disk, or the working set exceeds RAM | The **working set** exceeding RAM is the one that hurts — hit rate falls off a cliff |
| **Memory / index size** | Indexes no longer fit in the buffer cache | Same cliff |
| Operational blast radius | One huge DB = one huge failure | Real, but usually solved better by cells (Phase 7) |

**Note what's *not* on the list: read throughput.** That's replicas + cache. **If someone proposes sharding
for reads, they've skipped four cheaper steps.**

### Why "don't until you must" — the honest costs

Sharding is a **one-way door**. What you give up:

| You lose | Detail |
|---|---|
| **Cross-shard joins** | Gone. You join in the application, or denormalise. |
| **Cross-shard transactions** | ACID is per-shard. You need 2PC or sagas (3E). |
| **Global uniqueness** | `AUTO_INCREMENT` doesn't work. Need Snowflake/UUIDv7 (Phase 9). |
| **Global secondary indexes** | Scatter-gather or a separate index (3D·04) |
| **Aggregations & `COUNT(*)`** | Must fan out and merge |
| **Distributed pagination** | Genuinely hard (3D·06) |
| **Operational simplicity** | N databases to back up, upgrade, monitor, migrate |
| **Schema migrations** | Now a distributed rollout |
| **A permanent shard-key decision** | Change it later and you rewrite everything |

> **The sentence to have ready:** *"Sharding trades a database problem for a distributed-systems problem.
> Every query that was one line becomes application logic, and the shard key is effectively permanent. I'd
> exhaust vertical scaling, caching and read replicas first — and I'd expect that to carry us to roughly 10×
> current load."*

### The ladder — climb it in order

From [Phase 0 note 09](../../phase-00-foundations/notes/09-scalability-and-elasticity.md), specialised for
the database:

```
1. MEASURE — find the actual bottleneck (writes? size? memory? one bad query?)
2. Fix queries and indexes           ← frequently 10x for free (Lab A!)
3. Vertical scale                    ← a modern box is 128 cores / 2 TB RAM / 30 TB NVMe
4. Connection pooling (pgbouncer)    ← if the limit is connections, not the DB (3a-08)
5. Cache                             ← if reads dominate
6. Read replicas                     ← if reads still dominate
7. Move BIG/COLD data out            ← blobs to S3, logs to a TSDB, analytics to a warehouse
8. Archive / TTL old rows            ← often halves the dataset for free
9. FEDERATION (vertical partitioning) ← split by TABLE onto separate DBs. Much cheaper than sharding.
10. SHARD                            ← last, and permanent
```

**Steps 7–9 are the underrated ones.** Moving images to S3, sending events to ClickHouse, and archiving rows
older than 18 months can shrink a "we must shard" dataset by 90%.

**Federation** deserves its own mention: split by *table group* — users DB, orders DB, analytics DB. You lose
cross-group joins but keep everything else, and each piece is still a normal database. **It's the cheapest
step that buys real headroom**, and it's often mistaken for microservices when it's just a storage decision.

### When you genuinely must

Recognise these:

- **Sustained write throughput above a well-tuned single node** — call it >20–50 K writes/sec, workload
  dependent
- **Dataset >> RAM, with a random access pattern** — no cache saves you
- **Multi-tenant with hard isolation requirements** — one tenant per shard/DB
- **Regulatory data residency** — EU data must live in the EU (this is geo-sharding, and it's a *legal*
  requirement, not a performance one)
- **Blast-radius requirements** — cells (Phase 7)

> **The two strongest "must shard" arguments in an interview are the ones that aren't about performance:**
> data residency and tenant isolation. They can't be solved by a bigger machine.

### The alternative worth naming: managed distributed SQL

Before hand-rolling shards, consider systems that shard *for* you while keeping SQL and transactions:

| System | Notes |
|---|---|
| **CockroachDB, YugabyteDB, TiDB** | Distributed SQL, automatic rebalancing, distributed transactions |
| **Vitess** (MySQL) | What YouTube and Slack use. Sharding as a proxy layer. |
| **Citus** (Postgres) | Postgres extension for distributed tables |
| **Aurora / AlloyDB** | Not sharded, but push single-node limits much further (separates storage from compute) |
| **DynamoDB / Cassandra** | Sharded by design — but you accept their data model |

> *"I'd look at Citus or Vitess before writing my own shard router — application-level sharding means
> reimplementing rebalancing, routing and cross-shard queries, which is a lot of undifferentiated work."*
> That's a strong build-vs-buy answer.

---

## In your own words

**Sharding vs replication — what does each scale? Why do you want both?**

>

**Name the four legitimate drivers. Which common one is NOT on the list, and what solves it instead?**

>

**List five things you permanently lose by sharding.**

>

**Walk the ladder. Which steps are most underrated, and why?**

>

**What is federation, and why is it much cheaper than sharding?**

>

**Give the two strongest "must shard" arguments that aren't about performance.**

>

---

## Links

- The general scaling ladder → [Phase 0 note 09](../../phase-00-foundations/notes/09-scalability-and-elasticity.md)
- Query/index tuning (step 2) → [3a-04](3a-04-indexes.md), [`../lab/lab-a-indexing/`](../lab/lab-a-indexing/)
- Connection limits (step 4) → [3a-08-connection-pooling.md](3a-08-connection-pooling.md)
- Read replicas (step 6) → [3c-01-single-leader-replication.md](3c-01-single-leader-replication.md)
- **Strategies** → [3d-02-partitioning-strategies.md](3d-02-partitioning-strategies.md)
- Cells & blast radius → Phase 7
- **DDIA ch. 6**
