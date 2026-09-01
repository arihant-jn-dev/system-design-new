# 08 · CDN

> **Why this exists:** the CDN is usually the **single highest-leverage component** in a read-heavy design —
> it cuts latency, origin load and egress cost simultaneously. And from [Phase 0 note 11](../../phase-00-foundations/notes/11-cost-dimensions.md),
> at media scale it isn't an optimisation, it's the only affordable architecture.

---

## Reference

### What a CDN actually does

A geographically distributed set of caching servers (**PoPs** — points of presence) close to users.

| Benefit | Mechanism |
|---|---|
| **Latency** | 10 ms to a nearby PoP instead of 150 ms cross-continent. **Includes the TLS handshake**, which is the big one — you save 2–3 RTTs, not just one. |
| **Origin offload** | 95%+ of requests never reach you |
| **Egress cost** | CDN bandwidth is far cheaper than cloud egress, and often the difference between viable and not |
| **Availability** | Serves cached content even when your origin is down |
| **DDoS absorption** | Enormous distributed capacity soaks up volumetric attacks |

### Pull vs push

| | **Pull (origin-pull)** | **Push** |
|---|---|---|
| How | CDN fetches from origin **on the first miss**, then caches | You upload content to the CDN **in advance** |
| First request | **Slow** (cache miss → origin) | Fast — already there |
| Storage | Only what's requested | Everything you pushed, whether requested or not |
| Ops | **Trivial — just point it at your origin** | You manage distribution and invalidation |
| Best for | **Almost everything.** Long-tail content, dynamic sites. | Large files with a known launch spike (game patches, video releases, a viral drop) |

**Pull is the default.** Reach for push when you *know* a spike is coming and can't afford the origin
thundering herd on first request. (Or use **pre-warming**: a pull CDN with a job that requests key objects at
each PoP before launch — the pragmatic middle ground.)

### Cache keys — where the bugs live

The **cache key** determines whether two requests share a cached response. Default is usually the URL. What
you add to it is a design decision with real consequences:

| Include in key | Effect |
|---|---|
| Query string | `?page=2` cached separately. But **`?utm_source=twitter` fragments your cache into thousands of identical copies** — strip marketing params. |
| `Accept-Encoding` | Separate gzip/brotli/identity variants. Necessary. |
| Device type / `User-Agent` | ⚠️ **Never key on raw `User-Agent`** — near-infinite cardinality, ~0% hit rate. Normalise to `mobile`/`desktop`. |
| Cookies | ⚠️ Keying on all cookies usually means **caching nothing** — every user has a unique session cookie |
| Geo / language | Per-country or per-language variants |
| Auth header | Effectively "don't cache" |

> **The two classic cache-key bugs:**
> 1. **Key too broad** → you serve **user A's private data to user B**. The worst bug in this note. Happens
>    when a personalised response is cached without the session in the key.
> 2. **Key too narrow** → hit rate collapses to near zero and every request goes to origin. Usually caused by
>    query strings or `User-Agent`.
>
> **Rule: `Cache-Control: private` on anything user-specific, and be deliberate about the key. Vary carefully.**

### TTL and freshness

| Header | Meaning |
|---|---|
| `Cache-Control: max-age=3600` | Browser caches 1 hour |
| `Cache-Control: s-maxage=86400` | **CDN** caches 24 h (overrides max-age for shared caches) |
| `Cache-Control: public / private` | `private` = browser only, **never a CDN** |
| `Cache-Control: no-cache` | Must revalidate before use (**not** "don't store") |
| `Cache-Control: no-store` | Genuinely don't cache. For sensitive data. |
| `stale-while-revalidate=60` | **Serve stale immediately, refresh in the background.** Excellent — latency of a hit with reasonable freshness. |
| `stale-if-error=86400` | **Serve stale if the origin is down.** Free availability. |
| `ETag` / `If-None-Match` | Revalidation → `304 Not Modified`, saves bandwidth but still costs a round trip |

> **`stale-while-revalidate` + `stale-if-error` are the two most underused headers in web performance.**
> Together they give you cache-hit latency *and* origin-outage survival. Mention them.

**The versioned-URL pattern — the real answer to invalidation:**

```
/static/app.a3f9c2b1.js      ← content hash in the filename
Cache-Control: max-age=31536000, immutable
```

Cache for a year. **To "invalidate", change the URL.** No purge, no propagation delay, no race conditions.
This is how every modern build pipeline works and it sidesteps the hard problem entirely.

### Invalidation / purge

