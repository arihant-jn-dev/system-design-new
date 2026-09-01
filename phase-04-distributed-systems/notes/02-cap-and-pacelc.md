# 04·02 · CAP — Stated Correctly — and PACELC

> **Why this exists:** gate Q1 asks you to *"state CAP correctly and explain why 'CP vs AP' is an incomplete
> way to describe a database."* CAP is the most misquoted theorem in the field, and stating it precisely is a
> cheap, immediate differentiator.

---

## Reference

### The theorem, stated correctly

**CAP (Brewer, proved by Gilbert & Lynch 2002):**

> **When a network partition occurs**, a distributed system must choose between
> **C**onsistency (linearizability) and **A**vailability (every non-failing node answers every request).

| Letter | Precise meaning |
|---|---|
| **C** | **Linearizability** — the system behaves as if there were one copy of the data, and every operation takes effect at a single instant. **Not** the C in ACID ([3b-01](../../phase-03-databases/notes/3b-01-acid.md)). |
| **A** | **Every request to a non-failing node gets a non-error response.** Note: no latency bound. "Slow" still counts as available. |
| **P** | **Partition tolerance** — the system keeps operating despite arbitrary message loss between nodes |

### The three things people get wrong

**1 · "Pick two of three."** ❌

**You do not choose P.** Networks partition — cables get cut, switches fail, a config push blackholes a
subnet. Partition tolerance is a *fact of the environment*, not a design option.

> **So the real statement is: "P is given. During a partition, choose C or A."** And crucially — **when
> there is no partition, you get both.** CAP says nothing at all about normal operation, which is 99.9% of
> the time.

**2 · "CA systems exist."** ❌
A "CA system" is a single-node system, or one that gives up the moment the network misbehaves. Any system
spanning a network must handle partitions.

**3 · "MongoDB is CP, Cassandra is AP."** ❌ — **and this is gate Q1's actual target.**

### ⭐ Why "CP vs AP" is an incomplete description

**Four independent reasons. Naming two or three is a strong answer.**

**(a) It's a per-operation choice, not a database personality.**
Cassandra with `CL=ALL` refuses to serve when a replica is down — that's CP behaviour. The same cluster with
`CL=ONE` stays available — AP. **Same database, same partition, opposite choice, decided per query.**
DynamoDB has both eventually-consistent and strongly-consistent reads. **You measured exactly this in the
Phase 3F lab.**

**(b) It says nothing about the 99.9% of time with no partition.**
The interesting question for most systems isn't partition behaviour — it's **latency vs consistency during
normal operation**, which CAP doesn't address at all. That's what PACELC adds.

**(c) The C is *linearizability specifically* — an all-or-nothing bar.**
Real systems live on a spectrum ([03-consistency-models](03-consistency-models.md)): causal consistency,
read-your-writes, monotonic reads. A system can be "not CP" and still offer far more than "eventual."

**(d) "Available" has no latency bound.**
A system that answers after 30 seconds is "available" by CAP's definition and useless in practice
([Phase 0 note 05](../../phase-00-foundations/notes/05-availability-vs-durability.md)).

> **The gate answer:** *"CAP says that during a network partition you must choose between linearizability and
> availability — and since you can't opt out of partitions, that's the only choice CAP describes. It says
> nothing about normal operation. 'CP vs AP' is incomplete because the choice is usually per-operation rather
> than per-database — Cassandra at `QUORUM` behaves differently from Cassandra at `ONE`, and I've seen that
> directly — and because CAP's C is linearizability specifically, so 'not CP' covers everything from causal
> consistency down to eventual. PACELC is the more useful framing: **if Partitioned, choose A or C; Else,
> choose Latency or Consistency** — because the latency-versus-consistency trade is the one you're actually
> making every day."*

### PACELC — the more useful framing

**Daniel Abadi, 2012:**

```
if (Partition)  then  choose  Availability  or  Consistency
Else                  choose  Latency       or  Consistency
```

**The "else" half is the important addition.** Even with a perfectly healthy network, stronger consistency
requires more coordination, and coordination costs round trips
([Phase 0 note 02](../../phase-00-foundations/notes/02-latency-numbers.md)). That trade is live **all the
time**, not just during incidents.

| System | Partition | Else (normal) | Reading |
|---|---|---|---|
| **Postgres (single node)** | n/a | — | No partition to speak of |
| **Postgres + sync replica** | **PC** | **EC** | Consistent always; pays an RTT per commit |
| **Postgres + async replica** | **PA** | **EL** | Replicas may serve stale reads; fast |
| **etcd / ZooKeeper / Spanner** | **PC** | **EC** | Refuses without a quorum. **You saw this in the lab.** |
| **Cassandra (`ONE`)** | **PA** | **EL** | Fast and available; may be stale |
| **Cassandra (`QUORUM`)** | **PC** | **EC** | Same cluster, different dial |
| **DynamoDB (default reads)** | PA | EL | Strongly-consistent reads flip it to PC/EC at 2× cost |
| **MongoDB** | PC | EC (default) | Tunable via read/write concern |

> **The rows to point at are the two Cassandra ones.** One database, two answers, chosen per query — which
> *is* the argument that CP/AP is incomplete.

### What it means in practice

| Data | Choose | Because |
|---|---|---|
| Account balance, inventory, unique usernames | **C** | Stale = wrong = money |
| Distributed lock, leader election, config | **C** | Two leaders is a disaster ([08](08-coordination-services-and-fencing.md)) |
| Feed, likes, view counts, recommendations | **A / L** | Nobody can tell 1,402 from 1,404 |
| Shopping cart | **A** | Amazon's Dynamo choice: **always accept the write**, resolve conflicts later. A lost "add to cart" is lost revenue. |
| Session data | A | Re-login is annoying, not fatal |

**The shopping-cart row is the canonical example** — Dynamo was built specifically because rejecting a write
during a partition costs Amazon money, so it accepts writes on both sides and reconciles afterwards
([3c-05](../../phase-03-databases/notes/3c-05-multi-leader.md)).

### The honest caveat

CAP's definitions are narrow (linearizability; *every* non-failing node answering), so several practitioners
— Kleppmann among them — argue the theorem is **too limited to be a useful design tool** and that people
should reason about specific consistency models and latency instead.

> **Mentioning that is a strong senior move:** *"CAP is a useful sanity check but a poor design tool — its
> definitions are narrow, and I'd rather reason about which consistency model each piece of data needs and
> what coordination that costs."*

---

## In your own words

**State CAP precisely. Why is "pick two" wrong?**

>

**Give four reasons "CP vs AP" is an incomplete description of a database.**

>

**Write out PACELC and explain why the "else" half is the more useful one.**

>

**Give an example of one database making opposite CAP choices on two queries.**

>

**Why did Amazon build Dynamo to stay available for shopping carts?**

>

---

## Links

- Linearizability and the full spectrum → [03-consistency-models.md](03-consistency-models.md)
- Quorums vs consensus → [05-quorums-and-consensus.md](05-quorums-and-consensus.md)
- Informal version → [Phase 0 note 07](../../phase-00-foundations/notes/07-consistency-informal.md)
- Tunable consistency, measured → [Phase 3F lab](../../phase-03-databases/lab/lab-d-cassandra/)
- **DDIA ch. 9**, "The Unhelpful CAP Theorem" · Abadi's PACELC paper
