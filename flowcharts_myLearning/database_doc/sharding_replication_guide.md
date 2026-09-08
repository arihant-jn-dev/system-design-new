# Sharding & Replication — Complete Guide
## What They Are, Why You Need Both, and the Best Architecture

> **One-line summary:**
> Sharding = split data across machines (handles MORE DATA and MORE WRITES)
> Replication = copy data to multiple machines (handles FAILURES and MORE READS)
> Best architecture = BOTH together — each shard is itself a replica set.

---

## PART 0 — Partitioning vs Sharding (The Foundation)

> Most people use these words interchangeably. They are NOT the same.
> Understanding the difference is the foundation for everything else in this doc.

### The Simple Distinction

```
PARTITIONING = Dividing data into smaller pieces.
               General concept. Can happen on ONE machine or MANY machines.

SHARDING     = Partitioning data across MULTIPLE MACHINES (nodes).
               Always distributed. Always involves a network.

RELATIONSHIP:
  All sharding IS partitioning.
  NOT all partitioning IS sharding.

  Partitioning ──────────────────────────────────────────────┐
  │                                                          │
  │  On ONE machine:              On MULTIPLE machines:      │
  │    Partition table A          Shard 1 (Machine 1)        │
  │    Partition table B   VS     Shard 2 (Machine 2)   ← SHARDING
  │    Partition table C          Shard 3 (Machine 3)        │
  │    (same DB, same server)     (distributed)              │
  └──────────────────────────────────────────────────────────┘
```

### The 3 Types of Partitioning (Know All Three)

```
TYPE 1: HORIZONTAL PARTITIONING (Row-based split)
────────────────────────────────────────────────────────────
  Split a table by ROWS. Same columns everywhere. Different rows per partition.

  Original table (users):
  ┌─────────────────────────────────┐
  │ id  │ name    │ email           │
  │ 1   │ Arihant │ a@gmail.com     │
  │ 2   │ Priya   │ p@gmail.com     │
  │ 3   │ Rahul   │ r@gmail.com     │
  │ 4   │ Sneha   │ s@gmail.com     │
  └─────────────────────────────────┘

  After horizontal partitioning:
  PARTITION A (id 1–2):              PARTITION B (id 3–4):
  ┌──────────────────────┐           ┌──────────────────────┐
  │ id │ name  │ email   │           │ id │ name  │ email   │
  │ 1  │Arihant│a@gmail  │           │ 3  │Rahul  │r@gmail  │
  │ 2  │Priya  │p@gmail  │           │ 4  │Sneha  │s@gmail  │
  └──────────────────────┘           └──────────────────────┘

  Same columns. Different rows. Split by a key (id, date, region, etc.)

  WHEN ON ONE MACHINE:  Called "table partitioning" or just "partitioning"
  WHEN ACROSS MACHINES: Called "SHARDING"  ← this is what we do at scale


TYPE 2: VERTICAL PARTITIONING (Column-based split)
────────────────────────────────────────────────────────────
  Split a table by COLUMNS. Same rows everywhere. Different columns per partition.

  Original table (users):
  ┌────────────────────────────────────────────────────────────────┐
  │ id │ name  │ email       │ profile_pic │ bio          │ settings│
  └────────────────────────────────────────────────────────────────┘

  After vertical partitioning:
  PARTITION A (core data, accessed often):
  ┌──────────────────────────────────┐
  │ id │ name  │ email              │
  └──────────────────────────────────┘

  PARTITION B (heavy data, accessed rarely):
  ┌──────────────────────────────────────────────┐
  │ id │ profile_pic │ bio          │ settings   │
  └──────────────────────────────────────────────┘

  WHY SPLIT VERTICALLY?
    profile_pic and bio are large blobs. Fetching them on every login query
    slows things down. Separating them means core data (name, email) loads fast.
    Heavy data only fetched when user visits their profile page.

  REAL WORLD EXAMPLE: Splitting a User table into:
    users          → id, name, email, created_at     (hot data, small)
    user_profiles  → user_id, bio, avatar, website   (cold data, large)
    user_settings  → user_id, theme, notifications   (rarely changed)

  NOTE: Vertical partitioning is usually done on ONE machine.
        It's a schema design decision, not a distribution strategy.


TYPE 3: FUNCTIONAL PARTITIONING (Domain-based split)
────────────────────────────────────────────────────────────
  Split data by BUSINESS FUNCTION / DOMAIN.
  Each domain gets its own separate database entirely.

  Monolith (one database):
  ┌─────────────────────────────────────────────────┐
  │              ONE BIG DATABASE                    │
  │  users table + orders table + products table     │
  │  + payments table + inventory table              │
  └─────────────────────────────────────────────────┘

  After functional partitioning (microservices style):
  ┌───────────┐  ┌───────────┐  ┌──────────────┐  ┌───────────┐
  │  User DB  │  │ Order DB  │  │  Product DB  │  │Payment DB │
  │ (users,   │  │ (orders,  │  │ (products,   │  │(payments, │
  │  sessions)│  │  items)   │  │  inventory)  │  │ refunds)  │
  └───────────┘  └───────────┘  └──────────────┘  └───────────┘

  WHY SPLIT FUNCTIONALLY?
    Each service team owns their own database.
    Schema changes don't affect other teams.
    Each DB can be scaled independently.
    This is the DATABASE PER SERVICE pattern in microservices.

  NOTE: Each functional partition can THEN be horizontally sharded if needed.
        Functional partitioning reduces coupling. Horizontal sharding handles scale.
```

