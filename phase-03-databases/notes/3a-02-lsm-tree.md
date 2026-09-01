# 3A·02 · LSM Trees

> **Why this exists:** LSM trees power Cassandra, RocksDB, ScyllaDB, HBase, LevelDB, and the storage layer of
> a great many modern systems. The "why does this exist" answer is precise: **B-trees write-amplify because
> they update pages in place, at random locations. LSM trees turn every write into a sequential append.**

---

## Reference

### The core idea

**Never update in place. Buffer writes in memory, then flush them to disk as sorted, immutable files.
Merge those files in the background.**

```
WRITE PATH
                    ┌──────────────────┐
  write ──▶ WAL ──▶ │   MEMTABLE (RAM) │   sorted structure (skip list / red-black tree)
            (durability)└────────┬─────┘
                                 │ full? flush
                                 ▼
      ┌────────────────────────────────────────────┐
      │  L0:  SSTable  SSTable  SSTable            │  immutable, sorted, on disk
      │  L1:  SSTable  SSTable  ...                │
      │  L2:  ...                                  │  ← compaction merges downward
      └────────────────────────────────────────────┘
```

1. **Write → WAL** (sequential append, for crash recovery) **→ memtable** (in RAM, kept sorted)
2. Memtable fills → **flush to disk as an SSTable** (Sorted String Table): immutable, sorted, written
   **sequentially in one pass**
3. SSTables accumulate → **compaction** merges them in the background, discarding overwritten and deleted keys

**Every disk write is sequential.** That's the entire point — sequential writes are 100–1000× faster than
random writes on HDD, and still several times faster on SSD (and much kinder to flash wear).

### Reads — and why they're harder

A key could be in the memtable, or *any* SSTable. So a read checks:

```
1. memtable                    (RAM, fast)
2. L0 SSTables (newest first)  ← L0 files may have OVERLAPPING key ranges
3. L1, L2, ... (older)
```

**This is read amplification: one logical read may touch many files.** Two mechanisms fix it:

| Mechanism | What it does |
|---|---|
| **Bloom filter** (one per SSTable) | Probabilistic set membership. *"Is key X definitely NOT here?"* **No false negatives**, ~1% false positives. Lets a read **skip most SSTables without touching disk.** |
| **Sparse index / block index** | Every Nth key is indexed in memory, so within an SSTable you binary-search to a block rather than scanning |

> **Bloom filters are what make LSM reads viable at all.** Without them, a point lookup on a miss would have
> to touch every SSTable. Worth knowing the mechanism: k hash functions set k bits; if any bit is 0, the key
> is definitely absent. → Phase 9 (you implement one).

**Range scans can't use bloom filters** (they're membership-only), so ranges must merge across all levels —
which is why LSM range scans are weaker than B+Tree leaf-chain walks.

### Deletes — tombstones

You can't delete from an immutable file. So a delete **writes a marker** — a *tombstone*.

```
DELETE key=42  →  write (42, TOMBSTONE)
```

The key is only truly gone once compaction merges away every older version.

**Consequences worth knowing:**
- **A delete makes the database bigger, not smaller** — until compaction runs
- **Deleted data keeps costing read time** — reads must scan past tombstones
- **The Cassandra classic:** a queue-like table with heavy deletes accumulates tombstones; reads scan
  thousands of them and time out. `tombstone_failure_threshold` exists because of this. **"Don't use
  Cassandra as a queue" is a well-known rule and this is why.**
- Tombstones must survive `gc_grace_seconds` before removal, or a deleted row can **resurrect** from a replica
  that was offline during the delete

### Compaction — the knob that matters

Compaction merges SSTables, discarding superseded values and tombstones. **The strategy is a direct trade
between read, write and space amplification.**

| Strategy | How | Write amp | Read amp | Space amp | Use when |
|---|---|---|---|---|---|
| **Size-tiered (STCS)** | Merge SSTables of similar size into a bigger one | **Low** | High | **High (~2×)** — needs room for a full copy of the largest tier | **Write-heavy** (Cassandra default) |
| **Leveled (LCS)** | Levels with **non-overlapping** key ranges; L(n) ≈ 10× L(n-1) | **High (~10–30×)** | **Low** — at most 1 file per level | **Low (~1.1×)** | **Read-heavy**, space-constrained (RocksDB default) |
| **Time-window (TWCS)** | Bucket by time window, compact within windows | Low | Low for time-range reads | Low | **Time-series with TTL** — whole SSTables expire and get dropped |

> **The one-liner: size-tiered optimises writes and costs you space and reads; leveled optimises reads and
> space and costs you writes.** Being able to say that — and pick one from a workload — is the senior signal
> here.

**Compaction is not free and it's the operational pain point:** it consumes CPU, disk I/O and disk space in
the background, and if writes outpace it, SSTables pile up, read amplification climbs, and the system enters
a death spiral. **"Compaction can't keep up" is a real Cassandra incident.**

### The three amplifications — know all three by name

| Amplification | Definition | Worst in |
|---|---|---|
| **Write** | Bytes written to disk ÷ bytes written by the app | Leveled LSM (~10–30×), B-tree (~2–10× with full-page writes) |
| **Read** | Disk reads per logical read | Size-tiered LSM |
| **Space** | Disk used ÷ live data size | Size-tiered LSM (~2×), MVCC bloat in B-trees |

**You cannot minimise all three at once** — this is the *RUM conjecture* (Read, Update, Memory: pick two).
Every storage engine is a point on that triangle, and naming the tradeoff that way is a strong answer.

### Why LSM often wins on space despite the copies

Counter-intuitive but true: **SSTables are densely packed and highly compressible.**

- B+Tree pages are typically only ~70% full (fillfactor, splits, fragmentation)
- SSTables are written full, in sorted order, and compress extremely well (sorted similar values)
- **Result: LSM storage is often 2–5× smaller than the equivalent B-tree**, even with compaction overhead

### Where LSM shows up

| System | Notes |
|---|---|
| **Cassandra / ScyllaDB** | LSM + wide-column. Size-tiered by default. |
| **RocksDB / LevelDB** | The embedded LSM library. Leveled by default. Under **many** other systems. |
| **HBase / Bigtable** | The original design (the Bigtable paper) |
| **MyRocks** | RocksDB as a MySQL storage engine — for write-heavy workloads |
| **InfluxDB, Prometheus TSDB** | Time-series variants |
| **Kafka** | Not an LSM, but the same core insight: **append-only sequential writes are fast** |

---

## In your own words

**State the "why does this exist" answer for LSM trees in one sentence.**

>

**Trace the write path from `INSERT` to a file on disk. Where's the durability point?**

>

**Why are LSM reads harder than B-tree reads? Name the two mechanisms that rescue them.**

>

**Explain a tombstone and why a delete can make your database bigger AND slower.**

>

**Why is "don't use Cassandra as a queue" a rule? Connect it to tombstones.**

>

**Size-tiered vs leveled compaction — state the trade in one sentence, then pick one for a metrics ingest workload.**

>

**Name the three amplifications and which strategy is worst for each.**

>

---

## Links

- The read-optimised alternative → [3a-01-btree.md](3a-01-btree.md)
- **Choosing between them** → [3a-03-btree-vs-lsm.md](3a-03-btree-vs-lsm.md)
- WAL (both engines use one) → [3a-07-wal-and-durability.md](3a-07-wal-and-durability.md)
- Bloom filters, implemented → Phase 9
- Cassandra data modelling, tunable consistency → Phase 3F
- **DDIA ch. 3** · Bigtable paper · Cassandra paper
