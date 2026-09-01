# 04·06 · Raft

> **Why this exists:** gate Q2 — *"explain Raft leader election and log replication on a whiteboard from
> memory."* Raft was designed to be **understandable**, so this is a fair thing to ask. You ran it in the
> lab; this is the mechanism behind what you saw.

---

## Reference

### What Raft is for

**Keep a replicated log identical on every node, despite crashes and network failures.** Apply that log to a
state machine and every node reaches the same state. That's **replicated state machine** — the general
recipe for fault-tolerant strong consistency.

### The three roles and the one clock

| Role | Does |
|---|---|
| **Leader** | Handles **all** client requests; replicates log entries; sends heartbeats |
| **Follower** | Passive. Responds to leader and candidate RPCs. |
| **Candidate** | A follower that timed out and is standing for election |

**The `term`** — a monotonically increasing integer, **Raft's logical clock**. Each term has **at most one
leader**. Every RPC carries a term.

> ⭐ **The single most important rule in Raft: if a node sees a term higher than its own, it immediately
> becomes a follower.** That's what makes a stale leader step down — you watched it happen in the lab when
> the paused node resumed at term 2 into a cluster at term 3.

---

## Leader election (gate Q2, part 1)

```
1. Followers expect a HEARTBEAT from the leader within their ELECTION TIMEOUT.

2. No heartbeat -> the follower:
     · increments its term            (term 2 -> 3)
     · becomes a CANDIDATE
     · votes for ITSELF
     · sends RequestVote RPCs to everyone else

3. A node grants its vote if:
     · the candidate's term >= its own, AND
     · it has not already voted this term (ONE VOTE PER TERM), AND
     · ⭐ the candidate's log is AT LEAST AS UP-TO-DATE as its own

4. Majority of votes -> LEADER. It starts sending heartbeats immediately.

5. Three possible outcomes:
     · it wins
     · another node wins (it sees a heartbeat with term >= its own -> steps down)
     · SPLIT VOTE (nobody gets a majority) -> timeout, new term, try again
```

**Two details that matter and that people omit:**

⭐ **1 · Election timeouts are RANDOMISED** (typically 150–300 ms, or 1000 ms in the lab). If they were
fixed, every follower would time out simultaneously, all become candidates, split the vote, and repeat —
possibly forever. **Randomisation makes one node reliably time out first.** This is the same
jitter-breaks-synchronisation idea as [Phase 1 note 11](../../phase-01-networking/notes/11-timeouts-retries-backoff.md).

⭐ **2 · The log-completeness check in step 3 is what guarantees safety.** A node will not vote for a
candidate whose log is behind its own ("up-to-date" = higher last-log term, or same term and longer log).
**This is why a newly elected leader always has every committed entry** — so Raft never needs to *transfer*
missing entries to a new leader. It's the elegant part.

**Majority arithmetic:**

| Nodes | Majority | Tolerates |
|---|---|---|
| 3 | 2 | **1 failure** |
| 4 | 3 | **1 failure** ← same as 3, for more cost |
| 5 | 3 | 2 failures |
| 6 | 4 | 2 failures |

> **Always odd.** An even count adds a node without adding fault tolerance, while increasing the number of
> machines that must agree — so it's strictly worse.

---

## Log replication (gate Q2, part 2)

```
1. Client sends a command to the LEADER.
2. Leader APPENDS it to its own log (uncommitted).
3. Leader sends AppendEntries RPCs to all followers, in parallel.
4. A follower appends and acks -- IF its log matches at the preceding index.
5. ⭐ Once a MAJORITY have acked, the entry is COMMITTED.
6. Leader applies it to its state machine and REPLIES TO THE CLIENT.
7. Leader tells followers the new commitIndex (piggybacked on the next
   AppendEntries); they apply too.
```

**The commit point is step 5 — a majority acking.** Not all nodes. Not the client reply. **A committed entry
can never be lost**, because any future leader must have it (the vote rule above).

**The Log Matching Property:**
> If two logs contain an entry with the **same index and same term**, then the logs are **identical in all
> preceding entries**.

Maintained by a consistency check: every `AppendEntries` includes the index and term of the entry
*immediately preceding* the new ones. If the follower doesn't have a match, **it rejects**, and the leader
decrements `nextIndex` for that follower and retries — walking backwards until the logs agree, then
overwriting the follower's conflicting tail.

> ⭐ **Followers never persuade the leader. The leader's log is authoritative** and conflicting follower
> entries are simply overwritten. That one-directional rule is what keeps Raft simple.

