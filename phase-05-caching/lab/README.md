# Phase 5 Lab — Cold Cache & Rate Limiters

> Roadmap: *"Build a read-through cache in front of Postgres. Load-test it, then delete all keys under load
> and watch the DB melt — that's a cold-cache outage. Fix it with request coalescing. Then implement a
> sliding-window rate limiter with a Redis sorted set, and a token bucket with Lua."*

**Time: ~2.5 hrs.**

```bash
cd phase-05-caching/lab
docker compose up -d --build
docker compose run --rm lab node part-a-cache/seed.js     # 10k products, 2M reviews

./part-a-cache/run.sh                                      # A — the outage and the fix
docker compose run --rm lab node part-b-rate-limiters/run.js   # B — three limiters
```

Postgres on **5437**, Redis on **6380**, app on **3005**.

> **A build gotcha:** the `lab` service sits behind a `tools` profile, so `docker compose up --build`
> **skips it**. If you add a dependency and get `Cannot find module`, run `docker compose build lab`.

---

# Part A — the cold-cache outage

## The setup, and why it's rigged this way

| Choice | Why |
|---|---|
| **Small Postgres** (`shared_buffers=64MB`, 20-connection pool) | The lab is about what happens when the cache stops protecting a database sized for ~5% of the read load |
| **`reviews.product_id` deliberately UNINDEXED** | Makes a cache **miss** genuinely expensive (~55 ms). If misses were cheap, there'd be nothing to demonstrate. |
| ⭐ **Zipfian keys** (80% of traffic on 10 hot keys) | Real traffic is skewed ([Phase 0 note 10](../../phase-00-foundations/notes/10-workload-shape.md)) — and that skew is *why caching works* |

## A1 · Warm cache — what "working" looks like

```
800 req/s for 25s
hits: 19,000+   hitRate: 0.83
http_req_duration: med=1.05ms  p(99)=~8ms   errors: 0
```

**The database is nearly idle.** ⭐ **This is the state your capacity planning is silently based on.**

## A2 · `FLUSHALL` under load, no coalescing ❌

```
>>> FLUSHALL at t=8s

http_req_duration: med=1.14ms  avg=277ms  p(90)=1.71s  p(95)=2s  p(99)=2.17s  max=2.85s
http_req_failed:   1.16%   (271 of 23,361)
app errors:        271
```

**271 requests failed. p95 went from ~7 ms to 2 seconds.**

> ⭐ **Nothing about the cache was broken. It was empty — which is its normal state after a restart.**
> Losing a **performance** component caused an **availability** failure. That's the framing to carry into
> interviews, and it's why "what happens when the cache dies?" is the question that separates answers.

**What actually broke:** every request missed at once → all of them queued for 20 database connections →
a 55 ms query at 800 req/s needs ~44 concurrent connections → pool exhaustion → 2-second connection
timeouts → errors.

## A3 · Same failure, with request coalescing ✅

```
http_req_duration: med=1.05ms  avg=116ms  p(95)=1.04s  p(99)=1.42s  max=1.63s
http_req_failed:   0.00%   (0 of 23,847)
app errors:        0
coalesced misses:  272
```

| | A2 (no coalescing) | A3 (coalescing) |
|---|---|---|
| **errors** | **271** | **0** |
| p99 | 2.17 s | 1.42 s |
| DB queries | 4,082 | 3,711 |

**Read the error count first — the outage is gone.**

### ⭐ But be honest about the numbers

**The database-query reduction is modest (4,082 → 3,711, ~9%), not dramatic.** Coalescing merges only
*concurrent* misses for the *same* key. The 10 hot keys coalesce heavily; the long-tail keys each miss once
and have nothing to merge with.

**So coalescing didn't "cut database load 10×". It removed the concentrated bursts on hot keys — which is
precisely what was exhausting the connection pool.** Being able to state that distinction is worth more than
a bigger number would have been.

### How the fix works

```js
const inFlight = new Map();
// first miss starts the query; every other concurrent miss for that key
// awaits THE SAME PROMISE
if (pending) return pending;
```