### Sharding = Horizontal Partitioning Across Machines

```
SHARDING is specifically:
  Horizontal partitioning (split by rows)
  + distributed across MULTIPLE PHYSICAL MACHINES
  + each piece is called a "shard"

  ┌──────────────────────────────────────────────────────────────┐
  │  HORIZONTAL PARTITIONING ON ONE MACHINE (just partitioning): │
  │                                                              │
  │   DB Server (1 machine)                                      │
  │   ├── users_partition_A (id 1 – 10M)                        │
  │   ├── users_partition_B (id 10M – 20M)                      │
  │   └── users_partition_C (id 20M – 30M)                      │
  │                                                              │
  │   Still one machine. No distribution. Just different tables. │
  │   Helps with query performance and manageability.            │
  │   Does NOT solve the storage or compute scaling problem.     │
  └──────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────┐
  │  HORIZONTAL PARTITIONING ACROSS MACHINES (SHARDING):         │
  │                                                              │
  │   Machine 1 (Shard 1): users id 1 – 10M                     │
  │   Machine 2 (Shard 2): users id 10M – 20M                   │
  │   Machine 3 (Shard 3): users id 20M – 30M                   │
  │                                                              │
  │   Three machines. Distributed. Each has its own CPU/RAM/disk.│
  │   Solves storage AND compute scaling.                        │
  │   This is what we mean by SHARDING.                          │
  └──────────────────────────────────────────────────────────────┘
```

### Side-by-Side Comparison

```
DIMENSION          PARTITIONING            SHARDING
                   (within one machine)    (across machines)
────────────────────────────────────────────────────────────────────────────
Location           Same machine            Different machines
Network involved?  NO                      YES (network between shards)
Solves storage?    NO (still 1 disk)       YES (each shard has its own disk)
Solves compute?    Partially               YES (each shard has its own CPU/RAM)
Complexity         Low                     High (routing, resharding, cross-shard queries)
Query routing      Database handles it     Application/router must know which shard
When to use        Performance tuning,     When data outgrows one machine,
                   schema design           when write throughput exceeds one machine
Examples           MySQL PARTITION BY,     MongoDB shards, Cassandra vnodes,
                   PostgreSQL table        MySQL Vitess, ElastiCache Cluster
                   partitioning

────────────────────────────────────────────────────────────────────────────
ANALOGY:
  Partitioning = One office building with floors A, B, C.
                 Different departments per floor. Same building.
                 One power connection, one elevator, one address.

  Sharding = Three separate office buildings in different cities.
             Different departments in different buildings.
             Each building has its own power, its own address.
             To visit someone, you need to know WHICH BUILDING first.
```

### When Does Partitioning Alone Work? When Must You Shard?

```
USE PARTITIONING (within one machine) WHEN:
  ✓ Data fits within one machine's disk (< few TB)
  ✓ You want faster queries on large tables (partition pruning)
  ✓ You want easier data lifecycle management (drop old partitions by date)
  ✓ Your write throughput fits within one machine's capacity

  EXAMPLE: Logs table with 2 years of data (500 GB).
    Partition by month: logs_2024_01, logs_2024_02, ..., logs_2025_12
    Query "show me January 2024 logs" → only scans 1 partition, not full 500 GB.
    Still on ONE machine. No distribution needed.

USE SHARDING (across machines) WHEN:
  ✗ Data is too large for one machine's disk
  ✗ Write throughput exceeds one machine's capacity
  ✗ CPU/RAM of one machine is the bottleneck
  ✗ You need to scale linearly by adding machines

  EXAMPLE: 500 million user records = 5 TB.
    No single machine has 5 TB RAM.
    Partitioning within one machine won't help — it's still 5 TB on one disk.
    → Must shard across multiple machines.
```

### The Relationship in Practice

