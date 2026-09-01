# 04·07 · Paxos, ZAB & Alternatives (Awareness Level)

> **Why this exists:** the roadmap marks these *"awareness level."* You need to recognise the names, know
> roughly how they differ from Raft, and — most usefully — be able to say **why Raft exists at all.**

---

## Reference

### Paxos (Lamport, 1989/1998)

**The original consensus algorithm. Provably correct, famously hard to understand.**

**Basic Paxos** decides **one** value, in two phases:

```
PHASE 1 — PREPARE
  Proposer picks a proposal number n, sends prepare(n) to acceptors.
  An acceptor promises not to accept anything numbered < n, and returns
  the highest-numbered value it has already accepted.

PHASE 2 — ACCEPT
  If a majority promised, the proposer sends accept(n, v) -- where v is the
  highest already-accepted value if any acceptor reported one, otherwise its
  own. (⭐ This is the subtle bit: a proposer may be forced to propose
  SOMEONE ELSE'S value, which is what preserves agreement.)
  A majority accepting -> CHOSEN.
```

**Roles:** proposer, acceptor, learner (often the same processes).

**Multi-Paxos** runs it repeatedly for a *sequence* of values, electing a stable leader so phase 1 can be
skipped for subsequent entries. **Multi-Paxos and Raft end up structurally similar** — a leader replicating a
log.

**Why Paxos is hard:**
- The paper is written as an allegory about an ancient parliament
- It describes agreeing on **one** value; turning that into a practical replicated log is left to you
- Leader election, membership changes and log compaction are all "exercises for the reader"
- **Every real implementation differs**, so "we use Paxos" tells you little

> **The famous line, from Google's *Paxos Made Live*:** *"There are significant gaps between the description
> of the Paxos algorithm and the needs of a real-world system… the final system will be based on an
> unproven protocol."* That paper is the honest account of what it takes to ship Paxos.

### ⭐ Why Raft exists

**Raft's paper is literally titled *"In Search of an Understandable Consensus Algorithm."*** Understandability
was the **design goal**, not a nice-to-have.

| Raft does | Paxos leaves open |
|---|---|
| **Strong leader** — log flows one way, leader → followers | Any proposer may propose; entries can arrive out of order |
| **Explicit leader election** with randomised timeouts | Not specified |
| **Log entries never reordered**; leader's log is authoritative | More permissive, more states to reason about |
| **Membership changes specified** (joint consensus / single-server) | Left to the implementer |
| **A complete, implementable spec** | A building block |

> **The one-line answer: "Paxos proves consensus is possible; Raft tells you how to build it."** Ongaro's
> user study found students understood Raft substantially better than Paxos — which is a legitimate
> engineering result, because **an algorithm nobody on your team understands is one nobody can operate or
> debug.**

### ZAB (ZooKeeper Atomic Broadcast)

ZooKeeper's protocol. Similar in spirit to Raft (leader-based, epochs ≈ terms), but designed around **total
order broadcast** rather than a general replicated log, with **primary-order** guarantees ZooKeeper needs.

**Predates Raft** and influenced it. If you're using ZooKeeper you're using ZAB.

### The others worth recognising

| Protocol | Idea | Where |
|---|---|---|
| **Viewstamped Replication (VR)** | Oki & Liskov, 1988 — **predates Paxos**, structurally very close to Raft | Historical, and a good "actually…" fact |
| **EPaxos** (Egalitarian Paxos) | **No leader** — commit non-conflicting commands in one round trip | Research; better tail latency, harder |
| **Flexible Paxos** | Phase-1 and phase-2 quorums need only *intersect*, not both be majorities | Enables clever quorum layouts |
| **Raft variants** | Pre-vote (avoids disruption from a rejoining node), leader leases, learners | Everywhere in practice |
| **PBFT / Tendermint / HotStuff** | **Byzantine** fault tolerance — tolerate lying nodes | Blockchains. Needs `3f+1` nodes for `f` faults. |
| **Gossip / epidemic** | ⚠️ **Not consensus** — eventual propagation only | Cassandra, Consul membership ([09](09-failure-detection-and-gossip.md)) |

**The BFT row is worth one sentence:** Byzantine fault tolerance costs `3f+1` nodes rather than `2f+1` and
far more messages, because it must tolerate participants that *lie*. **Outside blockchain and
safety-critical aerospace, crash-fault tolerance is the right assumption** — your own datacentre's machines
don't lie, they just die.

### What to actually say in an interview

> *"I'd use Raft, in practice by using etcd or Consul rather than implementing it. Paxos is the original and
> is provably correct, but it specifies agreeing on a single value and leaves the leader election, log
> management and membership changes to the implementer — which is why every Paxos deployment is subtly
> different and why Google's own paper about shipping it is titled 'Paxos Made Live'. Raft was designed for
> understandability and specifies the whole system, so it's what I'd want a team to operate and debug at
> 3 a.m. ZooKeeper's ZAB is in the same family. And I'd only consider Byzantine protocols if participants
> could be adversarial, which inside my own infrastructure they aren't."*

**That answer shows you know the landscape without pretending to have implemented Paxos.**

---

## In your own words

**Sketch basic Paxos in two phases. What's the subtle rule about which value a proposer sends?**

>

**Give three reasons Paxos is hard to implement.**

>

**Why does Raft exist? Name three things it specifies that Paxos doesn't.**

>

**Why is "understandability" a legitimate engineering goal rather than a soft one?**

>

**What does Byzantine fault tolerance cost, and when do you actually need it?**

>

---

## Links

- Raft in detail → [06-raft.md](06-raft.md)
- What consensus solves → [05-quorums-and-consensus.md](05-quorums-and-consensus.md)
- ZooKeeper in practice → [08-coordination-services-and-fencing.md](08-coordination-services-and-fencing.md)
- Gossip (not consensus) → [09-failure-detection-and-gossip.md](09-failure-detection-and-gossip.md)
- Papers: *Paxos Made Simple* · **Paxos Made Live** (Google) · *In Search of an Understandable Consensus Algorithm* (Raft)
