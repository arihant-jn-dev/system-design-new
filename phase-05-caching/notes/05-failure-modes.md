# 05·05 · Cache Failure Modes

> **Why this exists:** gate Q2 — *"name five cache failure modes and their mitigations **without
> hesitating**."* These have names, and using the names is the whole signal. This is the highest-value note
> in Phase 5.

---

## Reference

## The six, by name

| # | Failure | One-line cause |
|---|---|---|
| 1 | **Cache stampede** (thundering herd, dog-piling) | Many concurrent requests miss the **same** key at once |
| 2 | **Cache avalanche** | Many **different** keys expire simultaneously |
| 3 | **Hot key** | One key gets so much traffic it saturates a single node |
| 4 | **Cache penetration** | Requests for keys that **don't exist**, so nothing is ever cached |
| 5 | **Big keys** | One enormous value blocks a single-threaded Redis |
| 6 | **Cold cache** | Cache restarts empty; the database gets traffic it was never sized for |

---

### 1 · Cache stampede

```
key expires -> 500 concurrent requests all miss -> 500 identical DB queries
```

The database gets N× the load for one key's worth of data. **You measured this**: it's what produced
**271 errors and a 2 s p95** in the lab.

| Mitigation | How | Note |
|---|---|---|
| ⭐ **Request coalescing** (singleflight) | First miss queries; the rest **await the same promise** | ⚠️ **In-process only** — 50 instances = 50 queries per key. You measured this too. |
| **Distributed lock** | One holder refreshes; others wait or serve stale | Adds a lock's failure modes ([09](09-redlock.md)) |
| ⭐ **Probabilistic early expiry** | Refresh *before* expiry with probability rising as TTL approaches. One request refreshes while everyone else still gets a hit. | **No lock, no coordination.** The elegant answer. |
| **Serve stale while revalidating** | Return the old value, refresh in the background | Same as `stale-while-revalidate` ([Phase 2 note 08](../../phase-02-stateless-scaling/notes/08-cdn.md)) |
| **Never expire hot keys** | Refresh them proactively on a schedule | Needs a job |

**XFetch / probabilistic early expiry, concretely:**
```
refresh if:  now - delta * beta * ln(rand())  >=  expiry
```
Each reader independently decides to refresh a little early, with probability growing as expiry nears —
so **one** reader typically refreshes while the rest still hit.

---

### 2 · Cache avalanche

**Many keys expire at the same moment** — because you warmed them together, or deployed with a uniform TTL,
or the cache restarted.

```
❌ SET key value EX 3600            all keys written at deploy time expire together
✅ SET key value EX (3600 + rand(0, 600))
```

| Mitigation | |
|---|---|
| ⭐ **TTL jitter** | Add ±10–20% randomness. **One line of code; prevents a class of outage.** |
| Staggered warming | Don't populate everything in one loop |
| Tiered TTLs | Different key types expire at different times |

**Jitter here is the same idea as retry jitter** ([Phase 1 note 11](../../phase-01-networking/notes/11-timeouts-retries-backoff.md))
and Raft's randomised election timeouts ([Phase 4 note 06](../../phase-04-distributed-systems/notes/06-raft.md)):
**anything that would otherwise make N clients act in unison needs randomisation.**

---

### 3 · Hot key

One key — a celebrity, a viral product, a homepage — takes so much traffic that **the single node holding it
saturates**, while the rest of the cluster is idle.

**Consistent hashing cannot help**: one key hashes to one node, by definition
([Phase 2 note 04](../../phase-02-stateless-scaling/notes/04-consistent-hashing.md)).

| Mitigation | How |
|---|---|
| ⭐ **Local (near) cache** | Cache the hot key **in the app process**, TTL 1–5 s. Removes the network hop entirely. **The most effective fix.** |
| **Key replication** | Store as `key:0…key:9`, read a random one | Writes must update all copies |
| **Client-side caching** | Redis 6 tracking — server invalidates the client's local copy |
| **Read replicas** | Replicate the hot shard |
| **Detect them** | Count-min sketch, `redis-cli --hotkeys` (Phase 9) |

**The two-tier answer is the one to give:** a small local cache with a very short TTL absorbs the hot keys,
and Redis handles the long tail. You accept a few seconds of staleness on exactly the keys where staleness
matters least.

---

### 4 · Cache penetration

**Requests for keys that don't exist.** Every one misses (nothing to cache), so every one reaches the
database. Often malicious — probing random IDs is a cheap way to bypass your cache entirely.

| Mitigation | How | Cost |
|---|---|---|
| ⭐ **Negative caching** | Cache the *absence*: `SET key "NULL" EX 60`. **Shorter TTL** than positive entries. | Memory for junk keys; a brief window where a newly-created key looks missing |
| ⭐ **Bloom filter** | "Is this ID definitely NOT in the database?" **No false negatives**, ~1% false positives → rejects nearly all junk before touching the DB | Can't delete from a plain bloom filter (use counting/cuckoo) |
| Input validation | Reject malformed IDs before any lookup | Only catches obvious junk |
| Rate limit per client | Bound the damage | |

