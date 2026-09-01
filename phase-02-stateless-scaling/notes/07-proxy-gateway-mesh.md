# 07 · Reverse Proxy vs API Gateway vs Service Mesh

> **Why this exists:** these three overlap enough that people use the words interchangeably, then draw three
> boxes without being able to say what each *owns*. The roadmap also flags a specific anti-pattern:
> **business logic in the gateway.**

---

## Reference

### The three, and what each legitimately owns

| | **Reverse proxy** | **API gateway** | **Service mesh** |
|---|---|---|---|
| **Position** | Edge, in front of servers | Edge, in front of **APIs** | **Between every internal service** |
| **Traffic** | North-south (in from outside) | North-south | **East-west (service to service)** |
| **Deployment** | Centralised | Centralised | **Sidecar per pod** (or per node) |
| **Knows about** | Hosts and paths | **APIs, consumers, quotas** | **Every service and its identity** |
| **Owns** | TLS termination, routing, static caching, compression, basic LB | AuthN/Z, rate limiting per consumer, quotas, request shaping, API versioning, aggregation, developer portal | **mTLS**, retries, timeouts, circuit breaking, traffic splitting, tracing, service discovery |
| **Examples** | nginx, HAProxy, Envoy, Cloudflare | Kong, Apigee, AWS API Gateway, Tyk | Istio, Linkerd, Consul Connect |

### Reverse proxy — the base layer

The simplest and oldest. Sits in front of your servers and:

- **Terminates TLS** (one place to manage certs)
- **Routes** by host/path
- **Load balances**
- **Caches** static content
- **Compresses** responses
- Hides your topology, serves static files, buffers slow clients

> **The slow-client buffering point is underrated:** a reverse proxy absorbs slow/malicious clients (Slowloris)
> so your application threads aren't held hostage by someone sending one byte per second.

### API gateway — reverse proxy + API-consumer concerns

Everything above, **plus things that require knowing *who* is calling:**

| Concern | Why it belongs here |
|---|---|
| **Authentication** | Validate JWT/API key once at the edge; services trust the gateway |
| **Authorization (coarse)** | "This API key may call the payments API" |
| **Rate limiting / quotas** | **Per consumer**, per plan, per tenant |
| **Request/response transformation** | Protocol translation (REST→gRPC), field filtering |
| **API versioning & routing** | `/v1` → old service, `/v2` → new |
| **Aggregation (light)** | Combine a few calls into one response |
| **Metering & billing** | Count calls per customer |
| **Developer portal, API keys, docs** | The product side of an API |

### ⚠️ The anti-pattern: business logic in the gateway

**The rule: the gateway owns *cross-cutting* concerns. It must not own *domain* logic.**

| ✅ Belongs in the gateway | ❌ Does NOT belong |
|---|---|
| Is this JWT valid? | Is this user allowed to see *this specific order*? |
| Has this API key exceeded 1000 req/min? | Is this customer's credit limit sufficient? |
| Route `/v2/*` to the new service | Compute the discount, then route |
| Reject requests over 1 MB | Validate the business rules of the payload |
| Add a trace header | Enrich the request with data from three services |

**Why it goes wrong:**

1. **The gateway becomes a deployment bottleneck.** Every team's changes queue behind one shared config and
   one shared release process. Team velocity collapses.
2. **It becomes a distributed monolith's centre.** Logic lives in a place no team owns, that all teams depend
   on.
3. **You can't test it properly.** Business rules in YAML/Lua/config have no unit tests, no type checking, no
   local reproduction.
4. **The blast radius is total.** A bad gateway config takes down **every** API at once.
5. **Ownership is unclear.** When the discount calculation is wrong, whose bug is it?

> **The interview line:** *"I'd keep the gateway to cross-cutting concerns — authn, rate limiting, routing,
> TLS. The moment domain logic goes in there it becomes a shared deployment bottleneck that every team is
> blocked on and no team owns, and its blast radius is every API simultaneously. Fine-grained authorization
> — 'can this user see this order?' — stays in the service that owns the data."*

