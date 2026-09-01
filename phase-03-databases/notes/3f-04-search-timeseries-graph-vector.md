# 3F·04 · Search, Time-Series, Graph & Vector

> **Why this exists:** four specialist families. For each, you need **the data model, when it wins, when it's
> wrong, and one representative system** — plus the single failure mode that defines each one.

---

## Reference

## 1 · Search — Elasticsearch / OpenSearch

**Model: an inverted index.** Instead of `document → words`, store `word → documents`.

```
"database"  -> [doc1, doc7, doc9]
"sharding"  -> [doc7, doc12]
```

**The pipeline:** text → tokenise → lowercase → remove stopwords → stem (`running` → `run`) → index. Query
text goes through **the same analyser**, which is why mismatched analysers are the classic "why does nothing
match?" bug.

**Relevance:** **TF-IDF** and **BM25** — a term is significant if it's frequent in *this* document and rare
across the corpus. BM25 is the modern default (it dampens term frequency and normalises document length).

| ✅ Wins | ❌ Wrong for |
|---|---|
| Full-text relevance ranking | ⭐ **A system of record** |
| Fuzzy, prefix, phrase, typo tolerance | Transactions |
| **Faceting/aggregations** ("142 results in Electronics") | Frequent updates (each is delete + reindex) |
| Log/observability search | Deep pagination (`from+size` capped at 10,000) |
| Geo + text combined | Small datasets (Postgres FTS is fine) |

> ⚠️ **The one rule: Elasticsearch is NOT your system of record.** It has no real transactions, has
> historically lost data under partition, and its schema/analysers change often enough that you'll need to
> **reindex from source**. Own the data in Postgres; **feed ES via CDC** ([3c-03](3c-03-replication-methods.md)).
> That answer — *"Postgres is the source of truth, ES is a derived index kept current by CDC, and I accept
> it's a second behind"* — is exactly what's being listened for.

**Operational specifics worth knowing:** shard count is **fixed at index creation** (logical partitions,
[3d-02](3d-02-partitioning-strategies.md)) — to change it you **reindex behind an alias**, which is also how
you deploy mapping changes with zero downtime. Near-real-time: documents are searchable after the
`refresh_interval` (default 1 s), not immediately.

---

## 2 · Time-series — Prometheus / InfluxDB / TimescaleDB

**Model: `(metric, tags/labels, timestamp, value)`** — append-only, time-ordered, almost never updated.

**Optimisations that follow from that shape:** delta-of-delta timestamp encoding, XOR float compression
(Gorilla), per-time-window partitioning, automatic **downsampling** and **retention**.

> ⭐ **The defining constraint is CARDINALITY, not volume.** Every unique label combination is a separate
> time series with its own index entry and in-memory state. Adding a `user_id` label with 1 M values creates
> **1 M series** — and if it's on a per-host metric, it multiplies.
>
> You quantified this in [Phase 0 drill 10](../../phase-00-foundations/drills/estimation-solutions.md):
> **7 TB → 14 PB from one label.** Never put unbounded-cardinality labels (`user_id`, `request_id`, raw URLs)
> on a metric — **that data belongs in logs or traces.**

| System | Note |
|---|---|
| **Prometheus** | Pull-based, for infra/app metrics. Local storage; Thanos/Mimir/Cortex for long-term. |
| **InfluxDB** | Push-based, IoT/events |
| **TimescaleDB** | **Postgres extension** — hypertables + compression. **Keeps SQL and joins.** Often the right answer. |
| ClickHouse | Not strictly TSDB, but excellent for high-volume event/time data |

---

## 3 · Graph — Neo4j

**Model: nodes, relationships (first-class, with properties), and traversal as the primitive.**

```cypher
MATCH (a:Person {name:'Ari'})-[:KNOWS*2..3]->(b:Person)
RETURN DISTINCT b
```

**Why it beats SQL here: index-free adjacency.** A node stores direct pointers to its relationships, so
traversing one hop is a pointer dereference — **O(1) regardless of graph size**. In SQL each hop is another
self-join, and cost grows with table size and hop count.

