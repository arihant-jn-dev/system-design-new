# 3F·05 · Object Storage & the Analytics Stack

> **Why this exists:** two things every design touches. **Blobs never belong in your database**, and
> **analytics never belongs on your OLTP primary** — and the modern answer to both is the same shape: cheap
> object storage plus something that queries it.

---

## Reference

## Object storage — S3

**Model: a flat namespace of immutable-ish objects, addressed by key, over HTTP.** Not a filesystem — the
"folders" in the console are a UI fiction over key prefixes.

| Property | Detail |
|---|---|
| **Durability** | **11 nines** — erasure coding across ≥3 AZs, continuous scrubbing ([Phase 0 note 05](../../phase-00-foundations/notes/05-availability-vs-durability.md)) |
| Availability | ~99.9–99.99% (much lower than durability, and that gap is the point) |
| Object size | Up to 5 TB; **multipart upload above 100 MB** |
| Consistency | **Strong read-after-write since Dec 2020.** *(It was eventually consistent for 14 years — old advice about "S3 eventual consistency" is obsolete, and knowing the date is a nice detail.)* |
| Throughput | ~5,500 GET/s **per prefix** — spread keys across prefixes for very hot workloads |
| Cost | ~$0.023/GB-month; **egress is the expensive part** ([Phase 0 note 11](../../phase-00-foundations/notes/11-cost-dimensions.md)) |

### ⭐ Never store blobs in your database

| Why | |
|---|---|
| **Bloats the DB** | Backups, restores, replication all slow down proportionally |
| **Destroys the buffer cache** | A 5 MB row evicts thousands of useful pages |
| **Bloats the WAL** | Every blob write is replicated to every replica |
| **Costs 10–50× more** per GB than object storage |
| **No CDN** | You can't put CloudFront in front of a Postgres row |

**The correct pattern:**
```
metadata (id, filename, size, s3_key, owner) -> DATABASE
bytes                                        -> S3
delivery                                     -> CDN in front of S3
```

**Uploads: presigned URLs.** The client uploads **directly to S3** with a short-lived signed URL — the bytes
never touch your servers. This removes an entire scaling dimension from your app tier.

```
client -> your API: "I want to upload"  -> returns a presigned PUT URL
client -> S3 directly (bytes)
client -> your API: "done, here's the key" -> you verify and record it
```

⚠️ **Verify server-side** (size, content-type, virus scan) — a presigned URL is a capability you handed out,
and a client can lie about what it uploaded.

**Other things worth knowing:** storage classes and lifecycle (Standard → IA → Glacier — often a 10–20× cost
cut for cold data); **versioning** as protection against overwrite/delete (replication won't save you,
[Phase 0 note 05](../../phase-00-foundations/notes/05-availability-vs-durability.md)); content-addressed
storage (key = hash of content) giving **free deduplication**.

---

## The analytics stack

### OLTP vs OLAP — the recap

From [3a-06](3a-06-row-vs-column.md): row stores for many small reads/writes, column stores for aggregations
over few columns and many rows. **And the three reasons not to run analytics on your primary** — wrong
layout, buffer-cache eviction, and long transactions blocking vacuum ([3b-03](3b-03-mvcc.md)).

### The vocabulary

| Term | Means | Note |
|---|---|---|
| **Data warehouse** | Structured, curated, **schema-on-write** | Snowflake, BigQuery, Redshift |
| **Data lake** | Raw files in object storage, **schema-on-read** | S3 + Parquet. Cheap, and easily a swamp. |
| **Lakehouse** | Warehouse features (ACID, time travel, schema evolution) **over lake storage** | **Delta Lake, Iceberg, Hudi** — the current direction |
| **ETL** | Transform **before** loading | Older; transformation logic lives outside the warehouse |
| **ELT** | Load raw, **transform in the warehouse** | ⭐ **Modern default** — warehouse compute got cheap, and raw data is re-processable |
| **Medallion** | bronze (raw) → silver (cleaned) → gold (aggregated) | A common lakehouse layout |

> **Why ELT won:** with ETL, a bug in your transform means the raw data is gone and you can't reprocess. With
> ELT you keep the raw layer forever and re-derive. **That reprocessability is the real argument**, more than
> the cost.

### Parquet — worth knowing specifically

**A columnar file format**: column chunks grouped into **row groups**, each with per-column min/max
statistics.

**Why it matters:** a query engine reads the footer, checks the statistics, and **skips entire row groups
without decompressing them** (predicate pushdown), and reads only the columns referenced. **That's what makes
"query files on S3" viable** — you might scan 2% of a 1 TB dataset.

**Iceberg/Delta add** a metadata layer over Parquet files giving ACID commits, time travel, schema evolution
and partition evolution — the things a pile of files lacks.

### Real-time OLAP — ClickHouse / Druid / Pinot

Between "warehouse" (minutes-to-hours) and "OLTP" (milliseconds): **sub-second aggregations over
freshly-ingested data.**

| System | Strength |
|---|---|
| **ClickHouse** | Fastest general-purpose columnar; SQL; excellent compression. **The default pick now.** |
| **Druid** | Real-time ingest + time-partitioned; strong for event analytics |
| **Pinot** | Very low latency; user-facing analytics (LinkedIn) |

**The ad-tech shape** — directly relevant, and the answer to Phase 12 problem 17:
```
clicks/impressions -> Kafka -> stream aggregation -> ClickHouse/Druid  (dashboards, seconds)
                            \-> S3/Parquet -> warehouse               (exact billing, nightly)
```
**Fast approximate path plus slow exact path** — the streaming answer plus a batch reconciliation. That's
lambda architecture, and for billing data it's the honest design because you can't bill on approximations.

### How data gets from OLTP to OLAP

| Method | Note |
|---|---|
| ⭐ **CDC** (Debezium) | Near-real-time, no load on the primary ([3c-03](3c-03-replication-methods.md)) |
| Batch export | Nightly dump. Simple; stale. |
| **Dual write** | ⚠️ **Don't** — the dual-write problem ([3e-04](3e-04-outbox-and-cdc.md)) |
| Event stream | The app emits events as the source of truth for analytics |
| **Query a read replica** | Cheapest for modest scale. ⚠️ Long queries + `hot_standby_feedback` → primary bloat ([3c-02](3c-02-replication-lag.md)) |

---

## In your own words

**Give four reasons blobs don't belong in a database.**

>

**Describe the presigned-URL upload flow. What must you still verify server-side, and why?**

>

**S3 gives 11 nines of durability but ~99.9% availability. Why is that gap not a contradiction?**

>

**ETL vs ELT — what's the real argument for ELT, beyond cost?**

>

**What does Parquet's row-group structure let an engine skip? Why does that make S3 queryable?**

>

**Sketch the ad-tech pipeline. Why are there two paths?**

>

**Name the best way to move data OLTP → OLAP, and the one you must not use.**

>

---

## Links

- Row vs column storage → [3a-06](3a-06-row-vs-column.md) · MVCC/vacuum → [3b-03](3b-03-mvcc.md)
- Durability vs availability → [Phase 0 note 05](../../phase-00-foundations/notes/05-availability-vs-durability.md)
- Egress cost → [Phase 0 note 11](../../phase-00-foundations/notes/11-cost-dimensions.md)
- CDC → [3c-03](3c-03-replication-methods.md) · outbox → [3e-04](3e-04-outbox-and-cdc.md)
- CDN in front of blobs → [Phase 2 note 08](../../phase-02-stateless-scaling/notes/08-cdn.md)
- **Media pipelines, chunked upload, analytics aggregation** → **Phase 9**
- Lambda vs Kappa architecture → Phase 6
