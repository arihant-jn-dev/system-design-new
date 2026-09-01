# 05·01 · The Cache Hierarchy

> **Why this exists:** "add a cache" is not a design. **Which layer?** is the design. Every layer has
> different invalidation, different failure behaviour, and a different cost — and gate Q1 asks you to lay out
> all of them.

---

## Reference

### The layers, closest to the user first

```
CPU L1/L2/L3          ~1-10 ns      you don't manage this
  ▼
Browser cache         0 ms          Cache-Control, ETag, service worker
  ▼
CDN / edge PoP        ~10 ms        the biggest single win for public content
  ▼
Reverse proxy         ~1 ms         nginx/Varnish micro-caching
  ▼
API gateway           ~1 ms         response caching per consumer
  ▼
Application (local)   ~0.1 µs       in-process map, Caffeine, LRU. NO network hop.
  ▼
Distributed cache     ~0.5-1 ms     Redis / Memcached
  ▼
DB buffer pool        ~0.1 µs       shared_buffers -- a cache you already have
  ▼
OS page cache         ~0.1 µs       free, invisible, and it matters
  ▼
Disk                  ~100 µs
```

**The rule: the closer to the user, the cheaper the hit and the harder the invalidation.** A browser cache
hit costs nothing and you cannot purge it. A database buffer-pool hit is always correct and cost you a full
round trip to reach.

### What each layer is actually for

| Layer | Caches | Invalidation | Failure if it dies |
|---|---|---|---|
| **Browser** | Static assets, GET responses | ❌ **You can't** — only TTL expiry or a **changed URL** | Extra requests to CDN |
| **CDN** | Public, cacheable content | Purge by URL/tag; ⭐ **versioned URLs are better** | Origin gets 100% of traffic — **and it's sized for 5%** |
| **Reverse proxy** | Hot dynamic responses | TTL, purge | Marginal |
| **App-local** | Hot keys, config, computed values | TTL; hard to invalidate across instances | Nothing — just misses |
| **Distributed (Redis)** | Sessions, query results, everything | ⭐ **Full control — the layer you actually manage** | ⚠️ **Cold-cache outage** ([05](05-failure-modes.md)) |
| **DB buffer pool** | Recently-read pages | Automatic, always correct | Disk I/O |
| **OS page cache** | File blocks | Automatic | Disk I/O |

> ⭐ **Versioned URLs are the single best invalidation trick in the whole hierarchy**
> (`/app.a3f9c2b1.js`, `Cache-Control: max-age=31536000, immutable`). To "invalidate," you change the URL.
> No purge, no propagation delay, no race. It sidesteps the hard problem entirely — which is why every modern
> build pipeline does it.

### The two layers people forget

**1 · The database buffer pool is already a cache.**
Postgres `shared_buffers` caches recently-read pages. **Before adding Redis, check whether the working set
simply fits in RAM** — a bigger machine can make an entire caching tier unnecessary
([Phase 0 note 09](../../phase-00-foundations/notes/09-scalability-and-elasticity.md)).

**2 · The app-local cache is 5,000× faster than Redis.**
An in-process lookup is ~0.1 µs; a Redis round trip is ~500 µs. For a hot key read thousands of times a
second, **a local cache with a 1-second TTL removes the network hop entirely** and is the standard fix for
hot keys ([05](05-failure-modes.md)).

### Two-tier (near) caching — the pattern worth knowing

```
request -> LOCAL cache (1-5s TTL)  -> REDIS (60s TTL)  -> database
             ~0.1 µs, per-instance      ~0.5 ms, shared
```

| ✅ | ❌ |
|---|---|
| Absorbs hot keys entirely | ⚠️ **Invalidation is now hard** — you can't purge N instances' local maps synchronously |
| Survives a Redis restart | Instances can briefly disagree |
| Massive latency win on the hot set | More memory per instance |

**Invalidating the local tier:** short TTLs (usually enough), a Redis pub/sub invalidation channel, or
**Redis client-side caching** (Redis 6 `CLIENT TRACKING` — the server tells clients when their cached key
changed). **The pragmatic answer is almost always "1–5 second TTL and accept it."**

### Where to cache what

| Data | Layer | Why |
|---|---|---|
| Images, CSS, JS, fonts | **CDN**, versioned URLs, 1 year | Immutable |
| Public API responses | CDN + short TTL, `stale-while-revalidate` | Shared across users |
| Hot dynamic page (homepage, trending) | ⭐ **Reverse-proxy micro-cache, 1–5 s** | At 10 K QPS, a 5 s TTL cuts origin load ~99.98% |
| Per-user data | **Redis** (never a CDN — `Cache-Control: private`) | Personal |
| Sessions | Redis | Needs revocation |
| Hot keys | ⭐ **App-local + Redis** | Two-tier |
| Computed aggregates | Redis, or a **materialised view** ([11](11-precomputation.md)) | Expensive to derive |
| Anything with a correctness invariant | ⚠️ **Don't cache** — or cache with strong invalidation | Stale = wrong |

> ⭐ **Micro-caching deserves the emphasis.** A 1–5 second TTL on a hot dynamic endpoint feels like no caching
> at all from a freshness standpoint, but at 10,000 QPS it collapses origin load to ~1 request/sec. Enormous
> win, negligible staleness — and it's routinely overlooked because "that endpoint is dynamic."

### Gate Q1 shape

*"Design the full caching strategy for a read-heavy product."*

Walk the layers **top to bottom**, and for each: **what's cached, what the key is, what the TTL is, how it's
invalidated, and what happens when it dies.** Then finish with the whole-cache-dies question
([05](05-failure-modes.md)) — that's the part being marked.

---

## In your own words

**List the layers from user to disk. What's the general rule about closeness vs invalidation?**

>

**Why are versioned URLs the best invalidation mechanism? What problem do they sidestep?**

>

**Name the two layers people forget, and why each matters.**

>

**Why is a local cache ~5,000× faster than Redis, and what does that make it the right fix for?**

>

**Explain two-tier caching and its one real cost. What's the pragmatic answer to that cost?**

>

**Do the micro-caching arithmetic: 10,000 QPS with a 5-second TTL. What's the origin load?**

>

---

## Links

- CDN mechanics → [Phase 2 note 08](../../phase-02-stateless-scaling/notes/08-cdn.md)
- Latency numbers behind the hierarchy → [Phase 0 note 02](../../phase-00-foundations/notes/02-latency-numbers.md)
- Patterns → [02-caching-patterns.md](02-caching-patterns.md) · Invalidation → [03-invalidation.md](03-invalidation.md)
- **Failure modes** → [05-failure-modes.md](05-failure-modes.md)
- DB buffer pool → [3a-01](../../phase-03-databases/notes/3a-01-btree.md)