**Bloom filters are the textbook answer here** and you'll implement one in Phase 9. The mechanism —
k hash functions setting k bits; any bit 0 ⇒ definitely absent — is the same one that keeps LSM reads viable
([3a-02](../../phase-03-databases/notes/3a-02-lsm-tree.md)).

---

### 5 · Big keys

**Redis is single-threaded** ([06](06-redis-internals.md)). A 100 MB value, or a hash with a million fields,
means one command **blocks every other client**.

| Problem | |
|---|---|
| `GET` on a huge string | Blocks the event loop for the duration |
| `HGETALL` / `LRANGE 0 -1` on a huge collection | Same, plus a large network transfer |
| ⚠️ **`DEL` on a big key** | **Freeing memory is O(n) and blocking.** Use **`UNLINK`** — it frees asynchronously. |
| Cluster imbalance | One key can't be split, so one shard holds far more |
| Migration stalls | Moving a big key blocks a slot migration |

**Mitigations:** cap value size (≤ ~10 KB is a good rule) · split large hashes across keys · use `HSCAN`
rather than `HGETALL` · **`UNLINK` instead of `DEL`** · compress large payloads · store big blobs in S3 and
cache only the URL.

> **`UNLINK` vs `DEL` is a small, sharp detail worth remembering** — deleting a big key is one of the easiest
> ways to accidentally stall a production Redis.

---

### 6 · Cold cache ⭐

**The outage nobody plans for.** The cache restarts, fails over, is flushed, or a new instance starts with an
empty local cache. Every request misses at once.

**You measured it: 271 errors and a p95 of 2 s, with nothing broken except an empty cache.**

> ⭐ **This is the shape to internalise: losing a PERFORMANCE component caused an AVAILABILITY failure.**
> Your database's capacity plan was silently based on a 95% hit rate that no longer holds.

| Mitigation | |
|---|---|
| ⭐ **Cache warming before taking traffic** | Populate, *then* add to the load balancer. Slow start ([Phase 2 note 06](../../phase-02-stateless-scaling/notes/06-lb-operations-and-types.md)). |
| **Persistence** (RDB/AOF) | A Redis restart can reload its dataset instead of starting empty ([07](07-redis-persistence-and-ha.md)) |
| **Replicas + failover** | Promote a warm replica rather than restarting cold |
| **Request coalescing + early expiry** | Bound the burst |
| ⭐ **Capacity headroom** | Size the DB for a plausible cache-loss scenario — **or decide deliberately that losing the cache is an outage** |
| **Load shedding** | Fail fast rather than queueing (Phase 7) |
| **Two-tier caching** | A local cache survives a Redis restart |

**The honest engineering position:** *"Full cache loss under peak load will take us down. Either we
provision for it, or we accept it — but that's a decision I want made explicitly rather than discovered
during an incident."*

---

## The gate answer

**Five, fast, with mitigations:**

1. **Stampede** — many requests miss the same key → **request coalescing**, probabilistic early expiry, serve stale
2. **Avalanche** — many keys expire together → **TTL jitter**
3. **Hot key** — one key saturates one node → **local/near cache**, key replication
4. **Penetration** — queries for keys that don't exist → **negative caching, bloom filter**
5. **Cold cache** — empty after restart → **warming, persistence, headroom** — and note it's an *availability* failure caused by losing a *performance* component
6. *(bonus)* **Big keys** — block single-threaded Redis → cap sizes, `UNLINK` not `DEL`

---

## In your own words

**Name all six from memory, with one mitigation each. Time yourself — under 60 seconds.**

>

**Stampede vs avalanche — what's the difference in one sentence?**

>

**Why is in-process request coalescing insufficient across a fleet? What do you add?**

>

**Explain probabilistic early expiry and why it needs no coordination.**

>

**Why can't consistent hashing fix a hot key? What actually does?**

>

**Why is `DEL` on a big key dangerous, and what do you use instead?**

>

**State the cold-cache framing: what kind of component failed, and what kind of failure resulted?**

>

---

## Links

- ⭐ **You measured stampede and cold cache** → [`../lab/`](../lab/) Part A
- Redis single-threading → [06-redis-internals.md](06-redis-internals.md)
- Persistence for warm restarts → [07-redis-persistence-and-ha.md](07-redis-persistence-and-ha.md)
- Jitter as a general principle → [Phase 1 note 11](../../phase-01-networking/notes/11-timeouts-retries-backoff.md)
- Bloom filters, hot-key detection, count-min sketch → **Phase 9**
- Load shedding → Phase 7
