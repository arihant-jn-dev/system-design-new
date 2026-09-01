# 09·02 · Distributed Locks & Leader Election

> **Why this exists:** a component you'll be asked to design in 10 minutes, and one where the *naive* answer
> is subtly, dangerously wrong. ⭐ **You already built the safe version in Phase 4** — etcd, leases and
> fencing tokens.

---

## Reference

### ⭐ Why you probably don't want one

**Ask first: can you avoid the lock entirely?** It's the senior move, and it's usually available:

| Instead of a lock | Use |
|---|---|
| Serialise work per entity | ⭐ **Partition by key** — Kafka gives ordering per partition free ([Phase 6](../../phase-06-messaging/notes/)) |
| Prevent double-processing | ⭐ **Idempotency** — make the second attempt harmless ([14](14-idempotency-and-dedupe.md)) |
| Guard a DB invariant | ⭐ **A unique constraint, or `SELECT … FOR UPDATE`** — a real ACID lock in the place that owns the data |
| Only-one-runner cron | A leader election, or just a DB row with `WHERE last_run < now() - interval` |

> ⭐ **A distributed lock is a coordination point, an availability dependency, and a correctness hazard.
> Reach for it when nothing else fits, not first.**

### ⭐ The three properties, and which you can actually have

| | |
|---|---|
| **Mutual exclusion (safety)** | at most one holder |
| **Liveness** | the lock is eventually released even if the holder dies → ⭐ **requires a TTL/lease** |
| **Fault tolerance** | the lock service survives node failure |

> ⭐ **THE CENTRAL PROBLEM: the moment you add a TTL for liveness, you have broken mutual exclusion.**
>
> The holder can be paused (GC, VM suspend, network partition) past its expiry, the lock is handed to
> someone else, and **the original holder wakes up still believing it holds the lock.** Two writers.
>
> ⭐ **No amount of lock-service sophistication fixes this**, because the failure is on the *client* side and
> the *resource* has no idea a lock exists.

### ⭐ Fencing tokens — the actual fix

```
lock service           client A        client B        RESOURCE
   grant, token=33  ──▶ A
   (A pauses: GC)
   lease expires
   grant, token=34  ──────────────────▶ B
                                        B writes(token=34) ──▶ ✅ 34 >= 34, accept
   A wakes, writes(token=33) ────────────────────────────────▶ ⛔ 33 < 34, REJECT
```

⭐ **A monotonically increasing token issued with every grant; the RESOURCE rejects any write with a token
lower than the highest it has seen.** The stale holder is fenced out *by the thing it would corrupt*.

⚠️ **This requires the resource to participate.** If your storage can't check a token, you cannot make the
lock safe — you can only make it *probably* fine. ⭐ **Say that out loud; it's the whole point.**

### Implementations

| | How | Notes |
|---|---|---|
| ⭐ **etcd / ZooKeeper / Consul** | Raft/ZAB consensus + **leases** | ⭐ **The correct choice.** Real linearizability, real fencing (etcd's revision number / ZK's `zxid` **is** your fencing token), watches for instant failover |
| **Redis `SET key val NX PX ttl`** | a single key with a TTL | ⭐ **Fast and usually fine — but NOT safe under failover**, because Redis replication is asynchronous: the primary can ack the lock and die before replicating it, and the replica hands the same lock out again. ⚠️ **Delete with a Lua compare-and-delete**, never a bare `DEL` (you'd delete someone else's lock) |
| ⚠️ **Redlock** (N Redis nodes) | majority of N | ⭐ **Contested.** Martin Kleppmann's critique vs antirez's reply is worth reading in full — the short version is that it **relies on bounded clock drift and bounded pauses**, neither of which you have. **Don't propose it for correctness-critical work.** |
| **A database row** | `SELECT … FOR UPDATE`, or Postgres **advisory locks** | ⭐ **Underrated.** If the data you're protecting is already in that DB, this is simple, correct, and free — the lock and the data commit together |

### ⭐ Leader election

**The same primitive, used differently:** whoever holds the lock is the leader; they **renew** it
continuously, and drop it (or lose it by expiry) when they die.

**What you built in Phase 4:**

| | |
|---|---|
| etcd holds the leader key with a **lease** the leader must keep renewing | |
| ⭐ **A node leads iff `Leader == MemberID`** — there is no `IsLeader` field | |
| Followers **watch** the key and campaign the instant it disappears | |
| ⭐ **Fencing tokens made the split-brain writes harmless** | |

⚠️ **Election is not the hard part — knowing you've LOST it is.** A leader partitioned from etcd still
*believes* it leads. ⭐ **A correct leader stops acting BEFORE its lease expires** (renew at ⅓ of the TTL,
self-demote if a renewal fails), and everything it writes carries the fencing token anyway.

**Sizing:** lease TTL is the trade — short = fast failover but flaps on a GC pause; long = stable but a dead
leader stalls you for that long. ⭐ **Typical: 10–15 s TTL, renew every 3–5 s.**

### Designing one in 10 minutes

```
acquire(key, ttl):
    token = etcd.txn(if key absent -> put key=me with lease(ttl))   -> revision
    return token or null

renew():  every ttl/3, keepalive the lease
          ⭐ if a renewal FAILS -> stop doing the work IMMEDIATELY

release(): compare-and-delete (only if the value is still me)

every write to the resource carries `token`; the resource rejects token < seen
```

**Say these unprompted:** ⭐ TTL is mandatory (liveness) → ⭐ TTL breaks mutual exclusion → ⭐ fencing tokens
restore safety → **the resource must check the token** → renew at ⅓ TTL and self-demote → ⭐ **and ask whether
partitioning or idempotency removes the need for the lock at all.**

---

## In your own words

**⭐ Name three ways to avoid needing a distributed lock.**

>

**⭐ Why does adding a TTL for liveness break mutual exclusion? Walk the timeline.**

>

**Explain fencing tokens. What has to participate, and what if it can't?**

>

**Why is Redis `SET NX PX` not safe under failover?**

>

**⭐ Why must you delete a Redis lock with Lua rather than `DEL`?**

>

**What's the objection to Redlock?**

>

**When is a plain database row the right answer?**

>

**⭐ Why is losing leadership harder than winning it, and what does a correct leader do?**

>

**How would you size the lease TTL, and what's the trade?**

>

---

## Links

- ⭐ **You built this** → [Phase 4 lab](../../phase-04-distributed-systems/lab/) — etcd, leases, fencing
- Raft, terms, majorities → [Phase 4 notes](../../phase-04-distributed-systems/notes/)
- Redis semantics and Lua atomicity → [Phase 5](../../phase-05-caching/notes/)
- Partitioning as an alternative to locking → [Phase 6](../../phase-06-messaging/notes/)
- `SELECT … FOR UPDATE`, write skew → [Phase 3B](../../phase-03-databases/notes/)
- Machine-id assignment needs exactly this → [01-unique-ids.md](01-unique-ids.md)
- **Kleppmann, "How to do distributed locking"** — the fencing-token argument
