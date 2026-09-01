# 3A·01 · B+Trees

> **Why this exists:** B+Trees are what Postgres, MySQL/InnoDB, Oracle and SQL Server actually use. Knowing
> the *shape* explains almost every performance behaviour you'll observe: why lookups are ~4 disk reads, why
> random inserts are slow, why UUIDv4 primary keys hurt, and why an index costs you on every write.

---

## Reference

### The structure

```
                    ┌──────────────┐
        root        │  50  │  100  │              ← internal nodes: KEYS ONLY (no data)
                    └───┬──┴───┬───┘
             ┌──────────┘      └──────────┐
        ┌────▼────┐                  ┌────▼────┐
internal│ 10 │ 30 │                  │120 │160 │
        └──┬──┴─┬─┘                  └──┬──┴─┬─┘
     ┌─────┘    └────┐             ┌────┘    └────┐
  ┌──▼──┐         ┌──▼──┐       ┌──▼──┐        ┌──▼──┐
  │ 1-9 │◀───────▶│10-29│◀─────▶│...  │◀──────▶│160+ │   ← LEAVES: keys + data (or pointers)
  └─────┘         └─────┘       └─────┘        └─────┘
       └───── doubly-linked list across leaves ─────┘
```

**B+Tree (not plain B-tree) — the two differences that matter:**
1. **All data lives in the leaves.** Internal nodes hold only keys, as signposts.
2. **Leaves are linked together**, so a range scan is a sequential walk instead of repeated tree traversals.

**Consequence:** internal nodes hold *only keys*, so more keys fit per page → **higher fanout → shallower
tree**. And `WHERE x BETWEEN 10 AND 500` becomes "descend once, then follow the leaf chain."

### Fanout — why the tree is so shallow

Everything is organised in **pages** (Postgres: 8 KB, InnoDB: 16 KB) because that's the unit of disk I/O.

```
Page size 8 KB, key ~16 bytes + pointer ~8 bytes = 24 bytes/entry
Fanout ≈ 8192 / 24 ≈ 340 entries per internal page
```

| Depth | Max rows indexed |
|---|---|
| 1 | 340 |
| 2 | ~115,000 |
| 3 | ~39 million |
| **4** | **~13 billion** |

> **The number to remember: a B+Tree over billions of rows is only ~4 levels deep.** So a point lookup is
> ~4 page reads — and the top 2–3 levels are almost always cached in RAM, so it's typically **1 disk read**.
>
> That's the whole reason B+Trees won: `O(log_fanout n)` with a fanout of ~340 is effectively constant for any
> realistic dataset.

**This is also why key size matters.** A 16-byte UUID key instead of an 8-byte bigint roughly halves your
fanout, which deepens the tree and doubles the index size.

### Reads

```
Point lookup:  descend root → internal → leaf,  ~4 pages,  O(log n)
Range scan:    descend once, then WALK THE LEAF CHAIN sequentially  ← the B+Tree superpower
```

**Sequential leaf walking is why B-trees are excellent for range queries** — `ORDER BY`, `BETWEEN`,
`>`/`<`, and keyset pagination ([Phase 1 note 08](../../phase-01-networking/notes/08-pagination.md)) all
exploit it.

### Writes — this is where the costs are

**Insert:** find the leaf, insert in sorted position. If the page is full → **page split**:

```
Leaf full:  [10│20│30│40]   insert 25
            ↓ split
            [10│20│25]   [30│40]     ← half the entries copied to a NEW page
            ↑ and the parent gains a key, which may split it too, recursively to the root
```

**The costs of a split:**
- Write **two** pages instead of one
- Update the parent (which may itself split, cascading upward)
- The new page is allocated **wherever there's free space** → the logical order no longer matches physical
  order → **fragmentation**, which degrades sequential scans

**Write amplification:** one logical row write can touch the leaf page, one or more parent pages, *and* the
WAL. Postgres makes this worse with **full-page writes** — after a checkpoint, the *first* modification to a
page writes the entire 8 KB page to the WAL, to guard against torn pages.

