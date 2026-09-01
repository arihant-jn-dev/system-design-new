# 06 · API Styles — REST vs gRPC vs GraphQL

> **Why this exists:** the roadmap says *"the tradeoff table matters more than the details"* and the gate asks
> you to **argue for and against GraphQL**. The failure mode here is having a favourite. Seniors are expected
> to argue all three convincingly and then commit with a reason.

---

## Reference

### The tradeoff table — the thing to memorise

| | **REST** | **gRPC** | **GraphQL** |
|---|---|---|---|
| **Transport** | HTTP/1.1 or 2 | **HTTP/2 required** | HTTP (usually one POST endpoint) |
| **Payload** | JSON (text) | **Protobuf (binary)** | JSON |
| **Schema/contract** | Optional (OpenAPI) | **Mandatory (.proto)** | **Mandatory (SDL)** |
| **Codegen** | Optional | **Built in** | Good (typed clients) |
| **Payload size** | Baseline | **~30–60% smaller** | Similar to REST, but you fetch less |
| **Browser support** | ✅ Native | ❌ **Needs grpc-web + a proxy** | ✅ Native |
| **HTTP caching** | ✅ **Excellent** (GET, ETag, CDN) | ❌ None | ❌ **Very hard** (POST, dynamic queries) |
| **Streaming** | SSE / chunked only | ✅ **Bidirectional, first-class** | Subscriptions (bolted on, usually WS) |
| **Over-fetching** | Common | Common | ✅ **Solved** |
| **Under-fetching (N+1 calls)** | Common | Common | ✅ **Solved** |
| **Debuggability** | ✅ curl, browser devtools | ❌ Binary — needs grpcurl | ➖ Readable but complex |
| **Server load control** | Predictable per endpoint | Predictable | ❌ **Client can craft expensive queries** |
| **Learning/ops cost** | Lowest | Medium | **Highest** |
| **Best at** | Public APIs, CRUD, cacheable reads | **Internal service-to-service** | **Aggregating many sources for varied clients** |

### Where each genuinely wins

**REST — the default, and the right default.**
- Universally understood, debuggable with curl, works everywhere
- **HTTP caching is the killer feature people forget.** `GET` + `ETag` + `Cache-Control` means a CDN can serve
  your API. Neither gRPC nor GraphQL can do this properly.
- Public APIs: your consumers already know it and your support burden is lowest
- Weak at: over/under-fetching, no schema by default, chatty for complex object graphs

**gRPC — the internal-services answer.**
- Binary protobuf: smaller and faster to parse than JSON
- **The schema is mandatory and generates code in every language** — this is the real win. Contract drift
  between services becomes a compile error instead of a 3 a.m. incident.
- Four streaming modes: unary, server-streaming, client-streaming, **bidirectional**
- Built-in deadlines, cancellation, and **deadline propagation across hops** (genuinely valuable — Phase 7)
- Weak at: no browser support without a proxy, no HTTP caching, binary payloads are hard to inspect,
  **requires L7 load balancing** (note 01)

**GraphQL — the aggregation answer.**
- Client asks for exactly the fields it needs → **one round trip, no over-fetching**
- Different clients (iOS, Android, web, watch) get different shapes from **one endpoint** with no versioning
- Strong typing + introspection → excellent tooling
- Weak at: caching, cost control, operational complexity, and the N+1 problem it *creates* on the server

### The GraphQL argument — both sides (this is the gate question)

**FOR, on a mobile-first product:**

1. **Mobile networks are latency-bound, not bandwidth-bound.** Each round trip on 4G costs 50–150 ms. A screen
   needing user + posts + comments + likes = 4 REST calls = 4 sequential RTTs. GraphQL makes it **one**.
   That's the strongest argument and it's a real one.
2. **Over-fetching is expensive on mobile** — battery, data caps, parse time. Fetch 12 fields instead of 60.
3. **No client-version coupling.** You cannot force users to update a mobile app. With REST you end up with
   `/v1/`, `/v2/`, `/v3/` and a BFF per platform. GraphQL lets old clients keep requesting old fields while
   new clients request new ones — **field-level deprecation instead of endpoint versioning.**
4. **Product velocity.** New screen? Write a new query. No backend deploy, no new endpoint, no coordination.
5. **Schema as the contract** between mobile and backend teams, with typed codegen on both sides.

