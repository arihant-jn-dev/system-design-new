# Phase 9 — Gate

> **Rules:** Out loud. From memory. No notes.
> ⭐ **Q1 is a SPEED drill.** The skill being tested is producing a component on demand, not depth.

---

## Q1 · Design any of these as a component in under 10 minutes

**Have someone pick — or roll a die twice. Set a timer. ⭐ Do this for at least SIX of the sixteen.**

**Every answer must cover all six, in roughly this order:**

- [ ] ⭐ **The problem it solves** — in one sentence, before any solution
- [ ] **The data structure / algorithm**, and why that one
- [ ] ⭐ **The scaling limit** — what breaks first, and at roughly what number
- [ ] ⭐ **What goes wrong** — the failure mode you'd actually hit
- [ ] ⭐ **The trade you'd defend** (accuracy/memory/latency/staleness)
- [ ] **A number** — memory, error rate, throughput, a measurement of yours

| # | Component | ⭐ The thing you must not omit |
|---|---|---|
| 01 | Unique IDs | ⭐ **clock skew → refuse to issue**; machine-id assignment fails *silently* |
| 02 | Distributed lock | ⭐ **TTL breaks mutual exclusion → fencing tokens, checked by the resource** |
| 03 | Rate limiter | ⭐ token bucket; **overshoot bound = instances × sync interval × rate** |
| 04 | Bloom filter | ⭐ **no false negatives**; ~10 bits/item @ 1%; **no deletes** |
| 05 | Counter at scale | ⭐ **statistic vs invariant**; write-combining |
| 06 | Search | ⭐ inverted index; **BM25 vs TF-IDF**; **alias-swap reindex** |
| 07 | Autocomplete | ⭐ **top-K per node**; **rebuild, don't patch**; shard by prefix |
| 08 | Geospatial | ⭐ **geohash prefix = range scan**; **query the 8 neighbours** |
| 09 | Feed | ⭐ **hybrid fan-out** (Q3) |
| 10 | Notifications | ⭐ preferences early; dedupe; **priority lanes** |
| 11 | WebSockets | ⭐ **backplane**; heartbeats; **replay via a cursor** |
| 12 | Blob storage | ⭐ **presigned URLs — never proxy bytes** |
| 13 | Media pipeline | ⭐ **lazy renditions**; idempotent jobs; partial success |
| 14 | Idempotency store | ⭐ **same transaction as the effect**; TTL = the retry SLA |
| 15 | Analytics | ⭐ **columnar + roll-ups**; can't average an average |
| 16 | Payments | ⭐ **double-entry**; **reconciliation**; verify webhook signatures |

**Self-score:** ___ / 6 components × 6 points = ___ / 36 · **Slowest: ____ min**

---

## Q2 · "Count unique daily visitors across 500 M events." Go.

- [ ] ⭐ **Name the naive cost first**: a `Set` of ~100 M distinct IDs is **several GB/day, per dimension**, and **unmergeable across shards**
- [ ] ⭐ **HyperLogLog**
- [ ] ⭐ **The intuition**: hash each item, count **leading zeros**; 10 leading zeros suggests ~2¹⁰ distinct items
- [ ] …**16,384 buckets in parallel + a harmonic mean** to kill the variance
- [ ] ⭐ **~12 KB, FIXED** — for a thousand uniques or a billion
- [ ] ⭐ **±0.81% standard error** (`1.04/√m`)
- [ ] ⭐ **MERGEABLE — union is the per-register max.** One HLL per hour per dimension; longer windows are a **merge**
- [ ] ⭐ **…and you CANNOT sum daily counts**: `unique(Mon) + unique(Tue) ≠ unique(Mon∪Tue)`. **Only the sketches merge**
- [ ] Redis `PFADD` / `PFCOUNT` / `PFMERGE`
- [ ] ⭐ **Justify the error**: nobody decides anything on unique visitors at 3 significant figures — 4.21 M vs 4.24 M changes nothing
- [ ] ⭐ **AND WHEN YOU'D REFUSE**: billing, compliance, or anything auditable → **store exact IDs and pay for it**
- [ ] Bonus: ⚠️ **no membership test, no deletes, intersections are inaccurate**
- [ ] Bonus: small cardinalities use a **sparse exact** representation, so the low end is exact
- [ ] Bonus: **Count-Min Sketch** if the question becomes "how often", **t-digest** if it becomes "p99"

