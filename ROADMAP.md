# System Design Roadmap — Senior Level (6+ YOE)

**Target:** Clear SDE-2 / Senior / Staff-track system design rounds at product companies.
**Baseline assumption:** You can code, you've shipped services, you've used a DB and a cache. You do *not* yet have a mental model of distributed systems.
**Budget:** 14–16 weeks at ~8–10 hrs/week. Compressible to 8 weeks at ~20 hrs/week.

---

## How to use this

Three non-negotiable rules, because this is where most people waste months:

1. **Never learn a topic without building or breaking something.** Every phase has a **Lab**. A 45-min Docker experiment beats 5 hours of video. The lab is what makes you able to answer *"and what happens when that fails?"*
2. **Never learn a topic without a "why does this exist" answer.** Every technology is a response to a specific failure. Kafka exists because queues lose history. LSM trees exist because B-trees write-amplify. If you can't state the problem, you've memorized a name, not a tool.
3. **Start mock interviews at Week 6, not Week 16.** You will be bad. That's the point — bad early is cheap. Interviews are a *communication* skill layered on knowledge; practising them only at the end means you learn the communication skill under real stakes.

**Progress marker:** each phase has a **Gate** — questions you must answer out loud, from memory, without notes. If you can't, don't advance. Skipping a gate is how people end up "knowing" 40 topics and failing every round.

**One habit to start today:** keep a `notes/` folder, one file per topic, written in your own words with the tradeoff table. Writing forces the gaps into the open. Re-read the whole folder every 2 weeks — 20 minutes, and it's the highest-leverage retention you'll get.

---

# Phase 0 — Foundations & Vocabulary
**Week 1 · ~8 hrs**

Everything later is expressed in this vocabulary. Getting it precise now removes a permanent source of vagueness in your answers.

### Topics
- **Napkin math / back-of-the-envelope estimation**
  - Powers of two: KB → MB → GB → TB → PB. Know 2^10 ≈ 10^3.
  - Latency numbers every engineer should know (memorize the *ratios*, not the digits):
    - L1 cache ~1 ns · main memory ~100 ns · SSD random read ~100 µs · disk seek ~10 ms
    - Same-DC round trip ~0.5 ms · cross-continent RTT ~150 ms
    - Read 1 MB sequentially: memory ~10 µs, SSD ~100 µs, HDD ~10 ms
  - Rules of thumb: 1 M requests/day ≈ 12 QPS. Peak ≈ 2–3× average. 86,400 sec/day (memorize as ~10^5).
  - Practice: "100 M DAU, 5 posts/day, 1 KB each → QPS? storage/year? bandwidth?" Do 10 of these until it's reflex.
- **The non-functional vocabulary — define each precisely**
  - Latency vs throughput (and why optimizing one can destroy the other)
  - **Percentiles**: p50, p95, p99, p999. *Why averages are useless.* Tail latency amplification — why a request fanning out to 100 services has a p99 dominated by the slowest.
  - Availability: what "3 nines / 4 nines / 5 nines" costs in minutes/year. How availability *multiplies* across dependencies (10 services at 99.9% each = 99% overall).
  - Durability vs availability (different things, often confused)
  - Reliability, fault tolerance, resilience
  - Consistency (informal for now — formalized in Phase 4)
  - SLI / SLO / SLA, error budgets
  - Scalability: vertical vs horizontal; **elasticity**
  - Read-heavy vs write-heavy vs mixed — this single classification drives half your design decisions
- **Cost dimensions** — compute, storage, network egress (the sneaky one), ops burden. Cost is a real interview axis at senior level.

### Lab
Pick any API you've built. Measure its actual p50/p99 under load with `k6` or `wrk`. Then add a 200 ms artificial delay to one dependency and watch what happens to p99. Write down the number.

### Gate
- Estimate storage + QPS + bandwidth for a Twitter-scale system in under 3 minutes on paper.
- Explain why a service with 99.99% availability can still be a terrible experience.
- Explain tail latency amplification to a junior dev.

---

# Phase 1 — Networking & Communication
**Week 2 · ~10 hrs**

Most candidates are hand-wavy here and it shows immediately. This phase is cheap and high-return.

### Topics
- **The stack, briefly:** L4 vs L7 is the only OSI distinction you'll actually use.
- **TCP vs UDP** — handshake, ordering, congestion control, head-of-line blocking. When UDP is the right answer (video, games, DNS, QUIC).
- **DNS** — resolution path, records (A/AAAA/CNAME/TXT/SRV), TTL and why DNS is a *bad* failover mechanism, GeoDNS, anycast.
- **TLS** — handshake cost, session resumption, where termination happens, mTLS, cert rotation.
- **HTTP evolution** — and specifically the problem each version solved:
  - HTTP/1.1: keep-alive, pipelining's failure, head-of-line blocking
  - HTTP/2: multiplexing, header compression, server push (and why it died)
  - HTTP/3 / QUIC: UDP-based, why it fixes transport-level HOL blocking
- **API styles — the tradeoff table matters more than the details**
  - REST: resource modeling, verbs, status codes, HATEOAS (know it, skip it)
  - RPC / gRPC: protobuf, streaming modes, when binary + schema wins (internal service-to-service)
  - GraphQL: over/under-fetching solved, N+1 introduced, query cost limiting, why it's hard to cache
  - When each is correct — be able to argue all three
- **Real-time / push patterns** — the classic interview ladder:
  - Short polling → long polling → SSE → WebSockets → WebRTC
  - Cost, scale, and failure characteristics of each. *Why you'd choose SSE over WebSockets.*
- **API design mechanics**
  - Pagination: offset vs cursor/keyset (know exactly why offset breaks at scale)
  - Versioning strategies; backward/forward compatibility
  - Idempotency keys — the single most reused concept in payment/order questions
  - Rate-limit response headers, `429`, `Retry-After`
  - Bulk endpoints, partial failure semantics, async job + polling pattern (`202 Accepted` + status URL)
