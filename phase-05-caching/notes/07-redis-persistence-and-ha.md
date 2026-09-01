# 05·07 · Redis Persistence & High Availability

> **Why this exists:** the question *"can you lose your Redis?"* has a different answer depending on
> configuration, and most teams don't know which one they've chosen. Persistence also determines whether a
> restart is a **warm** recovery or a **cold-cache outage** ([05](05-failure-modes.md)).

---

## Reference

## Persistence

### RDB — point-in-time snapshots

**Fork the process and write the whole dataset to a compact binary file, periodically.**

| ✅ | ❌ |
|---|---|
| **Compact**; fast to load on restart | ⚠️ **You lose everything since the last snapshot** — minutes |
| Minimal effect on normal operation | ⚠️ **Fork can double memory** (copy-on-write) |
| Good for backups and replica bootstrap | Fork of a large dataset causes a latency spike |

### AOF — append-only log of writes

**Log every write command; replay on restart.** (Same idea as a database WAL —
[3a-07](../../phase-03-databases/notes/3a-07-wal-and-durability.md).)

| `appendfsync` | Durability | Cost |
|---|---|---|
| `always` | Every write fsynced — **lose ~nothing** | Very slow |
| ⭐ **`everysec`** | **Lose ≤ 1 second** | **The sane default** |
| `no` | OS decides | Fast, weakest |

AOF grows, so Redis periodically **rewrites** it (also a fork). Modern Redis supports a **hybrid**: an RDB
preamble plus an AOF tail — fast loading *and* a small loss window. **That's the recommended production
setup.**

### Choosing

| Situation | Config |
|---|---|
| ⭐ **Pure cache** | **Persistence off.** You can rebuild from the DB — but **then a restart is a cold-cache outage**, so plan for it. |
| Cache you'd rather restart warm | RDB — restarts reload the dataset |
| Session store, rate limiters | AOF `everysec` |
| Queue, or anything you can't lose | AOF `everysec` + replicas — **and honestly, consider whether Redis is the right store** |

> ⭐ **The decision to make explicitly:** *"Is losing this data an inconvenience or an incident?"* For a
> cache, persistence isn't about durability — it's about **avoiding a cold start**
> ([05](05-failure-modes.md)). That's a different reason to enable it, and a better one.

---

## High availability

### Sentinel — HA for a single primary

```
   Sentinel  Sentinel  Sentinel      (monitor, agree, promote)
        \        |        /
      primary -> replica -> replica
```

Sentinels monitor, **agree by quorum** that the primary is down, elect one Sentinel to run the failover, and
promote a replica. Clients ask Sentinel for the current primary address.

| ✅ | ❌ |
|---|---|
| Automatic failover | **No sharding** — one primary's worth of writes and memory |
| Simple | ⚠️ **Replication is asynchronous → acknowledged writes can be lost on failover** |
| Clients handle it via Sentinel-aware libraries | Failover takes seconds |

⚠️ **`WAIT numreplicas timeout`** forces a wait for replication — but it is **not** a transaction and does
not make Redis strongly consistent. Redis is explicitly not a linearizable store.

### Cluster — sharding + HA

**16,384 hash slots** distributed across primaries; each primary has replicas.

```
CRC16(key) mod 16384 -> slot -> the primary owning that slot
```

| ✅ | ❌ |
|---|---|
| **Horizontal scaling** of memory and throughput | **Multi-key ops must be in one slot** |
| Automatic failover per shard | Client must be cluster-aware (`MOVED`/`ASK` redirects) |
| Resharding by moving slots | No cross-slot transactions or Lua |

⭐ **Hash tags** force related keys into the same slot:
```
user:{42}:profile   and   user:{42}:sessions   -> same slot (only "42" is hashed)
```
**Without hash tags, `MGET user:1:a user:2:b` fails across slots.** This is the constraint that most often
surprises people migrating from a single Redis to Cluster.

> **Note the design choice: 16,384 fixed slots is exactly the "logical partitions" idea**
> ([3d-02](../../phase-03-databases/notes/3d-02-partitioning-strategies.md)). Keys map to slots forever;
> rebalancing moves *slots* between nodes. The key→slot mapping never changes.

### Sentinel vs Cluster vs managed

| | **Sentinel** | **Cluster** | **Managed (ElastiCache/MemoryDB)** |
|---|---|---|---|
| Sharding | ❌ | ✅ | ✅ |
| Failover | ✅ | ✅ | ✅ |
| Multi-key ops | ✅ Anywhere | ⚠️ Same slot only | Same as chosen mode |
| Ops burden | Medium | High | ⭐ **Low** |
| When | Fits one node | Doesn't fit one node | **Usually the right answer** |

> **The mature take:** *"If it fits on one node, use a single primary with replicas — Cluster's multi-key
> restrictions are a real tax. And I'd use a managed Redis unless there's a reason not to; operating Redis
> Cluster well is a genuine specialisation."*

### ⚠️ Redis is not a database

Say this plainly when it matters:

- **Asynchronous replication** → a failover can lose acknowledged writes
- **No consensus** — this is the heart of the Redlock critique ([09](09-redlock.md))
- Split-brain is possible during partitions; `min-replicas-to-write` reduces but doesn't eliminate it
- **Redis MemoryDB** (AWS) is the exception — it adds a durable multi-AZ transaction log, and is explicitly
  positioned as a *database*

> **The framing: Redis is an extremely fast, weakly-durable store.** That's a feature when you want speed and
> a liability when you assume durability. **Choose deliberately.**

---

## In your own words

**RDB vs AOF — what does each lose, and what's the recommended hybrid?**

>

**For a pure cache, what's the real reason to enable persistence? (Hint: it isn't durability.)**

>

**Sentinel vs Cluster — what does each solve, and what's Cluster's main tax?**

>

**What are hash tags for? Give the failure they prevent.**

>

**How is Redis Cluster's 16,384 slots the same idea as logical partitions?**

>

**Give three reasons Redis is not a database.**

>

---

## Links

- Single-threaded model, memory, forks → [06-redis-internals.md](06-redis-internals.md)
- Cold cache — the real reason for persistence → [05-failure-modes.md](05-failure-modes.md)
- **Redlock and the consensus critique** → [09-redlock.md](09-redlock.md)
- Logical partitions → [3d-02](../../phase-03-databases/notes/3d-02-partitioning-strategies.md)
- WAL as the same idea → [3a-07](../../phase-03-databases/notes/3a-07-wal-and-durability.md)
