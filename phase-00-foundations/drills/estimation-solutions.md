# Estimation Drills — Worked Solutions

**Don't read these until you've committed to an answer on paper.**

Score on **order of magnitude**. Within 2–3× is a pass. The arithmetic is not the point — the final
"so the hard part is…" sentence is the point.

Constants used throughout: `1 day ≈ 10^5 s` · `1 year ≈ 400 days` · `peak ≈ 3× average` · `replication ×3`

---

## 1 · Twitter-scale feed

```
Writes/day      = 100 M × 5              = 500 M/day
Write QPS avg   = 500 M ÷ 10^5           = 5,000 QPS
Write QPS peak  = 5,000 × 3              = 15,000 QPS

Read QPS avg    = 5,000 × 100            = 500,000 QPS
Read QPS peak                            = 1.5 M QPS

Storage/day     = 500 M × 1 KB           = 500 GB/day
Storage/year    = 500 GB × 400           = 200 TB/year
With ×3 repl                             = 600 TB/year

Read BW peak    = 1.5 M × 1 KB           = 1.5 GB/s = 12 Gbps
```

> **The hard part is reads, not writes.** 15 K write QPS is one well-provisioned Postgres. 1.5 M read QPS
> and 12 Gbps is a caching, fan-out and CDN problem. **Do not spend the interview designing the write path.**

---

## 2 · URL shortener

```
Write QPS avg   = 100 M ÷ 10^5           = 1,000 QPS
Write QPS peak                           = 3,000 QPS
Read QPS avg    = 1,000 × 100            = 100,000 QPS
Read QPS peak                            = 300,000 QPS

Storage/day     = 100 M × 500 B          = 50 GB/day
Storage/year    = 50 GB × 400            = 20 TB/year
Over 5 years                             = 100 TB
With ×3 repl                             = 300 TB
```

**Short code length** — total URLs over 5 years:
```
100 M/day × 365 × 5 ≈ 1.8 × 10^11  (round to 2 × 10^11)

base62:  62^6 = 5.7 × 10^10   ✗ not enough
         62^7 = 3.5 × 10^12   ✓ comfortable headroom

→ 7 characters
```

> **The hard part is a 300 K QPS read of immutable, point-lookup data.** That's the easiest possible shape
> to cache — the entire hot set fits in memory and nothing is ever updated. KV store + aggressive cache +
> CDN on the redirect. 100 TB is large but boring; it shards cleanly on the short code.

---

## 3 · Chat / WhatsApp

```
Messages/day    = 500 M × 40             = 20 B/day
QPS avg         = 20 B ÷ 10^5            = 200,000 QPS
QPS peak                                 = 600,000 QPS

Storage/day     = 20 B × 200 B           = 4 TB/day
30 days                                  = 120 TB
With ×3 repl                             = 360 TB

Concurrent conns = 500 M × 10%           = 50 M simultaneous connections
Nodes @ 100 K conns/node                 = 500 nodes minimum (realistically 1,000+ with headroom)
```

> **The hard part is 50 million persistent connections, not 600 K QPS.** 600 K QPS is a sharding problem
> with known answers. 50 M live WebSocket connections means: connection routing (which node holds this
> user?), a pub/sub backplane for cross-node delivery, presence, heartbeats, and reconnect-with-replay.
> The fleet exists to *hold connections*, and it's sized by memory and file descriptors, not by CPU.

**Common mistake:** sizing this like a request/response API. Connection count is the dimension.

---

## 4 · Photo sharing

```
Uploads/day     = 500 M × 2              = 1 B/day
Upload QPS avg  = 1 B ÷ 10^5             = 10,000 QPS
Upload QPS peak                          = 30,000 QPS

Per photo stored = 3 MB + 2 MB           = 5 MB
Storage/day     = 1 B × 5 MB             = 5 PB/day        ← stop and look at this
Storage/year    = 5 PB × 400             = 2 EB/year
With ×3 repl                             = 6 EB/year

Views/day       = 1 B × 50               = 50 B/day
View QPS peak   = 500 K × 3              = 1.5 M QPS
View BW peak    (assume 300 KB variant served, not the 3 MB original)
                = 1.5 M × 300 KB         = 450 GB/s = 3.6 Tbps
```

> **The hard part is that the estimate just told you the assumptions are wrong.** 6 exabytes/year is not a
> number you engineer around — it's a number that forces you to change the product: don't keep originals
> forever (tier to cold storage after 30 days, or drop them), use erasure coding (~1.4×) instead of 3×
> replication, and dedupe identical uploads. **Egress dominates cost** — 3.6 Tbps at list price is
> financially impossible, which is why a CDN isn't an optimisation here, it's the architecture.