### The five safety properties

| Property | Means |
|---|---|
| **Election Safety** | At most one leader per term |
| **Leader Append-Only** | A leader never overwrites or deletes its own entries |
| **Log Matching** | Same index + term ⇒ identical logs up to that point |
| **Leader Completeness** | A committed entry is present in every future leader's log |
| **State Machine Safety** | If a node applies an entry at index i, no node applies a *different* entry at i |

**Leader Completeness is the crucial one**, and it comes directly from the "log at least as up to date"
voting rule.

### The subtle rule worth knowing

**A leader may only commit entries from its *own* term directly.** It cannot count replicas of an entry from
a *previous* term and declare it committed — that would be unsafe (a famous figure-8 scenario in the paper).
Instead a new leader commits a **no-op entry** in its own term; committing that implicitly commits everything
before it.

**Mentioning this is a strong signal** — it's the detail that separates "I read a blog post" from "I read the
paper."

---

## Reads — the part people forget

**A naive leader read can be stale**: a partitioned leader may not yet know it's been replaced. Options:

| Approach | Cost |
|---|---|
| **Read via the log** | Treat reads as log entries. Fully linearizable. Slow. |
| ⭐ **ReadIndex** | Leader confirms it's still leader by exchanging heartbeats with a majority, then serves from local state. **One round trip, no disk write.** What etcd does. |
| **Lease reads** | Leader assumes leadership for a lease period, serves locally with no coordination. **Fastest, but depends on bounded clock drift.** |
| **Follower reads** | Follower asks the leader for the current commit index, waits to catch up, then serves |

> **"How does Raft serve a linearizable read?" is a great follow-up to be ready for.** The answer is
> ReadIndex, and the reason is that leadership is not self-evident — a leader must *check* it still leads.

### Membership changes

Adding/removing nodes is dangerous: naively switching configurations can create **two disjoint majorities**
(two leaders) during the transition.

| Approach | How |
|---|---|
| **Joint consensus** | A transitional config requiring majorities in **both** old and new — no window where two disjoint majorities exist |
| **Single-server changes** | Add/remove **one node at a time**; old and new majorities always overlap. Simpler; what most implementations do. |
| **Learners / non-voting members** | New node catches up without voting, then is promoted. **Avoids an availability dip while it syncs.** etcd calls these learners. |

### Raft in practice

| System | Use |
|---|---|
| **etcd** | Kubernetes' entire control-plane state. **The lab.** |
| **Consul** | Service discovery, config |
| **CockroachDB / TiDB / YugabyteDB** | **Per-range** Raft groups — thousands of them |
| Kafka **KRaft** | Replaced ZooKeeper |
| MongoDB | Raft-like replica-set elections |
| Patroni | Postgres failover, backed by etcd ([3c-04](../../phase-03-databases/notes/3c-04-failover.md)) |

**"Per-range Raft groups" is worth understanding:** CockroachDB doesn't run one Raft group — it runs one per
data range, so consensus scales horizontally. That's how distributed SQL gets both consensus and scale.

---

## In your own words

**What problem does Raft solve? What's a replicated state machine?**

>

**Walk leader election out loud, from timeout to majority. Include both details people omit.**

>

**Why must election timeouts be randomised?**

>

**Why does the log-completeness voting rule matter? What does it save Raft from having to do?**

>

**Walk log replication. Where exactly is the commit point?**

>

**What is the Log Matching Property, and how is it maintained?**

>

**Why can't a leader directly commit an entry from a previous term? What does it do instead?**

>

**How does a Raft leader serve a linearizable read, and why isn't reading locally enough?**

>

**Why is an even node count strictly worse?**

>

---

## Links

- What consensus is for → [05-quorums-and-consensus.md](05-quorums-and-consensus.md)
- Paxos, ZAB, alternatives → [07-paxos-zab-and-alternatives.md](07-paxos-zab-and-alternatives.md)
- etcd/ZooKeeper built on this → [08-coordination-services-and-fencing.md](08-coordination-services-and-fencing.md)
- ⭐ **Watch an election happen** → [`../lab/`](../lab/) `leader-election.sh`
- Failover in databases → [3c-04](../../phase-03-databases/notes/3c-04-failover.md)
- **Paper: "In Search of an Understandable Consensus Algorithm" (Ongaro & Ousterhout)** — genuinely readable, ~18 pages
- Visualisation: **raft.github.io** and **thesecretlivesofdata.com/raft**
