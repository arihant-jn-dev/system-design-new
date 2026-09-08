# Master-Slave vs Cluster Architecture
## What, Why, When — With Every Failure Case Explained

> **One-line summary:**
> Master-Slave = one node owns all data, others are copies → solves READ scale + failures
> Cluster = data split across many nodes, each with copies → solves WRITE scale + huge data + failures
> Use ElastiCache Redis as our primary real-world example throughout.

---

## PART 0 — Terminology: Node, Shard, Cluster, Replica (What Each Word Means)

> Before anything else — these words are used everywhere and often interchangeably.
> This section locks down exactly what each means so the rest of the doc is crystal clear.

### NODE

```
A NODE = ONE physical or virtual machine running a database process.

That's it. One machine. One process. One IP address.

  ┌─────────────────────────────────┐
  │            NODE                 │
  │                                 │
  │  Machine: AWS EC2 r6g.2xlarge   │
  │  IP: 10.0.1.45                  │
  │  RAM: 52 GB                     │
  │  Running: Redis / MySQL process │
  │  Has: its own disk, CPU, memory │
  └─────────────────────────────────┘

A node is just a single server doing database work.
It can be a Primary (handles writes) or a Replica (copy for reads/backup).

REAL LIFE ANALOGY:
  A node = one employee at a desk.
  That employee might be the manager (primary) or an assistant (replica).
  But either way — they are ONE person at ONE desk.
```

### SHARD

```
A SHARD = ONE partition of your total data.

Your full dataset is divided into pieces. Each piece = one shard.
Each shard lives on its own node (or set of nodes if replicated).

  Total Dataset: 300 GB of user data
      │
      ├── SHARD 1: Users A–H   (100 GB)  ← lives on Node(s) for Shard 1
      ├── SHARD 2: Users I–P   (100 GB)  ← lives on Node(s) for Shard 2
      └── SHARD 3: Users Q–Z   (100 GB)  ← lives on Node(s) for Shard 3

A shard is NOT a machine. A shard is a PIECE OF DATA.
That piece of data lives ON a machine (node).

IMPORTANT DISTINCTION:
  Shard = the data partition (logical concept)
  Node  = the machine holding that data (physical/virtual machine)

  One shard can span multiple nodes (when replicated):
    Shard 1 data → Primary Node A1 (has it)
                 → Replica Node A2 (has a copy)
                 → Replica Node A3 (has a copy)
  All 3 nodes hold Shard 1 data. But there is still only ONE Shard 1.

REAL LIFE ANALOGY:
  Shard = a chapter of a book
  Node  = the person holding that chapter

  3 people can each hold a copy of Chapter 1.
  But it's still one chapter (one shard), held by 3 people (3 nodes).
```

### REPLICA

```
A REPLICA = A COPY of a shard (or all data in master-slave) on another node.

Purpose: Backup, redundancy, read scaling.
The replica node receives all changes from the primary node continuously.

  PRIMARY NODE (Shard 1)
       │
       │  streams changes
       ▼
  REPLICA NODE 1 (copy of Shard 1)
       │
       │  streams changes
       ▼
  REPLICA NODE 2 (copy of Shard 1)

  All 3 nodes have identical data for Shard 1.
  Primary accepts writes. Replicas are read-only (or failover targets).

REPLICA ≠ SHARD:
  A replica is a COPY of a shard — same data, different machine.
  A shard is a PARTITION of data — different data, different machine.

REAL LIFE ANALOGY:
  Shard  = Chapter 1 of a book
  Replica = Photocopying Chapter 1 so 3 people each have a copy.
            If one person loses their copy, two others still have it.
```

### CLUSTER

```
A CLUSTER = The ENTIRE SETUP of multiple nodes working together as one system.

It is the BIG PICTURE. Everything combined.

In a Redis Cluster:
  ┌──────────────────────────────────────────────────────────────┐
  │                        CLUSTER                               │
  │  (this whole box is "the cluster")                           │
  │                                                              │
  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
  │  │   SHARD 1    │  │   SHARD 2    │  │   SHARD 3    │       │
  │  │              │  │              │  │              │       │
  │  │  Node: P1    │  │  Node: P2    │  │  Node: P3    │       │
  │  │  Node: R1a   │  │  Node: R2a   │  │  Node: R3a   │       │
  │  │  Node: R1b   │  │  Node: R2b   │  │  Node: R3b   │       │
  │  └──────────────┘  └──────────────┘  └──────────────┘       │
  └──────────────────────────────────────────────────────────────┘

The CLUSTER = all 3 shards + all 9 nodes together.
Your app connects to "the cluster" — it doesn't think about individual nodes.

CLUSTER ≠ NODE:
  Node = one machine (smallest unit)
  Cluster = collection of many nodes working as one system (largest unit)

REAL LIFE ANALOGY:
  Node    = one employee
  Shard   = one department's work
  Replica = a backup copy of that department's work
  Cluster = the entire company (all departments, all employees, working together)
```

### REPLICA SET

```
A REPLICA SET = A GROUP of nodes that all hold the SAME shard's data.
                1 Primary + N Replicas for ONE shard.

  REPLICA SET for Shard 1:
  ┌─────────────────────────────────────────┐
  │            REPLICA SET                  │
  │                                         │
  │  Primary Node  (P1) — AZ us-east-1a    │
  │  Replica Node  (R1) — AZ us-east-1b    │
  │  Replica Node  (R2) — AZ us-east-1c    │
  │                                         │
  │  All 3 nodes hold SHARD 1 data.         │
  │  P1 accepts writes. R1, R2 are copies.  │
  └─────────────────────────────────────────┘

Replica Set = the team responsible for ONE shard's data.

In Master-Slave (no sharding):
  There is ONE replica set for ALL the data.
  Primary = master. Replicas = slaves.

In Cluster (with sharding):
  There is ONE replica set PER SHARD.
  3 shards → 3 replica sets → 9 nodes total.
```

### How They All Fit Together — The Full Picture

