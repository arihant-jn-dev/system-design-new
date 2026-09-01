# 05·10 · Cache Topology & Memcached vs Redis

> **Why this exists:** how you *distribute* a cache determines what happens when a node is added or lost —
> and that's the consistent-hashing lesson you already measured, applied to its original use case.

---

## Reference

### Distributing keys across cache nodes

**The naive `hash(key) % N` is catastrophic when N changes.** From
[Phase 2's lab](../../phase-02-stateless-scaling/lab/): going 3 → 4 nodes moved **75.1%** of keys.

> ⭐ **For a cache, that number *is* an outage.** 75% of keys miss simultaneously → the database gets traffic
> sized for a 5% miss rate → the cold-cache failure ([05](05-failure-modes.md)).
> **Adding a cache node takes down your database** — which creates the perverse incentive that teams stop
> scaling their cache.

**Consistent hashing** moves ~1/N instead — you measured **25.0%**, exactly the theoretical minimum
([Phase 2 note 04](../../phase-02-stateless-scaling/notes/04-consistent-hashing.md)).

| Approach | Keys moved (3→4) | Used by |
|---|---|---|
| `hash % N` | **75%** | Naive clients |
| **Consistent hashing + vnodes** | **25%** | Memcached clients, most cache libraries |
| **Fixed slots** (16,384) | Only the moved slots | ⭐ **Redis Cluster** — the logical-partitions idea ([3d-02](../../phase-03-databases/notes/3d-02-partitioning-strategies.md)) |
| Rendezvous (HRW) | ~1/N, no vnodes needed | Simpler for small N |

### Client-side vs server-side sharding

| | **Client-side** (Memcached) | **Server-side** (Redis Cluster) |
|---|---|---|
| Who routes | The client library hashes | Server redirects (`MOVED`/`ASK`) |
| Server complexity | ⭐ **None — servers don't know about each other** | Cluster bus, gossip, failover |
| Client complexity | Must implement consistent hashing | Must understand redirects |
| Adding a node | Update client config everywhere | Cluster handles it |
| Failure | Client routes around it | Automatic failover to a replica |

**Memcached's "the servers know nothing about each other" is a genuine architectural virtue** — there is no
cluster state to go wrong, no split brain, no failover bug. All the complexity is in the client, where it is
easier to reason about.

### Two-tier (near) caching — recap

```
request -> LOCAL (in-process, 1-5s TTL) -> REDIS (60s) -> database
```

Covered in [01](01-cache-hierarchy.md). The reason it belongs here too: **it is the answer to hot keys**
([05](05-failure-modes.md)), because no amount of hashing can split a single key.

**Invalidating the local tier:** short TTLs (usually enough) · Redis pub/sub invalidation channel ·
**Redis client-side caching** (`CLIENT TRACKING`, Redis 6+) where the server tells clients when a key they
cached has changed.

### Replication for read scaling

| Topology | Use |
|---|---|
| **Primary + replicas** | Read scaling; ⚠️ replicas lag, so reads can be stale |
| **Sharded** (Cluster) | Memory and write scaling |
| **Sharded + replicated** | Both. The production shape. |
| **Multiple independent caches per AZ** | ⭐ Avoids cross-AZ latency **and cross-AZ data-transfer cost** ([Phase 0 note 11](../../phase-00-foundations/notes/11-cost-dimensions.md)); each AZ warms independently |

---

## Memcached vs Redis

| | **Memcached** | **Redis** |
|---|---|---|
| Data types | **Strings only** | Strings, hashes, lists, sets, **ZSETs**, HLL, streams, geo |
| Threading | ⭐ **Multi-threaded** — scales with cores | Single-threaded (threaded I/O in 6+) |
| Persistence | ❌ None | RDB / AOF |
| Replication | ❌ None | ✅ Built in |
| Clustering | Client-side only | Cluster mode |
| Eviction | LRU | Configurable |
| Memory efficiency | ⭐ **Slab allocator; lower overhead for simple KV** | More per-key overhead |
| Scripting / atomicity | ❌ | ⭐ **Lua** |
| Pub/Sub, Streams | ❌ | ✅ |

### When Memcached still wins

**Rare, but real — and saying so shows judgement:**

- **Pure, simple KV caching at very high throughput** — multi-threading means one Memcached box can beat one
  Redis box on a many-core machine
- **Large memory with simple values** — the slab allocator is more memory-efficient
- **You want the cache to be *dumb*** — no persistence, no failover, no cluster state, nothing to go wrong.
  A cache that can only be a cache cannot accidentally become load-bearing.
- **Facebook famously runs Memcached at enormous scale** — see *Scaling Memcache at Facebook*, which the
  roadmap flags as unusually practical reading

**Otherwise Redis**, because the data structures are worth more than the throughput difference for almost
everyone.

> **The answer to give:** *"I'd default to Redis — the data structures let one system serve caching, rate
> limiting, sessions and leaderboards. I'd choose Memcached if the workload were pure high-throughput KV
> caching on a many-core box, where its multi-threading and lower per-key overhead genuinely win. And there's
> a subtler argument for Memcached: it can't be anything but a cache, so it never quietly becomes a
> load-bearing datastore."*

### The Facebook lessons worth citing

From *Scaling Memcache at Facebook* — concrete, and unusually candid:

| Lesson | |
|---|---|
| **Leases** | A token issued on a miss to prevent stampedes **and** stale sets — a neat combination of coalescing and the repopulation race ([03](03-invalidation.md)) |
| **Gutter pool** | Idle spare servers absorb the load of a failed cache node, so its keys don't all hit the DB |
| **Regional pools** | Cold data in a shared pool, hot data replicated per cluster |
| **Cold cluster warmup** | A new cluster reads through to a warm one instead of the database |
| **Batching + parallel fetch** | Careful request-window management to cut round trips |

**"Cold cluster warmup" is the direct answer to the cold-cache problem you measured**, and worth naming.

---

## In your own words

**Why is `hash % N` specifically catastrophic for a cache? Cite your own measurement and trace the outage.**

>

**Client-side vs server-side sharding — what's the architectural virtue of Memcached's approach?**

>

**Why can't any hashing scheme fix a hot key? What does?**

>

**When would you genuinely choose Memcached? Give the subtle argument as well as the performance one.**

>

**What is a "gutter pool" and which failure does it address?**

>

---

## Links

- ⭐ **Consistent hashing, measured** → [Phase 2 note 04](../../phase-02-stateless-scaling/notes/04-consistent-hashing.md) and its [lab](../../phase-02-stateless-scaling/lab/)
- Hot keys, cold cache → [05-failure-modes.md](05-failure-modes.md)
- Redis Cluster hash slots → [07-redis-persistence-and-ha.md](07-redis-persistence-and-ha.md)
- Logical partitions → [3d-02](../../phase-03-databases/notes/3d-02-partitioning-strategies.md)
- **Paper: *Scaling Memcache at Facebook* (NSDI 2013)**
