# 07·01 · Timeouts & Deadline Propagation

> **Why this exists:** the roadmap's rule — *"every network call, always; and how to actually pick the value —
> **from the p99, not from a guess**."* A call with no timeout is a resource leak with a delay fuse, and you
> measured what it does: **71.6% failures and a 6.41 s p99**.

---

## Reference

### The types — you need all four

| Timeout | Bounds | Typical |
|---|---|---|
| **Connect** | TCP (+TLS) establishment | 1–3 s (same DC: 100–500 ms) |
| **Read / socket** | Gap **between bytes** | Depends |
| ⭐ **Total / request** | **The whole operation** | **The one people forget** |
| **Idle / keep-alive** | Unused pooled connection lifetime | 30–90 s |

⚠️ **Setting only a read timeout is a classic bug:** a server dribbling one byte every 4 seconds never trips
a 5-second *read* timeout and hangs forever. **Always set a total deadline.**

### ⭐ How to pick the value

> **Start from the dependency's p99, add headroom (~1.5–2×), then sanity-check against your own SLO.**
>
> Dependency p99 = 200 ms → timeout ≈ 300–400 ms.

| Too long | Too short |
|---|---|
| You hold capacity through an outage | You fail requests that would have succeeded |
| Your latency becomes the dependency's latency | ⭐ **You amplify load** — retrying work the server is still doing |
| ⭐ **You cascade** ([08](08-failure-modes.md)) | Wasted work |

**And the rule that ties them together: your timeout must be SHORTER than your caller's timeout.** Otherwise
you do work nobody is waiting for.

**Timeouts must be per-attempt, not per-operation** — a 300 ms timeout with 3 retries is potentially a
900 ms+ operation. **Budget the whole thing.**

### ⭐ Deadline propagation — the grown-up version

**Pass the remaining time budget down each hop.**

```
client:      "you have 1000ms"
gateway:     spends 50ms  -> tells service A:  "you have 950ms"
service A:   spends 200ms -> tells service B:  "you have 750ms"
service B:   sees 750ms; a query that needs 900ms -> ⭐ DON'T START IT. Fail now.
```

| Without deadlines | With |
|---|---|
| Each hop has a fixed timeout, unaware of elapsed time | Each hop knows the real budget |
| ⚠️ A service 4 hops deep happily spends 5 s on a request whose client gave up 4 s ago | Work is abandoned as soon as it's pointless |
| ⭐ **Pure wasted capacity during exactly the incident where you need it** | Capacity freed for live requests |

**gRPC has this built in** (`context.WithTimeout` propagates automatically). Over HTTP you pass a header —
`X-Request-Deadline` or `grpc-timeout` — and **check it before starting expensive work**.

> ⭐ **The single most valuable line: "if the deadline has passed, don't do the work."** During overload a
> large fraction of queued requests have already been abandoned by their clients; processing them is pure
> waste at the worst possible moment.

### Request cancellation

Deadlines tell you *when* to stop; cancellation propagates the fact that you *should*.

```js
const ctrl = new AbortController();
setTimeout(() => ctrl.abort(), 300);
await fetch(url, { signal: ctrl.signal });   // ⭐ actually stops the work
```

⚠️ **A timeout that only abandons the caller but leaves the work running downstream isn't a timeout — it's a
leak.** The connection may still be held; the database query still runs. **Cancel properly:** `AbortController`
in Node, `context.Context` in Go, `CancellationToken` in .NET, and `statement_timeout` at the database so the
query itself dies.

### Timeouts everywhere — the checklist

Every one of these needs a bound:

- [ ] HTTP client calls (connect **and** total)
- [ ] ⭐ **Database queries** (`statement_timeout`) and **connection acquisition** ([3a-08](../../phase-03-databases/notes/3a-08-connection-pooling.md))
- [ ] Cache calls — ⚠️ **a slow Redis should degrade to a cache miss, not a hang**
- [ ] Message-broker publishes
- [ ] Lock acquisition ([Phase 4 note 08](../../phase-04-distributed-systems/notes/08-coordination-services-and-fencing.md))
- [ ] ⭐ **`lock_timeout` before every DDL** ([12](12-zero-downtime-migrations.md))
- [ ] `idle_in_transaction_session_timeout` ([3b-03](../../phase-03-databases/notes/3b-03-mvcc.md))
- [ ] Health checks
- [ ] Graceful-shutdown drain

**"A slow Redis should degrade to a cache miss" is worth stating** — treating a cache timeout as a miss keeps
you serving; treating it as an error takes you down over a *performance* component.

### What you measured

| Mode | Success | p99 |
|---|---|---|
| **No timeout** | 28.4% | ⚠️ **6.41 s** |
| **150 ms timeout** | 25.7% | ✅ **154 ms** |

> ⭐ **A timeout doesn't make requests succeed — it makes failure FAST and BOUNDED.** p99 went from 6.41 s to
> 154 ms while the success rate barely moved. That's the point: you've stopped the dependency consuming your
> capacity, which is what lets circuit breakers and fallbacks do their job.

---

## In your own words

**Name the four timeout types. Which is most often forgotten, and what bug does that cause?**

>

**How do you pick a timeout value? Give both failure directions.**

>

**Why must your timeout be shorter than your caller's?**

>

**Explain deadline propagation. State the single most valuable rule.**

>

**Why is a timeout without cancellation a leak?**

>

**Cite your lab numbers. What did the timeout fix, and what did it NOT fix?**

>

---

## Links

- ⭐ **You measured this** → [`../lab/`](../lab/) Part A cases 1–2
- Cascading failure → [08-failure-modes.md](08-failure-modes.md)
- Retries and budgets → [02-retries-and-budgets.md](02-retries-and-budgets.md)
- Little's Law → [Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md)
- The Phase 1 introduction → [Phase 1 note 11](../../phase-01-networking/notes/11-timeouts-retries-backoff.md)
- **AWS Builders' Library: *Timeouts, retries and backoff with jitter***