```
CLUSTER (the whole system — your app talks to this)
│
├── SHARD 1 (data partition: Users A–H, 100 GB)
│     └── REPLICA SET for Shard 1
│           ├── NODE: Primary P1  (AZ-1a)  ← accepts writes for Shard 1
│           ├── NODE: Replica R1a (AZ-1b)  ← copy of Shard 1, reads only
│           └── NODE: Replica R1b (AZ-1c)  ← copy of Shard 1, reads only
│
├── SHARD 2 (data partition: Users I–P, 100 GB)
│     └── REPLICA SET for Shard 2
│           ├── NODE: Primary P2  (AZ-1b)
│           ├── NODE: Replica R2a (AZ-1c)
│           └── NODE: Replica R2b (AZ-1a)
│
└── SHARD 3 (data partition: Users Q–Z, 100 GB)
      └── REPLICA SET for Shard 3
            ├── NODE: Primary P3  (AZ-1c)
            ├── NODE: Replica R3a (AZ-1a)
            └── NODE: Replica R3b (AZ-1b)

COUNTING:
  Shards:  3  (3 data partitions)
  Nodes:   9  (3 shards × 3 nodes each)
  Replicas: 6  (2 replicas per shard × 3 shards)
  Clusters: 1  (this entire setup is ONE cluster)

YOUR APP sees: ONE cluster (single endpoint)
               Does NOT know about individual shards or nodes.
               The cluster routes queries to the right shard automatically.
```

### The Terminology Table

```
TERM            WHAT IT IS                    SIZE          ANALOGY
──────────────────────────────────────────────────────────────────────────
Node            One machine/server            Smallest      One employee
Shard           One data partition            Logical unit  One chapter
Replica         Copy of a shard on            Same as       Photocopy of
                another node                  shard         chapter
Replica Set     Group of nodes holding        Shard + its   One team
                same shard (1 primary         copies        (manager +
                + N replicas)                               assistants)
Cluster         All shards + all nodes        Largest       The whole
                working as one system                       company
──────────────────────────────────────────────────────────────────────────

MASTER-SLAVE vs CLUSTER — How Terms Apply:

                    MASTER-SLAVE           CLUSTER
                    ────────────────────────────────────
Shards?             NO (1 data set)        YES (N shards)
Nodes?              YES (1P + N replicas)  YES (N shards × (1P + R replicas))
Replica Set?        YES (1 set for all)    YES (1 per shard)
Called a "cluster"? Loosely (confusing!)   YES (proper cluster)
──────────────────────────────────────────────────────────────────────────

CONFUSION ALERT:
  AWS ElastiCache uses the word "cluster" for BOTH architectures:
    "Cluster Mode Disabled" = Master-Slave (1 shard, 1 replica set)
    "Cluster Mode Enabled"  = True Cluster  (N shards, N replica sets)
  The word "cluster" alone doesn't tell you which architecture.
  Always check if cluster mode is enabled or disabled.
```

---

## PART 1 — The Problem We're Solving

### Why Do We Even Need These Architectures?

```
SINGLE REDIS / DB NODE:

         YOUR APP
            │
            ▼
    ┌───────────────┐
    │  REDIS NODE   │  RAM: 32 GB
    │  (one machine)│  Reads/sec: ~100,000
    └───────────────┘  Writes/sec: ~80,000

WORKS FINE UNTIL:
  1. Your dataset grows beyond 32 GB → NO MORE SPACE
  2. Read traffic spikes → one node overloaded
  3. Write traffic spikes → one node overloaded
  4. Node crashes → EVERYTHING DOWN

The two architectures solve these differently.
```

---

## PART 2 — Master-Slave Architecture

### What Is It?

```
MASTER-SLAVE (also called Primary-Replica):

  ONE master holds ALL the data.
  ONE or more slaves hold COPIES of the same data.
  Master handles writes. Slaves handle reads.

  ┌─────────────────────────────────────────────┐
  │                YOUR APP                      │
  │  Writes → Master   |   Reads → Any Slave    │
  └──────────┬──────────────────────────────────┘
             │ writes                  reads
             ▼                           ▲
     ┌───────────────┐         ┌─────────┴──────────┐
     │    MASTER     │         │                    │
     │ (Primary)     │────────▶│  SLAVE 1 (Replica) │
     │ ALL the data  │         └────────────────────┘
     │ Reads+Writes  │
     │               │────────▶┌────────────────────┐
     └───────────────┘         │  SLAVE 2 (Replica) │
            ▲                  └────────────────────┘
            │
            └────────────▶┌────────────────────┐
                          │  SLAVE 3 (Replica) │
                          └────────────────────┘

  All slaves have IDENTICAL data to master.
  Replication is continuous (master streams changes to slaves).
```

### Key Properties

```
DATA DISTRIBUTION:
  Master: 100% of data (32 GB dataset → master has 32 GB)
  Slave 1: 100% copy (32 GB)
  Slave 2: 100% copy (32 GB)
  Slave 3: 100% copy (32 GB)

  Each machine stores the ENTIRE dataset.
  Maximum dataset size = RAM of ONE machine.
  Adding slaves doesn't give you more storage capacity.

READS:
  Distributed across all slaves → linear read scaling
  1 slave  → 2× read capacity (master + slave)
  3 slaves → 4× read capacity (master + 3 slaves)

WRITES:
  All writes go to master ONLY.
  Slaves are read-only.
  Write capacity = master's capacity alone (NOT multiplied).
  If your bottleneck is WRITES → master-slave alone won't help.

REPLICATION DIRECTION:
  Master → Slaves  (one direction, always)
  Slaves NEVER write back to master.
  Slaves NEVER write to each other.
```

### Real World: ElastiCache Redis (Cluster Mode DISABLED)

