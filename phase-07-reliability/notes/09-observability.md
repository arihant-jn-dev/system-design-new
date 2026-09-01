# 07·09 · Observability

> **Why this exists:** the roadmap wants metrics vs logs vs traces **and what each is BAD at**, plus RED/USE
> and the cardinality problem. Observability is what turns "the site is slow" into "shard 7's p99 tripled
> after the 14:02 deploy."

---

## Reference

### The three pillars — and what each is bad at

| | **Metrics** | **Logs** | **Traces** |
|---|---|---|---|
| Is | Numeric time series | Discrete events with context | The path of ONE request across services |
| Answers | *"Is something wrong? How much?"* | *"What exactly happened to THIS?"* | *"Where did the time go?"* |
| Cost | ⭐ **Cheap** (aggregated) | Expensive (volume) | Moderate (sampled) |
| Cardinality | ⚠️ **The killer constraint** | Fine — it's text | Fine |
| Retention | Long (years, downsampled) | Short (days–weeks) | Short |
| ⭐ **Bad at** | ⚠️ **Anything per-user/per-request. No detail.** | ⚠️ **Aggregation, trends, alerting. Expensive to search.** | ⚠️ **Sampled — the request you care about may not be there** |

> ⭐ **The workflow that uses all three:** a **metric** alerts you (error rate up) → a **trace** localises it
> (service B's p99 tripled) → **logs** explain it (a specific exception). **Each is bad at the others' job**,
> which is why "just log everything" doesn't work — you can't alert on logs at reasonable cost, and you can't
> debug from a counter.

**A fourth worth naming:** **continuous profiling** (CPU/memory flame graphs in production) — answers *"which
code is burning the CPU?"*, which none of the three can.

### RED, USE and the four golden signals

| Framework | For | Metrics |
|---|---|---|
| ⭐ **RED** | **Services** | **R**ate · **E**rrors · **D**uration |
| ⭐ **USE** | **Resources** | **U**tilisation · **S**aturation · **E**rrors |
| **Four golden signals** (Google SRE) | Services | Latency · Traffic · Errors · **Saturation** |

**Use RED for every service, USE for every resource (CPU, disk, pool, queue).**

> ⭐ **Saturation is the one people omit and the one that predicts.** Utilisation says "80% CPU"; saturation
> says "the run queue is 4 deep" — i.e. **demand already exceeds capacity.** Saturation is a *leading*
> indicator; errors are lagging.
>
> Concretely: connection-pool waiters, thread-pool queue depth, Kafka consumer lag, disk I/O queue. **Alert
> on these before anything breaks.**

**And always: latency as PERCENTILES, never averages** ([Phase 0 note 04](../../phase-00-foundations/notes/04-percentiles-and-tail-latency.md)).
You measured why: at fan-out 100 the **average fell below the median** — it described a user who didn't exist.

### ⚠️ Cardinality — the constraint that defines metrics systems

**Every unique label combination is a separate time series with its own index entry and in-memory state.**

```
http_requests{service, endpoint, status, region}
   10 services x 50 endpoints x 5 statuses x 3 regions = 7,500 series    ✅ fine

+ user_id (1M values)
   -> 7,500,000,000 series                                              💥
```

**You quantified this in Phase 0 drill 10: 7 TB → 14 PB from one label.**

| ⚠️ Never a metric label | Put it in |
|---|---|
| `user_id`, `session_id`, `request_id`, `trace_id` | ⭐ **Logs or traces** |
| Email, IP address | Logs |
| Full URL with IDs (`/orders/12345`) | ⭐ **Normalise to `/orders/:id`** |
| Error *messages* | Logs (use a bounded error **code** as a label) |

> ⭐ **The rule: metric labels must be BOUNDED and LOW-cardinality.** Unbounded identifiers belong in logs
> and traces, which are indexed differently and can be sampled. **Defend it with ingest-time cardinality
> limits and alerts on series growth** — by the time storage fills, the incident is hours old.

### Distributed tracing

```
trace_id: abc123
  ├─ span: gateway          [====================] 250ms
  │   ├─ span: auth         [==]                    15ms
  │   └─ span: order-svc    [=================]    220ms
  │        ├─ span: db      [=====]                 60ms
  │        └─ span: payment [==========]           140ms  ⭐ there it is
```

| Concept | |
|---|---|
| **Trace** | One request end to end |
| **Span** | One operation, with parent/child links |
| ⭐ **Context propagation** | The trace ID passed through **every** hop (W3C `traceparent`) |
| **Baggage** | Key/values carried along the trace |

⚠️ **Context propagation is where tracing breaks in practice.** One service that doesn't forward the header
breaks the trace from there down. **It must cross HTTP, gRPC, *and* message queues** — put the trace ID in
your Kafka headers, or async boundaries become blind spots ([Phase 6 note 11](../../phase-06-messaging/notes/11-event-driven-design.md)).

**Sampling:**

| | How | Trade |
|---|---|---|
| **Head-based** | Decide at the start (e.g. keep 1%) | ⭐ Cheap, simple — ⚠️ **you'll miss the rare slow request you actually wanted** |
| ⭐ **Tail-based** | Buffer the whole trace, decide after — keep all errors and slow traces | Much more useful; needs buffering infrastructure |

> **Tail-based sampling is the better answer** and worth naming: *"keep 100% of errors and anything over
> p99, plus 1% of the rest."* Head-based sampling has a habit of discarding exactly the traces you need.

### Structured logging

```json
{"ts":"2024-01-01T10:00:00Z","level":"error","msg":"payment failed",
 "trace_id":"abc123","user_id":"u_42","order_id":"o_9","error_code":"card_declined"}
```

| Rule | |
|---|---|
| ⭐ **Structured (JSON), not prose** | Greppable, filterable, aggregatable |
| ⭐ **Always include `trace_id`** | The join key between the three pillars |
| **Stable `error_code`** | Prose changes; codes don't |
| **Log levels used consistently** | ERROR = someone should look |
| ⚠️ **No PII / secrets** | Logs are widely readable and long-lived → Phase 10 |
| **Sample high-volume logs** | Full-fidelity logs at 100 K QPS is a budget item |

⚠️ **Logging is often the single largest observability cost.** Retention and sampling are budget decisions —
and **logging every request at 100 K QPS can cost more than the servers serving it.**

### What to instrument

- [ ] **RED** for every service and every endpoint
- [ ] **USE** for every resource — **especially saturation**: pool waiters, queue depth, consumer lag
- [ ] ⭐ **Dependency call metrics** — rate/errors/duration **per dependency**, plus breaker state
- [ ] **Business metrics** — orders/min, signups. ⭐ **These catch what technical metrics miss** (everything
      returns 200, but nobody can check out).
- [ ] Cache hit rate **and absolute miss QPS** ([Phase 5 note 04](../../phase-05-caching/notes/04-eviction-and-sizing.md))
- [ ] ⭐ **Client-side / RUM** — server metrics miss DNS, CDN and network failures entirely

> ⭐ **Business metrics deserve emphasis.** A "successful" checkout rate that drops 40% while every technical
> dashboard is green is the fastest way to catch a bad deploy — and it's the signal most teams don't have.

---

## In your own words

**Give the three pillars and what each is BAD at. Describe the workflow that uses all three.**

>

**RED vs USE. Why is saturation the metric that predicts?**

>

**Explain the cardinality problem with numbers. What belongs in labels vs logs?**

>

**Why does context propagation break, and where must it reach besides HTTP?**

>

**Head vs tail sampling — which is better and why?**

>

**Why are business metrics worth having when technical dashboards are green?**

>

---

## Links

- Percentiles, never averages → [Phase 0 note 04](../../phase-00-foundations/notes/04-percentiles-and-tail-latency.md)
- Cardinality drill → [Phase 0 drill 10](../../phase-00-foundations/drills/estimation-drills.md)
- Alerting and SLOs → [10-alerting-and-slos.md](10-alerting-and-slos.md)
- Gray failure — what only p99 catches → [08-failure-modes.md](08-failure-modes.md)
- PII in logs → Phase 10
