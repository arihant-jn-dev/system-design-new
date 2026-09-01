# 11 · The Request Path — Synthesis

> **Why this exists:** gate Q1 is *"design the request path for a 10 M-user web app, naming every hop and
> what it owns."* This note is the assembly instructions, not the answer. The reference half lists the
> **available** components and what each legitimately owns; you build the path.

---

## Reference

### The component inventory

Every hop must justify its existence. For each one: **what does it own, and what does it cost?**

| # | Hop | Owns | Costs |
|---|---|---|---|
| 1 | **DNS** | Name → IP. Region selection via GeoDNS. | Cache-bound; **bad for failover** |
| 2 | **Anycast / Global LB** | Routing to the nearest healthy region | Needs BGP or a provider |
| 3 | **CDN / edge PoP** | **Static + cacheable content, TLS termination, DDoS absorption.** ~95% of requests can end here. | Cache-key bugs; purge complexity |
| 4 | **WAF / DDoS scrubbing** | L7 attack filtering, bot detection, IP reputation | Latency, false positives |
| 5 | **L4 load balancer** | Cheap, high-volume connection distribution; TCP health | Can't see requests |
| 6 | **L7 load balancer / reverse proxy** | Path/host routing, per-request LB, retries, compression | An extra hop; must terminate TLS |
| 7 | **API gateway** | AuthN, coarse authZ, rate limits **per consumer**, versioning, metering | Shared bottleneck if misused |
| 8 | **Service (stateless tier)** | **Business logic.** The only place it belongs. | — |
| 9 | **Service mesh sidecar** | mTLS, retries, timeouts, circuit breaking, tracing (east-west) | ~0.5–2 ms/hop, ops cost |
| 10 | **Cache (Redis)** | Hot reads, sessions, rate-limit counters | A new dependency in the hot path |
| 11 | **Database** | **System of record** | The usual bottleneck |
| 12 | **Read replicas** | Scale reads off the primary | Replication lag → stale reads |
| 13 | **Message queue / stream** | Async work off the request path | Eventual consistency |
| 14 | **Object storage + CDN** | Blobs; **never** through your app tier | — |
| 15 | **Search index** | Text/faceted queries | Not a system of record |

### Sizing it — do this before drawing

**10 M users.** Assume 10% DAU concurrency patterns and derive
([Phase 0 note 01](../../phase-00-foundations/notes/01-napkin-math.md)):

```
DAU               = 10 M × ~30% active daily     = 3 M
Requests/user/day = ~50 (page views + API calls)
Requests/day      = 150 M
Average QPS       = 150 M / 10^5                 = 1,500 QPS
Peak QPS (×3)                                    = 4,500 QPS
Read:write ~ 20:1 →  writes ≈ 225 QPS peak,  reads ≈ 4,275 QPS peak
```

**Then state the conclusion, because the numbers should change the design:**

> **4,500 peak QPS is not a large system.** With a CDN taking static content and a cache absorbing hot reads,
> the database sees maybe 200–500 QPS. **That is one Postgres instance with a read replica.** No sharding, no
> Kafka, no microservices required. The right answer here is boring, and saying so is the senior move.

**This is the most common trap in this question:** candidates hear "10 M users" and design for 10 M QPS.
Do the arithmetic and let it tell you how big the problem actually is.

### Write path vs read path — narrate both

The framework (Phase 11) says: *walk one write path and one read path end to end.* Narrating beats a static
diagram.

**Read path (the common case):**
```
Client → DNS → anycast → CDN PoP
   ├── cache HIT  → return (≈95% of requests END HERE)
   └── cache MISS → L7 LB → gateway (authn, rate limit) → service
                       ├── Redis HIT  → return
                       └── Redis MISS → read replica → populate cache → return
```

**Write path:**
```
Client → ... → gateway → service
   → validate + authorize
   → write to DB PRIMARY (never a replica)
   → invalidate / update cache
   → emit event to queue  ─────▶ async workers: search index, notifications,
                                  analytics, cache warming
   → return 201
```