```
AWS ElastiCache with Cluster Mode Disabled = Master-Slave

┌──────────────────────────────────────────────────────────┐
│              AWS ELASTICACHE (Cluster Mode OFF)           │
│                                                          │
│  ┌──────────────────────┐                               │
│  │  PRIMARY NODE        │  ← master (reads + writes)    │
│  │  cache.r6g.xlarge    │                               │
│  │  RAM: 26 GB          │                               │
│  │  AZ: us-east-1a      │                               │
│  └──────────┬───────────┘                               │
│             │ replication                               │
│    ┌────────▼────────────┐                              │
│    │  READ REPLICA 1     │  ← slave (reads only)        │
│    │  cache.r6g.xlarge   │                              │
│    │  RAM: 26 GB         │                              │
│    │  AZ: us-east-1b     │                              │
│    └─────────────────────┘                              │
│    ┌─────────────────────┐                              │
│    │  READ REPLICA 2     │  ← slave (reads only)        │
│    │  cache.r6g.xlarge   │                              │
│    │  RAM: 26 GB         │                              │
│    │  AZ: us-east-1c     │                              │
│    └─────────────────────┘                              │
│                                                          │
│  Max dataset: 26 GB (size of ONE node)                   │
│  Max read replicas: 5                                    │
│  Total machines: 3 (1 primary + 2 replicas)             │
└──────────────────────────────────────────────────────────┘

YOUR APP connects to:
  Primary endpoint  → all writes go here
  Reader endpoint   → ElastiCache load-balances across replicas
```

### How Replication Works (Step by Step)

```
USER writes key "user:1001:session" = "abc123" to Master:

  Step 1: App sends SET command to Master
  Step 2: Master writes to memory: "user:1001:session" = "abc123"
  Step 3: Master appends to replication backlog (change log)
  Step 4: Master sends change to Slave 1 and Slave 2 asynchronously
  Step 5: Slave 1 receives, applies: now has "user:1001:session" = "abc123"
  Step 6: Slave 2 receives, applies: now has same

TIMING:
  Master write commit:  0ms
  Slave receives:       1–5ms  (LAN within same region)
  Slave applies:        1–5ms

REPLICATION LAG = 2–10ms typically
During this window, if you read from a slave, you might get stale data.

ASYNCHRONOUS (default) vs SYNCHRONOUS replication:
  Async (default): Master doesn't wait for slaves to confirm.
    → Faster writes, small chance of data loss on sudden crash.
  Sync: Master waits for at least one slave to confirm.
    → Slower writes, zero data loss guarantee.
    → ElastiCache Redis uses async replication.
```

### Redis Sentinel: The HA Watchdog for Master-Slave

```
PROBLEM: Master crashes. Who detects it? Who promotes a slave?
         Who tells your app the new master address?

SOLUTION: REDIS SENTINEL

Sentinel = a separate process that monitors your Redis nodes.
           When master fails, Sentinel orchestrates failover automatically.

SENTINEL SETUP (for ElastiCache, AWS manages this automatically):

  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
  │ SENTINEL 1  │   │ SENTINEL 2  │   │ SENTINEL 3  │
  │ (monitor)   │   │ (monitor)   │   │ (monitor)   │
  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
         │                 │                 │
         └─────────────────┴─────────────────┘
                     All 3 watch:
               Master + Slave 1 + Slave 2

WHAT SENTINEL DOES:
  1. MONITOR: Pings master every 1 second. Tracks health.
  2. NOTIFICATION: Alerts when something goes wrong.
  3. AUTOMATIC FAILOVER: If master is down, elects a new master from slaves.
  4. CONFIGURATION PROVIDER: Tells your app the current master address.

WHY 3 SENTINELS?
  Need MAJORITY (quorum) to agree master is down before acting.
  Prevents false positives (network blip mistaken for master death).
  With 3 sentinels: 2/3 must agree → safe to failover.
  With 1 sentinel: single point of failure in your monitoring system!

NOTE: ElastiCache manages Sentinel for you. You don't configure it manually.
      AWS handles detection and failover automatically.
```

### Failure Scenarios — Master-Slave

#### Scenario A: One Slave Dies

```
BEFORE:
  Master (M) ← healthy
  Slave 1 (S1) ← healthy
  Slave 2 (S2) ← DIES (hardware fault, AZ outage)

WHAT HAPPENS:
  ✓ Master continues accepting reads + writes.
  ✓ Slave 1 continues serving reads.
  ✗ Slave 2 is gone — its read capacity is lost.
  ✓ No data loss — master and slave 1 both have full copy.
  ✓ No user-facing impact — readers automatically routed to S1.

USER IMPACT:  None (reads go to S1 and Master).
DATA LOSS:    None (master + S1 both intact).
ACTION NEEDED: Replace S2. ElastiCache auto-provisions replacement.
URGENCY: Medium. You're now running with reduced redundancy.
```

#### Scenario B: Master Dies (Most Critical Case)

```
BEFORE:
  Master (M) — AZ us-east-1a ← DIES (machine failure)
  Slave 1 (S1) — AZ us-east-1b ← healthy
  Slave 2 (S2) — AZ us-east-1c ← healthy

WHAT HAPPENS (timeline):

  t=0s:    Master M stops responding.
  t=0–10s: Sentinels detect M is unresponsive (missed heartbeats).
  t=10s:   Sentinels vote: majority (2/3) agree M is down.
  t=10s:   Sentinel elects S1 as new Master (based on which slave is most
           up-to-date with replication).
  t=10s:   S1 promoted to Master. Starts accepting writes.
  t=10s:   S2 told: "New master is S1. Start replicating from S1."
  t=10s:   ElastiCache updates Primary Endpoint DNS to point to S1.
  t=12–60s: Your app's DNS cache expires. App reconnects to new master S1.

DURING FAILOVER (t=0 to t=60s):
  Writes: FAIL (master is gone, new one not ready yet)
  Reads: S2 still serves reads ← UNAFFECTED
  User impact: Write errors for ~10–60 seconds.

WHAT ABOUT DATA WRITTEN BETWEEN M's LAST SYNC AND CRASH?
  If async replication: up to ~10ms of writes may not have reached slaves.
  Those writes are LOST.
  If sync replication: zero data loss (slave confirmed before master ack'd).

AFTER FAILOVER:
  S1 is now Master.
  S2 is now the only Slave.
  M (old master) eventually replaced by AWS → joins as new Slave.

MASTER-SLAVE FAILOVER TIME: 10–60 seconds (ElastiCache typical: 30–60s)
```

#### Scenario C: Entire Availability Zone Goes Down