**This is the most valuable habit in the whole drill set:** when a number comes out absurd, the estimate
has done its job. Say so out loud and revise the assumption — don't quietly design for 6 EB.

---

## 5 · Video platform

```
Storage/day     = 1 M × 1 GB             = 1 PB/day
Storage/year    = 1 PB × 400             = 400 PB/year
(use erasure coding ~1.4× not ×3 for media → ~560 PB/year)

Watch bits/day  = 100 M hrs × 3600 s × 3 Mbps
                = 1.08 × 10^18 bits/day  = 135 PB/day
Average egress  = 1.08 × 10^18 ÷ 86,400  = 12.5 Tbps average
Peak egress     ≈ 30 Tbps

Monthly egress  = 135 PB × 30            = 4,050 PB = 4.05 × 10^9 GB
Cost @ $0.085   = 4.05 × 10^9 × 0.085    ≈ $344 M/month  (~$4 B/year)
```

> **The hard part is bandwidth economics, not engineering.** $4 B/year in egress at list price is why
> Netflix built Open Connect and physically ships caching appliances into ISP datacentres, and why YouTube
> peers directly. **The estimate proves the architecture:** you cannot buy this bandwidth, so you must move
> the bytes closer to users and negotiate/peer rather than pay per GB. Transcode cost is second (a
> 10-minute video × 5 renditions × 1 M/day is a very large batch pipeline).

---

## 6 · Ride-hailing location pings

```
Ping QPS        = 5 M ÷ 4 s              = 1.25 M QPS
Ingest BW       = 1.25 M × 100 B         = 125 MB/s = 1 Gbps

IF you retain every ping:
Pings/day       = 1.25 M × 86,400        = 1.08 × 10^11/day
Storage/day     = 1.08 × 10^11 × 100 B   = ~11 TB/day
Per year, ×3                             = ~12 PB/year
```

**Should you retain every ping? No.** Split it by what the data is *for*:

| Purpose | What you actually store | Size |
|---|---|---|
| "Where is this driver **now**?" | One overwritten record per driver, in memory | 5 M × 100 B = **500 MB — fits on one box** |
| Trip replay / disputes / billing | Downsampled polyline per *completed trip* (1 point/30 s, compressed) | ~100× smaller |
| Analytics / heatmaps | Pre-aggregated into grid cells, raw dropped | negligible |

> **The hard part is realising this is a 1.25 M QPS *overwrite* workload, not an append workload.** The hot
> dataset is 500 MB, not 11 TB/day — a four-orders-of-magnitude difference that comes entirely from the
> access pattern (note 10: mutability). 1.25 M QPS of overwrites into a partitioned in-memory geo index is
> very doable. Naively logging every ping is what makes this problem look impossible.

---

## 7 · Ad click aggregator

```
Impression QPS avg = 10 B ÷ 10^5         = 100,000 QPS
Impression QPS peak                      = 300,000 QPS

Clicks/day      = 10 B × 0.5%            = 50 M/day
Click QPS avg   = 50 M ÷ 10^5            = 500 QPS
Click QPS peak                           = 1,500 QPS

Storage/day     = (10 B × 500 B) + (50 M × 1 KB)
                = 5 TB + 0.05 TB         ≈ 5 TB/day
Storage/year    = 5 TB × 400             = 2 PB/year  (×3 = 6 PB)
```

> **The hard part is correctness, not volume.** 300 K QPS of appends is exactly what Kafka is for — that
> part is solved. What's hard: (a) **this data bills advertisers**, so double-counting is revenue fraud and
> under-counting is lost revenue — you need idempotent producers and a dedupe store, not "at-least-once and
> hope"; (b) joining clicks to impressions when the click arrives minutes later, i.e. **late-arriving events
> and windowing**; (c) the 1-minute freshness rules out batch — you need stream aggregation into a real-time
> OLAP store (Druid/ClickHouse/Pinot) with a slower batch job reconciling the exact numbers behind it.

