# 09·01 · Unique ID Generation

> **Why this exists:** every design needs IDs, and the choice leaks into sharding, index performance, URL
> security and debuggability. ⭐ **You measured the index consequences** — and the measurement corrected the
> textbook claim.

---

## Reference

### The options

| Scheme | Generated | Ordering | Size | The catch |
|---|---|---|---|---|
| **auto-increment / `bigserial`** | ⚠️ the DB | perfect | 8 B | ⭐ **one writer — does not shard** |
| **UUID v4** | ⭐ anywhere | ⭐ none | 16 B | ⚠️ random → poor index locality |
| ⭐ **UUID v7 / ULID** | ⭐ anywhere | ~ms | 16 B | ⭐ **the modern default** |
| ⭐ **Snowflake** | ⭐ anywhere | ~ms | ⭐ 8 B | ⚠️ needs a unique machine id |
| **Ticket server** | central | perfect | 8 B | ⚠️ a round trip + an SPOF |
| **Sequence blocks** | central | blocky | 8 B | a round trip per *block*; gaps on restart |

### ⭐ Snowflake's 64 bits

```
 1 bit   unused (sign — keeps it positive in signed-64 languages)
41 bits  ms since a CUSTOM epoch    -> ~69 years
10 bits  machine id                 -> 1,024 nodes
12 bits  sequence within that ms    -> 4,096 ids/ms/node
```

⭐ **4,096,000 ids/sec per node with zero coordination.** You measured **4,000,000/s** from one node and
**zero collisions across 8 nodes that never spoke to each other** — disjointness is *structural*, from the
machine-id field.

⭐ **Use a custom epoch.** With the Unix epoch you'd have burned 55 of your 69 years before shipping.

⭐ **IDs are self-describing** — decode one from a log line with no DB lookup: when, and which node.
⚠️ **Which is also the downside:** the ID leaks creation time and fleet size, and is enumerable.

### ⭐ The three hard parts

| Problem | The answer |
|---|---|
| ⭐ **Machine-id assignment** | The coordination you thought you'd escaped, just rarer. etcd/ZooKeeper sequential node · a Kubernetes StatefulSet ordinal · derived from IP (⚠️ breaks on reuse) · config (⚠️ **breaks silently the day someone copies a config file — as duplicate IDs**). ⭐ **Register the id with a lease at startup and refuse to boot on conflict.** |
| ⭐ **Clock going backwards** | NTP *steps*, not just slews. Reusing a timestamp with the same machine id and a reset sequence = duplicates. ⭐ **REFUSE TO ISSUE until the clock catches up** — you trade availability for correctness, and that's right: a duplicate PK is unrecoverable, a 3 ms stall isn't. Large jump → alarm and remove the node. ⭐ **Run NTP in slew mode on ID hosts.** |
| **Sequence exhaustion** | 4,096 in one ms → spin to the next. A real backpressure point; the sequence width is a capacity decision. |

⚠️ **JavaScript**: numbers are doubles — 53 bits of integer precision. A 64-bit ID silently corrupts. ⭐ **That
is exactly why Twitter's API returns `id_str` alongside `id`.** Use BigInt or strings at the boundary.

### ⭐ What you measured about B-tree locality

2M rows per table, identical data, only the PK type differing, `shared_buffers=16MB`:

| Key type | Monotonic | Insert | PK index | ⭐ Leaf fill |
|---|---|---|---|---|
| uuid v4 (random) | 50.0% | **12.0 s** | 76.1 MB | ⚠️ **71%** |
| uuid v7 (typical impl) | 50.1% | ⭐ **6.1 s** | 77.3 MB | ⚠️ **70%** |
| uuid v7 (monotonic) | ⭐ 100% | 6.0 s | ⭐ **60.2 MB** | ⭐ **90%** |
| snowflake | ⭐ 100% | ⭐ **5.2 s** | ⭐ **42.9 MB** | ⭐ **90%** |

