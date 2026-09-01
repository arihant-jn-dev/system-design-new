# 02 · Latency Numbers Every Engineer Should Know

> **Why this exists:** so that when someone proposes "we'll just query the DB inside that loop," you know
> *instantly* — not after thinking — that it's 10,000× more expensive than a memory read. Memorise the
> **ratios**, not the digits. The digits change every hardware generation; the ratios have held for 30 years.

---

## Reference

### The ladder

| Operation | Latency | Relative to L1 | Human scale (L1 = 1 second) |
|---|---|---|---|
| L1 cache reference | **~1 ns** | 1× | 1 second |
| Branch mispredict | ~3 ns | 3× | 3 seconds |
| L2 cache reference | ~4 ns | 4× | 4 seconds |
| Mutex lock/unlock | ~17 ns | 17× | 17 seconds |
| **Main memory (RAM) reference** | **~100 ns** | **100×** | 1.5 minutes |
| Compress 1 KB (snappy) | ~2 µs | 2,000× | 33 minutes |
| **Read 1 MB sequentially from memory** | **~10 µs** | 10,000× | 3 hours |
| **SSD random read** | **~100 µs** | 100,000× | 1 day |
| **Read 1 MB sequentially from SSD** | **~100 µs–1 ms** | ~10^5–10^6× | 1–11 days |
| **Round trip within same datacenter** | **~500 µs (0.5 ms)** | 500,000× | 6 days |
| **Disk seek (HDD)** | **~10 ms** | 10^7× | 4 months |
| **Read 1 MB sequentially from HDD** | **~10–20 ms** | ~10^7× | 4–8 months |
| **Round trip CA → Netherlands** | **~150 ms** | 1.5×10^8× | **5 years** |

### The four numbers to actually memorise

If you memorise nothing else:

```
RAM       ~100 ns      ← 0.0001 ms
SSD       ~100 µs      ← 0.1 ms      (1,000× slower than RAM)
Same-DC   ~500 µs      ← 0.5 ms      (5,000× slower than RAM)
Cross-continent ~150 ms              (1,500,000× slower than RAM)
```

**Each step down is roughly 1000×.** RAM → SSD → network → intercontinental.

### Why the ratios matter more than the digits

| Ratio | Consequence you should state in an interview |
|---|---|
| RAM is ~1000× faster than SSD | This is *why caching works at all*. Not a small win — three orders of magnitude. |
| Same-DC RTT (0.5 ms) > SSD read (0.1 ms) | **A network hop costs more than a local disk read.** So "just add a microservice" is not free. |
| Cross-continent RTT ~150 ms | Speed of light. You cannot engineer around it. **You can only avoid crossing.** → CDN, regional replicas, edge. |
| Sequential ≫ random | 1 MB sequential from SSD ≈ 1 random SSD read × 10, not × 1000. This is the entire reason LSM trees exist (Phase 3A). |

### Speed of light — the floor you cannot negotiate with

Light in fibre ≈ 200,000 km/s (⅔ of c, due to refractive index).

| Route | Distance | Theoretical RTT | Real RTT |
|---|---|---|---|
| Mumbai → Bengaluru | ~850 km | ~8 ms | ~20–30 ms |
| Mumbai → Singapore | ~3,900 km | ~39 ms | ~60–80 ms |
| Mumbai → London | ~7,200 km | ~72 ms | ~120–140 ms |
| US East → US West | ~4,000 km | ~40 ms | ~70 ms |
| US West → Europe | ~9,000 km | ~90 ms | ~150 ms |

Rule of thumb: **real RTT ≈ 2× theoretical**, because of routing, switching and queueing.

**The interview move:** when a latency budget is tight (say 100 ms end to end) and the user is in Mumbai
while the DB is in Virginia — that's ~250 ms of RTT alone. The budget is already blown before you write any
code. State that. It's the kind of observation that ends the "just scale the servers" conversation.

### What this implies for design

| Observation | Design consequence |
|---|---|
| Network hop ≫ local work | Chatty service-to-service calls are the hidden cost of microservices. Batch them. |
| One RTT is ~0.5 ms in-DC | A request doing 20 sequential internal calls has spent 10 ms *just waiting*, doing nothing |
| Cross-region is ~150 ms | Synchronous cross-region writes are usually the wrong answer. Replicate async, or partition by region. |
| RAM ≫ disk | A cache hit ratio going 90% → 99% is a **10× reduction in DB load**, not a 9% improvement (see note 05 style math) |
| Sequential ≫ random | Append-only designs (logs, LSM, Kafka) are fast for a physical reason, not a fashionable one |

### The one that catches people

**TLS handshake** costs 1–2 extra RTTs (TLS 1.3 = 1 RTT, or 0 with resumption).
**TCP handshake** costs 1 RTT.
So a *cold* HTTPS connection cross-continent ≈ 150 ms (TCP) + 150 ms (TLS) + 150 ms (request) ≈ **450 ms
before a single byte of your application logic runs.** This is why connection reuse / keep-alive is not a
micro-optimisation. (You will see this in the Phase 0 lab.)

---

## In your own words

**State the four core latency numbers from memory. Do it now, then check.**

>

**Why is "a network call costs more than a disk read" a surprising and useful fact?**

>

**A product needs p99 < 50 ms for users in Mumbai. What does the speed of light alone rule out?**

>

**Explain to a junior why sequential access is so much faster than random access — physically.**

>

**Give an example from your own work where you (or someone) got a latency ratio wrong by 1000×.**

>

---

## Links

- Original source: Jeff Dean's "Numbers Everyone Should Know" (updated versions at `colin-scott.github.io/personal_website/research/interactive_latency.html`)
- Why the tail matters more than the average → [04-percentiles-and-tail-latency.md](04-percentiles-and-tail-latency.md)
- Picking timeouts from p99 → Phase 7