```
CORRECT SETUP (replicas in different AZs):
  Master (M)  — AZ us-east-1a ← ENTIRE AZ GOES DOWN
  Slave 1 (S1) — AZ us-east-1b ← FINE
  Slave 2 (S2) — AZ us-east-1c ← FINE

  → Sentinels in 1b and 1c detect master is gone.
  → S1 promoted to master.
  → Recovery: ~30–60 seconds. Data from last sync may be lost.
  → S2 continues serving reads during failover.

WRONG SETUP (all in same AZ):
  Master (M)  — AZ us-east-1a ← DOWN
  Slave 1 (S1) — AZ us-east-1a ← DOWN (same AZ!)
  Slave 2 (S2) — AZ us-east-1a ← DOWN (same AZ!)

  → ALL THREE NODES GONE.
  → No failover possible.
  → Complete outage until AZ recovers.
  → Potential data loss.

LESSON: ALWAYS spread master + slaves across different AZs.
```

### Limitations of Master-Slave

```
HARD LIMIT 1: DATASET SIZE = RAM OF ONE MACHINE
  If your data is 200 GB but your best node has 128 GB RAM → IMPOSSIBLE.
  All slaves hold full copy. Adding slaves doesn't help with storage.

HARD LIMIT 2: WRITE THROUGHPUT = ONE MASTER'S CAPACITY
  10,000 writes/sec going to one master → bottleneck.
  Adding slaves does nothing for write throughput.
  → When you hit write limits → you need CLUSTER.

HARD LIMIT 3: SINGLE MASTER IS STILL A BOTTLENECK
  Even with 5 slaves, all writes funnel through one master.
  Hot key problem: one key being written 100,000x/sec → master melts.

WHEN MASTER-SLAVE BREAKS DOWN:
  ✗ Dataset > single node RAM
  ✗ Write throughput > single node capacity
  ✗ Hot key problem
  ✓ Works great for read-heavy, moderate data size workloads
```

---

## PART 3 — Cluster Architecture

### What Is It?

```
CLUSTER = Data is SPLIT (sharded) across multiple nodes.
          Each node owns a PORTION of the data.
          Each node can have its OWN replicas.

  ┌─────────────────────────────────────────────────────┐
  │                  YOUR APP                           │
  └──────────────┬──────────────────────────────────────┘
                 │ (smart client — knows the cluster topology)
       ┌─────────┼─────────┐
       │         │         │
       ▼         ▼         ▼
  ┌─────────┐ ┌─────────┐ ┌─────────┐
  │ NODE 1  │ │ NODE 2  │ │ NODE 3  │
  │ Primary │ │ Primary │ │ Primary │
  │         │ │         │ │         │
  │ Keys    │ │ Keys    │ │ Keys    │
  │ 0–5460  │ │5461–    │ │10923–   │
  │ (slots) │ │10922    │ │16383    │
  └────┬────┘ └────┬────┘ └────┬────┘
       │           │           │
  ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
  │REPLICA 1│ │REPLICA 2│ │REPLICA 3│
  │(backup  │ │(backup  │ │(backup  │
  │ of N1)  │ │ of N2)  │ │ of N3)  │
  └─────────┘ └─────────┘ └─────────┘

Each node handles ONLY its portion of keys.
Reads and writes are distributed across ALL nodes simultaneously.
```

### Hash Slots — How Data Is Distributed

```
Redis Cluster uses 16,384 HASH SLOTS to distribute data.

FORMULA: slot = CRC16(key) % 16384

Example with 3 primary nodes:
  Node 1: slots 0    – 5460    (1/3 of slots)
  Node 2: slots 5461 – 10922   (1/3 of slots)
  Node 3: slots 10923– 16383   (1/3 of slots)

When your app writes SET user:1001 "data":
  CRC16("user:1001") % 16384 = 7832
  7832 is in range 5461–10922 → goes to NODE 2

When your app writes SET user:2500 "data":
  CRC16("user:2500") % 16384 = 3291
  3291 is in range 0–5460 → goes to NODE 1

SMART CLIENT:
  Your Redis client knows the slot map.
  Sends command directly to the right node (no router needed).
  If it guesses wrong → node sends MOVED error → client redirects.

WHY 16,384 SLOTS (not 16,000 or 100)?
  Large enough to spread data well across many nodes.
  Small enough that the slot map fits in a small gossip message.
  Allows up to 16,384 nodes theoretically (1 slot per node).
  In practice: ElastiCache supports up to 500 shards.
```

### Real World: ElastiCache Redis (Cluster Mode ENABLED)

```
AWS ElastiCache with Cluster Mode Enabled = Redis Cluster

┌────────────────────────────────────────────────────────────────────┐
│                  AWS ELASTICACHE (Cluster Mode ON)                  │
│                                                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │   SHARD 1        │  │    SHARD 2       │  │   SHARD 3        │ │
│  │                  │  │                  │  │                  │ │
│  │ Primary          │  │ Primary          │  │ Primary          │ │
│  │ cache.r6g.2xl    │  │ cache.r6g.2xl    │  │ cache.r6g.2xl    │ │
│  │ RAM: 52 GB       │  │ RAM: 52 GB       │  │ RAM: 52 GB       │ │
│  │ Slots: 0–5460    │  │ Slots:5461–10922 │  │ Slots:10923–16383│ │
│  │ AZ: us-east-1a   │  │ AZ: us-east-1a   │  │ AZ: us-east-1a   │ │
│  │                  │  │                  │  │                  │ │
│  │ Replica          │  │ Replica          │  │ Replica          │ │
│  │ cache.r6g.2xl    │  │ cache.r6g.2xl    │  │ cache.r6g.2xl    │ │
│  │ AZ: us-east-1b   │  │ AZ: us-east-1b   │  │ AZ: us-east-1b   │ │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘ │
│                                                                    │
│  Total dataset capacity: 3 × 52 GB = 156 GB                        │
│  (vs Master-Slave max: 52 GB)                                      │
│  Write throughput: 3× compared to Master-Slave                     │
└────────────────────────────────────────────────────────────────────┘

YOUR APP connects to:
  Configuration Endpoint → client discovers all nodes from here
  Client routes each command to correct shard automatically
```

### How Cluster Handles a Write

