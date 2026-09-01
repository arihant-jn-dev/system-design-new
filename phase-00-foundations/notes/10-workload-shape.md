# 10 · Workload Shape — Read-Heavy vs Write-Heavy

> **Why this exists:** the roadmap calls this "the single classification that drives half your design
> decisions," and that's not an exaggeration. Establish it in the first 5 minutes of every interview, then
> justify every subsequent choice by referring back to it.

---

## Reference

### The classification

| Shape | Ratio (R:W) | Examples |
|---|---|---|
| **Read-heavy** | 10:1 → 1000:1 | Social feeds, news, e-commerce catalog, search, CDN content, **ad serving** |
| **Write-heavy** | 1:1 → 1:100 | Metrics/telemetry, logs, IoT sensors, **ad click/impression tracking**, game state, audit trails |
| **Mixed** | ~1:1 | Chat, collaborative editing, order processing |
| **Append-heavy** | Writes are only appends, never updates | Event logs, ledgers, time-series — **a special case worth naming separately, because it's much easier than general write-heavy** |

Ad tech is interesting precisely because it's **both**: serving is read-heavy with a brutal latency budget,
while impression/click tracking is write-heavy at enormous volume. Different halves of the same product get
opposite designs. That's a good thing to point out if the question is ad-shaped.

### Why it drives everything

| Decision | If **read-heavy** | If **write-heavy** |
|---|---|---|
| **Caching** | **The primary tool.** Huge wins. | Barely helps — you can't cache a write |
| **Storage engine** | **B+Tree** (read-optimised) | **LSM tree** (write-optimised) — Cassandra, RocksDB |
| **Replication** | **Read replicas** scale you cheaply | Replicas don't help; **writes all go to the leader**. Need sharding or multi-leader. |
| **Denormalisation** | **Yes** — precompute, duplicate, store the answer | **No** — every duplicate multiplies write cost |
| **Indexes** | Add them freely | **Each index is a write-amplifier.** Add reluctantly. |
| **CDN / edge** | Enormous win | Irrelevant |
| **Materialised views** | Yes — precompute the read | Expensive to maintain |
| **Consistency** | Eventual is usually fine | Often needs ordering/dedupe guarantees |
| **First bottleneck** | Read QPS, egress bandwidth | **Disk write throughput, WAL, compaction** |
| **Scaling move** | Cache → read replicas → CDN | Shard/partition → batch → async ingest |

**The one-line summary: read-heavy is a caching problem, write-heavy is a partitioning problem.**

### Fan-out — the thing that flips the answer

The ratio you measure at the *API* is not the ratio your *storage* sees.

**Twitter, the canonical example.** A user with 1 M followers posts once:

| Strategy | Write cost | Read cost | When it wins |
|---|---|---|---|
| **Fan-out on write** (push) | **1 M writes** — insert into 1 M timelines | 1 read — timeline is precomputed | Read-heavy, low follower counts. Reads are instant. |
| **Fan-out on read** (pull) | 1 write | Read N followees' posts and merge — expensive | Write-heavy, celebrity accounts |
| **Hybrid** | 1 write for celebrities, fan-out for normal users | Merge precomputed timeline + celebrity posts at read time | **The real answer.** |

**The insight:** a *read-heavy API* became a *write-heavy storage problem* purely because of fan-out. So the
question isn't "is the product read-heavy" — it's **"what does one user action cost at the storage layer?"**

(Full treatment in Phase 6 and Phase 9. Knowing the shape of the answer now makes the news-feed question
almost trivial when you get there.)

### Other axes that matter alongside R:W

Establish these too — each one changes the design:

| Axis | Question | Why it matters |
|---|---|---|
| **Access distribution** | Uniform or skewed? | **Zipfian is the norm** — 20% of keys get 80% of traffic. Great for caching (small cache, high hit rate), terrible for sharding (hot shards). |
| **Data temperature** | Is old data ever read? | Recency-biased access → tiered storage, TTLs, archive to cold storage. Huge cost lever. |
| **Query pattern** | Point lookups, range scans, or aggregations? | Point → KV. Range → ordered/clustered index. Aggregation → columnar/OLAP. |
| **Mutability** | Update-in-place or append-only? | **Append-only is dramatically easier** — no locks, no conflicts, cache-friendly, replayable |
| **Burstiness** | Smooth or spiky? | Spiky → queues to absorb, headroom, load shedding. Peak/average ratio is the number. |
| **Item size** | KB or MB? | Small → DB. Large → object storage + CDN, with only metadata in the DB. |
| **Consistency need** | Per data type (note 07) | Rarely uniform across one product |

### Reading the workload from a problem statement

Practise this — it should take 30 seconds.

| The problem says | The shape is | So you immediately reach for |
|---|---|---|
| "URL shortener, 100:1 read:write" | Read-heavy, point lookups, immutable | KV store + aggressive cache + CDN |
| "Ingest 1 M metrics/sec" | Write-heavy, append-only, time-ordered | LSM/time-series DB, batching, downsampling |
| "Ad click tracking" | Write-heavy, append-only, bursty | Kafka → stream aggregation → OLAP store |
| "Ad serving, <100 ms" | Read-heavy, latency-critical, skewed | In-memory, precomputed, edge-local |
| "News feed" | Read-heavy API, **write-heavy storage via fan-out** | Hybrid fan-out + cache |
| "Chat" | Mixed, ordered, real-time | WebSockets + per-conversation partitioning |
| "Booking / inventory" | Low volume, **consistency-critical** | Relational + transactions. **Do not over-engineer this one.** |

Note the last row: a low-QPS, high-consistency problem is a trap. Candidates reach for distributed systems
machinery when the correct answer is "one Postgres and a `SELECT FOR UPDATE`."

---

## In your own words

**Why is read-heavy a caching problem and write-heavy a partitioning problem? Explain the mechanism.**

>

**Why doesn't adding read replicas help a write-heavy system?**

>

**Explain how fan-out turns a read-heavy product into a write-heavy storage problem.**

>

**What is a Zipfian access distribution, and why is it good news for caches but bad news for shards?**

>

**Take a system you've worked on. Classify it on all 7 axes above, then name the design decision each one forced.**

>

---

## Links

- B+Tree vs LSM — the storage-engine consequence of this note → Phase 3A
- Sharding and hot keys — the write-heavy consequence → Phase 3D
- Caching — the read-heavy consequence → Phase 5
- Fan-out on write vs read, in full → Phase 6 & Phase 9
