# 04·08 · Coordination Services, Leases & Fencing Tokens

> **Why this exists:** gate Q3 — *"explain why a distributed lock without fencing is unsafe, with a concrete
> failure sequence."* You demonstrated this in the lab: without fencing, a stalled client's late write
> **destroyed** the new lock-holder's data. This note is the mechanism.

---

## Reference

### What a coordination service is for

A small, strongly-consistent, highly-available store for **metadata you must agree on** — built on consensus
([06-raft](06-raft.md)).

| Use | Why it needs consensus |
|---|---|
| **Leader election** | Two leaders is a catastrophe |
| **Distributed locks** | Mutual exclusion |
| **Configuration** | Everyone must see the same config |
| **Service discovery** | Which nodes are alive and where |
| **Membership** | Cluster composition |
| **Watches** | Push notification on change, without polling |

| System | Consensus | Notes |
|---|---|---|
| **etcd** | Raft | Kubernetes' store. gRPC, leases, watches, MVCC revisions. **The lab.** |
| **ZooKeeper** | ZAB | The original. Hierarchical znodes, ephemeral nodes, sequential nodes, watches. |
| **Consul** | Raft | Service discovery + health checks + KV |

> ⭐ **These are small-data systems.** They store kilobytes-to-megabytes of *metadata*, not your application
> data. Every write goes through consensus — so throughput is thousands of writes/sec, not millions.
> **Putting application data in etcd is a well-known way to take down a Kubernetes cluster.**

### Leases — locks with an expiry

**A lock held forever by a crashed client blocks everyone forever.** So real distributed locks are **leases**:
they expire unless renewed.

```
acquire  -> lock + TTL (e.g. 10s)
renew    -> heartbeat every TTL/3 while working
crash    -> nobody renews -> lease EXPIRES -> lock is free
```

**The TTL is a safety/liveness trade, and there's no correct value:**

| TTL | Recovery after a crash | Risk |
|---|---|---|
| **Short** (1–5 s) | Fast | ⚠️ **False expiry** — a live-but-slow holder loses the lock while still working |
| **Long** (30–60 s) | Slow — everyone waits | Safer against false expiry |

**etcd:** `lease grant <ttl>`, attach keys to the lease, `lease keep-alive` to renew.
**ZooKeeper:** *ephemeral nodes* — automatically deleted when the client's session ends.

---

## ⭐ Why a lock without fencing is unsafe (gate Q3)

**The failure sequence — you produced this in the lab:**

```
1. Client A acquires the lock. Lease TTL = 3s. Token (etcd revision) = 8.

2. A STALLS.
     A GC pause. A long syscall. A blocked disk write. A VM suspended for
     live migration. A network hiccup.
     ⭐ A does not know it has stalled. From inside, no time has passed.

3. A's lease is not renewed and EXPIRES. The lock is now free.
     A still believes it holds the lock. Nothing has told it otherwise,
     and nothing CAN -- it is frozen.

4. Client B acquires the lock. Token = 10.

5. B does its work and writes.        ✅ correct

6. A WAKES UP and, believing it still holds the lock, writes.

   WITHOUT FENCING -> A's write is ACCEPTED.
                      B's data is overwritten by a client that lost the lock
                      seconds ago. Mutual exclusion VIOLATED.
                      (Lab scenario 1: final value = "written-by-A-LATE")

   WITH FENCING    -> the resource sees token 8 <= lastToken 10 and REJECTS.
                      (Lab scenario 2: final value = "written-by-B") ✅
```

### The insight that makes it click

> ⭐ **The token is enforced by the RESOURCE — not by the lock service, and not by the client.**

A client that *wrongly believes* it holds the lock can do no damage, because **the thing it writes to refuses
to listen to it.**

> ⭐ **And you cannot fix this with a better lock service.** No lock service can prevent a client from
> stalling *after* acquiring and *before* writing — that window always exists, because a lock tells you only
> what was true **at the moment you asked**. You can't close the window; you can only make the stale write
> **harmless**.

**The gate answer:**

> *"A lock tells you what was true at the moment you asked. Suppose client A takes the lock, then stalls for
> a GC pause longer than its lease TTL. The lease expires, client B takes the lock and does its work. Then A
> wakes up — with no idea any time has passed — and writes. Without fencing that write is accepted and it
> overwrites B, so mutual exclusion is violated even though the lock service was never wrong.*
>
> *The fix is a fencing token: every lock grant carries a monotonically increasing number, and the resource
> being protected rejects any write carrying a token lower than the highest it has seen. The crucial part is
> that the **resource** enforces it, not the lock service — because you can never eliminate the stall, you
> can only make the late write harmless. In etcd the revision number is a fencing token for free; in
> ZooKeeper it's the zxid; in Raft it's the term. Redis has no native equivalent, which is the heart of the
> Redlock critique."*

