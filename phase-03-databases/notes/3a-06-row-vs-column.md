# 3A·06 · Row vs Column Storage

> **Why this exists:** the answer to *"why don't you run analytics on your production database?"* and the
> reason ClickHouse, Snowflake, BigQuery, Druid and Parquet all exist. It's a small topic with a very high
> ratio of insight to content.

---

## Reference

### The difference is literally the layout on disk

Table:
```
id | user_id | country | amount | created_at
1  | 42      | IN      | 500    | 2024-01-01
2  | 43      | US      | 300    | 2024-01-02
3  | 44      | IN      | 700    | 2024-01-03
```

**Row-oriented** (Postgres, MySQL, most OLTP) — all of a row's fields are stored contiguously:
```
[1|42|IN|500|2024-01-01] [2|43|US|300|2024-01-02] [3|44|IN|700|2024-01-03]
```

**Column-oriented** (ClickHouse, Parquet, Redshift) — each column stored contiguously:
```
id:         [1, 2, 3]
user_id:    [42, 43, 44]
country:    [IN, US, IN]
amount:     [500, 300, 700]
created_at: [2024-01-01, 2024-01-02, 2024-01-03]
```

**That's the whole idea.** Everything else is a consequence.

### Why it matters

**The query:** `SELECT country, sum(amount) FROM sales` over 1 billion rows, 50 columns.

| | Row store | Column store |
|---|---|---|
| Must read | **Every column of every row** — you need 2 columns but the disk gives you all 50 | **Only `country` and `amount`** |
| Data read | ~100% of the table | **~4%** (2 of 50 columns) |
| I/O | 500 GB | **20 GB** |
| Compression | Poor — adjacent values are different types | **Excellent — adjacent values are the same type and often repeat** |
| After compression | ~350 GB | **~2 GB** |

> **A 25–100× I/O reduction, from the layout alone.** That's the number that justifies a whole separate
> analytics stack.

### Compression — the multiplier

Columns compress far better because **adjacent values are the same type and highly repetitive**:

| Technique | How | Great for |
|---|---|---|
| **Run-length encoding (RLE)** | `IN,IN,IN,IN` → `(IN, 4)` | Sorted, low-cardinality columns |
| **Dictionary encoding** | Map values to small ints: `IN`→0, `US`→1 | Strings with few distinct values |
| **Delta encoding** | Store differences: `1000, 1001, 1003` → `1000, +1, +2` | Timestamps, sequential IDs |
| **Bit-packing** | Use only the bits you need | Small integer ranges |
| **Frame of reference** | Store min + offsets | Clustered numerics |

**Typical column-store compression: 5–20×.** Row stores manage ~2–3×.

**Sort order multiplies this.** Sorting by a low-cardinality column first makes RLE enormously effective —
which is why ClickHouse's `ORDER BY` in the table definition is a *storage* decision, not just a query one.

### Vectorised execution

The second win, and it's not just I/O: a column is a **contiguous array of one type**, so the CPU can process
it with **SIMD** instructions — operating on 8–16 values per instruction — with far better cache locality
and no per-row branching.

**Combined effect: column stores are often 10–100× faster on analytical queries.** Layout, compression *and*
CPU efficiency all compound.

### The comparison

| | **Row (OLTP)** | **Column (OLAP)** |
|---|---|---|
| Optimised for | `SELECT *` of **one row** | Aggregations over **many rows, few columns** |
| Point read by PK | ✅ **Fast** | ❌ Slow — must gather from N column files |
| `INSERT` one row | ✅ Fast — one place | ❌ Slow — touches every column file |
| `UPDATE` one field | ✅ Fast | ❌ **Very expensive.** Most column stores are append-only/immutable. |
| `DELETE` | ✅ | ❌ Usually a marker + background rewrite |
| Full-table aggregation | ❌ Reads everything | ✅ **Reads only needed columns** |
| Compression | ~2–3× | **5–20×** |
| Transactions | ✅ Mature | ➖ Limited, often batch-level |
| Examples | Postgres, MySQL, Oracle | ClickHouse, Druid, Pinot, Redshift, BigQuery, Snowflake, Parquet |

### Why you don't run analytics on your production database

Three independent reasons — a complete answer names all three:

1. **Wrong storage layout.** A row store reads all 50 columns to aggregate 2. It's doing 25× the I/O it
   needs to.
2. **Resource contention.** An analytical query scanning 100 M rows **evicts your entire buffer cache**,
   saturates disk I/O, and holds a long transaction. Your p99 for *user-facing* queries collapses. The
   analytics query doesn't just run slowly — **it makes everything else slow.**
3. **Long-running read transactions block MVCC cleanup.** In Postgres, a 20-minute analytical query prevents
   `VACUUM` from removing dead tuples *anywhere* in the database → bloat and degradation that outlast the
   query ([3b-03](3b-03-mvcc.md)). **This is the subtle one and it's the best answer of the three.**

> **The interview line:** *"I'd keep analytics off the OLTP database — not just because a row store is the
> wrong layout for aggregations, but because a long analytical read holds back MVCC cleanup and evicts the
> buffer cache, so it degrades the transactional workload for longer than it runs. I'd ship data to a
> columnar store via CDC or a nightly ETL, and let the read replica take ad-hoc queries at worst."*

### The vocabulary

| Term | Means |
|---|---|
| **OLTP** | Online Transaction Processing — many small reads/writes, low latency, row store |
| **OLAP** | Online Analytical Processing — few large scans, high throughput, column store |
| **HTAP** | Hybrid — both in one system (TiDB, SingleStore). Attractive, but rarely as good as either specialist. |
| **Data warehouse** | Structured, schema-on-**write**, curated (Snowflake, Redshift, BigQuery) |
| **Data lake** | Raw files, schema-on-**read**, cheap (S3 + Parquet) |
| **Lakehouse** | Warehouse features over lake storage (Delta Lake, Iceberg, Hudi) — the current direction |
| **ETL** | Extract → Transform → **Load**. Transform before loading. Older model. |
| **ELT** | Extract → Load → **Transform**. Load raw, transform in the warehouse. **Modern default**, because warehouse compute got cheap. |
| **Parquet / ORC** | Columnar **file** formats. Parquet is the de facto standard for lakes. |

**Parquet is worth knowing specifically:** columnar, compressed, with **row groups** and per-column
statistics (min/max), so a query engine can **skip entire row groups** without decompressing them —
predicate pushdown. It's the reason "query files on S3" is viable at all.

---

## In your own words

**Explain the layout difference, then derive why column stores win on aggregations.**

>

**Why do columns compress 5–20× when rows manage 2–3×? Name three encodings.**

>

**Why are column stores bad at updating a single field?**

>

**Give all three reasons not to run analytics on your OLTP database. Which is the subtlest?**

>

**ETL vs ELT — what changed to make ELT the default?**

>

**What does Parquet's row-group structure let a query engine skip, and why does that matter for S3?**

>

---

## Links

- Row storage internals → [3a-01-btree.md](3a-01-btree.md)
- Long transactions and vacuum → [3b-03-mvcc.md](3b-03-mvcc.md)
- Workload shape → [Phase 0 note 10](../../phase-00-foundations/notes/10-workload-shape.md)
- Choosing a datastore, OLAP families → Phase 3F
- CDC as the pipe from OLTP to OLAP → Phase 6
- Real-time analytics (Druid/ClickHouse/Pinot) → Phase 9
- **DDIA ch. 3**, "Column-Oriented Storage"