⚠️ **This is in-process.** With 50 app instances you get 50 queries per key, not one. Across a fleet you need
a **distributed lock** or **probabilistic early expiry**.

### What coalescing does NOT fix

10,000 *distinct* keys still means 10,000 queries. You also need:

- **TTL jitter** — so keys don't expire together (avalanche)
- **Probabilistic early expiry** — refresh just before expiry, in one request, coordination-free
- **Cache warming** — populate *before* taking traffic
- **Two-tier caching** — a local cache survives a Redis restart
- ⭐ **Capacity headroom** — or **decide deliberately** that losing the cache is an outage

---

# Part B — rate limiters

## B1 · Fixed window — the boundary problem ❌

Limit: **10 per 2-second window.**

```
end of window A:   10/10 allowed
start of window B: 10/10 allowed
-> 20 requests allowed in under a second
```

**Effectively 2× the configured limit**, and the client isn't cheating — that's just how a fixed window
works. Anyone who times traffic to the boundary gets double.

## B2 · Sliding window (sorted set) — exact ✅

```
first burst:  10/10 allowed
400ms later:   0/10 allowed
-> 10 total
```

The window **moves with the clock**, so earlier requests still count. No boundary to exploit.

**The cost: the ZSET held 10 members — one per request in the window.** At 10,000 req/s per key that's 10,000
members. **Exact and memory-hungry** is the trade.

```js
multi()
  .zremrangebyscore(k, 0, now - windowMs)   // evict expired
  .zcard(k)                                  // count what remains
  .zadd(k, now, uniqueMember)                // record this one
  .pexpire(k, windowMs * 2)
```

## B3 · Token bucket (Lua) — O(1) memory, tunable bursts ✅

rate = 5/s, capacity = 10:

```
immediate burst of 15: 10 allowed     (bucket capacity)
after waiting 1s:       5 allowed     (refilled ~5 tokens)
```

**Bursts allowed up to capacity, then the rate takes over** — usually exactly what you want.

> ⭐ **Why Lua is mandatory here.** Refill-then-consume is a **read-modify-write**. `MULTI`/`EXEC` can't do
> it, because all commands are queued *before* any execute — so you can't branch on a value you read. Two
> concurrent clients would both read "1 token left," both decrement, and you'd hand out two tokens for one.
> **The Lua script runs atomically on Redis's single thread**, so that race cannot happen.

## The comparison

| Algorithm | Accuracy | Memory/key | Bursts | Cost |
|---|---|---|---|---|
| Fixed window | ❌ 2× at edge | O(1) | At edges | 1 `INCR` |
| Sliding window log | ✅ Exact | **O(requests)** | None | ZSET ops |
| Sliding window counter | ~Approximate | O(1) | Smoothed | 2 counters |
| ⭐ **Token bucket** | ✅ Good | **O(1)** | ⭐ **Tunable** | 1 Lua call |
| Leaky bucket | ✅ Good | O(1) | None | Queue |

**Token bucket is the usual production answer.** Sliding window log when you need exactness and the key count
is small.

**And all of this is per Redis node** — distributed rate limiting across many limiter instances is a further
accuracy-vs-latency trade. → Phase 7.

---

## Things to try

| Try | How | Expect |
|---|---|---|
| **TTL jitter** | Set all keys with the same TTL, warm them together, wait | An avalanche you caused yourself |
| **Negative caching** | Request nonexistent IDs (`/api/product/999999`) under load | Cache penetration — every request reaches the DB |
| **Big key** | `redis-cli DEBUG POPULATE`, then `DEL` a huge key vs `UNLINK` | `DEL` blocks; `UNLINK` doesn't |
| **`KEYS` vs `SCAN`** | `redis-cli KEYS '*'` while the load test runs | Watch p99 spike |
| **Eviction** | Lower `maxmemory` to 8mb and re-run | Evictions climb; hit rate collapses |
| **Two-tier** | Add a 1-second in-process Map in front of Redis | Hot keys stop touching the network |

```bash
docker compose down -v
```
