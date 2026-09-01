# 05·02 · Caching Patterns

> **Why this exists:** five patterns, each with different **consistency** and **failure** characteristics.
> The roadmap is explicit about wanting both, because "we use a cache" tells an interviewer nothing until you
> say *which pattern* and *what happens when it fails*.

---

## Reference

## The five patterns

### 1 · Cache-aside (lazy loading) ⭐ — the default

**The application manages the cache. The cache doesn't know the database exists.**

```
READ:   value = cache.get(key)
        if miss:
            value = db.query(key)
            cache.set(key, value, ttl)
        return value

WRITE:  db.write(key, value)
        cache.delete(key)        ⭐ DELETE, not update -- see below
```

| ✅ | ❌ |
|---|---|
| Only requested data is cached | **Every miss pays the full DB latency** |
| **Cache failure is survivable** — you just query the DB | Stale data between write and invalidation |
| Cache and DB models can differ | Cache logic duplicated at every call site |
| Simple, explicit, debuggable | ⚠️ **Stampede on a miss** ([05](05-failure-modes.md)) |

> ⭐ **On write, DELETE the key rather than updating it.** Two concurrent writers that both *update* the
> cache can leave it holding the older value (the interleaving is: read A, read B, write B to DB, write A to
> DB… cache ends up inconsistent). Deleting means the next reader re-reads the truth. **"Invalidate, don't
> update" is the rule**, and being able to say why is a good signal.

### 2 · Read-through

**The cache sits inline. The application only ever talks to the cache; the cache loads from the DB on a
miss.**

```
app -> cache.get(key)  ->  [cache loads from DB itself on miss]  -> value
```

| ✅ | ❌ |
|---|---|
| Application code is simpler — one call | Needs cache-provider support or a wrapper library |
| **Loading logic lives in one place** | Cache and DB models must match |
| Natural place to add coalescing | First request still slow |

**In practice most "read-through" implementations are cache-aside wrapped in a function** — which is exactly
what the lab's `getProduct()` is. The distinction matters less than the failure behaviour.

### 3 · Write-through

**Write to cache and database synchronously, as one operation.**

```
WRITE:  cache.set(key, value)  AND  db.write(key, value)     -> then ack
```

| ✅ | ❌ |
|---|---|
| **Cache is never stale** | **Every write pays both latencies** |
| Read after write always hits | Caches data that may never be read |
| | ⚠️ **Two systems, no atomicity** — the dual-write problem ([3e-01](../../phase-03-databases/notes/3e-01-why-distributed-transactions-are-hard.md)) |

> ⚠️ **Write-through has a hidden distributed-transaction problem:** if the DB write succeeds and the cache
> write fails (or vice versa), they diverge. There's no shared commit point. Cache-aside's *delete* is safer
> precisely because a failed delete degrades to "stale until TTL" rather than "wrong forever."

### 4 · Write-behind (write-back)

**Write to the cache; flush to the database asynchronously, in batches.**

| ✅ | ❌ |
|---|---|
| **Very fast writes** | ⚠️ **DATA LOSS if the cache dies before flushing** |
| **Batches and coalesces** — 100 increments become 1 write | Complex |
| Absorbs write spikes | DB is temporarily behind |

**Use when:** high-volume, loss-tolerant writes — view counts, analytics, "last seen at", non-critical
metrics.
**Never use for:** anything you can't lose. **This is the only pattern that can lose acknowledged writes.**

### 5 · Refresh-ahead

**Proactively refresh entries that are about to expire and are being actively read.**

| ✅ | ❌ |
|---|---|
| Hot keys never expire from a user's perspective | Wasted refreshes for keys nobody wanted |
| **Prevents stampedes on hot keys** | Needs prediction/heuristics |

**Probabilistic early expiry** ([05](05-failure-modes.md)) is the elegant, coordination-free version.

---

## The comparison

| Pattern | Read latency | Write latency | Staleness | If the cache dies |
|---|---|---|---|---|
| **Cache-aside** | Fast on hit | DB only | Until invalidation/TTL | ✅ **Degrades to DB-only** |
| **Read-through** | Fast on hit | DB only | Same | ✅ Degrades |
| **Write-through** | Fast | **Slow (both)** | ✅ **None** | ✅ Degrades |
| **Write-behind** | Fast | **Fastest** | DB is behind | ❌ **DATA LOSS** |
| **Refresh-ahead** | **Always fast on hot keys** | — | Minimal | ✅ Degrades |

> **The question that separates the patterns is "what happens when the cache dies?"** Four of them degrade to
> "slower." One loses data. Say that.

## Combining them — what real systems do

**Cache-aside for reads + explicit invalidation on writes** is the overwhelmingly common default. Then add:

- **Write-through** for a small set of keys that must never be stale
- **Write-behind** for counters and metrics
- **Refresh-ahead / early expiry** for the hot set
- **Two-tier** local + Redis for the hottest keys ([01](01-cache-hierarchy.md))

### The consistency detail worth knowing: delete-before or delete-after?

```
❌ cache.delete(key); db.write(...)
     a concurrent reader can re-populate the cache with the OLD value in the
     gap, and it stays stale until TTL

✅ db.write(...); cache.delete(key)
     much smaller window, but still not zero
```

**Neither is airtight** — there is no atomic "write DB and invalidate cache." The robust options:

| Approach | |
|---|---|
| ⭐ **Delete after the DB write** + a short TTL as a backstop | The pragmatic default |
| **Delayed double delete** | Delete, write, wait, delete again — closes the repopulation race |
| ⭐ **CDC-driven invalidation** | The DB's own change log invalidates the cache ([03](03-invalidation.md)). **Correct by construction** — no dual write. |
| Versioned keys | Never invalidate; write to a new key ([03](03-invalidation.md)) |

**CDC invalidation is the architecturally clean answer**, and it connects straight back to
[3c-03](../../phase-03-databases/notes/3c-03-replication-methods.md) and the outbox pattern.

---

## In your own words

**Write out cache-aside's read and write paths from memory.**

>

**Why DELETE rather than UPDATE on write? Describe the interleaving that breaks the update version.**

>

**Which pattern can lose acknowledged writes? When is that acceptable?**

>

**Why does write-through have a distributed-transaction problem, and why is cache-aside's delete safer?**

>

**Delete before or after the DB write? Why is neither airtight, and what's the clean fix?**

>

**For each pattern: what happens when the cache dies entirely?**

>

---

## Links

- Where each layer sits → [01-cache-hierarchy.md](01-cache-hierarchy.md)
- **Invalidation in depth** → [03-invalidation.md](03-invalidation.md)
- Stampede, early expiry → [05-failure-modes.md](05-failure-modes.md)
- Dual-write problem, CDC, outbox → [3e-04](../../phase-03-databases/notes/3e-04-outbox-and-cdc.md)
- ⭐ **You built read-through with coalescing** → [`../lab/`](../lab/) Part A
