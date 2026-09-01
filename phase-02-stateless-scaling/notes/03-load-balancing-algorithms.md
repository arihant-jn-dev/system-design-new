# 03 · Load Balancing Algorithms

> **Why this exists:** "add a load balancer" is a box on a diagram. *Which algorithm, and why* is a design
> decision. The roadmap flags **power-of-two-choices** specifically — *"know this one, it's the elegant
> answer"* — and it is: two lines of change, near-optimal result, and almost nobody mentions it.

---

## Reference

### The algorithms

| Algorithm | How | Good for | Weakness |
|---|---|---|---|
| **Round robin** | Next server in rotation | Uniform requests, uniform servers | Ignores load entirely. One slow request and it keeps sending more. |
| **Weighted round robin** | Proportional to capacity | Heterogeneous hardware | Static weights; blind to real-time load |
| **Random** | Pick one at random | Trivially stateless, no coordination | Same blindness as RR; worse variance |
| **Least connections** | Fewest active connections | **Variable request durations** | Needs shared state. **A dead/fast-failing node looks "least loaded"** — see below. |
| **Weighted least connections** | Connections ÷ capacity | Mixed hardware + variable durations | Same |
| **Least response time** | Lowest latency × connections | Latency-sensitive | Reacts to noise; needs good measurement |
| **IP hash / source hash** | Hash(client IP) → server | Cheap stickiness at L4 | **Breaks behind NAT**; rebalances badly on node change |
| **Consistent hashing** | Hash(key) → ring | **Caches, sharded state** | More complex; needs virtual nodes (note 04) |
| **Power of two choices (P2C)** | Pick 2 at random, send to the less loaded | **The general-purpose best answer** | Needs a load signal |

### The default: round robin, and why it's usually fine

For a **stateless** tier with **uniform** request costs, round robin is genuinely good: no coordination, no
state, perfectly even distribution. Don't over-engineer.

**It fails when request costs vary.** If 1% of requests take 100× as long, round robin cheerfully sends a new
request to the node currently grinding through one. Load skews, and RR can't see it.

### The trap in "least connections" — worth knowing

**A broken server is the least loaded server.**

A node that instantly returns `500` has *zero* active connections, so least-connections routes **all** traffic
to it. Same for a node that just started (empty), or one whose connections are being dropped.

This is a real, named failure. Mitigations:
- **Slow start** — ramp new/recovered nodes up gradually (note 06)
- **Passive health checks / outlier ejection** — remove nodes with high error rates (note 05)
- **Don't count failed requests** as "capacity"

> Say this out loud if you propose least-connections: *"with least-connections I'd need outlier ejection,
> because a node returning instant 500s has zero open connections and therefore attracts all the traffic."*

### Power of two choices — the elegant answer

**Pick two backends at random. Send the request to whichever has fewer active connections.**

That's it. Two lines of code.

**Why it works so well** (the "power of two choices" result from randomised load balancing theory):

| Strategy | Max load above average (N servers) |
|---|---|
| Pure random | ~**log N / log log N** — grows with N, and badly |
| **Two random choices** | ~**log log N** — essentially flat |
| Full least-connections | Optimal, but needs global state |

**Going from one random choice to two collapses the imbalance exponentially.** Three choices barely improves
on two — almost all the benefit is in the second sample.

**Why it beats true least-connections in practice** — this is the part that shows real understanding:

1. **No global state.** Each LB samples two nodes locally. With multiple LB instances, true
   least-connections requires them to share state (or each one's view is wrong).
2. **It avoids the herd problem.** With *many* load balancers all using least-connections, they all identify
   the *same* least-loaded node and stampede it simultaneously — then all move to the next one. Randomness in
   P2C breaks that synchronisation. **This is the same thundering-herd/jitter insight as
   [Phase 1 note 11](../../phase-01-networking/notes/11-timeouts-retries-backoff.md).**
3. Cheap: O(1), two samples, no sorting.

**Used by:** Nginx (`random two least_conn`), Envoy (**the default**), HAProxy, Netflix Ribbon, Finagle.

> **The interview line:** *"I'd use power-of-two-choices. Least-connections needs global state and, with
> multiple load balancers, they all stampede the same 'least loaded' node. P2C picks two at random and takes
> the better one — that gets you within log-log-N of optimal with no coordination, and the randomness stops
> the herd. It's Envoy's default for good reason."*

### Choosing — the decision path

```
Stateless tier, uniform requests?           → round robin. Boring, correct.
Variable request durations?                 → P2C (or least-connections + outlier ejection)
Heterogeneous hardware?                      → weighted variants
Routing to a CACHE or SHARD?                 → consistent hashing (note 04)
Need session affinity?                       → cookie-based stickiness, not IP hash
Multiple LBs, high scale?                    → P2C — no shared state needed
```

### Layer matters as much as algorithm

From [Phase 1 note 01](../../phase-01-networking/notes/01-l4-vs-l7.md), the point that bites hardest here:

**L4 balances *connections*. L7 balances *requests*.**

With HTTP/1.1 short connections these are nearly the same. With **HTTP/2 or gRPC**, one client opens **one**
long-lived connection and multiplexes thousands of requests. An L4 balancer assigns that connection once, and
**every algorithm above becomes meaningless** — the "load balancing decision" happened once, at connect time.

> **Consequence to state unprompted:** *"gRPC behind an L4 load balancer isn't really load balanced. I'd need
> an L7 proxy that balances per-request, or client-side load balancing with service discovery."*

### Distribution ≠ balance

A subtle point worth making:

- **Even *request* distribution** is what these algorithms give you.
- **Even *load* distribution** is what you actually want.

If one user's requests cost 100× another's, perfectly even request distribution produces wildly uneven CPU
load. Round-robin at the LB with a hot tenant behind it is still a hot-spot problem. **Load balancing does not
solve hot keys** — that's a partitioning problem (Phase 3D) or a rate-limiting one (Phase 7).

---

## In your own words

**Why is round robin usually fine, and what specific condition makes it fail?**

>

**Explain why a broken server is the "least loaded" server, and what you'd do about it.**

>

**Explain power-of-two-choices and why it beats true least-connections in a multi-LB deployment.**

>

**Why does going from 1 random choice to 2 help so much, but 2 to 3 barely at all?**

>

**Why is gRPC behind an L4 load balancer effectively unbalanced? What's the fix?**

>

**Give an example where request distribution is perfectly even but load is not. What actually fixes it?**

>

---

## Links

- L4 vs L7 (prerequisite) → [Phase 1 note 01](../../phase-01-networking/notes/01-l4-vs-l7.md)
- Consistent hashing in detail → [04-consistent-hashing.md](04-consistent-hashing.md)
- Outlier ejection, slow start, draining → [06-lb-operations-and-types.md](06-lb-operations-and-types.md)
- Health checks feeding these decisions → [05-health-checks.md](05-health-checks.md)
- Hot keys as a partitioning problem → Phase 3D
- Original paper: Mitzenmacher, *The Power of Two Choices in Randomized Load Balancing* (1996)
