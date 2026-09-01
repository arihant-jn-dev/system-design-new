# 10 · Multi-AZ Deployment

> **Why this exists:** multi-AZ is the *cheap* availability win and the default for anything production.
> Multi-**region** is a different, much more expensive conversation (Phase 7). Knowing where that line is —
> and refusing to cross it without a reason — is the senior part.

---

## Reference

### The hierarchy

| Level | Is | Isolation | Latency between |
|---|---|---|---|
| **Rack** | A cabinet of machines | Shared power, switch | µs |
| **Availability Zone (AZ)** | **One or more physically distinct datacentres** | **Independent power, cooling, network** | **< 1–2 ms** within a region |
| **Region** | A geographic area containing 3+ AZs | Fully independent | **10–150 ms** between regions |

**The AZ is the unit of failure isolation** cloud providers give you. Two AZs in the same region are separate
buildings with separate power and network, close enough for **synchronous replication** (sub-2 ms).

**That last point is the whole design consequence:** AZs are far enough apart to fail independently, and close
enough that you can replicate synchronously without a latency penalty. Regions are not — which is why
cross-region synchronous writes are usually the wrong answer.

### What each level buys and costs

| Deployment | Survives | Cost | Complexity |
|---|---|---|---|
| **Single AZ** | Instance failure only | 1× | Trivial |
| **Multi-AZ (2–3 AZs, one region)** | **AZ outage** — power, cooling, network, flood | ~1.1–1.3× (cross-AZ traffic + idle capacity) | **Low. This is the default.** |
| **Multi-region active-passive** | Regional outage | ~1.5–2× | High — replication, failover runbooks, drift |
| **Multi-region active-active** | Regional outage, with no failover step | ~2×+ | **Very high** — conflict resolution, data residency, split brain |

> **The line to hold:** *"Multi-AZ is the default and it's cheap. Multi-region needs a **business** reason —
> a regulatory data-residency requirement, a latency SLA for users on another continent, or an RTO that a
> regional outage would blow. Without one of those, it roughly doubles cost and complexity to defend against
> something that happens maybe once every few years."*
>
> Being willing to say "no" to multi-region is a stronger signal than describing how to build it.

### How to actually deploy multi-AZ

```
                    Region
   ┌─────────────┬─────────────┬─────────────┐
   │    AZ-a     │    AZ-b     │    AZ-c     │
   ├─────────────┼─────────────┼─────────────┤
   │  app × 2    │  app × 2    │  app × 2    │   ← stateless: spread evenly
   │  DB primary │ DB standby  │  DB replica │   ← sync replica in another AZ
   │  cache node │ cache node  │ cache node  │
   └─────────────┴─────────────┴─────────────┘
              ▲
        Load balancer (itself multi-AZ)
```

**The rules:**

1. **Spread stateless instances evenly** across ≥ 2 AZs, ideally 3
2. **Provision for N-1** — if one AZ dies you lose 1/3 of capacity, so run at ≤ 66% or you brown out at
   exactly the moment you're already degraded
3. **The load balancer must be multi-AZ too** (cloud LBs are by default). A single-AZ LB in front of a
   multi-AZ fleet is a pointless SPOF — and it happens.
4. **Databases: synchronous standby in a different AZ.** Sub-2 ms makes this cheap. This is what RDS Multi-AZ
   is.
5. **Prefer 3 AZs over 2.** With 2 AZs, losing one loses 50% of capacity — and any quorum-based system
   (etcd, ZooKeeper, Kafka) **cannot form a majority** with only half its nodes. Quorum systems need 3.

> **The quorum point is the strongest technical argument for three AZs**, and it's worth stating explicitly:
> 3 AZs let a majority survive one AZ loss; 2 AZs cannot.

### The costs people forget

| Cost | Detail |
|---|---|
| **Cross-AZ data transfer** | ~$0.01–0.02/GB **each way**. Chatty services across AZs generate a continuous bill ([Phase 0 note 11](../../phase-00-foundations/notes/11-cost-dimensions.md)). |
| **Idle capacity** | N-1 provisioning means paying for headroom you use only during a failure |
| **Cross-AZ latency** | ~1–2 ms per hop. Usually irrelevant; occasionally matters on a long call chain. |
| **Zone-aware routing complexity** | Keeping traffic in-AZ saves money and latency — but complicates failover |

**Topology-aware / zone-aware routing** is the optimisation: prefer a backend in your own AZ, fall back
across AZs only if the local ones are unhealthy. Saves cross-AZ cost and latency while preserving failover.
Envoy, Istio and Kubernetes (`topologyAwareRouting`) all support it. **The trap:** if it's too sticky, you
lose the load-balancing benefit and one AZ's backends can be overwhelmed by that AZ's traffic.

### Correlated failure — AZs are less independent than they look

The redundancy math ([Phase 0 note 05](../../phase-00-foundations/notes/05-availability-vs-durability.md))
assumes independence. Things that are **shared across AZs and therefore correlated:**

| Shared thing | Why it defeats multi-AZ |
|---|---|
| **The control plane** | The regional API (EC2/EKS/IAM) is region-wide. If you can't *launch instances*, multi-AZ doesn't save you. **Historically the actual cause of major cloud outages.** |
| **Your deployment pipeline** | A bad release goes to all AZs |
| **Config / feature flags** | One bad flag, every AZ |
| **A regional service** (S3, DynamoDB, a shared queue) | Regional, not zonal |
| **DNS** | Region- or global-scope |
| **Your own shared dependency** | An auth service, even if multi-AZ, is one logical system |

> **The senior observation:** *"Multi-AZ protects against infrastructure failure, not against **change**. Most
> outages come from deploys and config, which propagate to every AZ simultaneously. So multi-AZ needs to be
> paired with canary deploys and fast rollback — otherwise I've defended against the rarer cause and left the
> common one wide open."*
>
> That connects directly to [Phase 0 note 06](../../phase-00-foundations/notes/06-reliability-fault-tolerance-resilience.md):
> **most outages are caused by change, not hardware.**

### Blast radius and cells (preview of Phase 7)

The direction this leads: **cell-based architecture.** Rather than one big multi-AZ deployment, run many
independent "cells," each a complete stack serving a subset of users. A failure affects one cell — say 5% of
users — not everyone. **Shuffle sharding** goes further, assigning each customer a random *combination* of
cells so that no two customers share the same failure set.

You don't need this at Phase 2. Knowing the term and the direction is enough. → Phase 7.

---

## In your own words

**What is an AZ, and what makes it the right unit of failure isolation?**

>

**Why does the sub-2 ms latency between AZs matter so much for database design?**

>

**Why prefer 3 AZs over 2? Give the capacity reason and the quorum reason.**

>

**What does N-1 provisioning mean, and what happens if you skip it?**

>

**Name four things shared across AZs that make their failures correlated.**

>

**"Multi-AZ protects against infrastructure failure, not change." Explain, and say what you'd pair it with.**

>

**When would you actually justify multi-region? Give a business reason, not a technical one.**

>

---

## Links

- Availability math and correlated failure → [Phase 0 note 05](../../phase-00-foundations/notes/05-availability-vs-durability.md)
- Change as the dominant outage cause → [Phase 0 note 06](../../phase-00-foundations/notes/06-reliability-fault-tolerance-resilience.md)
- Cross-AZ egress cost → [Phase 0 note 11](../../phase-00-foundations/notes/11-cost-dimensions.md)
- Replication and synchronous standbys → Phase 3C
- **Multi-region, RPO/RTO, cells, shuffle sharding** → Phase 7