*(This is a Tier-2 practice problem — #17. Note how much of it you can already frame from Phase 0.)*

---

## 8 · Ad serving latency budget

**Network accounting** (assume user→edge RTT ≈ 20 ms):

```
User → edge RTT                          =  20 ms
Edge → auction service (same DC)         =   1 ms
Auction → bidders (5 in parallel)        =  60 ms   ← the max, not the sum
                                            ------
Network total                            ≈  81 ms
Budget                                   = 100 ms
Left for ALL compute                     ≈  19 ms
```

**Now the fan-out effect (note 04).** You wait for the slowest of 5. If each bidder is slow 1% of the time:
```
P(at least one slow) = 1 − 0.99^5 = 4.9%
```
So ~5% of auctions blow the budget entirely — and that's with *perfectly healthy* bidders.

> **The design change: stop waiting for all of them.** Real RTB sets a hard bidder timeout (~60–70 ms) and
> runs the auction with whoever replied — a non-responding bidder simply loses. That converts a tail-latency
> problem into a *revenue* problem (you lose that bidder's demand), which is the correct trade. Secondarily:
> the Singapore bidders consume 60 of your 100 ms — either colocate them, or exclude them from
> latency-sensitive geographies.

> **The hard part is that the speed of light already spent 80% of your budget.** No amount of code
> optimisation recovers a 60 ms RTT. This is a *placement* problem, and the answer is graceful degradation
> (partial results) rather than more capacity.

---

## 9 · Cache sizing

```
Total dataset   = 500 M × 2 KB           = 1 TB
Hot 20%         = 100 M × 2 KB           = 200 GB
+ overhead ~1.5× (keys, pointers, metadata)
RAM needed                               ≈ 300 GB

Nodes @ 64 GB   = 300 ÷ 64               = 5 nodes → 6 for headroom
+ 1 replica each                         = 12 nodes

Expected hit rate (hot 20% serves 80% of traffic) ≈ 80%
Misses to DB    = 50 K × 20%             = 10,000 QPS
```

> **The hard part is that an 80% hit rate is not the win it sounds like.** 10 K QPS still hitting the
> database may be more than it can take — so the cache "working" hasn't solved the problem.
>
> **Marginal hit rate is what matters:**
> | Hit rate | DB QPS | RAM |
> |---|---|---|
> | 80% | 10,000 | 300 GB |
> | 95% | 2,500 | ~900 GB |
> | 99% | 500 | ~1.5 TB (the whole dataset) |
>
> Going 80% → 95% costs 3× the RAM and buys a **4× reduction in database load**. That's usually an easy
> yes — RAM is cheaper than a database tier. And note the endgame: at this dataset size you can simply
> **cache everything** (1 TB), which removes cache misses as a failure mode entirely.
>
> Also state the failure behaviour: if the cache dies, **50 K QPS hits a database sized for 10 K.** That's
> the cold-cache outage — it's the follow-up question, so volunteer it. (Phase 5.)

---

## 10 · Metrics system cardinality

```
Series          = 10,000 × 500           = 5 M distinct time series
Points/sec      = 5 M ÷ 15 s             = 333,000 points/sec

Points in 15 d  = 333 K × 86,400 × 15    = 4.3 × 10^11 points
Storage         = 4.3 × 10^11 × 16 B     ≈ 7 TB
```

**Now add a `user_id` label with 1 M values.** Cardinality is **multiplicative**, and that's the whole lesson:

| Case | New series | Points/sec | 15-day storage |
|---|---|---|---|
| Before | 5 M | 333 K/s | 7 TB |
| Label added to a *global* metric | 5 M + 1 M = 6 M | 400 K/s | ~8 TB (survivable) |
| Label added to a *per-server* metric | 10,000 × 1 M = **10 B series** | **667 M/s** | **~14 PB** |

That's **2,000× the entire existing system, from one line of code.**

> **The hard part is cardinality, and it's the defining constraint of every metrics system.** Series count —
> not data volume — is what kills these systems: each series needs an index entry and in-memory state, so
> memory grows with *cardinality*, not with points ingested. This is why you never put unbounded-cardinality
> labels (`user_id`, `request_id`, `email`, `session_id`, raw URLs with IDs) on a metric. **That data belongs
> in logs or traces**, which are indexed differently and can be sampled.
>
> The practical defences: cardinality limits enforced at ingest, per-team quotas, and alerting on series
> growth rate — because by the time storage is full, the incident is hours old.

---

## After all ten

You should now be able to do the **30-second version** cold:

> "DAU → actions/day → divide by 10^5 for QPS → ×3 for peak → × bytes for storage → ×400 for a year →
> ×3 for replication. **And the hard part is ___.**"

If the last clause doesn't come out automatically, do five more. The arithmetic is not the skill —
**knowing what the number means** is the skill.