- **Timeouts, retries, backoff + jitter** — introduced here, deepened in Phase 7. Understand *why jitter is mandatory* (retry storms).

### Lab
Implement the same tiny endpoint three ways: REST/JSON, gRPC, and SSE. Compare payload size and latency. Then implement cursor pagination over a 1 M-row table and compare `LIMIT 500000 OFFSET` against keyset — watch it fall off a cliff.

### Gate
- Walk through everything that happens between typing a URL and the first byte rendering.
- Argue for and against GraphQL for a mobile-first product.
- Explain why you'd pick long polling over WebSockets in a specific scenario.

---

# Phase 2 — Scaling the Stateless Tier
**Week 3 · ~8 hrs**

The easy half of scaling. Get it out of the way so you can spend your real energy on state.

### Topics
- Vertical vs horizontal scaling; where vertical is actually the right call (and it often is)
- **Stateless vs stateful services** — why statelessness is the enabler for everything else
- **Session management**: sticky sessions (and their cost), client-side tokens, centralized session store. Tradeoffs.
- **Load balancing**
  - L4 vs L7 — capabilities and cost
  - Algorithms: round-robin, weighted, least-connections, least-response-time, **consistent hashing**, power-of-two-choices (know this one — it's the elegant answer)
  - Health checks: active vs passive, shallow vs deep, why deep health checks cause correlated failure
  - Connection draining, slow start, outlier ejection
  - DNS LB vs hardware LB vs software LB (nginx/HAProxy/Envoy) vs cloud LB
  - Global server load balancing, anycast
- **Reverse proxy vs API gateway vs service mesh** — what each layer legitimately owns (auth, rate limiting, routing, TLS, observability); the anti-pattern of putting business logic in the gateway
- **CDN** — pull vs push, cache keys, TTL, invalidation/purge, origin shielding, edge compute, signed URLs. Static vs dynamic content at the edge.
- **Autoscaling** — reactive vs scheduled vs predictive; scale-up vs scale-out; the cold-start / warm-pool problem; why autoscaling can *worsen* an overload
- Multi-AZ deployment basics (multi-region deferred to Phase 7)

### Lab
`docker compose` with nginx + 3 identical app containers. Kill one mid-load-test and watch the error rate. Then implement consistent hashing in ~50 lines and verify that adding a node moves ~1/N of keys, not all of them.

### Gate
- Design the request path for a 10 M-user web app, naming every hop and what it owns.
- Explain when sticky sessions are acceptable and when they're a liability.
- Explain how a deep health check can take down a healthy fleet.

---

# Phase 3 — Databases (the heaviest phase — do not rush)
**Weeks 4–6 · ~30 hrs**

This is where senior-level candidates are separated from mid-level ones. Depth here pays back in every single interview. Budget three full weeks.

### 3A · Storage engines & indexing
- **B+Tree** (Postgres, MySQL/InnoDB): structure, why fanout matters, page splits, read-optimized, write amplification, fragmentation
- **LSM tree** (Cassandra, RocksDB, ScyllaDB, HBase): memtable → SSTable, WAL, compaction strategies (size-tiered vs leveled), read amplification, space amplification, bloom filters to skip SSTables
- **The core tradeoff:** B-tree = read-optimized, LSM = write-optimized. Be able to pick one from a workload description.
- **Indexes**: clustered vs secondary, composite index column *order*, covering indexes, cardinality/selectivity, partial & functional indexes, why an index can make a query slower, index maintenance cost on writes
- Read `EXPLAIN ANALYZE` output and reason about it
- Row-oriented vs **column-oriented** storage; compression; why OLAP is columnar
- WAL / redo logs, checkpointing, fsync and durability
- Connection pooling and why connection count is a real scaling limit (pgbouncer)

### 3B · Transactions & isolation
- ACID — each letter precisely; what "isolation" actually promises
- **Isolation levels**: read uncommitted → read committed → repeatable read → snapshot → serializable
- **The anomalies each level permits** — dirty read, non-repeatable read, phantom read, **lost update**, **write skew**, read skew. Know a concrete example of write skew (the on-call doctors problem).
- **MVCC** — how Postgres/InnoDB implement snapshots; vacuum / purge; long-running transaction hazards
- Locking: shared/exclusive, row vs table vs gap locks, 2PL, optimistic vs pessimistic concurrency, `SELECT ... FOR UPDATE`, deadlocks (detection + prevention + how to design them away)
- Idempotency and exactly-once at the DB layer (unique constraints as a dedupe primitive)

### 3C · Replication
- Leader–follower (single-leader): sync vs async vs semi-sync; the durability/latency tradeoff
- **Replication lag** and its user-visible consequences; **read-your-own-writes**, monotonic reads, consistent prefix reads — and the concrete techniques to get each
- Statement-based vs row-based (logical) vs WAL/physical shipping
- Failover: automatic vs manual, promoting a replica, **split brain**, fencing tokens, data loss windows
- Multi-leader: use cases (multi-region, offline clients), write conflicts, conflict resolution (LWW, version vectors, application-level merge, CRDTs)
- Leaderless / quorum (Dynamo-style): **R + W > N**, sloppy quorum, hinted handoff, read repair, anti-entropy / Merkle trees
- Chain replication (mention-level)

### 3D · Partitioning & sharding
- Why shard, and the honest answer: *don't until you must*
- Strategies: range, hash, hash-of-range, directory/lookup-table, geo
- **Consistent hashing** with virtual nodes — implement it, don't just describe it
- Hotspots, the **celebrity/hot-key problem**, key salting
- Secondary indexes in a sharded world: local (scatter-gather) vs global/term-partitioned
- **Resharding / rebalancing** without downtime — the question that separates seniors from mids. Double-write + backfill + verify + cutover.
- Cross-shard queries, joins, aggregations, and distributed pagination (all hard — know why)
- Shard key selection as a *design decision with permanent consequences*
- Federation / vertical partitioning as the cheaper alternative

### 3E · Distributed transactions
- Why they're expensive and usually avoidable
- 2PC: protocol, the coordinator-failure blocking problem, 3PC (and why nobody uses it)
- **Sagas**: orchestration vs choreography, compensating transactions, semantic locks
- Outbox pattern + CDC as the practical alternative to distributed transactions
- Percolator / Spanner-style approaches (awareness level: TrueTime, external consistency)
- **Idempotency + at-least-once + dedupe** as the real-world answer to "exactly once"

### 3F · Choosing a datastore
For each family: data model, when it wins, when it's wrong, one representative system.
- **Relational** (Postgres, MySQL) — the default; know why you'd stay here longer than you think
- **Key-value** (Redis, DynamoDB, Riak)
- **Wide-column** (Cassandra, HBase, Bigtable) — **query-first data modeling**, partition key vs clustering key, tunable consistency, why "no joins" changes everything
- **Document** (MongoDB, DynamoDB) — embedding vs referencing, single-table design
- **Search** (Elasticsearch, OpenSearch) — inverted index, not a system of record
- **Time-series** (InfluxDB, TimescaleDB, Prometheus) — downsampling, retention, cardinality explosions
- **Graph** (Neo4j) — when relationships *are* the query
- **Vector** (pgvector, Pinecone) — ANN/HNSW, embeddings, RAG-shaped systems
- **Object storage** (S3) — eventual consistency history, storage classes, lifecycle policies
- **OLTP vs OLAP**, HTAP, data warehouse vs data lake vs lakehouse, ETL vs ELT, columnar formats (Parquet), why you don't run analytics on your production DB
- Normalization vs **denormalization** — and denormalization as a deliberate read-optimization
- Polyglot persistence and its real operational cost

### Lab (do all four — this is the phase where labs matter most)
1. Postgres primary + replica in Docker. Write to primary, read from replica, **induce and measure replication lag**. Then fail over.
2. Run the write-skew anomaly at `REPEATABLE READ`, then fix it three ways: `SERIALIZABLE`, `SELECT FOR UPDATE`, and a unique constraint.
3. 10 M-row table. Query it without an index, with a wrong-order composite index, and with a covering index. Record `EXPLAIN ANALYZE` each time.
4. 3-node Cassandra (or ScyllaDB). Model one query-first table. Write at `QUORUM`, kill a node, observe behaviour at different consistency levels.

### Gate
- Given a workload, choose a datastore *and* a shard key, then defend both against a hostile follow-up.
- Explain how you'd reshard a live 20-node cluster with zero downtime.
- Explain MVCC and what a long-running read transaction does to your database.
- Explain why "exactly-once delivery" is a marketing term.

---

# Phase 4 — Distributed Systems Theory
**Week 7 · ~10 hrs**

The layer that lets you *reason* instead of pattern-match. Keep it practical — you need working intuition, not proofs.

### Topics
- The eight fallacies of distributed computing (read once, remember forever)
- Failure models: crash-stop, crash-recovery, omission, **partial failure**, **gray failure**, Byzantine (know the term, skip the depth)
- **Why you cannot distinguish a slow node from a dead one** — the root of most distributed-systems difficulty
- **CAP** — stated *correctly* (it's about behaviour during a partition, not a permanent personality) — and **PACELC**, which is the more useful framing
- **Consistency models**, strongest → weakest: linearizable → sequential → causal → eventual. Plus the client-centric guarantees: read-your-writes, monotonic reads, monotonic writes, consistent prefix.
- Time: physical clocks, clock skew, NTP, **why timestamps are not ordering**, Lamport clocks, vector clocks, hybrid logical clocks, TrueTime
- **Quorums**: majority quorums, R+W>N, why an even node count is wasteful
- **Consensus**: what problem it solves; **Raft in detail** (leader election, terms, log replication, commit index, membership changes); Paxos/Multi-Paxos and ZAB at awareness level
- Coordination services: ZooKeeper / etcd / Consul — leader election, distributed locks, config, service discovery, watches. **Leases and fencing tokens.**
- Membership & failure detection: heartbeats, phi-accrual, **gossip** (SWIM)
- **Idempotency, at-most-once / at-least-once / effectively-once**
- Distributed state patterns: CRDTs (G-counter, LWW-register, OR-set), operational transformation — and where each is used (collaborative editing, offline-first)
- Backpressure and flow control as a systems concept
- Head-of-line blocking, straggler mitigation, hedged requests, tied requests

### Lab
Run a 3-node etcd cluster. Elect a leader. `kill -STOP` the leader (pause, don't kill — that's the interesting failure) and watch re-election. Then implement a lock with a lease + fencing token, and demonstrate the bug you get *without* the fencing token.

### Gate
- State CAP correctly and explain why "CP vs AP" is an incomplete way to describe a database.
- Explain Raft leader election and log replication on a whiteboard from memory.
- Explain why a distributed lock without fencing is unsafe, with a concrete failure sequence.
- Order five consistency models and give a product requirement that demands each.

### Read
Designing Data-Intensive Applications, Chapters 5–9. By this point you should be able to read them fast and with recognition rather than confusion. **This is the single highest-value reading in the entire roadmap.**

---

# Phase 5 — Caching
**Week 8 · ~8 hrs**

Appears in essentially every interview. The depth signal isn't "add a cache" — it's invalidation and failure behaviour.

### Topics
- The cache hierarchy: CPU → client/browser → CDN → reverse proxy → application → database buffer pool → OS page cache
- **Patterns**: cache-aside (lazy), read-through, write-through, write-behind/write-back, refresh-ahead. Consistency and failure characteristics of each.
- **Invalidation**: TTL, explicit purge, write-through invalidation, versioned keys, event-driven invalidation via CDC. *"Cache invalidation is hard" — be able to say exactly why.*
- Eviction: LRU, LFU, FIFO, ARC, W-TinyLFU, random. TTL + jitter.
- **The failure modes — know all of these by name, they're common follow-ups:**
  - Cache stampede / thundering herd → request coalescing, locks, probabilistic early expiry
  - Hot key → local (near) cache, key replication/sharding, client-side caching
  - Cache penetration (queries for nonexistent keys) → bloom filter, negative caching
  - Cache avalanche (mass simultaneous expiry) → TTL jitter
  - Big keys, and why they wreck a Redis cluster
  - **Cold cache after restart** — the outage nobody plans for
- Sizing: hit ratio math, working-set estimation, why 80% hit rate might be worse than useless (and why marginal hit rate is what matters)
- **Redis in depth**: data structures (string, hash, list, set, sorted set, HyperLogLog, streams, bitmap, geo) and *what each unlocks in a design*; single-threaded model; persistence (RDB vs AOF vs both); Sentinel vs Cluster; hash slots; pipelining; Lua for atomicity; expiry mechanics; `SCAN` vs `KEYS`
- Redis as more than a cache: rate limiter, leaderboard (sorted sets), session store, distributed lock, queue (and why a real broker is usually better)
- **Redlock** and the well-known critique — knowing both sides is a strong senior signal
- Memcached vs Redis; when the simpler tool wins
- Consistent hashing for cache clusters; local + remote (two-tier) caching
- Materialized views and precomputation as caching by another name

### Lab
Build a read-through cache in front of Postgres. Load-test it, then delete all keys under load and watch the DB melt — that's a cold-cache outage. Fix it with request coalescing. Then implement a sliding-window rate limiter with a Redis sorted set, and a token bucket with Lua.

### Gate
- Design the full caching strategy for a read-heavy product: layers, keys, TTLs, invalidation, and behaviour when the cache dies entirely.
- Name five cache failure modes and their mitigations without hesitating.
- Explain the Redlock controversy and state your own position.

---

# Phase 6 — Asynchronous Processing, Messaging & Streaming
**Weeks 9–10 · ~16 hrs**

The backbone of every non-trivial design. Second only to databases in interview weight.

### Topics
- **Why async at all**: decoupling, load levelling/buffering, spike absorption, retry isolation, fan-out. And the cost: eventual consistency, ordering loss, debugging difficulty, operational surface.
- **Three primitives, clearly distinguished**: queue (work distribution, competing consumers) vs pub/sub (fan-out) vs **log/stream** (replayable, ordered, retained)
- **Kafka in depth** — this is worth real study time:
  - Topics, partitions, offsets, the partition as the unit of ordering *and* parallelism
  - Producers: acks 0/1/all, `min.insync.replicas`, idempotent producer, batching/linger, partitioner and key-based routing
  - Consumer groups, rebalancing (eager vs cooperative sticky), static membership, offset commit strategies and the at-least-once/at-most-once fork
  - Replication: leader/follower, **ISR**, unclean leader election and the durability tradeoff
  - Retention: time/size-based vs **log compaction** (and what compaction unlocks — event-carried state)
  - **Ordering guarantees: per-partition only.** The consequences of that fact.
  - Transactions / exactly-once semantics — read-process-write, and its real limits
  - Consumer lag as the operational metric that matters
  - Tiered storage, KRaft (post-ZooKeeper)
- **Other brokers and when each is right**: RabbitMQ (exchanges, routing keys, per-message ack/priority/TTL), SQS (standard vs FIFO, visibility timeout, long polling), SNS, Kinesis, Pulsar, NATS, Redis Streams. Compare on: ordering, retention, delivery semantics, throughput, ops cost.
- **Delivery semantics** end to end: at-most-once, at-least-once, effectively-once via **idempotent consumers + dedupe store**
- **Consumer-side hygiene**: DLQs, poison messages, retry topics with backoff tiers, max-attempts, replay/reprocessing, and the crucial fact that **the DLQ needs an owner and an alarm** or it's a silent data-loss bucket
- **Backpressure** — what happens when consumers can't keep up; and the honest answer about **unbounded queue growth**
- **The dual-write problem** → **Transactional outbox**, and **CDC / Debezium** as the general solution. This pattern is enormously reusable in interviews.
- Event-driven design: event notification vs event-carried state transfer vs event sourcing; commands vs events; **schema evolution and a schema registry** (Avro/Protobuf, compatibility modes)
- **Fan-out patterns** — push (write fan-out) vs pull (read fan-out) vs hybrid. This *is* the news-feed question; learn it here so the design question becomes trivial.
- **Stream processing**: stateless vs stateful ops, windowing (tumbling, hopping, sliding, session), **event time vs processing time**, watermarks, late/out-of-order data, joins (stream-stream, stream-table), local state stores + changelogs, checkpointing. Kafka Streams vs Flink vs Spark Streaming.
- Batch vs streaming; Lambda vs **Kappa** architecture; when batch is simply the right answer
- **Scheduled & delayed work**: cron's limits, distributed schedulers, delay queues, timer wheels, leader-elected singleton jobs, idempotent job runs, exactly-once-ish scheduling
- Worker pools, task queues (Celery/Sidekiq-shaped), long-running jobs, progress reporting, cancellation

### Lab
Kafka in Docker. Produce to a 3-partition topic, consume with a 2-consumer group, then add a third consumer and observe rebalancing. Kill a consumer mid-batch and demonstrate duplicate delivery. Then make the consumer idempotent with a dedupe table and prove the duplicate is absorbed. Finally implement the outbox pattern: DB write + outbox row in one transaction, relay to Kafka.

### Gate
- Explain the dual-write problem and solve it with the outbox pattern on a whiteboard.
- Explain why Kafka can't give you global ordering, and design around that.
- Design a notification system with retries, DLQ, and dedupe — end to end.
- Explain event time vs processing time and why watermarks exist.

---

# Phase 7 — Reliability, Resilience & Observability
**Week 11 · ~10 hrs**

The "senior" phase. Mid-level candidates design the happy path. Senior candidates design the failure path — this is the most reliable single differentiator in the whole round.

### Topics
- **Resilience patterns**
  - Timeouts (every network call, always; and how to actually pick the value — from the p99, not from a guess)
  - Retries: budgets, exponential backoff + **jitter**, retry only idempotent ops, **why retries at every layer multiply into a retry storm**
  - **Circuit breakers**: closed/open/half-open, thresholds, and what to do while open
  - Bulkheads / thread-pool isolation
  - **Load shedding** and admission control; prioritized shedding (shed the cheap traffic, keep checkout)
  - **Graceful degradation**: serve stale, serve partial, serve default. Feature-level fallbacks.
  - Hedged requests, request cancellation, deadline propagation across service hops
  - Idempotency keys and dedupe windows
- **Rate limiting** (a standalone interview question — learn it properly)
  - Fixed window, sliding window log, sliding window counter, **token bucket**, leaky bucket
  - Where to enforce: edge / gateway / service / per-user / per-IP / per-tenant
  - **Distributed** rate limiting: centralized counter (Redis) vs local + sync, accuracy vs latency tradeoff
  - Client behaviour: `429`, `Retry-After`, backoff, quotas vs throttling
- **Failure modes to know by name** — cascading failure, retry storm, thundering herd, metastable failure, **queue backup and unbounded growth**, hot shard, correlated failure (shared dependency), gray failure, **death spiral from autoscaling under overload**
- **Observability**
  - Metrics vs logs vs traces vs events/profiles — and what each is *bad* at
  - **RED** (rate, errors, duration) for services; **USE** (utilization, saturation, errors) for resources; the four golden signals
  - Distributed tracing: trace/span, context propagation, sampling (head vs tail)
  - Cardinality — the reason your metrics bill exploded
  - Structured logging, log aggregation, retention/cost, PII in logs
  - Dashboards, alerting on **symptoms not causes**, alert fatigue, runbooks, on-call
  - **SLI/SLO/error budgets** as an engineering decision-making tool
- **Deployment & change safety** — most outages are caused by deploys
  - Blue-green, rolling, **canary** (with automated analysis), shadow/dark traffic, feature flags, kill switches
  - **Zero-downtime schema migrations**: expand–migrate–contract, backfilling large tables, double-writes, backward-compatible reads. *Know this concretely — it comes up constantly.*
  - Rollback vs roll-forward; the migration you can't roll back
- **Multi-region & disaster recovery**
  - Single-AZ → multi-AZ → multi-region; what each buys and costs
  - Active-passive vs active-active vs active-active-with-partitioned-writes
  - **RPO / RTO**; backups vs replication (they are not the same thing); backup *restore* testing
  - Data residency/sovereignty; cross-region replication lag; global traffic routing and failover
  - Cell-based architecture, shuffle sharding, blast-radius reduction
- Capacity planning, headroom, load testing (load/stress/soak/spike), **chaos engineering**, game days
- Postmortems, blameless culture, defence in depth

### Lab
Wrap a flaky downstream dependency with timeout + retry-with-jitter + circuit breaker. Load test it and graph the difference. Then do a real expand–contract migration on a live table: rename a column with zero downtime, with writes flowing the whole time.

### Gate
- For any design you've drawn, list every failure mode and its mitigation, unprompted.
- Design a distributed rate limiter and defend the accuracy/latency tradeoff.
- Walk through a zero-downtime column rename on a 500 M-row table.
- Explain what happens to your system when a downstream dependency slows to 5 s p99 — and what stops it from taking you down.

---

# Phase 8 — Architecture Patterns
**Week 12 · ~8 hrs**

### Topics
- **Monolith vs modular monolith vs microservices** — the honest tradeoffs. **Be prepared to argue *for* the monolith**; reflexive microservices is a junior tell.
- Service boundaries: DDD-lite (bounded contexts, aggregates, ubiquitous language), Conway's law, the distributed monolith anti-pattern
- Sync vs async communication as a **coupling** decision; orchestration vs choreography
- Service discovery (client-side vs server-side), service mesh & sidecars, what belongs in infrastructure vs code
- **CQRS** — when separate read/write models earn their complexity
- **Event sourcing** — append-only log as source of truth, projections, replay, snapshots, versioning events, and its very real costs
- **Saga** revisited as an architectural pattern
- Strangler fig (legacy migration), branch-by-abstraction, anti-corruption layer
- **BFF** (backend-for-frontend), API composition/aggregation, GraphQL federation
- **Multi-tenancy**: shared-everything → shared-schema-with-tenant-id → schema-per-tenant → DB-per-tenant; noisy neighbours, per-tenant limits, tenant-aware sharding
- Idempotent, evolvable API design; contract testing
- Serverless / FaaS: cold starts, execution limits, statelessness, when it's genuinely right
- Batch/pipeline architecture, workflow engines (Temporal, Airflow, Step Functions) and the durable-execution model
- Read/write path separation as a general design instinct
- **Build vs buy** and total cost of ownership — a senior consideration interviewers listen for

### Lab
Take one service you know well. Write a one-page decomposition: boundaries, data ownership, sync vs async per interaction, and what breaks during a migration. Then write the counter-argument for keeping it a monolith. Being able to argue both sides is the actual skill.

### Gate
- Argue both sides of monolith vs microservices for a 30-engineer team, and commit to a recommendation.
- Explain when CQRS and event sourcing are worth it — and when they're résumé-driven.
- Design multi-tenant isolation for a B2B SaaS product at three different scales.

---

# Phase 9 — Reusable Building Blocks
**Week 13 · ~10 hrs**

These are the Lego bricks. Interview questions are almost always a *recombination* of these — learning them explicitly makes novel questions feel familiar.

### Topics
- **Unique ID generation**: auto-increment (and why it doesn't shard), UUID v4 (and why it destroys B-tree locality), **UUID v7 / ULID** (time-sortable — usually the modern right answer), **Snowflake** (timestamp + machine + sequence), ticket server, DB sequence blocks, clock-skew handling
- **Rate limiter** (from Phase 7 — treat it as a component you can design in 10 minutes)
- **Distributed lock / leader election**: Redis, ZooKeeper/etcd, DB row lock; leases, fencing tokens, liveness vs safety
- **Search**: inverted index construction, tokenization/analysis/stemming, term & document frequency, **TF-IDF and BM25**, phrase/fuzzy/prefix queries, ES shards & replicas, near-real-time indexing and the refresh interval, index-vs-query-time tradeoffs, faceting, pagination limits (deep paging), reindexing with aliases
- **Autocomplete / typeahead**: trie, prefix compression, top-K per prefix precomputation, personalization, ranking, debouncing, edge caching
- **Geospatial**: geohash, quadtree, **S2**, **H3**, R-tree; proximity search, radius vs kNN, geo-sharding, moving objects, map matching
- **Probabilistic / streaming structures — high signal, low cost to learn**
  - **Bloom filter** (and counting/cuckoo variants) — membership
  - **HyperLogLog** — cardinality (unique visitors) in constant memory
  - **Count-Min Sketch** — frequency / heavy hitters
  - t-digest / **reservoir sampling** — quantiles and sampling
  - Top-K / trending computation
- **Counters at scale**: sharded counters, write-combining/batching, approximate counts, Redis `INCR` limits, Kafka + aggregation
- **Feed / timeline generation**: fan-out on write vs on read vs **hybrid** (celebrity handling), ranking, pagination over a changing list, cursor stability
- **Notification / fan-out**: multi-channel (push/SMS/email/in-app), templating, user preferences, dedupe, batching/digest, priority lanes, provider failover, delivery tracking, quiet hours
- **WebSocket infrastructure at scale**: connection routing, sticky routing to the right node, presence, a pub/sub backplane for cross-node fan-out, heartbeats, reconnect + missed-message replay, connection limits per node
- **Blob/object storage**: chunking, multipart & resumable upload, presigned URLs, direct-to-S3 uploads, content-addressed storage + dedupe, storage classes/lifecycle, CDN in front of blobs
- **Media pipelines**: transcode DAG, resolution ladder, HLS/DASH, adaptive bitrate, thumbnails, DRM basics, live streaming (ingest → transcode → package → edge)
- **Idempotency service / dedupe store** — TTL windows, storage cost
- **Analytics & aggregation pipelines**: pre-aggregation, roll-ups, OLAP cubes, Druid/ClickHouse/Pinot for real-time analytics, lambda-vs-kappa applied
- **Payments primitives** (recur constantly): double-entry ledger, immutability, idempotency keys, reconciliation, two-phase authorize/capture, webhook handling + replay, currency & precision (never floats), audit trail

### Lab
Implement three of these from scratch, in any language: a bloom filter, a Snowflake ID generator, and a top-K-per-prefix autocomplete. ~150 lines each, and they'll stick permanently.

### Gate
- Design any of the above as a component in under 10 minutes.
- Given "count unique daily visitors across 500 M events," reach for HyperLogLog and justify the accuracy tradeoff.
- Explain hybrid fan-out and the exact threshold logic for celebrity accounts.

---

# Phase 10 — Security, Privacy & Compliance
**Week 14 (first half) · ~6 hrs**

You don't need a security-engineer's depth. You *do* need to never leave auth undesigned — the omission is noticed.

### Topics
- **AuthN vs AuthZ** — kept distinct
- Sessions vs tokens; **JWT**: structure, signing (HS vs RS), claims, expiry, **the revocation problem**, refresh-token rotation, why you don't put JWTs in localStorage
- **OAuth 2.0 / OIDC**: authorization code + PKCE, client credentials, device flow; access vs refresh vs ID token; consent; SSO, SAML (awareness)
- Service-to-service auth: mTLS, signed requests (HMAC), short-lived tokens, workload identity
- **Authorization models**: RBAC, ABAC, ReBAC (Zanzibar-style — increasingly asked about), policy engines, permission checks at scale and how to cache them
- API keys, scopes, quotas
- **Encryption**: in transit (TLS) vs at rest; envelope encryption, KMS, key rotation, field-level encryption, tokenization; **hashing passwords** (bcrypt/scrypt/argon2 + salt — never SHA)
- **PII & privacy by design**: data classification, minimization, retention, **GDPR right-to-erasure and what it means for immutable logs and event stores** (crypto-shredding), consent, audit logs, data residency
- OWASP Top 10 at a practical level: injection, broken access control, SSRF, XSS, CSRF, insecure deserialization
- **DDoS mitigation**: L3/L4 vs L7, scrubbing, WAF, bot detection, CAPTCHA, cost-of-attack asymmetry
- Secrets management, rotation, no secrets in code/env-in-git
- Tenant isolation as a security boundary
- Abuse & fraud: velocity checks, anomaly detection, shadow bans
- Compliance vocabulary: SOC 2, PCI-DSS, HIPAA — enough to know when a design constraint is legal rather than technical

### Gate
- Add a complete auth story to any design in 3 minutes: who authenticates, how, where tokens live, how they're revoked, how services trust each other.
- Explain how you'd honour a GDPR deletion request in an event-sourced system.

---

# Phase 11 — Interview Craft
**Week 14 (second half) · ~6 hrs, then continuous**

Knowledge you can't deliver in 45 minutes is worth nothing in a round. This phase is pure ROI.

### The framework (internalize the beats, don't recite them)

**1 · Requirements & scope — 5–8 min. Never skip. Never rush.**
- Functional: what must it do? Get 3–5 core features and **explicitly defer the rest** ("I'll leave analytics out of scope unless you'd like it — say the word")
- Scale: DAU/MAU, QPS, read:write ratio, data size, growth
- Non-functional: latency target, availability target, consistency requirement, durability
- Constraints: mobile? global? regulatory? existing stack? team size?
- **Write the agreed scope in a corner of the board and refer back to it.** It anchors the whole conversation and stops scope creep.

**2 · Capacity estimation — 3–5 min.** QPS (average and peak), storage/year, bandwidth, memory for cache. Round aggressively, state assumptions, and *use the numbers later* — an estimate you never reference was theatre.

**3 · API design — 3–5 min.** The 3–5 core endpoints/events with signatures. This forces concrete thinking and often exposes a requirement gap early.

**4 · Data model — 5 min.** Entities, relationships, **datastore choice with a reason**, **shard key with a reason**, key access patterns. Seniors are judged hard here.

**5 · High-level architecture — 8–10 min.** Client → edge/CDN → LB → services → cache → DB → async workers → stream. Draw boxes and arrows, then **walk one write path and one read path end to end.** Narrating a request beats a static diagram every time.

**6 · Deep dive — 10–15 min.** The interviewer will pick one, or you offer: "The interesting problem here is the hot-key fan-out — shall I go deep there?" Offering a good deep-dive candidate is itself a strong signal.

**7 · Bottlenecks, failures & scale-up — 5–10 min.** Single points of failure, hot spots, what breaks at 10×, what happens when each component dies, monitoring & alerting, cost. **Volunteer this — don't wait to be asked.** This is the senior differentiator.

**8 · Wrap — 1–2 min.** Recap, name the top 2 tradeoffs you made, and what you'd revisit with more time.

### Skills to drill
- **Talk while you draw.** Silence reads as being stuck.
- **State assumptions out loud** and move on rather than waiting for permission.
- Every choice gets a **because**. "Cassandra *because* write-heavy, time-series access, and we can tolerate eventual consistency here."
- **Volunteer tradeoffs.** "This gives us availability at the cost of read-your-writes — I'd fix that by pinning a user's reads to the primary for 5 seconds after a write."
- Handle "what if 10× / 100×?" — know which component breaks *first*.
- **Disagree well.** If the interviewer pushes a worse option, engage with the merits, don't fold instantly and don't dig in. Both extremes score badly.
- **When you don't know:** "I haven't worked with X directly. My mental model is Y — is that roughly right?" Honest + reasoning-forward beats bluffing, which is always detected.
- Manage the clock. Depth on everything is impossible; choose deliberately and say you're choosing.
- Numbers on the diagram: QPS on arrows, size on datastores.

### Common failure patterns to avoid
- Jumping to architecture before requirements (the #1 killer)
- Buzzword soup with no justification; Kafka in a design that needs a cron job
- Designing for 1 B users when told 10 K
- Ignoring the failure path entirely
- Never mentioning cost or operational burden
- Going silent while thinking
- No shard key, no consistency story, no auth story
- Refusing to commit — "it depends" without ever landing the plane
- Whiteboard chaos: leave room, draw left-to-right, keep it legible

### Lab
Record yourself doing a 45-minute design out loud, alone. Watch it back. It will be unpleasant and it is the fastest improvement you will get from any single hour in this roadmap. Repeat every two weeks.

---

# Phase 12 — Practice (starts Week 6, runs to the end)

**This is the phase that actually gets you hired.** Start it *early and in parallel* — do your first design in Week 6 even though you'll be shaky.

**Method per problem (~90 min):**
1. 45 min: solve it timed, out loud, on a whiteboard/Excalidraw. No looking anything up.
2. 20 min: read 2–3 good write-ups of the same problem. Note *only* what you missed.
3. 15 min: write your own one-page summary — requirements, architecture, key tradeoffs, failure modes.
4. 10 min: list the reusable building blocks it used. Watch the overlap grow; by problem 15 most questions are recombinations.

**Cadence:** 2 problems/week from Week 6, 3/week from Week 12. Target ~30 problems.

### Tier 1 — Core mechanics (Weeks 6–8)
1. URL shortener (ID gen, KV store, cache, redirects, analytics)
2. Pastebin (blob storage, expiry)
3. Rate limiter (algorithms, distributed state)
4. Unique ID generator at scale (Snowflake)
5. Consistent hashing / distributed KV store
6. Distributed cache (Memcached/Redis-like)
7. Web crawler (BFS frontier, politeness, dedupe, traps)
8. Key-value store with replication + quorum (Dynamo-lite)

### Tier 2 — Classics (Weeks 9–11)
9. **Twitter / news feed** (fan-out on write vs read, hybrid, celebrity)
10. Instagram (media pipeline, feed, follow graph)
11. **WhatsApp / chat** (WebSockets, delivery receipts, ordering, groups, offline, E2E)
12. **Notification system** (multi-channel, retries, DLQ, preferences)
13. Typeahead / autocomplete (trie, top-K)
14. Search engine / Elasticsearch-backed search
15. Nearby friends / proximity service (geo-indexing)
16. Leaderboard / gaming ranks (sorted sets, sharding)
17. Ad click aggregator (streaming, exactly-once-ish, real-time OLAP) — *directly relevant to ad-tech*
18. Real-time bidding / ad serving (hard latency budget, ~100 ms end to end) — *ditto*

### Tier 3 — Large & consistency-heavy (Weeks 12–14)
19. **YouTube / Netflix** (upload, transcode, CDN, ABR, recommendations)
20. **Uber / ride-hailing** (matching, geo, real-time location, surge, state machine)
21. Google Maps / navigation (graph, tiles, routing, traffic)
22. Food delivery (three-sided marketplace, ETA, assignment)
23. **Ticket booking / IRCTC / Ticketmaster** (inventory, no double-booking, holds, extreme spikes) — *the best consistency question there is*
24. **Payment system** (ledger, idempotency, reconciliation, webhooks, exactly-once money)
25. E-commerce / Amazon (catalog, cart, inventory, order saga, search)
26. Hotel / Airbnb booking (availability calendars, search, pricing)

### Tier 4 — Systems-heavy (Weeks 15–16)
27. **Google Drive / Dropbox** (chunking, dedupe, sync, conflicts, delta sync)
28. **Google Docs** (collaborative editing, OT vs CRDT, presence)
29. **Distributed job scheduler / cron** (at-least-once, leader election, delayed jobs)
30. Metrics & monitoring system (ingest, time-series storage, cardinality, query, alerting)
31. Log aggregation / distributed tracing backend
32. **S3 / object storage** (durability, erasure coding, metadata service)
33. Stock exchange / order matching (ultra-low latency, ordering, fairness)
34. Live streaming (ingest → transcode → edge, latency vs quality)
35. Slack / Discord (channels, fan-out, presence at scale)
36. LinkedIn / social graph (degrees of connection, graph queries)
37. Distributed message queue (build Kafka)
38. Distributed transaction coordinator / Spanner-lite

---

# Resources

**Books (in the order to read them)**
1. **Designing Data-Intensive Applications** — Kleppmann. *The one book. Non-negotiable. Read Ch. 1–4 during Phase 3, Ch. 5–9 during Phase 4, Ch. 10–12 during Phase 6.*
2. **System Design Interview Vol. 1 & 2** — Alex Xu. Interview-shaped, good for Phase 12 write-up comparison. Not a substitute for DDIA.
3. **Understanding Distributed Systems** — Roberto Vitillo. Gentler than DDIA, excellent second pass.
4. **Database Internals** — Alex Petrov. For Phase 3A depth.
5. **Release It!** — Michael Nygard. The resilience-patterns source. Read during Phase 7.
6. **Site Reliability Engineering** — Google (free online). Chapters on SLOs, overload, cascading failures.
7. **Designing Distributed Systems** — Brendan Burns. Short, pattern-oriented.

**Papers — read the abstract + architecture section, skip the proofs**
Amazon Dynamo · Google Bigtable · GFS · MapReduce · Spanner · Chubby · Raft ("In Search of an Understandable Consensus Algorithm") · Kafka · Cassandra · ZooKeeper · **Scaling Memcache at Facebook** (unusually practical) · Facebook Haystack · Facebook TAO · Google Percolator · Amazon Aurora · Google Monarch · Borg · Zanzibar

**Engineering blogs** — Netflix, Uber, Airbnb, Discord (excellent and concrete), Stripe, Cloudflare, Dropbox, Meta, Slack, Figma, Canva, Shopify, LinkedIn, DoorDash, Grab. Plus High Scalability and the AWS Builders' Library (genuinely excellent on timeouts, retries, load shedding).

**Video** — Arpit Bhayani (deep, India-market-aware), Gaurav Sen, Hussein Nasser (networking/DBs), Jordan has no life (interview-focused), System Design Fight Club, InfoQ/QCon/Strange Loop talks.

**Tools** — Excalidraw (interview-realistic diagrams — practise in the tool you'll use), Docker Compose (every lab), k6/wrk (load testing), Postgres + Redis + Kafka locally.

**Mock interviews** — Pramp, interviewing.io, peers. **Minimum 8 mocks before a real round.** This is the highest-leverage money you can spend.

---

# 16-Week Schedule

| Week | Phase | Practice problems |
|---|---|---|
| 1 | Phase 0 — Foundations | — |
| 2 | Phase 1 — Networking | — |
| 3 | Phase 2 — Stateless scaling | — |
| 4 | Phase 3A/3B — Storage engines, transactions | — |
| 5 | Phase 3C/3D — Replication, sharding | — |
| 6 | Phase 3E/3F — Distributed txn, DB selection | **1–2** (start now) |
| 7 | Phase 4 — Distributed systems theory | 3–4 |
| 8 | Phase 5 — Caching | 5–6 |
| 9 | Phase 6 — Messaging & Kafka | 7–9 |
| 10 | Phase 6 — Streaming & async patterns | 10–12 |
| 11 | Phase 7 — Reliability & observability | 13–15 |
| 12 | Phase 8 — Architecture patterns | 16–18 |
| 13 | Phase 9 — Building blocks | 19–21 |
| 14 | Phases 10 + 11 — Security, interview craft | 22–24 + **mocks begin** |
| 15 | Review + weak-spot repair | 25–28 + mocks |
| 16 | Review + full mock loop | 29–32 + mocks |

**Weekly rhythm:** 2 weekday evenings on topics (~1.5 hrs each) · 1 weekday evening on a lab (~1.5 hrs) · weekend block for practice problems + notes review (~4 hrs).

**Every 4 weeks:** re-read your entire `notes/` folder (20 min) and redo one earlier problem cold. Retention is the thing that quietly fails; this is the cheap fix.

---

## The honest summary

Three things separate a *pass* from a *strong hire* at senior level, and none of them is knowing more technologies:

1. **You justify every choice with the workload** — never "I'd use Cassandra," always "write-heavy, time-ordered, eventual consistency is fine here, so Cassandra."
2. **You design the failure path unprompted** — what dies, what degrades, what pages someone.
3. **You state tradeoffs before you're asked** — because that's what proves you understand the decision rather than having memorized the answer.

Phases 3, 6, and 7 are where those three come from. If your time gets compressed, protect those and let Phases 8–10 go shallow.