| ✅ Wins | ❌ Wrong for |
|---|---|
| **Variable-depth traversal** ("friends of friends of friends") | Aggregations over all nodes |
| Shortest path, recommendations, fraud rings | Bulk analytics |
| Relationship-heavy domains where the **relationship is the query** | High write throughput |
| Knowledge graphs, permission hierarchies | Simple 1–2 hop joins — **SQL is fine** |

> **The honest take: most "graph problems" are 1–2 hops and a relational database handles them fine.**
> Recursive CTEs cover shallow hierarchies. **Reach for a graph database when traversal depth is variable or
> unbounded** — that's the actual signal. Also worth knowing: Facebook's social graph runs on **TAO over
> MySQL**, not a graph database.

---

## 4 · Vector — pgvector / Pinecone / Qdrant

**Model: high-dimensional embeddings (768–3072 floats) with *similarity* search rather than exact match.**

```sql
SELECT id, content FROM docs ORDER BY embedding <=> $1 LIMIT 10;   -- cosine distance
```

**Exact nearest-neighbour is O(n) per query**, so everything uses **ANN** (approximate nearest neighbour) —
trading a little recall for enormous speed.

| Index | Note |
|---|---|
| **HNSW** | Navigable small-world graph. **Best recall/latency; the default choice.** More memory, slower build. |
| **IVFFlat** | Cluster into lists, search the nearest few. Cheaper to build, needs training data, tune `probes`. |
| Product quantisation | Compresses vectors; big memory savings, some recall loss |

**The knobs are recall vs latency vs memory** — `ef_search` (HNSW) or `probes` (IVFFlat). **There is no exact
answer, by design**, and being explicit about that is the right framing.

| ✅ Wins | ❌ Wrong for |
|---|---|
| Semantic search, **RAG** | Exact matching (use a normal index) |
| Recommendations, dedupe, image similarity | When keyword search is genuinely better |
| Multi-modal retrieval | Small corpora (brute force is fine under ~10 K) |

> ⭐ **The practical point: use `pgvector` unless you have a reason not to.** Keeping embeddings beside your
> relational data means you can **filter by tenant, permission and date in the same query as the vector
> search**. A separate vector DB forces you to over-fetch and filter in the application, or duplicate all the
> metadata. **Metadata filtering is where standalone vector databases hurt.**
>
> Also: **hybrid search** (BM25 keyword + vector, fused with reciprocal rank fusion) usually beats either
> alone. Mentioning that is a strong signal in any RAG design.

---

## The one-line summary table

| Family | Model | Representative | Defining failure mode |
|---|---|---|---|
| **Search** | Inverted index | Elasticsearch | **Treating it as a system of record** |
| **Time-series** | (metric, labels, ts, value) | Prometheus/Timescale | **Cardinality explosion** |
| **Graph** | Nodes + edges, index-free adjacency | Neo4j | **Using it for a 1-hop join** |
| **Vector** | Embeddings + ANN | pgvector | **Losing metadata filtering** |

---

## In your own words

**Explain an inverted index. Why do query and index need the same analyser?**

>

**Why is Elasticsearch not a system of record? What's the correct architecture?**

>

**What's the defining constraint of a time-series database? Quantify a cardinality explosion.**

>

**What is index-free adjacency, and when does a graph DB genuinely beat SQL?**

>

**Why is all vector search approximate? Name the knobs.**

>

**Argue for pgvector over a dedicated vector database. Where does the argument stop?**

>

---

## Links

- CDC as the feed into search → [3c-03](3c-03-replication-methods.md)
- Cardinality drill → [Phase 0 drill 10](../../phase-00-foundations/drills/estimation-drills.md)
- Postgres can do several of these → [3f-01](3f-01-relational-the-default.md)
- **Search internals, geospatial, autocomplete** → **Phase 9**
- Metrics/observability systems → Phase 7
