# 06·12 · Fan-Out Patterns — The News Feed Problem

> **Why this exists:** the roadmap is explicit — *"This **is** the news-feed question; learn it here so the
> design question becomes trivial."* Fan-out is also where a read-heavy *product* becomes a write-heavy
> *storage* problem, which is the Phase 0 lesson made concrete.

---

## Reference

### The problem

A user with **F followers** posts. How does it reach their feeds?

### The three strategies

**1 · Fan-out on WRITE (push) — precompute every timeline**

```
user posts ──▶ for each of F followers: INSERT into their timeline
read feed  ──▶ SELECT * FROM timeline WHERE user_id = ? ORDER BY ts LIMIT 20
```

| ✅ | ❌ |
|---|---|
| ⭐ **Reads are trivial** — one indexed query, cacheable | ⚠️ **1 M followers = 1 M writes for ONE post** |
| Read latency is flat and predictable | Wasted work for inactive users |
| Easy to cache | Slow propagation for huge followings |
| | Storage: a post is duplicated F times |

**2 · Fan-out on READ (pull) — compute at request time**

```
user posts ──▶ INSERT once
read feed  ──▶ fetch posts from all N followees, merge, sort, limit
```

| ✅ | ❌ |
|---|---|
| ⭐ **Writes are trivial** — one insert | ⚠️ **Reads are expensive**: N queries + merge + sort |
| No wasted work | Hard to cache (the feed changes constantly) |
| No duplication | Scatter-gather latency ([3d-06](../../phase-03-databases/notes/3d-06-cross-shard-operations.md)) |

**3 · ⭐ HYBRID — the actual answer**

```
normal users (< ~10k followers) ──▶ fan out on WRITE
celebrities (>= threshold)      ──▶ do NOT fan out
read feed = precomputed timeline  ⊕  live fetch of followed celebrities, merged
```

> ⭐ **The threshold logic is the gate-worthy detail.** You don't pick one strategy — you pick one **per
> user**, based on follower count. Most users get cheap reads via push; the handful of celebrities whose
> fan-out would be catastrophic are pulled at read time. **A read merges a precomputed list with a small
> number of celebrity fetches.**

### The economics — why hybrid wins

```
100 M users, avg 200 followers, 1% are "celebrities" with 1 M+ followers

PURE PUSH:
  normal:      1 post -> 200 writes                      fine
  celebrity:   1 post -> 1,000,000 writes                ⚠️ catastrophic
               and Justin Bieber posting = a write storm

PURE PULL:
  every feed load -> fetch from ~200 followees, merge    ⚠️ every read is expensive
  and feed loads outnumber posts ~100:1

HYBRID:
  99% of posts fan out cheaply (200 writes)
  1% of posts don't fan out at all
  a read = 1 timeline query + ~5 celebrity queries       ⭐ both sides cheap
```

**This is exactly [Phase 0 note 10](../../phase-00-foundations/notes/10-workload-shape.md)'s point:** the API
looks read-heavy, but fan-out-on-write makes the *storage layer* write-heavy. **The read:write ratio you
measure at the API is not the ratio your database sees.**

### The details interviewers probe

| Detail | Answer |
|---|---|
| **Where is the timeline stored?** | Redis sorted sets (score = timestamp) or a wide-column store keyed by `(user_id, ts)`. **Store post IDs, not post bodies** — hydrate from a cache on read. |
| **How long?** | Only the most recent few hundred entries. Older = fall back to pull. |
| **Inactive users?** | ⭐ Don't fan out to users inactive for N days — a large saving. Rebuild their feed on next login. |
| **New follow?** | Backfill their recent posts into your timeline, or just let it fill going forward |
| **Unfollow?** | Lazy removal at read time is usually cheaper than deleting from a timeline |
| **Deleted post?** | Filter at read time (a tombstone check) rather than deleting from F timelines |
| ⭐ **Ranking, not chronological?** | Fan-out gives you the *candidate set*; ranking is a separate scoring step at read time |
| ⭐ **Pagination over a changing list** | **Cursor on `(timestamp, post_id)`**, never offset ([Phase 1 note 08](../../phase-01-networking/notes/08-pagination.md)) — otherwise new posts shift the window and users see duplicates |
| **Fan-out failures?** | It's async via a queue; retries and a DLQ ([08](08-consumer-hygiene.md)). A partial fan-out means some followers are missing a post — reconcile or accept. |