> ⭐ **THE ONE-LINE CLAIM IS ACTUALLY TWO CLAIMS, and the four variants separate them:**
>
> ⭐ **The CACHE effect** — v4 vs v7: they pack *identically* (71% vs 70%), yet v7 inserted **1.97× faster**.
> Nothing about the index's shape changed, only **which pages get touched**. v7 confines writes to a narrow
> recent key range that stays cached; v4 sprays them across the whole index.
>
> ⭐ **The PACKING effect** — v7 vs v7-monotonic: same cache behaviour, but leaf fill goes **70% → 90%** and
> the index **77.3 MB → 60.2 MB**.
>
> ⭐ **And the common UUID v7 implementation only buys you the first one** — because at 327k inserts/sec each
> millisecond holds ~327 rows, and v7 orders those *randomly*. ⭐ **"Time-ordered" ≠ "monotonic."**

**The mechanism:** a monotonic key is always the largest so far, so every insert appends to the **same
right-most leaf** — always cached, fills completely, and splits cleanly (everything stays left, a fresh page
goes right). A random key lands on a random page: probably not cached, probably full, so it **splits in the
middle, leaving two pages half full**. ⭐ **~69% (ln 2) is the classic steady-state fill for random B-tree
insertion** — which is exactly what you measured.

⚠️ **What it does NOT mean.** Your *first* run of this lab showed **no difference at all** — 1M rows with a
38 MB index and 64 MB of buffers, so nothing was ever evicted. ⭐ **What you're really measuring is working
set vs memory, and memory papers over it until the table outgrows RAM.** Also: **InnoDB is hit far harder**,
because it's *clustered* — the PK is the physical row order, so random PKs scatter the **rows**, not just
the index.

### ⭐ Choosing

| Need | Take |
|---|---|
| Distributed generation + a sane index | ⭐ **UUID v7 or ULID** (prefer a monotonic implementation) |
| 64 bits matters, or you want decodable ids | **Snowflake** |
| Single writer, no sharding | ⭐ **`bigserial` — genuinely fine** |
| Strict global ordering | a ticket server, and accept the SPOF |
| ⚠️ **An unguessable public id** | ⭐ **a SEPARATE random column** |

> ⭐ **Never make the primary key do security work.** `/orders/1001` is enumerable — that's IDOR. "Fast
> index" and "not enumerable" are different requirements and **you can have both**: an internal v7/Snowflake
> key, plus an external random public id.

**ULID vs UUID v7:** near-identical idea. ULID is Crockford base32 (26 chars, case-insensitive, URL-safe);
UUID v7 is an IETF standard your database already has a native type for. ⭐ **Prefer v7 for storage, and
render base32 if you want pretty URLs.**

---

## In your own words

**Draw Snowflake's 64 bits. Why a custom epoch?**

>

**⭐ Where does the coordination you "avoided" actually reappear, and how does it fail?**

>

**⭐ What must a generator do when the clock steps backwards, and why is that the right trade?**

>

**Why does Twitter's API return `id_str`?**

>

**⭐ Cite your numbers. Which comparison isolates the CACHE effect, and which isolates PACKING?**

>

**⭐ Why does the common UUID v7 implementation only get one of the two benefits?**

>

**Why is ~69% the steady-state leaf fill for random inserts?**

>

**⭐ Your first run showed no difference. Why — and what does that teach about the claim?**

>

**Why is InnoDB hit harder than Postgres?**

>

**⭐ Why should a primary key never be a security boundary, and what do you do instead?**

>

---

## Links

- ⭐ **You built it** → [`../lab/snowflake/run.js`](../lab/snowflake/run.js)
- ⭐ **You measured the index effect** → [`../lab/id-locality/run.js`](../lab/id-locality/run.js)
- B-trees, page splits, index internals → [Phase 3A](../../phase-03-databases/notes/)
- Why auto-increment doesn't shard → [Phase 3D](../../phase-03-databases/notes/)
- Leases and fencing, for machine-id assignment → [02-distributed-locks-and-leader-election.md](02-distributed-locks-and-leader-election.md)
- Idempotency keys are a *different* problem → [14-idempotency-and-dedupe.md](14-idempotency-and-dedupe.md)
