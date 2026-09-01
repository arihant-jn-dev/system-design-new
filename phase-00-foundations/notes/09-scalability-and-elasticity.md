# 09 · Scalability & Elasticity

> **Why this exists:** "we'll scale horizontally" is the most reflexive sentence in system design interviews
> and it's frequently the wrong call. Knowing *when vertical is right* — and being willing to say so — is a
> stronger signal than knowing how to shard.

---

## Reference

### Definitions

| Term | Meaning |
|---|---|
| **Scalability** | The ability to handle growth by adding resources. Not "is it fast" — "does adding resources help, and how much?" |
| **Vertical scaling (scale up)** | Bigger machine — more CPU, RAM, faster disk |
| **Horizontal scaling (scale out)** | More machines |
| **Elasticity** | Scaling **automatically and bidirectionally** with demand. *Includes scaling **down*** — which is where the cost savings live and where most implementations quietly fail. |

**Scalable ≠ fast.** A system that handles 1 M QPS at 2 s latency is scalable and slow. A system doing
100 QPS at 1 ms is fast and unscalable. Different axes; say which one you're solving for.

### Vertical vs horizontal

| | Vertical (scale up) | Horizontal (scale out) |
|---|---|---|
| **How** | Bigger box | More boxes |
| **Complexity** | **Near zero** — no code changes | High — distribution, partitioning, consistency, ops |
| **Ceiling** | Hard limit (biggest instance available) | Effectively unlimited |
| **Failure mode** | **SPOF** — one box, one blast radius | Redundant by construction |
| **Cost curve** | Superlinear — top-end hardware costs a premium | Roughly linear, on commodity hardware |
| **Downtime to scale** | Usually a restart | Zero (add nodes to the pool) |
| **Best for** | **Databases**, anything stateful, anything with hard consistency needs | **Stateless services**, caches, web tiers |

### When vertical is genuinely the right call

Be willing to say this — reflexive horizontal scaling is a mid-level tell.

- **You're nowhere near the ceiling.** A modern box is 128+ cores, 1–2 TB RAM, 30 TB NVMe. Most companies
  never outgrow one database server. "Scale to 100 M users" often means "buy a bigger box and add read replicas."
- **The workload is stateful and hates distribution** — a relational DB with joins and transactions. Sharding
  a database is a permanent, painful, one-way decision (Phase 3D). Delay it as long as you can.
- **Team size.** A 6-person team running a distributed system spends its time on the distributed system, not
  on the product. Horizontal scaling has an *ops* cost, not just an engineering one.
- **You want to buy time.** Vertical scaling is the cheapest way to buy 12 months of runway to build the
  right thing properly.

> **The interview move:** *"Before sharding, I'd exhaust vertical scaling and read replicas. At 15 K write
> QPS and 2 TB, that's comfortably one large Postgres instance — sharding here would be complexity I can't
> justify. I'd revisit it at roughly 10× this, and the trigger would be write throughput or dataset size
> exceeding a single node, whichever comes first."*
>
> Naming a **trigger** for the future decision is what turns "not yet" into a considered plan rather than
> avoidance.

### Why statelessness is the enabler

Horizontal scaling works trivially for stateless services because **any request can go to any node**. No
routing logic, no data movement, no rebalancing, and a dead node loses nothing.

The moment a node holds state (a session, a cache, a shard of data, a WebSocket connection), you inherit:
routing (which node?), rebalancing (what happens when nodes change?), replication (what if it dies?), and
consistency (which copy is right?).

**So the standard playbook is: push state to the edges.** Keep the service tier stateless, and concentrate
state in systems purpose-built for it (DB, Redis, object store) where you solve these problems *once*.

→ Phase 2 covers session handling; Phase 3 covers the state itself.

### Amdahl's & Universal Scalability Law — why scaling stops working

**Amdahl's Law:** if a fraction `s` of the work is serial, max speedup is `1/s` no matter how many nodes.
5% serial → **20× is your hard ceiling**, even with infinite machines.

