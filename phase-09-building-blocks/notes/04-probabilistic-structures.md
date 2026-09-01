# 09·04 · Probabilistic & Streaming Structures

> **Why this exists:** the roadmap calls these ⭐ ***"high signal, low cost to learn."*** They're the cheapest
> way to sound senior, because they answer *"that doesn't fit in memory"* with a number rather than a shrug.
> ⭐ **Gate Q2 is the HyperLogLog question.**

---

## Reference

### ⭐ The one idea behind all of them

> ⭐ **Trade a small, BOUNDED, QUANTIFIABLE error for an enormous reduction in memory — and turn a problem
> that scales with your data into one that uses constant space.**

⭐ **The senior move is always the same: state the error, state the memory, and say why the error is
acceptable for this use.** *"±0.81% on a visitor count nobody makes a decision from at 3 significant
figures"* is a complete answer.

| Structure | Answers | Memory | Error |
|---|---|---|---|
| ⭐ **Bloom filter** | "have I seen this?" | ⭐ **~10 bits/item @ 1%** | ⚠️ false positives only |
| ⭐ **HyperLogLog** | "how many *unique*?" | ⭐ **~12 KB, fixed** | ±0.81% |
| **Count-Min Sketch** | "how often is X?" | a few hundred KB | over-counts only |
| **t-digest** | "what's p99?" | a few KB | accurate at the tails |
| **Reservoir sampling** | "a fair sample of a stream" | k items | it's a sample |

### ⭐ Bloom filter — what you measured

```
m = -(n · ln p) / (ln 2)²      bits
k = (m / n) · ln 2             hash functions
```

Your run, 1M items at a 1% target:

| | |
|---|---|
| memory | ⭐ **1,170 KB** (9.6 bits/item, k=7) — vs ~61 MB for a `Set`, **53× less** |
| false negatives | ⭐ **0** — and this is a *guarantee*, not a measurement |
| ⭐ measured FP rate | ⭐ **1.00%** vs theory 1.00% |
| bits set | 51.8% — ⭐ optimal *k* targets ~50%, the maximum-entropy state |

⭐ **Theory and measurement agreeing matters**: it means you can size one on paper and trust the number in a
design discussion.

⚠️ **What happens when you undersize it — you measured this too:**

| Load | FP rate |
|---|---|
| 1× (designed) | 1.0% |
| 2× | ⚠️ **15.8%** |
| 4× | ⚠️ **67.8%** |
| 8× | ⚠️ **98.1%** |

> ⭐ **At 8× it says "yes" to everything — an expensive function that returns true. AND NOTHING ERRORS.** No
> exception, no metric. Your cheap pre-filter is now pure overhead on the lookup it was meant to avoid.
> ⭐ **So monitor the FILL RATIO and alert past ~50%.** For growth: rebuild bigger, or a **scalable bloom
> filter** (a chain with geometrically tightening error rates).

⚠️ **No deletes** — clearing a bit breaks every other key that set it, creating **false negatives**, which
destroys the only guarantee the structure has. Use a **counting bloom filter** (4-bit counters, 4× memory) or
a **cuckoo filter**.

⭐ **The rule for every use: a false positive must cost you WORK, never CORRECTNESS.** "Do an unnecessary
lookup" is fine; "skip a required check" is a security bug.