```
In the real world, you often do ALL THREE together:

STEP 1: FUNCTIONAL PARTITIONING (microservices design)
  Separate User DB, Order DB, Product DB.
  Each team owns their domain.

STEP 2: VERTICAL PARTITIONING (schema design)
  User DB → split into users (hot) + user_profiles (cold).
  Keeps frequently accessed data lean and fast.

STEP 3: HORIZONTAL PARTITIONING / SHARDING (scaling)
  Users table grows to 500M records.
  Shard users across 5 machines by user_id hash.
  Each shard has its own replica set (from the replication section below).

FINAL PICTURE:
  ┌─────────────────────────────────────────────────────────┐
  │  USER SERVICE                                           │
  │                                                        │
  │  users (hot columns only)                              │
  │    → Sharded across 5 machines (horizontal sharding)   │
  │    → Each shard: 1 Primary + 2 Replicas                │
  │                                                        │
  │  user_profiles (cold/heavy columns)                    │
  │    → Separate table (vertical partitioning)            │
  │    → Smaller dataset, maybe just 1 shard               │
  └─────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────┐
  │  ORDER SERVICE                                          │
  │  → Functional partition (own DB, own team)              │
  │  → Sharded by order_date (range partitioning)           │
  └─────────────────────────────────────────────────────────┘
```

### Summary: One Table to Remember

```
TERM                  WHAT IT MEANS                     MACHINES INVOLVED
──────────────────────────────────────────────────────────────────────────
Partitioning          Splitting data into pieces         One OR many
Horizontal Part.      Split by rows (same columns)       One machine
Vertical Part.        Split by columns (same rows)       One machine
Functional Part.      Split by domain/service            One per domain
Sharding              Horizontal split across machines   MANY machines
Shard                 One piece of sharded data          ONE machine
                      (can itself have replicas)
──────────────────────────────────────────────────────────────────────────

SIMPLE RULE:
  "Partitioning" → think schema / query design → ONE machine
  "Sharding"     → think distributed scale → MULTIPLE machines
  When someone says "we partitioned our DB" → could mean either
  When someone says "we sharded our DB" → definitely means multiple machines
```

---

## PART 1 — The Problem: Why One Database Machine Fails at Scale

### Start Simple: One Database Machine

```
         YOUR APP
            │
            ▼
    ┌───────────────┐
    │   DATABASE    │  ← single machine
    │   (MySQL)     │     CPU: 32 cores
    └───────────────┘     RAM: 128 GB
                          Disk: 2 TB
                          Writes/sec: ~5,000
                          Reads/sec: ~50,000

This works perfectly when you're small.
Let's say you're building a social media app with 1,000 users.
```

### The Three Walls You Hit As You Grow

```
WALL 1: STORAGE WALL
  You have 500 million users.
  Each user profile = 10 KB.
  500M × 10KB = 5 TB of just user data.
  Add posts, comments, media metadata → 50 TB.
  One machine has 2 TB disk → FULL. Can't store all data.

WALL 2: WRITE WALL (Throughput)
  Instagram gets 100 million posts per day.
  = 1,157 writes per second on average.
  At peak (9 PM): 10,000+ writes per second.
  One MySQL machine handles ~5,000 writes/sec → OVERLOADED.
  Queue builds up. Latency spikes. Users see errors.

WALL 3: AVAILABILITY WALL (Single Point of Failure)
  Your one database machine crashes at 2 PM.
  What happens?
  → 100% of your users see errors.
  → Every service depending on DB is down.
  → Data might be lost if disk corrupts.
  → Recovery takes 30 minutes → 30 min of total downtime.

  For a company like Amazon: 30 min down = $millions lost.
```

**The solution to each wall:**

```
WALL 1 (Storage)    → SHARDING   (split data across machines)
WALL 2 (Writes)     → SHARDING   (each shard handles a fraction of writes)
WALL 3 (Failures)   → REPLICATION (copies on multiple machines, failover)

Real production systems need BOTH.
```

---

## PART 2 — Replication: Copies for Reliability

### What Is Replication?

```
REPLICATION = Making exact copies of the SAME data on MULTIPLE machines.

WITHOUT REPLICATION (single machine):
  ┌─────────────┐
  │  DATABASE   │  ← ALL your data lives here
  │  Machine A  │
  └─────────────┘
  Machine A dies → ALL data inaccessible / potentially lost.


WITH REPLICATION (3 machines, same data):
  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │  PRIMARY    │────▶│  REPLICA 1  │────▶│  REPLICA 2  │
  │  Machine A  │     │  Machine B  │     │  Machine C  │
  │ (reads+writes)    │ (reads only)│     │ (reads only)│
  └─────────────┘     └─────────────┘     └─────────────┘
       │                    ↑                    ↑
       └────────────────────┴────────────────────┘
                     All 3 have identical data

Machine A dies → Machine B is automatically promoted to Primary.
Zero data loss. Near-zero downtime.
```

### Primary vs Replica — Who Does What

```
PRIMARY (also called Master or Leader):
  → Handles ALL WRITES (INSERT, UPDATE, DELETE)
  → Handles reads too (but typically offloaded)
  → Keeps a change log (called WAL / binlog / oplog)
  → Ships changes to replicas continuously

REPLICA (also called Secondary, Slave, Follower):
  → Receives changes from Primary and applies them
  → Handles READ traffic (SELECT queries)
  → Does NOT accept writes directly
  → Watches Primary's health — ready to take over

WHY ONLY ONE PRIMARY ACCEPTS WRITES?
  If two machines both accept writes simultaneously,
  and they get different writes at the same moment,
  which version is "correct"? → Split-brain problem.
  Having one primary avoids this conflict entirely.
```

