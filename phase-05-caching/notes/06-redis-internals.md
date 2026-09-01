# 05·06 · Redis Internals

> **Why this exists:** the roadmap wants Redis's data structures **and what each unlocks in a design** —
> because "use Redis" is a non-answer, while "a sorted set gives me a sliding-window rate limiter in two
> commands" is a design.

---

## Reference

### The single-threaded model — the fact everything follows from

**Redis executes commands one at a time, on one thread.**

| Consequence | |
|---|---|
| ⭐ **Every command is atomic** | No locks needed. `INCR` cannot race. This is why Redis is a good coordination primitive. |
| ⭐ **One slow command blocks everyone** | `KEYS *`, `HGETALL` on a huge hash, `DEL` on a big key ([05](05-failure-modes.md)) |
| **~100 K–1 M ops/sec ceiling per node** | It's one CPU core. Scale by **sharding**, not bigger machines. |
| No race conditions in your logic | But **check-then-act across two round trips still races** → use Lua |

*(Redis 6+ has threaded **I/O** — network read/write is parallel — but **command execution is still
single-threaded.** The distinction matters and is a good detail.)*

### Data structures — and what each unlocks ⭐

| Structure | Key commands | **What it unlocks in a design** |
|---|---|---|
| **String** | `GET/SET/INCR/SETNX` | Cache, counters, **distributed lock** (`SET k v NX EX`) |
| **Hash** | `HGET/HSET/HINCRBY` | Objects with field-level updates — cheaper than get-modify-set of JSON |
| **List** | `LPUSH/BRPOP` | Simple queues, recent-items, **`BRPOP` = blocking pop** |
| ⭐ **Sorted set (ZSET)** | `ZADD/ZRANGE/ZREMRANGEBYSCORE/ZRANK` | **Leaderboards · sliding-window rate limiter · delayed jobs · time-ordered feeds · priority queue** |
| **Set** | `SADD/SISMEMBER/SINTER` | Unique visitors, tags, friend intersection |
| **HyperLogLog** | `PFADD/PFCOUNT` | ⭐ **Distinct counts in ~12 KB, 0.81% error.** "Unique visitors" without storing visitors. |
| **Bitmap** | `SETBIT/BITCOUNT` | Per-user daily activity: 1 M users × 1 bit = **125 KB/day** |
| **Stream** | `XADD/XREADGROUP` | Append-only log **with consumer groups** — a lightweight Kafka |
| **Geo** | `GEOADD/GEOSEARCH` | Radius queries (a ZSET with geohash scores underneath) |

> ⭐ **Sorted sets are the single most reusable structure.** Leaderboard, rate limiter, delayed-job queue and
> time-ordered feed are all `ZADD` + `ZRANGEBYSCORE`. **You built the rate limiter in the lab.** If you
> remember one Redis thing, remember what ZSETs enable.

**HyperLogLog is the other one worth naming:** counting 500 M distinct visitors exactly needs gigabytes;
HLL does it in **12 KB** with ~0.81% error. When the question is "how many unique X," that trade is almost
always correct. → Phase 9.

### Expiry — how it actually works

**Two mechanisms, and neither is a timer:**

| Mechanism | How |
|---|---|
| **Lazy** | On access, if expired → delete and report a miss |
| **Active** | 10×/sec, sample 20 random keys with TTLs; delete the expired ones; **if >25% were expired, repeat immediately** |

> ⭐ **Consequence: an expired key can occupy memory long after it expired**, if nothing reads it and the
> sampler hasn't picked it. **Redis's reported memory usage includes logically-expired keys.** This surprises
> people debugging memory, and it's a good detail to have.

### ⚠️ `KEYS` vs `SCAN`

```
❌ KEYS user:*     O(N) over the ENTIRE keyspace, single-threaded, BLOCKS EVERYTHING
✅ SCAN 0 MATCH user:* COUNT 100    cursor-based, incremental, non-blocking
```

**`KEYS` in production is a self-inflicted outage.** On 10 M keys it can block for seconds — during which
every other client waits. Same for `FLUSHALL` (use `FLUSHALL ASYNC`), `SMEMBERS`/`HGETALL` on huge
collections (use `SSCAN`/`HSCAN`).

**`SCAN` caveat:** it guarantees every key present throughout the iteration is returned **at least once**,
but may return duplicates and may miss keys added mid-scan. It's a weak guarantee — and the right one.

### Pipelining — the throughput lever

```
without: 1000 commands = 1000 round trips = 1000 x RTT
with:    1000 commands = 1 round trip
```

**On a 0.5 ms RTT, that's 500 ms → ~1 ms.** Pipelining doesn't reduce Redis's work; it removes the
**network round trips**, which is where the time actually goes.

| Related | |
|---|---|
| **`MULTI`/`EXEC`** | Transactions — queued and executed atomically. ⚠️ **No rollback**; a failed command doesn't abort the rest. |
| **`WATCH`** | Optimistic locking — abort if a key changed. Redis's compare-and-set. |
| ⭐ **Lua (`EVAL`)** | **Atomic read-modify-write.** The whole script runs as one command. |

### ⭐ Why Lua matters

**`MULTI`/`EXEC` cannot make a decision based on a value it read** — all commands are queued *before* any
execute. So this is impossible in a transaction:

```
read tokens -> if tokens >= 1 then decrement
```

**That's a check-then-act race** ([3b-05](../../phase-03-databases/notes/3b-05-idempotency-at-the-db-layer.md)):
two clients both read "1 token left," both decrement, and you handed out two tokens for one.

**Lua fixes it** because the script runs atomically on the single thread — **you built exactly this as the
token-bucket limiter in the lab.**

⚠️ **Keep scripts short.** A long Lua script blocks the entire server — the single-threaded rule applies to
scripts too.

### Memory internals worth knowing

| Fact | |
|---|---|
| **Per-key overhead ~50–100 bytes** | For tiny values, overhead can exceed the data |
| **Small collections are optimised** | `listpack`/`ziplist` encodings below a size threshold — far denser. `OBJECT ENCODING key` shows which. |
| `MEMORY USAGE key` | Truth about one key's cost |
| **Fragmentation** | `mem_fragmentation_ratio` > 1.5 means real waste; `activedefrag` helps |
| **Copy-on-write during persistence** | A fork for RDB/AOF-rewrite can **double** memory under heavy writes ([07](07-redis-persistence-and-ha.md)) |

**That last one causes real incidents:** Redis forks to snapshot, the parent keeps writing, pages get copied,
and memory spikes toward 2×. **Provision for it, or the OOM killer arrives mid-snapshot.**

---

## In your own words

**What follows from Redis being single-threaded? Give one benefit and one danger.**

>

**Name four things sorted sets unlock.**

>

**Why does HyperLogLog matter? Give the size and error numbers.**

>

**Explain the two expiry mechanisms. What surprising consequence follows?**

>

**Why is `KEYS *` dangerous in production, and what's the correct alternative plus its weaker guarantee?**

>

**Why can't `MULTI/EXEC` implement a token bucket? What can, and why?**

>

**Why can memory double during persistence?**

>

---

## Links

- Big keys, hot keys → [05-failure-modes.md](05-failure-modes.md)
- Persistence, Sentinel, Cluster → [07-redis-persistence-and-ha.md](07-redis-persistence-and-ha.md)
- What to build with these → [08-redis-beyond-caching.md](08-redis-beyond-caching.md)
- ⭐ **You wrote the Lua token bucket** → [`../lab/`](../lab/) Part B
- HyperLogLog, bloom filters, count-min sketch → **Phase 9**