```
App: SET product:5501:price 2499

Step 1: Client computes slot = CRC16("product:5501:price") % 16384 = 9876
Step 2: Slot 9876 → belongs to Shard 2 (slots 5461–10922)
Step 3: Client sends SET directly to Shard 2's Primary
Step 4: Shard 2 Primary writes to memory
Step 5: Shard 2 Primary replicates to its own Replica (async)
Step 6: Client gets OK response

Other shards are NOT involved. Zero coordination overhead.
Shard 1 and Shard 3 have NO IDEA this write happened.
```

### Failure Scenarios — Cluster

#### Scenario A: One Replica Dies

```
BEFORE:
  Shard 1: Primary(P1) ← healthy | Replica(R1) ← DIES
  Shard 2: Primary(P2) ← healthy | Replica(R2) ← healthy
  Shard 3: Primary(P3) ← healthy | Replica(R3) ← healthy

WHAT HAPPENS:
  ✓ Shard 1 Primary continues reads + writes for its slots.
  ✓ Shard 2 and Shard 3 completely unaffected.
  ✗ Shard 1 has no redundancy now — if P1 dies → entire shard is down.

USER IMPACT:  None immediately.
DATA LOSS:    None.
ACTION: AWS auto-replaces R1. New replica syncs from P1.
URGENCY: HIGH — don't leave a shard without replicas.
```

#### Scenario B: One Primary Dies (Failover Within Cluster)

```
BEFORE:
  Shard 1: Primary(P1) — AZ 1a ← DIES | Replica(R1) — AZ 1b ← healthy
  Shard 2: Primary(P2) — AZ 1a | Replica(R2) — AZ 1b  ← both healthy
  Shard 3: Primary(P3) — AZ 1a | Replica(R3) — AZ 1b  ← both healthy

WHAT HAPPENS:

  t=0s:    P1 stops responding.
  t=0–5s:  Cluster nodes detect P1 failure via gossip protocol.
           (Cluster nodes monitor each other directly — no Sentinel needed!)
  t=5s:    Remaining nodes vote: majority agrees P1 is down.
  t=5s:    R1 promoted to new Primary for Shard 1.
           R1 now handles slots 0–5460.
  t=5s:    Cluster topology updated. All nodes aware of change.
  t=5s:    Client receives MOVED / CLUSTERDOWN → refreshes slot map.

USER IMPACT:
  ✓ Shard 2 and Shard 3: COMPLETELY UNAFFECTED. ← KEY ADVANTAGE
  ✗ Shard 1: ~5–10 seconds of unavailability during failover.
  ✗ Keys in slots 0–5460: briefly unavailable.

DATA LOSS:
  Same as master-slave: up to ~10ms of async writes may be lost.

CLUSTER FAILOVER TIME: 5–15 seconds (faster than Sentinel's 30–60s)
Why faster? Cluster nodes detect failures via direct gossip, no external Sentinel.
```

#### Scenario C: AZ Goes Down (Multiple Primaries Affected)

```
CORRECT SETUP — Primaries and Replicas spread across AZs:
  Shard 1: P1 — AZ 1a  | R1 — AZ 1b
  Shard 2: P2 — AZ 1b  | R2 — AZ 1c   ← P2 in DIFFERENT AZ from P1
  Shard 3: P3 — AZ 1c  | R3 — AZ 1a

AZ 1a goes DOWN:
  P1 (AZ 1a) dies → R1 (AZ 1b) promotes to new P1  ✓
  R3 (AZ 1a) dies → P3 (AZ 1c) continues as primary, but no replica now ✗ (not ideal)
  P2 (AZ 1b) healthy ✓
  R2 (AZ 1c) healthy ✓

User impact: Shard 1 has ~5–15s failover. Shard 2 and 3 unaffected.
→ Partial AZ loss handled gracefully.


WORST CASE SETUP — All primaries in same AZ:
  Shard 1: P1 — AZ 1a  | R1 — AZ 1b
  Shard 2: P2 — AZ 1a  | R2 — AZ 1b   ← P2 in SAME AZ as P1!
  Shard 3: P3 — AZ 1a  | R3 — AZ 1b   ← P3 in SAME AZ as P1!

AZ 1a goes DOWN:
  P1, P2, P3 all go down simultaneously.
  R1, R2, R3 try to elect themselves as primaries.
  But: cluster needs majority of nodes to agree.
  With 3 of 6 nodes gone → depends on quorum config.
  Best case: all 3 replicas promote → brief 5-15s outage.
  Worst case: election fails → entire cluster frozen.

LESSON: Distribute primaries EVENLY across AZs, not all in one.
AWS ElastiCache does this automatically when Multi-AZ is enabled.
```

#### Scenario D: Network Partition (Split Brain in Cluster)

```
NETWORK PARTITION = A network failure splits your cluster into two halves
                    that can't communicate with each other.

EXAMPLE:
  Cluster has 6 nodes:  P1, P2, P3, R1, R2, R3
  Network splits into:
    Group A: P1, P2, R3       (3 nodes)
    Group B: P3, R1, R2       (3 nodes)

  Group A thinks B is down. Group B thinks A is down.
  Who is the "real" cluster?

REDIS CLUSTER SOLUTION:
  A node only accepts writes if it's reachable by majority of PRIMARIES.
  Group A has 2 primaries (P1, P2) out of 3 total → majority → stays active.
  Group B has 1 primary (P3) out of 3 total → minority → goes into CLUSTER_DOWN mode.
  P3 stops accepting writes to avoid split-brain data corruption.

  When network heals:
    P3 rejoins. Catches up with data from P1 and P2.
    Cluster resumes normal operation.

DATA WRITTEN TO P3 DURING PARTITION?
  If P3 accepted writes (before going CLUSTER_DOWN) → those writes are LOST.
  P3 rolls back to pre-partition state on rejoining.
  This is the trade-off: consistency over availability during partitions.
  (Redis Cluster favors Consistency — see CAP theorem)
```

---

## PART 4 — Master-Slave vs Cluster: Direct Comparison