**The "store IDs not bodies" point is worth stating** — duplicating a full post 1 M times is a storage
disaster; duplicating an 8-byte ID is not.

### How Kafka fits

```
post created ──▶ outbox ──▶ Kafka "posts" topic (key = author_id)
                                │
                                ├─▶ fan-out workers  (write to timelines)
                                ├─▶ search indexer
                                ├─▶ notification service
                                └─▶ analytics
```

⭐ **Fan-out must be async.** Doing 1,000 timeline writes inside the POST request is unacceptable — the user
waits, and a failure fails their post. Publish once, let workers fan out
([01](01-why-async.md), [09](09-outbox-and-cdc.md)).

**Consequence: the feed is eventually consistent.** A post may take a second or two to appear in followers'
feeds. ⚠️ **But the author must see their own post immediately** — read-your-own-writes
([3c-02](../../phase-03-databases/notes/3c-02-replication-lag.md)). **Usually solved by merging the author's
own recent posts client-side.**

### Fan-out beyond feeds

The same three-way choice recurs:

| Domain | Push | Pull | Hybrid |
|---|---|---|---|
| **Notifications** | Precompute per-user inbox | Query on open | By user activity |
| **Chat groups** | Write to each member's inbox | Read the conversation | ⭐ Small groups push, large groups pull |
| **Search index** | Index on write | Query source | Standard: push |
| **Cache warming** | Populate on write | Lazy on read | ([Phase 5 note 02](../../phase-05-caching/notes/02-caching-patterns.md)) |

**Note the chat row: it's the same threshold logic** — a 5-person group fans out; a 5,000-person channel
doesn't.

### The answer to give

> *"I'd use hybrid fan-out. For users below a follower threshold — call it 10,000 — I fan out on write into
> a per-user timeline in Redis sorted sets, storing post IDs rather than bodies and capping at a few hundred
> entries. Above that threshold I don't fan out at all; those posts are fetched at read time and merged with
> the precomputed timeline. That keeps writes bounded for celebrities and reads cheap for everyone else.
> Fan-out happens asynchronously off a Kafka topic fed by the outbox, so the post request returns
> immediately — and I'd merge the author's own posts client-side so they see their post instantly even
> before fan-out completes."*

---

## In your own words

**Describe all three strategies with their costs.**

>

**Do the economics: 1 M followers, pure push vs pure pull vs hybrid.**

>

**State the threshold logic precisely. What does a read actually do in the hybrid?**

>

**Why store post IDs rather than bodies?**

>

**Why must fan-out be async, and what consistency problem does that create for the author?**

>

**Why is cursor pagination mandatory over a feed?**

>

**Give the full answer out loud, timed. Under 90 seconds.**

>

---

## Links

- Workload shape and the fan-out reframing → [Phase 0 note 10](../../phase-00-foundations/notes/10-workload-shape.md)
- Async and the outbox → [01-why-async.md](01-why-async.md), [09-outbox-and-cdc.md](09-outbox-and-cdc.md)
- Cursor pagination → [Phase 1 note 08](../../phase-01-networking/notes/08-pagination.md)
- Hot keys / celebrities → [3d-03](../../phase-03-databases/notes/3d-03-shard-key-selection.md)
- Redis sorted sets → [Phase 5 note 08](../../phase-05-caching/notes/08-redis-beyond-caching.md)
- **Feed generation, ranking, notifications** → **Phase 9** · **Twitter/Instagram** → Phase 12 problems 9–10
