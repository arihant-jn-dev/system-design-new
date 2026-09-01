# 09·07 · Autocomplete / Typeahead

> **Why this exists:** a classic 45-minute question, and ⭐ **you built it and measured the difference: 3,506×
> at p99.** It's also the cleanest demonstration of the phase's biggest transferable idea — *pay at write
> time so reads are trivial.*

---

## Reference

### The requirement that drives everything

⭐ **A response on EVERY KEYSTROKE, in well under 100 ms, for millions of users.** That budget is what makes
the obvious implementation unusable and forces precomputation.

### ⭐ The trie, and why the naive query fails

```
        (root)
       /      \
      r        s
      |        |
      e        e
     / \       |
    s   t      a
    |          |
   [reset]  [search]        ⭐ shared prefixes ARE the compression
```

**Naive:** walk to the prefix node, DFS the whole subtree, sort by score, take K.
⚠️ **Correct, and unusable** — a 1-character prefix's subtree is a large fraction of the corpus.

### ⭐ Top-K per prefix — precompute at every node

**Store the best K completions AT EVERY NODE.** A query becomes *"walk P characters, return a stored array"*
— ⭐ **O(prefix length), completely independent of corpus size.**

⭐ **The build is cheap and that surprises people:** one post-order pass where each node merges its own term
with its children's *already-computed* top-Ks. **Each child contributes at most K entries, so a node's merge
is O(children × K), not O(subtree)** — the whole build is linear.

### ⭐ What you measured

200,000 terms, 571,634 trie nodes (2.9 per term), K=5:

| | p50 | p99 |
|---|---|---|
| naive DFS | 4.445 ms | ⚠️ **18.698 ms** |
| ⭐ precomputed | **0.0008 ms** | ⭐ **0.0053 ms** |
| | **5,612×** | ⭐ **3,506×** |

**And the single-character prefix `"r"` — the one users type first, on every search:**

| | |
|---|---|
| naive | 4.668 ms |
| precomputed | ⭐ **0.0005 ms** — **10,193×** |

> ⭐ **THE WORST CASE IS THE COMMON CASE.** The naive structure is slowest exactly where it's hit hardest.
>
> ⭐ **And the real argument isn't the constant factor — it's the complexity class.** Naive is O(subtree), so
> it scales with your corpus; precomputed is O(prefix length), so it doesn't. At 2 M terms the gap is ten
> times wider.

**Correctness:** the fast path returned **exactly** what the slow path did across all 9 probe prefixes.
⭐ **Verify this in your own implementations — a precomputed structure that's subtly wrong is worse than a
slow one.**

### ⭐ The cost is not memory — it's updates

Precompute time was **116 ms** for 200k terms, storing 711,588 entries (≤5 per node). Cheap.

⚠️ **But changing ONE term's score can change the stored top-K of EVERY node on its root path** — and a term
falling *out* of a top-5 somewhere isn't locally detectable.

> ⭐ **SO NOBODY UPDATES IN PLACE. You REBUILD PERIODICALLY** — from the query log, every N minutes — ship it
> as an immutable artifact, and ⭐ **swap it atomically.** (Same trick as a search alias swap
> [06](06-search-and-inverted-index.md), same shape as a rebuildable projection
> [Phase 8](../../phase-08-architecture/notes/05-cqrs.md).)
>
> ⭐ **And that IS the answer to "how do you handle a newly trending query?"** — you don't patch the trie.
> You shorten the rebuild interval, and **merge a small live "trending/recent" list at query time.**

### ⭐ The rest of the design — what gets pushed on

| Concern | Answer |
|---|---|
| ⭐ **Sharding** | ⭐ **Shard BY PREFIX** (`re*` on one node), ⚠️ **never by hash** — a hash shard would need every node queried on every keystroke. Prefix sharding keeps one keystroke = one node. ⚠️ Watch the hot shard (`a*` ≫ `z*`) |
| ⭐ **Caching** | The head of a Zipf distribution is tiny — ⭐ **cache the top few thousand prefixes at the CDN/edge and most keystrokes never reach you** |
| ⭐ **Debouncing** | 50–150 ms client-side. ⭐ **The cheapest scaling lever you have — it deletes most traffic before it exists, and users can't tell** |
| **Personalisation** | Merge a small per-user history list at query time. ⚠️ **Never a trie per user** |
| **Typos** | A trie does prefixes only. Fuzzy needs bounded-Levenshtein traversal, an n-gram index, or a spell-corrector in front |
| **Ranking** | Frequency is the baseline; real systems blend recency, CTR, session context, location |
| ⚠️ **Safety** | An autocomplete surfaces whatever people type. **A blocklist and a policy layer are mandatory** — this has caused real public incidents for every major search engine |

### Alternatives worth naming

⭐ **A sorted list + binary search on the prefix range** — simpler, works to surprisingly large corpora, and
**is what most teams should start with** · **Redis sorted set per prefix** (`ZRANGEBYLEX`) — easy and
distributed · **Elasticsearch completion suggester** (an FST) · ⭐ **a DAWG/FST, which shares SUFFIXES too**
and is far more compact than a trie.

⚠️ **A trie in a garbage-collected language is memory-hungry** — 571k `Map` objects for 200k terms. Real
implementations use arrays, packed FSTs, or a compressed radix tree.

---

## In your own words

**⭐ What requirement makes the naive approach unusable?**

>

**Explain top-K-per-prefix. Why is the BUILD linear rather than O(corpus) per node?**

>

**⭐ Cite your numbers, including the single-character prefix. Why is that case the important one?**

>

**⭐ Why is the complexity class the real argument, not the constant factor?**

>

**What is the actual cost of precomputing, and why can't you update in place?**

>

**⭐ How do you handle a newly trending query?**

>

**⭐ Why shard by prefix and never by hash? What's the risk?**

>

**⭐ Which lever removes the most load for the least effort, and why is it invisible to users?**

>

**What can't a trie do, and what would you add?**

>

**What would you actually build first, before any of this?**

>

---

## Links

- ⭐ **You built and measured it** → [`../lab/autocomplete/run.js`](../lab/autocomplete/run.js)
- Inverted indexes, FSTs, alias swaps → [06-search-and-inverted-index.md](06-search-and-inverted-index.md)
- Precompute-at-write as a general instinct → [Phase 8 note 05](../../phase-08-architecture/notes/05-cqrs.md)
- The same instinct again → [09-feed-and-timeline.md](09-feed-and-timeline.md)
- Edge caching → [Phase 5](../../phase-05-caching/notes/)
- Zipf distributions and hot keys → [05-counters-at-scale.md](05-counters-at-scale.md)
