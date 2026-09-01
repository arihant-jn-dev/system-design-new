# Phase 5 — Gate

> **Rules:** Out loud. From memory. No notes.
> **Q2 is timed: under 60 seconds.**

---

## Q1 · Design the full caching strategy for a read-heavy product

*(Pick one: an e-commerce catalog, a news site, a social feed. State the scale first.)*

**You pass if you walked the LAYERS, top to bottom:**

- [ ] **Browser** — versioned asset URLs, `Cache-Control: immutable`
- [ ] **CDN** — public content; ⭐ **versioned URLs rather than purging**; `stale-while-revalidate` + `stale-if-error`
- [ ] ⭐ **Reverse-proxy micro-cache** — 1–5 s TTL on hot dynamic endpoints. **Do the arithmetic**: 10 K QPS with a 5 s TTL = ~1 origin req/s.
- [ ] **App-local** — hot keys, 1–5 s TTL, no network hop
- [ ] **Redis** — per-user and query results
- [ ] **DB buffer pool** — check whether the working set just fits in RAM before adding a tier

**And for each: key, TTL, invalidation.**

- [ ] ⭐ **Key design** — everything that changes the value must be in the key (**tenant, user, permission, locale**), parameters normalised, marketing params stripped
- [ ] **TTLs by data type**, always **jittered**
- [ ] **Invalidation**: TTL as the default and the backstop · delete-after-write · ⭐ **versioned keys** (race-free) · ⭐ **CDC-driven** (catches write paths you forgot)
- [ ] **Pattern named**: cache-aside for reads + invalidate on write, and ⭐ **"invalidate, don't update"** with the reason

**⭐ The part being marked — what happens when the cache dies:**

- [ ] **Miss QPS to the database**, and whether the DB can serve it
- [ ] **Cold-cache outage** — cite your own lab numbers (271 errors, p95 2 s)
- [ ] Mitigations: **warming before taking traffic**, persistence for warm restarts, request coalescing, headroom
- [ ] ⭐ **The honest position**: *"either we provision for full cache loss, or we accept it's an outage — but that decision gets made explicitly, not discovered during an incident."*

**Self-score:** ___ / 14

---

## Q2 · Name five cache failure modes and their mitigations — **timed, under 60 seconds**

- [ ] **Stampede** — many requests miss the *same* key → **request coalescing**, probabilistic early expiry, serve stale
- [ ] **Avalanche** — many *different* keys expire together → **TTL jitter**
- [ ] **Hot key** — one key saturates one node → **local/near cache**, key replication *(no hashing can split one key)*
- [ ] **Penetration** — queries for keys that don't exist → **negative caching, bloom filter**
- [ ] **Cold cache** — empty after restart → **warming, persistence, headroom**
- [ ] *(bonus)* **Big keys** — block single-threaded Redis → cap size, ⭐ **`UNLINK` not `DEL`**

**Bonus:**
- [ ] ⭐ In-process coalescing is **per instance** — 50 instances = 50 queries/key. Fleet-wide needs a distributed lock or early expiry.
- [ ] Stampede vs avalanche stated crisply: *same key* vs *many keys*

**Self-score:** ___ / 8 · **Time: ____ s**

---

## Q3 · Explain the Redlock controversy and state your own position

- [ ] **Single-Redis lock**: `SET key token NX PX`, release via **Lua with a token check** — and why a plain `DEL` can delete someone else's lock
- [ ] Its weakness: **one node is a SPOF, and replication is async** — a failover can lose the lock
- [ ] **Redlock**: N=5 independent primaries, acquire on a majority within the TTL

**Kleppmann's objections — at least three:**
- [ ] ⭐ **No fencing token** — and you can't retrofit one, because N independent nodes share no monotonic counter
- [ ] Depends on **bounded clock drift and bounded pauses** — neither holds (GC, NTP, VM migration)
- [ ] **No consensus, no durable log** — a restart can forget a granted lock
- [ ] ⭐ **The efficiency vs correctness split**

**Antirez's side — at least one:**
- [ ] Timing assumptions are practical; fencing needs resource support you may not have; it targets efficiency use cases
- [ ] Bonus: **the fencing critique applies to *every* lock service** — a ZooKeeper lock without fencing is also unsafe

**⭐ Your position — mandatory:**
- [ ] **Split by consequence**: efficiency → single Redis lock is fine; correctness → consensus + fencing
- [ ] ⭐ **You cited the failure you demonstrated** in the Phase 4 lab
- [ ] ⭐ You ended by **questioning the premise**: unique constraint · `SKIP LOCKED` · conditional update · partition by entity

**Self-score:** ___ / 11

---

## Extra checks

- [ ] **Why is invalidation hard?** Three specific reasons — not the joke.
- [ ] Draw the race where a reader **repopulates a stale value**
- [ ] **Versioned keys** — why is there no race?
- [ ] **Why CDC invalidation catches what explicit invalidation misses**
- [ ] ⭐ **Marginal hit rate** — and why 80% can be "worse than useless." Use QPS numbers.
- [ ] **LRU's scan problem**, and W-TinyLFU's admission control
- [ ] Redis default `maxmemory-policy` is `noeviction` — why is that a surprise?
- [ ] ⭐ **Why single-threaded?** One benefit, one danger.
- [ ] **Four things sorted sets unlock**
- [ ] **HyperLogLog** — size and error numbers
- [ ] **`KEYS` vs `SCAN`** — and `SCAN`'s weaker guarantee
- [ ] ⭐ **Why can't `MULTI/EXEC` implement a token bucket?** What can?
- [ ] **RDB vs AOF**, and the real reason to persist a *cache*
- [ ] **Hash tags** in Redis Cluster — what failure do they prevent?
- [ ] **Fixed window lets 2× through** — explain the boundary
- [ ] `hash % N` for a cache — cite your measured 75% and trace the outage
- [ ] **When is Memcached genuinely the right choice?** Include the subtle argument.
- [ ] **Precomputation vs caching** — the deciding variable, and correctness drift

---

## Scoring

| Result | Do this |
|---|---|
| All three passed + most extras | ✅ Advance to **Phase 6 — Async, Messaging & Streaming** |
| Fumbled any of Q1–Q3 | ⛔ Redo that note's "own words" section, retry in 2 days |

| Fumbled | Redo |
|---|---|
| Q1 | [notes/01](notes/01-cache-hierarchy.md) + [03](notes/03-invalidation.md) — then design it for three different products |
| Q2 | [notes/05](notes/05-failure-modes.md) — recite daily until it's under 60 s |
| Q3 | [notes/09](notes/09-redlock.md) + re-read the [Phase 4 fencing lab](../phase-04-distributed-systems/lab/) |

---

## Before Phase 6

Phase 6 is **two weeks (~16 hrs)** and the roadmap ranks it **second only to databases** in interview weight.

- [ ] ⭐ **Practice problems: you should be at 5–6 by now** (roadmap Week 8). Caching makes URL shortener,
      rate limiter and distributed cache much richer — do them now if you haven't.
- [ ] **DDIA ch. 10–12** during Phase 6.
- [ ] Re-read Phase 3E's [outbox note](../phase-03-databases/notes/3e-04-outbox-and-cdc.md) — Phase 6 builds
      directly on it.

---

## Gate log

| Attempt | Date | Q1 | Q2 (time) | Q3 | Notes |
|---|---|---|---|---|---|
| 1 |  | /14 | /8 ( s) | /11 |  |
| 2 |  | /14 | /8 ( s) | /11 |  |
