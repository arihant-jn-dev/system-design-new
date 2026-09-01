# 3C·05 · Multi-Leader Replication

> **Why this exists:** multi-leader is rarely the right answer, and knowing **why** is the valuable part.
> The moment you accept writes in two places you have inherited **conflict resolution**, which has no
> universally correct solution — only trades.

---

## Reference

### The model

**More than one node accepts writes; each leader is also a follower of the others.**

```
   writes                                    writes
     │                                          │
 ┌───▼─────┐   async, bidirectional   ┌─────────▼──┐
 │ LEADER  │ ◀──────────────────────▶ │  LEADER    │
 │ (Mumbai)│                          │ (Virginia) │
 └─────────┘                          └────────────┘
```

### When it's justified — three legitimate cases

| Case | Why |
|---|---|
| **Multi-region write latency** | Users in Mumbai shouldn't pay 150 ms to write to Virginia. Each region writes locally. |
| **Offline-first clients** | A mobile app or Google Calendar **is** a leader — it accepts writes offline and syncs later. **Every offline app is a multi-leader system**, whether you call it that or not. |
| **Collaborative editing** | Each user's local copy accepts edits immediately, then merges |

**And the honest fourth:** *"we couldn't get single-leader to scale writes."* That's the wrong reason —
**partitioning (3D) is the right answer to write scaling.**

> **The framing that scores:** *"Multi-leader is for when writes must be accepted in more than one place for
> reasons of **latency or connectivity**, not for throughput. If I just need more write capacity, I'd shard."*

### The cost: write conflicts

```
Leader A: UPDATE doc SET title = 'Recipe'   at t=1
Leader B: UPDATE doc SET title = 'Dinner'   at t=1
                  ...they sync...
                  Which one wins?
```

**In single-leader this is impossible** — the leader orders everything. Multi-leader has no global order,
so conflicts are not a bug, they're **inherent**.

**Worse: conflicts are detected asynchronously**, long after both users saw "saved successfully." You cannot
just return an error to the user — they've gone.

### Conflict resolution strategies

| Strategy | How | Trade |
|---|---|---|
| ⭐ **Avoid conflicts** | Route all writes for a given record to the **same** leader (e.g. by user's home region) | **The best answer when possible.** It's single-leader per record. |
| **LWW (last write wins)** | Highest timestamp wins | **Simple and silently loses data.** And *whose* clock? Clock skew makes "last" arbitrary (Phase 4). |
| **Highest node ID wins** | Deterministic | Also loses data, less arbitrarily |
| **Merge values** | Concatenate, union | Sometimes sensible ("Recipe/Dinner"), often nonsense |
| **Preserve both, ask the user** | Store siblings; the app or user resolves | **Honest.** What git does, and what Dynamo did. Pushes work to the app. |
| **Application-specific merge** | Domain logic decides | Best quality, most work |
| ⭐ **CRDTs** | Data structures **mathematically guaranteed** to converge | Correct by construction; restricted set of types |

**LWW is the default in many systems and the reason to be suspicious of them.** *"Cassandra uses LWW, so
concurrent writes to the same cell silently discard one — that's acceptable for a metric, not for a shopping
cart"* is exactly the kind of sentence that shows you understand the trade.

### CRDTs — the principled answer

**Conflict-free Replicated Data Types: structures whose merge operation is commutative, associative and
idempotent — so replicas converge to the same value regardless of the order they receive updates.**

| Type | Merge rule | Use |
|---|---|---|
| **G-Counter** (grow-only) | Per-node counts; merge = max per node, sum for the value | Likes, views |
| **PN-Counter** | Two G-Counters (increments, decrements) | Any counter |
| **LWW-Register** | Highest timestamp | Single values (with LWW's caveats) |
| **G-Set / 2P-Set** | Union (2P-Set adds a tombstone set) | Tags, membership |
| **OR-Set** (observed-remove) | Unique tags per add; remove only what you observed | **Sets where add/remove race** — the practical one |
| **RGA / Yjs / Automerge** | Sequence CRDTs | **Collaborative text editing** |

**Why "no conflict":** merge is defined so that any order gives the same result. **The conflict is resolved
by the data structure's algebra, not by a policy.**

**Costs:** metadata overhead (tombstones, per-node vectors) that grows over time; only certain operations are
expressible; garbage collection is genuinely hard.

**Operational Transformation (OT)** is the older alternative for collaborative editing (Google Docs). It
transforms operations against concurrent ones. **Harder to get right, needs a central server to order
operations; CRDTs are decentralised.** → Phase 4 and Phase 12 problem 28.

### Detecting concurrency — version vectors

To resolve a conflict you must first know it *is* one, rather than one write happening after another.

**A version vector** (one counter per replica) lets you compare two versions:

```
A: {a:2, b:1}   vs   B: {a:1, b:2}     → neither dominates → CONCURRENT → conflict
A: {a:2, b:1}   vs   B: {a:1, b:1}     → A dominates       → A is newer, no conflict
```

**Timestamps cannot do this** — they always give an ordering, even when two writes were genuinely concurrent,
so they manufacture a false "happened-before." **This is why LWW loses data silently.**
→ Phase 4 (Lamport clocks, vector clocks, HLCs).

### Topologies

| Topology | Notes |
|---|---|
| **All-to-all** | Every leader replicates to every other. Robust; **messages can arrive out of causal order** (an update before its insert). |
| **Circular** | Each forwards to the next. One node down breaks the ring. |
| **Star** | One hub. Hub is a SPOF. |

**All-to-all is the usual choice**, and it needs causality tracking to handle out-of-order arrival.

### Where you'll actually meet it

| System | Notes |
|---|---|
| **MySQL multi-source / Galera** | Multi-master MySQL |
| **BDR / pglogical** (Postgres) | Multi-master via logical replication |
| **CouchDB** | Built for offline-first sync |
| **DynamoDB Global Tables** | Multi-region, LWW |
| **Cassandra multi-DC** | Leaderless, but the same conflict issues (LWW) |
| **Every mobile app with offline mode** | Whether the team realises it or not |
| **Figma / Google Docs / Notion** | CRDT or OT |

---

## In your own words

**Give the three legitimate reasons for multi-leader. What's the wrong reason, and what should you do instead?**

>

**Why are conflicts inherent to multi-leader but impossible in single-leader?**

>

**Why can't you just return an error to the user on a conflict?**

>

**What's the best conflict strategy when it's available, and why does it work?**

>

**Why is LWW dangerous? Give a case where it's fine and one where it isn't.**

>

**What makes a CRDT "conflict-free"? Name three types and what each is for.**

>

**Why can't timestamps detect concurrency? What can?**

>

---

## Links

- Single-leader (the default) → [3c-01-single-leader-replication.md](3c-01-single-leader-replication.md)
- Logical replication makes the target writable → [3c-03-replication-methods.md](3c-03-replication-methods.md)
- Leaderless, and its own conflict handling → [3c-06-leaderless-quorum.md](3c-06-leaderless-quorum.md)
- **Vector clocks, CRDTs, clock skew, causality** → **Phase 4**
- Collaborative editing (OT vs CRDT) → Phase 12 problem 28
- **DDIA ch. 5**, "Multi-Leader Replication"