**Where they actually live:** ⭐ **LSM-tree SSTables** (RocksDB/Cassandra/HBase keep one per file — it's why
LSM reads aren't O(files), [Phase 3](../../phase-03-databases/notes/)) · ⭐ **cache-penetration defence**
(requests for keys that don't exist sail past your cache to the DB, [Phase 5](../../phase-05-caching/notes/))
· crawler URL dedupe · Chrome's Safe Browsing list.

### ⭐ HyperLogLog — gate Q2

**The problem:** count unique visitors across **500 M events/day**. A `Set` of 100 M distinct 16-byte IDs is
**several GB per day, per dimension you want to slice by** — and it's unmergeable across shards.

**The intuition (say this, it's the whole trick):**

> ⭐ **Hash each item, and look at the number of LEADING ZEROS in the hash. Seeing a hash with 10 leading
> zeros suggests you've seen about 2¹⁰ distinct items — because that's how rare that pattern is.** Keeping
> the maximum you've seen gives a (very noisy) estimate of cardinality **in a handful of bits.**
>
> ⭐ **HLL just does that 16,384 times in parallel** — bucket by the first 14 bits of the hash, keep the max
> leading-zero count per bucket, and combine with a harmonic mean to kill the variance.

| | |
|---|---|
| Memory | ⭐ **~12 KB, FIXED** — for a thousand uniques or a billion |
| Error | ⭐ **±0.81%** standard error at 16,384 registers (`1.04/√m`) |
| ⭐ **Mergeable** | ⭐ **union = per-register max.** So you can HLL per shard/hour and merge them **losslessly** |
| Not supported | ⚠️ no "is X in the set?", ⚠️ no deletes, ⚠️ **intersections are inaccurate** (inclusion-exclusion amplifies both errors) |

⭐ **Mergeability is the property that actually wins the design.** Store one 12 KB HLL **per hour per
dimension**; daily/weekly/monthly uniques are then a *merge*, not a re-scan. ⚠️ **And note you cannot get
that by summing daily counts** — `unique(Mon) + unique(Tue) ≠ unique(Mon∪Tue)`. **Only the sketches merge.**

**The gate answer:**

> *"HyperLogLog. ~12 KB per counter regardless of cardinality, ±0.81% error. I'd keep one per hour per
> dimension in Redis (`PFADD`/`PFCOUNT`/`PFMERGE`) and merge for longer windows, because ⭐ **HLLs union
> losslessly and raw counts don't**. ⭐ The error is acceptable because nobody makes a decision on unique
> visitors at 3 significant figures — a dashboard reading 4.21 M vs 4.24 M changes nothing. ⭐ **If it were
> billing or a compliance count I'd store exact IDs instead and pay for it**, because 'approximately how
> many people did we charge' is not an answer. And for small cardinalities HLL switches to a sparse exact
> representation anyway, so the low end is exact."*

⭐ **That last pair of sentences — naming when you'd NOT use it — is what separates the answer.**

### Count-Min Sketch

**"How often has X occurred?"** in sublinear space. A `d × w` matrix of counters; hash the item with *d*
functions, increment one counter per row; **query = the MINIMUM across rows** (the min is the least
polluted by collisions).

⭐ **Over-counts only, never under-counts** — so a heavy hitter is never missed. Bounded by `ε·N` with
probability `1-δ`. **Use: heavy hitters / trending / top-K, per-key rate limiting at huge key counts.**
⚠️ **Rare items are proportionally the most wrong**, so pair it with a heap of candidate top-K.

### t-digest & reservoir sampling

⭐ **t-digest**: accurate quantiles from a stream in a few KB, ⭐ **denser near the tails where you care
(p99)**, and **mergeable across hosts** — which is why it's what real metrics systems use.
⚠️ **You cannot average percentiles across servers** — averaging p99s is meaningless; you must merge
sketches. ⭐ **Saying that is a strong signal.**

**Reservoir sampling**: a uniform sample of *k* from a stream of unknown length, in one pass — keep the
first *k*, then for item *i* replace a random slot with probability *k/i*. **Use: sampled tracing, debug
logs from a firehose.**

### ⭐ Choosing, out loud

| Question | Reach for |
|---|---|
| "Have I seen this?" | **Bloom** (or cuckoo if you need deletes) |
| "How many unique?" | ⭐ **HyperLogLog** |
| "How often / what's trending?" | **Count-Min Sketch** + a top-K heap |
| "What's p99?" | **t-digest** |
| "A fair sample?" | **Reservoir sampling** |
| ⚠️ "Exactly, for money or the law" | ⭐ **None of the above — store the data** |

---

## In your own words

**⭐ State the single idea behind all of these, and the three things you must always say.**

>

**Bloom filter: both formulas, and cite your measured FP rate vs theory.**

>

**⭐ What did you measure at 2×/4×/8× overfill, and why is it especially dangerous?**

>

**Why can't a bloom filter support delete? What are the two fixes?**

>

**⭐ State the rule about what a false positive may cost you.**

>

**⭐ Explain HyperLogLog's leading-zeros intuition in two sentences.**

>

**⭐ Memory and error for HLL. Which property makes it win the design, and why can't you sum daily counts?**

>

**⭐ Deliver the gate Q2 answer, including when you would NOT use HLL.**

>

**Count-Min Sketch: why the minimum, and which direction does it err?**

>

**⭐ Why can't you average p99 across servers?**

>

---

## Links

- ⭐ **You built and measured the bloom filter** → [`../lab/bloom-filter/run.js`](../lab/bloom-filter/run.js)
- ⭐ **Gate Q2** → [`../GATE.md`](../GATE.md)
- Bloom filters in LSM trees → [Phase 3](../../phase-03-databases/notes/)
- Cache penetration → [Phase 5](../../phase-05-caching/notes/)
- Redis `PF*` commands → [Phase 5](../../phase-05-caching/notes/)
- Percentiles, and why the mean lies → [Phase 0](../../phase-00-foundations/notes/)
- Heavy hitters → [05-counters-at-scale.md](05-counters-at-scale.md)
