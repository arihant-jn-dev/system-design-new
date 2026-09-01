# 05·08 · Redis Beyond Caching

> **Why this exists:** Redis's data structures make it a **toolkit**, not just a cache. Several Phase 9
> building blocks are three lines of Redis — and knowing which is the difference between designing a
> component and inventing one.

---

## Reference

## 1 · Rate limiters ⭐ *(you built these)*

| Algorithm | Redis | Accuracy | Memory | Bursts |
|---|---|---|---|---|
| **Fixed window** | `INCR` + `EXPIRE` | ❌ **2× at the boundary** | O(1) | At edges |
| **Sliding window log** | **ZSET** of timestamps | ✅ Exact | O(requests) | None |
| **Sliding window counter** | 2 counters, weighted | ~Approximate | O(1) | Smoothed |
| ⭐ **Token bucket** | **Lua** (hash + refill) | ✅ Good | O(1) | ⭐ **Tunable** |
| **Leaky bucket** | List/ZSET as a queue | ✅ Good | O(1) | None — smooths output |

**Your measurements:** fixed window let **20 through a 10-per-window limit** by straddling the boundary;
sliding window held at exactly 10; token bucket allowed a burst of 10 then refilled at 5/s.

> ⭐ **Token bucket is the usual production answer** — O(1) memory, one round trip, and burst behaviour you
> can tune. A user clicking 10 things quickly is normal; sustaining 10/s forever is not, and only token
> bucket expresses that distinction naturally.

Full treatment (distributed accuracy, where to enforce, client contract) → **Phase 7**.

## 2 · Leaderboards — the canonical ZSET use

```
ZADD leaderboard 1500 "player:42"
ZREVRANK leaderboard "player:42"        -> rank, O(log N)
ZREVRANGE leaderboard 0 9 WITHSCORES    -> top 10
ZINCRBY leaderboard 50 "player:42"      -> atomic score update
```

**O(log N) rank on millions of players.** Doing this in SQL means `COUNT(*) WHERE score > x` per query, or a
denormalised rank column you must maintain. **This is the clearest case where the right data structure
collapses a hard problem.**

**Scaling:** shard by region/time bucket; keep only the top N and a separate per-player score. → Phase 9.

## 3 · Session store

```
SET session:<id> <json> EX 1800        # sliding expiry: re-SET on each request
```
Fast, TTL built in, **instantly revocable** (unlike a JWT —
[Phase 2 note 02](../../phase-02-stateless-scaling/notes/02-session-management.md)).

⚠️ **Redis is now in your auth path.** If it's down, nobody logs in. Replicate it, and decide what degraded
mode looks like.

## 4 · Distributed lock

```
SET lock:resource <unique-token> NX EX 30      # atomic acquire-if-absent
# release MUST verify ownership -- via Lua, or you delete someone else's lock:
if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end
```

⚠️ **The unique token is mandatory.** A plain `DEL` can delete a lock acquired by *someone else* after yours
expired. And this still lacks a **fencing token**
([Phase 4 note 08](../../phase-04-distributed-systems/notes/08-coordination-services-and-fencing.md)) —
which is the whole of [09-redlock](09-redlock.md).

## 5 · Queues — and why a real broker is usually better

```
LPUSH queue job          /  BRPOP queue 0        # blocking pop
ZADD delayed <run_at> job                        # delayed jobs via ZSET score
XADD stream * field val  /  XREADGROUP ...       # Streams: consumer groups + acks
```

| ✅ Redis queues | ❌ vs a real broker |
|---|---|
| Trivial to set up | ⚠️ **`BRPOP` loses the job if the worker dies mid-processing** (Streams fix this with acks) |
| Very fast | No replay, weak retention |
| Delayed jobs via ZSET are elegant | **Async replication → jobs can be lost on failover** |
| Streams are genuinely decent | No partitions/ordering guarantees at Kafka's level, weaker tooling |

