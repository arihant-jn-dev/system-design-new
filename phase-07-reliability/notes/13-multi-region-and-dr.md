# 07·13 · Multi-Region & Disaster Recovery

> **Why this exists:** multi-region roughly **doubles cost and complexity**, and the senior skill is knowing
> when it's genuinely required — plus **RPO/RTO as numbers**, and why **backups and replication are not the
> same thing**.

---

## Reference

### The ladder

| Level | Survives | Cost | Complexity |
|---|---|---|---|
| Single AZ | Instance failure | 1× | Trivial |
| ⭐ **Multi-AZ** | **AZ outage** (power, cooling, network, flood) | ~1.1–1.3× | ⭐ **Low — the default** |
| Multi-region **active-passive** | Regional outage | ~1.5–2× | High |
| Multi-region **active-active** | Regional outage, no failover step | ~2×+ | ⚠️ **Very high** |

> ⭐ **Hold this line: multi-AZ is the default and it's cheap. Multi-region needs a BUSINESS reason** —
> regulatory data residency, a latency SLA for users on another continent, or an RTO a regional outage would
> blow. **Without one, you've doubled cost and complexity to defend against something that happens every few
> years.**
>
> **Being willing to say no to multi-region is a stronger signal than describing how to build it.**

### ⭐ RPO and RTO — as numbers

```
RPO (Recovery POINT Objective)  = how much DATA you can lose      ("15 minutes of writes")
RTO (Recovery TIME Objective)   = how long until you're SERVING   ("30 minutes")
```

| Setup | RPO | RTO |
|---|---|---|
| Backups only (nightly) | ⚠️ **Up to 24 h** | Hours |
| Backups + WAL archive (PITR) | Minutes | ⭐ **Hours** — restore is slow |
| **Async cross-region replica** | ⭐ **= replication lag** (seconds → minutes under load) | 5–30 min |
| **Sync replica** (same region) | **0** | Seconds–minutes |
| Active-active | 0 (for its region) | ⭐ **Near zero** |

> ⭐ **State these as numbers, always.** *"Async cross-region gives an RPO of roughly our replication lag —
> normally under a second, but seconds to minutes under write bursts — and an RTO of about 15 minutes
> dominated by DNS and connection re-establishment."*
>
> **You measured the RPO directly in Phase 3C: a lagging replica lost 10,862 acknowledged commits — 71%.**

### ⚠️ Backups are not replication

| | **Replication** | **Backups** |
|---|---|---|
| Protects against | Hardware / AZ failure | ⭐ **Human error, bugs, ransomware, corruption** |
| Propagates a bad `DELETE`? | ⚠️ **Yes, instantly** | No — point-in-time recovery |
| Restore time | Seconds (failover) | Hours |

> ⭐ **"We have three replicas" is not a backup strategy.** Replication faithfully copies your `DROP TABLE`
> to every replica in milliseconds. **The most likely thing you'll need to recover from is you.**

⭐ **And: an untested backup is not a backup.** The restore path is what you actually need and the part nobody
exercises. **Test restores on a schedule and measure how long they take** — that number *is* your RTO, and
it's usually much worse than people assume.

### Active-passive vs active-active

| | **Active-passive** | **Active-active** |
|---|---|---|
| Standby | Idle (or serving reads) | ⭐ Serving traffic |
| Failover | ⚠️ **A procedure — must be practised** | None needed |
| Wasted capacity | 50% | ~0 |
| ⭐ **Write conflicts** | None — one writer | ⚠️ **The hard problem** |
| Complexity | Moderate | Very high |

⭐ **The middle ground worth naming: active-active with PARTITIONED writes.** Each region owns a subset of the
data (by user home region), so both regions serve traffic but **no key is written in two places** — you get
utilisation without conflict resolution. **This is what most "active-active" systems actually do**, and
saying so is a strong signal.