**The details that score:**
- **Writes go to the primary; reads may go to replicas** — and then say the consequence: replication lag
  means a user may not see their own write. Fix: read-your-own-writes by routing that user's reads to the
  primary for a few seconds ([Phase 0 note 07](../../phase-00-foundations/notes/07-consistency-informal.md)).
- **Cache invalidation happens on the write path**, and it's the hard part (Phase 5).
- **Non-critical work goes async** — search indexing, emails, analytics. Never fail a checkout because the
  recommendation service is down.

### Where each concern lives — the ownership table

Being able to answer "where does X happen?" instantly is the actual skill:

| Concern | Where |
|---|---|
| TLS termination | CDN/edge (re-encrypt to origin if needed) |
| DDoS | CDN + WAF + L4 |
| **Authentication** | API gateway (validate once) |
| **Coarse authorization** | Gateway ("may this key call this API?") |
| **Fine-grained authorization** | **The service** ("may this user see *this* order?") |
| Rate limiting per consumer | Gateway |
| Rate limiting per backend | Service mesh / circuit breaker |
| Retries (north-south) | L7 LB / gateway — **at ONE layer** |
| Retries (east-west) | Service mesh |
| Caching (public) | CDN |
| Caching (private/hot) | Redis |
| **Business logic** | **The service. Only there.** |
| Session state | Redis, or a token |
| Static assets | Object storage + CDN — **never the app tier** |

### The failure-path questions to volunteer

Framework step 7 says volunteer this. For each hop: **what happens when it dies?**

| Component dies | Consequence | Mitigation |
|---|---|---|
| One app instance | Nothing — LB routes elsewhere | Health checks, N-1 capacity |
| One AZ | Lose 1/3 capacity | 3 AZs, N-1 provisioning |
| **CDN** | Full traffic hits origin, sized for 5% | Multi-CDN, origin autoscale, `stale-if-error` |
| **Cache (Redis)** | **All reads hit the DB** — the cold-cache outage | Replication, request coalescing, degraded mode |
| **DB primary** | Writes stop | Sync standby, automated failover, fencing |
| Read replica | Reads shift to primary | Multiple replicas, headroom |
| **Gateway** | Everything down | Multi-AZ, and it must be simple/stable |
| Queue | Async work backs up | It's a buffer — that's the point. Monitor lag, alert on DLQ. |
| **DNS provider** | **Total outage** | **Two DNS providers** |

> **The two answers most worth volunteering:** the **cold-cache outage** (cache dies → database sees traffic
> it was never sized for → the database dies → you can't refill the cache) and the **CDN outage** (origin
> sized for 5% of traffic suddenly gets 100%). Both are cases where losing a *performance* component causes a
> *availability* failure, which is the non-obvious part.

---

## In your own words — build the path

**Draw the full request path for a 10 M-user web app. For every hop, write what it owns and what it costs.**

> | # | Hop | Owns | Cost | Would I actually include it? |
> |---|---|---|---|---|
> |  |  |  |  |  |

**Do the capacity math first. What's your peak QPS, and what does that tell you about how big this really is?**

>

**Narrate the read path end to end, out loud. Write it here afterwards.**

>

**Narrate the write path. Where does the cache get invalidated, and what goes async?**

>

**Which hops would you DROP for a startup with 100 K users? Justify each removal.**

>

**For each component: what happens when it dies? Fill in the whole table from memory.**

>

**Which two failures turn a performance component into an availability outage?**

>

---

## Links

- Every component in detail → notes [01](01-stateless-vs-stateful.md)–[10](10-multi-az.md) of this phase
- Capacity math → [Phase 0 note 01](../../phase-00-foundations/notes/01-napkin-math.md)
- DNS, TLS, HTTP → [Phase 1](../../phase-01-networking/)
- The interview framework this feeds → Phase 11
