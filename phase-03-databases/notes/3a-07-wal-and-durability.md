# 3A·07 · WAL, Checkpointing & Durability

> **Why this exists:** the WAL is how a database survives a crash, and **`fsync` is where durability actually
> happens.** It's also the foundation of replication (3C), point-in-time recovery, and CDC (Phase 6) — so
> understanding it here pays off three more times.

---

## Reference

### The problem

You `COMMIT`. The database says OK. **Power fails one millisecond later.** Is your data there?

Writing the actual data pages on every commit would be **random I/O** to scattered B-tree pages — far too
slow. So instead:

### Write-Ahead Logging — the rule

> **Before modifying any data page, first append a record describing the change to a sequential log.
> Flush that log to durable storage. Only then is the transaction committed.**

```
COMMIT:
  1. append change records to the WAL          (SEQUENTIAL append — fast)
  2. fsync() the WAL                           ← durability happens HERE
  3. return "committed" to the client
  ...later, asynchronously:
  4. write the modified data pages to disk     (random I/O, batched, at leisure)
```

**The trick: turn expensive random writes into one cheap sequential write, and defer the random part.**
Data pages are written later, in the background, in batches, in whatever order is efficient.

**Recovery after a crash:** replay the WAL from the last checkpoint. Committed transactions are re-applied
(redo); uncommitted ones are rolled back (undo).

**Names by system:** Postgres = WAL · MySQL/InnoDB = redo log (+ undo log) · SQLite = WAL/rollback journal ·
Oracle = redo log · LSM stores = commit log. **Same idea everywhere.**

### fsync — where durability actually lives

**This is the part people miss.** A `write()` syscall does **not** put data on disk. It puts it in the OS page
cache. `fsync()` is what forces it to durable storage.

```
app write()  →  OS page cache  →  fsync()  →  disk controller cache  →  PLATTER/FLASH
                     ↑                              ↑
              lost on OS crash            lost on power loss if the drive
                                          lies about its cache (many do)
```

**Layers that can lie to you:**

| Layer | Risk |
|---|---|
| OS page cache | Lost on kernel panic / power loss. `fsync` handles this. |
| **Disk write cache** | Some consumer SSDs acknowledge `fsync` before data is durable. **Enterprise drives have power-loss protection; consumer ones often don't.** |
| RAID controller cache | Safe **only** with a battery/flash backup unit (BBU) |
| Virtualised/cloud storage | Usually honest, but it's a layer of indirection |

> **`fsync` is expensive** — 0.1–10 ms depending on hardware — and it's on the commit path, so **it sets your
> maximum commit rate.** This is why:
> - **Group commit** exists: batch many transactions' commits into one `fsync`. Massive throughput win.
> - Write-heavy databases put the WAL on **its own fast device**.
> - Turning `fsync` off makes benchmarks look spectacular and makes your database a liar.

### The durability knobs (and what each really means)

| Postgres `synchronous_commit` | Behaviour | Loss window |
|---|---|---|
| `on` (default) | `fsync` WAL before ack | **Zero on single-node crash** |
| `off` | Ack immediately; WAL flushed within `wal_writer_delay` | **Up to ~600 ms of committed transactions** — but **no corruption**, just loss |
| `local` | fsync locally, don't wait for replicas | Loses recent commits on failover |
| `remote_write` / `on` (with sync replicas) | Wait for replica too | Survives node loss — costs a network RTT (3C) |

**MySQL's equivalent:** `innodb_flush_log_at_trx_commit` — `1` = fsync per commit (durable), `2` = write to OS
cache only, `0` = flush once per second.

> **The senior framing:** *"`synchronous_commit = off` gives a large throughput win and bounded data loss —
> up to about 600 ms of committed transactions — with no corruption risk. For analytics ingest or clickstream
> events that's a completely reasonable trade. For a payment ledger it isn't."*
>
> **Naming the loss window as a number** is what makes this a senior answer rather than "we turned off
> durability."

### Checkpointing

The WAL can't grow forever, and replay can't start from the beginning of time.

**A checkpoint flushes all dirty data pages to disk and records "the WAL before this point is no longer
needed for recovery."**

| Trade | Effect |
|---|---|
| **Frequent checkpoints** | Fast recovery, small WAL — but **constant background I/O**, and I/O *spikes* |
| **Infrequent checkpoints** | Less steady I/O — but **slow recovery** and a large WAL |

**The checkpoint spike is a real production problem:** a burst of dirty-page writes stalls foreground queries.
Postgres mitigates with `checkpoint_completion_target` (spread the writes over the interval).

**Full-page writes:** after a checkpoint, the **first** modification to any page writes the *entire* page to
the WAL. This protects against **torn pages** (a partial 8 KB page write during a crash). It's a major source
of WAL volume — and it's why WAL traffic spikes right after each checkpoint.

### What the WAL enables beyond crash recovery

**This is why the WAL matters far beyond this note:**

| Capability | How |
|---|---|
| **Physical replication** | Ship WAL records to a replica and replay them → **3C** |
| **Point-in-time recovery (PITR)** | Base backup + WAL replay to any moment. **This is how you recover from `DROP TABLE`** — replication can't. |
| **Logical replication / CDC** | Decode the WAL into row-level changes → Debezium, the **outbox pattern** → **Phase 6** |
| **Standby / read replicas** | Continuous WAL replay |
| **Backups** | `pg_basebackup` + WAL archiving |

> **Worth saying out loud: the WAL is the single most reused mechanism in databases.** Crash recovery,
> replication, backups, and change data capture are all the same log read by different consumers.

### Failure modes to know

| Problem | Cause | Symptom |
|---|---|---|
| **WAL disk full** | Archiving broken, or a stuck replication slot | **Database stops accepting writes.** A very common outage. |
| **Orphaned replication slot** | A replica disappeared; the slot still retains WAL | WAL grows forever → disk full. **Monitor slot lag.** |
| Checkpoint I/O spikes | Too much dirty data at once | Periodic latency spikes |
| Long recovery after crash | Infrequent checkpoints | Minutes of downtime on restart |
| Silent corruption | Lying disk cache, no checksums | Detected far too late. **Enable checksums.** |

**The orphaned replication slot is worth remembering** — "the database stopped accepting writes because a
decommissioned replica's slot filled the WAL disk" is a genuinely common incident, and it's the sort of
detail that signals operational experience.

---

## In your own words

**State the write-ahead rule in one sentence. What problem does it solve?**

>

**Why is appending to a log faster than writing the data pages directly?**

>

**Where does durability actually happen, and name two layers that can lie about it.**

>

**`synchronous_commit = off` — what exactly do you lose, and what do you NOT lose? When is it acceptable?**

>

**Explain the checkpoint frequency trade-off. What's the visible production symptom of getting it wrong?**

>

**What are full-page writes for, and why do they make WAL volume spiky?**

>

**Name four things besides crash recovery that the WAL enables.**

>

**Why can a decommissioned replica stop your primary from accepting writes?**

>

---

## Links

- Where the data pages live → [3a-01-btree.md](3a-01-btree.md)
- LSM stores use a commit log for the same reason → [3a-02-lsm-tree.md](3a-02-lsm-tree.md)
- ACID's D → [3b-01-acid.md](3b-01-acid.md)
- **Replication built on the WAL** → Phase 3C
- **CDC / Debezium / outbox** → Phase 6
- Backups vs replication, RPO/RTO → Phase 7
