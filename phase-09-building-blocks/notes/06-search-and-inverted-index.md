# 09·06 · Search & the Inverted Index

> **Why this exists:** "add search" appears in half of all design questions, and ⭐ **the answer that scores
> is knowing what's inside Elasticsearch**, not that you'd use it ([Phase 8 note 14](../../phase-08-architecture/notes/14-build-vs-buy.md)).

---

## Reference

### ⭐ The inverted index

A normal index maps **document → words**. An inverted index maps **word → documents**:

```
"database" -> [3, 17, 42, 108]      ⭐ these lists are POSTINGS LISTS
"scaling"  -> [17, 42, 91]

query "database scaling" = INTERSECT the two lists -> [17, 42]
```

⭐ **That's it.** Everything else — ranking, phrases, fuzziness — is refinement. ⭐ **Postings lists are kept
sorted so intersection is a linear merge**, and they're **delta-encoded + compressed** because a sorted list
of ints compresses beautifully.

### The analysis chain — where search is actually won or lost

```
"The Databases are Scaling!"
  → tokenize        [The, Databases, are, Scaling]
  → lowercase       [the, databases, are, scaling]
  → stopwords       [databases, scaling]
  → stem            [databas, scale]          ⭐ so "scaling" matches "scaled"
  → (synonyms, n-grams, ascii-folding…)
```

> ⭐ **THE RULE THAT CAUSES MOST REAL SEARCH BUGS: the query must go through the SAME analysis chain as the
> document.** Index stemmed, query unstemmed → nothing matches. ⚠️ **And changing the analyzer requires a
> full REINDEX**, because the stored terms were produced by the old chain.

⭐ **Stemming vs lemmatisation:** stemming is crude suffix-chopping (fast, "universe"→"univers"); lemmatisation
is dictionary-based (accurate, slower). ⚠️ **Both are language-specific — this is where multi-language search
gets expensive.**

### ⭐ Ranking: TF-IDF → BM25

| | |
|---|---|
| ⭐ **TF** (term frequency) | a doc mentioning "database" 10× is more about databases |
| ⭐ **IDF** (inverse document frequency) | a term in *every* document tells you nothing — **"the" has ~zero IDF** |
| **TF-IDF** | `TF × log(N / df)` |
| ⭐ **BM25** | ⭐ **the modern default, and what ES uses.** Two fixes: **TF SATURATION** (the 50th mention adds almost nothing — `k₁`) and **LENGTH NORMALISATION** (a hit in a 10-word title beats one in a 10,000-word doc — `b`) |

⭐ **Say "BM25, because TF-IDF's term frequency grows unboundedly and it ignores document length."** That one
sentence demonstrates you know why the newer thing exists.

**Beyond BM25:** field boosting (title ≫ body) · **recency/popularity as ranking signals** · learning-to-rank ·
⭐ **vector/semantic search (embeddings + ANN) — increasingly hybrid: BM25 for precision, vectors for
recall, fused with RRF.**

### Query types, and what each costs

| Query | Mechanism | Cost |
|---|---|---|
| **Term** | one postings list | ⭐ trivial |
| **Boolean AND/OR** | intersect/union | cheap |
| ⭐ **Phrase** *"system design"* | needs **term POSITIONS** stored | ⚠️ bigger index |
| **Prefix** `data*` | a term-dictionary range scan | ok |
| ⚠️ **Wildcard** `*base` | ⭐ **leading wildcards can't use the term dictionary** — near-full scan | ⚠️ avoid |
| **Fuzzy** (edit distance) | a Levenshtein automaton over terms | expensive |
| **Faceting/aggregation** | ⭐ **doc values** (a column store), not the inverted index | memory |

### ⭐ Shards, replicas, and near-real-time

| | |
|---|---|
| **Shard** | a self-contained Lucene index. ⭐ **Fixed at creation — you cannot reshard without reindexing** |
| **Replica** | a copy: read throughput + failure tolerance |
| ⭐ **Query fan-out** | every query hits **every shard**, then results are merged. ⭐ **So more shards = more parallelism but also more fan-out overhead and worse tail latency** ([Phase 0](../../phase-00-foundations/notes/)) |

⚠️ **Over-sharding is the classic mistake:** 50 shards for 2 GB of data means 50 tiny Lucene indexes, 50-way
fan-out per query, and a slower system. ⭐ **Rule of thumb: 10–50 GB per shard, and size for your data in a
year.**

