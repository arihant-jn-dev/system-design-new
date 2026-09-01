# Phase 9 Lab

The roadmap's lab, verbatim:

> *"Implement three of these from scratch, in any language: **a bloom filter, a Snowflake ID generator, and a
> top-K-per-prefix autocomplete.** ~150 lines each, and they'll stick permanently."*

⭐ **Those three need no Docker and no dependencies.** Run them with plain `node`:

```bash
node bloom-filter/run.js       # ~5s
node snowflake/run.js          # ~2s
node autocomplete/run.js       # ~3s
```

**Part D is an addition:** the one claim in this phase you *cannot* prove with an algorithm, because it's
about how a real B-tree behaves on disk. That one needs Postgres.

```bash
docker compose up -d                 # Postgres on 5441
docker compose build lab             # ⚠️ profile'd services are skipped by `up --build`
docker compose run --rm lab node id-locality/run.js    # ~2 min
docker compose down -v
```

---

# A · Bloom filter

**1M items at a 1% target false-positive rate.**

```
m = -(n · ln p) / (ln 2)²        bits
k = (m / n) · ln 2               hash functions
```

| | Measured |
|---|---|
| memory | ⭐ **1,170 KB** (9.6 bits/item, k=7) — vs ~61 MB for a `Set`, **53× less** |
| false negatives | ⭐ **0** across 10,310 probes — and this is a *guarantee* |
| ⭐ measured FP rate | ⭐ **1.00%** (4,998 / 500,000) vs theory **1.00%** |
| bits set | 51.8% — optimal *k* targets ~50% |
| insert throughput | 1,253,133/s |

> ⭐ **Theory and measurement agreeing is the point** — you can size one on paper and trust the number in a
> design discussion.

### ⚠️ And what happens when you undersize it

| Load | Fill | FP rate |
|---|---|---|
| 0.5× | 31% | 0.0% |
| **1× (designed)** | 52% | **1.0%** |
| 2× | 77% | ⚠️ **15.8%** |
| 4× | 95% | ⚠️ **67.8%** |
| 8× | 100% | ⚠️ **98.1%** |

> ⭐ **At 8× it's an expensive function that returns `true` — AND NOTHING ERRORS.** No exception, no metric.
> Your cheap pre-filter is now pure overhead on the lookup it was meant to avoid.
> ⭐ **Monitor the fill ratio; alert past ~50%.**

**Also demonstrated:** Kirsch-Mitzenmacher (two hashes generate *k*) · why there's no `delete()` · the
LSM-tree and cache-penetration use cases.

---

# B · Snowflake ID generator

```
1 bit sign │ 41 bits ms since a custom epoch │ 10 bits machine │ 12 bits sequence
```

| | Measured |
|---|---|
| single-node throughput | ⭐ **4,000,000/s** with **zero network calls** |
| strictly increasing | ⭐ **true** |
| 8 nodes × 20,000 ids | ⭐ **0 collisions** — and the nodes never communicated |
| after a 2 ms clock rewind | ⭐ **no duplicate**; the generator blocked and waited |

> ⭐ **Disjointness is STRUCTURAL** — it comes from the machine-id field, not from agreement.
>
> ⭐ **Which moves the hard problem: how does each node get a unique machine id?** That *is* coordination,
> just rare — and it fails **silently, as duplicate IDs**, the day someone copies a config file.
>
> ⭐ **On clock skew: refuse to issue until the clock catches up.** You trade availability for correctness,
> and that's right — a duplicate primary key is unrecoverable, a 3 ms stall isn't.

⚠️ **A note on the harness:** the clock-skew test originally hung forever. The generator's catch-up is a
*synchronous* spin, so a `setInterval` that "advances time" never fires. Time now advances inside the clock
function instead. ⭐ **Worth remembering — a spin-wait and an event loop don't mix.**

---

# C · Top-K-per-prefix autocomplete

200,000 terms · 571,634 trie nodes (2.9 per term) · K=5 · precompute **116 ms**

| | p50 | p99 |
|---|---|---|
| naive DFS | 4.445 ms | ⚠️ **18.698 ms** |
| ⭐ precomputed | **0.0008 ms** | ⭐ **0.0053 ms** |
| | **5,612×** | ⭐ **3,506×** |

**Single-character prefix `"r"`** — the one users type first, on every search:

| | |
|---|---|
| naive | 4.668 ms |
| precomputed | ⭐ **0.0005 ms** — **10,193×** |

> ⭐ **THE WORST CASE IS THE COMMON CASE.** The naive structure is slowest exactly where it's hit hardest.
>
> ⭐ **And the real argument is the complexity class, not the constant:** O(subtree) scales with your corpus,
> O(prefix length) doesn't.

**Correctness:** the fast path returned **exactly** what the slow path did on all 9 probe prefixes.