**Self-score:** ___ / 13

---

## Q3 · Explain hybrid fan-out and the exact threshold logic for celebrity accounts

- [ ] **Push vs pull**: read O(1)/write O(followers) vs read O(followees)/write O(1)
- [ ] ⭐ **Push is the default because feeds are read-dominated** — move work to the rarer operation
- [ ] ⭐ **Push breaks on high FOLLOWER counts; pull breaks on high FOLLOWEE counts** — the failure modes are **disjoint**, which is exactly why hybrid works
- [ ] ⭐ **Hybrid**: push for normal accounts, pull for celebrities, **merge at read time**

**The threshold — ⭐ this is what's being marked:**

- [ ] ⚠️ **A static "1 M followers" is a weak answer**
- [ ] ⭐ **Derive it from a fan-out BUDGET**: *"a post must not cost more than X writes"*
- [ ] ⭐ **The real cost driver is `followers × posts_per_day`**, not followers — a 2 M-follower monthly poster is cheaper than a 200 k-follower account posting 50×/day
- [ ] ⭐ **Follower ACTIVITY**: pushing to 100 M when 5 M are active is **95% wasted work** — push to active, pull for dormant. **The biggest real saving**
- [ ] ⭐ **HYSTERESIS — two thresholds** (promote at 500 k, demote at 300 k) or an account at the boundary flip-flops and you get duplicate/missing posts
- [ ] **A manual override flag** — you will need it
- [ ] ⭐ **The transition isn't instant**: old posts are already pushed, new ones aren't → **the read path merges both for a while**, keyed on a switch timestamp

**Making it work:**

- [ ] ⭐ **Fan out ASYNCHRONOUSLY** — the poster's request returns immediately
- [ ] ⭐ **Store IDs, not content** — otherwise an edit rewrites millions of copies
- [ ] Cap the timeline (~800); older pages fall back to pull
- [ ] ⭐ **Cursor pagination, not offset** — new posts shift offsets and the user sees duplicates
- [ ] ⭐ **A RANKED feed needs more than a cursor**: scores change between pages → **snapshot the ranked ID list per session**
- [ ] Bonus: **time-sortable IDs are what make cursors work** (Snowflake/UUIDv7)
- [ ] Bonus: **celebrity = hot key**, the same problem as a hot counter, cache key, or partition

**Self-score:** ___ / 18

---

## Extra checks

