# 3A·03 · B-Tree vs LSM — The Core Tradeoff

> **Why this exists:** the roadmap states the gate directly — *"be able to pick one from a workload
> description."* This is a decision you'll make out loud in interviews, and the justification matters more
> than the choice.

---

## Reference

### The one-line version

> **B-tree = read-optimised, update-in-place.**
> **LSM = write-optimised, append-only.**

Everything else follows from *update-in-place* vs *append-only*.

### The comparison

| | **B+Tree** | **LSM Tree** |
|---|---|---|
| Write path | Find page, **modify in place** (random I/O) | **Append** to memtable → sequential flush |
| Write throughput | Lower | **Higher — often 10×+** |
| Write latency | Predictable | Low, but **compaction causes latency spikes** |
| Point read | **~4 page reads, predictable** | Memtable + N SSTables (bloom filters help) |
| Range scan | **Excellent — walk the linked leaves** | Weaker — must merge across levels |
| Read latency variance | **Low and predictable** | **Higher — this is the real cost** |
| Space | ~70% page utilisation, fragments | **Denser, compresses better — often 2–5× smaller** |
| Write amplification | 2–10× (worse with full-page writes) | 10–30× (leveled), lower (size-tiered) |
| Background work | Vacuum, index rebuilds | **Compaction — continuous, and can fall behind** |
| Transactions | **Mature, easy** — one place per key | Harder; usually weaker isolation |
| Secondary indexes | **Strong** | Weak/awkward (Cassandra's are a known trap) |
| Examples | Postgres, MySQL/InnoDB, Oracle, SQLite | Cassandra, ScyllaDB, RocksDB, HBase, LevelDB |

### Pick from the workload — the decision table

| Workload signal | Choose | Because |
|---|---|---|
| **Write-heavy** (metrics, logs, events, IoT, clickstream) | **LSM** | Sequential writes; this is the design centre |
| **Read-heavy with complex queries** | **B-tree** | Predictable reads, joins, mature planner |
| **Append-only, time-ordered** | **LSM** (esp. TWCS) | Perfect fit; whole SSTables expire together |
| **Frequent updates to existing rows** | **B-tree** | LSM turns every update into a new version to compact later |
| **Heavy deletes** | **B-tree** | LSM tombstones accumulate and slow reads |
| **Range scans / `ORDER BY` / pagination** | **B-tree** | Linked leaves |
| **Point lookups by key at massive scale** | **LSM** | Bloom filters make this cheap; scales horizontally |
| **Need transactions, joins, FKs** | **B-tree** (relational) | LSM stores generally don't offer them |
| **Predictable low-latency reads (p99 matters)** | **B-tree** | Compaction spikes hurt LSM tails |
| **Storage cost dominates** | **LSM** | Better compression and density |

> **The sentence to produce in an interview:**
> *"This is an append-only, write-heavy, time-ordered workload with point-and-range-by-partition reads and no
> need for joins — that's an LSM shape, so Cassandra. If it were read-heavy with ad-hoc queries and updates,
> I'd stay on Postgres."*
>
> Notice: **name the workload properties first, then the engine.** Never the other way round.

### The nuance that shows depth

**1 · "Write-heavy" is not the whole story — read the *access pattern*.**
A write-heavy workload with **frequent updates to the same keys** is a poor LSM fit: every update creates a
version that compaction must reconcile. LSM's sweet spot is **append-heavy**, not merely write-heavy.

**2 · Compaction is a p99 problem.**
LSM write *throughput* is excellent, but compaction consumes I/O in the background, so **read and write
tails spike**. For a strict p99 SLA, B-trees are more predictable. Bring this up — it's the cost people omit.

**3 · SSDs narrowed the gap, but didn't close it.**
Random I/O is far cheaper on NVMe than on spinning disks, which weakens the original LSM argument. But
sequential writes are still faster, and **flash wear** matters: fewer, larger writes extend SSD life. LSM
remains the better fit for sustained heavy writes.

**4 · The engine isn't the only axis.** "Postgres vs Cassandra" is also relational-vs-wide-column,
single-node-vs-distributed, joins-vs-no-joins, strong-vs-tunable consistency. **The storage engine is often
not the deciding factor** — say that if it's true. → [Phase 3F].

**5 · You can have both.** MyRocks (RocksDB under MySQL), Postgres with columnar extensions, TiDB, YugabyteDB.
And most real systems use *both* engines in different places.

### Where each amplification bites

From [3a-02](3a-02-lsm-tree.md) — the **RUM conjecture**: Read, Update, Memory — you can optimise two.

```
        Read-optimised
              ▲
              │   B+Tree
              │
   Space  ◀───┼───▶  Write-optimised
  (LSM lvl)   │      (LSM size-tiered)
```

- **B+Tree**: good reads, moderate space, weaker writes
- **LSM leveled**: good reads, good space, **heavy write amplification**
- **LSM size-tiered**: good writes, poor space (~2×), poorer reads

**There is no configuration that wins all three.** Saying so — and then picking based on the workload — is
the answer.

---

## In your own words

**State the core tradeoff in one sentence, and name the structural cause.**

>

**Given: "ingest 1 M sensor readings/sec, query the last hour by device." Pick an engine and justify from the workload properties.**

>

**Given: "e-commerce orders, 5 K QPS, lots of status updates, needs joins and transactions." Pick and justify.**

>

**Why is "write-heavy" insufficient to choose LSM? What extra property do you need?**

>

**Why might you choose a B-tree even for a write-heavy workload? (Think p99.)**

>

**State the RUM conjecture and place all three engine configurations on it.**

>

---

## Links

- [3a-01-btree.md](3a-01-btree.md) · [3a-02-lsm-tree.md](3a-02-lsm-tree.md)
- Workload shape as a design driver → [Phase 0 note 10](../../phase-00-foundations/notes/10-workload-shape.md)
- Choosing an actual datastore (the broader decision) → Phase 3F
- **DDIA ch. 3**, "Comparing B-Trees and LSM-Trees"