⭐ **The cost isn't memory — it's updates.** One score change can alter the top-K of every node on its root
path, so **nobody updates in place: you rebuild periodically and swap atomically**, and handle trending by
merging a small live list at query time.

---

# ⭐ D · Does UUID v4 really "destroy B-tree locality"?

**2,000,000 rows per table. Identical rows, identical payload. Only the primary key type differs.
`shared_buffers=16MB`, ids pre-generated outside the timed section.**

| Key type | Monotonic | Insert | PK index | ⭐ Leaf fill | WAL |
|---|---|---|---|---|---|
| uuid v4 (random) | 50.0% | 12.0 s | 76.1 MB | ⚠️ **71%** | 417.3 MB |
| uuid v7 (typical impl) | 50.1% | ⭐ **6.1 s** | 77.3 MB | ⚠️ **70%** | 408.6 MB |
| uuid v7 (monotonic) | ⭐ 100% | 6.0 s | ⭐ **60.2 MB** | ⭐ **90%** | 388.9 MB |
| snowflake | ⭐ 100% | ⭐ **5.2 s** | ⭐ **42.9 MB** | ⭐ **90%** | 356.0 MB |

### ⭐ The one-line claim is actually TWO claims

> ⭐ **THE CACHE EFFECT — compare v4 vs v7.** They pack **identically** (71% vs 70%), yet v7 inserted
> **1.97× faster**. Nothing about the index's *shape* changed — only **which pages get touched**. v7 confines
> writes to a narrow recent key range that stays cached; v4 sprays them across the whole index.
>
> ⭐ **THE PACKING EFFECT — compare v7 vs v7-monotonic.** Same cache behaviour, but leaf fill goes
> **70% → 90%** and the index **77.3 MB → 60.2 MB**.
>
> ⭐ **And the COMMON UUID v7 implementation only buys you the first one** — because at 327k inserts/sec each
> millisecond holds ~327 rows, and v7 orders those *randomly*.
> ⭐ **"Time-ordered" ≠ "monotonic."**

**The mechanism:** a monotonic key is always the largest so far, so every insert appends to the **same
right-most leaf** — always cached, fills completely, splits cleanly. A random key lands on a random page:
probably uncached, probably full, so it **splits in the middle leaving two pages half full**.
⭐ **~69% (ln 2) is the classic steady-state fill for random B-tree insertion** — exactly what was measured.

### ⚠️ Two things this lab got wrong first, which are worth more than the result

**The first run showed NO effect at all** — v4's index came out *smaller* than v7's (0.96×) and inserts were
*faster*. Both causes were setup errors:

1. ⚠️ **The index fit in `shared_buffers`.** A 38 MB index with 64 MB of buffers = no eviction, so the
   locality penalty had nowhere to appear. ⭐ **What you're really measuring is WORKING SET vs MEMORY** —
   and memory papers over the problem until the table outgrows RAM.
2. ⚠️ **ID generation was inside the timed loop.** `crypto.randomUUID()` is native; a hand-rolled v7 isn't.
   That timed JavaScript, not the B-tree.

⭐ **A measurement that contradicts the textbook is usually your setup — but you have to go and find out
which, rather than assuming either way.**

**Also true and worth saying:** UUID v4 is not "wrong" — it's correct and unguessable, and if your table is
small this doesn't matter. **InnoDB is hit far harder than Postgres**, because it's *clustered*: the PK is
the physical row order, so random PKs scatter the **rows**, not just the index.

---

## RESULTS — record your own

Your numbers will differ. **Yours are the ones you cite.**

| Measurement | ⭐ Your result |
|---|---|
| Bloom: memory for 1M @ 1% | |
| Bloom: measured FP rate (theory 1.00%) | |
| Bloom: FP rate at 4× overfill | |
| Snowflake: ids/sec, single node | |
| Snowflake: collisions across 8 nodes | |
| Autocomplete: naive p99 | |
| Autocomplete: precomputed p99 | |
| ⭐ Autocomplete: speed-up at p99 | |
| Locality: v4 vs v7 **insert time** | |
| Locality: v7 vs v7-mono **leaf fill** | |
| ⭐ Locality: v4 vs snowflake **index size** | |

**⭐ Which result surprised you most?**

>

**⭐ Which of these four would you actually reach for in the next system you build, and for what?**

>

---

## Files

| | |
|---|---|
| [`bloom-filter/run.js`](bloom-filter/run.js) | Part A — no deps |
| [`snowflake/run.js`](snowflake/run.js) | Part B — no deps |
| [`autocomplete/run.js`](autocomplete/run.js) | Part C — no deps |
| [`id-locality/run.js`](id-locality/run.js) | Part D — needs Postgres |
| [`docker-compose.yml`](docker-compose.yml) | Postgres on **5441** (annotated) |
