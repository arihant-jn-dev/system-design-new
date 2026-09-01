# 04 · Consistent Hashing

> **Why this exists:** the roadmap says **"implement it, don't just describe it"** — twice, in Phase 2 and
> again in Phase 3D. It's the answer to cache clusters, sharding, and distributed key-value stores, and it
> reappears in Phases 3, 5 and 9. Learn it once, properly, in ~50 lines.

---

## Reference

### The problem it solves

You have N nodes and want to map keys to them. The obvious approach:

```
node = hash(key) % N
```

**This is catastrophic when N changes.**

Go from 3 nodes to 4. Key `"user:42"` with `hash = 100`:
```
100 % 3 = 1     →  node 1
100 % 4 = 0     →  node 0     ← moved
```

**Almost every key moves.** For N → N+1, the fraction of keys that keep their home is roughly `1/(N+1)`:

| Change | Keys that move |
|---|---|
| 3 → 4 nodes | **~75%** |
| 10 → 11 nodes | **~91%** |
| 100 → 101 nodes | **~99%** |

**Why that's a disaster:**
- **Cache**: ~all keys miss simultaneously → every request goes to the database → **the database dies**. Adding
  a cache node causes an outage. (This is the cache-avalanche failure mode — Phase 5.)
- **Sharded data**: ~all data must physically move. Terabytes over the network, while serving traffic.

> Note the perverse incentive: with modulo hashing, **scaling up causes an outage**, so teams stop scaling.

### The idea

**Map both keys and nodes onto the same circular space (the "ring"), typically `hash → [0, 2^32)`.
A key belongs to the first node found walking clockwise from the key's position.**

```
            0 / 2^32
                │
      nodeC ────┼──── k1
        ╱       │       ╲
   k4  │        │        │  nodeA
       │        ●        │
   k3  │                 │  k2
        ╲               ╱
      nodeB ───────────

  k1 walks clockwise → nodeA
  k2 walks clockwise → nodeB
  ...
```

**Now remove nodeA.** Only the keys between nodeC and nodeA (the ones that *pointed at* nodeA) move — they
walk further clockwise to nodeB. **Every other key is unaffected.**

**Add a node**, and it takes over only the arc between itself and its predecessor.

```
Keys that move when a node is added or removed:  ~1/N     (not ~all of them)
```

That's the whole idea, and it's the property the lab measures.

### The problem with the naive ring: uneven distribution

With only N points on the ring, the arcs are random and therefore **uneven**. With 3 randomly-placed nodes,
one might own 55% of the ring and another 15%. Worse: when a node is removed, **its entire arc goes to a
single successor**, doubling that node's load — a cascading-failure risk.

### Virtual nodes — the fix

**Place each physical node on the ring many times** (typically 100–200 replicas), using
`hash(nodeName + "#" + i)`.

**The rule to remember: relative standard deviation of load ≈ `1 / √V`**, where V is vnodes per node.
(Each node owns V arcs; arc lengths are roughly exponentially distributed, so averaging V of them shrinks the
variance by √V.)

| Vnodes per node | Std dev of load | Typical max−min spread across ~5 nodes |
|---|---|---|
| 1 | ~100% | Catastrophic — one node can own 3× its share |
| 10 | ~32% | ~70% |
| 100 | ~10% | ~25% |
| **150** | **~8%** | **~20%** — the common production choice |
| 1000 | ~3% | ~8% |

> ⚠️ **Note that 150 vnodes does *not* give you near-perfect balance** — it gives you roughly ±8% per node.
> That's good enough, and pushing further has diminishing returns (√V is a slow function: 10× the vnodes buys
> only ~3× the evenness). You measure exactly this in the lab. If you need genuinely tight balance, the answer
> is a different algorithm — rendezvous or Maglev hashing — not more vnodes.

**The hash function matters as much as V.** Ring keys (`nodeA#0`, `nodeA#1`, …) are near-identical strings, so
a hash with weak **avalanche** maps them to clustered ring positions and no amount of vnodes will save you.
Measured on the lab's exact workload: FNV-1a gives a **74.7%** spread where MurmurHash3 gives **22.5%**.

**What vnodes buy you:**

1. **Even distribution** — the law of large numbers smooths the arcs
2. **Removal spreads across many successors** instead of dumping onto one
3. **Heterogeneous capacity** — give a 2× bigger machine 2× the vnodes. Weighting for free.

**Cost:** memory for the ring (150 × N entries — trivial) and `O(log(150N))` lookup via binary search.

### The implementation (this is all of it)

