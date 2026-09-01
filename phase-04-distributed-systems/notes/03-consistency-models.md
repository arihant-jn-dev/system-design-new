# 04·03 · Consistency Models

> **Why this exists:** gate Q4 — *"order five consistency models and give a product requirement that demands
> each."* This is the note that turns "eventually consistent" from a hand-wave into a precise engineering
> statement.

---

## Reference

### The hierarchy, strongest → weakest

```
LINEARIZABLE      one copy, real-time order      ← needs consensus, costs a round trip
     ▼
SEQUENTIAL        one order, all agree; not necessarily real-time
     ▼
CAUSAL            causally-related ops ordered; concurrent ops may differ
     ▼
EVENTUAL          replicas converge... eventually. No ordering promise.
```

**Each level down removes a guarantee and buys availability and latency.**

### 1 · Linearizability (a.k.a. "strong consistency", atomic consistency)

> **The system behaves as if there is exactly ONE copy of the data, and every operation takes effect
> atomically at some instant between its invocation and its response.**

The **real-time** part is what makes it strong: if write W completes before read R *begins* (by wall-clock),
R **must** see W — even if they're on different clients on different continents that never communicate.

**Requires consensus** ([06-raft](06-raft.md)) or a single copy. Costs at least one round trip; unavailable
during a partition on the minority side.

**Product requirements that demand it:**
- **Distributed lock / leader election** — two leaders is a catastrophe
- **Unique username/email claim** — two people cannot get the same handle
- **Seat/ticket booking** — no double-booking
- **Account balance for an overdraft check** — a stale read authorises a bad withdrawal
- Configuration and feature flags that gate correctness

### 2 · Sequential consistency

All nodes see operations in **the same order**, and each client's own operations appear in program order —
but that global order **needn't match real time**.

> The difference from linearizable: I write at 10:00:00, you read at 10:00:05 and may still see the old
> value — as long as *everyone* sees the operations in a consistent order.

Rare as an explicit product guarantee; useful mainly to understand what linearizability adds (the real-time
constraint).

### 3 · Causal consistency ⭐

**Operations that are causally related are seen in the same order by everyone. Concurrent operations may be
seen in different orders.**

```
Alice: "How far from the finish?"          ← A
Bob:   "About a mile"                      ← B  (B causally depends on A: Bob read A)
Carol must never see B before A.

Meanwhile Dave posts something unrelated   ← D  (concurrent with A and B)
Carol and Erin may see D in different positions. That's fine.
```

**Why it matters: causal is widely considered the *strongest* model achievable while staying available
during a partition.** That makes it the sweet spot for a lot of real systems.

**Tracked with logical clocks** — vector clocks or version vectors ([04-time-and-clocks](04-time-and-clocks.md)),
not timestamps.

**Product requirements:**
- **Comment threads** — a reply must never appear before what it replies to
- **Chat** — messages in a conversation stay ordered
- **Social feeds** — a "like" never appears before the post
- Collaborative editing, where causality drives merge

### 4 · Eventual consistency

**If writes stop, all replicas eventually converge.** No promise about when, and no ordering guarantee before
convergence.

**It is a real guarantee, just a weak one** — and it's the correct default for most data
([Phase 0 note 07](../../phase-00-foundations/notes/07-consistency-informal.md)).

**Product requirements:** like/view counts · recommendations · search indexes · DNS · analytics dashboards ·
"users who viewed this also viewed" · anything where nobody can detect a few seconds of staleness.

### The client-centric guarantees — the practically useful layer

These are **per-session** promises, orthogonal to the global hierarchy, and they're what you actually
implement ([3c-02](../../phase-03-databases/notes/3c-02-replication-lag.md)):

| Guarantee | Promise | Fix |
|---|---|---|
| **Read-your-own-writes** | You always see your own writes | Pin your reads to the primary briefly, or an LSN token |
| **Monotonic reads** | You never see time go backwards | Pin a user to one replica |
| **Monotonic writes** | Your own writes apply in order | Route a session's writes through one path |
| **Consistent prefix** | You never see an effect before its cause | Keep causally-related data in one partition |

> **These are what users actually notice.** A user does not perceive "eventual consistency"; they perceive
> *"my comment disappeared."* **Designing at this layer is more productive than arguing about the global
> model** — and saying that is a strong signal.

### Gate Q4 — the answer table

| Model | Product requirement that demands it |
|---|---|
| **Linearizable** | Distributed lock / leader election; unique username claim; seat booking |
| **Sequential** | (rare in products) All replicas agree on an order, real time not required |
| **Causal** | Comment threads — a reply must never precede the post it answers |
| **Read-your-own-writes** | Posting a comment and seeing it on refresh |
| **Eventual** | Like counts, view counts, recommendations |

**Say them in order, and pair each with a requirement.** That's the whole question.

### What each costs

| Model | Coordination | Available under partition? | Latency |
|---|---|---|---|
| Linearizable | **Consensus / quorum every op** | ❌ minority side unavailable | ≥ 1 RTT |
| Sequential | Total order broadcast | ❌ | ≥ 1 RTT |
| **Causal** | Track dependencies (vector clocks) | ✅ **Yes** | Local |
| Eventual | None | ✅ | Local |

> **The line worth remembering: causal consistency is the strongest model you can have while remaining
> available during a partition.** Anything stronger requires coordination, and coordination is exactly what a
> partition prevents.

### Related terms you'll meet

- **Strict serializability** = linearizability + serializability — for *transactions* rather than single
  operations. Spanner and CockroachDB offer this ([3e-05](../../phase-03-databases/notes/3e-05-spanner-and-percolator.md)).
- **Serializability** (3b-02) is about transaction *interleaving*; **linearizability** is about real-time
  recency of single objects. **They're orthogonal**, and conflating them is a common slip.
- **Bounded staleness** — "at most 5 seconds behind." A pragmatic middle ground (Azure Cosmos DB offers it as
  a named level).

---

## In your own words

**Order the four global models and say what each removes.**

>

**What does the "real-time" part of linearizability actually promise? Give a scenario that distinguishes it from sequential.**

>

**Explain causal consistency with the question-and-answer example. Why is it the sweet spot?**

>

**Name the four client-centric guarantees and their fixes. Why is this layer more useful in practice?**

>

**Do gate Q4 out loud: five models, one product requirement each.**

>

**Serializability vs linearizability — what is each about?**

>

---

## Links

- CAP's C is linearizability specifically → [02-cap-and-pacelc.md](02-cap-and-pacelc.md)
- Logical clocks for causality → [04-time-and-clocks.md](04-time-and-clocks.md)
- Implementing the client-centric guarantees → [3c-02](../../phase-03-databases/notes/3c-02-replication-lag.md)
- Isolation levels (a different axis) → [3b-02](../../phase-03-databases/notes/3b-02-isolation-levels-and-anomalies.md)
- **DDIA ch. 9**, "Linearizability" and "Ordering Guarantees"
