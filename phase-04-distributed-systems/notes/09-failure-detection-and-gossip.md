# 04·09 · Failure Detection & Gossip

> **Why this exists:** every distributed system must answer *"is that node alive?"* — and from
> [note 01](01-fallacies-and-failure-models.md) you know that question is **undecidable**. Failure detection
> is the engineering compromise, and its tuning knob is a direct availability trade.

---

## Reference

### Heartbeats and the timeout problem

```
node A --heartbeat--> node B     every T ms
B suspects A dead if no heartbeat for K × T
```

**The timeout is a guess, and there is no correct value:**

| Timeout | Consequence |
|---|---|
| **Too short** | ⚠️ **False positives.** A GC pause or network blip triggers a failover — and failovers are risky, so you've *reduced* availability while trying to increase it. |
| **Too long** | Slow detection = longer outage before recovery |

**Typical values:** etcd election timeout 1000 ms (the lab) · Cassandra phi threshold ~8 · k8s node
`--node-monitor-grace-period` 40 s.

> **The uncomfortable truth from [3c-04](../../phase-03-databases/notes/3c-04-failover.md): automatic
> failover has caused more outages than it has prevented at many companies.** A spurious failover on a
> healthy system is a self-inflicted incident.

### Phi-accrual failure detection ⭐

**The insight: don't output a boolean. Output a *suspicion level*.**

Instead of "alive/dead," track the **distribution of recent heartbeat inter-arrival times** and compute
`φ = -log₁₀(P(heartbeat is later than now))`.

```
φ = 1  ->  ~10% chance we're wrong to suspect
φ = 2  ->  ~1%
φ = 8  ->  ~0.000001%   ← Cassandra's default threshold
```

**Why this is better than a fixed timeout:**
- **It adapts.** On a slow or jittery network the observed distribution widens, so the detector automatically
  becomes more patient — no manual retuning per environment.
- **Different actions can use different thresholds.** Stop routing new requests at φ=3; trigger a failover at
  φ=8.
- It converts a binary guess into a **tunable confidence level**.

**Used by Cassandra, Akka, and several others.** Worth naming — it's a concrete, elegant answer to "how would
you detect failure?" that goes beyond "set a timeout."

### Failure detection topologies

| Approach | How | Problem |
|---|---|---|
| **Centralised** | A monitor pings everyone | The monitor is a SPOF and a bottleneck |
| **All-to-all** | Everyone pings everyone | **O(N²) messages** — dies above a few hundred nodes |
| ⭐ **Gossip** | Each node pings a few random peers and shares what it has learned | **O(N log N)**; scales to thousands |

### Gossip (epidemic protocols)

**Each node periodically picks a few random peers and exchanges state. Information spreads like an
infection.**

```
round 1:  1 node knows
round 2:  ~3 know
round 3:  ~9 know
...
converges in O(log N) rounds
```

| ✅ | ❌ |
|---|---|
| **Scales** — no coordinator, no SPOF | **Eventually consistent** — no instant global view |
| Robust to node/message loss | Redundant messages |
| Self-healing; membership is emergent | ⚠️ **Not consensus** — cannot elect a leader or hold a lock |
| Constant per-node load regardless of N | Detection is slower than direct heartbeats |

> ⭐ **Gossip is NOT consensus.** It propagates information eventually; it does not produce agreement on a
> single value. Cassandra uses gossip for *membership* and consensus (Paxos) only for lightweight
> transactions. **Conflating the two is a common error** — say "gossip for membership, consensus for
> decisions."

### SWIM — the protocol to name

**Scalable Weakly-consistent Infection-style process group Membership.** The refinement most modern systems
use (HashiCorp Serf/Consul, Uber's Ringpop).

**The two ideas:**

**1 · Indirect probing — dramatically fewer false positives**
```
A pings B.  No response.
  ⭐ Instead of declaring B dead, A asks k OTHER nodes to ping B on its behalf.
  If any of them gets a response, B is alive -- the problem was the A→B path.
```
**This distinguishes "B is dead" from "the network between A and B is broken"** — which a simple heartbeat
cannot do, and which is the single biggest source of false failure detection.

**2 · Suspicion mechanism** — a node is marked *suspect* first and broadcast as such. It can **refute** the
suspicion before being declared dead. Failure becomes a small state machine (alive → suspect → dead) rather
than a snap judgement.

**Piggybacking:** membership updates ride on the probe messages themselves, so there's no separate
dissemination traffic.

### Where each is used

| System | Mechanism |
|---|---|
| **etcd / ZooKeeper / Consul (server)** | Direct heartbeats within a small Raft group — N is 3–7, so O(N²) is fine |
| **Cassandra** | Gossip + phi-accrual |
| **Consul (client/agent layer), Serf** | **SWIM** |
| **Kubernetes** | Kubelet → API server heartbeats (`Lease` objects) — centralised, because there *is* a control plane |
| **Kafka** | Broker sessions with the controller |

**The pattern: small clusters use direct heartbeats; large fleets use gossip.** N is the deciding variable.

### Designing with failure detection

- **Suspicion ≠ death.** Take a cheap action on suspicion (stop sending new work) and an expensive one only
  on confirmation (failover). Same idea as outlier ejection vs full removal
  ([Phase 2 note 06](../../phase-02-stateless-scaling/notes/06-lb-operations-and-types.md)).
- **Require a quorum to declare death** in a consensus system — otherwise a partitioned minority may declare
  the majority dead.
- **Fence after declaring death** ([08](08-coordination-services-and-fencing.md)) — the "dead" node may be
  alive and still writing.
- **Alert on flapping.** A node repeatedly suspected and cleared is a gray failure
  ([01](01-fallacies-and-failure-models.md)) and usually worse than a clean crash.

---

## In your own words

**Why is the heartbeat timeout a no-win trade? Give the consequence of each direction.**

>

**Explain phi-accrual. What two things does it give you that a fixed timeout doesn't?**

>

**Why does all-to-all heartbeating stop working, and what replaces it?**

>

**Why is gossip NOT consensus? What is each actually for?**

>

**Describe SWIM's indirect probing. What distinction can it make that a plain heartbeat can't?**

>

**Why should suspicion and death trigger different actions?**

>

---

## Links

- Why you can't tell slow from dead → [01-fallacies-and-failure-models.md](01-fallacies-and-failure-models.md)
- Fencing the "dead" node → [08-coordination-services-and-fencing.md](08-coordination-services-and-fencing.md)
- Health checks and outlier ejection → [Phase 2 notes 05–06](../../phase-02-stateless-scaling/notes/05-health-checks.md)
- Failover risk → [3c-04](../../phase-03-databases/notes/3c-04-failover.md)
- Papers: **SWIM** (2002) · *The φ Accrual Failure Detector* (2004)
