# 08·04 · Service Discovery, Mesh & Sidecars

> **Why this exists:** the moment you have N services, "what IP do I call?" becomes a real problem — and the
> answer determines **what lives in infrastructure vs in your code**, which is the interesting part.

---

## Reference

### The problem

Instances are ephemeral: autoscaled, rescheduled, replaced on deploy. **Hardcoded IPs and static config
can't track that.** Discovery = keeping an accurate, live map of *service name → healthy instances*.

### The two shapes

| | ⭐ **Client-side discovery** | ⭐ **Server-side discovery** |
|---|---|---|
| Flow | client queries registry → picks an instance → calls it | client calls a stable address; a LB/proxy picks |
| Load balancing | ⭐ **in the client** | in the proxy |
| Extra hop | ⭐ **none** | one |
| Client complexity | ⚠️ a library, per language | ⭐ **none** |
| Upgrade the LB policy | ⚠️ redeploy every client | ⭐ **change the proxy** |
| Examples | Eureka + Ribbon, gRPC name resolvers | ⭐ **Kubernetes Services**, AWS ALB, nginx |

> ⭐ **Kubernetes gives you server-side discovery for free**: a `Service` is a stable DNS name and virtual
> IP; kube-proxy load-balances to the healthy pods behind it. That's why "how do you do service discovery?"
> is often answered with "we're on Kubernetes" — and that's a legitimate answer, as long as you can say what
> it's actually doing.

### Registration: self vs third-party

| | |
|---|---|
| **Self-registration** | the instance registers itself and heartbeats (Eureka, Consul agent) — simple, but ⚠️ a hung process can keep heartbeating while being useless |
| ⭐ **Third-party registration** | the platform registers it based on **health checks it runs** (Kubernetes endpoints ← readiness probes) — ⭐ **the instance doesn't get a vote** |

⚠️ **Health check quality is the whole game.** A TCP check passes on a process that can't serve. Check
something real — and **distinguish liveness (restart me) from readiness (don't route to me)**; conflating
them turns a slow dependency into a restart loop.

### ⭐ The sidecar pattern

**A second container next to your app, in the same pod/host, sharing its network namespace.** All the app's
inbound and outbound traffic is transparently routed through it.

> ⭐ **Why it exists: to implement cross-cutting network concerns ONCE instead of once per language.**

| In a library | ⭐ In a sidecar |
|---|---|
| Reimplement retries/breakers/mTLS in Java, Go, Python, Node… | ⭐ **written once, in the proxy** |
| Upgrade = redeploy every service | ⭐ **upgrade the sidecar** |
| Polyglot orgs drift | uniform policy |

### The service mesh

**Data plane** (a sidecar proxy — usually Envoy — beside every instance) + **control plane** (Istio, Linkerd
— distributes config and certs). What you get without touching application code:

| Capability | |
|---|---|
| ⭐ **mTLS between all services** | identity + encryption in transit; the strongest single reason to adopt one |
| Retries, timeouts, ⭐ **outlier detection** (a per-host circuit breaker) | [Phase 7 note 03](../../phase-07-reliability/notes/03-circuit-breakers.md) |
| ⭐ **Traffic shifting** — canary, blue/green, mirroring | by *percentage* or *header*, without a deploy |
| **Uniform golden metrics** for every hop | RED metrics you didn't instrument |
| **Authorization policy** — who may call whom | |

⚠️ **Costs, and they're not small:** a proxy per instance (memory, and **+~0.5–2 ms per hop**); a control
plane to run and upgrade; ⭐ **a new and genuinely hard debugging surface** — "is it my app, the sidecar, or
the policy?"; and startup-ordering bugs (app starts before the sidecar is ready and its first calls fail).

> ⭐ **The honest heuristic: a mesh pays for itself at ~20+ services in a polyglot org, or when mTLS
> everywhere is a compliance requirement. Below that it's usually a library and a bit of discipline.**
> **Ambient/sidecar-less meshes** (Istio ambient, per-node proxies) exist specifically to cut the
> per-pod cost.

### ⭐ Infrastructure vs code — the actual question

| ⭐ Belongs in **infrastructure** | ⭐ Belongs in **your code** |
|---|---|
| Discovery, load balancing | **Business logic** (obviously) |
| mTLS, transport auth | ⭐ **Authorization decisions** that depend on domain state |
| Retries of **idempotent** calls, timeouts, outlier ejection | ⭐ **Fallbacks** — only your code knows what a degraded answer *is* |
| Traffic shifting, mirroring | ⭐ **Idempotency keys** and dedup |
| Transport-level observability | **Domain events and business metrics** |
| Rate limiting at the edge | Per-tenant/business-rule limits |

> ⭐ **The line: the platform can handle anything that is true for every service. Anything that needs to
> know what the request MEANS stays in your code.**
>
> ⚠️ **The trap: a mesh retrying a non-idempotent call.** The mesh doesn't know `POST /charge` isn't safe to
> retry. Configure retries per route, and make the endpoint idempotent
> ([11](11-api-evolution-and-contract-testing.md)).
>
> ⚠️ **And a breaker without a fallback is only half the pattern** — the mesh gives you the breaker; **only
> your code can give you the fallback** ([Phase 7 note 06](../../phase-07-reliability/notes/06-graceful-degradation.md)).

### Related: API gateway vs mesh

| | **API gateway** | **Service mesh** |
|---|---|---|
| Traffic | ⭐ **north–south** (outside → in) | ⭐ **east–west** (service → service) |
| Concerns | authn, rate limits, routing, versioning, request shaping | mTLS, retries, discovery, traffic policy |

**You typically want both**, and they're often the same underlying proxy configured differently.

---

## In your own words

**Client-side vs server-side discovery — the trade, and which one Kubernetes gives you.**

>

**⭐ Why is third-party registration safer than self-registration?**

>

**Liveness vs readiness — what bug do you get from conflating them?**

>

**⭐ What problem does the sidecar pattern solve, in one sentence?**

>

**Name four things a mesh gives you for free, and three real costs.**

>

**⭐ When is a mesh worth it? When is it not?**

>

**⭐ State the infrastructure-vs-code line, and give one example on each side.**

>

**⭐ Why can't the mesh own your fallbacks or your retry-safety?**

>

**Gateway vs mesh.**

>

---

## Links

- Proxies, LBs, and the mesh from the traffic side → [Phase 2 note 07](../../phase-02-stateless-scaling/notes/07-proxy-gateway-mesh.md)
- Outlier ejection vs client breakers → [Phase 7 note 03](../../phase-07-reliability/notes/03-circuit-breakers.md)
- Canary and traffic shifting → [Phase 7 note 11](../../phase-07-reliability/notes/11-deployment-safety.md)
- Idempotency, so retries are safe → [11-api-evolution-and-contract-testing.md](11-api-evolution-and-contract-testing.md)
- What you're routing *between* → [02-service-boundaries.md](02-service-boundaries.md)
