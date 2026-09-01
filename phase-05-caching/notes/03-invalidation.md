# 05·03 · Invalidation

> **Why this exists:** *"There are only two hard things in Computer Science: cache invalidation and naming
> things"* (Phil Karlton). The roadmap wants you to **say exactly why** it's hard — which most people can't,
> beyond quoting the joke.

---

## Reference

### ⭐ Why it is actually hard — five specific reasons

**Not "because it's tricky." Because of these:**

**1 · You have to know *what* to invalidate.**
A user changes their display name. Which cache entries contain it? The profile, every comment they wrote,
every post they liked, the "top contributors" list, three search results, a rendered HTML fragment.
**Nothing tracks that dependency graph** — you have to know it, and keep knowing it as the code changes.

**2 · There is no atomic "write the DB and invalidate the cache."**
Two systems, no shared commit point — the dual-write problem
([3e-01](../../phase-03-databases/notes/3e-01-why-distributed-transactions-are-hard.md)). Either can fail
independently, and you cannot roll one back to match the other.

**3 · Races repopulate stale values.**
```
reader: cache MISS -> reads DB (gets OLD value) ────┐
writer: writes DB (NEW value)                       │
writer: deletes cache key                           │
reader: ────────────────────────────────────────────┴─> SETs the OLD value
```
**The cache is now stale until the TTL expires, and nothing is obviously wrong.**

**4 · You often can't reach the cache.** A browser cache, an ISP proxy, a mobile app's local store. **You
cannot purge something you don't control** — which is exactly why versioned URLs exist.

**5 · Distributed caches invalidate asynchronously.** Multiple Redis nodes, multiple CDN PoPs, multiple app
instances with local caches. **"Invalidated" is eventual**, and during propagation different users see
different data.

> **The compressed answer:** *"It's hard for three reasons: you have to know which derived entries depend on
> the thing that changed and nothing tracks that; there's no atomic operation spanning your database and your
> cache, so they can diverge; and a concurrent reader can repopulate the old value into the gap you just
> cleared. TTL is the backstop that makes all three survivable rather than permanent."*

### The strategies

| Strategy | How | Freshness | Complexity |
|---|---|---|---|
| ⭐ **TTL only** | Let it expire | Bounded staleness | **Trivial** |
| **Explicit purge on write** | `db.write()` then `cache.delete()` | Near-immediate | Low, racy |
| **Write-through** | Update both | Immediate | Dual-write risk ([02](02-caching-patterns.md)) |
| ⭐ **Versioned keys** | Never invalidate — change the key | Immediate, race-free | Needs a version source |
| ⭐ **Event-driven / CDC** | The DB's change log drives invalidation | Near-immediate | Infrastructure |
| **Tag/group invalidation** | Tag entries; purge a whole tag | Immediate | Needs tag support |

### TTL — the underrated default

**Most caching problems are solved by a short TTL and no invalidation at all.**

| Data | TTL |
|---|---|
| Immutable (versioned assets) | ⭐ **1 year** |
| Reference data (countries, plans) | Hours |
| User profile | Minutes |
| Product catalog | 1–5 min |
| Hot dynamic page | ⭐ **1–5 seconds** (micro-caching) |
| Search results | 30–60 s |
| Prices, inventory | Seconds, or don't cache |
| Anything with a correctness invariant | **Don't cache** |

**Always jitter** ([05](05-failure-modes.md)). And **always set a TTL even when you invalidate explicitly** —
it's your backstop for every missed invalidation, and there will be missed invalidations.

> **The senior framing:** *"I'd start with TTL-only and add explicit invalidation only where the staleness
> window is actually unacceptable. Every invalidation path is code that can be forgotten when someone adds a
> new write path — a TTL can't be forgotten."*

### ⭐ Versioned keys — sidestep the problem

**Don't invalidate. Make the key change.**

```
cache key:  product:123:v7
on update:  version becomes 8 -> readers use product:123:v8, which misses -> reloads
old key:    product:123:v7 is now garbage; TTL cleans it up
```

**Why it's excellent:**
- **No race** — you never delete anything, so nothing can repopulate a stale value
- **Atomic** — the version bump *is* the invalidation
- Old readers holding v7 see consistent (if slightly old) data rather than a torn mix
- **Same idea as versioned URLs in a CDN** ([Phase 2 note 08](../../phase-02-stateless-scaling/notes/08-cdn.md))

**Where the version comes from:** an `updated_at`/`version` column, a per-entity counter in Redis, or a
global epoch you bump to invalidate everything.

**Cost:** memory for orphaned old versions until TTL, and you need the version *before* you can build the
key — usually one extra lookup, often cached itself.

### ⭐ Event-driven invalidation via CDC — the clean answer

```
Postgres WAL -> Debezium -> Kafka -> invalidation consumer -> cache.delete(...)
```

| ✅ | ❌ |
|---|---|
| ⭐ **No dual write** — the DB's own log is the trigger, so it cannot diverge | Infrastructure to run |
| **Catches every write path** — including migrations, admin scripts, another service | Invalidation lags by the pipeline delay |
| Decoupled — the writer doesn't know a cache exists | |

**That second row is the strongest argument:** explicit invalidation only covers the write paths you
remembered. **CDC covers the ones you didn't** — the backfill script, the manual `UPDATE`, the other team's
service. That's why it's the architecturally clean answer, and it ties straight back to
[3c-03](../../phase-03-databases/notes/3c-03-replication-methods.md) and the outbox pattern.

### Key design

```
product:123                    simple
product:123:v7                 versioned
user:42:feed:page:1            hierarchical
search:q=laptop:cat=elec:p=2   composite -- normalise the parameters!
```

| Rule | Why |
|---|---|
| **Normalise before hashing** | `?b=2&a=1` and `?a=1&b=2` must produce the *same* key, or you fragment the cache |
| **Strip irrelevant params** | `utm_source` in the key = thousands of duplicate entries |
| **Namespace by entity type** | Makes bulk invalidation and debugging possible |
| ⚠️ **Include everything that changes the value** | Omitting the tenant or the user is how you **serve one user's data to another** |
| Include a schema version | So a deploy that changes the shape doesn't read stale structures |

> ⚠️ **The worst cache bug in this note: a key that's too broad serves private data to the wrong user.**
> If a response varies by user, permission, tenant or locale, **that must be in the key.** Same failure as
> a CDN cache-key bug ([Phase 2 note 08](../../phase-02-stateless-scaling/notes/08-cdn.md)), and far more
> dangerous than a stale value.

---

## In your own words

**Give three specific reasons invalidation is hard. Say it as you would out loud.**

>

**Draw the race where a reader repopulates a stale value. How long does it last?**

>

**Why is TTL-only underrated? Give the argument about forgotten code paths.**

>

**Explain versioned keys. Why is there no race?**

>

**Why does CDC-driven invalidation catch things explicit invalidation misses?**

>

**What's the most dangerous cache-key mistake, and what must always be in the key?**

>

---

## Links

- Patterns and the delete-vs-update rule → [02-caching-patterns.md](02-caching-patterns.md)
- TTL jitter and avalanche → [05-failure-modes.md](05-failure-modes.md)
- Versioned URLs at the CDN → [Phase 2 note 08](../../phase-02-stateless-scaling/notes/08-cdn.md)
- **CDC / logical replication** → [3c-03](../../phase-03-databases/notes/3c-03-replication-methods.md)
- Dual writes and the outbox → [3e-04](../../phase-03-databases/notes/3e-04-outbox-and-cdc.md)
