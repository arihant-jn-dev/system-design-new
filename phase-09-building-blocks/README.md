# Phase 9 — Reusable Building Blocks

**Week 13 · ~10 hrs**

---

## Why this phase exists

The roadmap's framing is the useful one:

> ⭐ *"These are the Lego bricks. Interview questions are almost always a **recombination** of these —
> learning them explicitly makes novel questions feel familiar."*

"Design Twitter" is a **feed** + **IDs** + **counters** + **notifications** + **blob storage**. "Design
Uber" is **geospatial** + **WebSockets** + **payments** + **idempotency**. ⭐ **Once you own the bricks, a
novel question stops being novel** — you're assembling, not inventing.

⭐ **And the gate is a speed drill**: *"design any of the above as a component in under 10 minutes."* This
phase is not about depth in any one thing. **It's about having twelve components you can produce on demand,
with their trade-offs, without thinking.**

---

## How to work this phase

| Step | Do this | Time |
|---|---|---|
| 1 | Read [`notes/`](notes/) 01 → 16. Reference half, once. | ~2.5 hrs |
| 2 | Fill in the "In your own words" halves. **The actual work.** | ~3 hrs |
| 3 | ⭐ [`lab/`](lab/) A–C — **write them yourself first**, then compare | ~2 hrs |
| 4 | [`lab/`](lab/) D — the B-tree locality benchmark | ~30 min |
| 5 | ⭐ **The 10-minute drill** (below). Repeat until it's boring. | ~1.5 hrs |
| 6 | [`GATE.md`](GATE.md) out loud. | ~1 hr |

> ⭐ **Step 3 matters more than reading the finished code.** The roadmap: *"~150 lines each, and they'll
> stick permanently."* Type them yourself; the runnable versions are here to check against.

### ⭐ The 10-minute drill

**Pick a note at random. Set a timer for 10 minutes. Out loud, cover:** what problem it solves → the data
structure/algorithm → the scaling limit → what breaks → the trade you'd defend → the numbers.

⭐ **Do this until it's boring.** That's the gate, and it's the format the skill is actually used in.

---

## Topics

| # | Note | The one thing it's for |
|---|---|---|
| 01 | [Unique IDs](notes/01-unique-ids.md) | Snowflake bits · clock skew · ⭐ **you measured the index effect** |
| 02 | [Locks & leader election](notes/02-distributed-locks-and-leader-election.md) | ⭐ **TTL breaks mutual exclusion** · fencing tokens |
| 03 | [Rate limiter, in 10 min](notes/03-rate-limiter-as-a-component.md) | ⭐ **The script** · the overshoot bound |
| 04 | [Probabilistic structures](notes/04-probabilistic-structures.md) | ⭐ **Gate Q2** · bloom · HLL · CMS · t-digest |
| 05 | [Counters at scale](notes/05-counters-at-scale.md) | Write-combining · ⭐ **statistic vs invariant** |
| 06 | [Search & inverted index](notes/06-search-and-inverted-index.md) | BM25 · refresh interval · ⭐ **alias-swap reindex** |
| 07 | [Autocomplete](notes/07-autocomplete.md) | ⭐ **3,506× measured** · shard by prefix · rebuild, don't patch |
| 08 | [Geospatial](notes/08-geospatial.md) | Geohash · ⭐ **the edge problem** · S2/H3 · moving objects |
| 09 | [Feed & timeline](notes/09-feed-and-timeline.md) | ⭐ **Gate Q3** · hybrid fan-out · the threshold logic |
| 10 | [Notifications & fan-out](notes/10-notifications-and-fanout.md) | Preferences · dedupe · digests · ⭐ **priority lanes** |
| 11 | [WebSockets at scale](notes/11-websocket-infrastructure.md) | ⭐ **Stateful servers undo Phase 2** · backplane · replay |
| 12 | [Blob storage](notes/12-blob-storage.md) | ⭐ **Never proxy bytes** · presigned URLs · content addressing |
| 13 | [Media pipelines](notes/13-media-pipelines.md) | Transcode DAG · ABR · ⭐ **lazy renditions** |
| 14 | [Idempotency & dedupe](notes/14-idempotency-and-dedupe.md) | ⭐ **TTL = the retry SLA** · storage arithmetic · inbox |
| 15 | [Analytics pipelines](notes/15-analytics-pipelines.md) | Columnar · roll-ups · ⭐ **you can't average an average** |
| 16 | [Payments primitives](notes/16-payments-primitives.md) | ⭐ **Double-entry** · webhooks · **reconciliation** |

---

## Lab

[`lab/`](lab/) — **three from scratch (no Docker, no dependencies), plus one measurement.**

| | Headline |
|---|---|
| **A · Bloom filter** | ⭐ **1.00% measured vs 1.00% theory**, 0 false negatives, 53× less memory than a `Set` — and ⚠️ **98.1% FP at 8× overfill, with nothing erroring** |
| **B · Snowflake** | ⭐ **4,000,000 ids/sec**, 0 collisions across 8 non-communicating nodes, no duplicate through a clock rewind |
| **C · Autocomplete** | ⭐ **3,506× at p99** — and **10,193×** for the single-character prefix users type first |
| ⭐ **D · B-tree locality** | ⭐ **The claim is two claims**: v4→v7 is **1.97× on inserts** (cache), v7→v7-monotonic is **70%→90% leaf fill** (packing) |

> ⭐ **Part D's first run contradicted the textbook** — because the index fit in cache and ID generation was
> inside the timed loop. **Both were setup errors, and finding them was worth more than the original claim.**

---

## Definition of done

- [ ] All 16 notes have the "In your own words" half filled in
- [ ] ⭐ **You wrote the bloom filter, Snowflake generator and trie YOURSELF** before reading these
- [ ] `lab/README.md` RESULTS filled in with your own numbers
- [ ] ⭐ **You can design any of the 16 as a component in under 10 minutes, out loud**
- [ ] You can state HLL's memory and error, and **when you'd refuse to use it**
- [ ] ⭐ **You can give the hybrid fan-out threshold logic — five factors, not one number**
- [ ] You can write the bloom filter's two formulas from memory
- [ ] ⭐ **You can explain why "time-ordered" ≠ "monotonic", citing your own measurement**
- [ ] [`GATE.md`](GATE.md) passed out loud