- [ ] ⭐ **Snowflake's 64 bits**, and why a custom epoch
- [ ] ⭐ **Why does Twitter's API return `id_str`?**
- [ ] ⭐ **Cite your locality numbers. Which comparison isolates CACHE, and which isolates PACKING?**
- [ ] ⭐ **Why does the common UUID v7 implementation only get one of the two benefits?**
- [ ] ⭐ **Why did your FIRST locality run show nothing — and what does that teach?**
- [ ] Why is ~69% the steady-state leaf fill for random inserts?
- [ ] ⭐ **Why should a primary key never be a security boundary?**
- [ ] ⭐ **Three ways to avoid needing a distributed lock at all**
- [ ] Why isn't `SET NX PX` safe under Redis failover? Why Lua to delete?
- [ ] ⭐ **What does a correct leader do BEFORE its lease expires?**
- [ ] **Bloom filter: both formulas.** Why no deletes? What must a false positive never cost you?
- [ ] ⭐ **Cite the 2×/4×/8× overfill numbers. Why is silent degradation the danger?**
- [ ] Count-Min Sketch: why the **minimum**, and which direction does it err?
- [ ] ⭐ **Why can't you average p99 across servers?**
- [ ] ⭐ **Write-combining arithmetic**; when can you *not* buffer in memory?
- [ ] ⭐ **Statistic vs invariant** — one example of each
- [ ] Search: **the analysis chain**, and the rule that causes most real bugs
- [ ] ⭐ **What two problems does BM25 fix in TF-IDF?**
- [ ] **Refresh vs flush**; why is over-sharding bad? Why is Lucene an LSM tree?
- [ ] ⭐ **Deep paging** — why expensive, and three fixes
- [ ] ⭐ **The alias-swap reindex** — and why query through an alias from day one
- [ ] ⭐ **Autocomplete: why is the single-char prefix the important case?** Why shard by prefix, never hash?
- [ ] ⭐ **How do you handle a newly trending query?**
- [ ] Geohash: the property, ⭐ **the edge problem and its fix**, why cells aren't square
- [ ] ⭐ **Why hexagons (H3)?** Radius vs kNN — which is unbounded?
- [ ] ⭐ **Why are moving objects a WRITE problem?**
- [ ] Notifications: ⭐ **what must bypass preferences, and why is that legal not technical?**
- [ ] ⭐ **The notification ladder**; why alert on ratios, not send counts?
- [ ] ⭐ **Why do WebSockets undo Phase 2's assumptions?**
- [ ] ⭐ **What does a backplane remove the need for?** Redis pub/sub's catch?
- [ ] ⭐ **Why isn't TCP enough to detect a dead client?** What makes replay possible?
- [ ] ⭐ **SSE vs WebSocket vs polling — the rule**
- [ ] ⭐ **Never proxy bytes.** Four constraints on a presigned URL; how do you learn the upload finished?
- [ ] Content-addressed storage: benefits, and why deletion gets hard
- [ ] ⭐ **The versioning + no-lifecycle surprise bill**
- [ ] ⭐ **The biggest cost saving in a video platform**, and why spot instances fit
- [ ] Why is partial success the right model for a media DAG?
- [ ] ⭐ **Why must the idempotency record share a transaction with the effect?**
- [ ] ⭐ **TTL = the retry SLA.** Do the 10k req/s storage arithmetic
- [ ] ⭐ **Outbox + inbox = exactly-once EFFECT over at-least-once delivery**
- [ ] ⭐ **Why is columnar so much faster?** Why doesn't a read replica fix analytics?
- [ ] ⭐ **Which measures roll up, which don't, and what do you store instead?**
- [ ] **Lambda vs Kappa**; why record both `event_time` and `ingest_time`?
- [ ] ⭐ **Double-entry: the invariant you can check continuously**
- [ ] ⭐ **Why is `UPDATE balance` an anti-pattern?** How do you keep reads fast anyway?
- [ ] ⭐ **Webhooks: which rule is a vulnerability class?** Why re-fetch rather than trust the body?
- [ ] ⭐ **What is reconciliation, and why is it permanent rather than an error path?**

---

## Scoring

| Result | Do this |
|---|---|
| Q1 ≥ 5/6 components clean, Q2 and Q3 passed | ✅ Advance to **Phase 10 — Security, Privacy & Compliance** |
| Any component took > 10 min or missed 2+ of the six points | ⛔ Redo that note's "own words", re-drill in 2 days |

| Fumbled | Redo |
|---|---|
| Q1 | The specific note — then **re-drill that component cold, three times** |
| Q2 | [notes/04](notes/04-probabilistic-structures.md) + re-run the bloom filter lab |
| Q3 | [notes/09](notes/09-feed-and-timeline.md) — **write the threshold logic out as pseudocode** |

---

## Before Phase 10

- [ ] ⭐ **PRACTICE PROBLEMS — this is now urgent.** The roadmap wanted 13–15 by Week 11; you are at Week 13.
      ⭐ **This phase is the one that makes practice problems pay off fastest**, because you now have the
      bricks — every question is a recombination. **Do three full 45-minute designs this week.**
- [ ] ⭐ **Record one and watch it back.** The roadmap: *"the fastest improvement you will get from any single
      hour."*
- [ ] ⭐ **Take three past designs and name the building blocks in each.** *"That's hybrid fan-out, an
      idempotency store, and a roll-up pipeline."* ⭐ **Recognising the bricks under a question IS the skill
      this phase exists to build.**
- [ ] Phases 10 and 11 are short. **11 (interview craft) is where the remaining leverage is** — do not skip
      it to go deeper on technique.

---

## Gate log

| Attempt | Date | Q1 (slowest) | Q2 | Q3 | Notes |
|---|---|---|---|---|---|
| 1 |  | /36 ( ) | /13 | /18 |  |
| 2 |  | /36 ( ) | /13 | /18 |  |
