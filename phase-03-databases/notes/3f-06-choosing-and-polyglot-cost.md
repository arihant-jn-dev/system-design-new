# 3F·06 · Choosing a Datastore & the Cost of Polyglot Persistence

> **Why this exists:** this is the synthesis note — the **gate question** is *"given a workload, choose a
> datastore and a shard key, then defend both against a hostile follow-up."* It's also where the roadmap's
> warning about **"polyglot persistence and its real operational cost"** lands.

---

## Reference

### The decision method — ask these, in this order

**Never start from the technology.** Start from the workload
([Phase 0 note 10](../../phase-00-foundations/notes/10-workload-shape.md)):

| # | Question | What it rules in/out |
|---|---|---|
| 1 | **Read-heavy or write-heavy?** | Caching problem vs partitioning problem |
| 2 | **What are the top 5 queries by volume?** | ⭐ **The single most important input.** Determines the model *and* the shard key. |
| 3 | **Point lookups, range scans, or aggregations?** | KV / ordered index / columnar |
| 4 | **Update-in-place or append-only?** | B-tree vs LSM ([3a-03](3a-03-btree-vs-lsm.md)) |
| 5 | **Does anything need a multi-row invariant?** | Transactions → relational |
| 6 | **How much data, growing how fast?** | Single node vs distributed |
| 7 | **What's the consistency requirement — per data type?** | Rarely uniform ([Phase 0 note 07](../../phase-00-foundations/notes/07-consistency-informal.md)) |
| 8 | **Latency budget?** | In-memory vs disk vs cross-region |
| 9 | **Who operates it at 3 a.m.?** | ⭐ The question nobody asks |

### The cheat sheet

| Workload signal | Reach for | Because |
|---|---|---|
| **Default / unsure** | **Postgres** | Transactions, joins, ad-hoc queries, and it scales further than you think ([3f-01](3f-01-relational-the-default.md)) |
| Very high write throughput, append-only, known queries | **Cassandra / Scylla / DynamoDB** | LSM + linear scale ([3f-03](3f-03-wide-column.md)) |
| Sub-ms point lookups, ephemeral | **Redis** | In-memory ([3f-02](3f-02-key-value-and-document.md)) |
| Managed KV at any scale, no ops | **DynamoDB** | Query-first modelling required |
| Full-text search, relevance, facets | **Elasticsearch** (fed by CDC) | Inverted index. **Never the source of truth.** |
| Aggregations over billions of rows | **ClickHouse / BigQuery** | Columnar ([3f-05](3f-05-object-storage-and-olap.md)) |
| Metrics | **Prometheus / TimescaleDB** | Watch cardinality |
| Variable-depth traversal | **Neo4j** | Index-free adjacency. 1–2 hops? Use SQL. |
| Semantic search / RAG | **pgvector** | Keeps metadata filtering |
| Blobs | **S3 + CDN** | Never the database |
| Cross-shard ACID at scale | **CockroachDB / Spanner** | Before hand-rolling sagas ([3e-05](3e-05-spanner-and-percolator.md)) |

### Normalisation vs denormalisation

| | Normalise | Denormalise |
|---|---|---|
| Optimises | **Writes** and correctness — one place to update | **Reads** — the answer is pre-assembled |
| Cost | Joins at read time | Duplication; **update anomalies**; storage |
| Default in | Relational | Wide-column, document, caches, feeds |

> **Denormalisation is a deliberate read optimisation, not sloppiness.** The honest framing: *"I'd normalise
> by default and denormalise where a specific read path demands it, accepting that I now own keeping the
> copies in sync — usually with an async job or CDC."*
>
> **Whoever denormalises owns the consistency problem.** Say that part out loud; it's what separates a
> considered choice from a shortcut.

**Materialised views / precomputed tables** are denormalisation with a maintenance story attached — often the
better version.

### ⭐ Polyglot persistence and its real cost

**The trap:** *"Postgres for orders, Cassandra for events, Elasticsearch for search, Redis for cache, Kafka
for streaming, ClickHouse for analytics, Neo4j for the social graph."* Each choice is individually
defensible. Together they can exceed a whole team's capacity.

**The cost of each additional datastore — the list to recite:**

