# 3C·04 · Failover, Split Brain & Fencing

> **Why this exists:** failover is where replication gets genuinely hard, and **split brain** is one of the
> highest-signal topics in the roadmap. The fencing-token answer reappears in Phase 4 (distributed locks) —
> learn it properly once here.

---

## Reference

### The failover sequence

```
1. DETECT     the leader is dead                       ← the hard part
2. ELECT      a new leader (most caught-up replica)
3. PROMOTE    it: stop replay, make it writable
4. REDIRECT   clients and remaining replicas to it
5. FENCE      the old leader so it can never write again   ← the part people skip
```

**Every single step has a way to go wrong.**

### Step 1 — detection is the hard part

**You cannot distinguish a slow node from a dead one**
([Phase 0 note 06](../../phase-00-foundations/notes/06-reliability-fault-tolerance-resilience.md)).
So detection is always a **timeout**, and it's always a guess:

| Timeout | Consequence |
|---|---|
| **Too short** | **Unnecessary failovers.** A GC pause or network blip triggers one — and failovers are risky, so you've *reduced* availability while trying to increase it. |
| **Too long** | Longer outage before recovery |

**Typical: 10–30 seconds.** There is no correct value, only a trade.

> **The uncomfortable truth worth stating: automatic failover has caused more outages than it has prevented
> at many companies.** A spurious failover on a healthy system is a self-inflicted incident.

### Automatic vs manual

| | **Automatic** | **Manual** |
|---|---|---|
| Recovery time | Seconds | **Minutes to hours** (paging a human) |
| False positives | ⚠️ Real risk | None |
| 3 a.m. | Handles itself | Someone gets woken |
| Complexity | Needs consensus (etcd/ZooKeeper) or a managed service | A runbook |
| Split brain risk | **Higher** | Lower |

**The mature position:** automatic failover where the tooling is proven (RDS Multi-AZ, Patroni + etcd,
managed services); manual with a **well-tested runbook** where you'd be building it yourself. And either way,
**test it** — an untested failover procedure is a hypothesis, not a plan.

### Step 5 — split brain, and why fencing matters

**Split brain: two nodes both believe they are the leader, and both accept writes.**

**The classic sequence:**

```
1. The leader is not dead — it's UNREACHABLE (network partition, or a long GC pause)
2. The system decides it's dead and promotes a replica
3. Clients on the other side of the partition are STILL TALKING TO THE OLD LEADER
4. Both accept writes. The datasets DIVERGE.
5. The partition heals. Now what?
   → conflicting rows, duplicate primary keys, two versions of the truth
   → often unresolvable automatically; someone reconciles by hand
```

**The GC-pause version is the one people miss:** the old leader was never partitioned at all. It was paused
for 40 seconds, and when it woke up it had **no idea time had passed** — so it happily continued writing.

**Preventing split brain:**

| Mechanism | How |
|---|---|
| ⭐ **Fencing tokens** | See below — the general answer |
| **Quorum / majority** | Only the side with a majority may elect a leader. A minority partition **cannot** promote. (Raft — Phase 4.) |
| **STONITH** ("shoot the other node in the head") | Forcibly power off / network-isolate the old leader. Brutal and effective. |
| **Leases** | Leadership expires unless renewed. The old leader **stops accepting writes on its own** when its lease lapses. |
| Storage-level fencing | Revoke the old leader's access to shared storage |

### Fencing tokens — the mechanism to know cold

**Every leadership grant carries a monotonically increasing number. Downstream systems reject anything
carrying an older token.**

```
Leader A holds token 33.
  A pauses (GC).
  B is elected, gets token 34.
  B writes with token 34.       storage: "current token = 34" ✅
  A wakes up, writes token 33.  storage: "33 < 34, REJECTED" ✅ ← A is fenced
```

**The key insight: the *resource* (storage, the database, the file system) enforces it, not the leader.**
A node that thinks it's the leader can't do damage if everything it talks to refuses stale tokens.

**Without fencing, the same sequence corrupts data:**
```
A pauses → B promoted → B writes → A wakes and writes stale data over B's ✅ accepted → CORRUPTION
```

