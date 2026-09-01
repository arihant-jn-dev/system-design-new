# 05·04 · Eviction Policies & Cache Sizing

> **Why this exists:** the roadmap's sharpest line in Phase 5 — *"why 80% hit rate might be worse than
> useless (and why **marginal** hit rate is what matters)."* Sizing a cache is arithmetic, and doing it out
> loud is a strong signal.

---

## Reference

## Eviction policies

When the cache is full, something must go.

| Policy | Evicts | Good for | Weakness |
|---|---|---|---|
| **LRU** (least recently used) | Oldest access | ⭐ **The default. Good enough almost always.** | ⚠️ **A single big scan evicts your whole hot set** |
| **LFU** (least frequently used) | Fewest accesses | Stable popularity distributions | Slow to adapt; old-but-once-popular items linger |
| **FIFO** | Oldest inserted | Trivial | Ignores access entirely |
| **Random** | Anything | ⭐ **Surprisingly decent**, O(1), no metadata | No intelligence |
| **ARC** (adaptive) | Balances recency + frequency automatically | Mixed workloads | Patented (historically); complex |
| ⭐ **W-TinyLFU** | Admission control: a *new* item must prove it's more valuable than the victim | **Best hit rates in practice** | More complex; used by Caffeine |
| **TTL-based** | Expired first | Time-sensitive data | Not really an eviction policy |

### The scan problem, and W-TinyLFU's answer

⚠️ **LRU's weakness is real:** one analytics job scanning a million rows pushes every hot key out. The cache
is now full of items nobody will ask for again, and the hit rate collapses right when you notice.

⭐ **W-TinyLFU's insight is admission control, not eviction:** when a new item arrives, ask *"has this been
requested more often than the item I'd have to evict?"* using a compact frequency sketch (count-min sketch —
Phase 9). **Scan items are admitted only if they earn it**, so a one-off scan can't destroy the hot set.
The "W" is a small LRU window in front, so genuinely new hot items can still get in.

**Caffeine (Java) uses W-TinyLFU and measurably beats LRU** on real traces. Worth naming — it shows you know
that eviction research didn't stop in 1970.

**Redis specifics:**

| `maxmemory-policy` | Behaviour |
|---|---|
| `noeviction` | ⚠️ **Writes fail when full.** The default — and a surprise if you assumed it was a cache. |
| ⭐ **`allkeys-lru`** | Evict any key, approximated LRU. **The usual choice for a pure cache.** |
| `allkeys-lfu` | Approximated LFU (Redis 4+) |
| `volatile-lru` / `volatile-ttl` | Only evict keys **that have a TTL** — use when Redis holds both cache and persistent data |
| `allkeys-random` | Cheap |

> **Redis's LRU is *approximate*** — it samples `maxmemory-samples` (default 5) keys and evicts the best
> candidate, rather than maintaining a true LRU list. **Exact LRU would cost memory and CPU for a marginal
> accuracy gain**, which is a nice example of a deliberate approximation.

---

## Sizing — the arithmetic

### Step 1 · Estimate the working set

**Not your total dataset — the part actually requested in a window.**

Real access is **Zipfian** ([Phase 0 note 10](../../phase-00-foundations/notes/10-workload-shape.md)):
roughly 20% of keys serve 80% of traffic.

```
500 M objects x 2 KB              = 1 TB total
hot 20% (80% of traffic)          = 200 GB
+ overhead (~1.3-1.5x for Redis)  ≈ 300 GB
```

**Redis overhead is real:** key strings, the dict entry, `robj` headers, expiry metadata — **50–100 bytes per
key minimum**. For small values that can *exceed* the value itself. `MEMORY USAGE key` tells you the truth.

### Step 2 · ⭐ Marginal hit rate — the part that matters

**This is the gate-worthy idea.** Don't ask "what's my hit rate?" Ask **"what does the *next* GB of RAM
buy?"**

| Hit rate | DB QPS (from 50 K) | RAM | Δ RAM | **Δ DB QPS** |
|---|---|---|---|---|
| 0% | 50,000 | 0 | — | — |
| 80% | 10,000 | 300 GB | +300 GB | **−40,000** |
| 90% | 5,000 | 500 GB | +200 GB | **−5,000** |
| 95% | 2,500 | 900 GB | +400 GB | **−2,500** |
| 99% | 500 | 1.5 TB | +600 GB | **−2,000** |

**Read the last column.** The first 300 GB removes 40,000 QPS. The next 200 GB removes 5,000. **Diminishing
returns are brutal**, because Zipf means the tail is genuinely long.

**But read it the other way too:** going 80% → 95% cuts database load **4×**. Whether that's worth 600 GB
depends entirely on whether your database can survive 10,000 QPS.

### Step 3 · ⭐ Why 80% might be "worse than useless"

**Because what matters is not the hit rate — it's whether the MISS load fits your database.**

```
50,000 QPS with an 80% hit rate  ->  10,000 QPS to the database
If the database tops out at 8,000 QPS, you are DOWN.
```

**An 80% hit rate that looks healthy on a dashboard is a system that is one cache hiccup from an outage** —
which is exactly what you measured in the lab. And worse: you've now built a system whose *capacity plan
silently depends on the cache*, without writing that down anywhere.

> **The gate answer:** *"Hit rate is the wrong metric. What matters is the absolute miss QPS and whether the
> database can serve it. 80% sounds fine, but at 50 K QPS that's still 10 K QPS of misses — and if the DB
> tops out at 8 K, the cache isn't an optimisation, it's a load-bearing dependency I haven't accounted for.
> I'd size on **marginal** hit rate: what does the next GB remove from the database? And I'd check what
> happens at 0% hit rate, because that's the cold-cache case."*

### Step 4 · Ask the endgame question

**Can you cache everything?**

At 1 TB total, caching 100% costs ~1.5 TB of RAM — expensive but *possible*. And it removes cache misses as
a failure mode entirely. **For a dataset that fits, "cache it all" is a legitimate and underused answer**;
it converts an availability risk into a line item.

### Metrics to actually track

| Metric | Why |
|---|---|
| **Hit rate** | Necessary but insufficient |
| ⭐ **Absolute miss QPS** | **What the database actually feels** |
| **Eviction rate** | Rising = cache too small (or a scan is thrashing it) |
| `used_memory` vs `maxmemory` | Headroom |
| **p99 latency of the miss path** | Your degraded-mode latency |
| **Key count and average size** | Big-key detection ([05](05-failure-modes.md)) |
| ⭐ **DB QPS if the hit rate went to 0** | Your cold-cache blast radius |

---

## In your own words

**Explain LRU's scan problem, and how W-TinyLFU's admission control fixes it.**

>

**Why is Redis's default `noeviction` a surprise, and what would you set?**

>

**Estimate a cache for 200 M objects × 3 KB with Zipfian access. Show the arithmetic including overhead.**

>

**Define marginal hit rate. Why does it change the sizing decision?**

>

**Explain why an 80% hit rate can be "worse than useless." Use concrete QPS numbers.**

>

**What's the endgame question, and when is "cache everything" the right answer?**

>

**Which single metric best captures your cold-cache blast radius?**

>

---

## Links

- Zipfian workloads → [Phase 0 note 10](../../phase-00-foundations/notes/10-workload-shape.md)
- Cold cache, measured → [05-failure-modes.md](05-failure-modes.md) and [`../lab/`](../lab/)
- Redis memory internals → [06-redis-internals.md](06-redis-internals.md)
- Count-min sketch (behind W-TinyLFU) → **Phase 9**
