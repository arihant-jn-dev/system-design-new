# 3F·01 · Relational — The Default You Should Defend

> **Why this exists:** the roadmap's instruction is unusually direct — *"the default; know why you'd stay
> here longer than you think."* Reflexively reaching for NoSQL is a mid-level tell. **Defending Postgres is
> often the senior answer**, and you need the ammunition to do it.

---

## Reference

### The data model

Rows and columns, a fixed schema, relationships by foreign key, and a **declarative query language** where
you say *what* you want and the planner decides *how*.

**The underrated part is that last one.** With a KV or wide-column store, the access path is baked into your
data model at design time. With SQL, **you can ask a question you didn't anticipate**, and the planner finds
a way. That flexibility is worth more than most teams realise until they've lost it.

### What you actually get

| Feature | Why it matters |
|---|---|
| **ACID transactions** | Multi-row, multi-table atomicity. **Removes whole categories of application code.** |
| **Joins** | Model data once, query it many ways. No denormalisation-and-sync work. |
| **Constraints** (FK, `UNIQUE`, `CHECK`, `EXCLUDE`) | ⭐ Invariants enforced by the storage layer, correct under any concurrency ([3b-05](3b-05-idempotency-at-the-db-layer.md)) |
| **A query planner** | Ad-hoc queries without redesigning your schema |
| **Secondary indexes that just work** | Compare with [3d-04](3d-04-secondary-indexes-when-sharded.md) |
| **Mature ecosystem** | Every ORM, every migration tool, every monitoring product, every engineer |
| **Operational maturity** | 30 years of hardening; the failure modes are documented and known |

### How far it actually scales — the numbers to quote

**People dramatically underestimate this**, and quoting concrete figures is what makes the argument land:

| Dimension | A single well-tuned Postgres |
|---|---|
| Reads (with cache + replicas) | **100 K+ QPS** |
| Writes | **10–50 K QPS** (higher with batching) |
| Dataset | **Multiple TB** comfortably; tens of TB with care |
| Rows in a table | **Billions** (with the right indexes and partitioning) |
| Connections | ~200–500 direct; **thousands via PgBouncer** ([3a-08](3a-08-connection-pooling.md)) |

Add read replicas and a cache and the read ceiling goes much higher.

> **The argument to make:** *"Most companies never outgrow a single Postgres instance. At 5,000 write QPS
> and 2 TB we're using maybe 10% of what one machine can do — and vertical scaling plus read replicas gets us
> to 10× from here. I'd rather spend that runway building the product than operating a distributed system."*
>
> Then name the **trigger**: *"I'd revisit when sustained write throughput approaches 20 K QPS or the working
> set stops fitting in RAM — whichever comes first."* Naming a trigger turns "no" into a plan
> ([Phase 0 note 09](../../phase-00-foundations/notes/09-scalability-and-elasticity.md)).

### Postgres vs MySQL

| | **PostgreSQL** | **MySQL / InnoDB** |
|---|---|---|
| Storage | Heap + separate indexes | **Clustered index** (PK *is* the table) |
| MVCC | Versions in the table → **vacuum, bloat** | Undo log → compact table, undo growth |
| `SERIALIZABLE` | **SSI (optimistic)** — aborts with `40001` | **2PL (pessimistic)** — blocks |
| Types & extensions | ⭐ **Rich**: JSONB, arrays, ranges, PostGIS, pgvector, full-text | Fewer |
| Replication | Physical + logical | Binlog (row/statement/mixed) |
| Reputation | Correctness, features | Simplicity, read speed, huge install base |

**Default to Postgres** unless there's a specific reason not to — the extension ecosystem alone (PostGIS,
pgvector, TimescaleDB, Citus) means one system can absorb several use cases you'd otherwise add a database
for.

### Postgres as several databases at once ⭐

**This is the strongest anti-polyglot argument**, and it's very effective in interviews:

| Instead of | Use |
|---|---|
| MongoDB | **`JSONB`** + GIN indexes — schemaless documents with transactions |
| Elasticsearch (modest scale) | **Full-text search** (`tsvector`) — good to millions of docs |
| Redis (modest scale) | `UNLOGGED` tables, `SKIP LOCKED` queues, `LISTEN/NOTIFY` |
| Pinecone / a vector DB | **`pgvector`** — HNSW indexes, and you can filter with SQL in the same query |
| InfluxDB | **TimescaleDB**, or native partitioning + BRIN |
| Neo4j (shallow graphs) | Recursive CTEs |
| A sharded cluster | **Citus** |
| PostGIS | Genuinely best-in-class geospatial |

> ⭐ **The pgvector point is a good current example:** for a RAG system, keeping embeddings in Postgres means
> you can filter by tenant, date and permissions **in the same query as the vector search** — where a
> separate vector DB forces you to either over-fetch and filter in the app, or duplicate metadata.

**Be honest about the limits:** Postgres full-text search is not Elasticsearch at 100 M documents; `JSONB` is
not MongoDB's aggregation pipeline; Redis is far faster for pure KV. **The argument is "one system until it
genuinely doesn't fit," not "Postgres is always best."**

### When relational is genuinely the wrong choice

Don't over-defend it:

| Signal | Better fit |
|---|---|
| **Write throughput beyond a single node**, append-only | Cassandra/Scylla ([3f-03](3f-03-wide-column.md)) |
| **Analytical scans over billions of rows** | ClickHouse/BigQuery ([3f-05](3f-05-object-storage-and-olap.md)) |
| **Sub-millisecond KV at very high QPS** | Redis/DynamoDB ([3f-02](3f-02-key-value-and-document.md)) |
| **Full-text search at scale**, relevance ranking, faceting | Elasticsearch ([3f-04](3f-04-search-timeseries-graph-vector.md)) |
| **Deep graph traversals** (friends-of-friends-of-friends) | Neo4j |
| **Blobs** | S3. **Never put files in a database.** |
| **Extreme time-series cardinality** | Prometheus, InfluxDB |
| Hard multi-region write locality | Distributed SQL, or multi-leader |

### The operational reality

**Choosing Postgres also means choosing to run it well:**

- Autovacuum tuning on large tables ([3b-03](3b-03-mvcc.md))
- Connection pooling ([3a-08](3a-08-connection-pooling.md))
- Zero-downtime migrations (Phase 7)
- Replication lag monitoring ([3c-02](3c-02-replication-lag.md))
- **Or: use RDS/Cloud SQL/Aurora and buy most of that.** For most teams this is the right call, and saying so
  is a mature build-vs-buy answer ([Phase 0 note 11](../../phase-00-foundations/notes/11-cost-dimensions.md)).

---

## In your own words

**Why is a declarative query language a bigger advantage than people credit?**

>

**Quote the scale numbers for a single Postgres. Write the argument you'd make, including the trigger to revisit.**

>

**Name four things you can do in Postgres instead of adding another database. Where does that argument stop?**

>

**Postgres vs MySQL — give three concrete differences that would change a design decision.**

>

**Give four signals that relational is genuinely wrong.**

>

---

## Links

- Storage internals → [3a-01](3a-01-btree.md) · MVCC → [3b-03](3b-03-mvcc.md)
- Don't shard until you must → [3d-01](3d-01-why-and-when-to-shard.md)
- Vertical scaling & triggers → [Phase 0 note 09](../../phase-00-foundations/notes/09-scalability-and-elasticity.md)
- **The other families** → [3f-02](3f-02-key-value-and-document.md) … [3f-05](3f-05-object-storage-and-olap.md)
- **The decision framework & polyglot cost** → [3f-06](3f-06-choosing-and-polyglot-cost.md)