**True multi-master needs conflict resolution** — LWW (loses data), version vectors, CRDTs
([Phase 4 note 10](../../phase-04-distributed-systems/notes/10-crdts-and-collaborative-state.md)).

### The costs people forget

| Cost | |
|---|---|
| ⭐ **Cross-region egress**, continuously, forever | Every replicated byte ([Phase 0 note 11](../../phase-00-foundations/notes/11-cost-dimensions.md)) |
| **Cross-region latency** | 50–150 ms — ⭐ synchronous cross-region writes are usually the wrong answer |
| **Replication lag** | Bigger and spikier than in-region |
| **Data residency** | GDPR, India's localisation — sometimes it *forbids* replication |
| ⭐ **Operational load** | Two of everything to deploy, monitor, patch, debug |
| **Failover practice** | ⭐ An untested failover doesn't work. **Schedule real drills.** |

### Global traffic routing

⭐ **From [Phase 1 note 03](../../phase-01-networking/notes/03-dns.md): DNS is a bad failover mechanism** —
TTL is a hint, resolvers ignore it, and open connections never re-resolve, so your RTO is **unbounded**.

**Use instead:** ⭐ **anycast** or a global load balancer (AWS Global Accelerator, Cloudflare) with
health-checked endpoints behind one stable IP. **Failover in seconds, with no client-side change.**

### ⭐ Cells and blast radius — the better answer

**Rather than one big multi-region system, run many independent CELLS, each a complete stack serving a
subset of users.**

```
cell 1: users A-F   [LB, services, DB, cache]     ← fully independent
cell 2: users G-M   [LB, services, DB, cache]
cell 3: users N-Z   [LB, services, DB, cache]
```

| Benefit | |
|---|---|
| ⭐ **Blast radius = one cell**, not everyone | A bug takes down 1/N of users |
| **Cells are a deploy unit** | Roll out cell by cell — a canary with real isolation |
| Each cell is small enough to reason about | Testable at real scale |
| Scale by adding cells | Not by making one thing bigger |

⚠️ **Costs:** a routing layer that must be highly available · cross-cell operations are hard · per-cell
overhead · **a poor fit when users must interact across cells** (a social network is harder than a
multi-tenant SaaS).

⭐ **Shuffle sharding** goes further: assign each customer a **random combination** of cells, so no two
customers share the same complete failure set. With 8 cells and 2 per customer there are 28 combinations —
**one bad cell affects a small, non-overlapping fraction of customers.** Elegant, and worth naming.

> ⭐ **The framing: cells convert "everyone is down" into "1/N of users are down."** For most products that's
> a far better investment than multi-region, and considerably cheaper.

---

## In your own words

**Where do you draw the multi-AZ / multi-region line? Give a business reason that justifies crossing it.**

>

**Define RPO and RTO, and give numbers for four setups. Cite your Phase 3C measurement.**

>

**Why is replication not a backup? What's the most likely thing you'll recover from?**

>

**What does an untested backup actually tell you about your RTO?**

>

**What is active-active with partitioned writes, and what does it avoid?**

>

**Why not DNS for failover? What replaces it?**

>

**Explain cells and shuffle sharding. What do they convert an outage into?**

>

---

## Links

- Multi-AZ basics → [Phase 2 note 10](../../phase-02-stateless-scaling/notes/10-multi-az.md)
- ⭐ **You measured RPO** → [Phase 3C lab](../../phase-03-databases/lab/lab-c-replication/)
- Failover, split brain, fencing → [3c-04](../../phase-03-databases/notes/3c-04-failover.md)
- Durability vs availability → [Phase 0 note 05](../../phase-00-foundations/notes/05-availability-vs-durability.md)
- DNS failover → [Phase 1 note 03](../../phase-01-networking/notes/03-dns.md)
- CRDTs for multi-master → [Phase 4 note 10](../../phase-04-distributed-systems/notes/10-crdts-and-collaborative-state.md)
