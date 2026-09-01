# 11·03 · Beat 2 — Capacity Estimation

**3–5 minutes.**

> **Why this exists:** the roadmap's line is the whole note — ⭐ ***"use the numbers later; an estimate you
> never reference was theatre."***

---

## Reference

### ⭐ What it's actually for

**Not arithmetic — it's for making the design's shape non-arbitrary.**

⭐ **The estimate answers ONE question: does this fit on one box, or does it need a fleet?** Everything
downstream depends on that: sharding or not, cache or not, async or not, one region or many.

⭐ **So the test of a good estimate is whether it CHANGED a decision.** If you computed 3,000 QPS and then
designed something you'd have designed anyway, ⭐ **it was theatre and the interviewer noticed.**

### The four numbers

| | Compute | Then say what it implies |
|---|---|---|
| ⭐ **QPS (avg and PEAK)** | `DAU × actions/day ÷ 86,400`, then ⭐ **× 2–10 for peak** | *"3,000/sec peak — that's a fleet, not a box"* |
| **Storage/year** | `writes/day × bytes/write × 365` | *"2 TB/yr — one machine holds it, so no sharding for size yet"* |
| **Bandwidth** | `QPS × payload size` | *"500 MB/s egress — CDN, and this is a real cost line"* |
| ⭐ **Cache memory** | ⭐ **hot set, not total** — often 20% of data or the top-N keys | *"80 GB — fits in a small Redis cluster"* |

### ⭐ The numbers to know cold

**Round constants:**

| | |
|---|---|
| ⭐ **1 day ≈ 86,400 s ≈ 10⁵ s** | ⭐ **so 1 M/day ≈ 12/sec.** The single most useful conversion |
| 1 M/day ≈ 12/sec · 100 M/day ≈ 1,200/sec · 1 B/day ≈ 12,000/sec | |
| 1 KB = 10³ · 1 MB = 10⁶ · 1 GB = 10⁹ · 1 TB = 10¹² · 1 PB = 10¹⁵ | |
| A year ≈ 3 × 10⁷ s | |

**Typical sizes:**

| | |
|---|---|
| A tweet/short post | ~300 B (+ metadata → ~1 KB) |
| A URL | ~100 B |
| A user record | ~1 KB |
| A thumbnail | ~10 KB · A photo ~1 MB · A minute of 1080p video ~50 MB |
| A log line | ~200 B |

**⭐ Latency numbers — the shape matters more than the digits:**

| | |
|---|---|
| L1 cache | ~1 ns |
| Main memory | ~100 ns |
| ⭐ **SSD random read** | ~100 µs (**10³× memory**) |
| ⭐ **Network round trip, same DC** | ~0.5 ms |
| ⭐ **Disk seek (HDD)** | ~10 ms |
| ⭐ **Cross-continent round trip** | ⭐ **~150 ms — physics, and you cannot optimise it away** |

⭐ **The one to internalise: memory is ~100× faster than SSD, and a cross-region round trip is ~150 ms.**
That pair justifies most caching and most regional-deployment decisions you'll ever make.

**Rough machine capacities** — ⭐ *useful for "how many boxes?"*, and worth hedging as approximate:

| | |
|---|---|
| A modern server | ~10–50 K simple QPS |
| Postgres, well-indexed | ~5–10 K reads/s, ~1–5 K writes/s per node |
| Redis | ⭐ **~100 K ops/s single-threaded** |
| Kafka | ~100 K–1 M msg/s per broker |
| A WebSocket node | ⭐ **~50–100 K connections** |

### ⭐ Round aggressively, and say you are

> *"10 M DAU, call it 10 posts read each — 100 M reads/day. That's ~1,200/sec average; I'll assume a 5×
> peak, so **call it 6,000/sec**. I'm rounding hard because I only need the order of magnitude to decide
> whether this shards."*

⭐ **That last clause is the point.** ⚠️ **Nobody wants 7 significant figures**; they want to see that you
know 6,000/sec and 60,000/sec are different architectures and 6,000 vs 6,400 is not.

⚠️ **Don't do long division out loud** — it eats your clock and shows nothing. **Powers of ten, then move.**

### ⭐ Using the numbers later — the part that scores

**Plant them, then cash them in:**

| Beat | Cash it in as |
|---|---|
| **Data model** | *"2 TB/yr and 6 K writes/sec — that's past one Postgres node, so I'm sharding, and here's the key"* |
| **Architecture** | *"100:1 read-heavy, so a read-through cache is doing most of the work"* |
| **Deep dive** | *"the top 1% of keys take 50% of traffic, which is why the hot-key problem is the interesting part"* |
| ⭐ **Failure modes** | ⭐ **"the DB is sized for 5% of read traffic, so a cold cache is an availability failure, not a slowdown"** — cite your Phase 5 lab |
| **Wrap** | *"the cost driver here is egress, not compute"* |

⭐ **Writing the numbers ON THE DIAGRAM — QPS on arrows, size on datastores — makes this automatic**, and it
keeps them visible for the interviewer too.

### ⚠️ Traps

⚠️ **Estimating and never referring back** (the big one) · ⚠️ **forgetting peak** (⭐ *average QPS is not what
you provision for*) · ⚠️ **computing storage but not bandwidth** — ⭐ *egress is often the dominant cost, and
mentioning cost is a senior marker* · ⚠️ **sizing the cache to the whole dataset** rather than the hot set ·
⚠️ **spending 8 minutes here** · ⚠️ **quoting latency numbers with false precision** — ⭐ *say "roughly" and
mean it.*

---

## In your own words

**⭐ What is capacity estimation actually for? What's the test of a good one?**

>

**The four numbers, and what each implies about the design.**

>

**⭐ Convert 1 M/day, 100 M/day and 1 B/day to per-second, from memory.**

>

**⭐ Memory vs SSD vs cross-continent round trip. What do those justify?**

>

**Rough QPS for a server, Postgres, Redis, a WebSocket node.**

>

**⭐ Say the "I'm rounding hard because…" sentence out loud.**

>

**⭐ Give five places you'd cash in your numbers later.**

>

**Name four traps.**

>

---

## Links

- ⭐ **Run it** → [`../lab/drill.js`](../lab/drill.js)
- Latency numbers, percentiles, Little's Law → [Phase 0](../../phase-00-foundations/notes/)
- ⭐ Cache sizing and the cold-cache outage → [Phase 5](../../phase-05-caching/notes/)
- Sharding thresholds → [Phase 3D](../../phase-03-databases/notes/)
- Where the numbers get used → [07-bottlenecks-and-failure.md](07-bottlenecks-and-failure.md)
