# 03 · Latency vs Throughput

> **Why this exists:** these are the two axes every performance conversation happens on, and optimising one
> routinely destroys the other. Candidates who conflate them say things like "we'll add more servers to
> reduce latency," which is usually false and is heard as a red flag.

---

## Reference

### Definitions — be precise

| Term | Definition | Unit | Question it answers |
|---|---|---|---|
| **Latency** | Time for **one** operation, start to finish | ms, µs | "How long does *my* request take?" |
| **Throughput** | Operations completed per unit time | QPS, req/s, MB/s | "How many can we serve *in total*?" |
| **Bandwidth** | Theoretical max throughput of a channel | Gbps | "What's the ceiling?" |
| **Response time** | Latency **as the client sees it** = service time + queueing + network | ms | The only one users care about |

**Response time vs latency:** strictly, *latency* is the time waiting to be served and *service time* is the
time being served. Colloquially "latency" means the whole thing. Just be consistent and say what you mean —
if an interviewer probes, define it and move on.

### The analogy that actually sticks

A pipe carrying water:

- **Latency** = how long one water molecule takes to travel the length of the pipe
- **Throughput** = litres per second coming out the end
- **Bandwidth** = the pipe's diameter — the max litres/sec it *could* carry

Now the key insight: **a wider pipe does not make the molecule arrive sooner.** More servers ≠ lower latency.

### Why optimising one destroys the other

This is the part interviewers listen for.

| Technique | Helps | Hurts | Mechanism |
|---|---|---|---|
| **Batching** | Throughput ⬆ | Latency ⬆ | Requests wait to be grouped. Kafka `linger.ms`, DB bulk inserts, GraphQL dataloader. |
| **Increasing concurrency** | Throughput ⬆ | Latency ⬆ (past a point) | Queueing. See Little's Law below. |
| **Compression** | Bandwidth ⬇, throughput ⬆ | Latency ⬆ (CPU time) | Trading CPU for network |
| **Caching** | Both ⬆ | — (mostly free) | Rare win-win. This is why caching is everywhere. |
| **Adding replicas** | Throughput ⬆ | Latency ➡ (unchanged) | More parallel capacity; each request is no faster |
| **Bigger machine (vertical)** | Both ⬆ | Cost ⬆ | Faster CPU genuinely reduces per-request service time |
| **Synchronous replication** | Durability ⬆ | Latency ⬆ | Must wait for the follower's ack |
| **Hedged requests** | Tail latency ⬇ | Throughput ⬇ | Sends duplicate work — spends throughput to buy p99 |

> **The senior sentence:** "Batching improves throughput at the cost of latency. Since this is an
> analytics ingest path and not a user-facing read, I'll take the batching."
> That single sentence — naming the trade and *committing based on the workload* — is the whole game.

### Little's Law — the one piece of queueing theory to know

```
L = λ × W

L = concurrency (requests in the system at once)
λ = throughput (arrival rate, req/s)
W = latency (average time in system, s)
```

Rearranged the useful way: **Concurrency = Throughput × Latency**

**Worked example:**
> Your service handles 1,000 QPS with 200 ms average latency.
> → In-flight requests = 1,000 × 0.2 = **200 concurrent requests**.
> If your thread pool is 100, you are already the bottleneck; requests queue and latency climbs.
>
> Now the dependency slows to 2 s:
> → 1,000 × 2 = **2,000 concurrent requests** needed to sustain the same throughput.
> You have 100 threads. Throughput collapses to 100 ÷ 2 = **50 QPS**. Your service is effectively down —
> *not because it broke, but because latency rose.*

That last paragraph is the mechanism behind cascading failure (Phase 7). Learn it here.

### The knee: what actually happens as load increases

```
latency
  │                                    ╱  ← "the knee": queueing dominates,
  │                                   ╱     latency goes vertical
  │                                 ╱
  │                            ╱╱╱
  │  ─────────────────────╱╱╱
  │  flat: service time only
  └────────────────────────────────────── throughput
                          ↑
                  ~70–80% utilisation
```

**Latency is flat until you approach saturation, then it goes vertical.** This is why you run systems at
60–70% utilisation, not 95%. The headroom isn't waste — it's what keeps you on the flat part of the curve.

Corollary: **"the server is only at 80% CPU, we're fine" is wrong.** At 80% you are at the knee.

### Open vs closed load models — why your load test lies

| Model | Behaviour | Real-world analogue |
|---|---|---|
| **Closed** (fixed VUs, each waits for a response) | If the system slows, VUs send *fewer* requests. Load self-throttles. Hides overload. | Internal batch job with a fixed worker pool |
| **Open** (fixed arrival rate, regardless of responses) | If the system slows, requests keep arriving and pile up. **Reveals overload and queueing.** | Real users on the internet |

Most naive load tests are closed-model and therefore flatter you. The Phase 0 lab uses k6's
`constant-arrival-rate` executor — an **open** model — on purpose.

---

## In your own words

**Define latency and throughput without using the other word in the definition.**

>

**Give a concrete example from a system you've worked on where improving throughput hurt latency.**

>

**Your service does 500 QPS at 100 ms. How many requests are in flight? Show Little's Law.**

>

**Why is running at 95% CPU utilisation a bad idea, in terms of the latency curve?**

>

**Why does a closed-model load test make a broken system look healthy?**

>

---

## Links

- The knee, cascading failure, load shedding → Phase 7
- Batching in Kafka (`linger.ms`) → Phase 6
- Hedged requests as a tail-latency tool → [04-percentiles-and-tail-latency.md](04-percentiles-and-tail-latency.md)
- See the knee with your own eyes → [`../lab/`](../lab/)
