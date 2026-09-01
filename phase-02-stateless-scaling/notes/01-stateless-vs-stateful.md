# 01 · Stateless vs Stateful Services

> **Why this exists:** statelessness is *the* enabler. Every easy thing about scaling the web tier — add a
> node, kill a node, autoscale, deploy without thinking — is downstream of one property: **any request can go
> to any node.** This note is about what that property buys, and precisely what you inherit the moment you
> give it up.

---

## Reference

### The definition — and the nuance

**A stateless service keeps no client-session state between requests.** Everything it needs to handle request
N is either *in* request N or in a shared external store.

**Stateless does not mean "no data."** Your service still reads and writes a database. The distinction is
where the state *lives*:

| | Where session/conversation state lives | Consequence |
|---|---|---|
| **Stateless service** | In the request (token) or a shared store (Redis/DB) | **Any node can serve any request** |
| **Stateful service** | In *that specific node's* memory or disk | **Requests must reach the right node** |

> **The test: if you killed this process right now, would any user-visible state be lost?**
> No → stateless. Yes → stateful.

### What statelessness buys you — all of it comes from one property

| Capability | Why it works |
|---|---|
| **Horizontal scaling** | Add a node to the pool; it can serve immediately. No data movement, no rebalancing. |
| **Trivial load balancing** | Round-robin is *correct*. No routing logic needed. |
| **Failure tolerance** | A node dies → in-flight requests retry elsewhere → nothing is lost |
| **Zero-downtime deploys** | Rolling restart. Drain, replace, repeat. |
| **Autoscaling** | Scale up and **down** freely — terminating a node loses nothing |
| **Spot/preemptible instances** | Can be reclaimed at 2 minutes' notice. **~70% cheaper.** Only viable if stateless. |
| **Simple capacity planning** | Capacity is linear in node count |

**Every one of these is the same property in different clothes: any request can go to any node.**

### What you inherit the moment a node holds state

| Problem | The question it forces |
|---|---|
| **Routing** | Which node has this user's state? Now you need a directory, or sticky routing, or hashing. |
| **Rebalancing** | A node joins or leaves — which state moves where, and who serves requests during the move? |
| **Replication** | The node holding the state dies. Was it replicated? Synchronously? |
| **Consistency** | Two copies of the state. Which is right? |
| **Deploys** | Restarting a node discards its state — or forces a handoff |
| **Scaling down** | You can't just terminate a node; you must migrate its state first |
| **Hot spots** | Load follows *state*, not requests. One popular key = one overloaded node. |

**This is the entire content of Phases 3, 4 and 9.** Which is exactly why the standard playbook is:

> **Push state to the edges.** Keep the service tier stateless and concentrate state in systems built for it
> (Postgres, Redis, S3, Kafka) where these problems are solved *once*, by specialists, rather than
> re-solved badly in your application tier.

### The things that sneak state into a "stateless" service

Most services believed to be stateless have at least one of these. Being able to spot them is the practical
skill:

| Hidden state | Why it breaks statelessness | Fix |
|---|---|---|
| **In-memory session store** | Login lives on one node | Token or shared store (note 02) |
| **In-memory cache** | Not *correctness*-breaking, but a restart = cold cache → thundering herd on the DB | Accept it, but plan for cold start (Phase 5) |
| **Local file uploads** | File is on node 3; the next request hits node 1 | Object storage + presigned URLs |
| **In-process rate-limit counters** | Limits become per-node — 3 nodes = 3× the intended limit | Redis counters (Phase 7) |
| **Scheduled jobs / cron in the app** | Every replica runs the job → N× execution, duplicate emails | Leader election, or an external scheduler (Phase 9) |
| **WebSocket connections** | The connection *is* state pinned to one node | Sticky routing + pub/sub backplane (Phase 9) |
| **In-memory job queues** | Node dies, queued work vanishes | A real broker (Phase 6) |
| **Long-lived local state machines** | Multi-step wizards, upload sessions | Externalise, or use a durable workflow engine (Phase 8) |

> **The cron one is a great interview detail.** "We deployed 3 replicas and every customer got 3 invoice
> emails" is a real, common, and instantly recognisable bug. It shows you've operated a fleet.

### The 12-factor framing

The [12-factor app](https://12factor.net) rules that matter here:

- **Processes are stateless and share-nothing** — persist everything in a backing service
- **Config comes from the environment**, not from files baked into the image
- **Disposability: fast startup, graceful shutdown on SIGTERM** — you must be safe to kill

**"Graceful shutdown on SIGTERM" is the operationally important one** and it's frequently missing:

```
SIGTERM received
  → stop accepting NEW requests
  → tell the load balancer you're going away (fail the health check)
  → finish IN-FLIGHT requests (with a deadline)
  → close connections cleanly
  → exit
```

Without this, every deploy produces a burst of 502s. **You measure exactly this in the lab.**

### When stateful is the right answer

Don't over-apply the rule — reflexively externalising everything has its own cost:

| Case | Why stateful wins |
|---|---|
| **Databases** | That's the job. Don't put a database's state somewhere else. |
| **Caches** | State *is* the value. (Though a cache node dying should be survivable — that's the difference.) |
| **WebSocket/connection tiers** | The TCP connection is inherently pinned. Manage it; don't pretend otherwise. |
| **Stream processors with local state** | Kafka Streams / Flink keep local state stores for speed, backed by a changelog topic for recovery (Phase 6). **The right pattern: local state + durable log.** |
| **Real-time collaborative editing** | Latency demands in-memory documents; back it with an event log |
| **Very hot single-key workloads** | Sometimes one node owning a counter beats coordinating on every increment |

**The pattern in the last three: local state for speed, a durable log for recovery.** That's the grown-up
version of stateful — not "we forgot to externalise it."

---

## In your own words

**What single property does statelessness give you, and how do horizontal scaling, easy deploys, autoscaling and spot instances all follow from it?**

>

**List five things you inherit the moment a node holds state.**

>

**Give three examples of state that sneaks into a supposedly stateless service. Which have you personally hit?**

>

**Why does deploying 3 replicas of a service with an in-app cron job cause a visible bug? What's the fix?**

>

**Write out what a correct SIGTERM handler does, in order. What breaks without one?**

>

**Name a case where stateful is the correct design, and describe the pattern that makes it safe.**

>

---

## Links

- Sessions specifically → [02-session-management.md](02-session-management.md)
- Scaling ladder, vertical vs horizontal → [Phase 0 note 09](../../phase-00-foundations/notes/09-scalability-and-elasticity.md)
- Connection draining on deploy → [06-lb-operations-and-types.md](06-lb-operations-and-types.md)
- Cold cache after restart → Phase 5
- Leader election for singleton jobs → Phase 4 / Phase 9
- WebSocket state at scale → Phase 9
