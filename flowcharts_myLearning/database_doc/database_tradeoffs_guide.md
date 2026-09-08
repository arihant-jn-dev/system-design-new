# Database Tradeoffs — Complete System Design Guide
## Every Core Tradeoff, When It Matters, and How to Decide

> **The #1 insight in system design:**
> Every architectural decision is a TRADEOFF.
> There is no universally "best" choice — only the right choice for YOUR constraints.
> The best engineers don't memorize solutions — they understand tradeoffs deeply.
>
> This guide teaches you to REASON through every major database tradeoff.

---

## Table of Contents
1. [CAP Theorem](#part-1)
2. [ACID vs BASE](#part-2)
3. [Strong Consistency vs Eventual Consistency](#part-3)
4. [Read vs Write Performance](#part-4)
5. [Normalization vs Denormalization](#part-5)
6. [Vertical Scaling vs Horizontal Scaling](#part-6)
7. [Replication Strategies](#part-7)
8. [Sharding / Partitioning Strategies](#part-8)
9. [Indexing Tradeoffs](#part-9)
10. [Storage vs Performance](#part-10)
11. [SQL vs NoSQL](#part-11)
12. [Caching Strategies and Tradeoffs](#part-12)
13. [Latency vs Throughput](#part-13)
14. [The Master Tradeoff Table](#part-14)

---

## PART 1 — CAP Theorem <a name="part-1"></a>

### The Core Idea

```
CAP Theorem states: In a DISTRIBUTED system, you can guarantee at most
TWO out of these THREE properties simultaneously:

  C — Consistency:   Every read receives the most recent write or an error.
                     All nodes see the SAME data at the SAME time.

  A — Availability:  Every request receives a (non-error) response.
                     The system is always up and responsive.

  P — Partition Tolerance: The system continues to operate even when
                     network messages between nodes are lost or delayed.

THE KEY INSIGHT:
  Network partitions WILL happen in distributed systems (cables fail,
  servers crash, packets drop). So P is NOT optional — you must always
  tolerate partitions. This means the real choice is always:

                 CP  →  Choose Consistency over Availability
                 AP  →  Choose Availability over Consistency

  (CA systems only exist on a single node — not distributed systems)
```

### Visual: The CAP Triangle

```
                    CONSISTENCY
                    (Every node agrees)
                         /\
                        /  \
                       /    \
                    CP /      \ CA
                      /        \  (Single node only)
                     /          \
                    /______________\
       PARTITION             AVAILABILITY
       TOLERANCE          (Always responds)
       (Network fails ok)
             AP

REAL SYSTEMS:
  CP Systems:  HBase, Zookeeper, etcd, MongoDB (default config)
               → Refuse requests when partitioned → stays consistent
               → Used for: config management, leader election, distributed locks

  AP Systems:  Cassandra, CouchDB, DynamoDB (default), Riak
               → Always respond, may return stale data → stays available
               → Used for: social feeds, shopping carts, DNS caching
```

### Real-World Example: ATM Network

```
SCENARIO: Bank's ATM network splits into two partitions.
  ATM cluster A (Mumbai)  ←── network failure ──→  ATM cluster B (Delhi)

BANK HAS TWO OPTIONS:

OPTION 1: Choose CP (Consistency over Availability)
  Action: Shut down ATMs until the network is restored.
  Result:
    ✓ No one can overdraft by withdrawing from both clusters simultaneously.
    ✗ ATMs are offline — customers are angry.
  Real use: ATM networks actually do this! Better to be down than to let
            people withdraw more than their balance.

OPTION 2: Choose AP (Availability over Consistency)
  Action: Allow transactions on both clusters independently.
  Result:
    ✓ ATMs stay operational. Customers can withdraw cash.
    ✗ Customer with ₹500 withdraws ₹500 from both clusters = ₹1000 total.
    The bank reconciles inconsistencies later (overdraft fees, etc.)
  Real use: Shopping cart — if cart is inconsistent, reconcile at checkout.

CHOOSING CP vs AP:
  Data involves MONEY or INVENTORY?  →  CP (Consistency)
  Data is social/ephemeral?          →  AP (Availability)
  Losing data is catastrophic?       →  CP
  Being slightly stale is okay?      →  AP
```

### Cassandra's AP Tunable Consistency

```
Cassandra is AP by DEFAULT, but lets you TUNE toward consistency per query.

CONSISTENCY LEVELS:
  ONE:    Write/read succeeds when 1 replica responds.      → Fastest, least consistent
  QUORUM: Write/read succeeds when majority responds.       → Balanced
  ALL:    Write/read succeeds when ALL replicas respond.    → Consistent, slowest

EXAMPLE (3 replicas, replication factor = 3):
  Write with QUORUM → 2 out of 3 nodes must confirm → then success.
  Read  with QUORUM → ask 2 out of 3 nodes, take most recent version.

  WRITE_CONSISTENCY + READ_CONSISTENCY > REPLICATION_FACTOR → Strong consistency
  QUORUM + QUORUM (2+2 > 3) → Strong consistency even in Cassandra!

This is why CAP is more of a spectrum than a binary choice in practice.
```

---

## PART 2 — ACID vs BASE Properties <a name="part-2"></a>

### ACID — The Traditional Guarantee (Relational DBs)

```
ACID = Atomicity + Consistency + Isolation + Durability

A — ATOMICITY:
    "All or nothing." A transaction either fully completes or fully rolls back.
    No partial updates ever visible to the outside world.

    EXAMPLE: Transfer ₹1000 from Alice to Bob.
    Two operations:
      1. Debit Alice:  Alice.balance -= 1000
      2. Credit Bob:   Bob.balance  += 1000

    WITHOUT ATOMICITY: Server crashes after step 1 → Alice loses ₹1000,
                        Bob gets nothing. Money disappears!
    WITH ATOMICITY:    Both succeed, or both roll back. Money never disappears.

C — CONSISTENCY:
    The database always moves from one VALID state to another VALID state.
    All defined rules/constraints are always satisfied.

    EXAMPLE: A "balance" column has a CHECK constraint: balance >= 0.
    If a transaction would make balance = -500, the DB rejects it.
    The constraint is ALWAYS upheld — the DB is always "consistent."

I — ISOLATION:
    Concurrent transactions behave AS IF they ran serially (one after another).
    Intermediate state of one transaction is NOT visible to others.

    EXAMPLE: Two people book the last train seat simultaneously.
    WITHOUT ISOLATION: Both read "1 seat available," both proceed to book,
                        both get a booking confirmation. Double booking!
    WITH ISOLATION:     One transaction locks the row, the other waits,
                        sees "0 seats," and gets an error.

D — DURABILITY:
    Once a transaction is COMMITTED, it stays committed.
    Even if the server crashes immediately after, the data survives.

    HOW: Write-Ahead Log (WAL). The DB writes to a log on disk BEFORE
    confirming the commit. On restart, it replays the log.

ISOLATION LEVELS (from weakest to strongest):
  Read Uncommitted → Can read another transaction's uncommitted (dirty) data.
  Read Committed   → Only read committed data. (Default in PostgreSQL, Oracle)
  Repeatable Read  → Same row read twice returns same result within transaction.
  Serializable     → Fully serial execution. Safest, but slowest.
```

### BASE — The NoSQL Alternative

```
BASE = Basically Available + Soft state + Eventually consistent

The opposite philosophy from ACID. Trades correctness for scalability.

B — BASICALLY AVAILABLE:
    The system APPEARS to work even during partial failures.
    Might return stale or partial data, but never returns nothing.

    EXAMPLE: Amazon.com during a backend issue still shows products
    (from cache), just with slightly stale prices or stock levels.
    Better than showing a 503 error.

S — SOFT STATE:
    The state of the system may change over time, even without input.
    Nodes may have different versions of the data temporarily.
    Replica A: user.followers = 1001
    Replica B: user.followers = 1000  (has not yet received the latest write)
    Both are "valid" temporarily — the state is "soft" (not fixed).

E — EVENTUALLY CONSISTENT:
    Given enough time with no new updates, all replicas will EVENTUALLY
    converge to the same value.
    Not "always consistent" — "eventually consistent."

    EXAMPLE: You post a tweet. Your followers in different data centers
    might see it at slightly different times (milliseconds to seconds).
    Eventually, everyone sees it. This is acceptable for social data.
```

### ACID vs BASE — Side by Side

```
PROPERTY          ACID                          BASE
────────────────────────────────────────────────────────────────────────────
Philosophy        Correctness first             Availability first
Consistency       Strong (always consistent)    Eventual (converges over time)
Transactions      Yes, full ACID                No traditional transactions
Failure handling  Roll back, stay consistent    Proceed, reconcile later
Performance       More overhead (locking, WAL)  Higher throughput
Scalability       Vertical (mostly)             Horizontal (naturally)
Examples          PostgreSQL, MySQL, Oracle      Cassandra, DynamoDB, CouchDB
Use When          Money, bookings, inventory    Social media, analytics, IoT

REAL EXAMPLES:
  ACID needed:
    ✓ Bank transfer (money must not vanish)
    ✓ Hotel booking (room must not be double-booked)
    ✓ E-commerce checkout (inventory must not oversell)
    ✓ Medical records (data integrity is life-critical)

  BASE acceptable:
    ✓ Twitter like count (off by a few for a second is fine)
    ✓ Netflix watch history (eventual sync across devices is okay)
    ✓ Instagram follower count (small temporary inconsistency is fine)
    ✓ YouTube view count (exact number not critical in real-time)
```

---

## PART 3 — Strong Consistency vs Eventual Consistency <a name="part-3"></a>

### The Spectrum

```
CONSISTENCY MODELS (from strongest to weakest):

  LINEARIZABILITY (Strongest)
  ─────────────────────────────────────────────────────────────────────
  Every operation appears to happen instantaneously at a single point.
  A read always reflects the latest write.
  All operations form a single global order.
  COST: Very high latency (must coordinate across all nodes).
  USE: etcd, Zookeeper, Google Spanner.

  SEQUENTIAL CONSISTENCY
  ─────────────────────────────────────────────────────────────────────
  All nodes see operations in THE SAME ORDER, but not necessarily
  the real-time order. Your operations appear in order, but global
  ordering may lag.
  USE: Less common in practice.

  CAUSAL CONSISTENCY
  ─────────────────────────────────────────────────────────────────────
  If event A CAUSED event B, everyone sees A before B.
  Unrelated events may be seen in any order.
  EXAMPLE: You reply to a comment — everyone sees the comment BEFORE
  the reply, even if from different servers.
  USE: DynamoDB with transactions, MongoDB with causally consistent sessions.

  READ-YOUR-WRITES CONSISTENCY
  ─────────────────────────────────────────────────────────────────────
  After you write, you will always see your OWN writes immediately.
  Others might see old data for a bit.
  EXAMPLE: You update your profile photo. You see the new photo instantly.
  Your friend might see the old one for a few seconds.
  USE: Very common practical guarantee. Facebook, Instagram use this.

  EVENTUAL CONSISTENCY (Weakest)
  ─────────────────────────────────────────────────────────────────────
  No timing guarantees. All replicas will converge... eventually.
  Can read stale data for seconds, minutes (rarely longer).
  USE: DNS, CDN caches, Cassandra, DynamoDB default.
```

### Real-World Scenario: Instagram Follower Count

```
SETUP: Instagram has 3 database replicas globally.
       User A (India) follows User B (USA).

TIME 0ms:   User A clicks "Follow" → write goes to Replica 1 (Mumbai).
             Replica 1: user_B.followers = 1,001,001

TIME 50ms:  Replica 1 starts replicating to Replica 2 (New York).
TIME 100ms: User C (London) queries Replica 3 (London):
             Replica 3: user_B.followers = 1,001,000   ← STALE (hasn't received update yet)
             User C sees the old count. EVENTUAL CONSISTENCY.

TIME 200ms: Replication completes across all replicas.
             All replicas: user_B.followers = 1,001,001
             User C now sees 1,001,001. CONVERGENCE ACHIEVED.

IS THIS OKAY? YES! No one cares if the follower count is off by 1 for 200ms.
The system is highly available (always responds), just eventually consistent.

CONTRAST: Bank transfer.
TIME 0ms:  Alice sends ₹10,000 to Bob.
           If banks were eventually consistent:
           Alice sees -₹10,000 immediately.
           Bob's bank might not see the +₹10,000 for 200ms.
           During that 200ms, Bob's bank shows old balance.
           If Bob tries to spend it, he might get rejected!
VERDICT:   NOT okay for financial transactions. MUST be strongly consistent.
```

---

## PART 4 — Read vs Write Performance <a name="part-4"></a>

### The Fundamental Tradeoff

```
You CANNOT optimize for reads and writes equally.
Every optimization for reads usually hurts writes, and vice versa.

READ OPTIMIZATION TECHNIQUES:
  1. Add Indexes         → Reads faster, writes slower (must update index too)
  2. Caching (Redis)     → Reads faster, writes must invalidate cache
  3. Read Replicas       → Reads can go to replicas, writes still go to primary
  4. Denormalization     → Reads simpler (no JOINs), writes complex (update many places)
  5. Materialized Views  → Reads precomputed, writes trigger view rebuild

WRITE OPTIMIZATION TECHNIQUES:
  1. Remove Indexes      → Writes faster, reads slower
  2. Write-Behind Cache  → Batch writes, occasional data loss risk
  3. Append-Only (LSM)   → Writes are sequential/fast, reads require merge (compaction)
  4. Partitioning        → Parallel writes, complex reads across partitions
  5. Eventual Consistency→ Writes propagate lazily, reads may be stale
```

### Read-Heavy vs Write-Heavy Systems

```
SYSTEM               READ/WRITE RATIO    STRATEGY
────────────────────────────────────────────────────────────────────────────
Wikipedia            99:1  (mostly reads) Aggressive caching, CDN, read replicas
                                          One write propagates to many cached copies

Google Search        95:5  (heavy reads)  Inverted index optimized for reads
                                          Index building (write-heavy) happens offline

Twitter Feed         80:20                Precomputed feeds (fanout on write)
                                          Each tweet written to each follower's feed
                                          Reading is a simple key lookup

Logging / Analytics  5:95  (heavy writes) Append-only, no updates, batch reads
                                          Column stores (Parquet, Cassandra)
                                          Write sequentially, read in bulk

IoT Sensors          2:98  (extreme write) Time-series DB (InfluxDB, TimescaleDB)
                                           Sequential write to disk, range read queries

Stock Trading        50:50 (balanced)      ACID + in-memory for speed
                                           Writes must be durable immediately
                                           Reads must be real-time (no caching)
```

### The Read Replica Pattern

```
PROBLEM: Your primary DB is overwhelmed. 80% of traffic is reads.

SOLUTION: Read Replicas

                    ┌─────────────────────┐
  WRITES ──────────►│   PRIMARY DB         │
                    │   (Single writer)    │
                    └──────────┬──────────┘
                               │ Asynchronous
                               │ Replication
              ┌────────────────┼─────────────────┐
              ▼                ▼                  ▼
  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
  │  READ REPLICA 1│ │  READ REPLICA 2│ │  READ REPLICA 3│
  │  (Read only)   │ │  (Read only)   │ │  (Read only)   │
  └────────────────┘ └────────────────┘ └────────────────┘
         ▲                  ▲                   ▲
  READS ──────────────────────────────────────────────────

TRADEOFF:
  ✓ 3x read throughput
  ✓ Primary DB can focus on writes
  ✗ Replication lag — replicas may be milliseconds behind primary
  ✗ Must route reads vs writes to different connections (application logic)
  ✗ If primary crashes, a replica must be promoted (brief downtime)

REPLICATION LAG EXAMPLE:
  User posts a comment → write goes to PRIMARY.
  User immediately refreshes the page → read goes to REPLICA.
  Replica is 50ms behind → user sees "no comments yet" for 50ms.
  FIX: Route the user's own reads to primary for a short window ("read-your-writes").
```

---

## PART 5 — Normalization vs Denormalization <a name="part-5"></a>

### Normalization — The "Pure" Approach

```
NORMALIZATION = Store each piece of data in EXACTLY ONE place.
No duplication. Related data is LINKED via foreign keys, joined at query time.

EXAMPLE: E-commerce database (normalized)

users table:               orders table:          products table:
┌────┬────────┬────────┐  ┌────┬─────────┬────┐  ┌────┬─────────┬───────┐
│ id │ name   │ city   │  │ id │ user_id │ dt │  │ id │ name    │ price │
├────┼────────┼────────┤  ├────┼─────────┼────┤  ├────┼─────────┼───────┤
│  1 │ Arihant│ Mumbai │  │ 10 │    1    │Jan │  │ 5  │ Laptop  │ 80000 │
│  2 │ Priya  │ Delhi  │  │ 11 │    2    │Jan │  │ 6  │ Phone   │ 50000 │
└────┴────────┴────────┘  └────┴─────────┴────┘  └────┴─────────┴───────┘

order_items table:
┌────┬──────────┬────────────┬──────────┐
│ id │ order_id │ product_id │ quantity │
├────┼──────────┼────────────┼──────────┤
│  1 │    10    │     5      │    1     │
│  2 │    10    │     6      │    2     │
└────┴──────────┴────────────┴──────────┘

QUERY: "Show Arihant's orders with product names and prices."
SELECT u.name, p.name, p.price, oi.quantity
FROM users u
JOIN orders o ON u.id = o.user_id
JOIN order_items oi ON o.id = oi.order_id
JOIN products p ON oi.product_id = p.id
WHERE u.id = 1;

PROS of Normalization:
  ✓ No data duplication → storage is minimal
  ✓ Update one place → all queries see it (if price changes, update products table only)
  ✓ Strong consistency of data
  ✓ Easier to maintain and reason about

CONS of Normalization:
  ✗ Complex queries with many JOINs
  ✗ JOINs are expensive at scale (billions of rows)
  ✗ Harder to shard (related data may be on different nodes)
```

### Denormalization — The "Performance" Approach

```
DENORMALIZATION = Store data REDUNDANTLY to avoid JOINs at read time.
Accept duplication to make reads faster.

EXAMPLE: Same data, denormalized into ONE flat table.

orders_flat table:
┌────┬──────────┬───────────┬──────────────┬────────────┬──────────┬──────────┐
│ id │ user_name│ user_city │ product_name │ unit_price │ quantity │ order_dt │
├────┼──────────┼───────────┼──────────────┼────────────┼──────────┼──────────┤
│  1 │ Arihant  │ Mumbai    │ Laptop       │ 80000      │    1     │ Jan 5    │
│  2 │ Arihant  │ Mumbai    │ Phone        │ 50000      │    2     │ Jan 5    │
│  3 │ Priya    │ Delhi     │ Phone        │ 50000      │    1     │ Jan 7    │
└────┴──────────┴───────────┴──────────────┴────────────┴──────────┴──────────┘

QUERY: "Show Arihant's orders with product names and prices."
SELECT * FROM orders_flat WHERE user_name = 'Arihant';
→ No JOINs! Instant result.

PROS of Denormalization:
  ✓ Fast reads — no JOINs required
  ✓ Simple queries (SELECT * WHERE ...)
  ✓ Works better with NoSQL databases (which often don't support JOINs)
  ✓ Easier to shard (self-contained rows)

CONS of Denormalization:
  ✗ Data duplication — "Mumbai" stored for every row of Arihant's orders
  ✗ UPDATE anomaly: If Arihant moves to Pune, you must update EVERY row
  ✗ More storage used
  ✗ Risk of inconsistency if updates are missed

THE UPDATE PROBLEM:
  If "Laptop" price changes from 80,000 to 85,000:
  Normalized:   UPDATE products SET price = 85000 WHERE id = 5;   ← 1 update
  Denormalized: UPDATE orders_flat SET unit_price = 85000
                WHERE product_name = 'Laptop';                     ← Many updates!
```

### When to Use Which

```
NORMALIZE WHEN:
  ✓ Data changes frequently (product prices, user profiles)
  ✓ Write-heavy workloads
  ✓ Strong consistency is required
  ✓ Using relational DB with complex queries
  ✓ Storage is expensive and duplication must be minimized

DENORMALIZE WHEN:
  ✓ Read-heavy workloads (analytics, dashboards, feeds)
  ✓ Data rarely changes (historical orders, event logs)
  ✓ Using NoSQL DB (Cassandra, MongoDB, DynamoDB)
  ✓ Performance is critical and JOINs are the bottleneck
  ✓ Building data warehouses (Redshift, BigQuery — fully denormalized)

HYBRID APPROACH (most real systems):
  Core transactional data → Normalized (PostgreSQL for orders, users)
  Analytics / reporting   → Denormalized (Redshift, BigQuery data warehouse)
  Caching layer           → Denormalized (Redis with pre-aggregated data)
  Search                  → Denormalized (Elasticsearch with full documents)

REAL EXAMPLE: Amazon
  Postgres (normalized): users, orders, inventory, payments — ACID, consistent
  DynamoDB (denormalized): product catalog reads — fast lookups by product_id
  Redshift (denormalized): analytics — daily sales by category, region reports
  ElasticSearch: product search — full document stored for fast search results
```

---

## PART 6 — Vertical Scaling vs Horizontal Scaling <a name="part-6"></a>

### The Core Difference

```
VERTICAL SCALING (Scale Up):
  Make ONE machine BIGGER.
  Add more CPU, RAM, faster SSD to the same server.

  Server (before): 4 CPU, 16GB RAM, 500GB SSD
  Server (after):  64 CPU, 512GB RAM, 10TB NVMe SSD

  ANALOGY: You're a driver with a small car.
           Vertical scaling = buy a bigger truck.
           One truck, carries more per trip.

HORIZONTAL SCALING (Scale Out):
  Add MORE machines. Distribute the load across many smaller servers.

  Before: 1 server
  After:  100 servers, each handling 1/100th of the traffic

  ANALOGY: Instead of a bigger truck → hire more drivers with regular cars.
           More cars, each carrying a normal load.

VISUAL:

VERTICAL:                      HORIZONTAL:
  ┌──────────────┐               ┌──────┐ ┌──────┐ ┌──────┐
  │              │               │  DB  │ │  DB  │ │  DB  │
  │  ████████    │               │  01  │ │  02  │ │  03  │
  │  ████████    │               └──────┘ └──────┘ └──────┘
  │  BIG SERVER  │
  │  64 cores    │               ┌──────┐ ┌──────┐ ┌──────┐
  │  512 GB RAM  │               │  DB  │ │  DB  │ │  DB  │
  │              │               │  04  │ │  05  │ │  06  │
  └──────────────┘               └──────┘ └──────┘ └──────┘
```

### Comparison in Depth

```
DIMENSION          VERTICAL SCALING          HORIZONTAL SCALING
────────────────────────────────────────────────────────────────────────────
Cost               Exponentially expensive   Linearly scales with commodity hardware
                   (top-end hardware costs   (cheap cloud instances)
                   10x-100x more per unit)

Limit              Hard ceiling              Virtually unlimited
                   (can't buy infinite RAM   (add more servers)
                   on one machine)

Downtime           YES — must restart        No downtime (add servers live)
                   server to upgrade

Complexity         LOW — same DB connection  HIGH — need load balancers,
                   string, no code changes   distributed coordination,
                                             data partitioning strategy

Failure            Single point of failure   Fault tolerant (some servers
                   (one server = one failure) can fail, others handle traffic)

Consistency        Easy — one DB, one truth  Hard — data spread across nodes,
                                             consistency protocols needed

Good for           Early stage, SQL DBs,     Large scale, stateless services,
                   when horizontal is hard   NoSQL systems, microservices

REAL COST EXAMPLE (AWS RDS PostgreSQL):
  db.t3.medium:   2 vCPU,  4 GB RAM  → ~$60/month
  db.r6g.4xlarge: 16 vCPU, 128 GB RAM → ~$1,100/month    ← 18x cost, 32x RAM
  db.r6g.16xlarge:64 vCPU, 512 GB RAM → ~$4,400/month    ← 73x cost, 128x RAM

  4 × db.t3.medium = 8 vCPU, 16 GB RAM combined → $240/month
  vs db.r6g.2xlarge: 8 vCPU, 64 GB RAM → $540/month

  Horizontal CAN be cheaper — but adds operational complexity.
```

### Scaling Strategy by Layer

```
APPLICATION LAYER (Web Servers, API Servers):
  → Always scale horizontally. Stateless — no shared state between instances.
  → Load balancer distributes traffic.
  → Easy: just add more instances. Auto-scaling handles this in cloud.

CACHE LAYER (Redis):
  → Vertical first (bigger Redis), then horizontal (Redis Cluster or partitioning).
  → Redis Cluster shards keys across nodes automatically.

DATABASE LAYER (The hard one):
  → Start vertical (simpler, no code changes).
  → When vertical limit hit → horizontal options:
     1. Read Replicas: horizontal for reads, vertical for write primary.
     2. Sharding: split data across multiple DB nodes by a shard key.
     3. Switch to distributed DB: Cassandra, DynamoDB, CockroachDB.

WHEN TO SWITCH FROM VERTICAL TO HORIZONTAL:
  Signal 1: You've hit the largest available instance size.
  Signal 2: Cost per unit performance is diminishing.
  Signal 3: A single failure causes full outage (need fault tolerance).
  Signal 4: You need geographic distribution (multi-region).
  Signal 5: Write throughput exceeds what one machine can handle.
```

---

## PART 7 — Replication Strategies <a name="part-7"></a>

### Single-Leader (Master-Slave) Replication

```
SETUP: One PRIMARY (leader) node handles all WRITES.
       One or more REPLICA (follower) nodes handle READS.
       Replicas continuously sync from primary.

                    ┌─────────────────────┐
  ALL WRITES ──────►│     PRIMARY         │
                    │ (Accepts writes)    │
                    └──────────┬──────────┘
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
             ┌─────────┐ ┌─────────┐ ┌─────────┐
             │REPLICA 1│ │REPLICA 2│ │REPLICA 3│
             │(Read)   │ │(Read)   │ │(Standby)│
             └─────────┘ └─────────┘ └─────────┘
  READS ────────────────────────────────────────────►

REPLICATION TYPES:

  SYNCHRONOUS REPLICATION:
    Primary waits for replica to confirm write before returning success.
    ✓ Zero data loss — replica always up to date.
    ✗ Slower writes (must wait for replica acknowledgment).
    ✗ If replica is slow or down, writes are blocked.
    USE: When data loss is unacceptable (financial transactions).

  ASYNCHRONOUS REPLICATION:
    Primary returns success immediately after local write.
    Replica syncs in the background.
    ✓ Fast writes — no waiting for replica.
    ✗ Replication lag — replica might be behind.
    ✗ If primary crashes before replica syncs → data loss!
    USE: Most social/consumer apps. Instagram, Twitter, Facebook.

FAILURE SCENARIOS:
  Primary crashes → Manual or automatic failover to a replica.
  Replica crashes → Remove from read pool, primary still serves writes.
  Replica lag → Reads from that replica return stale data.

REAL EXAMPLE: PostgreSQL + read replicas on AWS RDS.
  Primary: us-east-1 handles all writes.
  Replicas: us-east-1 (2x for read scaling) + us-west-2 (for DR).
  Failover: AWS RDS automatically promotes a replica in ~30-60 seconds.
```

### Multi-Leader Replication

```
SETUP: Multiple nodes can ACCEPT WRITES.
       All leaders sync with each other.

  ┌─────────────────┐          ┌─────────────────┐
  │  LEADER 1       │◄────────►│  LEADER 2       │
  │  (Mumbai DC)    │          │  (London DC)    │
  │  Writes + Reads │          │  Writes + Reads │
  └─────────────────┘          └─────────────────┘

USE CASE: Multi-region apps where you want writes to go to the nearest datacenter.

CONFLICT: What if two leaders get different writes for the same row simultaneously?
  Leader 1 (Mumbai): user.name = "Arihant"
  Leader 2 (London): user.name = "Ari"
  Both committed. Now what? → CONFLICT!

CONFLICT RESOLUTION STRATEGIES:
  Last Write Wins (LWW): Whoever has the latest timestamp wins.
    → Simple, but clocks can be wrong → may discard valid writes.

  Custom Merge: Application-defined merge logic.
    → Google Docs: merge text changes intelligently (operational transforms).

  Expose Conflict to User: Show both versions, let user choose.
    → Dropbox/Git does this for file conflicts.

REAL USE CASES:
  Google Docs       → Multi-leader for collaborative editing
  CouchDB           → Multi-leader, built-in conflict resolution
  Cassandra         → Multi-leader with LWW + vector clocks
  Git               → Multi-leader (everyone's repo is a "leader"), merge manually
```

### Leaderless Replication

```
NO single leader. ANY node can accept writes.
Client writes to N nodes directly. Reads from N nodes, takes latest.

  ┌─────────┐   ┌─────────┐   ┌─────────┐
  │ Node A  │   │ Node B  │   │ Node C  │
  │ Value:5 │   │ Value:5 │   │ Value:4 │ ← missed a write
  └─────────┘   └─────────┘   └─────────┘
       ▲               ▲
       │───── WRITE ───│     (2 out of 3 nodes confirmed write → QUORUM)
       │
       │ READ from 2 nodes → gets [5, 4]
       │ → Takes the latest (5) using timestamps or version vectors.

USED BY: Cassandra, DynamoDB, Riak, Voldemort (Amazon internal)
ADVANTAGE: No single point of failure. Any node down → still works.
DISADVANTAGE: Complex conflict resolution, consistency is harder to reason about.
```

---

## PART 8 — Sharding / Partitioning Strategies <a name="part-8"></a>

### What is Sharding?

```
SHARDING = Splitting your data across multiple database nodes.
Each node holds only a SUBSET of the data (a "shard" or "partition").

WITHOUT SHARDING:
  One DB node holds ALL data.
  Bottleneck: one machine's storage, CPU, RAM, network.

WITH SHARDING:
  Data is split. Each shard holds 1/N of the data.
  Queries for a given user go to exactly ONE shard.
  Parallel write throughput scales with number of shards.

  ┌─────────────┐
  │ User 1-1M   │  Shard 1 (DB server 1)
  └─────────────┘
  ┌─────────────┐
  │ User 1M-2M  │  Shard 2 (DB server 2)
  └─────────────┘
  ┌─────────────┐
  │ User 2M-3M  │  Shard 3 (DB server 3)
  └─────────────┘

SHARDING KEY: The field used to decide which shard a row goes to.
  Pick it carefully — it determines how evenly data and load are distributed.
```

### Sharding Strategies

```
STRATEGY 1: RANGE-BASED SHARDING
  Split by range of the shard key value.

  Shard 1: user_id  1       to  1,000,000
  Shard 2: user_id  1,000,001 to 2,000,000
  Shard 3: user_id  2,000,001 to 3,000,000

  PROS:
    ✓ Simple to implement and reason about.
    ✓ Range queries are efficient (scan one shard for a date range).

  CONS:
    ✗ HOT SHARD: New users cluster on the last shard.
      (Most writes go to the "latest range" shard → uneven load)
    ✗ Not good for time-series data (all new events go to one shard)

  GOOD FOR: Geographical data (by zip code), data that's accessed by range.

STRATEGY 2: HASH-BASED SHARDING
  Apply a hash function to the shard key → distribute evenly.

  shard_number = hash(user_id) % number_of_shards

  user_id=1:   hash(1) % 3 = 1  → Shard 1
  user_id=2:   hash(2) % 3 = 2  → Shard 2
  user_id=3:   hash(3) % 3 = 0  → Shard 0

  PROS:
    ✓ Even distribution of data across shards (no hot shards).
    ✓ Predictable: same key always goes to same shard.

  CONS:
    ✗ Range queries are terrible: "users created in January" spans ALL shards.
    ✗ Resharding is painful: adding a new shard changes hash(key) % N → massive data movement.

  GOOD FOR: User data, session data, anything accessed by exact key lookup.

STRATEGY 3: CONSISTENT HASHING
  Solves the resharding problem of hash-based sharding.

  Nodes and keys both placed on a virtual "hash ring."
  Key goes to the NEXT node clockwise on the ring.

  Adding a new node → only moves keys from ONE neighbor, not all.
  Removing a node → only moves keys to ONE neighbor.

  ┌─────────────────────────────────┐
  │         Hash Ring (0-360°)      │
  │                                 │
  │          Node A (90°)           │
  │        ●                        │
  │     key2●   ●key1               │
  │  Node D  ●                  ●  │
  │  (270°)   \               /    │
  │             ●           ●      │
  │              Node B (180°)     │
  └─────────────────────────────────┘

  USED BY: Amazon DynamoDB, Apache Cassandra, Memcached (ketama),
           Chord DHT, Nginx upstream hashing

STRATEGY 4: DIRECTORY-BASED SHARDING
  A lookup table maps each key (or key range) to a shard.
  Most flexible — shard assignment can be arbitrary.

  lookup table:
  user_id 1-100:     Shard 1
  user_id 101-200:   Shard 3  (was moved due to hot shard)
  user_id 201-300:   Shard 2

  PROS:  Completely flexible. Can rebalance any subset easily.
  CONS:  Lookup table is a single point of failure + bottleneck.
  USED BY: Pinterest's sharding system, some older MySQL setups.
```

### Cross-Shard Problems

```
THE HARD PARTS OF SHARDING:

1. CROSS-SHARD JOINS:
   "Find all users who placed orders over ₹10,000 in last 30 days."
   If users are on Shard 1,2,3 and orders are sharded separately → nightmare.
   FIX: Co-locate related data (shard users AND their orders on same shard).

2. CROSS-SHARD TRANSACTIONS:
   "Transfer money from User A (Shard 1) to User B (Shard 3)."
   Can't do a single ACID transaction across shards.
   FIX: Use 2-Phase Commit (2PC) — complex and slow.
        Or: redesign to avoid cross-shard transactions.

3. GLOBAL SECONDARY INDEXES:
   "Find all users in Mumbai."
   City is not the shard key → must scan ALL shards.
   FIX: Scatter-gather query (fan out to all shards, merge results).
        Or: maintain a separate global index shard.

4. REBALANCING (adding more shards):
   When a shard is hot, you want to split it.
   Moving data while serving traffic is dangerous.
   FIX: Consistent hashing minimizes data movement.
        Or: Double the shards (2→4→8) to reduce moves.

5. AUTO-INCREMENT IDs:
   Each shard generates auto-increment IDs independently → duplicates!
   FIX: Use UUIDs (globally unique).
        Or: Shard-prefixed IDs (Shard 1: 1000001, 1000002 … Shard 2: 2000001 …)
        Or: Twitter Snowflake IDs (64-bit, time+machine+sequence, globally unique).
```

---

## PART 9 — Indexing Tradeoffs <a name="part-9"></a>

### What is an Index?

```
INDEX = A separate data structure that maps field values to row locations.
        Allows the DB to find rows WITHOUT scanning every row in the table.

WITHOUT INDEX (Full Table Scan):
  "Find user with email = 'alice@example.com'"
  DB reads every row, checks every email → O(n) time.
  With 10 million rows → 10 million comparisons.

WITH INDEX (B-Tree Index on email):
  DB navigates B-Tree → O(log n) time.
  With 10 million rows → ~23 comparisons.

THE TRADEOFF:
  ✓ Reads are MUCH faster.
  ✗ Every INSERT, UPDATE, DELETE must also update the index → slower writes.
  ✗ Index takes additional disk space (often 10-30% of table size).
```

### Types of Indexes

```
B-TREE INDEX (Default in most SQL databases):
  Good for: =, <, >, BETWEEN, ORDER BY, range queries.
  How: Balanced tree. Sorted order maintained automatically.
  NOT good for: Wildcard prefix searches (LIKE '%word' — can't use B-Tree).

  CREATE INDEX idx_email ON users(email);
  SELECT * FROM users WHERE email = 'alice@example.com';  ← Uses B-Tree index

HASH INDEX:
  Good for: Exact match only (=). Faster than B-Tree for point lookups.
  NOT good for: Range queries (< > BETWEEN) — can't do those with hash.
  CREATE INDEX idx_session USING HASH ON sessions(session_id);

COMPOSITE INDEX (Multi-column):
  Index on multiple columns together.
  CREATE INDEX idx_user_date ON orders(user_id, created_at);
  ← Efficient for: WHERE user_id = 42 AND created_at > '2024-01-01'
  ← NOT efficient for: WHERE created_at > '2024-01-01' (without user_id)
  RULE: Use the LEFTMOST prefix of the composite index.

PARTIAL INDEX:
  Index only a subset of rows (where condition is true).
  CREATE INDEX idx_active_users ON users(email) WHERE status = 'active';
  ← Only indexes active users (smaller index, faster for active user queries)

FULL-TEXT INDEX:
  For searching within text content.
  CREATE INDEX idx_body ON posts USING GIN (to_tsvector('english', body));
  SELECT * FROM posts WHERE to_tsvector(body) @@ to_tsquery('database');
  ← Works for word searches inside large text fields.

COVERING INDEX:
  Index includes ALL columns needed by a query → no table access needed.
  CREATE INDEX idx_cover ON orders(user_id) INCLUDE (amount, status, created_at);
  SELECT amount, status FROM orders WHERE user_id = 42;
  → DB reads ONLY the index (no table lookup) → much faster.
  Called "index-only scan" in PostgreSQL.

CLUSTERED INDEX (SQL Server) / Primary Key (InnoDB MySQL):
  The table data is physically SORTED by this index.
  Only ONE clustered index per table (data can only be sorted one way).
  Efficient for range scans on the clustered key.
  InnoDB always clusters by PRIMARY KEY → use auto-increment PK for write performance.
```

### Index Design Rules

```
WHEN TO ADD AN INDEX:
  ✓ Column appears in WHERE clause frequently.
  ✓ Column used in JOIN conditions.
  ✓ Column used in ORDER BY or GROUP BY.
  ✓ Column has HIGH cardinality (many distinct values — good for email, user_id).
  ✗ Column has LOW cardinality (status with 3 values — index is not helpful,
     full scan is fine; planner may ignore the index anyway).

WHEN NOT TO ADD AN INDEX:
  ✗ Write-heavy tables (each write must update all indexes).
  ✗ Small tables (full scan is faster than index lookup overhead).
  ✗ Columns that are never queried directly.
  ✗ Columns with very low selectivity (boolean, status with few values).

INDEX COST EXAMPLE:
  Table: orders (100M rows, 5 indexes)
  INSERT new order:
    → Write to orders table.
    → Update index 1 (user_id).
    → Update index 2 (created_at).
    → Update index 3 (status).
    → Update index 4 (composite user_id+created_at).
    → Update index 5 (product_id).
  5× the index write overhead! Indexes make reads fast at the cost of write speed.

QUERY PLAN / EXPLAIN:
  Always use EXPLAIN ANALYZE to check if indexes are being used:
  EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 42 AND created_at > '2024-01-01';
  Look for: "Index Scan" (good) vs "Seq Scan" (full table scan — possibly needs index).
```

---

## PART 10 — Storage vs Performance <a name="part-10"></a>

### Storage Engines: B-Tree vs LSM Tree

```
TWO FUNDAMENTAL STORAGE ENGINES:

B-TREE (Used by: PostgreSQL, MySQL InnoDB, SQLite):
  Optimized for READS.
  Data stored in balanced tree, sorted order maintained.
  Updates done IN PLACE (find the page, modify it).

  READ:    Fast — tree navigation → O(log n)
  WRITE:   Moderate — must find and update the right page
           ("Write amplification": one logical write → multiple page writes)
  SPACE:   Some fragmentation (deleted rows leave gaps)
  GOOD FOR: Read-heavy, random access, point lookups, range queries.

LSM TREE — Log-Structured Merge Tree (Used by: Cassandra, RocksDB, LevelDB,
  HBase, InfluxDB):
  Optimized for WRITES.
  All writes go to an in-memory buffer (MemTable) first.
  Buffer periodically flushed to disk as immutable sorted files (SSTables).
  Reads must check multiple SSTables → use Bloom filters to skip.

  WRITE:   VERY fast — sequential write to memory, then sequential disk flush
  READ:    Slower — must merge multiple SSTables
  SPACE:   Periodic compaction (merging SSTables) → temporary extra space
  GOOD FOR: Write-heavy, time-series, event logging, IoT data.

VISUAL:
B-Tree:                          LSM Tree:
  WRITE → find page → modify       WRITE → MemTable (RAM)
                                            ↓ (when full, flush)
  READ  → tree traversal           Level 0 SSTable files
          → O(log n)               Level 1 SSTable files (compacted)
                                   Level 2 SSTable files (compacted)
                                   READ → check Bloom filter → read SSTables
```

### Compression Tradeoffs

```
STORAGE without compression:
  100M orders × 500 bytes average = 50 GB

STORAGE with compression (LZ4, Snappy, ZSTD):
  50 GB × 4:1 ratio = ~12.5 GB
  Cost: CPU time to compress on write, decompress on read.

COLUMN STORES (Parquet, Cassandra, Redshift):
  Store data by COLUMN, not by ROW.
  Same-type values compress EXTREMELY well together.
  status column: [active, active, active, active, inactive, active...]
  → Run-length encoding: {active: 4, inactive: 1, active: 1}
  → 10:1 compression ratio is common.

  GREAT for analytics:
  SELECT AVG(price) FROM orders  ← reads ONLY the price column.
  Row store: reads entire row for each row → wastes I/O.
  Column store: reads ONLY price values → 10-50x less I/O.

  TERRIBLE for OLTP:
  INSERT INTO orders VALUES (...)  ← must write to every column file.
  UPDATE orders SET status='shipped' WHERE id=42 ← random column update.

TIERED STORAGE:
  HOT  data: NVMe SSD — fast, expensive. Current month's data.
  WARM data: SATA SSD — medium. Last 6 months.
  COLD data: HDD / S3 Glacier — slow, cheap. Older archive data.

  Most databases and data platforms (BigQuery, Snowflake) do this automatically.
  Data "ages" from hot tier to cold tier based on access frequency.
```

---

## PART 11 — SQL vs NoSQL <a name="part-11"></a>

### When SQL Wins

```
USE SQL (PostgreSQL, MySQL, SQLite) WHEN:

  ✓ DATA HAS CLEAR RELATIONSHIPS:
    Users → Orders → Products → Reviews → Payments
    JOINs let you navigate relationships with a single query.

  ✓ YOU NEED ACID TRANSACTIONS:
    Financial systems, booking systems, inventory management.
    "BEGIN TRANSACTION; debit Alice; credit Bob; COMMIT;" — atomic, safe.

  ✓ COMPLEX QUERIES:
    "Find users in Mumbai who ordered more than 3 items last month,
     grouped by product category, sorted by total spend."
    SQL handles this naturally with GROUP BY, HAVING, ORDER BY.
    NoSQL would require application-level processing.

  ✓ SCHEMA IS STABLE AND KNOWN:
    Tables, columns, types defined upfront.
    Schema changes via migrations (ALTER TABLE).

  ✓ DATA INTEGRITY IS CRITICAL:
    Foreign key constraints prevent orphaned records.
    CHECK constraints enforce business rules at DB level.
    NOT NULL, UNIQUE ensure data quality.

  EXAMPLE SYSTEMS: Banking apps, e-commerce (orders, payments),
  HR systems, CRM, ERP, any system with complex relationships.
```

### When NoSQL Wins

```
USE NoSQL WHEN:

  DOCUMENT DB (MongoDB, CouchDB) WHEN:
  ✓ Data is hierarchical / nested (product with variable attributes)
  ✓ Schema varies per record (event logs with different fields)
  ✓ Object in code maps directly to stored document (no ORM impedance)

  KEY-VALUE (Redis, DynamoDB) WHEN:
  ✓ Simple lookup by primary key — no complex queries
  ✓ Extremely high throughput (millions of reads/writes per second)
  ✓ Session storage, caching, rate limiting counters
  ✓ Need sub-millisecond latency

  WIDE-COLUMN (Cassandra, HBase) WHEN:
  ✓ Time-series data (IoT sensors, event streams, log data)
  ✓ Write-heavy at massive scale (billions of writes/day)
  ✓ Access pattern is known and simple (no ad-hoc queries)
  ✓ Global distribution required (Cassandra's multi-DC replication)

  GRAPH DB (Neo4j, Amazon Neptune) WHEN:
  ✓ Data is fundamentally a graph (social networks, knowledge graphs)
  ✓ Queries are graph traversals (friends of friends, shortest path)
  ✓ Relationships are first-class citizens, not just foreign keys

NoSQL COSTS:
  ✗ No JOINs (must denormalize or do multiple queries)
  ✗ Limited or no transactions across multiple documents/rows
  ✗ Schema flexibility = less data integrity enforcement
  ✗ Query language is less expressive than SQL
  ✗ Harder to do ad-hoc analysis
```

### The SQL vs NoSQL Decision Tree

```
START
  │
  ├─ Do you need ACID transactions?
  │     YES → SQL (PostgreSQL, MySQL)
  │     NO ↓
  │
  ├─ Is your data a graph (relationships are the data)?
  │     YES → Graph DB (Neo4j, Neptune)
  │     NO ↓
  │
  ├─ Is it time-series (sensor readings, metrics, logs)?
  │     YES → Time-Series DB (InfluxDB, TimescaleDB) or Cassandra
  │     NO ↓
  │
  ├─ Do you need full-text search?
  │     YES → Elasticsearch / OpenSearch
  │     NO ↓
  │
  ├─ Is access pattern simple key lookup at extreme scale?
  │     YES → Key-Value (DynamoDB, Redis)
  │     NO ↓
  │
  ├─ Is data document-like with variable schema?
  │     YES → Document DB (MongoDB)
  │     NO ↓
  │
  └─ Data has relationships + complex queries?
        YES → SQL (PostgreSQL)
```

---

## PART 12 — Caching Strategies and Tradeoffs <a name="part-12"></a>

### Cache-Aside (Lazy Loading)

```
MOST COMMON PATTERN. Application manages the cache explicitly.

READ:
  App → Check cache (Redis) → Cache HIT? → Return data ✓
                             → Cache MISS? → Read from DB
                                           → Store in cache
                                           → Return data

WRITE:
  App → Write to DB → Invalidate (delete) the cache entry.
  Next read → cache miss → fetches fresh from DB → repopulates.

CODE FLOW:
  function getUser(userId):
    user = cache.get("user:" + userId)
    if user is null:
      user = db.query("SELECT * FROM users WHERE id = ?", userId)
      cache.set("user:" + userId, user, TTL=3600)  // 1 hour TTL
    return user

  function updateUser(userId, data):
    db.update("UPDATE users SET ... WHERE id = ?", userId, data)
    cache.delete("user:" + userId)  // Invalidate

PROS:  Only loads data that is actually requested (lazy).
       Cache failure doesn't break the system (falls back to DB).
CONS:  Cache miss is slow (DB + cache write penalty).
       Short window where cache is stale (after update, before invalidation).
       "Cache stampede": Many concurrent misses on same key → DB overload.
FIX for stampede: Lock the key while fetching. Only one request fetches from DB.
```

### Write-Through Cache

```
EVERY WRITE goes to cache AND DB synchronously.
Cache is always in sync with DB.

WRITE:
  App → Write to cache AND DB simultaneously → Confirm success.

READ:
  App → Check cache → Almost always HIT (cache always updated on write).

PROS:  Cache always consistent with DB. Low read latency always.
CONS:  Write latency is high (must write to both, wait for both).
       Cache fills with data that may never be read again.
USE WHEN: Read-heavy, consistency critical, write latency tolerable.
```

### Write-Behind (Write-Back) Cache

```
Writes go to CACHE ONLY initially. DB is updated asynchronously later.

WRITE:
  App → Write to cache → Return success immediately.
  Background process → Batch writes to DB every few seconds.

READ:
  App → Read from cache → Always fresh (just written there).

PROS:  Extremely fast writes (in-memory only). DB gets batched writes.
CONS:  DATA LOSS RISK — if cache crashes before flushing → writes lost.
       Complex: must handle flush failures, ordering, retries.
USE WHEN: Write-heavy, occasional data loss is acceptable.
EXAMPLE: Game leaderboards, analytics counters, view counts.
```

### Cache Eviction Policies

```
WHEN CACHE IS FULL, which entries to remove?

LRU (Least Recently Used):
  Remove the entry not accessed for the longest time.
  ASSUMPTION: If you haven't used it recently, you won't soon.
  BEST FOR: General-purpose caching. Redis default.

LFU (Least Frequently Used):
  Remove the entry with the fewest accesses total.
  BETTER THAN LRU when some items are popular long-term.
  EXAMPLE: Product catalog — popular products stay cached forever.

FIFO (First In, First Out):
  Remove the oldest entry regardless of access pattern.
  Simple but rarely optimal.

TTL (Time To Live):
  Entries expire after a fixed time, regardless of access.
  BEST FOR: Data that becomes stale after a known time window.
  EXAMPLE: Weather data (expire every 10 min), session tokens (expire in 1 hr).

RANDOM:
  Remove a random entry.
  Surprisingly effective in practice. Simple.

REDIS EVICTION POLICY SETTINGS:
  allkeys-lru:     LRU across all keys (use when cache-only Redis).
  volatile-lru:    LRU among keys with TTL set.
  allkeys-lfu:     LFU across all keys.
  volatile-ttl:    Remove key with shortest remaining TTL first.
  noeviction:      Reject writes when full → use for critical data stores.
```

### Cache Consistency Problems

```
THE CACHE INVALIDATION PROBLEM:
  "There are only two hard things in CS: cache invalidation and naming things."
  — Phil Karlton

PROBLEM 1 — STALE DATA:
  DB updated → cache not yet invalidated → read returns old data.
  SOLUTION: TTL-based expiry as a safety net. Explicit invalidation on write.

PROBLEM 2 — THUNDERING HERD (Cache Stampede):
  Popular cache key expires. 10,000 concurrent requests all miss cache.
  All 10,000 hit the DB simultaneously → DB overloaded → crash.
  SOLUTIONS:
    1. Probabilistic early expiration: Start refreshing the cache before TTL.
    2. Mutex/Lock: Only one request fetches from DB. Others wait for cache refill.
    3. Background refresh: A background job refreshes hot keys before expiry.

PROBLEM 3 — CACHE POISONING:
  Invalid or malicious data stored in cache. All reads return bad data.
  SOLUTIONS: Validate data before caching. Use cache namespacing.

PROBLEM 4 — HOT KEY:
  Single cache key receives millions of requests per second.
  Even Redis can be a bottleneck.
  SOLUTIONS: Local in-process cache (L1) + Redis (L2) + DB (L3).
             Shard the hot key across multiple Redis instances.
```

---

## PART 13 — Latency vs Throughput <a name="part-13"></a>

### The Core Definitions

```
LATENCY:    Time to complete ONE operation (how long does it take?).
            Measured in: milliseconds (ms), microseconds (μs), nanoseconds (ns).
            "This API call takes 20ms to return."

THROUGHPUT: Number of operations completed per unit time (how many per second?).
            Measured in: requests/second (RPS), transactions/second (TPS),
            MB/second, rows/second.
            "This DB handles 50,000 writes per second."

THEY ARE DIFFERENT:
  High throughput does NOT mean low latency.
  Low latency does NOT mean high throughput.

ANALOGY:
  LATENCY   = How long does it take one car to drive from Mumbai to Pune? (3 hours)
  THROUGHPUT = How many cars can the highway handle per hour? (2000 cars/hour)

  A narrow road with 2 lanes → each car takes 3 hours (low latency) but
  only 100 cars/hour (low throughput).

  A highway → each car still takes 3 hours (same latency), but
  2000 cars/hour can use it (high throughput).
```

### Latency Numbers Every Engineer Should Know

```
OPERATION                          LATENCY
──────────────────────────────────────────────────────────────────────────
L1 cache read                      0.5 ns
L2 cache read                      7 ns
L3 cache read                      20 ns
RAM access (main memory)           100 ns
SSD random read (NVMe)             100-200 μs    (100,000 ns)
SSD random read (SATA)             500 μs - 1 ms
HDD random read (spinning disk)    10 ms
Redis GET (same data center)       0.1 - 1 ms
PostgreSQL simple query (indexed)  1 - 10 ms
PostgreSQL complex query (JOIN)    10 - 100 ms
Network round trip (same DC)       0.5 - 1 ms
Network round trip (cross-US)      40 - 80 ms
Network round trip (US to India)   150 - 250 ms

KEY INSIGHT:
  SSD is 100x slower than RAM.
  HDD is 10x slower than SSD.
  Cross-continent network adds 150ms minimum.

DESIGN IMPLICATION:
  Computation in RAM → microseconds.
  DB query (SSD) → milliseconds.
  Cross-DC call → 50-250ms.
  Every external call in a user request adds latency.
  Keep hot data in memory (Redis). Minimize cross-DC calls in critical paths.
```

### Latency vs Throughput Tradeoff

```
BATCH vs STREAMING:
  STREAMING: Process each item as it arrives → Low latency, lower throughput.
  BATCH:     Accumulate many items, process all at once → Higher latency, higher throughput.

  EXAMPLE: Logging to database.
  Streaming: INSERT per log line → 1,000 writes/sec max (overhead per INSERT).
  Batch:     Accumulate 1,000 logs → bulk INSERT → 100,000 writes/sec throughput.
             But logs are delayed by up to 1 second (latency increase).

SYNC vs ASYNC:
  SYNCHRONOUS: Client waits for operation to complete → Low latency, limited throughput.
  ASYNCHRONOUS: Client gets "queued" acknowledgment → Higher latency for result, but
                higher throughput (server can queue and process many concurrently).

  EXAMPLE: Sending email.
  Sync:  POST /send-email → Wait for SMTP → 2 second response time to client.
         If SMTP is slow → user waits → 1 request at a time.
  Async: POST /send-email → Queue job → 50ms response ("queued!").
         Background worker → SMTP → Email delivered.
         Client doesn't wait. Thousands of emails queued concurrently.

PARALLELISM: Improve throughput without increasing per-operation latency.
  Read from 4 DB shards in parallel → each shard query: 10ms.
  All 4 results in 10ms (parallel) vs 40ms (sequential).
  Throughput: 4x, Latency: same (for the slowest shard).
```

---

## PART 14 — The Master Tradeoff Table <a name="part-14"></a>

```
TRADEOFF                OPTION A                      OPTION B
────────────────────────────────────────────────────────────────────────────────
CAP: Partition happens  CP: Refuse requests            AP: Serve stale data
                        Stay consistent                Stay available
                        Use: Banking, bookings         Use: Social feeds, DNS

ACID vs BASE            ACID: Correct, slower          BASE: Fast, scalable
                        Use: Money, inventory          Use: Analytics, social

Consistency             Strong: All reads current      Eventual: Reads may lag
                        Use: Financial, medical        Use: Like counts, views

Read vs Write           Optimize reads                 Optimize writes
                        → Add indexes, read replicas   → Remove indexes, LSM tree
                        → Denormalize, cache           → Async writes, partitioning

Schema                  Normalized: No duplication     Denormalized: Duplicated data
                        Easier to update               Faster to read

Scaling                 Vertical: Bigger machine       Horizontal: More machines
                        Simple, limited ceiling        Complex, unlimited scale

Replication             Single-leader: Simple          Multi-leader: Write anywhere
                        One write source of truth      Conflict resolution needed

Storage Engine          B-Tree: Fast reads             LSM Tree: Fast writes
                        (PostgreSQL, MySQL)             (Cassandra, RocksDB)

SQL vs NoSQL            SQL: Relations, ACID, flexible NoSQL: Scale, speed, flexible
                        queries                        schema (but no JOINs)

Caching                 Cache-aside: Lazy, resilient   Write-through: Always consistent
                        Simple, stale window           Higher write latency

Latency vs Throughput   Low latency: Sync, streaming   High throughput: Async, batching
                        Slower total ops/sec           Higher total ops/sec

Indexes                 More indexes: Faster reads     Fewer indexes: Faster writes
                        Slower writes, more storage    Less storage, slower reads

Consistency Level       Quorum: Balanced               ONE: Fastest, least consistent
(Cassandra)             (QUORUM+QUORUM = strong)       ALL: Consistent, blocks on failure
```

---

## PART 15 — How to Answer in System Design Interviews

```
WHEN ASKED ABOUT DATABASE CHOICE OR TRADEOFFS, USE THIS FRAMEWORK:

STEP 1 — CLARIFY THE REQUIREMENTS:
  "Is this read-heavy or write-heavy?"
  "What are the consistency requirements — is eventual consistency okay?"
  "What scale are we designing for? 1M users or 1B users?"
  "Are there transactional requirements — do operations need to be atomic?"

STEP 2 — STATE THE TRADEOFF EXPLICITLY:
  "I'll use PostgreSQL for the orders table because we need ACID transactions
   for payment processing. Eventual consistency is not acceptable here."

  "For the user activity feed, I'll use Cassandra because it's write-heavy
   (millions of events/day), eventual consistency is fine, and we need to
   scale writes horizontally."

STEP 3 — EXPLAIN THE CONSEQUENCES:
  "The tradeoff of using Cassandra is no JOINs — so I'll denormalize
   the data and store user info alongside each event. This means more storage
   but much faster reads, which is acceptable for a feed."

STEP 4 — ACKNOWLEDGE WHAT YOU'RE GIVING UP:
  Never say "X is the best choice with no downsides."
  Always say: "X is better for this use case, and the tradeoff is Y,
   which is acceptable because Z."

COMMON PHRASES THAT IMPRESS INTERVIEWERS:
  "I'd use the CAP theorem here — since we need partition tolerance
   (always assumed), the question is C vs A. For this feature, availability
   wins, so I'd pick an AP system."

  "I'd use eventual consistency here — the user counts being off by 1
   for 100ms is a better tradeoff than slowing down every write."

  "I'd start with vertical scaling for simplicity, and add horizontal
   scaling when we hit 10M users. The code complexity of sharding isn't
   worth it at early scale."

  "This is write-heavy, so I'd pick LSM-tree storage (RocksDB/Cassandra)
   over B-tree to avoid write amplification."
```

---

> **Final Mental Model:**
> Every tradeoff in system design follows the same pattern:
> You gain something on one axis, you pay for it on another axis.
> The job of a system designer is not to eliminate tradeoffs —
> it's to pick the tradeoffs that match the constraints of your specific problem.
> Know the tradeoffs deeply, and you can design any system.