| Method | Speed | Notes |
|---|---|---|
| **TTL expiry** | Passive | Simplest; you tolerate staleness |
| **Purge by URL** | Seconds–minutes | Exact but tedious at scale |
| **Purge by tag/surrogate key** | Seconds | **Tag objects (`product-123`), purge the tag.** The good answer for dynamic content. |
| **Purge everything** | Minutes | ⚠️ **Dangerous** — every request goes to origin at once. A self-inflicted thundering herd that can take down your origin. |
| **Versioned URLs** | Instant | Best. No purge needed. |

> **"Purge all" as an outage cause** is a great detail: you flush the CDN, 100% of traffic hits an origin
> sized for 5% of traffic, and you're down. Same shape as the cold-cache failure in Phase 0's lab.

### Origin shielding

**The problem:** you have 200 PoPs. On a cache miss, **each** may independently fetch from origin. One popular
uncached object = 200 simultaneous origin requests. On a purge, far worse.

**Origin shield: designate one mid-tier PoP that all others fetch through.**

```
200 edge PoPs  →  1 shield PoP  →  origin
```

Origin sees **one** request instead of 200. Combined with **request coalescing** (collapsing concurrent
identical misses into a single origin fetch), this is what keeps origins alive.

> **Consistent hashing (note 04) is how PoPs decide which shield/peer holds an object** — the two ideas
> connect directly.

### Static vs dynamic at the edge

| Content | Cacheable? | Approach |
|---|---|---|
| Images, CSS, JS, fonts, video | ✅ Perfectly | Versioned URLs, long TTL |
| Public API responses (product catalog) | ✅ Often | Short TTL + `stale-while-revalidate` |
| Personalised pages | ➖ Partly | **Edge-side includes / streaming**: cache the shell, fill personalised holes |
| User-specific API responses | ❌ | `private`, `no-store` |
| **Dynamic but identical for everyone** | ✅ **Yes — and this is missed constantly** | Homepage, search results for common terms, trending lists. Even a **5-second TTL** on a hot endpoint removes ~99% of load. |

> **"Micro-caching" is a strong thing to propose:** a 1–5 second TTL on a hot dynamic endpoint feels like no
> caching at all from a freshness standpoint, but at 10 K QPS it collapses origin load to ~1 request/sec.
> Enormous win, almost no staleness cost.

### Edge compute

Running code at the PoP (Cloudflare Workers, Lambda@Edge, Fastly Compute).

**Good uses:** A/B test assignment, auth token validation, request routing/rewriting, personalisation of a
cached shell, bot filtering, redirects, geo-based logic.

**Bad uses:** anything needing your database (you're 150 ms from it — you've moved the compute away from the
data), heavy computation, anything stateful.

**The rule: edge compute is for decisions that need *the request* and not *your data*.**

### Signed URLs / tokens

For content that must be cached at the edge but access-controlled:

```
https://cdn.example.com/video/123.m3u8?Expires=1735689600&Signature=abc123&Key-Pair-Id=K2X
```

The CDN validates the signature itself — **no call back to your origin**. Used for paid video, private
downloads, user uploads.

Parameters worth setting: short expiry, IP restriction (careful with mobile), and **the signature must not be
part of the cache key**, or every user creates a separate cache entry.

> That last point is a genuinely good detail — signing that accidentally fragments the cache defeats the
> purpose of the CDN.

---

## In your own words

**Name four distinct benefits of a CDN. Which is usually the largest at media scale?**

>

**Pull vs push — which is the default, and when do you actually need push?**

>

**Describe the two classic cache-key bugs. Which is the dangerous one?**

>

**What do `stale-while-revalidate` and `stale-if-error` each buy you?**

>

**Why are versioned URLs better than purging? What problem do they sidestep entirely?**

>

**Explain origin shielding. What problem does it solve, and how does it connect to consistent hashing?**

>

**What is micro-caching, and why is a 5-second TTL on a hot endpoint such a big win? Do the math.**

>

**When is edge compute the wrong tool?**

>

---

## Links

- Egress cost, the reason CDNs are mandatory at scale → [Phase 0 note 11](../../phase-00-foundations/notes/11-cost-dimensions.md)
- TLS handshake savings at the edge → [Phase 1 note 04](../../phase-01-networking/notes/04-tls.md)
- Consistent hashing for PoP/shield selection → [04-consistent-hashing.md](04-consistent-hashing.md)
- Cache patterns, invalidation, stampedes, TTL jitter → **Phase 5**
- Media pipelines, HLS/DASH, signed URLs → Phase 9