Postgres calls its version the **timeline ID** — incremented on every promotion. A replica following the old
timeline will refuse to replicate from a server on a new one, which is why "the old primary won't rejoin after
failover" is a normal, *correct* behaviour rather than a bug.

> **This exact mechanism reappears as the answer to "why is a distributed lock without fencing unsafe?"** in
> Phase 4. Same problem, same fix.

### Data loss on failover — quantify it

**With async replication, everything the leader acked but hadn't shipped is gone.**

```
RPO (Recovery Point Objective) = how much data you can lose
              ≈ replication lag at the moment of failure

RTO (Recovery Time Objective)  = how long until you're serving again
              ≈ detection timeout + promotion + client redirect
```

| Setup | RPO | RTO |
|---|---|---|
| Async replica | **= lag (ms to minutes)** | 10–60 s |
| Sync replica (quorum) | **0** | 10–60 s |
| Backup restore only | Hours (last backup) | Hours |

> **Say these as numbers:** *"Async streaming gives an RPO of about our replication lag — normally under a
> second, but seconds to minutes under write bursts — and an RTO of roughly 30 seconds. If the business
> can't lose any committed transaction, we need a synchronous quorum replica and I'd budget an extra
> millisecond per commit for it."*

**The nasty second-order problem:** discarded writes are gone from the database but **may already be
reflected in other systems** — a Redis cache, a Kafka topic, an email that was sent, a payment captured at
Stripe. Failover creates **cross-system inconsistency**, not just data loss. That's an excellent thing to
raise unprompted.

### What else goes wrong after promotion

| Problem | Detail |
|---|---|
| **Auto-increment / sequence collisions** | The new leader's sequence may be behind, reissuing IDs the old leader already used. **GitHub's 2012 outage.** |
| **Cold cache** | The new leader has an empty buffer cache → slow → may fall over under full load ([Phase 2 note 09](../../phase-02-stateless-scaling/notes/09-autoscaling.md)) |
| Other replicas must re-point | And may need rebuilding if timelines diverged |
| Connection storms | Every client reconnects at once — **needs jitter** ([Phase 1 note 11](../../phase-01-networking/notes/11-timeouts-retries-backoff.md)) |
| **Old leader rejoining** | Must be rewound (`pg_rewind`) or rebuilt — never just restarted |
| DNS/discovery propagation | ([Phase 1 note 03](../../phase-01-networking/notes/03-dns.md) — DNS is a bad failover mechanism) |

### The tooling

| Tool | Notes |
|---|---|
| **Patroni** (Postgres) | The standard. Uses etcd/Consul for **consensus-backed** leader election. |
| repmgr, pg_auto_failover | Alternatives |
| **RDS Multi-AZ / Cloud SQL HA** | Managed. **Usually the right answer** — you're not better at this than AWS. |
| Orchestrator (MySQL) | Widely used |

> **"I'd use a managed service or Patroni rather than write failover logic"** is a strong answer. Rolling
> your own leader election is a classic way to build a split-brain generator.

---

## In your own words

**List the five failover steps. Which is hardest and why?**

>

**Why is the detection timeout a no-win trade? Give the consequence of each direction.**

>

**Walk through split brain, including the GC-pause version. Why is that one especially sneaky?**

>

**Explain fencing tokens with a concrete sequence. Who enforces the token, and why does that matter?**

>

**Define RPO and RTO, and give numbers for async vs sync replication.**

>

**What's the second-order data-loss problem beyond the database itself?**

>

**Name three things that break AFTER a successful promotion.**

>

---

## Links

- Why you can't tell slow from dead → [Phase 0 note 06](../../phase-00-foundations/notes/06-reliability-fault-tolerance-resilience.md)
- **Fencing tokens for distributed locks; Raft; quorums** → **Phase 4**
- RPO/RTO, multi-region DR → Phase 7
- **Fail over yourself and measure the loss window** → [`../lab/lab-c-replication/`](../lab/lab-c-replication/)
- **DDIA ch. 5**, "Handling Node Outages"