⭐ **Near-real-time, and why search is never instant:**

```
index a doc → an in-memory buffer → [REFRESH, default 1s] → a searchable SEGMENT
                                   → [FLUSH] → committed to disk
              segments are IMMUTABLE; background MERGES combine them
              a delete is a TOMBSTONE, purged at merge time
```

⭐ **The refresh interval is the knob**: 1 s default; set it to 30 s (or `-1`) during a bulk load for a large
throughput win. ⚠️ **Every refresh creates a segment, and segments cost merge work** — refreshing too often is
a common self-inflicted performance problem.

⚠️ **Segments are immutable, so an "update" is a delete + reinsert**, and deleted docs occupy space until
merged. ⭐ **That's the same LSM design you saw in Phase 3** — Lucene *is* an LSM tree.

### ⭐ Deep paging — the trap

`from=10000&size=10` forces **every shard** to produce 10,010 results so the coordinator can merge and
discard 10,000. ⭐ **Cost grows with the offset, and it's multiplied by the shard count.** ES caps it at
10,000 by default *for this reason*.

⭐ **Fixes:** `search_after` (**keyset pagination**, [Phase 1](../../phase-01-networking/notes/)) for user-facing
paging · **scroll / PIT** for exports · ⭐ **and the honest one: nobody goes to page 500 — cap it and improve
ranking instead.**

### ⭐ Reindexing with aliases — the operational answer

**You will need to reindex**: mapping changes, analyzer changes, resharding.

```
clients ─▶ ALIAS "products" ─▶ products_v1
   1. create products_v2 with the new mapping
   2. reindex v1 → v2, and dual-write new changes
   3. verify counts + sample queries
   4. ⭐ ATOMICALLY repoint the alias to v2
   5. delete v1 — after a soak
```

> ⭐ **Always query through an alias, never a concrete index name.** It costs nothing on day one and it is
> the difference between a zero-downtime reindex and an outage. ⭐ **Same shape as Phase 7's expand–migrate–
> contract, and the same atomic-swap trick as the autocomplete trie rebuild** ([07](07-autocomplete.md)).

### Keeping the index in sync

⚠️ **The dual-write problem again**: writing to Postgres and Elasticsearch is not atomic.

⭐ **Use the outbox pattern or CDC (Debezium/logical replication)** ([Phase 6](../../phase-06-messaging/notes/))
— the database's own log drives the indexer, so nothing is lost. ⚠️ **And always keep a full-reindex job**,
because the index is a **derived, rebuildable projection** ([Phase 8 CQRS](../../phase-08-architecture/notes/05-cqrs.md))
and you *will* need to rebuild it.

⚠️ **The index is not the source of truth.** If you can't rebuild it from the primary store, you've built a
database with no backups.

---

## In your own words

**⭐ Draw an inverted index. Why are postings lists kept sorted?**

>

**⭐ Walk the analysis chain, and state the rule that causes most real search bugs.**

>

**⭐ What two problems does BM25 fix in TF-IDF?**

>

**Which query types are cheap and which are expensive? Why is a leading wildcard bad?**

>

**⭐ Why does over-sharding hurt? What's the fan-out consequence for tail latency?**

>

**⭐ Explain refresh vs flush. What's the knob, and what does it cost?**

>

**Why are updates and deletes awkward in Lucene, and what is Lucene really?**

>

**⭐ Why is deep paging expensive, and what are the three fixes?**

>

**⭐ Walk the alias-swap reindex. Why query through an alias from day one?**

>

**How do you keep the index in sync, and why must a full reindex always be possible?**

>

---

## Links

- LSM trees, immutable segments, tombstones → [Phase 3](../../phase-03-databases/notes/)
- Keyset pagination → [Phase 1](../../phase-01-networking/notes/)
- Fan-out and tail latency → [Phase 0](../../phase-00-foundations/notes/)
- CDC and the outbox → [Phase 6](../../phase-06-messaging/notes/)
- The index as a rebuildable projection → [Phase 8 note 05](../../phase-08-architecture/notes/05-cqrs.md)
- Prefix search, done differently → [07-autocomplete.md](07-autocomplete.md)
- Understand what you buy → [Phase 8 note 14](../../phase-08-architecture/notes/14-build-vs-buy.md)