```js
class ConsistentHash {
  constructor(nodes = [], vnodes = 150) {
    this.vnodes = vnodes;
    this.ring = [];              // sorted [{hash, node}]
    nodes.forEach(n => this.addNode(n));
  }

  addNode(node) {
    for (let i = 0; i < this.vnodes; i++) {
      this.ring.push({ hash: hash32(`${node}#${i}`), node });
    }
    this.ring.sort((a, b) => a.hash - b.hash);
  }

  removeNode(node) {
    this.ring = this.ring.filter(e => e.node !== node);
  }

  getNode(key) {
    if (this.ring.length === 0) return null;
    const h = hash32(key);
    // first ring entry with hash >= h, wrapping to 0 (the circle)
    let lo = 0, hi = this.ring.length - 1;
    if (h > this.ring[hi].hash) return this.ring[0].node;   // wrap
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.ring[mid].hash < h) lo = mid + 1; else hi = mid;
    }
    return this.ring[lo].node;
  }
}
```

**~30 lines.** You implement and measure this in [`../lab/`](../lab/) Part B.

**Hash function choice matters:** use a fast, well-distributed non-cryptographic hash — **MurmurHash3,
xxHash, or FNV-1a**. MD5/SHA work but are needlessly slow. **Do not use a language's built-in `hashCode`** —
they're often poorly distributed and sometimes randomised per process, which would give different rings on
different machines.

### Replication on the ring

For a replicated store, walk clockwise and take the **next R *distinct physical* nodes**:

```
getNodes(key, R): walk clockwise from hash(key), collecting distinct physical nodes until you have R
```

**"Distinct physical" matters** — with vnodes, the next few ring entries may all belong to the same machine,
which would give you R copies on one box. Real systems also skip to distinct **racks/AZs** for failure
independence. This is how Dynamo, Cassandra and Riak place replicas.

### Where consistent hashing shows up

| System | Use |
|---|---|
| **Memcached / Redis clients** | Distribute keys across cache nodes without mass invalidation on membership change |
| **Cassandra, DynamoDB, Riak** | Partition assignment (Cassandra calls vnodes "tokens") |
| **CDN / edge caches** | Which PoP server holds which object; **origin shielding** (note 08) |
| **nginx / Envoy / HAProxy** | `hash $key consistent` — sticky routing to a backend |
| **Sharded WebSocket tiers** | Which node owns a given user's connection |
| **Kafka** (partly) | Key-based partitioning uses `hash(key) % partitions` — which is *why* changing partition count breaks ordering guarantees (Phase 6) |

> That Kafka row is a nice detail: Kafka **doesn't** use consistent hashing for partition assignment, and the
> consequence is exactly the modulo problem — **you cannot change partition count without rehashing keys**,
> so partition count is effectively permanent.

### Alternatives worth knowing

| Approach | Idea | Trade |
|---|---|---|
| **Rendezvous (HRW) hashing** | For each key, compute `hash(key, node)` for all nodes; pick the max | Simpler, no ring, no vnodes needed, perfect distribution. **O(N) per lookup** — great for small N. |
| **Jump consistent hash** (Google) | Clever O(ln N) function, no storage at all | Very fast and even. **Can only add/remove at the *end*** — no arbitrary node removal. |
| **Maglev hashing** (Google) | Lookup table with near-perfect distribution | Used in Google's LB; more complex to build |
| **Directory / lookup service** | Explicit key→node map in a metadata service | Total control, arbitrary rebalancing. **Needs a highly available directory** — that's the cost. |

**Rendezvous hashing is worth mentioning in interviews** — it's simpler than consistent hashing and strictly
better distributed for modest N. "I'd use consistent hashing, or rendezvous hashing if N is small since it
avoids the virtual-node machinery entirely" is a strong sentence.

---

## In your own words

**Why does `hash(key) % N` fail when N changes? Give the numbers for 3 → 4 nodes.**

>

**Why is that specifically catastrophic for a cache? Trace the failure through to the database.**

>

**Explain the ring in your own words, and why only ~1/N of keys move.**

>

**What two problems do virtual nodes solve? (One is distribution — what's the other?)**

>

**Why must replica placement walk to distinct *physical* nodes, not just the next ring entries?**

>

**Kafka uses `hash(key) % partitions`. What's the consequence, and how does that connect to this note?**

>

**When would rendezvous hashing be a better choice?**

>

---

## Links

- Load balancing algorithms → [03-load-balancing-algorithms.md](03-load-balancing-algorithms.md)
- **Implement and measure it** → [`../lab/`](../lab/) Part B
- Sharding, resharding, hot keys → Phase 3D
- Cache clusters, hash slots, avalanche → Phase 5
- Kafka partitioning → Phase 6
- Paper: Karger et al., *Consistent Hashing and Random Trees* (1997) · Amazon **Dynamo** paper
