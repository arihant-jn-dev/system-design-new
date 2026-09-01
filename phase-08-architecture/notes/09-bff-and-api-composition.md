# 08·09 · BFF, API Composition & GraphQL Federation

> **Why this exists:** once you've split the backend, ⭐ **someone has to put the pieces back together for
> the client.** Where you do that — client, gateway, or a dedicated layer — is a real architectural choice
> with real failure modes.

---

## Reference

### The problem decomposition creates

The mobile home screen needs user + orders + recommendations + notifications. Those are now four services.

| Who composes? | Consequence |
|---|---|
| ⭐ **The client** | 4 round trips over mobile latency; ⚠️ the client now knows your service topology, and **it can't be changed without a client release** |
| **A gateway** | one call, but the gateway grows client-specific logic |
| ⭐ **A BFF** | one call, shaped exactly for this client |

### ⭐ Backend for Frontend

**One backend service per client experience, owned by that client's team.**

```
iOS app     ──▶ Mobile BFF  ──┐
Android app ──▶              ├──▶ user · orders · recs · notifications
Web app     ──▶ Web BFF    ──┤
Partner API ──▶ Public API ──┘
```

| Why | |
|---|---|
| ⭐ **Different clients genuinely need different things** — mobile wants small payloads and few round trips; web can afford more; partners need stability and versioning |
| ⭐ **Owned by the client team**, so it changes at the client's cadence, not the platform's |
| ⭐ **A general-purpose API optimised for everyone is optimised for no one** — that's the observation the pattern exists for |
| Client-specific auth, shaping, aggregation live somewhere sane |

⚠️ **Costs:** duplicated logic across BFFs (accept some — ⭐ **premature sharing between BFFs recreates the
one-API-for-everyone problem you were escaping**) · another deployable per client · ⭐ **a BFF quietly
accumulating business logic that belongs in a domain service — the main way this pattern goes wrong**.

> ⭐ **The line: a BFF does aggregation, shaping and client-specific concerns. It does NOT own domain rules
> or data.** If your BFF is deciding whether an order can be cancelled, that rule is in the wrong place.

**When you don't need one:** a single client · clients whose needs are near-identical · a small system.
**One well-designed API is fine, and 3 BFFs for 3 near-identical clients is pure overhead.**

### API composition — and its failure modes

The aggregator calls N services and merges. **Fan out in parallel, never serially.**

⚠️ **The failure modes you must name:**

| | |
|---|---|
| ⭐ **Latency = the SLOWEST call, not the average** | tail amplification: with 5 calls at p99=100ms, ~5% of requests hit *at least one* p99. **The composite's p99 is worse than any component's** ([Phase 0](../../phase-00-foundations/notes/)) |
| ⭐ **Availability multiplies** | 5 dependencies at 99.9% ⇒ ~99.5% composite if all are required |
| ⚠️ **In-memory joins across services** | fetching 1,000 orders then N user lookups — ⭐ **the N+1 problem, now over the network** |
| ⚠️ **Big fan-outs amplify load** | one client request = 40 backend calls |

**What makes it survivable:**

- ⭐ **Partial responses + graceful degradation** — return the page without recommendations rather than
  failing it. ⭐ **Classify each dependency as REQUIRED or OPTIONAL, explicitly.** That single decision is
  what turns a 99.5% composite back into 99.9%
- **Per-dependency timeouts, all shorter than your own deadline** ([Phase 7](../../phase-07-reliability/notes/01-timeouts-and-deadlines.md))
- **Batch endpoints** (`GET /users?ids=…`) or a DataLoader to kill N+1
- **Cache the stable pieces**
- **Circuit breakers per dependency, with fallbacks**

### GraphQL and federation

**GraphQL:** the client specifies exactly the fields it wants — one request, no over-fetching, ⭐ **and no
new backend deploy when the client's needs change.** That last point is the real draw, and it makes GraphQL
a natural BFF-killer for web clients.

⚠️ **Costs:** ⭐ **HTTP caching largely stops working** (one POST endpoint, query in the body) so you cache
at the resolver/entity layer instead · **N+1 by default** — DataLoader batching is mandatory, not optional ·
⭐ **query cost is unbounded** — a deeply nested query can DoS you, so you need depth limits, complexity
scoring, and persisted queries · ⚠️ **rate limiting by request count is meaningless** when one request can
cost 1000× another · monitoring per-field rather than per-endpoint.

**Federation** (Apollo Federation, GraphQL mesh): each service owns part of one graph; a gateway composes
the supergraph and plans the query across subgraphs.

> ⭐ **The appeal: one schema for clients, distributed ownership for teams.** No central BFF team becomes the
> bottleneck.
> ⚠️ **The catch: the schema becomes a shared, org-wide contract** — cross-team coordination, a query
> planner whose performance is hard to reason about, and a gateway that is now critical infrastructure.
> **It's most defensible when you have many teams and many clients; it's substantial overhead below that.**

### Choosing

| Situation | Reach for |
|---|---|
| One client, few services | ⭐ **Nothing. A plain API.** |
| Several clients with genuinely different needs | ⭐ **BFF per client** |
| Rapidly changing, field-hungry web/mobile UI | GraphQL (as the BFF) |
| Many teams, many clients, one product graph | Federation |
| External/partner consumers | ⭐ **A separate, deliberately versioned public API** — never expose an internal one ([11](11-api-evolution-and-contract-testing.md)) |

---

## In your own words

**⭐ What's wrong with letting the client compose from N services?**

>

**Define BFF. What's the observation that justifies it?**

>

**⭐ What must a BFF never own, and what's the smell that it's happening?**

>

**When do you NOT need a BFF?**

>

**⭐ Why is a composite's p99 worse than any single dependency's p99?**

>

**⭐ Availability of five required 99.9% dependencies? What's the single most effective fix?**

>

**What's the N+1 problem over a network, and how do you kill it?**

>

**⭐ Name three real costs of GraphQL that don't appear in the pitch.**

>

**What does federation buy, and what does it cost?**

>

**⭐ Why should an external API never just be an internal one exposed?**

>

---

## Links

- Tail latency amplification → [Phase 0](../../phase-00-foundations/notes/)
- API styles and payload shape → [Phase 1](../../phase-01-networking/notes/)
- Gateways vs meshes → [04-service-discovery-and-mesh.md](04-service-discovery-and-mesh.md)
- ⭐ Optional dependencies and partial responses → [Phase 7 note 06](../../phase-07-reliability/notes/06-graceful-degradation.md)
- Per-dependency timeouts and breakers → [Phase 7 notes 01](../../phase-07-reliability/notes/01-timeouts-and-deadlines.md), [03](../../phase-07-reliability/notes/03-circuit-breakers.md)
- Read models as the alternative to composing at read time → [05-cqrs.md](05-cqrs.md)
- Versioning the public contract → [11-api-evolution-and-contract-testing.md](11-api-evolution-and-contract-testing.md)
