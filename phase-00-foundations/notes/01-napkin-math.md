# 01 · Napkin Math (Back-of-the-Envelope Estimation)

> **Why this exists:** in an interview you get ~3 minutes to turn "100 M users" into numbers you then *use*
> for the rest of the round. An estimate you never reference again was theatre. The numbers are what let you
> say "that's 12 K QPS, so a single Postgres is fine" instead of reflexively drawing a Kafka cluster.

---

## Reference

### Powers of two — the only trick you need

**2^10 ≈ 10^3.** Everything follows from that one approximation.

| Power | Exact | Approx | Name |
|---|---|---|---|
| 2^10 | 1,024 | 10^3 | thousand — KB |
| 2^20 | 1,048,576 | 10^6 | million — MB |
| 2^30 | ~1.07×10^9 | 10^9 | billion — GB |
| 2^40 | ~1.10×10^12 | 10^12 | trillion — TB |
| 2^50 | ~1.13×10^15 | 10^15 | quadrillion — PB |

So: **2^32 ≈ 4 billion** (IPv4 space, int32 overflow) and **2^64 ≈ 1.8×10^19** (why 64-bit IDs never run out).

### Time — memorise one number

**86,400 seconds/day ≈ 10^5.** Round it. Always round it.

| Period | Seconds | Round to |
|---|---|---|
| 1 hour | 3,600 | ~3.6×10^3 |
| 1 day | 86,400 | **10^5** |
| 1 month | 2,592,000 | ~2.5×10^6 |
| 1 year | 31,536,000 | ~3×10^7 |

### The three conversions you'll do every single time

```
QPS          = events per day ÷ 10^5          (that's it — divide by 100,000)
Storage/day  = events per day × bytes per event
Bandwidth    = QPS × bytes per event          (then ×8 for bits/sec if quoting Gbps)
```

### Rules of thumb

| Rule | Value | Notes |
|---|---|---|
| 1 M requests/day | **≈ 12 QPS** | The anchor. 10 M/day ≈ 120 QPS. 1 B/day ≈ 12 K QPS. |
| Peak vs average | **2–3×** | Say which you're using. Diurnal traffic; a global product is flatter. |
| Read:write ratio | 10:1 to 1000:1 | Social/content is read-heavy. State it as an assumption. |
| Bytes per "small record" | ~1 KB | Tweet, log line, event. Good enough. |
| Replication factor | **×3** | Always multiply raw storage by 3. Then add indexes/overhead → ×1.5–2 more. |
| Yearly from daily | **×365 ≈ ×400** | Round up. Makes mental math trivial. |

### Sizes to have cached in your head

| Thing | Size |
|---|---|
| int64 / timestamp / UUID | 8 B / 8 B / 16 B |
| A tweet / short post | ~200 B text, ~1 KB with metadata |
| A user record | ~1 KB |
| A web page (HTML only) | ~50–100 KB |
| A photo (compressed) | ~200 KB – 2 MB |
| 1 min of 1080p video | ~50 MB (~7 Mbps) |
| A log line | ~200 B – 1 KB |

### Capacity of a single machine (2024-era commodity box)

Know these so you can answer *"do we even need to shard?"* — the answer is usually **no, not yet**.

| Resource | One machine handles |
|---|---|
| RAM | 64 GB – 1 TB |
| SSD (NVMe) | 1–30 TB, ~100 K–1 M IOPS |
| Network | 10–100 Gbps |
| Postgres, tuned | ~10–50 K simple QPS; millions of rows fine; **billions of rows is where it hurts** |
| Redis, single node | ~100 K–1 M ops/sec (single-threaded — CPU-bound on one core) |
| Nginx / envoy | ~50–100 K req/sec |
| Kafka broker | ~100 MB/s – 1 GB/s per broker |

### The worked example — do this shape every time

> *"100 M DAU, 5 posts/day, 1 KB each."*

```
Writes/day     = 100 M × 5              = 500 M/day
Write QPS      = 500 M ÷ 10^5           = 5,000 QPS       (avg)
Peak write QPS = 5,000 × 3              = 15,000 QPS
Reads @ 100:1  = 500 K QPS peak                            ← the real problem is reads
Storage/day    = 500 M × 1 KB           = 500 GB/day
Storage/year   = 500 GB × 400           = 200 TB/year
With ×3 repl   = 600 TB/year
Write BW       = 5,000 × 1 KB           = 5 MB/s  = 40 Mbps   (trivial)
Read BW        = 500 K × 1 KB           = 500 MB/s = 4 Gbps    (needs a CDN)
```

**Then say the conclusion out loud** — that's the part that scores:
> "So writes are trivial — 15 K QPS peak is one beefy Postgres. The whole problem is the 500 K read QPS
> and 4 Gbps of egress, which means this is a caching and fan-out problem, not a database problem."

### Discipline rules

1. **Round aggressively.** 86,400 → 100,000. 365 → 400. Nobody wants 3 significant figures.
2. **State every assumption out loud.** "I'll assume 100:1 read:write — tell me if that's off."
3. **Order of magnitude is the goal.** Being 2× off is fine. Being 1000× off is the failure.
4. **Use the number later.** Write it on the diagram. Put QPS on the arrows, size on the datastores.
5. **Do average, then peak.** Never quote one without saying which it is.

---

## In your own words

*Fill this in. Reading the table above does not transfer — writing the answer does.*

**Why is "1 M requests/day ≈ 12 QPS" worth memorising rather than deriving?**

>

**You estimate 15 K write QPS. Why does that number immediately change what you draw on the whiteboard?**

>

**Why multiply raw storage by 3 before quoting it? What else are you still forgetting after that?**

>

**When is an order-of-magnitude estimate NOT good enough — where does 2× actually matter?**

>

**Write your own worked example, from scratch, for a product you use daily. Show the arithmetic.**

>

---

## Drill until reflex

See [`../drills/estimation-drills.md`](../drills/estimation-drills.md) — 10 problems.
Target: **under 3 minutes each, on paper, no calculator.**

## Links

- Sizing a cache from these numbers → Phase 5
- Why peak matters more than average → [09-scalability-and-elasticity.md](09-scalability-and-elasticity.md)
- Egress is the sneaky cost → [11-cost-dimensions.md](11-cost-dimensions.md)