> **The honest position:** *"Redis Lists are fine for best-effort background work where losing a job is
> survivable. The moment jobs represent money or must not be lost, I'd use SQS or Kafka — Redis's
> asynchronous replication means a failover can lose acknowledged jobs. Redis **Streams** narrow the gap
> considerably with consumer groups and acks, and are a reasonable middle ground."* → Phase 6.

## 6 · Counters at scale

```
INCR page:123:views                     # atomic, no race
HINCRBY stats:2024-01-01 views 1        # grouped counters
PFADD unique:2024-01-01 user:42         # ⭐ HyperLogLog: distinct count in 12 KB
SETBIT active:2024-01-01 42 1           # 1M users x 1 bit = 125 KB/day
```

**Write-behind pattern** ([02](02-caching-patterns.md)): increment in Redis, flush aggregates to the database
periodically. **100,000 increments become one database write** — and you accept losing the last few seconds
on a crash.

## 7 · Pub/Sub and the WebSocket backplane

```
SUBSCRIBE channel:updates   /   PUBLISH channel:updates "..."
```

⚠️ **Redis pub/sub is fire-and-forget: no persistence, no replay, no delivery guarantee.** A subscriber that
is disconnected for 2 seconds **misses those messages permanently.**

**Its main legitimate use: the cross-node backplane for a WebSocket tier**
([Phase 1 note 07](../../phase-01-networking/notes/07-realtime-push-patterns.md)) — node 3 receives a message
for a user connected to node 7, so it publishes and node 7 delivers. **For anything that must not be lost,
use Streams.** → Phase 9.

## 8 · Other patterns worth naming

| Pattern | How |
|---|---|
| **Idempotency / dedupe store** | `SET processed:<id> 1 NX EX 86400` — `NX` returning nil means "already done" ([3e-06](../../phase-03-databases/notes/3e-06-exactly-once.md)) |
| **Geospatial** | `GEOADD`/`GEOSEARCH` — proximity in one command |
| **Autocomplete** | Sorted set with lexicographic ranges (`ZRANGEBYLEX`) |
| **Feature flags / config** | Hash + pub/sub for instant propagation |
| **Rolling metrics** | ZSET or bitmap per time bucket |

---

## ⚠️ When Redis is the wrong tool

| Temptation | Better |
|---|---|
| Primary datastore | A real database — async replication loses writes |
| Durable message queue | SQS / Kafka |
| Complex queries, joins, aggregations | Postgres |
| Large blobs | S3 |
| Data much bigger than RAM | Disk-based store |
| Strong consistency / distributed locks for **correctness** | etcd/ZooKeeper ([09](09-redlock.md)) |

> **The failure mode to avoid: Redis becomes load-bearing without anyone deciding it should.** It starts as a
> cache, gains sessions, then rate limits, then a job queue — and now an incident takes down authentication
> and background processing too. **Know what breaks when Redis dies**, and make sure that list was chosen
> rather than accumulated.

---

## In your own words

**Which rate-limiting algorithm would you ship, and why? Cite your own measurements.**

>

**Why is a leaderboard trivial in Redis and awkward in SQL?**

>

**Why must a Redis lock release use Lua and a unique token? What breaks otherwise?**

>

**When are Redis lists an acceptable queue, and when aren't they? What do Streams change?**

>

**What guarantee does Redis pub/sub NOT provide, and what's its legitimate use?**

>

**List everything that breaks if Redis dies in a system you know. Was that list chosen or accumulated?**

>

---

## Links

- Data structures → [06-redis-internals.md](06-redis-internals.md)
- ⭐ **You built the rate limiters** → [`../lab/`](../lab/) Part B
- **Redlock** → [09-redlock.md](09-redlock.md)
- Sessions vs tokens → [Phase 2 note 02](../../phase-02-stateless-scaling/notes/02-session-management.md)
- Rate limiting in depth → **Phase 7**
- Leaderboards, geo, autocomplete, HLL, WebSocket backplane → **Phase 9**
- Queues vs real brokers → **Phase 6**
