# 09·09 · Feed / Timeline Generation

> **Why this exists:** ⭐ **gate Q3** — *"explain hybrid fan-out and the exact threshold logic for celebrity
> accounts."* It's the single most-asked building block, and the celebrity case is the whole point of the
> question.

---

## Reference

### The two pure strategies

```
FAN-OUT ON WRITE (push)              FAN-OUT ON READ (pull)
post ──▶ write into every            post ──▶ one row
         follower's timeline
                                     read ──▶ query all N followees,
read ──▶ read your own list                   merge, sort
```

| | ⭐ **On write (push)** | ⭐ **On read (pull)** |
|---|---|---|
| Read cost | ⭐ **O(1) — one list lookup** | ⚠️ O(followees), a big merge |
| Write cost | ⚠️ **O(followers)** | ⭐ **O(1)** |
| Storage | ⚠️ duplicated per follower | minimal |
| Latency | ⭐ **excellent, and reads dominate** | ⚠️ poor at high followee counts |
| ⚠️ **Breaks on** | ⭐ **celebrities** — 100 M followers = 100 M writes for one post | ⭐ **users following thousands** |
| Deletes/edits | ⚠️ must touch every copy | ⭐ trivial |
| Backfill on follow | ⚠️ must inject history | ⭐ free |

⭐ **Push is the default because feeds are read-dominated** — a typical post is read hundreds of times and
written once. **You're moving work to the rarer operation.** (Same instinct as the autocomplete precompute
[07](07-autocomplete.md), and as CQRS [Phase 8](../../phase-08-architecture/notes/05-cqrs.md).)

### ⭐ Hybrid fan-out — the answer (gate Q3)

> ⭐ **Push for ordinary users. Pull for celebrities. Merge at read time.**

```
read timeline(user):
    A = precomputed pushed timeline        (from everyone normal they follow)
    B = live query for each CELEBRITY they follow   (few, and their posts are cached)
    return merge_by_rank(A, B)[:page_size]
```

⭐ **Why it works: the two failure modes are disjoint.** Push fails on high *follower* counts; pull fails on
high *followee* counts. **A user follows at most a handful of celebrities, and celebrities are a tiny
fraction of accounts** — so each strategy is used exactly where it's cheap.

### ⭐ The threshold logic — this is what's actually being marked

**A static "1 M followers" is a weak answer.** The real logic:

| Factor | |
|---|---|
| ⭐ **Follower count vs a threshold** | the baseline. ⚠️ **But not a global constant — derive it from your fan-out budget**: *"a post should not cost more than X writes"*, so threshold ≈ X |
| ⭐ **Posting FREQUENCY × follower count** | ⭐ **the real cost driver is `followers × posts_per_day`, not followers.** A 2 M-follower account that posts monthly is cheaper to push than a 200 k-follower account posting 50×/day |
| ⭐ **Follower ACTIVITY** | ⭐ **pushing to 100 M followers when 5 M are active this week is 95% wasted work.** Push to active followers, pull for dormant ones — **this is the single biggest real saving** |
| **Asymmetry** | someone with 10 M followers who follows 12 people is a broadcaster, not a participant |
| ⭐ **Hysteresis** | ⚠️ **two thresholds, not one** (e.g. promote at 500 k, demote at 300 k) — otherwise an account hovering at the boundary flip-flops between strategies and you get duplicate or missing posts |
| **Manual override** | ⭐ **you will need a flag.** Verified/major accounts get pinned to pull regardless of the number |

⭐ **And say the transition is not instant:** when an account crosses the threshold, older posts are already
pushed and new ones aren't. ⭐ **The read path must merge both for a while**, and the switch needs a
timestamp so you know which posts came from which era.

### Making push affordable

| | |
|---|---|
| ⭐ **Push ASYNCHRONOUSLY** | the poster's request returns immediately; fan-out is a queued job ([Phase 6](../../phase-06-messaging/notes/)) |
| ⭐ **Push only to ACTIVE followers** | inactive users' feeds are built on read when they return |
| ⭐ **Store IDs, not content** | a timeline is a list of post IDs; hydrate from cache at read time. ⚠️ Otherwise an edit means rewriting millions of copies |
| **Cap the timeline** | keep ~800 entries; older pages fall back to pull |
| ⭐ **Redis lists/sorted sets per user** | with a DB fallback for cold users |
| **Batch the writes** | one pipelined write per N followers |

### ⭐ Pagination over a changing list — the trap

⚠️ **Offset pagination is broken here by definition:** new posts arrive between page 1 and page 2, so items
shift down and **the user sees duplicates** (or misses items when things are deleted).

⭐ **Use a CURSOR — an opaque token encoding the position, not the offset:**

- ⭐ **`(score, id)` of the last item seen**, so the next page is *"everything ranked below this"*
- **`id`-only works if IDs are time-sortable** — ⭐ **which is exactly what Snowflake/UUIDv7 buys you** ([01](01-unique-ids.md))
- ⚠️ **With a RANKED (non-chronological) feed, even a cursor isn't enough** — scores change between pages.
  ⭐ **The real answer is to SNAPSHOT the ranked ID list per session** (cache it for a few minutes) and
  paginate over the frozen list. That's what "your feed didn't change while you scrolled" actually costs.

### Ranking, and what it breaks

Chronological is simple and back in fashion. Ranked (engagement, recency, affinity, diversity) is what most
products ship. ⚠️ **Ranking makes everything harder**: pagination stability (above), caching (⭐ *the feed is
now per-user, so there's less to share*), debuggability, and **"why am I seeing this?"** — which is now a
product and regulatory question.

### Say these unprompted

⭐ **The read/write ratio justifies push** · ⭐ **the celebrity problem, and hybrid as the fix** · ⭐ **the
threshold is a cost budget, not a magic number** · ⭐ **active-follower filtering** · ⭐ **hysteresis** ·
**store IDs not content** · ⭐ **cursor pagination, and why a ranked feed needs a snapshot**.

---

## In your own words

**⭐ Push vs pull: cost on each side, and which breaks on what.**

>

**⭐ Why is push the default?**

>

**⭐ Explain hybrid fan-out, and why the two strategies compose so cleanly.**

>

**⭐ Give the threshold logic — five factors, not one number.**

>

**⭐ Why is `followers × posts_per_day` the better cost driver?**

>

**⭐ What is active-follower filtering worth, and why?**

>

**⭐ Why do you need hysteresis, and what breaks without it?**

>

**What happens to already-pushed posts when an account crosses the threshold?**

>

**Name four things that make push affordable. Why store IDs rather than content?**

>

**⭐ Why does offset pagination break here? What does a ranked feed need beyond a cursor?**

>

---

## Links

- ⭐ **Gate Q3** → [`../GATE.md`](../GATE.md)
- Precompute-on-write, the same instinct → [07-autocomplete.md](07-autocomplete.md), [Phase 8 note 05](../../phase-08-architecture/notes/05-cqrs.md)
- Async fan-out jobs → [Phase 6](../../phase-06-messaging/notes/)
- Time-sortable IDs make cursors work → [01-unique-ids.md](01-unique-ids.md)
- Keyset vs offset pagination → [Phase 1](../../phase-01-networking/notes/)
- Redis lists/sorted sets → [Phase 5](../../phase-05-caching/notes/)
- Celebrity = hot key, again → [05-counters-at-scale.md](05-counters-at-scale.md)
- Delivering the result live → [11-websocket-infrastructure.md](11-websocket-infrastructure.md)