### Replication Lag — The One Catch

```
When you write to PRIMARY:
  Write is committed on Primary: t=0ms
  Change shipped to Replica 1:   t=10ms  (network delay)
  Change applied on Replica 1:   t=12ms

This 12ms gap = REPLICATION LAG.

PROBLEM:
  User writes comment at t=0ms (goes to Primary).
  User immediately reads their comment at t=5ms (goes to Replica).
  Replica hasn't received the change yet → user sees OLD data.
  "I just posted this — where is it?!" → bad user experience.

SOLUTIONS:
  1. Read-after-write consistency: After a write, read from Primary (not replica).
  2. Sticky sessions: Same user always reads from same node.
  3. Synchronous replication: Primary waits for replica to confirm before acknowledging write.
     (Safer but slower — adds network round trip to every write.)
```

### How Failover Works (Automatic Leader Election)

```
NORMAL STATE:
  Primary: Machine A (healthy)
  Replica 1: Machine B
  Replica 2: Machine C

MACHINE A CRASHES:
  Step 1: B and C detect A is gone (heartbeat timeout, e.g., 10 seconds)
  Step 2: B and C vote — "Who should be the new primary?"
          The replica with the most up-to-date data wins.
  Step 3: Say B wins. B promotes itself to Primary.
  Step 4: C now replicates from B.
  Step 5: App's connection is redirected to B.
  Step 6: A comes back online → joins as a new Replica, syncs from B.

TOTAL DOWNTIME: ~10-30 seconds (detection + election + promotion)
With 3 nodes (1 primary + 2 replicas), you can survive 1 machine failure.
With 5 nodes, you can survive 2 simultaneous failures.

WHY MINIMUM 3 NODES (not 2)?
  2 nodes: A and B. A goes down. B can't know — "Is A down or is my network broken?"
           B can't safely promote itself (might cause split-brain if A is actually fine).
  3 nodes: A goes down. B and C can talk to each other. Majority (2/3) agree A is gone.
           Safe to elect a new primary. → Always use ODD number of nodes.
```

---

## PART 3 — Sharding: Split Data for Scale

### What Is Sharding?

```
SHARDING = Splitting your data HORIZONTALLY across multiple machines.
           Each machine (shard) holds a DIFFERENT SUBSET of data.

WITHOUT SHARDING (all data on one machine):
  ┌──────────────────────┐
  │      DATABASE        │
  │  Users: A to Z       │  ← all 500 million users here
  │  Posts: all posts    │
  └──────────────────────┘

WITH SHARDING (data split across 3 shards):
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │   SHARD 1    │  │   SHARD 2    │  │   SHARD 3    │
  │ Users A–H    │  │ Users I–P    │  │ Users Q–Z    │
  │ ~166M users  │  │ ~166M users  │  │ ~166M users  │
  └──────────────┘  └──────────────┘  └──────────────┘

Each shard:
  → Stores only 1/3 of the total data
  → Handles only 1/3 of total queries
  → Has its own CPU, RAM, disk → no competition between shards
```

### Shard Key — How You Decide Which Data Goes Where

```
SHARD KEY = The field you use to decide which shard data lives in.

EXAMPLE: Shard key = user_id

METHOD 1: RANGE-BASED SHARDING
  Shard 1: user_id 1 to 10,000,000
  Shard 2: user_id 10,000,001 to 20,000,000
  Shard 3: user_id 20,000,001 to 30,000,000

  PRO: Range queries are easy (give me users 1-1000 → all on Shard 1)
  CON: HOTSPOT PROBLEM — new users always go to Shard 3 (highest IDs)
       Shard 3 gets hammered, Shard 1 sits idle.

METHOD 2: HASH-BASED SHARDING
  shard_number = hash(user_id) % number_of_shards
  user_id=1001 → hash=4392 → 4392 % 3 = 0 → Shard 1
  user_id=1002 → hash=8371 → 8371 % 3 = 1 → Shard 2
  user_id=1003 → hash=2918 → 2918 % 3 = 2 → Shard 3

  PRO: Data distributed evenly. No hotspots. Each shard gets ~equal load.
  CON: Range queries need to check ALL shards (user_id 1-1000 could be anywhere).

METHOD 3: CONSISTENT HASHING (used by Cassandra, DynamoDB)
  Place shards on a virtual ring. Hash the key → find shard on ring.
  Adding a new shard only moves ~1/n of data (not reshuffling everything).
  PRO: Best for dynamic scaling (add/remove shards gracefully).
  CON: More complex to implement.

BEST CHOICE:
  Reads/writes are by individual ID? → Hash-based (even distribution)
  Range queries are common?          → Range-based or compound key
  Frequent shard additions?          → Consistent hashing
```

