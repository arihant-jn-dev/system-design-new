# Phase 5 — Caching

**Week 8 · ~8 hrs**

---

## Why this phase exists

The roadmap: *"Appears in essentially every interview. The depth signal isn't 'add a cache' — it's
**invalidation and failure behaviour**."*

That's the whole framing. Anyone can say "put Redis in front of it." The senior conversation starts at
*"what's the key, what's the TTL, how does it get invalidated, and what happens when the cache dies
entirely?"* — and that last question is the one most candidates have never thought about.

**You'll answer it with a measurement rather than a guess:** in the lab you take a healthy system, flush the
cache under load, and watch a *performance* component's failure become an *availability* outage.

---

## How to work this phase

| Step | Do this | Time |
|---|---|---|
| 1 | Read [`notes/`](notes/) 01 → 11. Reference half, once. | ~1.5 hrs |
| 2 | Fill in the "In your own words" halves. **The actual work.** | ~2.5 hrs |
| 3 | [`lab/`](lab/) **Part A** — read-through cache, then melt the database | ~1.5 hrs |
| 4 | [`lab/`](lab/) **Part B** — sliding-window and token-bucket rate limiters | ~1 hr |
| 5 | ⭐ **Recite the six failure modes with mitigations, timed.** Under 60 seconds. | ~30 min |
| 6 | [`GATE.md`](GATE.md) out loud. | ~1 hr |

---

## Topics

| # | Note | The one thing it's for |
|---|---|---|
| 01 | [Cache hierarchy](notes/01-cache-hierarchy.md) | Which layer · versioned URLs · micro-caching · two-tier |
| 02 | [Caching patterns](notes/02-caching-patterns.md) | Cache-aside → write-behind · **invalidate, don't update** |
| 03 | [Invalidation](notes/03-invalidation.md) | ⭐ **Exactly why it's hard** · versioned keys · CDC |
| 04 | [Eviction & sizing](notes/04-eviction-and-sizing.md) | LRU's scan problem · W-TinyLFU · ⭐ **marginal hit rate** |
| 05 | [Failure modes](notes/05-failure-modes.md) | ⭐ **Gate Q2** — all six, by name |
| 06 | [Redis internals](notes/06-redis-internals.md) | Single-threaded · data structures · `SCAN` vs `KEYS` · Lua |
| 07 | [Persistence & HA](notes/07-redis-persistence-and-ha.md) | RDB/AOF · Sentinel vs Cluster · hash slots |
| 08 | [Redis beyond caching](notes/08-redis-beyond-caching.md) | Rate limiter · leaderboard · lock · queue · counters |
| 09 | [Redlock](notes/09-redlock.md) | ⭐ **Gate Q3** — both sides, and your own position |
| 10 | [Cache topology](notes/10-cache-topology.md) | Consistent hashing for caches · Memcached vs Redis |
| 11 | [Precomputation](notes/11-precomputation.md) | Materialised views · fan-out on write · correctness drift |

---

## Lab

[`lab/`](lab/) — Postgres + Redis + a read-through cache, load-tested with k6.

**Part A — the cold-cache outage.** Warm the cache (83% hit rate, database nearly idle), then `FLUSHALL`
under 800 req/s. **271 requests fail and p95 hits 2 seconds** — with nothing broken except an empty cache.
Then turn on **request coalescing** and run the identical failure: **zero errors.**

**Part B — rate limiters.** Build three in Redis and watch them differ: a fixed window lets **20 requests
through a 10-per-window limit** by straddling the boundary; a sorted-set sliding window holds at exactly 10;
a Lua token bucket bursts to capacity then refills at rate.

---

## Definition of done

- [ ] All 11 notes have the "In your own words" half filled in
- [ ] `lab/RESULTS.md` has your own numbers for both parts
- [ ] You watched the database melt, then survive the identical failure
- [ ] You can name **six failure modes with mitigations in under 60 seconds**
- [ ] You can design a full caching strategy layer by layer, ending with "what if it all dies?"
- [ ] You have a **stated position** on Redlock, split by consequence
- [ ] [`GATE.md`](GATE.md) passed out loud
