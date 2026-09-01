# 04·11 · Backpressure & Flow Control

> **Why this exists:** the roadmap lists backpressure as *"a systems concept"* — because the same idea
> appears at every layer, from TCP windows to Kafka consumer lag to your thread pool. **The failure it
> prevents is unbounded queue growth**, which is how systems die slowly rather than quickly.

---

## Reference

### The problem

**A producer is faster than its consumer. Where does the excess go?**

```
producer ──▶ [ queue ] ──▶ consumer
              growing
```

**Three possible answers, and you must pick one deliberately:**

| Response | Result |
|---|---|
| **Buffer it** | ⚠️ Memory grows without bound → **OOM**, or latency grows without bound → **useless responses** |
| **Drop it** | Load shedding. Data loss, but the system survives. |
| ⭐ **Slow the producer down** | **Backpressure** — push the problem upstream to where it can actually be handled |

> ⭐ **The default — an unbounded queue — is the worst of the three**, and it's what you get by not choosing.
> An unbounded queue converts a *throughput* problem into a *latency* problem, then into an *availability*
> problem, and it hides the symptom until it's catastrophic.

### Why unbounded buffering is a trap

**A queue that never rejects doesn't prevent overload — it hides it and makes it worse.**

By Little's Law ([Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md)):
`latency = queue depth ÷ throughput`. A queue of 10,000 items draining at 1,000/s means **every item waits
10 seconds** — long after every client has timed out.

**So you're spending 100% of your capacity producing responses nobody is waiting for.** That's a metastable
failure: the work is real, the results are worthless, and the system can't dig out.

> **The principle: it is better to reject a request in 1 ms than to answer it in 30 seconds.**
> A fast rejection lets the client retry, fail over, or degrade. A slow success helps nobody.

### Backpressure at every layer — recognise the same idea

| Layer | Mechanism |
|---|---|
| **TCP** | **Receive window** — the receiver advertises how much it can take; the sender stops. Backpressure has been in the network stack since 1981. |
| **HTTP/2, gRPC** | Per-stream and per-connection **flow-control windows** |
| **Reactive Streams** (RxJava, Project Reactor, Akka) | The consumer **requests(n)** — a pull model, so it can never be overwhelmed |
| **Kafka** | Consumers **pull**. Producer `max.block.ms`, `buffer.memory`. **Consumer lag is the metric.** |
| **Thread pools** | **Bounded** queue + a rejection policy (`CallerRunsPolicy` makes the caller do the work — elegant self-throttling) |
| **Connection pools** | Acquisition timeout, not infinite wait ([3a-08](../../phase-03-databases/notes/3a-08-connection-pooling.md)) |
| **Envoy / service mesh** | Max pending requests, max concurrent requests → fail fast |
| **HTTP APIs** | **`429` + `Retry-After`** ([Phase 1 note 10](../../phase-01-networking/notes/10-api-design-mechanics.md)) — backpressure expressed in the protocol |

> ⭐ **Push vs pull is the deepest version of this.** A **pull** system has backpressure by construction —
> the consumer only takes what it can handle. A **push** system must add it explicitly. That's a large part
> of why Kafka consumers pull, and why it's more robust than a push-based broker under consumer slowness.

### Bounded everything

**The practical rule: every queue, pool and buffer in your system must have a limit and a defined behaviour
at that limit.**

```
✅ bounded queue (10,000) + reject on full + a metric on rejections
❌ unbounded queue  ->  works fine until the day it doesn't, then OOM
```

**What to bound:** message queues · thread pools · connection pools · in-memory caches · batch sizes ·
`LIMIT` on any API pagination · request body size · fan-out width.

### Load shedding — deliberate dropping

When you can't slow the producer (it's the internet), **drop work on purpose**:

| Strategy | |
|---|---|
| **Random** | Simple, fair, dumb |
| ⭐ **Priority-based** | **Shed the cheap traffic, keep checkout.** Shed anonymous before logged-in; shed retries before first attempts. |
| **Oldest-first (LIFO serving)** | Counter-intuitive but correct under overload: serve the *newest* requests, since the oldest have probably already timed out |
| **Adaptive** | Shed based on measured latency/queue depth (Netflix concurrency-limits, TCP-Vegas-style) |

**Shedding retries first is the highest-leverage rule** — during overload, retries are a large fraction of
traffic and each one is duplicated work ([Phase 1 note 11](../../phase-01-networking/notes/11-timeouts-retries-backoff.md)).

### Where backpressure must propagate

**Backpressure that stops at one layer just moves the queue.**

```
client ──▶ LB ──▶ service A ──▶ service B ──▶ database
                                              (slow)
```
If B slows and A buffers, A's queue grows and A becomes the problem. **A must propagate the pressure to the
LB, which must propagate it to the client (429).** The pressure should reach whoever can actually *decide to
send less*.

**And pair it with deadline propagation** ([Phase 1 note 11](../../phase-01-networking/notes/11-timeouts-retries-backoff.md)):
if a request's deadline has passed, **drop it rather than process it** — the client has already given up.

---

## In your own words

**Three responses to a fast producer. Why is the default the worst?**

>

**Use Little's Law to show why an unbounded queue produces useless work.**

>

**State the "reject in 1 ms vs answer in 30 s" principle and justify it.**

>

**Name four layers where you've seen backpressure, and the mechanism in each.**

>

**Why does a pull model have backpressure "by construction"?**

>

**Design a load-shedding policy for an e-commerce site under 3× expected traffic. What goes first?**

>

**Why must backpressure propagate rather than stop at one layer?**

>

---

## Links

- Little's Law and the latency knee → [Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md)
- `429` / `Retry-After` → [Phase 1 note 10](../../phase-01-networking/notes/10-api-design-mechanics.md)
- Retry storms → [Phase 1 note 11](../../phase-01-networking/notes/11-timeouts-retries-backoff.md)
- Connection pool limits → [3a-08](../../phase-03-databases/notes/3a-08-connection-pooling.md)
- **Load shedding, circuit breakers, metastable failure** → **Phase 7**
- Kafka consumer lag, unbounded queue growth → Phase 6