```
DIMENSION              MASTER-SLAVE           CLUSTER
────────────────────────────────────────────────────────────────────────────
Max Dataset Size       RAM of 1 node          RAM × number of shards
                       (e.g., 52 GB max)      (e.g., 52 GB × 10 = 520 GB)

Write Throughput       1 node's capacity      N nodes' combined capacity
                       (one master)           (N primaries in parallel)

Read Throughput        (1 + replicas) × 1     N × (1 + replicas)
                       node capacity          node capacity per shard

Failover Time          30–60 seconds          5–15 seconds
                       (Sentinel-based)       (built-in gossip)

Complexity             Simple                 More complex
                       (easy to understand)   (slot maps, smart client)

Multi-key operations   Easy (all on 1 node)   Hard (keys may be on diff shards)
(MGET, pipeline)

Resharding             N/A (no shards)        Online resharding possible
(adding nodes)                                but temporarily slower

Hot Key Problem        YES (all writes to 1   Partially (hot key still
                       master — hot key       saturates its shard's primary)
                       saturates master)

AWS ElastiCache        Cluster Mode DISABLED   Cluster Mode ENABLED
Config                 (up to 5 replicas)      (up to 500 shards × 5 replicas)

Cost                   Lower                   Higher
                       (fewer nodes)           (more nodes needed)

Use for                Read-heavy,             Write-heavy,
                       small-medium dataset,   large dataset,
                       simple ops              need horizontal scale
────────────────────────────────────────────────────────────────────────────
```

---

## PART 5 — Highly Available Architecture Patterns

### Pattern 1: Standard Production (Master-Slave, Small-Medium App)

```
WHEN TO USE:
  Dataset: < single node RAM (e.g., < 50 GB)
  Reads: High (benefit from multiple read replicas)
  Writes: Moderate (master can handle alone)
  Example: Session store, feature flags, leaderboards for mid-size app

ARCHITECTURE:
           APP SERVERS (multiple, stateless)
                 │
        ┌────────▼─────────┐
        │  PRIMARY ENDPOINT │  ← writes go here (ElastiCache DNS)
        │  READER ENDPOINT  │  ← reads go here  (ElastiCache DNS)
        └────────┬─────────┘
                 │
  ┌──────────────▼──────────────────────────────┐
  │          ELASTICACHE REPLICATION GROUP       │
  │                                             │
  │  ┌─────────────────┐                        │
  │  │ PRIMARY          │  cache.r6g.2xlarge     │
  │  │ RAM: 52 GB       │  AZ: us-east-1a        │
  │  └────────┬─────────┘                        │
  │           │──── async replication ────▶      │
  │  ┌────────▼─────────┐                        │
  │  │ REPLICA 1        │  cache.r6g.2xlarge     │
  │  │ RAM: 52 GB       │  AZ: us-east-1b        │
  │  └──────────────────┘                        │
  │  ┌──────────────────┐                        │
  │  │ REPLICA 2        │  cache.r6g.2xlarge     │
  │  │ RAM: 52 GB       │  AZ: us-east-1c        │
  │  └──────────────────┘                        │
  └─────────────────────────────────────────────┘

Capacity: 52 GB data, ~300K reads/sec, ~80K writes/sec
Availability: 99.99% (survives 1 node or 1 AZ failure)
Failover: ~30–60 seconds
Cost: 3 × r6g.2xlarge = ~$600/month
```

### Pattern 2: Standard Production (Cluster, Large-Scale App)

```
WHEN TO USE:
  Dataset: Exceeds single node RAM (e.g., 500 GB)
  Writes: High (need multiple primaries)
  Example: Product catalog cache, user activity data, real-time analytics

ARCHITECTURE:
           APP SERVERS (with cluster-aware Redis client)
                 │
        ┌────────▼────────────────┐
        │  CONFIGURATION ENDPOINT │  ← client discovers topology here
        └────────┬────────────────┘
                 │ (client routes to correct shard)
   ┌─────────────┼─────────────┐
   │             │             │
   ▼             ▼             ▼
 SHARD 1       SHARD 2       SHARD 3        ...up to SHARD 10
 (0–5460)     (5461–10922)  (10923–16383)

 Each shard:
 ┌──────────────────────────┐
 │ Primary  — AZ us-east-1a │  cache.r6g.4xlarge (104 GB)
 │ Replica  — AZ us-east-1b │  cache.r6g.4xlarge (104 GB)
 └──────────────────────────┘

Total: 10 shards × 104 GB = 1.04 TB dataset capacity
       10 primaries → 10× write throughput vs single master
       20 nodes total (10 primary + 10 replica)
Availability: 99.999% (shard-level isolation — one shard failure ≠ full outage)
Failover: 5–15 seconds per shard
Cost: 20 × r6g.4xlarge = ~$4,000/month
```

### Pattern 3: Maximum HA (Multi-AZ Cluster with 2 Replicas per Shard)

```
WHEN TO USE:
  Financial systems, healthcare, e-commerce (cannot afford downtime)
  SLA requirement: 99.999% uptime (5.26 min/year downtime allowed)

ARCHITECTURE (3 shards, 2 replicas each = 9 nodes):

  SHARD 1:
    Primary  — AZ us-east-1a  (104 GB)
    Replica1 — AZ us-east-1b  (104 GB)
    Replica2 — AZ us-east-1c  (104 GB)

  SHARD 2:
    Primary  — AZ us-east-1b  ← note: different AZ from Shard 1 Primary
    Replica1 — AZ us-east-1c
    Replica2 — AZ us-east-1a

  SHARD 3:
    Primary  — AZ us-east-1c  ← different AZ from Shard 1 and 2 Primary
    Replica1 — AZ us-east-1a
    Replica2 — AZ us-east-1b

WHY STAGGER PRIMARY AZs?
  If AZ 1a goes down:
    Shard 1 Primary dies → Replica1 (1b) takes over  (5–15s blip)
    Shard 2 Primary (1b) alive ✓
    Shard 3 Primary (1c) alive ✓
  Only 1 of 3 shards experiences a brief failover.

  If AZs are NOT staggered (all primaries in 1a):
    AZ 1a goes down → ALL 3 primaries fail simultaneously.
    All 3 shards need failover at same time → cascading election overhead.

Can survive:
  ✓ Any 1 node failure per shard (2 replicas remain)
  ✓ Any full AZ failure (one shard fails over, others continue)
  ✓ 2 simultaneous node failures per shard (still have 1 node left)
```

