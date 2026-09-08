# How OpenAI Handles 800 Million ChatGPT Users on a Single PostgreSQL Primary

---

## Table of Contents

1. [Overview](#overview)
2. [The Architecture: Single Primary + 50 Read Replicas](#architecture)
3. [How PostgreSQL Replication Works](#replication)
4. [MVCC: The Double-Edged Sword](#mvcc)
5. [Write Amplification Problem](#write-amplification)
6. [Cascading Failures](#cascading-failures)
7. [Vertical Scaling Strategy](#vertical-scaling)
8. [Application-Level Optimizations](#application-optimizations)
   - [Fixing Redundant Writes](#redundant-writes)
   - [Implementing Lazy Writes](#lazy-writes)
   - [Strict Rate Limiting](#rate-limiting)
   - [Moving Joins to Application Layer](#application-joins)
9. [Transitioning to Sharded Databases](#sharding)
10. [High Availability: Hot Standbys](#hot-standbys)
11. [Workload Isolation](#workload-isolation)
12. [Connection Pooling with PgBouncer](#pgbouncer)
13. [Putting It All Together: The Full Picture](#full-picture)
14. [Lessons Learned and Best Practices](#lessons-learned)

---

## Overview

OpenAI's ChatGPT serves **800 million users**, making it one of the most trafficked AI applications in the world. At the heart of this scale sits **PostgreSQL**, a battle-tested open-source relational database. Rather than immediately jumping to exotic distributed systems, OpenAI chose to push PostgreSQL to its limits — a pragmatic engineering decision that offers deep lessons for anyone building at scale.

The core challenge: **relational databases were not designed for planetary-scale workloads**. Yet OpenAI made it work, through a combination of architectural patterns, intelligent trade-offs, and ruthless optimization.

```
800 Million Users
       │
       ▼
┌─────────────────────────────────────────────────────┐
│              Load Balancers / API Layer              │
└─────────────────────────────────────────────────────┘
       │                          │
       ▼ Writes (small %)         ▼ Reads (large %)
┌──────────────┐        ┌─────────────────────────────┐
│   PRIMARY    │───────▶│   50 READ REPLICAS          │
│  PostgreSQL  │        │  (Stream Replication)        │
└──────────────┘        └─────────────────────────────┘
```

---

## Architecture

### Single Primary + 50 Read Replicas

OpenAI's initial and core PostgreSQL setup follows the **single-primary, multiple-replica** pattern:

| Component         | Role                                          | Count       |
|-------------------|-----------------------------------------------|-------------|
| Primary Node      | Accepts all writes, serves some reads         | 1           |
| Read Replicas     | Serve read queries, reduce primary load       | ~50         |
| Hot Standbys      | Ready to promote to primary in case of failure| 1-2         |
| PgBouncer Pools   | Connection pooling layer                      | Per service |

**Why this works:**
- ChatGPT workloads are **read-heavy**. Users read conversation history far more than they write new messages.
- A single primary keeps **data consistency simple** — no distributed transactions, no split-brain scenarios.
- 50 replicas can serve an enormous volume of read traffic in parallel.

**Traffic distribution:**
```
Incoming Traffic
      │
      ├──── ~90% READS ──────▶ Distributed across 50 replicas
      │                         (each replica handles ~1/50 of read load)
      │
      └──── ~10% WRITES ─────▶ Single Primary
                                (must handle ALL writes)
```

**The fundamental constraint:** No matter how many replicas you add, **all writes go through one machine**. This is the core bottleneck that shapes everything OpenAI does.

---

## How PostgreSQL Replication Works

Understanding replication is critical to understanding OpenAI's architecture.

### Streaming Replication (Physical Replication)

PostgreSQL uses **Write-Ahead Logging (WAL)** as the foundation for replication:

```
PRIMARY NODE
┌─────────────────────────────────────────────┐
│  Client writes data                          │
│         │                                    │
│         ▼                                    │
│  WAL (Write-Ahead Log) — binary log of       │
│  every change made to the database           │
│         │                                    │
│         ▼                                    │
│  Data actually written to disk               │
└─────────────────────────────────────────────┘
         │
         │  WAL stream (binary, byte-for-byte)
         │
         ▼
READ REPLICAS (each one)
┌─────────────────────────────────────────────┐
│  WAL receiver process accepts the stream     │
│         │                                    │
│         ▼                                    │
│  Replay WAL on replica's disk               │
│  (replica becomes an exact byte copy)        │
│         │                                    │
│         ▼                                    │
│  Serve read queries from this copy           │
└─────────────────────────────────────────────┘
```

### Replication Lag

Replicas are not perfectly in sync. There is a **replication lag** — the time between a write on primary and it being visible on replicas.

```
Primary:  WRITE at T=0ms ──────────────────────────────▶
Replica:  ───────────────── LAG (10-100ms) ──▶ VISIBLE at T=50ms
```

**Implication for OpenAI:** After a user sends a message (write), if they immediately read their conversation, the application must route that read to the **primary** or wait for the replica to catch up. Ignoring lag leads to users seeing stale or missing data.

---

## MVCC: The Double-Edged Sword

**MVCC (Multi-Version Concurrency Control)** is PostgreSQL's mechanism for allowing multiple transactions to read and write simultaneously without locking each other out.

### How MVCC Works

Instead of locking rows, PostgreSQL keeps **multiple versions** of each row:

```
Row "user_session" evolution:

Version 1: {session_id: 123, last_seen: "10:00"} [created by txn 1001, deleted by txn 1005]
Version 2: {session_id: 123, last_seen: "10:05"} [created by txn 1005, deleted by txn 1009]
Version 3: {session_id: 123, last_seen: "10:10"} [created by txn 1009, currently active]
```

Each transaction sees the version that was **current at the moment the transaction started**. This is called a **snapshot**.

### The Problem: Dead Tuples

When a row is updated or deleted, old versions are **not immediately removed**. They become **dead tuples** (also called dead rows or bloat).

```
Frequent update: user_session.last_seen (updated every few minutes)

After 1 hour of updates for 1 million active users:
- Live tuples:  1,000,000 rows
- Dead tuples:  ~20,000,000 rows (dead versions piling up)
```

**VACUUM** is PostgreSQL's process that cleans dead tuples. But at OpenAI's scale:
- VACUUM cannot keep up with write rates
- Dead tuple bloat grows continuously
- **Table bloat** causes slower sequential scans, larger indexes, more I/O
- This creates a compounding performance problem over time

### Why MVCC Amplifies Writes

Every UPDATE in PostgreSQL is actually:
1. **Mark old row as dead** (write)
2. **Insert new row** (write)

A single logical update = 2 physical writes. At 800 million users with frequent session/state updates, this doubles the write I/O.

```
Application says: UPDATE user_sessions SET last_seen = NOW() WHERE user_id = X

PostgreSQL does:
  [1] Write: Mark old row (xmax = current_txn_id)   ← extra write
  [2] Write: Insert new row with updated value       ← the actual update
  [3] WAL: Log both operations                       ← replicated to 50 replicas
```

---

## Write Amplification Problem

Write amplification is when **one logical write becomes multiple physical writes**. For OpenAI, this manifests at multiple layers:

### Layer 1: MVCC (as described above)
1 UPDATE → 2 physical row operations

### Layer 2: WAL Logging
Every write is also logged to WAL:
1 UPDATE → 2 row operations + WAL entries for both

### Layer 3: Replication
WAL is streamed to 50 replicas:
1 UPDATE → applied on primary + replayed on 50 replicas

### Layer 4: Index Maintenance
Every updated row must update all relevant indexes:
1 UPDATE on a row with 3 indexes → 3 index updates (times all the above)

```
1 logical UPDATE
        │
        ├─ 2 heap operations (MVCC)
        ├─ 2 WAL records
        ├─ Replicated to 50 replicas (×50)
        └─ 3 index updates × 2 (old + new) = 6 index writes
        
Total physical I/O: potentially 50-100x the logical write
```

**The real-world impact:** OpenAI was generating enormous I/O pressure on both the primary and all replicas from what seemed like simple application-level operations.

---

## Cascading Failures

With 50 replicas depending on a single primary WAL stream, failures can cascade dramatically.

### Scenario 1: Replica Falls Behind

```
Normal:
Primary ──WAL──▶ Replica (lag: 50ms) ✓

Under spike load:
Primary ──WAL──▶ Replica (lag: 5000ms, growing) ⚠️
                          │
                          ▼
            Replica removed from read pool
                          │
                          ▼
            Remaining replicas absorb its traffic
                          │
                          ▼
            Remaining replicas now overloaded
                          │
                          ▼
            More replicas fall behind → more removed
                          │
                          ▼
            All load falls to primary ← SINGLE POINT OF DEATH
```

### Scenario 2: Primary Overload → Read Replica Failure Loop

```
[Spike in writes] 
      → Primary CPU/IO saturated
      → WAL generation slows
      → Replicas lag
      → Replicas removed from read pool
      → Read traffic hits primary (which is already overloaded)
      → Primary further slows
      → More replicas lag
      → DEATH SPIRAL
```

### Scenario 3: Long-Running Transactions Block VACUUM

```
Transaction starts at T=0 (sees snapshot S1)
VACUUM runs at T=60s — wants to clean dead tuples
But: cannot clean anything newer than snapshot S1
Long transaction still open at T=300s
Result: 5 minutes of dead tuple accumulation cannot be cleaned
Table bloat: explodes
Query performance: degrades
```

OpenAI had to engineer around all three failure modes.

---

## Vertical Scaling Strategy

Before architectural changes, the first line of defense is **vertical scaling** — making individual machines bigger and faster.

### What Vertical Scaling Means

```
Before:                          After:
┌─────────────────┐              ┌─────────────────────────────┐
│ Primary Node    │              │ Primary Node (Upgraded)     │
│ 32 vCPU         │    ──────▶   │ 128 vCPU                    │
│ 256 GB RAM      │              │ 2 TB RAM                    │
│ 10 TB NVMe SSD  │              │ 100 TB NVMe SSD (RAID)      │
└─────────────────┘              └─────────────────────────────┘
```

### Why RAM Matters Most for PostgreSQL

PostgreSQL uses **shared_buffers** (RAM cache for database pages). When data fits in RAM:
- Reads are served from memory (nanoseconds)
- Disk I/O is avoided

```
PostgreSQL Memory Layout:

┌─────────────────────────────────────┐
│           RAM (2TB)                 │
│  ┌──────────────────────────────┐   │
│  │  shared_buffers (500 GB)     │   │  ← PostgreSQL's own cache
│  │  (hot table pages live here) │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │  OS Page Cache (remaining)   │   │  ← OS caches I/O here too
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
         │ Cache Miss
         ▼
    NVMe SSD (fast, but still 100x slower than RAM)
```

### Limits of Vertical Scaling

| Factor           | Problem                                                        |
|------------------|----------------------------------------------------------------|
| Cost             | The largest cloud instances are exponentially expensive         |
| Write throughput | CPU/IO of one machine has a hard ceiling                       |
| MVCC bloat       | More RAM helps, but dead tuples still accumulate               |
| Failover time    | Larger machines take longer to failover and recover            |

Vertical scaling buys time. It is not a final solution.

---

## Application-Level Optimizations

This is where OpenAI made the most impactful changes. Rather than fighting the database, they changed what the application sent to the database.

### Fixing Redundant Writes

**Problem:** Application code was issuing writes that didn't actually change data.

```python
# BEFORE — Bad pattern
def update_user_session(user_id, session_data):
    # Always writes, even if nothing changed
    db.execute("""
        UPDATE user_sessions 
        SET last_seen = %s, metadata = %s 
        WHERE user_id = %s
    """, (now(), session_data, user_id))

# At 800M users × frequent polling = millions of pointless UPDATEs/second
```

**Root causes of redundant writes:**
- ORM frameworks (SQLAlchemy, ActiveRecord) that always issue UPDATE for any fetched object, even if no fields changed
- Polling loops that write heartbeats unconditionally
- Event handlers that write state even when state hasn't changed
- Copy-paste code paths that write "just in case"

**Solution: Dirty checking before writing**

```python
# AFTER — Check before write
def update_user_session(user_id, session_data):
    current = db.fetchone("""
        SELECT last_seen, metadata FROM user_sessions WHERE user_id = %s
    """, (user_id,))
    
    # Only write if something actually changed
    if current['metadata'] != session_data:
        db.execute("""
            UPDATE user_sessions 
            SET last_seen = %s, metadata = %s 
            WHERE user_id = %s
        """, (now(), session_data, user_id))

# Eliminates majority of writes for stable sessions
```

**At scale impact:**
```
Before: 10M writes/minute (mostly redundant)
After:  1M writes/minute  (only real changes)

Primary I/O reduction: ~90%
WAL generation reduction: ~90%
Replica replay load reduction: ~90%
```

---

### Implementing Lazy Writes

**Problem:** Not every write needs to be immediately durable. Some data can be buffered and written periodically.

**Lazy writes** (also called deferred writes or write coalescing) batches multiple updates and flushes them periodically.

```
EAGER WRITE (before):

User active at T=0:  WRITE {last_seen: T+0}
User active at T=5:  WRITE {last_seen: T+5}
User active at T=10: WRITE {last_seen: T+10}
User active at T=15: WRITE {last_seen: T+15}
                                              ← 4 writes to database

LAZY WRITE (after):

User active at T=0:  cache.set(user_id, T+0)   ← in-memory only
User active at T=5:  cache.set(user_id, T+5)   ← in-memory only
User active at T=10: cache.set(user_id, T+10)  ← in-memory only
User active at T=15: cache.set(user_id, T+15)  ← in-memory only
...flush every 60 seconds...
At T=60:             WRITE {last_seen: T+60}   ← 1 write to database
```

**Implementation with Redis as write buffer:**

```
Application
    │
    ▼
Redis (In-memory write buffer)
    │  last_seen[user_123] = T+60
    │  last_seen[user_456] = T+45
    │  last_seen[user_789] = T+30
    │
    │  Background job flushes every 60s
    ▼
PostgreSQL Primary
    │  UPDATE user_sessions SET last_seen = ...
    │  (Batched: one round-trip for thousands of users)
    ▼
WAL → 50 Replicas
```

**What can and cannot be lazily written:**

| Data Type              | Lazy Write? | Reason                                           |
|------------------------|-------------|--------------------------------------------------|
| last_seen / heartbeat  | YES         | Approximate value, losing a few seconds is fine  |
| Session metadata       | YES         | Can tolerate minor staleness                     |
| Message content        | NO          | Must be durable immediately                      |
| Payment/billing data   | NO          | Requires strict durability                       |
| User authentication    | NO          | Security-critical                                |

---

### Strict Rate Limiting

**Problem:** Without rate limits, a single abusive client (or a bug) can flood the primary with writes, impacting all users.

Rate limiting operates at multiple layers:

#### Layer 1: API Rate Limiting (per user)
```
User A: 100 API calls/minute → allowed
User B: 10,000 API calls/minute → throttled at API gateway

Tools: NGINX rate limiting, API gateway (Kong, AWS API GW)
```

#### Layer 2: Database Write Rate Limiting (per service)
```
Each microservice has a write budget:

Service: conversation_saver
  - Max writes/second: 5,000
  - Current: 4,800 → OK
  - If exceeds: writes queued, then shed

Service: session_updater
  - Max writes/second: 2,000  
  - Current: 2,100 → THROTTLE
  - Excess writes: dropped (last_seen can be approximate)
```

#### Layer 3: PgBouncer Connection Limits (see PgBouncer section)

**Circuit breaker pattern:**
```
Normal:   Application → DB → Success
Degraded: Application → DB → Slow (>500ms)
                           → Circuit OPENS
Open:     Application → Returns cached/default response (DB not hit)
                       (Protects DB from thundering herd)
Half-open: After 30s, allow 1 request through → if success, close circuit
```

---

### Moving Joins to Application Layer

**Problem:** Complex JOIN queries are expensive on the database. At scale, they consume enormous CPU on the primary.

**The classic approach — let the DB do joins:**

```sql
-- This runs entirely on the PostgreSQL primary
SELECT 
    c.id,
    c.title,
    m.content,
    m.created_at,
    u.display_name,
    u.avatar_url
FROM conversations c
JOIN messages m ON m.conversation_id = c.id
JOIN users u ON u.id = c.user_id
WHERE c.user_id = 12345
ORDER BY m.created_at DESC
LIMIT 50;
```

**Problems with DB-side joins at scale:**
- Joins require loading multiple tables into memory simultaneously
- Sort operations (ORDER BY) require temporary disk space
- Complex query plans consume significant CPU
- Every user's request causes this heavy query to run on the primary

**OpenAI's solution — application-side joins:**

```python
# Step 1: Simple query for conversations (can hit replica)
conversations = db_replica.fetchall("""
    SELECT id, title, user_id 
    FROM conversations 
    WHERE user_id = %s
    ORDER BY updated_at DESC 
    LIMIT 20
""", (user_id,))

conversation_ids = [c['id'] for c in conversations]

# Step 2: Simple query for messages (can hit replica, uses index)
messages = db_replica.fetchall("""
    SELECT conversation_id, content, created_at
    FROM messages
    WHERE conversation_id = ANY(%s)
    ORDER BY created_at DESC
""", (conversation_ids,))

# Step 3: Fetch user profile (likely cached in Redis)
user = redis_cache.get(f"user:{user_id}") or db_replica.fetchone(
    "SELECT display_name, avatar_url FROM users WHERE id = %s", (user_id,)
)

# Step 4: Join in Python
messages_by_conv = defaultdict(list)
for msg in messages:
    messages_by_conv[msg['conversation_id']].append(msg)

result = [
    {**conv, 'messages': messages_by_conv[conv['id']], 'user': user}
    for conv in conversations
]
```

**Benefits of application-side joins:**

| Aspect                | DB Join                        | Application Join                    |
|-----------------------|--------------------------------|-------------------------------------|
| Database CPU          | High (join algorithms)         | Low (simple index lookups)          |
| Cachability           | Hard (complex query key)       | Easy (cache each table separately)  |
| Replica usage         | Single query to one node       | Sub-queries distributed across replicas |
| Flexibility           | Schema-bound                   | Can merge data from Redis, APIs     |
| Debugging             | Query plan analysis needed     | Standard code debugging             |

**Trade-offs:**
- More round-trips to the database (partially offset by parallelism)
- Application code becomes more complex
- Risk of N+1 query problems if not careful (always use `WHERE id IN (...)` not loops)

---

## Transitioning to Sharded Databases

For **new workloads**, OpenAI moved to **sharding** — splitting data horizontally across multiple independent PostgreSQL instances.

### What is Sharding?

```
WITHOUT SHARDING (single primary):

All 800M users → Single PostgreSQL Primary
                 (write bottleneck)

WITH SHARDING:

Users 0-200M   → Primary Shard 1 (+ its replicas)
Users 200-400M → Primary Shard 2 (+ its replicas)
Users 400-600M → Primary Shard 3 (+ its replicas)
Users 600-800M → Primary Shard 4 (+ its replicas)
```

### Sharding Strategy: Hash-Based

```python
def get_shard(user_id: int, num_shards: int = 4) -> int:
    return user_id % num_shards

# user_id 12345 → shard 1
# user_id 12346 → shard 2
# user_id 12347 → shard 3
# user_id 12348 → shard 0
```

**Consistent hashing** is preferred for production (allows adding shards without remapping all data):
```
Hash ring with virtual nodes:

         Shard A
       /          \
Shard D            Shard B
       \          /
         Shard C

Adding Shard E: only ~20% of keys need to move
(vs. simple modulo: 80% of keys move when adding 1 shard)
```

### The Sharding Problem: Cross-Shard Queries

```
"Get all conversations for user 12345" → Easy (single shard)

"Get the 10 most recent messages across all conversations" 
→ Messages may be on different shards
→ Must query all shards and merge results
→ Expensive!
```

OpenAI's approach:
- **Shard by user_id**: All data for one user lives on one shard
- This makes per-user queries fast (single shard)
- Avoids cross-shard joins for most workloads
- Analytics/aggregations handled separately (e.g., data warehouse)

### Sharding: What Changes

```
Application Layer (before sharding):

connection = get_db_connection()
result = connection.execute(query)

Application Layer (after sharding):

shard_id = get_shard(user_id)
connection = get_db_connection(shard=shard_id)
result = connection.execute(query)
```

**Sharding is applied to new workloads first:**
- Migrating existing data to shards is risky and complex
- New features (new tables, new services) are built on sharded architecture
- Existing monolithic PostgreSQL is maintained and optimized (as described in other sections)

---

## High Availability: Hot Standbys

A single primary is a single point of failure. OpenAI uses **hot standbys** to ensure rapid failover.

### Hot Standby vs. Cold Standby

```
COLD STANDBY:
Primary fails → Restore from backup → Takes 30-60 minutes
                                      (unacceptable for ChatGPT)

HOT STANDBY:
Primary fails → Promote standby → Takes 30-60 seconds
                (already has all data, just needs promotion)
```

### How Hot Standby Works

```
Normal operation:

Primary ──WAL stream──▶ Hot Standby (read-only, real-time sync)
   │
   └──WAL stream──▶ Read Replicas (50 nodes)

Failure:

Primary ✗

Automatic detection (Patroni / pg_auto_failover):
  - Monitors primary heartbeat
  - Detects failure in 5-10 seconds
  - Elects hot standby as new primary
  - Reconfigures all replicas to stream from new primary
  - Updates connection pool (PgBouncer) to point to new primary
  - Total downtime: 30-60 seconds
```

### Patroni: The High-Availability Layer

OpenAI likely uses **Patroni** (or a similar tool) to manage failover:

```
┌─────────────────────────────────────────────────────┐
│                    etcd cluster                      │
│         (distributed lock / leader election)         │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
     Patroni       Patroni      Patroni
    (Primary)    (Standby 1)  (Standby 2)
          │
          ▼
    PostgreSQL         PostgreSQL   PostgreSQL
    (Primary)          (Standby)    (Standby)
```

**Patroni responsibilities:**
- Monitor primary health (heartbeat every 2s)
- Acquire/release leader lock in etcd
- Trigger failover when leader lock is lost
- Promote standby (pg_ctl promote)
- Update DCS (distributed configuration store)
- Signal PgBouncer to reconnect to new primary

### Failover Timeline

```
T=0s:   Primary crashes (hardware failure, OOM, etc.)
T=2s:   Patroni agents detect missed heartbeat
T=10s:  Leader lock expires in etcd
T=12s:  Standby acquires leader lock, begins promotion
T=15s:  pg_ctl promote runs on standby
T=20s:  Standby accepting writes as new primary
T=25s:  PgBouncer reconfigured to point to new primary
T=30s:  Application connections resume
T=35s:  Old replicas reconfigure to stream from new primary

Total downtime: ~30-35 seconds
```

---

## Workload Isolation

Not all workloads are equal. ChatGPT has multiple distinct use cases that compete for database resources.

### Workload Types at OpenAI

| Workload                  | Characteristics                  | Priority  |
|---------------------------|----------------------------------|-----------|
| Conversation reads        | High frequency, latency-sensitive| Critical  |
| Message saves             | Write-heavy, must be durable     | Critical  |
| User session management   | Very high frequency, can be lazy | High      |
| Search / history          | Expensive, user-initiated        | Medium    |
| Analytics / reporting     | Very expensive, background       | Low       |
| Admin queries             | Irregular, potentially huge      | Very Low  |

### Isolating Workloads

**Strategy 1: Dedicated replica pools**

```
All 50 Replicas split into pools:

Pool A (20 replicas): Conversation reads — latency optimized
Pool B (15 replicas): Search queries — throughput optimized  
Pool C (10 replicas): Analytics — allowed to run slow queries
Pool D (5 replicas):  Internal/admin — completely isolated
```

**Strategy 2: Separate database clusters**

```
ChatGPT Conversations DB ─ Primary + Replicas (50 nodes)
User Profiles DB          ─ Primary + Replicas (10 nodes)
Billing DB                ─ Primary + Replicas (5 nodes)  
Analytics DB              ─ Read-only replica + data warehouse
```

**Strategy 3: Query timeouts and resource groups**

```sql
-- Analytics queries get a timeout — they cannot hog resources
SET statement_timeout = '30s';

-- Production queries must be fast
SET statement_timeout = '2s';

-- Background maintenance
SET statement_timeout = '300s';
```

**Strategy 4: Separate connection pools (PgBouncer instances)**

```
Production traffic  → PgBouncer A → Primary
Analytics traffic   → PgBouncer B → Analytics Replica
Admin traffic       → PgBouncer C → Admin Replica (with auth)
```

This ensures a slow analytics query cannot starve production connections.

---

## Connection Pooling with PgBouncer

PostgreSQL has a fundamental limitation: **each connection is a process**. Creating and maintaining thousands of connections is expensive.

### The Connection Problem

```
Without pooling:

800M users → Thousands of concurrent connections
             │
             ▼
Each PostgreSQL connection:
  - Forks a new OS process (~5-10MB memory)
  - 10,000 connections = 50-100GB RAM just for connections
  - Context switching overhead destroys performance
  - PostgreSQL cannot handle >10,000 connections efficiently
```

### How PgBouncer Works

PgBouncer sits between the application and PostgreSQL, multiplexing many application connections onto a smaller pool of real database connections.

```
Application Layer (thousands of connections)

[App server 1: 200 connections]──┐
[App server 2: 200 connections]──┤
[App server 3: 200 connections]──┤  PgBouncer
[App server 4: 200 connections]──┤  (connection pool)
[App server N: 200 connections]──┘
                                  │
                   Maps to         │
                                  ▼
                         PostgreSQL Primary
                         [50-200 real connections]
```

### PgBouncer Pooling Modes

**Session Pooling:**
```
One real DB connection assigned per client session
Client connects → gets DB connection
Client disconnects → DB connection returned to pool
(Least multiplexing, highest compatibility)
```

**Transaction Pooling (OpenAI's choice):**
```
One real DB connection per active transaction
Client connects: no DB connection yet
Client starts transaction: assigned DB connection
Transaction commits/rollbacks: connection returned to pool
(High multiplexing, requires stateless connections)
```

**Statement Pooling:**
```
One real DB connection per individual statement
(Maximum multiplexing, many features incompatible)
```

### PgBouncer in Practice

```ini
# pgbouncer.ini (simplified)

[databases]
chatgpt_primary = host=primary-db.internal port=5432 dbname=chatgpt
chatgpt_replica = host=replica-lb.internal port=5432 dbname=chatgpt

[pgbouncer]
pool_mode = transaction
max_client_conn = 50000       # Up to 50k application connections
default_pool_size = 100       # 100 real connections to PostgreSQL
min_pool_size = 20            # Keep 20 connections warm always
reserve_pool_size = 10        # Emergency reserve
server_idle_timeout = 600     # Recycle idle DB connections after 10 min
```

**Result:**
```
50,000 application connections
        │  (PgBouncer multiplexes)
        ▼
100 real PostgreSQL connections

Memory saved: ~49,900 × 10MB = ~490 GB RAM on PostgreSQL server
```

### PgBouncer and Failover

During a primary failover, PgBouncer pauses connections and reconnects to the new primary:

```
T=0s:   Primary fails
T=30s:  New primary elected
T=31s:  PgBouncer target updated (via Patroni callback or Consul)
T=32s:  PgBouncer drops connections to old primary
T=33s:  PgBouncer establishes connections to new primary
T=34s:  Queued application transactions replayed on new primary
T=35s:  Traffic resumes
```

---

## Putting It All Together: The Full Picture

Here is the complete architecture that allows OpenAI to serve 800 million users on PostgreSQL:

```
┌──────────────────────────────────────────────────────────────────────┐
│                         800 Million Users                            │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│              API Gateway / Load Balancer                             │
│         (Rate limiting: per-user and per-service)                    │
└───────────────────┬──────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  Application Servers (stateless)                     │
│   - Application-side joins (no complex DB joins)                     │
│   - Dirty checking (no redundant writes)                             │
│   - Lazy write buffering (Redis for non-critical updates)            │
│   - Circuit breakers (protect DB from overload)                      │
└───────┬──────────────────────────────────────────────────────────────┘
        │                              │
        │ Writes                       │ Reads
        ▼                              ▼
┌───────────────┐             ┌────────────────────┐
│  PgBouncer    │             │   PgBouncer        │
│  (Write Pool) │             │   (Read Pool)      │
│  100 real     │             │   200 real conns   │
│  connections  │             │   per replica pool │
└───────┬───────┘             └──────────┬─────────┘
        │                               │
        ▼                               ▼
┌───────────────────┐         ┌──────────────────────────────────────┐
│  PRIMARY (1 node) │──WAL──▶ │  50 READ REPLICAS                   │
│  Vertically large │         │  (Split into pools by workload type) │
│  (2TB RAM, fast   │         │  Pool A: Conversations (20 nodes)    │
│   NVMe, 128 vCPU) │         │  Pool B: Search (15 nodes)          │
└───────┬───────────┘         │  Pool C: Analytics (10 nodes)       │
        │                     │  Pool D: Admin/Internal (5 nodes)   │
        │ WAL                 └──────────────────────────────────────┘
        ▼
┌───────────────────┐
│  HOT STANDBY      │
│  (Patroni-managed)│
│  Ready in 30s     │
└───────────────────┘

        │  New workloads
        ▼
┌──────────────────────────────────────────────┐
│  SHARDED POSTGRES (for new features)         │
│  Shard 1: Users 0-200M  (Primary + Replicas) │
│  Shard 2: Users 200-400M                     │
│  Shard 3: Users 400-600M                     │
│  Shard 4: Users 600-800M                     │
└──────────────────────────────────────────────┘
```

### Request Flow: Reading a Conversation

```
1. User opens ChatGPT
2. API Gateway checks rate limits
3. App server receives request
4. App checks Redis cache for recent conversations (cache hit → return immediately)
5. Cache miss: App queries replica pool via PgBouncer
   - Simple SELECT on conversations table (indexed by user_id)
   - Simple SELECT on messages table (indexed by conversation_id)
   - Joins done in application code
6. Result returned to user
7. Redis cache updated for next request

Total DB operations: 2 simple indexed queries to replicas (never hits primary)
```

### Request Flow: Sending a Message

```
1. User sends message
2. API Gateway rate-limits (max N messages/minute per user)
3. App server receives write request
4. Dirty check: is this a duplicate? (rare but possible on retry)
5. Write to PostgreSQL primary via PgBouncer
   - INSERT into messages table (durable, cannot be lazy)
   - UPDATE conversation.updated_at (could be lazy, but kept synchronous for UX)
6. WAL replicated to 50 replicas asynchronously
7. Redis cache invalidated / updated
8. Response returned to user

Total DB operations: 1-2 writes to primary only
```

---

## Lessons Learned and Best Practices

### 1. Optimize the application before the database
The most impactful changes OpenAI made were in application code — dirty checks, lazy writes, application-side joins. Database optimizations come after.

### 2. Read/write ratio is everything
Understanding that 90% of traffic is reads, and routing reads to replicas, is the single biggest lever for PostgreSQL scalability.

### 3. MVCC is powerful but has costs
Every UPDATE generates dead tuples. At high write rates, this becomes a serious operational concern. Reducing write frequency and amplitude is critical.

### 4. Write amplification compounds
One logical write → multiple physical writes → multiplied across 50 replicas. Every optimization to write patterns has multiplicative effect.

### 5. Connection pooling is not optional at scale
PostgreSQL's process-per-connection model breaks down at thousands of connections. PgBouncer in transaction mode is essential infrastructure, not optional.

### 6. Hot standbys, not cold backups
For a service like ChatGPT, 30-second failover (hot standby) vs. 30-minute failover (cold restore) is the difference between an incident and a catastrophe.

### 7. Workload isolation prevents cascading failures
Analytics queries that run for 60 seconds can destroy production latency if they share connections and replicas. Separate pools, separate replicas, separate clusters.

### 8. Sharding is for new workloads
Migrating an existing 800-million-user database to shards is extraordinarily risky. Build new features on sharded architecture, and maintain/optimize the existing system.

### 9. Rate limiting at every layer
API gateway, per-service write budgets, connection pool limits, and query timeouts — each layer catches what the previous layer missed.

### 10. Measure before optimizing
OpenAI's optimizations were data-driven. They identified that redundant writes were a real problem (with metrics), then fixed them. Premature optimization would have wasted effort.

---

## Summary: The Optimization Hierarchy

```
Level 1: Architecture
  └── Single Primary + 50 Read Replicas
  └── Workload isolation (dedicated replica pools)
  └── Hot standby for HA (Patroni)

Level 2: Infrastructure  
  └── Vertical scaling (2TB RAM primary)
  └── PgBouncer connection pooling
  └── NVMe SSDs for fast I/O

Level 3: Application Logic
  └── Route reads to replicas
  └── Eliminate redundant writes (dirty checking)
  └── Lazy writes for non-critical data (Redis buffer)
  └── Application-side joins (not DB-side)
  └── Rate limiting at every layer

Level 4: New Architecture for New Workloads
  └── Horizontal sharding (consistent hashing by user_id)
  └── Each shard is independent primary + replicas
```

The key insight: **You can scale PostgreSQL to enormous sizes without abandoning it, if you understand its internals deeply and build your application to work with its strengths rather than against its limitations.**

---

*This document covers the architecture, techniques, and trade-offs involved in OpenAI's PostgreSQL scaling strategy as described in engineering discussions about ChatGPT's infrastructure.*

---

## PostgreSQL vs MySQL: Differences, Strengths, and When to Use Which

Both PostgreSQL and MySQL are open-source relational databases. They share a lot of surface-level similarity (SQL, tables, indexes, ACID transactions) but diverge significantly under the hood.

---

### Side-by-Side Comparison

| Feature                        | PostgreSQL                                      | MySQL                                                |
|--------------------------------|-------------------------------------------------|------------------------------------------------------|
| **Full name**                  | PostgreSQL (or "Postgres")                      | MySQL                                                |
| **First released**             | 1996                                            | 1995                                                 |
| **Backed by**                  | Community (PostgreSQL Global Dev Group)         | Oracle Corporation                                   |
| **License**                    | PostgreSQL License (very permissive)            | GPL v2 (open) + commercial (Oracle)                  |
| **ACID compliance**            | Full, always                                    | Depends on storage engine (InnoDB: yes, MyISAM: no)  |
| **Default storage engine**     | Single unified engine                           | InnoDB (default), MyISAM, others                     |
| **Concurrency model**          | MVCC (always)                                   | MVCC (InnoDB only)                                   |
| **Replication**                | Streaming (WAL-based), logical                  | Binary log (binlog), GTID-based, Group Replication   |
| **JSON support**               | Native JSONB (binary JSON, indexable)           | JSON column type (less powerful)                     |
| **Full-text search**           | Built-in, powerful                              | Basic full-text (MyISAM/InnoDB), limited             |
| **Extensibility**              | Very high (custom types, functions, extensions) | Low                                                  |
| **Foreign keys**               | Enforced by default                             | Enforced only with InnoDB                            |
| **Stored procedures**          | PL/pgSQL, PL/Python, PL/Perl, etc.             | SQL/PSM only (less powerful)                         |
| **Window functions**           | Full support                                    | Full support (MySQL 8+)                              |
| **CTEs (WITH clause)**         | Full support, materialized or inline            | Supported (MySQL 8+)                                 |
| **Partial indexes**            | Yes                                             | No                                                   |
| **Expression indexes**         | Yes                                             | No (MySQL 8.0.13+: functional indexes, limited)      |
| **Table inheritance**          | Yes (native)                                    | No                                                   |
| **Geospatial (GIS)**           | PostGIS extension (industry standard)           | Basic spatial support                                |
| **Horizontal scaling**         | Manual sharding, Citus extension                | MySQL Cluster, Vitess (YouTube/PlanetScale)           |
| **Community ecosystem**        | Strong (enterprise-focused)                     | Very large (especially web dev)                      |
| **Hosting / cloud support**    | AWS RDS/Aurora, GCP Cloud SQL, Azure            | AWS RDS/Aurora MySQL, GCP Cloud SQL, PlanetScale      |
| **Performance (reads)**        | Excellent                                       | Excellent (often slightly faster for simple queries) |
| **Performance (writes)**       | Excellent (MVCC cost at high concurrency)       | Excellent (InnoDB optimized for high write throughput)|
| **Case sensitivity (default)** | Case-sensitive for identifiers and data         | Case-insensitive for string comparisons by default   |

---

### Architecture Differences (Under the Hood)

#### Storage Engine

```
PostgreSQL:                        MySQL:

One unified storage engine         Pluggable storage engines
(Heap + TOAST for large values)    ┌─────────────┬──────────┬───────────┐
                                   │   InnoDB    │ MyISAM   │  Memory   │
                                   │  (default,  │(no ACID, │(in-memory │
                                   │   ACID)     │ fast read│  tables)  │
                                   └─────────────┴──────────┴───────────┘
```

**Implication:** In PostgreSQL, every feature (ACID, foreign keys, MVCC) is always available. In MySQL, you must ensure you're using InnoDB; MyISAM silently drops transactions and foreign key enforcement.

---

#### MVCC Implementation (Multi-Version Concurrency Control)

Both databases use MVCC, but implement it differently:

```
PostgreSQL MVCC:
- Old row versions stored IN THE TABLE (heap)
- Dead tuples pile up and need VACUUM to clean
- VACUUM is a real operational concern at scale
- No undo log

MySQL (InnoDB) MVCC:
- Old row versions stored in a separate UNDO LOG
- Old versions auto-purge as transactions commit
- Less "bloat" concern in the main table
- Undo log can grow large under long transactions
```

**Implication:** MySQL's undo-log approach means less operational overhead for VACUUM-style maintenance. PostgreSQL's approach means the table always has the latest data inline (better for reads), but dead tuples require active management.

---

#### Write-Ahead Log vs Binary Log

```
PostgreSQL — WAL (Write-Ahead Log):
  - Physical log: records actual byte changes to pages
  - Used for crash recovery AND replication
  - Replicas are exact byte-for-byte copies (physical replication)
  - Also supports logical replication (row-level changes)

MySQL — Binary Log (binlog):
  - Logical log: records SQL statements or row images
  - Separate from the InnoDB redo log (crash recovery)
  - Binlog is used for replication
  - GTID (Global Transaction ID) makes replica management easier
  - Supports multi-source replication (replicate from multiple primaries)
```

**Implication:** MySQL's binlog-based replication is more flexible for certain topologies (like multi-source). PostgreSQL's WAL-based replication is simpler and has lower overhead.

---

#### Query Planner

```
PostgreSQL:
  - Very sophisticated query planner
  - Uses statistics from pg_statistic (ANALYZE)
  - Supports parallel query execution (multiple CPUs per query)
  - Handles complex queries (subqueries, CTEs, window functions) very well
  - Partial indexes and expression indexes help the planner dramatically

MySQL:
  - Simpler query planner (improving in MySQL 8+)
  - Historically weak at complex JOIN optimization
  - No partial indexes (expression indexes added in 8.0.13 with limits)
  - Better for simple, high-volume OLTP queries
```

---

### Feature Deep Dives: Where PostgreSQL Wins

#### 1. Native JSONB

```sql
-- PostgreSQL: JSONB is binary, compressed, and indexable
CREATE TABLE events (
    id SERIAL,
    payload JSONB
);

-- Create a GIN index on any key in the JSON
CREATE INDEX idx_events_payload ON events USING GIN (payload);

-- Query deeply nested JSON efficiently
SELECT * FROM events
WHERE payload @> '{"user": {"plan": "pro"}}';  -- Uses GIN index

-- Extract and index a specific key
CREATE INDEX idx_user_id ON events ((payload->>'user_id'));
```

```sql
-- MySQL: JSON support is weaker
CREATE TABLE events (
    id INT AUTO_INCREMENT,
    payload JSON  -- stored as text, limited indexing
);

-- Can only index via generated (virtual) columns — more verbose
ALTER TABLE events ADD COLUMN user_id VARCHAR(50)
    GENERATED ALWAYS AS (payload->>'$.user_id') STORED;
CREATE INDEX idx_user_id ON events (user_id);
```

**Winner:** PostgreSQL, significantly.

---

#### 2. Partial Indexes

```sql
-- PostgreSQL: index only the rows you care about
CREATE INDEX idx_active_users ON users (email)
    WHERE status = 'active';

-- This index is tiny (only active users) and very fast
-- MySQL: cannot do this — indexes all rows
```

---

#### 3. Advanced Data Types

```sql
-- PostgreSQL has native types MySQL doesn't
CREATE TABLE network_data (
    id SERIAL,
    ip_addr    INET,           -- IP address type (supports CIDR queries)
    ip_range   CIDR,           -- Network range
    tags       TEXT[],         -- Native arrays
    schedule   TSRANGE,        -- Time range (overlapping queries built-in)
    location   GEOMETRY(Point) -- via PostGIS extension
);

-- Query: find all IPs in a subnet
SELECT * FROM network_data WHERE ip_addr << '192.168.1.0/24';

-- Query: find overlapping time ranges
SELECT * FROM network_data WHERE schedule && '[2024-01-01, 2024-12-31]';
```

MySQL lacks arrays, range types, and native IP types.

---

#### 4. PostGIS (Geospatial)

```sql
-- PostgreSQL + PostGIS: industry standard for geospatial
CREATE TABLE locations (
    id SERIAL,
    name TEXT,
    geom GEOMETRY(Point, 4326)  -- WGS84 coordinate system
);

-- Find all locations within 5km of a point
SELECT name FROM locations
WHERE ST_DWithin(
    geom::geography,
    ST_MakePoint(-73.935242, 40.730610)::geography,
    5000  -- meters
);
```

If your application needs serious geospatial queries, PostgreSQL + PostGIS is the only serious option in the open-source world.

---

### Feature Deep Dives: Where MySQL Wins

#### 1. Simpler Operations and Wider Ecosystem

MySQL is the "M" in the **LAMP stack** (Linux, Apache, MySQL, PHP). It has:
- Decades of tutorials, StackOverflow answers, and ORMs targeting it
- Near-universal hosting support (every shared host supports MySQL)
- Simpler default configuration that works well out of the box

---

#### 2. MySQL Replication Flexibility

```
MySQL supports topologies PostgreSQL does not natively:

Multi-source replication:
Primary A ──▶ Replica (combines both primaries)
Primary B ──▶

Circular replication (with GTID):
Primary A ──▶ Primary B ──▶ Primary A
(both can accept writes, with conflict detection)

Semi-synchronous replication:
Primary waits for at least 1 replica to acknowledge
before confirming write to client
(stronger durability guarantee than async)
```

---

#### 3. Vitess: MySQL's Horizontal Scaling Answer

**Vitess** (open-source, created by YouTube, used by PlanetScale) is a sharding and connection pooling layer built specifically for MySQL:

```
Application
    │
    ▼
Vitess (vtgate — query router)
    │
    ├──▶ MySQL Shard 1 (keyrange 0x00 - 0x40)
    ├──▶ MySQL Shard 2 (keyrange 0x40 - 0x80)
    ├──▶ MySQL Shard 3 (keyrange 0x80 - 0xC0)
    └──▶ MySQL Shard 4 (keyrange 0xC0 - 0xFF)
```

Vitess handles:
- Query routing to correct shard
- Cross-shard scatter queries
- Connection pooling (better than PgBouncer in some ways)
- Online schema migrations
- Resharding without downtime

**Implication:** If you need sharded MySQL, Vitess is a mature, production-proven solution. PostgreSQL's equivalent (Citus) is also strong but less widely deployed.

---

#### 4. InnoDB's Write Performance

For **pure high-throughput OLTP writes** (think: logging, event ingestion, e-commerce order processing), MySQL/InnoDB is often benchmarked as slightly faster than PostgreSQL due to:
- More optimized InnoDB buffer pool management
- Less overhead from MVCC dead tuple accumulation
- Historically more tuning done for write-heavy workloads

---

### When to Use PostgreSQL

Choose PostgreSQL when:

```
✅ Complex queries
   - Multi-table joins, subqueries, CTEs, window functions
   - You need the query planner to be smart

✅ Complex data types
   - JSON/JSONB documents with deep querying
   - Arrays, range types, custom types
   - IP addresses, geometric shapes

✅ Geospatial data
   - PostGIS is the gold standard
   - Location-based services, mapping applications

✅ Data integrity is paramount
   - Foreign keys always enforced
   - Full ACID always guaranteed
   - Partial indexes for complex constraints

✅ Advanced analytics
   - Complex aggregations, time-series, window functions
   - Better for hybrid OLTP + analytics workloads (HTAP)

✅ Extensions and customization
   - TimescaleDB (time-series on top of Postgres)
   - Citus (distributed Postgres)
   - pgvector (vector similarity search — used for AI embeddings)
   - PostGIS (geospatial)

✅ Compliance and auditability
   - Row-level security (built-in)
   - Fine-grained access control

✅ AI / ML workloads
   - pgvector extension for storing and querying embeddings
   - OpenAI itself uses Postgres for this reason
```

**Examples of companies/products using PostgreSQL:**
- OpenAI (ChatGPT)
- Instagram
- Notion
- Shopify
- Reddit
- Apple
- Heroku

---

### When to Use MySQL

Choose MySQL when:

```
✅ Simple, high-volume OLTP
   - E-commerce (orders, products, users)
   - Read-heavy CMS (WordPress, Drupal use MySQL)
   - Standard CRUD apps with straightforward queries

✅ You need Vitess for sharding
   - Vitess is more mature than Citus for horizontal scaling
   - If you know you'll need millions of QPS with sharding

✅ Wide hosting compatibility
   - Shared hosting environments
   - Legacy systems where MySQL is already standard

✅ Team familiarity
   - If your team has deep MySQL expertise

✅ WordPress / Drupal / Magento
   - These are built specifically for MySQL

✅ Simple replication topologies
   - Multi-source replication
   - Semi-sync replication out of the box
```

**Examples of companies/products using MySQL:**
- Facebook (with custom MySQL + MyRocks)
- Twitter (with MySQL)
- YouTube (with Vitess on MySQL)
- Wikipedia
- Airbnb
- Uber (historically, now migrating)
- WordPress.com

---

### Decision Framework: Choosing Between Them

```
START HERE
    │
    ▼
Do you need geospatial queries?
    ├── YES ──▶ PostgreSQL + PostGIS (no contest)
    └── NO  ──▶ Continue
    │
    ▼
Do you need JSONB querying / document-like features?
    ├── YES ──▶ PostgreSQL (JSONB is significantly better)
    └── NO  ──▶ Continue
    │
    ▼
Do you need pgvector for AI embeddings?
    ├── YES ──▶ PostgreSQL (only option)
    └── NO  ──▶ Continue
    │
    ▼
Is your workload complex analytics / reporting?
    ├── YES ──▶ PostgreSQL (better planner, window functions, CTEs)
    └── NO  ──▶ Continue
    │
    ▼
Do you need Vitess-style horizontal MySQL sharding?
    ├── YES ──▶ MySQL + Vitess
    └── NO  ──▶ Continue
    │
    ▼
Is your app WordPress / Drupal / Magento?
    ├── YES ──▶ MySQL (built for it)
    └── NO  ──▶ Continue
    │
    ▼
Is your team deeply experienced in one?
    ├── YES ──▶ Use what your team knows
    └── NO  ──▶ Default to PostgreSQL
                (more features, stricter by default, better long-term)
```

---

### PostgreSQL vs MySQL: Quick Reference Card

| Use Case                                  | Winner       | Reason                                          |
|-------------------------------------------|--------------|-------------------------------------------------|
| AI / vector embeddings (pgvector)         | PostgreSQL   | pgvector is Postgres-only                       |
| Geospatial / mapping apps                 | PostgreSQL   | PostGIS is unmatched                            |
| Document store / JSONB queries            | PostgreSQL   | JSONB is far more powerful                      |
| Complex analytics on relational data      | PostgreSQL   | Better query planner, window functions          |
| Simple CRUD / LAMP stack                  | MySQL        | Simpler, massive ecosystem                      |
| WordPress / Drupal / Magento              | MySQL        | Built specifically for MySQL                    |
| Sharded architecture at massive scale     | MySQL+Vitess | Vitess is more mature than Citus                |
| Multi-source replication                  | MySQL        | Native support; Postgres needs extensions       |
| Strict data integrity / compliance        | PostgreSQL   | Always-enforced foreign keys, row-level security|
| Time-series data                          | PostgreSQL   | TimescaleDB extension is excellent              |
| High-write OLTP (pure throughput)         | Tie          | Both are excellent; MySQL slightly faster cold  |
| Existing team expertise                   | Either       | Go with what your team knows best               |

---

### The Modern Reality (2024+)

The line between PostgreSQL and MySQL has blurred significantly:
- MySQL 8.0 added CTEs, window functions, and better JSON support
- Both support ACID fully (with InnoDB for MySQL)
- Cloud providers (AWS Aurora, GCP Cloud SQL) offer managed versions of both with similar SLAs

**The current industry trend leans toward PostgreSQL** for new greenfield projects because:
1. The AI/ML boom (pgvector) makes Postgres the default for any app with embeddings
2. PostgreSQL's extensibility means you rarely hit a ceiling
3. Stricter defaults (foreign keys always on, no silent data truncation) prevent bugs
4. The gap in ease-of-use has largely closed

**MySQL remains dominant** in:
- Legacy codebases already using MySQL
- Shops using Vitess for horizontal scaling
- The WordPress/PHP ecosystem

---

*Both are excellent databases. The "right" choice depends on your specific workload, team expertise, and ecosystem needs — not on marketing or benchmarks.*