### What Sharding Solves and What It Doesn't

```
SHARDING SOLVES:
  ✓ Storage limit — data spread across machines, total = sum of all shards
  ✓ Write throughput — writes distributed across shards
  ✓ Query load — each shard handles fraction of queries

SHARDING DOES NOT SOLVE:
  ✗ Availability — a shard going down still makes that shard's data unavailable
  ✗ Read scaling within a shard — one shard still limited to one machine's read capacity
  ✗ Data loss — if a shard's disk dies, that portion of data is lost

SHARDING ALONE IS NOT ENOUGH FOR PRODUCTION.
You must combine sharding with replication.
```

---

## PART 4 — The Best Architecture: Sharding + Replication Together

### The Gold Standard: Each Shard Is a Replica Set

```
This is how MongoDB, Cassandra, MySQL Cluster, and all major
production databases are run at large scale.

THE ARCHITECTURE:

                    ┌──────────────────┐
                    │   YOUR APP       │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  QUERY ROUTER    │  ← decides which shard to talk to
                    │  (mongos / proxy)│
                    └─┬──────┬──────┬──┘
                      │      │      │
          ┌───────────▼┐ ┌───▼────┐ ┌▼───────────┐
          │  SHARD 1   │ │ SHARD 2│ │  SHARD 3   │
          │ (Users A-H)│ │(I–P)   │ │  (Q–Z)     │
          └─────┬──────┘ └───┬────┘ └──────┬─────┘
                │             │             │
   Each shard IS a 3-node REPLICA SET:
                │             │             │
         ┌──────▼──────┐      │      ┌──────▼──────┐
         │  Primary    │      │      │  Primary    │
         │  Machine A1 │      │      │  Machine C1 │
         │  Zone-1     │      │      │  Zone-1     │
         ├─────────────┤      │      ├─────────────┤
         │  Replica    │      │      │  Replica    │
         │  Machine A2 │      │      │  Machine C2 │
         │  Zone-2     │      │      │  Zone-2     │
         ├─────────────┤      │      ├─────────────┤
         │  Replica    │      │      │  Replica    │
         │  Machine A3 │      │      │  Machine C3 │
         │  Zone-3     │      │      │  Zone-3     │
         └─────────────┘      │      └─────────────┘
                    (Shard 2 has same structure)

TOTAL MACHINES: 3 shards × 3 nodes each = 9 machines minimum
```

### Breaking Down the Architecture

```
LAYER 1: THE QUERY ROUTER
  What it is: A lightweight process that knows the sharding configuration.
              "Which shard holds data for user_id=5001?"
  What it does: Routes every query to the correct shard.
                Aggregates results from multiple shards if needed.
  Examples: MongoDB mongos, Vitess VTGate, ProxySQL

  App doesn't know about shards at all.
  App talks to the router like it's a single database.


LAYER 2: SHARDS (Data Partitions)
  Each shard = one partition of your data.
  3 shards → each holds 1/3 of total data.
  Shard 1 handles only writes/reads for users A-H.
  No shard knows about other shards' data.


LAYER 3: REPLICA SETS (within each shard)
  Each shard has 3 nodes: 1 Primary + 2 Replicas.
  Primary handles writes for this shard.
  Replicas handle reads, provide failover.
  If Primary dies → a Replica auto-promotes. Shard stays available.
```

### Why Each Node MUST Be on a Different Machine

```
QUESTION: Can two replicas of the same shard share a machine?

SCENARIO: You put Primary and Replica 1 on the same physical machine M1.

         MACHINE M1                MACHINE M2
    ┌──────────────────┐      ┌──────────────┐
    │  Primary  (A1)   │      │  Replica 2   │
    │  Replica1 (A2)   │      │  (A3)        │
    └──────────────────┘      └──────────────┘

Machine M1 dies (power failure, hardware fault):
  → Primary is gone ✗
  → Replica 1 is ALSO gone ✗ (same machine!)
  → Only Replica 2 survives
  → You need MAJORITY (2 out of 3) to elect a new primary
  → 2 out of 3 nodes are down → NO MAJORITY → ELECTION FAILS
  → Your entire shard is FROZEN. No reads, no writes.
  → Data loss risk.

THIS IS WHY: Every replica must be on a SEPARATE PHYSICAL MACHINE.
One machine failure should only take down ONE node, never two.
```

### Why Nodes Must Be in Different Availability Zones