**AGAINST, on the same product:**

1. **Caching is the big one.** REST gives you CDN and browser caching for free via GET + ETag. GraphQL POSTs
   an opaque query to one URL — HTTP caching is useless. You must rebuild it in the application
   (persisted queries, Apollo client cache, DataLoader, CDN support for GET-with-persisted-queries) — all of
   which is *work you got for free with REST*.
2. **The N+1 problem moves to the server.** `posts { author { name } }` over 100 posts naively becomes 100
   author queries. You need DataLoader-style batching everywhere. GraphQL didn't remove the N+1 — it moved it
   from the network to your database, where it's less visible.
3. **Clients can craft expensive queries** — deeply nested, or `first: 10000`. You need query depth limits,
   complexity scoring, and per-client cost budgets before you can safely expose it. **A public GraphQL API
   without cost limiting is a DoS waiting to happen.**
4. **Observability gets worse.** Every request is `POST /graphql` and returns `200 OK` — including partial
   failures, which come back as a `200` with an `errors` array. Your RED metrics, per-endpoint latency and
   error-rate dashboards all stop working until you rebuild them around operation names.
5. **Operational cost is real**: schema stitching/federation, resolver performance, a new class of security
   concerns (introspection in prod, field-level authz on *every* field).
6. **Authorization is harder.** REST authorizes an endpoint. GraphQL must authorize **every field**, because
   any client can request any traversal.

> **The commit** (never leave it at "it depends"): *"For a mobile-first product with several client platforms
> and rapidly changing screens, I'd take GraphQL — the round-trip savings and decoupling from app release
> cycles are worth it. I'd require persisted queries from day one so I get back CDN caching and cost control,
> and I'd mandate DataLoader batching. If the product were a small, stable, cache-heavy public API instead,
> REST would be strictly better and GraphQL would be résumé-driven."*
>
> Notice the shape: **pick, justify with the workload, name the mitigation for the biggest weakness, and say
> what would change your mind.**

### The realistic modern answer: use all three

Most mature systems are polyglot, and saying so is a strong signal:

```
Mobile / web clients  ──GraphQL or REST──▶  BFF / API Gateway
                                                  │
                                              ──gRPC──▶  internal services
                                                  │
Public partner API    ──REST──────────────────────┘
```

- **REST** at the public edge (cacheable, universally consumable)
- **GraphQL** at the BFF layer where client-shaped aggregation happens
- **gRPC** between internal services (fast, typed, streaming)

### REST design details worth knowing

| Topic | The short version |
|---|---|
| **Resource modelling** | Nouns not verbs: `/orders/123/items`, not `/getOrderItems?id=123` |
| **Verbs** | GET (safe, cacheable), POST (create, **not** idempotent), PUT (replace, idempotent), PATCH (partial), DELETE (idempotent) |
| **Idempotency** | GET/PUT/DELETE idempotent by spec; POST is not → needs idempotency keys (note 09) |
| **Status codes** | 200/201/202/204 · 400/401/403/404/409/422/429 · 500/502/503/504. **Know 409 (conflict) and 429 (rate limited)** — they signal real experience. |
| **HATEOAS** | Hypermedia links in responses. The roadmap's advice is correct: **know it, skip it.** Almost nobody implements it. |

---

## In your own words

**Argue FOR GraphQL on a mobile-first product. Four points, strongest first.**

>

**Argue AGAINST it on the same product. Four points.**

>

**Now commit. Which do you pick, what mitigation do you mandate, and what would change your mind?**

>

**Why is HTTP caching REST's underrated advantage, and why can't GraphQL have it easily?**

>

**Why is gRPC the usual answer internally but rarely the answer for a public API?**

>

**GraphQL "solves N+1." Where does the N+1 actually go?**

>

---

## Links

- Why gRPC needs L7 balancing → [01-l4-vs-l7.md](01-l4-vs-l7.md)
- HTTP/2, which gRPC requires → [05-http-evolution.md](05-http-evolution.md)
- Idempotency keys for POST → [09-idempotency.md](09-idempotency.md)
- Versioning and compatibility → [10-api-design-mechanics.md](10-api-design-mechanics.md)
- **Measure the payload difference yourself** → [`../lab/`](../lab/) Part A
- BFF, API composition, GraphQL federation → Phase 8
