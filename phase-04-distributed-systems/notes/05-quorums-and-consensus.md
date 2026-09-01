# 04·05 · Quorums & What Consensus Actually Solves

> **Why this exists:** quorums and consensus get conflated constantly. **`R + W > N` is not consensus**, and
> being able to say why is a genuine depth signal — it's the difference between "we get the latest value"
> and "we agree on a single history."

---

## Reference

### Quorums — the overlap idea

**A quorum is any subset large enough that two quorums must intersect.** The intersection is what carries the
guarantee.

**Majority quorum:** any `⌊N/2⌋ + 1` nodes. Two majorities of the same set **always** share at least one
member — so a decision can't be made twice independently.

| N | Majority | Tolerates | Note |
|---|---|---|---|
| 3 | 2 | **1** | The standard |
| **4** | **3** | **1** | ⚠️ **Same tolerance as 3, more cost** |
| 5 | 3 | 2 | |
| 6 | 4 | 2 | ⚠️ Same as 5 |
| 7 | 4 | 3 | |

> ⭐ **Why even node counts are wasteful:** adding the 4th node doesn't improve fault tolerance, but it *does*
> mean more machines must agree on every write (3 instead of 2), so latency and failure surface both go up.
> **Strictly worse. Always use odd.**

**Read/write quorums (`R + W > N`)** — [3c-06](../../phase-03-databases/notes/3c-06-leaderless-quorum.md).
You verified this on a real cluster in the Phase 3F lab: with `RF=3`, `QUORUM` survived one node down and
`ALL` did not.

### ⭐ Why `R + W > N` is NOT consensus

**This is the distinction to be able to make.**

| | **Quorum reads/writes** | **Consensus** |
|---|---|---|
| Guarantees | Your read set **intersects** your write set, so you *see* the latest value | **All nodes agree on a single, totally-ordered sequence of operations** |
| Handles concurrent writes | ❌ **No** — you may read *two* conflicting values and must resolve them (LWW, version vectors) | ✅ One of them wins, decided; everyone agrees which |
| Partial writes rolled back | ❌ No — a write that failed to reach a quorum **is not undone** and may be read later | ✅ Uncommitted entries never take effect |
| Ordering across keys | ❌ None | ✅ Total order |
| Gives linearizability | ❌ **Not on its own** | ✅ |
| Cost | 1 round trip | 1 round trip + a durable log + leader election |

**Concretely, three things quorums don't give you:**

1. **Concurrent writes still conflict.** Two clients write at `QUORUM` simultaneously; both succeed; the
   quorums overlap, so a reader sees *both* values. Quorum overlap told you the values are there — it didn't
   decide which one is *the* value.
2. **A failed write isn't rolled back.** It landed on one node; a later read may return it.
3. **Sloppy quorums break the overlap entirely** — the write may be held by nodes outside the key's replica
   set ([3c-06](../../phase-03-databases/notes/3c-06-leaderless-quorum.md)).

> **The line:** *"`R + W > N` gives you quorum **overlap**, not linearizability. It guarantees your read set
> intersects your write set, but it doesn't order concurrent writes, doesn't roll back partial writes, and
> breaks under sloppy quorums. If I need a single agreed history — a leader, a lock, a config value — I need
> consensus, not quorums."*

### What consensus solves

**Get N nodes to agree on one value (or one sequence of values), despite crashes and network failures.**

**Formally, four properties:**

| Property | |
|---|---|
| **Agreement** | No two nodes decide differently |
| **Validity** | The decided value was proposed by someone |
| **Termination** | Every non-faulty node eventually decides *(liveness — FLP says not unconditionally)* |
| **Integrity** | Each node decides at most once |

**Everything below reduces to consensus:**

| Problem | Why it's consensus |
|---|---|
| **Leader election** | Agree on who leads |
| **Distributed lock** | Agree on who holds it |
| **Atomic commit (2PC)** | Agree commit or abort ([3e-02](../../phase-03-databases/notes/3e-02-two-phase-commit.md)) |
| **Total order broadcast** | Agree on message order — **equivalent** to consensus |
| **Membership** | Agree who's in the cluster |
| **Linearizable register** | Agree on the value sequence |

> ⭐ **Total order broadcast is equivalent to consensus** — you can build either from the other. That's why a
> replicated log (Raft) is the standard implementation: agreeing on a *log order* and agreeing on a *value*
> are the same problem.

### The costs — say these when you propose consensus

| Cost | Detail |
|---|---|
| **A round trip to a majority, per decision** | In-region ~1 ms; **cross-region 50–150 ms** |
| **Doesn't scale with nodes** | More nodes = more agreement = *slower*. Groups are 3, 5, or 7 — **never 100.** |
| **Unavailable without a majority** | You saw this: pause 2 of 3 and etcd refuses all writes. CP by construction. |
| **Leader is a throughput bottleneck** | All writes funnel through it |
| **Liveness isn't guaranteed** | FLP — safety always, liveness only under partial synchrony ([01](01-fallacies-and-failure-models.md)) |

**How real systems scale it: run many small consensus groups.** CockroachDB runs a Raft group **per data
range**; Kafka has a leader **per partition**. Consensus scales by *partitioning*, never by adding nodes to
one group.

### Where you need it — and where you don't

| Need consensus | Don't |
|---|---|
| Leader election / failover | Caching |
| Distributed locks (with fencing) | Analytics, metrics, logs |
| Cluster membership & config | Feeds, timelines, recommendations |
| Unique constraints across a cluster | Anything eventually-consistent |
| Anything where two answers is a disaster | Anything with a natural merge (CRDT) |

> ⭐ **The senior instinct is to minimise how often you need it.** Consensus is expensive and unavailable
> under partition, so keep it on the **control plane** (who's the leader, what's the config) and off the
> **data plane** (the actual requests). That's exactly how Kubernetes, Kafka and CockroachDB are structured.

---

## In your own words

**Define a quorum. Why must two majorities intersect?**

>

**Why is an even node count strictly worse? Show the arithmetic for 3 vs 4.**

>

**Give three things `R + W > N` does NOT give you.**

>

**State the four properties of consensus. Which one does FLP threaten?**

>

**Why is total order broadcast equivalent to consensus, and why does that make a log the natural implementation?**

>

**How do real systems scale consensus, given that adding nodes makes it slower?**

>

**State the control-plane/data-plane instinct in your own words.**

>

---

## Links

- `R + W > N` in practice, measured → [3c-06](../../phase-03-databases/notes/3c-06-leaderless-quorum.md) and the [Phase 3F lab](../../phase-03-databases/lab/lab-d-cassandra/)
- **Raft, the implementation** → [06-raft.md](06-raft.md)
- FLP and partial synchrony → [01-fallacies-and-failure-models.md](01-fallacies-and-failure-models.md)
- Linearizability → [03-consistency-models.md](03-consistency-models.md)
- **DDIA ch. 9**, "Consensus"
