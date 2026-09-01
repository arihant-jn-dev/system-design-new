# 3C·06 · Leaderless Replication & Quorums

> **Why this exists:** the Dynamo model — Cassandra, Riak, DynamoDB. **R + W > N** is a formula you should be
> able to derive rather than recite, and the surrounding machinery (hinted handoff, read repair, Merkle
> trees) is standard interview vocabulary.

---

## Reference

### The model

**No leader. The client (or a coordinator node) writes to *several* replicas at once and reads from
*several* at once.**

```
             ┌── write ──▶ node A ✅
  client ────┼── write ──▶ node B ✅       W = 2 acks required -> success
             └── write ──▶ node C ❌ (down)

             ┌── read ───▶ node A  {v2}
  client ────┼── read ───▶ node C  {v1}    R = 2, take the NEWEST -> v2
             └── (skip B)
```

**No failover** — there's no leader to fail. A node being down doesn't stop writes; you just need `W` of them.
That's the availability argument.

### R + W > N — derive it, don't memorise it

```
N = replicas per key
W = replicas that must ACK a write
R = replicas that must respond to a read
```

**If `R + W > N`, the read set and the write set must overlap by at least one node — so at least one node
you read from has the latest write.**

```
N=3, W=2, R=2:  2 + 2 = 4 > 3  ✅
   write went to {A,B}, read from {B,C} -> B is in both -> you see the latest
```

| Config | Property |
|---|---|
| **N=3, W=2, R=2** | **The standard.** Tolerates 1 node down for both reads and writes. |
| N=3, W=3, R=1 | Fast reads, **no write availability if any node is down** |
| N=3, W=1, R=3 | Fast writes, slow reads, low write durability |
| N=3, W=1, R=1 | **R+W ≤ N** → eventual consistency, maximum availability/speed |
| N=5, W=3, R=3 | Tolerates 2 failures |

**Tuning is per-operation, not per-database** — Cassandra lets you set consistency per query. *"Writes at
QUORUM, reads at ONE for the feed, reads at QUORUM for the balance"* is a real and good answer.

> **Even node counts are wasteful:** N=4 needs W=3,R=2 for overlap — the same failure tolerance as N=3, for
> more storage. **Use odd N.**

### Why R + W > N is NOT the same as strong consistency

**This is the nuance that separates a memorised answer from an understood one.** Quorum overlap guarantees
you *read* the newest value **is present in your read set** — but:

| Problem | Why it breaks the guarantee |
|---|---|
| **Sloppy quorum** | Writes may go to nodes *outside* the home replica set (see below), so the overlap isn't with the nodes you read |
| **Concurrent writes** | Two writes at once — the conflict must still be resolved (LWW, version vectors) |
| **A write that succeeded on some nodes but failed the quorum** | It isn't rolled back. It may still be read later. |
| **No isolation** | Reads can see partial state across keys |
| **A failed write followed by a read** | May return the failed write's value |
| **Node restored from a stale backup** | Overlap is with a node that lost data |

> **The interview line:** *"R + W > N gives you quorum overlap, not linearizability. It guarantees a read set
> intersects the write set, but with sloppy quorums, concurrent writes and no rollback of partial writes, you
> still get anomalies. If I needed genuine linearizability I'd need consensus, not quorums."* → Phase 4.

### The machinery

**Sloppy quorum + hinted handoff — availability under partition**

```
Key's home nodes: {A, B, C}.  A and B are down.
  STRICT quorum:  W=2 cannot be met -> WRITE FAILS
  SLOPPY quorum:  write to {C, D, E} (not the home nodes) -> WRITE SUCCEEDS
                  D and E hold "hints": "this really belongs to A and B"
                  When A and B recover, D and E HAND OFF the data.
```

**Sloppy quorum buys write availability and gives up the R+W>N guarantee**, because your write may be on
nodes your read never asks. Explicitly a *durability/availability* mechanism, not a consistency one.

**Read repair** — during a read, the coordinator notices a replica has a stale value and **writes the newer
value back**. Cheap; only repairs data that's actually read. Frequently-read data stays healthy; cold data
rots.

**Anti-entropy with Merkle trees** — a background process compares replicas to find divergence.

```
        root hash          ← differs? then some data differs
       /         \
    hash          hash     ← recurse only into the differing subtree
   /    \        /    \
 h1     h2     h3     h4   ← leaves = hashes of key ranges
```

**Why a Merkle tree:** comparing two 1 TB replicas key-by-key is impossible; comparing root hashes is one
comparison, and you only descend into subtrees that differ. **You find the diverging keys in `O(log n)`
transfers instead of `O(n)`.** Used by Cassandra, Riak, DynamoDB, and also by git and blockchains.

**Cold data is exactly what read repair misses**, so anti-entropy is the safety net — and if it's disabled or
falling behind, replicas drift silently.

### The quorum-ish operational reality

| Concept | Meaning |
|---|---|
| **Tunable consistency** | `ONE`, `QUORUM`, `LOCAL_QUORUM`, `ALL` per query (Cassandra) |
| **`LOCAL_QUORUM`** | Quorum **within the local datacentre** — avoids cross-region latency. **The standard multi-DC setting.** |
| Coordinator node | The node the client contacts; it fans out to replicas |
| Speculative retry | Send to more replicas than needed and take the first R — buys tail latency (hedged requests, Phase 4) |

### Comparison

| | **Single-leader** | **Multi-leader** | **Leaderless** |
|---|---|---|---|
| Writes go to | One node | Several | **Any/several** |
| Conflicts | Impossible | Common | Common |
| Failover needed | **Yes** | Partial | **No** |
| Write availability under partition | Low (minority side can't write) | High | **Highest** |
| Consistency | Strongest | Weakest | **Tunable** |
| Complexity | Lowest | High | Medium (but ops-heavy) |
| Examples | Postgres, MySQL | Galera, CouchDB | **Cassandra, Riak, DynamoDB** |

---

## In your own words

**Derive R + W > N. Why does the overlap give you the newest value?**

>

**Why is N=3, W=2, R=2 the standard? What does N=4 cost you for no benefit?**

>

**Give three reasons R + W > N is NOT strong consistency.**

>

**Explain sloppy quorum + hinted handoff. Which guarantee does it trade away, and for what?**

>

**Read repair vs anti-entropy — what does each cover, and what does read repair miss?**

>

**Why a Merkle tree rather than comparing keys? State the complexity improvement.**

>

**What's `LOCAL_QUORUM` for?**

>

---

## Links

- Consistent hashing, how keys map to N nodes → [Phase 2 note 04](../../phase-02-stateless-scaling/notes/04-consistent-hashing.md)
- Conflict resolution (shared with multi-leader) → [3c-05-multi-leader.md](3c-05-multi-leader.md)
- **Why quorums aren't consensus; linearizability; CAP stated correctly** → **Phase 4**
- Cassandra data modelling → Phase 3F
- **DDIA ch. 5**, "Leaderless Replication" · the **Amazon Dynamo** paper