> **A single-row `UPDATE` can generate tens of KB of physical I/O.** That's the honest answer to "why is my
> write throughput lower than I expected."

### Random vs sequential inserts — the UUID lesson

This is the most practically useful consequence in this note.

| Insert pattern | What happens |
|---|---|
| **Sequential** (auto-increment, UUIDv7, ULID, Snowflake) | Always inserts at the **rightmost** leaf. That page stays in cache. Splits are cheap and one-sided. **Near-optimal.** |
| **Random** (UUIDv4) | Each insert lands on a **random** leaf → a random page must be read from disk, modified, and written. **Cache hit rate collapses.** Splits happen everywhere; the index fragments. |

**Once the index exceeds RAM, random inserts become one random disk read + write per insert.** Measured
slowdowns of 5–10× on insert-heavy tables are common.

> **The interview line:** *"I'd avoid UUIDv4 primary keys on a large table — random insertion order destroys
> B-tree locality, so every insert touches a random page and the buffer cache stops helping. UUIDv7 or ULID
> give me the same global uniqueness with time-ordered prefixes, so inserts stay at the right edge of the
> tree."* → Phase 9.

### Fragmentation & maintenance

Over time, splits and deletions leave pages **partially full** (deletes don't merge pages back in Postgres or
InnoDB). The index grows larger than its data warrants — **index bloat**.

| Symptom | Fix |
|---|---|
| Index much larger than expected | `REINDEX` (Postgres: `REINDEX CONCURRENTLY`), `OPTIMIZE TABLE` (MySQL) |
| Sequential scans slower than they should be | Physical order drifted from logical — `CLUSTER`, or rebuild |
| Bloat from long-running transactions | That's MVCC, not the B-tree → see [3b-03](3b-03-mvcc.md) |

**`fillfactor`** leaves free space in each page at build time (e.g. 90%) so later inserts and updates fit
without splitting. Worth lowering for update-heavy tables; keep it at 100 for append-only/read-only ones.

### Clustered vs non-clustered — where the row actually lives

| | **Clustered index** | **Heap + secondary index** |
|---|---|---|
| Used by | **InnoDB (MySQL)** — the PK *is* the table | **Postgres** — table is a heap, all indexes point into it |
| Leaf contains | **The full row** | A pointer (Postgres: `ctid`, page+offset) |
| PK lookup | 1 traversal — row is right there | 1 traversal + **1 heap fetch** |
| Secondary index lookup | Finds the **PK**, then a *second* traversal of the clustered index | Finds the `ctid`, then one heap fetch |
| Big PK cost | **Every secondary index stores the full PK** → a fat PK bloats every index | Pointer is fixed-size |

> **The InnoDB consequence to know:** a secondary index lookup costs **two** B-tree traversals (secondary →
> PK → clustered). And since every secondary index embeds the primary key, **a 36-byte string PK makes every
> index on that table enormous.** That's a concrete argument for narrow integer/UUIDv7 primary keys in MySQL.

---

## In your own words

**Why is a B+Tree over 13 billion rows only ~4 levels deep? Show the fanout arithmetic.**

>

**What two structural differences make a B+Tree better than a plain B-tree for range queries?**

>

**Walk through a page split. Name three distinct costs.**

>

**Explain why UUIDv4 primary keys hurt insert performance. What's the fix and why does it work?**

>

**Why can a single-row UPDATE generate tens of KB of I/O?**

>

**In InnoDB, why does a secondary index lookup cost two traversals? What does that imply about PK width?**

>

---

## Links

- The write-optimised alternative → [3a-02-lsm-tree.md](3a-02-lsm-tree.md)
- Choosing between them → [3a-03-btree-vs-lsm.md](3a-03-btree-vs-lsm.md)
- Index design on top of this structure → [3a-04-indexes.md](3a-04-indexes.md)
- WAL and full-page writes → [3a-07-wal-and-durability.md](3a-07-wal-and-durability.md)
- MVCC bloat (a different cause of the same symptom) → [3b-03-mvcc.md](3b-03-mvcc.md)
- Time-sortable IDs → Phase 9
- **DDIA ch. 3** · *Database Internals* (Petrov) part I