### Pattern 4: Multi-Region (Disaster Recovery)

```
WHEN TO USE:
  Global applications, regulatory requirements, RPO = 0 (zero data loss)
  RPO = Recovery Point Objective (max data loss acceptable)
  RTO = Recovery Time Objective (max downtime acceptable)

ARCHITECTURE:
  Primary Region (Mumbai):
    ElastiCache Cluster (3 shards, 2 replicas each)
    Handles all writes + regional reads

  Secondary Region (Singapore):
    ElastiCache Cluster (3 shards, read-only replicas)
    Receives async replication from Mumbai
    Handles SE Asia reads

  Tertiary Region (Frankfurt):
    ElastiCache Cluster (3 shards, read-only replicas)
    Handles EU reads + DR backup

REPLICATION:
  Mumbai → Singapore: ~70ms lag (cross-region replication lag)
  Mumbai → Frankfurt: ~120ms lag

ON MUMBAI REGION FAILURE:
  Manual (or automated) promotion of Singapore to Primary.
  Traffic shifted via Route 53 health checks + DNS failover.
  RPO: ~70ms of data loss (last 70ms of writes not replicated yet).
  RTO: 1–5 minutes (DNS propagation + promotion).

NOTE: AWS ElastiCache Global Datastore provides this cross-region replication.
```

---

## PART 6 — Hot Key Problem: The Hidden Failure Mode

### What Is a Hot Key?

```
HOT KEY = A single cache key that receives disproportionately high traffic.

Example: Product launch on Flipkart.
  iPhone 16 launched → everyone checks stock simultaneously.
  Key: "product:iphone16:stock"
  Reads: 500,000/sec all hitting THIS ONE KEY

  Master-Slave: all 500K reads → ONE primary/replica → OVERLOADED
  Cluster: all 500K reads → the ONE shard owning this slot → OVERLOADED

SYMPTOMS:
  CPU spike on one specific Redis node.
  Latency spikes for requests involving that key.
  Other keys on same node also slow down (resource contention).
  Other nodes completely idle. Wasted capacity.
```

### Solutions for Hot Key

```
SOLUTION 1: LOCAL IN-MEMORY CACHE (L1 Cache before Redis)
  ┌──────────────┐     ┌────────────┐     ┌─────────────┐
  │  APP SERVER  │────▶│ LOCAL CACHE│────▶│    REDIS    │
  │              │     │(in process)│     │   (Redis)   │
  │              │     │ Guava/Caffeine    │             │
  └──────────────┘     └────────────┘     └─────────────┘

  Each app server caches the hot key locally for 1 second.
  100 app servers × 1 req/sec to Redis = 100 reads/sec (not 100,000/sec).
  TTL = 1 second to keep it fresh enough.

SOLUTION 2: KEY REPLICATION (spread the hot key)
  Instead of storing: "product:iphone16:stock"
  Store it N times:
    "product:iphone16:stock:0"
    "product:iphone16:stock:1"
    "product:iphone16:stock:2"
    ...
    "product:iphone16:stock:N"

  Read: GET "product:iphone16:stock:" + random(0, N)
  Each copy goes to a different shard → load spread evenly.

SOLUTION 3: READ REPLICAS (for master-slave)
  Add more read replicas.
  Reader endpoint distributes read load across all replicas.
  Effective if hot key traffic is READ-heavy (it usually is).

SOLUTION 4: CONSISTENT HASHING WITH VIRTUAL NODES
  More uniform distribution ensures no single shard gets too many popular keys.
```

---

## PART 7 — When to Use What: Decision Tree

```
START: What is your primary requirement?
          │
          ▼
    Is your dataset larger than the RAM of your biggest node?
    (e.g., dataset > 100 GB and max node RAM = 100 GB)
          │
    NO────┤                   YES
          │                    │
          ▼                    ▼
    Is write throughput    → USE CLUSTER (cluster mode enabled)
    your bottleneck?          Scale writes + storage across shards
          │
    YES───┤                   (confirm: cluster mode enabled)
          │
          ▼
    → USE CLUSTER (writes distributed across primaries)

    NO → Is read throughput your bottleneck?
          │
    YES───┤
          ▼
    → USE MASTER-SLAVE + ADD READ REPLICAS
      (reads scale linearly with replicas, dataset fits one node)

    NO → Simple single-master with 2 replicas for HA.

─────────────────────────────────────────────────────────────────
CONCRETE GUIDELINES:

  Dataset < 50 GB, reads heavy, writes moderate:
    → Master-Slave (ElastiCache cluster mode OFF)
    → 1 Primary + 2-3 Replicas across 3 AZs
    → Example: Session store, auth tokens

  Dataset 50 GB – 500 GB, mixed read/write:
    → Cluster with 3-5 shards (ElastiCache cluster mode ON)
    → Each shard: 1 Primary + 1 Replica across 2 AZs
    → Example: Product catalog, user preferences

  Dataset > 500 GB OR write throughput > 100K/sec:
    → Cluster with 10+ shards
    → Each shard: 1 Primary + 2 Replicas across 3 AZs
    → Example: Real-time user activity, global leaderboards

  Financial / Healthcare / Zero-downtime SLA:
    → Cluster + Multi-AZ + Multi-Region (Global Datastore)
    → 2+ Replicas per shard, staggered across AZs
    → Example: Payment session data, medical record cache
```

---

## PART 8 — Sizing With Real Numbers

### Example: Build a Cache for 10 Million User Sessions