```
AVAILABILITY ZONE (AZ) = A physically separate data center
                          within the same region.
                          Different power supply, networking, cooling.
                          Usually within 10–20 km of each other.
                          Low latency between AZs (~1–5ms).

SCENARIO — All replicas in SAME zone:

  Zone 1 (Data Center Mumbai-1):
    Primary  → Machine A1
    Replica1 → Machine A2
    Replica2 → Machine A3

  Zone 1 has a POWER OUTAGE:
  → All 3 nodes down simultaneously.
  → Entire shard gone. Data inaccessible.
  → No failover possible — majority is dead.

SOLUTION — Spread across zones:

  Zone 1 (Mumbai-1): Primary   → Machine A1
  Zone 2 (Mumbai-2): Replica 1 → Machine A2
  Zone 3 (Mumbai-3): Replica 2 → Machine A3

  Zone 1 power outage:
  → Primary (A1) goes down.
  → Replica 1 (A2) and Replica 2 (A3) are FINE (different buildings).
  → A2 and A3 have majority (2/3) → elect A2 as new Primary.
  → Shard is fully operational within seconds.
  → Your users see a tiny blip, not an outage.

AWS calls these "Availability Zones" (AZ-1a, AZ-1b, AZ-1c).
GCP calls them "Zones" (us-central1-a, -b, -c).
This is non-negotiable in production systems.
```

### The Complete Gold Standard Architecture

```
                         INTERNET
                             │
                    ┌────────▼────────┐
                    │   LOAD BALANCER │
                    └────────┬────────┘
                             │
                 ┌───────────▼───────────┐
                 │       APP SERVERS     │
                 │  (stateless, N nodes) │
                 └───────────┬───────────┘
                             │
                    ┌────────▼────────┐
                    │  QUERY ROUTER   │  (knows sharding config)
                    │  (2 instances   │  (router itself replicated
                    │   for HA)       │   to avoid single point of failure)
                    └───┬─────┬───┬───┘
                        │     │   │
          ┌─────────────▼┐ ┌──▼──┐ ┌▼──────────────┐
          │   SHARD 1    │ │  2  │ │    SHARD 3    │
          │  (Users A–H) │ │     │ │   (Users Q–Z) │
          └──────┬───────┘ └──┬──┘ └───────┬───────┘
                 │            │             │
    ┌────────────▼───┐   (same)    ┌────────▼───────┐
    │  AZ-1          │             │  AZ-1           │
    │  PRIMARY (A1)  │             │  PRIMARY (C1)   │
    │  ─────────── ← │──writes     │  ─────────────  │
    │  AZ-2          │             │  AZ-2           │
    │  REPLICA (A2)  │             │  REPLICA (C2)   │
    │  ─────────── ← │──reads      │  ─────────────  │
    │  AZ-3          │             │  AZ-3           │
    │  REPLICA (A3)  │             │  REPLICA (C3)   │
    └────────────────┘             └─────────────────┘

Total machines for 3 shards: 9 DB machines + 2 routers = 11 machines
Each machine in a DIFFERENT AZ from its replica-set peers.
```

---

## PART 5 — Machine Sizing: Is Each Machine the Same?

### Should All Machines Be Identical?

```
RECOMMENDATION: YES — all nodes in a replica set should be same size.

WHY?
  If Primary fails and Replica takes over, the Replica must handle
  the SAME workload as the Primary did.
  If Replica is smaller (less RAM, slower CPU) → performance degrades on failover.
  Worse: Replica might not keep up with replication → falls behind → data lag.

ANTI-PATTERN (cheap replicas):
  Primary:   32 cores, 256 GB RAM, NVMe SSD  ← handles peak load fine
  Replica 1:  8 cores,  64 GB RAM, HDD       ← can't handle Primary's load
  Replica 2:  8 cores,  64 GB RAM, HDD

  Primary crashes. Replica 1 promotes to Primary.
  Replica 1 tries to handle same write load → CPU maxes → latency spikes.
  Users see degraded performance or errors until Primary comes back.

RIGHT APPROACH: All 3 nodes identical.
  Primary:   32 cores, 256 GB RAM, NVMe SSD
  Replica 1: 32 cores, 256 GB RAM, NVMe SSD
  Replica 2: 32 cores, 256 GB RAM, NVMe SSD
```

### One Exception: Read-Heavy Replica

```
SPECIAL CASE: If you have dedicated read replicas ONLY for analytics / reporting,
those can be different (e.g., more disk for historical queries, less RAM).

But these should NOT be part of the leader election (they're non-voting replicas).

3-node voting replica set: must all be identical.
Additional non-voting read replicas: can differ in spec.
```

---

## PART 6 — How Many Shards? How Many Replicas?

### Deciding Number of Shards

```
START: Calculate your data size and write throughput.

FORMULA:
  Total data size = 5 TB
  One shard max comfortable size = 500 GB (leave headroom)
  Minimum shards = 5 TB / 500 GB = 10 shards

  Peak writes = 50,000/sec
  One shard handles = 5,000 writes/sec comfortably
  Shards for writes = 50,000 / 5,000 = 10 shards

Take the higher of the two → 10 shards.
Add 20-30% buffer → 12–13 shards.
Round to nice number → 12 shards.

ADDING SHARDS LATER:
  Very painful with range/hash sharding (requires data reshuffling).
  Easier with consistent hashing.
  Best practice: START with more shards than you need.
  Empty shards have near-zero cost. Resharding is very expensive.
```

