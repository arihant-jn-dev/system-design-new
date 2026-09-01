# Phase 4 Lab — Raft Elections & Fencing Tokens

> Roadmap: *"Run a 3-node etcd cluster. Elect a leader. `kill -STOP` the leader (pause, don't kill — that's
> the interesting failure) and watch re-election. Then implement a lock with a lease + fencing token, and
> demonstrate the bug you get **without** the fencing token."*

**Time: ~2 hrs.** etcd starts in seconds.

```bash
cd phase-04-distributed-systems/lab
docker compose up -d
docker exec p4-etcd1 etcdctl endpoint status --cluster -w table

./leader-election.sh     # A — Raft elections
./fencing.sh             # B — why a lock without fencing is unsafe
```

Three nodes because Raft needs a **majority**: 3 tolerates 1 failure, 4 also tolerates only 1. Always odd.

---

# A · Leader election

## Why `kill -STOP` and not `kill -9`

**A killed process is the easy failure.** Sockets close, peers get connection-refused, everyone knows
immediately.

**A paused process is the interesting one.** It is alive. It holds all its state. It has not been told
anything. And when it resumes, **it has no idea any time has passed** — so it carries on exactly where it
left off, still believing it is the leader.

**That is a GC pause**, and it is how split brain actually happens
([3c-04](../../phase-03-databases/notes/3c-04-failover.md)).

> *(The etcd image is distroless — no shell — so the script uses `docker pause`, which uses the cgroup
> freezer. Same semantics as SIGSTOP for every process in the container.)*

## Reference results

```
A1  etcd1  leader=true   term=2
    etcd2  leader=false  term=2
    etcd3  leader=false  term=2

A3  >>> p4-etcd1 PAUSED
    p4-etcd1  (paused -- cannot answer)
    p4-etcd2  leader=true   term=3     ← NEW LEADER, NEW TERM
    p4-etcd3  leader=false  term=3

A4  wrote /demo/key = value-after-election      ← 2 of 3 is a majority; fully available

A5  >>> p4-etcd1 RESUMED
    etcd1  leader=false  term=3        ← stepped down
    etcd2  leader=true   term=3
```

**What happened, and it's gate Q2:**

1. Followers stopped receiving heartbeats
2. One hit its **randomised** election timeout first — randomisation is what prevents a split vote
3. It incremented the **term**, became a candidate, requested votes
4. It got a **majority** (2 of 3 — the paused node couldn't vote)
5. It became leader for the new term

**The term is a logical clock.** It only increases, and it is what makes the old leader's authority expire.

## ⭐ The point of A5

The old leader woke up **believing it was still leader**. It learned otherwise only when it saw a higher
term — at which point Raft requires it to step down.

**But look at the window.** Between resuming and hearing that higher term, it genuinely believed it led.
If it had been holding a **lock** and had gone straight to writing to your database, nothing in Raft would
have stopped it.

> **Raft protects its own log. It does not protect your resource.** That's exactly why experiment B exists.

## Try this — lose the majority

```bash
docker pause p4-etcd2 p4-etcd3
docker exec p4-etcd1 etcdctl put /demo/x y     # hangs, then fails
docker unpause p4-etcd2 p4-etcd3
```

**etcd is CP**: with no majority it refuses to serve rather than risk divergence. Cassandra at `CL=ONE`
would have kept accepting writes ([Phase 3F lab](../../phase-03-databases/lab/lab-d-cassandra/)). **Same
partition, opposite choice — and that's why "CP vs AP" is an incomplete description of a database**
([02](../notes/02-cap-and-pacelc.md)).

---

# B · Fencing tokens ⭐

The same sequence run twice. `resource/server.js` is a tiny service that stores a value and the highest token
it has accepted — **the thing a lock is supposed to protect.**

```
1. Client A acquires the lock. Lease TTL 3s. Token = etcd revision.
2. A STALLS (GC pause).  ⭐ A does not know it has stalled.
3. A's lease expires. The lock is free. A still thinks it holds it.
4. Client B acquires the lock. Higher token.
5. B writes.  ✅
6. A WAKES UP and writes with its stale token.
```

## The results

**Scenario 1 — resource ignores tokens:**
```
client-A   token=12   value=written-by-A        -> ✅ ACCEPTED
client-B   token=14   value=written-by-B        -> ✅ ACCEPTED
client-A   token=12   value=written-by-A-LATE   -> ✅ ACCEPTED
final stored value: written-by-A-LATE
```
❌ **B's data was destroyed by a client that lost the lock seconds earlier.** Mutual exclusion violated —
and **the lock service was never wrong.** Both clients behaved correctly.

**Scenario 2 — resource enforces tokens:**
```
client-A   token=15   value=written-by-A        -> ✅ ACCEPTED
client-B   token=17   value=written-by-B        -> ✅ ACCEPTED
client-A   token=15   value=written-by-A-LATE   -> ❌ REJECTED (fenced)
final stored value: written-by-B
```
✅ Identical sequence. One difference: **the resource remembers the highest token it has accepted.**

## ⭐ The two insights

> **1 · The token is enforced by the RESOURCE — not the lock service, not the client.**
> A client that wrongly believes it holds the lock can do no damage, because the thing it writes to refuses
> to listen to it.
>
> **2 · You cannot fix this with a better lock service.** No lock service can stop a client stalling
> *after* acquiring and *before* writing — a lock only tells you what was true **at the moment you asked**.
> You can't close that window. You can only make the stale write **harmless**.

## Where the token comes from

| System | Token |
|---|---|
| **etcd** | The key's **revision** — a cluster-wide monotonic counter. Free. |
| **ZooKeeper** | znode **zxid** / version |
| **Raft** | The **term** |
| **Postgres** | A sequence, or an optimistic-concurrency `version` column |
| **Redis** | ⚠️ **Nothing native** — the heart of the Redlock critique ([08](../notes/08-coordination-services-and-fencing.md)) |

## Try this

| Try | Expect |
|---|---|
| Give A a 30 s lease | A keeps the lock — correct. **TTL is a safety/liveness trade**: short = fast recovery but false expiry; long = safer but a dead holder blocks longer. |
| `etcdctl lease keep-alive <id>` | Watch a lease being renewed |
| `etcdctl lock mylock -- echo held` | etcd's built-in lock, done properly |

```bash
docker compose down -v
```
