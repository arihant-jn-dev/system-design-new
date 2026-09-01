# 04·04 · Time, Clocks & Ordering

> **Why this exists:** the roadmap's phrasing is the lesson — **"why timestamps are not ordering."** Using a
> wall-clock timestamp to decide which of two writes came later is one of the most common and most damaging
> distributed-systems mistakes, and LWW conflict resolution is built on it.

---

## Reference

### Two kinds of clock, and they are not interchangeable

| | **Time-of-day clock** | **Monotonic clock** |
|---|---|---|
| Returns | Wall-clock time (epoch) | Seconds since an arbitrary point |
| **Jumps backwards?** | ⚠️ **YES** — NTP correction, leap second, manual set | **Never** |
| Comparable across machines | Sort of (with skew) | ❌ **Meaningless across machines** |
| Use for | Timestamps to display, log entries | ⭐ **Measuring elapsed time, timeouts** |
| API | `System.currentTimeMillis()`, `Date.now()` | `System.nanoTime()`, `performance.now()`, `CLOCK_MONOTONIC` |

> ⭐ **Never measure a duration with a time-of-day clock.** An NTP correction mid-measurement can produce a
> *negative* elapsed time. Every timeout, latency measurement and rate limiter should use a monotonic clock.
> This is a real bug that ships regularly.

### Clock skew — the actual numbers

| Setup | Typical skew |
|---|---|
| NTP over the internet | **10–100 ms**, occasionally worse |
| NTP on a good LAN | 1–10 ms |
| PTP (Precision Time Protocol) | microseconds |
| GPS + atomic clocks (Spanner) | **< 7 ms, bounded and *known*** |

**And the pathological cases:** a VM paused for live migration wakes up with a stale clock; a leap second has
crashed production systems (2012, 2015); NTP misconfiguration can move a clock by *hours*; a virtualised
clock can drift under CPU steal.

### ⭐ Why timestamps are not ordering

```
Node A clock: 10:00:00.500   writes X = 1
Node B clock: 10:00:00.300   writes X = 2      ← actually happened LATER in real time

Last-write-wins picks A's value (higher timestamp).
THE MORE RECENT WRITE IS SILENTLY DISCARDED.
```

**Three separate problems:**

1. **Skew inverts the order.** With 100 ms of skew, any two writes within 100 ms may be ordered arbitrarily.
2. **Timestamps always produce an ordering — even for genuinely concurrent events.** They *invent* a
   happened-before relationship that doesn't exist, so you can't tell "B came after A" from "A and B were
   concurrent and need merging."
3. **Ties.** Two writes at the same millisecond need an arbitrary tiebreak.

> **This is why LWW silently loses data** ([3c-05](../../phase-03-databases/notes/3c-05-multi-leader.md)).
> Cassandra and DynamoDB use LWW for concurrent writes to the same cell — acceptable for a metric, not for a
> shopping cart.

### Logical clocks — ordering without wall-clock time

**The insight: you don't need to know *when* something happened. You need to know *what it happened after*.**

**The happened-before relation (Lamport, 1978):** `A → B` if A and B are in the same process and A came
first, or A is a send and B is its receive, or transitively. **If neither `A → B` nor `B → A`, they are
CONCURRENT** — and that's a real, useful thing to be able to detect.

#### Lamport timestamps — a single counter

```
· each node keeps a counter
· increment on every local event
· send the counter with every message
· on receive: counter = max(local, received) + 1
```

**Gives a total order** (with node ID as tiebreak). **But it cannot detect concurrency** — if `L(A) < L(B)`
you cannot tell whether A caused B or they were independent.

#### Vector clocks — one counter per node ⭐

```
Node A: [A:2, B:1]   vs   Node B: [A:1, B:2]
  → neither dominates → CONCURRENT → a real conflict, surface it

Node A: [A:2, B:1]   vs   Node B: [A:1, B:1]
  → A dominates elementwise → A happened after B → no conflict
```

**Vector clocks *can* detect concurrency.** That's the whole difference, and it's why Dynamo-style stores use
version vectors to decide whether to merge or overwrite.

**Cost:** size grows with the number of nodes, and entries must be garbage-collected.

#### Hybrid Logical Clocks (HLC) — the practical modern answer

**Combine a physical timestamp with a logical counter:** `(physical_time, logical_counter)`.

- Close to wall-clock time (so it's **human-readable and comparable to real time**)
- **Monotonic and causally consistent** — never goes backwards, respects happened-before
- Constant size (unlike vector clocks)

**Used by CockroachDB, YugabyteDB, MongoDB.** It's the pragmatic choice when you want causality *and*
timestamps that mean something.

#### TrueTime (Spanner)

Returns an **interval** `[earliest, latest]` rather than a point, backed by GPS and atomic clocks
([3e-05](../../phase-03-databases/notes/3e-05-spanner-and-percolator.md)). **Commit-wait** deliberately
sleeps out the uncertainty to buy external consistency.

> **The generalisable idea: don't pretend the clock is exact — expose the uncertainty and design around it.**

### The comparison

| Mechanism | Total order | Detects concurrency | Size | Wall-clock meaning |
|---|---|---|---|---|
| Wall-clock timestamp | ✅ (but **wrong**) | ❌ | O(1) | ✅ |
| **Lamport** | ✅ | ❌ | O(1) | ❌ |
| **Vector clock** | Partial | ✅ **Yes** | O(nodes) | ❌ |
| **HLC** | ✅ | Partial | O(1) | ✅ **Approximately** |
| **TrueTime** | ✅ | ✅ | O(1) | ✅ **Bounded** |

### Where timestamps ARE fine

Don't over-correct:

- **Displaying** "posted 3 minutes ago"
- **Log correlation** (approximately — that's what distributed tracing is for)
- **TTLs and expiry**, where a few seconds of skew is harmless
- **Rate limiting windows** — approximate is fine
- **Sequential ID generation** where the ordering is a nice-to-have (UUIDv7, Snowflake) — though Snowflake
  does need clock-skew handling, and famously **refuses to issue IDs if the clock moves backwards** rather
  than risk duplicates → Phase 9

---

## In your own words

**Time-of-day vs monotonic clock — which for a timeout, and what's the bug if you choose wrong?**

>

**Give the concrete example where LWW discards the more recent write.**

>

**Three reasons timestamps aren't ordering. Which is subtlest?**

>

**Define happened-before. What does "concurrent" mean, and why is detecting it valuable?**

>

**Lamport vs vector clocks — what does the vector buy, and what does it cost?**

>

**Why is HLC the practical modern choice?**

>

**Name three places where a wall-clock timestamp is genuinely fine.**

>

---

## Links

- LWW and conflict resolution → [3c-05](../../phase-03-databases/notes/3c-05-multi-leader.md)
- TrueTime and commit-wait → [3e-05](../../phase-03-databases/notes/3e-05-spanner-and-percolator.md)
- Consistency models causality supports → [03-consistency-models.md](03-consistency-models.md)
- CRDTs, which use these clocks → [10-crdts-and-collaborative-state.md](10-crdts-and-collaborative-state.md)
- Snowflake IDs and clock skew → Phase 9
- **DDIA ch. 8**, "Unreliable Clocks" · Lamport, *Time, Clocks, and the Ordering of Events* (1978)