**The nuance on authorization** is worth stating: **coarse authz at the gateway** ("this token may call this
API"), **fine-grained authz in the service** ("this user may read *this* record"), because only the service
knows the data. → Phase 10.

### Service mesh — the east-west layer

A **sidecar proxy** (usually Envoy) is injected next to every service instance. All traffic in and out goes
through it.

```
┌──────────── pod ────────────┐        ┌──────────── pod ────────────┐
│  service A  ──▶  sidecar    │ ─mTLS─▶│  sidecar  ──▶  service B    │
└─────────────────────────────┘        └─────────────────────────────┘
                  │                                   │
                  └────────  control plane  ──────────┘
                       (policy, certs, discovery)
```

**What it gives you — without touching application code:**

| Capability | Why it matters |
|---|---|
| **mTLS everywhere** | Zero-trust internal network, automatic cert rotation. **The strongest argument.** |
| **Retries, timeouts, circuit breaking** | Consistent policy across every language in the org |
| **Traffic splitting** | Canary by percentage, mirroring/shadow traffic, blue-green |
| **Observability** | Golden signals for every service hop, free and uniform |
| **Per-request L7 load balancing** | Fixes the gRPC/HTTP-2 problem (note 03) |
| **Service discovery** | Managed by the control plane |
| **Policy enforcement** | "Service A may not call service C" |

**The honest costs — say these, don't just sell the mesh:**

- **Latency**: an extra proxy hop each way, ~0.5–2 ms per call. On a 10-hop request path that's real.
- **Resources**: a sidecar per pod — CPU and memory, sometimes ~10–20% overhead across the fleet
- **Operational complexity**: Istio in particular is a large system with its own failure modes, upgrades and
  learning curve. **The control plane becomes critical infrastructure.**
- **Debugging**: "is it my service, or the mesh?" is a new and annoying question
- **Genuinely not worth it below a certain size.** For 5 services, a shared library does 80% of this.

> **The mature take:** *"A mesh earns its cost at scale — many services, many languages, and a hard mTLS or
> compliance requirement. For a handful of services in one language, a shared client library gives me retries,
> timeouts and tracing at a fraction of the operational cost. I'd also consider Linkerd over Istio if I wanted
> the benefits without the complexity."*

### How they compose

```
             Internet
                │
         ┌──────▼──────┐
         │     CDN     │   static caching, DDoS absorption, TLS at edge
         └──────┬──────┘
         ┌──────▼──────┐
         │  L4 LB/WAF  │   volume, DDoS, IP filtering
         └──────┬──────┘
         ┌──────▼──────┐
         │ API Gateway │   authn, rate limit, routing, versioning     ← north-south
         └──────┬──────┘
    ┌───────────┼───────────┐
┌───▼───┐   ┌───▼───┐   ┌───▼───┐
│ svc A │◀─▶│ svc B │◀─▶│ svc C │   ← east-west, via mesh sidecars: mTLS,
└───────┘   └───────┘   └───────┘      retries, circuit breaking, tracing
```

**North-south = gateway. East-west = mesh.** That's the one-line distinction, and there is real overlap —
Istio's ingress gateway *is* an API gateway, and many teams use Envoy for both.

**You do not need all of these.** A perfectly respectable production stack is: CDN → cloud LB → services.
Saying *"I'd start with a cloud load balancer and add a gateway when we have multiple API consumers who need
different rate limits"* is a better answer than drawing every box.

---

## In your own words

**One line each: what does a reverse proxy own, an API gateway own, a service mesh own?**

>

**North-south vs east-west — which component handles each?**

>

**Give three concrete examples of things that belong in a gateway and three that don't.**

>

**Why does business logic in the gateway destroy team velocity? Name the mechanism.**

>

**Coarse vs fine-grained authorization — where does each live, and why?**

>

**Argue for a service mesh, then against it. When does it stop being worth the cost?**

>

**Design a stack for a 6-service startup. Which of these three do you actually deploy?**

>

---

## Links

- L4 vs L7 → [Phase 1 note 01](../../phase-01-networking/notes/01-l4-vs-l7.md)
- Per-request LB for gRPC → [03-load-balancing-algorithms.md](03-load-balancing-algorithms.md)
- Retries, circuit breaking (what the mesh implements) → [Phase 1 note 11](../../phase-01-networking/notes/11-timeouts-retries-backoff.md) and Phase 7
- Rate-limiting algorithms → Phase 7
- Fine-grained authz, RBAC/ABAC/ReBAC → Phase 10
- Microservices boundaries, distributed monolith → Phase 8
