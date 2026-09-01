# 3C·01 · Single-Leader Replication

> **Why this exists:** single-leader is what you'll actually use in ~95% of designs, and the sync/async choice
> is a **durability-vs-latency trade you must be able to state as a number**, not a preference.

---

## Reference

### Why replicate at all — four different reasons

| Reason | Note |
|---|---|
| **High availability** | A node dies, another takes over |
| **Read scaling** | Spread reads across replicas. **Does nothing for writes.** |
| **Latency** | Put a replica near your users |
| **Durability** | Survive losing a machine (**not** a substitute for backups) |

**Say which one you're solving for**, because they lead to different topologies. "Add a replica" for read
scaling and "add a replica" for HA are different conversations.

### The model

```
        writes
          │
      ┌───▼────┐   WAL stream    ┌──────────┐
      │ LEADER │ ──────────────▶ │ FOLLOWER │ ◀── reads
      │(primary)│ ──────────────▶ │ FOLLOWER │ ◀── reads
      └────────┘                 └──────────┘
```

**All writes go to the leader. Followers are read-only and apply the leader's change stream in order.**

That single constraint is the whole model, and its consequence is the thing to say out loud:
**replicas scale reads, never writes.** If you're write-bound, replication doesn't help — you need
partitioning (3D).

### Synchronous vs asynchronous vs semi-synchronous

| | **Async** | **Sync** | **Semi-sync (quorum)** |
|---|---|---|---|
| Leader waits for | **Nothing** | **All** designated replicas | **k of n** replicas |
| Write latency | Leader's own commit | **+1 network RTT + replica fsync** | +1 RTT to the *fastest* k |
| Data loss on leader failure | **Yes — the unreplicated tail** | **None** (from acked writes) | None, if k ≥ 1 survives |
| A slow replica... | doesn't matter | ⚠️ **blocks every write** | is routed around |
| Availability | Highest | **Lowest** | Good |
| Default in | **Postgres, MySQL** | — | MySQL semi-sync, Postgres `ANY k` |

**The critical failure mode of fully-synchronous replication:** if the sync replica goes down or gets slow,
**the leader cannot commit anything.** You have made your write availability *worse* by adding a replica.

> **This is why nobody runs one synchronous replica.** With `synchronous_standby_names = 'ANY 1 (r1, r2)'`
> you get zero-data-loss commits while tolerating one replica being down — the quorum form is almost always
> the right answer.

**Postgres levels** (`synchronous_commit`), from weakest to strongest:

| Value | Leader waits until |
|---|---|
| `off` | Nothing — even local WAL flush is deferred (~600 ms loss window) |
| `local` | Local WAL fsync only |
| `remote_write` | Replica has **written** (OS cache) — survives replica *process* crash, not power loss |
| `on` | Replica has **flushed** to disk — the usual "sync" setting |
| `remote_apply` | Replica has **applied** it → **reads on the replica are guaranteed to see it.** Most expensive. |

> **`remote_apply` is the interesting one:** it's the only setting that gives you *read-your-writes on the
> replica* for free. Almost nobody uses it because it puts replica replay on the commit path — but knowing it
> exists, and why it's expensive, is a good detail.

### The trade, stated as a number

> *"Synchronous replication costs one network round trip per commit — about 1 ms within a region, 50–150 ms
> across regions — in exchange for a zero-data-loss guarantee. For a payment ledger I'd pay it. For
> clickstream ingest I wouldn't, and I'd accept an RPO of a few seconds instead."*

**That sentence is the answer.** Name the cost, name the benefit, pick based on what the data is worth.

**Cross-region synchronous replication is usually wrong** for exactly this reason: 150 ms on every commit is
a product-level latency change ([Phase 0 note 02](../../phase-00-foundations/notes/02-latency-numbers.md)).
The usual pattern is **sync within a region, async across regions**.

### Setting up a new follower

You cannot just copy files from a running database — they're changing underneath you. The procedure:

```
1. Take a consistent SNAPSHOT of the leader (pg_basebackup; no downtime)
2. Note the exact LOG POSITION the snapshot corresponds to (LSN / GTID / binlog coords)
3. Restore the snapshot onto the follower
4. Follower connects and requests all changes SINCE that position
5. Follower catches up ("caught up" = it has processed the backlog), then streams live
```

**The log position is the whole trick** — it's what makes the snapshot and the stream splice together
seamlessly.

**Replication slots** (Postgres) make the leader **retain WAL** until a named follower has consumed it.
Prevents "the follower fell too far behind and the WAL it needs is gone."

> ⚠️ **The cost of a slot, and it's a real outage:** if that follower disappears permanently, the slot keeps
> retaining WAL **forever** → the leader's disk fills → **the leader stops accepting writes.** Always monitor
> slot lag and drop orphaned slots. ([3a-07](3a-07-wal-and-durability.md))

### Follower failure vs leader failure

**Follower fails — easy.** It restarts, reads its last-known log position, requests everything since, catches
up. No coordination required.

**Leader fails — hard.** That's failover, and it's [3c-04](3c-04-failover.md), which is where the genuinely
interesting problems live.

### What replicas can and can't do for you

| Can | Can't |
|---|---|
| Scale reads | **Scale writes** |
| Provide HA (with failover) | Protect against `DROP TABLE` — **replication faithfully copies your mistake** |
| Serve nearby users | Give strong consistency for free (lag → [3c-02](3c-02-replication-lag.md)) |
| Offload backups, analytics | Remove the need for backups |

**"Replication is not a backup"** ([Phase 0 note 05](../../phase-00-foundations/notes/05-availability-vs-durability.md))
is worth repeating here because this is where people conflate them.

---

## In your own words

**Name the four reasons to replicate. Why does saying which one you're solving for matter?**

>

**Why do replicas scale reads but not writes? What do you need instead?**

>

**Explain the failure mode of one synchronous replica. What's the fix?**

>

**State the sync-vs-async trade as a number, and give one workload for each side.**

>

**Why can't you just copy the data files to make a new follower? What makes the procedure work?**

>

**Why can a decommissioned replica take down your primary?**

>

---

## Links

- WAL, the thing being shipped → [3a-07-wal-and-durability.md](3a-07-wal-and-durability.md)
- **Lag and its consequences** → [3c-02-replication-lag.md](3c-02-replication-lag.md)
- How the changes are encoded → [3c-03-replication-methods.md](3c-03-replication-methods.md)
- Failover and split brain → [3c-04-failover.md](3c-04-failover.md)
- **Measure it** → [`../lab/lab-c-replication/`](../lab/lab-c-replication/)
- **DDIA ch. 5**