**Universal Scalability Law (USL)** adds the part that actually bites: *coherency cost* — nodes coordinating
with each other. Coordination grows as **N²**, so beyond some N, **adding nodes makes throughput go down.**

```
throughput
   │        ╭──╮
   │      ╭─╯  ╰──╮        ← retrograde: more nodes, LESS throughput
   │    ╭─╯       ╰────
   │  ╭─╯
   │╭─╯  ← linear (the fantasy)
   └────────────────────── nodes
```

**Practical consequences:**
- A shared bottleneck (one DB, one lock, one coordinator) caps everything downstream of it.
- More replicas that must agree = slower, not faster. Consensus groups are usually 3 or 5 nodes, **never 100** — and this is why.
- **The correct question is never "how do we add nodes?" It's "what is the serial part, and can we remove it?"**

### Elasticity — and why it's harder than it sounds

| Type | Trigger | Good for | Weakness |
|---|---|---|---|
| **Reactive** | Metric crosses a threshold (CPU > 70%) | General purpose | Always **late** — it reacts after users are already suffering |
| **Scheduled** | Time of day / known events | Predictable diurnal traffic, sales | Blind to surprises |
| **Predictive** | Forecast from history / ML | Large, regular patterns | Complex; wrong when the pattern breaks |

**The problems nobody mentions until they're on fire:**

1. **Cold start lag.** Provision + boot + warm JIT + fill cache + register with LB = 2–10 minutes. Your
   traffic spike lasted 90 seconds. You scaled up in time to handle traffic that already left.
2. **Autoscaling can make overload worse.** New instances start with cold caches → they're slow → they hammer
   the database → the database slows → *all* instances get slower → the autoscaler adds more instances → the
   database dies. This is a **death spiral**, and it's a well-known failure mode. (Phase 7.)
3. **Scaling down is where the money is, and where the bugs are.** Terminating an instance mid-request, or
   below the connection-draining window, turns cost savings into 5xx errors.
4. **Downstream doesn't scale with you.** Scaling the stateless tier 10× just means 10× the connections to a
   database that did not scale. **You often scale yourself into a different bottleneck.**
5. **Warm pools / over-provisioning** are the honest mitigation: run 20–30% headroom so you're never on the
   knee of the latency curve (note 03) while waiting for capacity.

### The scaling ladder — the order you actually do things

Roughly the order to propose in an interview. Each step is cheaper than the next.

```
1. Measure. Find the actual bottleneck.            ← skipping this is the classic error
2. Optimise (indexes, N+1 queries, payload size)   ← often 10× for free
3. Vertical scale                                  ← boring, effective, buys a year
4. Add caching                                     ← usually the biggest single win for read-heavy
5. Read replicas                                   ← splits read load off the primary
6. Horizontal scale the stateless tier + LB
7. CDN / edge for static and cacheable content
8. Async: move non-critical work off the request path (queues)
9. Split services by bounded context (only if the team needs it)
10. Shard the database                             ← last, and permanent
```

**State the ladder, then say where the current problem sits on it.** Jumping to step 10 when the answer is
step 4 is the most common failure in these interviews.

---

## In your own words

**Vertical vs horizontal — give one scenario where each is clearly correct.**

>

**Argue for vertical scaling in an interview. Write the actual sentence, including the trigger to revisit.**

>

**Why does statelessness make horizontal scaling easy? What exactly do you inherit when a node holds state?**

>

**Explain Amdahl's Law in one sentence, and what it means for how many nodes you should run consensus on.**

>

**Describe the autoscaling death spiral in your own words.**

>

**Your service is slow. Walk the scaling ladder — what do you do first, and what would make you jump ahead?**

>

---

## Links

- The latency knee and why headroom matters → [03-latency-vs-throughput.md](03-latency-vs-throughput.md)
- Load balancing, health checks, autoscaling in depth → Phase 2
- Sharding, consistent hashing, resharding without downtime → Phase 3D
- Death spirals, metastable failure, load shedding → Phase 7