| Cost | Detail |
|---|---|
| **Expertise** | Someone must know its failure modes, not just its API |
| **On-call** | New alerts, new runbooks, new 3 a.m. surprises |
| **Backups + tested restores** | Different for every system |
| **Upgrades, patching, CVEs** | Ongoing forever |
| **Monitoring** | New dashboards, new SLIs |
| ⭐ **Consistency between them** | **The biggest one** — every pair is a dual-write problem ([3e-04](3e-04-outbox-and-cdc.md)) |
| Cost & idle capacity | Each needs its own headroom |
| **Hiring & onboarding** | New engineers must learn all of it |

> **An engineer costs more than most infrastructure bills**
> ([Phase 0 note 11](../../phase-00-foundations/notes/11-cost-dimensions.md)). Adding a datastore that
> consumes 20% of one engineer's attention costs more than a very large managed database.

**The senior position:**

> *"I'd start with Postgres and add a second datastore only when there's a specific requirement it genuinely
> can't meet — and I'd expect that to be search or analytics first. Every additional store is another thing
> to back up, upgrade, monitor and be paged for, and crucially every pair of stores is a consistency problem
> we now own. For a team our size I'd rather run one system well than five badly."*

**And the escape hatch when you do add one:** prefer **managed** services (RDS, OpenSearch, MSK, Elasticache)
so the operational cost is money rather than headcount. **~2–3× the raw infra cost, and usually worth it.**

### Answering the gate question

*"Given a workload, choose a datastore and a shard key, then defend both."*

**The shape:**

1. **Restate the workload properties** — R:W ratio, QPS, data size, access pattern, consistency needs
2. **Do the capacity math** ([Phase 0 note 01](../../phase-00-foundations/notes/01-napkin-math.md)) — and let
   it tell you whether this is even a big problem
3. **Pick the store, justified by the properties** — never "I'd use X" without "because the workload is Y"
4. **Pick the shard key** using the three properties, **led by query alignment** ([3d-03](3d-03-shard-key-selection.md))
5. ⭐ **Volunteer the weaknesses** — "this makes query Z a scatter-gather; I'd handle that with CDC into
   Elasticsearch"
6. ⭐ **Name what would change your mind** — the trigger

**The hostile follow-ups to have ready:**

| Challenge | Answer |
|---|---|
| *"Why not NoSQL / why not Postgres?"* | Compare on the workload properties, not on preference |
| *"What about queries missing the shard key?"* | Scatter-gather / secondary index / CDC to a search index |
| *"What if this tenant is 40% of traffic?"* | Directory routing, dedicated shard, special-case the celebrity |
| *"How do you do cross-shard transactions?"* | Design so you don't; else saga ([3e-03](3e-03-sagas.md)) |
| *"What happens at 10×?"* | Which component breaks **first**, and what you'd do |
| *"Isn't this over-engineered?"* | ⭐ **Agree if it is.** "At this scale one Postgres does it; here's the trigger to revisit." |

**That last row matters.** Being willing to say *"you're right, that's over-engineered for 4,500 QPS"* is a
stronger signal than defending a complicated design.

---

## In your own words

**Write your decision method as an ordered list of questions. Which is most important?**

>

**When is denormalisation right, and what do you take ownership of by doing it?**

>

**List the costs of adding one more datastore. Which is the biggest and why?**

>

**Write your polyglot-persistence position as you'd say it in an interview.**

>

**Take a system you know. Choose its datastore and shard key from scratch, then answer all six hostile follow-ups.**

>

---

## Links

- The families → [3f-01](3f-01-relational-the-default.md) … [3f-05](3f-05-object-storage-and-olap.md)
- Workload shape → [Phase 0 note 10](../../phase-00-foundations/notes/10-workload-shape.md)
- Capacity math → [Phase 0 note 01](../../phase-00-foundations/notes/01-napkin-math.md)
- Shard key → [3d-03](3d-03-shard-key-selection.md) · Don't shard yet → [3d-01](3d-01-why-and-when-to-shard.md)
- Keeping stores in sync → [3e-04](3e-04-outbox-and-cdc.md)
- Build vs buy, TCO → [Phase 0 note 11](../../phase-00-foundations/notes/11-cost-dimensions.md)
- **The interview framework this feeds** → Phase 11