### Where tokens come from

| System | Token |
|---|---|
| **etcd** | The key's **revision / mod_revision** — a cluster-wide monotonic counter |
| **ZooKeeper** | The znode's **zxid** or version number |
| **Raft** | The **term** |
| **Postgres** | A monotonic sequence, or an optimistic-concurrency `version` column ([3b-04](../../phase-03-databases/notes/3b-04-locking-and-deadlocks.md)) |
| **Redis** | ⚠️ **Nothing native** — see below |

### The Redlock controversy — know both sides

**Redlock** (Antirez): acquire the lock on a majority of N independent Redis masters; if you get ⌈N/2⌉+1
within the TTL, you hold it.

**Kleppmann's critique:**
1. **No fencing token** — the failure above is unaddressed
2. **It depends on bounded clock drift and bounded pauses** — a GC pause or NTP jump breaks the safety argument
3. Redis has no consensus and no durable log; a master restart can lose the lock
4. **If you need *correctness*, use a real consensus system. If you only need *efficiency* (avoiding
   duplicate work), a simple single-Redis lock is fine** — and Redlock's complexity buys little.

**Antirez's reply:** the clock assumptions are practical rather than theoretical, and many real systems make
them; Redlock is aimed at efficiency-class use cases.

> **Your position matters more than which side you pick.** A good one:
> *"I'd split it by consequence. If the lock is for **efficiency** — don't send the same email twice, don't
> recompute the same cache entry — a single Redis lock with a TTL is fine, and a rare double-execution is
> acceptable. If the lock protects **correctness** — money, inventory, anything unrecoverable — I want a
> consensus-backed lock **and** a fencing token enforced at the resource. And often the better answer is to
> remove the need for the lock entirely: a unique constraint or a conditional update gives me mutual
> exclusion at the storage layer with no lock at all."*

### ⭐ The best answer: often, don't use a distributed lock

**Distributed locks are hard. Frequently the requirement dissolves:**

| Instead of a lock | Use |
|---|---|
| "Only one worker processes this row" | `SELECT ... FOR UPDATE SKIP LOCKED` ([3b-04](../../phase-03-databases/notes/3b-04-locking-and-deadlocks.md)) |
| "Only create this once" | A **unique constraint** ([3b-05](../../phase-03-databases/notes/3b-05-idempotency-at-the-db-layer.md)) |
| "Only update if unchanged" | Optimistic concurrency: `UPDATE ... WHERE version = ?` |
| "Only one instance runs this job" | Leader election, or a scheduler that guarantees single execution |
| "Don't process this message twice" | **Idempotent consumer + dedupe key** ([3e-06](../../phase-03-databases/notes/3e-06-exactly-once.md)) |
| "Serialise access to one entity" | Partition by that entity so one owner handles it (Kafka key → partition) |

**The last row is the most powerful:** if all work for entity X goes to the same consumer, you have mutual
exclusion by *routing* rather than by locking.

### Watches

Both etcd and ZooKeeper let clients **watch** a key and be notified on change — no polling.

**Used for:** config reload, service-discovery updates, leader-change notification, membership.

⚠️ **The thundering herd:** if 10,000 clients watch one key and it changes, all 10,000 are notified at once
and may all reconnect or re-read simultaneously. **Jitter the reaction**
([Phase 1 note 11](../../phase-01-networking/notes/11-timeouts-retries-backoff.md)).

---

## In your own words

**Why are these "small-data" systems? What happens if you ignore that?**

>

**What's a lease, and why is its TTL a no-win trade?**

>

**Walk the fencing failure sequence out loud. Say it as you would in an interview.**

>

**Who enforces the token, and why is that the crucial detail?**

>

**Why can't a better lock service fix this?**

>

**State your position on Redlock, split by consequence.**

>

**Give four ways to avoid needing a distributed lock at all.**

>

---

## Links

- Raft, which these are built on → [06-raft.md](06-raft.md)
- Fencing in database failover → [3c-04](../../phase-03-databases/notes/3c-04-failover.md)
- Locks at the DB layer → [3b-04](../../phase-03-databases/notes/3b-04-locking-and-deadlocks.md)
- Idempotency instead of locking → [3e-06](../../phase-03-databases/notes/3e-06-exactly-once.md)
- ⭐ **Demonstrate the bug yourself** → [`../lab/`](../lab/) `fencing.sh`
- Redis locks, Redlock in depth → **Phase 5**
- Kleppmann, *"How to do distributed locking"* · Antirez's reply