```
REQUIREMENTS:
  Users: 10 million active sessions
  Each session: 2 KB (user ID, JWT token, preferences)
  Total dataset: 10M × 2 KB = 20 GB
  Reads: 50,000/sec (users refreshing pages)
  Writes: 10,000/sec (logins, updates)
  SLA: 99.99% uptime

DATASET CHECK:
  20 GB < 50 GB → fits on one node → Master-Slave is OK

WRITE CHECK:
  10,000 writes/sec — Redis handles 80,000+/sec on r6g.large → fine

READ CHECK:
  50,000 reads/sec — 1 primary + 2 replicas = 3 × 100K/sec = 300K/sec capacity → fine

ARCHITECTURE: Master-Slave (ElastiCache Cluster Mode DISABLED)

SIZING:
  Node type: cache.r6g.large (6.38 GB RAM)
  Wait — 20 GB doesn't fit in 6.38 GB!
  Try: cache.r6g.xlarge (13.07 GB RAM) — still not enough
  Try: cache.r6g.2xlarge (26.04 GB RAM) — 20 GB fits with room ✓

FINAL:
  1 Primary: cache.r6g.2xlarge — AZ us-east-1a
  1 Replica: cache.r6g.2xlarge — AZ us-east-1b
  1 Replica: cache.r6g.2xlarge — AZ us-east-1c
  Total cost: ~$600/month (3 × r6g.2xlarge)

  Availability: Survives 1 full AZ failure
  Failover: ~30–60 seconds
```

### Example: Build a Cache for E-Commerce Product Catalog

```
REQUIREMENTS:
  Products: 50 million SKUs
  Each product: 5 KB (name, price, images, description)
  Total dataset: 50M × 5 KB = 250 GB
  Reads: 500,000/sec (product page loads, search)
  Writes: 50,000/sec (price updates, inventory)
  SLA: 99.999% (zero tolerance — revenue impact)

DATASET CHECK:
  250 GB — biggest single Redis node on ElastiCache = cache.r6g.16xlarge (209 GB RAM)
  250 GB > 209 GB → CANNOT fit on one node → MUST USE CLUSTER

WRITE CHECK:
  50,000 writes/sec → fine for cluster (distributed across shards)

ARCHITECTURE: Cluster (ElastiCache Cluster Mode ENABLED)

SHARD CALCULATION:
  Need: 250 GB total
  Node: cache.r6g.4xlarge (104 GB RAM, use 80% = 83 GB safely)
  Shards needed: 250 GB / 83 GB = 3.01 → round up to 4 shards
  Add 25% headroom for growth: 5 shards

  Total capacity: 5 × 83 GB = 415 GB (headroom for growth ✓)

REPLICA CHOICE:
  99.999% SLA → need 2 replicas per shard (survive 2 node failures)

FINAL:
  5 shards × (1 Primary + 2 Replicas) = 15 nodes total
  Each node: cache.r6g.4xlarge
  AZ distribution: Stagger primaries across 3 AZs

  Shard 1: P — AZ 1a, R1 — AZ 1b, R2 — AZ 1c
  Shard 2: P — AZ 1b, R1 — AZ 1c, R2 — AZ 1a
  Shard 3: P — AZ 1c, R1 — AZ 1a, R2 — AZ 1b
  Shard 4: P — AZ 1a, R1 — AZ 1b, R2 — AZ 1c
  Shard 5: P — AZ 1b, R1 — AZ 1c, R2 — AZ 1a

  Total cost: 15 × r6g.4xlarge = ~$3,000/month
  Reads: 5 shards × 3 nodes × 100K = 1.5 million reads/sec capacity ✓
  Writes: 5 primaries × 80K = 400K writes/sec capacity ✓
  Availability: Survives any 1 AZ going fully down.
```

---

## PART 9 — Data Loss vs Availability Trade-offs

```
CONFIGURATION        FAILOVER    DATA LOSS        WRITE IMPACT
                     TIME        RISK             DURING FAILOVER
──────────────────────────────────────────────────────────────────────────
No replication       N/A         FULL (node dies  N/A
(single node)                    = all data gone)

Master-Slave         30–60s      Up to ~10ms of   Writes fail for 30–60s
(async replication)              recent writes    (Sentinel failover)

Master-Slave         30–60s      ZERO (slave       Writes BLOCKED until
(sync replication)               confirmed before  slave confirms each write
                                 master acked)     → slower writes always

Cluster              5–15s       Up to ~10ms       Only affected shard's
(async, per shard)               per failing shard writes fail; others fine

Cluster              5–15s       ZERO              Write latency increases
(sync, per shard)                                  by 1 round trip to replica

Multi-Region         1–5 min     Up to 70–120ms    Writes continue in
(cross-region async) manual      (cross-region     remaining region;
                     promotion   replication lag)  failover is manual

──────────────────────────────────────────────────────────────────────────
CHOOSE BASED ON:
  Zero data loss mandatory   → Use sync replication (accept slower writes)
  Fastest failover           → Use cluster (5–15s vs 30–60s)
  Simplest architecture      → Use master-slave
  Largest scale              → Use cluster
  Global DR                  → Multi-region (Global Datastore)
```

---

## PART 10 — Quick Reference Summary

```
MASTER-SLAVE                          CLUSTER
──────────────────────────────────────────────────────────────────────────
One copy of all data everywhere        Data split across shards
Scales READS (add replicas)           Scales WRITES + STORAGE (add shards)
Max data = one node's RAM             Max data = all shards × node RAM
Failover: 30–60s (Sentinel)           Failover: 5–15s (gossip protocol)
Simple client (single endpoint)       Smart client (knows slot map)
Easy multi-key ops                    Cross-shard multi-key ops complex
Best for: sessions, tokens, small     Best for: large datasets, write-heavy,
          read-heavy caches                     product catalog, activity data

──────────────────────────────────────────────────────────────────────────

ALWAYS DO (BOTH ARCHITECTURES):
  ✓ Minimum 3 nodes (1 primary + 2 replicas)
  ✓ Each node on a DIFFERENT PHYSICAL MACHINE
  ✓ Each node in a DIFFERENT AVAILABILITY ZONE
  ✓ Enable Multi-AZ failover in ElastiCache
  ✓ Set appropriate TTLs (don't let cache grow unbounded)
  ✓ Monitor replication lag (alert if lag > 1 second)
  ✓ Enable automatic backups (Redis snapshots to S3)

NEVER DO:
  ✗ Single node in production (no HA)
  ✗ All nodes in same AZ
  ✗ Cluster mode with keys that span shards without planning
  ✗ Ignore replication lag alerts
  ✗ Store data larger than node's RAM (Redis evicts!)

ELASTICACHE SPECIFIC:
  Cluster Mode OFF = Master-Slave (replication group)
  Cluster Mode ON  = Redis Cluster (sharded)
  Global Datastore = Multi-region active-passive
```