### Deciding Number of Replicas per Shard

```
MINIMUM: 3 nodes (1 Primary + 2 Replicas)
  → Can survive 1 node failure (2 remaining = majority)
  → Can handle moderate read load on replicas

STANDARD PRODUCTION: 3 nodes
  → Used by most companies at scale
  → Sweet spot of cost vs reliability

HIGH RELIABILITY: 5 nodes (1 Primary + 4 Replicas)
  → Can survive 2 simultaneous node failures
  → More read capacity
  → Costs significantly more

NEVER USE: 2 nodes (1 Primary + 1 Replica)
  → If Primary fails, Replica can't form majority → can't promote
  → You'd need a special "arbiter" node (third node, no data, just votes)
  → Still fragile — avoid in production

RULE: Always ODD total number of voting nodes (3, 5, 7).
      Even numbers can cause tie votes in elections → split-brain.
```

---

## PART 7 — What Happens in Each Failure Scenario

### Scenario 1: One Replica Machine Dies

```
BEFORE:
  Shard 1: Primary(A1) + Replica(A2) + Replica(A3)  ← all healthy

Replica A3 machine dies (hardware fault):

AFTER (automatic, no human intervention):
  Shard 1: Primary(A1) + Replica(A2)   [A3 is gone]
  A1 is still primary. Writes still accepted.
  Reads go to A1 and A2.
  No user-visible impact. ✓

ACTION REQUIRED (eventually):
  Replace A3 machine. New node joins as replica. Syncs from primary. Back to 3 nodes.
  Urgency: Medium. You have 2 nodes left — don't delay too long.
```

### Scenario 2: Primary Machine Dies

```
BEFORE:
  Shard 1: Primary(A1) + Replica(A2) + Replica(A3)

Primary A1 machine dies:

SECONDS 0–10:  A2 and A3 detect A1 is gone (missed heartbeats)
SECONDS 10–12: A2 and A3 hold election. A2 wins (more up-to-date).
SECOND 12:     A2 promotes itself to Primary.
SECOND 12:     Router detects new Primary. Redirects writes to A2.
SECOND 12:     A3 now replicates from A2.

USER IMPACT:
  ~12 seconds where writes fail / are retried.
  Good apps retry with backoff → most users don't notice.
  Reads from A3 continue even during election.

WHEN A1 COMES BACK:
  A1 joins as Replica of A2. Syncs missed data. Back to 3 nodes.
```

### Scenario 3: Entire Availability Zone Goes Down

```
BEFORE (correct setup — spread across AZs):
  Zone-1: Primary (A1)
  Zone-2: Replica (A2)
  Zone-3: Replica (A3)

Zone-1 power failure — A1 is gone:

  → A2 and A3 elect A2 as new Primary (same as Scenario 2)
  → Total downtime: ~12 seconds
  → ZERO data loss (A2 and A3 are fully up-to-date)

IF WRONG SETUP (all in same zone):
  Zone-1 failure → ALL THREE nodes gone → Shard completely down → DATA INACCESSIBLE.
  This is why AZ spread is mandatory.
```

### Scenario 4: An Entire Shard Goes Down

```
BEFORE: 3 shards, each a replica set.
Shard 2 (users I–P) — all 3 nodes die simultaneously (extremely rare).

USER IMPACT:
  Users I–P: CANNOT read or write. 503 errors.
  Users A–H and Q–Z: Completely unaffected. ✓

  Sharding CONTAINS the blast radius.
  Without sharding, ALL users would be affected.
  With sharding, only 1/3 of users are affected.

→ This is another reason sharding is critical.
```

---

## PART 8 — Geo-Replication: Taking It Further

### Multi-Region for Maximum Reliability

```
For the absolute highest reliability (global apps, financial systems):
Replicate across GEOGRAPHIC REGIONS, not just availability zones.

SETUP (3 regions):
  Mumbai region:   Primary shard replicas (handles Indian traffic)
  Singapore region: Replica set (handles SE Asia traffic, DR backup)
  Frankfurt region: Replica set (handles EU traffic, DR backup)

REPLICATION LAG:
  Mumbai → Singapore: ~70ms
  Mumbai → Frankfurt: ~120ms
  (Much higher than within-AZ ~1ms)

USE CASES:
  Financial institutions (banks, stock exchanges) → mandatory multi-region
  Global consumer apps (WhatsApp, Instagram) → multi-region for read performance
  Regular startups → single region with multi-AZ is sufficient

COST:
  Multi-AZ: ~2× cost of single machine
  Multi-Region: ~4–6× cost (data transfer fees, more machines)
```

---

## PART 9 — The Summary: Best Architecture Decision Tree

