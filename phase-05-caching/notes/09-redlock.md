# 05·09 · Redlock & the Controversy

> **Why this exists:** gate Q3 — *"explain the Redlock controversy and **state your own position**."* The
> roadmap notes that knowing both sides is a strong senior signal. It's also a rare interview question where
> having a *considered opinion* is explicitly the answer.

---

## Reference

### The simple case first: a single-Redis lock

```redis
SET lock:resource <unique-token> NX PX 30000
```
`NX` = only if absent. `PX` = expiry, so a dead holder can't block forever.

**Release must be Lua**, because check-then-delete is a race:
```lua
if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end
```
⚠️ **Without the token check you can delete someone else's lock** — yours expired, they acquired, you
"release" theirs.

**The weakness: one Redis is a single point of failure**, and its replication is **asynchronous** — so on
failover the new primary may not know about the lock, and **two clients can hold it simultaneously**
([07](07-redis-persistence-and-ha.md)).

### Redlock — Antirez's answer

**Use N independent Redis primaries (typically 5), with no replication between them.**

```
1. Get the current time.
2. Try to acquire the lock on ALL N nodes, sequentially, with a short per-node timeout.
3. You hold the lock if:
     · you acquired it on a MAJORITY (⌈N/2⌉+1), AND
     · the total elapsed time is less than the lock TTL
4. Your effective validity = TTL − elapsed − clock drift allowance.
5. On failure, release on ALL nodes (including ones you may have acquired).
```

The intuition mirrors a quorum: a majority means no two clients can both hold it.

### ⚠️ Kleppmann's critique — the four points

**1 · ⭐ No fencing token.**
Even a *perfect* lock service cannot stop a client from stalling (GC pause) after acquiring and before
writing. Without a monotonic token enforced **at the resource**, the stale write lands.
**You demonstrated exactly this in the Phase 4 lab: the late write destroyed the new holder's data.**
Redlock produces no such token — and **you cannot retrofit one**, because the N independent nodes have no
shared monotonic counter.

**2 · It depends on timing assumptions that don't hold.**
Redlock's safety argument requires **bounded clock drift** and **bounded process pauses**. Neither is true:
a GC pause can be seconds; NTP can jump a clock; a VM can be suspended for live migration
([Phase 4 note 04](../../phase-04-distributed-systems/notes/04-time-and-clocks.md)). Kleppmann's framing:
**Redlock is a timing-dependent algorithm masquerading as an asynchronous one.**

**3 · No consensus, no durable log.**
A Redis restart (without persistence, or with a fresh RDB) can **forget** a lock it granted. Two clients then
hold it. **A real consensus system persists the decision before acknowledging it** — Redis doesn't.

**4 · ⭐ The efficiency/correctness split — the most useful part.**

| Purpose | Consequence of a double-hold | Verdict |
|---|---|---|
| ⭐ **Efficiency** — avoid duplicate work (don't recompute a cache entry twice, don't send an email twice) | Wasted work, occasional duplicate | ⭐ **A single Redis lock is fine.** Redlock's complexity buys nothing here. |
| ⭐ **Correctness** — money, inventory, anything unrecoverable | **Data corruption** | **Use a real consensus system + a fencing token.** Redlock is not sufficient. |

**Kleppmann's conclusion: Redlock sits in an awkward middle.** Too complex for efficiency use cases, not safe
enough for correctness ones.

### Antirez's reply — steelman it

- The timing assumptions are **practical**, not exotic — plenty of production systems rely on bounded pauses
- If your process can pause for longer than the lock TTL, **your problems exceed the lock**
- Fencing tokens require the resource to *support* them, which many don't — so the critique assumes a
  capability you may not have
- Redlock targets the **efficiency** class, where a rare double-hold is acceptable
- Kleppmann's alternative (ZooKeeper/etcd) is significant operational weight for many teams

**And a fair point in the middle:** the fencing-token argument applies to **every** lock service, not just
Redlock. A ZooKeeper lock without fencing is *also* unsafe. Redlock's real sin is that it can't produce a
token even if you wanted one.

### ⭐ Stating your own position — the gate answer

**A defensible answer, and the shape matters more than the side:**

> *"I'd split it by consequence, which I think is the most useful part of the whole debate.*
>
> *If the lock is for **efficiency** — don't recompute the same cache entry, don't send the same email twice
> — a single Redis lock with `SET NX PX` and a Lua release is fine. A rare double-execution costs a bit of
> duplicated work. Redlock's five nodes buy me almost nothing for that.*
>
> *If the lock protects **correctness** — money, inventory, anything I can't undo — Redlock isn't sufficient,
> and I side with Kleppmann. The decisive issue isn't the clock assumptions, it's that **there's no fencing
> token**. I've demonstrated that failure: a client stalls past its lease, another takes the lock and writes,
> the first wakes up and overwrites it. Without a monotonic token enforced **at the resource**, no lock
> service prevents that — and Redlock structurally can't produce one, because its N nodes share no monotonic
> counter. So I'd use etcd or ZooKeeper, whose revision/zxid **is** a fencing token, and enforce it at the
> resource.*
>
> *And honestly, the best answer is usually to avoid the distributed lock entirely — a unique constraint,
> `SELECT FOR UPDATE SKIP LOCKED`, a conditional update, or partitioning work by entity so one owner handles
> it. Those give me mutual exclusion at the storage layer with no lock to get wrong."*

**Why this scores:** it takes a position, splits the problem usefully, cites the decisive technical point
rather than vibes, acknowledges the steelman, and ends by questioning the premise.

### The alternatives table

| Need | Use |
|---|---|
| Efficiency lock | **Single Redis**, `SET NX PX` + Lua release |
| Correctness lock | **etcd / ZooKeeper** + fencing token at the resource |
| "Only create once" | **Unique constraint** ([3b-05](../../phase-03-databases/notes/3b-05-idempotency-at-the-db-layer.md)) |
| "One worker per row" | **`SELECT FOR UPDATE SKIP LOCKED`** |
| "Only update if unchanged" | Optimistic concurrency (`WHERE version = ?`) |
| "One instance runs this job" | Leader election |
| "Process each message once" | **Idempotent consumer + dedupe key** ([3e-06](../../phase-03-databases/notes/3e-06-exactly-once.md)) |

---

## In your own words

**Write the single-Redis lock, acquire and release. Why must release use Lua and a token?**

>

**Describe Redlock in four lines.**

>

**Give Kleppmann's four objections. Which is decisive, and why?**

>

**Steelman Antirez. Give two points in his favour.**

>

**State YOUR position out loud, split by consequence. Time it — it should take about 45 seconds.**

>

**Give four ways to avoid needing the lock at all.**

>

---

## Links

- ⭐ **You demonstrated the fencing failure** → [Phase 4 lab](../../phase-04-distributed-systems/lab/) and [note 08](../../phase-04-distributed-systems/notes/08-coordination-services-and-fencing.md)
- Redis replication is async → [07-redis-persistence-and-ha.md](07-redis-persistence-and-ha.md)
- Clocks and pauses → [Phase 4 note 04](../../phase-04-distributed-systems/notes/04-time-and-clocks.md)
- Locks at the DB layer → [3b-04](../../phase-03-databases/notes/3b-04-locking-and-deadlocks.md)
- Kleppmann, *"How to do distributed locking"* · Antirez, *"Is Redlock safe?"* — **read both**