```
QUESTION 1: Do you have < 100 GB data and < 10,000 writes/sec?
  YES → Single machine + 2 replicas (no sharding needed yet)
  NO  → Continue to Question 2

QUESTION 2: Do you need horizontal data scaling?
  YES → Add sharding. Calculate number of shards needed.
  NO  → 3-node replica set is sufficient

QUESTION 3: How many shards?
  Calculate: max(dataSize/shardCapacity, writeLoad/shardWriteCapacity)
  Add 25% buffer. Round up to safe number.

QUESTION 4: How many replicas per shard?
  Standard: 3 nodes (1 primary + 2 replicas) — sufficient for 99.9% of cases
  Critical: 5 nodes — for financial/healthcare systems

QUESTION 5: Machine sizes?
  All nodes in same replica set: IDENTICAL SPEC
  Different specs only for non-voting analytics replicas

QUESTION 6: Where to put each node?
  MANDATORY: Each node of a replica set on a DIFFERENT PHYSICAL MACHINE
  MANDATORY: Spread across DIFFERENT AVAILABILITY ZONES (min 3 AZs)
  OPTIONAL:  Spread across different REGIONS (for global apps)
```

---

## PART 10 — Full Architecture Comparison

```
ARCHITECTURE            HANDLES       SURVIVES        MACHINES   USE CASE
                        MORE DATA?    FAILURES?
──────────────────────────────────────────────────────────────────────────────────
Single machine          ✗             ✗ (SPOF)        1          Dev/testing only

Single + 1 replica      ✗             ✗ (can't elect) 2          NEVER use

Single + 2 replicas     ✗             ✓ (1 failure)   3          Small apps, <100GB

Sharding only           ✓             ✗ (shard SPOF)  N          NEVER in production
(no replication)

Sharding + Replication  ✓             ✓ (1 per shard) 3N         STANDARD PRODUCTION
(3 nodes/shard,                                                   Most apps
same AZ)

Sharding + Replication  ✓             ✓ (zone + node) 3N         RECOMMENDED
(3 nodes/shard,                                                   All production
multi-AZ)                                                         systems

Sharding + Replication  ✓             ✓ (region +     5N+        Banks, global apps,
(5 nodes/shard,                        zone + node)              critical systems
multi-region)
──────────────────────────────────────────────────────────────────────────────────

RECOMMENDATION FOR PRODUCTION:
  Sharding + Replication (3 nodes/shard, multi-AZ)
  → Each shard is a 3-node replica set
  → Nodes spread across 3 different AZs
  → All nodes in same replica set are IDENTICAL machines
  → Query router handles routing (2 instances for its own HA)
  → This is what MongoDB Atlas, AWS RDS Multi-AZ, Google Cloud Spanner use.
```

---

## PART 11 — Real World Examples

```
COMPANY          SHARDS    REPLICAS/SHARD   APPROACH
──────────────────────────────────────────────────────────────────────────────
MongoDB Atlas    Auto      3 (min)          Auto-sharding + replica sets
                                            Spread across 3 AZs by default

AWS DynamoDB     Auto      3+               Hash-based sharding + replication
                                            Fully managed, transparent

Cassandra        N         3 (default RF=3) Consistent hashing + peer-to-peer
(Instagram)                                 No single primary — all nodes equal

MySQL (Vitess)   N         3                Range/hash sharding + MySQL replicas
(YouTube)                                   Used to handle YouTube's scale

Redis Cluster    N         2 (1 primary     Hash slots (16384 slots) ÷ N shards
                           +1 replica)      Default: 3 shards × 2 nodes = 6 machines

Elasticsearch    N shards  1-3 replicas     Primary + replica shards
                           per shard        Spread across nodes automatically
──────────────────────────────────────────────────────────────────────────────

THE PATTERN IS THE SAME EVERYWHERE:
  Shard to scale.
  Replicate to survive.
  Spread across AZs to stay available during data center failures.
```

---

## Quick Reference Summary

```
SHARD    = Split data horizontally → solves storage + write throughput
REPLICA  = Copy same data → solves failures + read throughput

BEST ARCHITECTURE IN ONE LINE:
  Multiple shards, each shard is a 3-node replica set,
  each node on a different machine in a different AZ.

MACHINE RULES:
  ✓ Same spec for all nodes in a replica set
  ✓ Different physical machine per node
  ✓ Different AZ per node
  ✓ Odd number of voting nodes (3, 5, 7)
  ✗ Never 2 nodes (can't elect)
  ✗ Never share machines between replicas of same shard
  ✗ Never put all replicas in same AZ

SIZING RULES:
  Shards: ceil(max(totalData/shardCapacity, writes/shardWriteLimit)) × 1.25
  Replicas: 3 for standard, 5 for critical systems

FAILOVER TIME:
  Single node failure:  ~10–30 seconds (automatic)
  AZ failure (multi-AZ): ~10–30 seconds (automatic)
  Region failure (multi-region): minutes (usually manual or configured)
```
