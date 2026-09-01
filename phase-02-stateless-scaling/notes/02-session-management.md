# 02 · Session Management

> **Why this exists:** gate question — *"when are sticky sessions acceptable and when are they a liability?"*
> The junior answer is "sticky sessions are bad." The senior answer names the specific costs, then identifies
> the cases where you accept them anyway.

---

## Reference

### The three approaches

| | **Sticky sessions** | **Client-side tokens (JWT)** | **Centralised session store** |
|---|---|---|---|
| Where state lives | **One server's memory** | **In the client's cookie/header** | **Redis / DB** |
| Server stateless? | ❌ No | ✅ Yes | ✅ Yes |
| Extra network hop per request | No | No | **Yes** (~0.5–1 ms to Redis) |
| Works if a node dies | ❌ **Those users are logged out** | ✅ | ✅ |
| Scale down / autoscale freely | ❌ | ✅ | ✅ |
| **Instant revocation** | ✅ | ❌ **The hard problem** | ✅ |
| Session size limit | None | ~4 KB cookie limit | None |
| Load distribution | ❌ Uneven — sticky by definition | ✅ Even | ✅ Even |
| Extra infra | None | None | **Redis to run, monitor, back up** |
| Sent on every request | No | **Yes — bandwidth cost** | No (just an ID) |

### 1 · Sticky sessions (session affinity)

The load balancer pins a client to the same backend, by cookie (L7) or source-IP hash (L4).

**How it's implemented:**
- **Cookie-based** (L7) — LB sets its own cookie (`AWSALB`, nginx `sticky`). Accurate.
- **IP hash** (L4) — hash the source IP. **Breaks badly behind corporate NATs and mobile carrier-grade NAT**,
  where thousands of users share an IP, and breaks again when a mobile client changes networks.

**The costs — name these specifically, they're the gate answer:**

| Cost | Detail |
|---|---|
| **Uneven load** | Long-lived sessions accumulate. A node that's been up longest has the most sessions. New nodes get nothing until clients cycle. |
| **A node dying logs its users out** | Not "slightly degraded" — logged out, cart lost |
| **Deploys are disruptive** | Every rolling restart drops sessions on that node |
| **Scaling down hurts users** | You can't terminate a node without evicting its sessions |
| **Autoscaling is blunted** | New capacity gets no existing traffic — it only helps new sessions |
| **Hot spots persist** | The LB can't rebalance a heavy user away |
| **Hidden statefulness** | Everything in note 01 comes back |

**When sticky sessions are genuinely acceptable:**

1. **WebSocket / SSE / long-lived connections.** The connection is inherently pinned to a node. Stickiness
   here isn't a choice — it's a description of reality. **This is the strongest case.**
2. **Local caching that's expensive to rebuild** — a node holds a warm per-user cache and stickiness raises
   the hit rate. State loss is a *performance* event, not a correctness one.
3. **Legacy applications** you cannot modify. Stickiness is the pragmatic bridge while you migrate.
4. **Multi-step flows with big server-side state** (large file upload sessions) where externalising is
   genuinely expensive.
5. **Short sessions + small blast radius** — internal tools, low user counts.

> **The gate answer:** *"Sticky sessions are acceptable when the connection is already inherently pinned —
> WebSockets are the obvious case — or when losing the state is a performance problem rather than a
> correctness one, like a warm per-user cache. They're a liability when they're carrying **authoritative**
> state, because then a node dying logs users out, deploys drop sessions, autoscaling stops working properly,
> and load skews toward whichever node has been up longest. My default is stateless with a shared session
> store; I'd reach for stickiness deliberately, for connections, not for identity."*

### 2 · Client-side tokens (JWT)

The session travels with the client, signed so the server can trust it without a lookup.

```
header.payload.signature
{"alg":"HS256"}.{"sub":"u_123","exp":1735689600,"role":"admin"}.<sig>
```

**Wins:** truly stateless, no lookup, no shared infra, works across services and domains.

**The revocation problem — the thing to be able to state precisely:**

> **A signed token is valid until it expires. There is no way to "un-sign" it.**
> User logs out → the token still works. You ban an account → they keep their access. You change someone's
> role → they keep the old one until expiry.

**Mitigations, each with its own cost:**

| Mitigation | Cost |
|---|---|
| **Short-lived access tokens (5–15 min) + long refresh token** | The standard answer. The refresh token *is* revocable because it's checked against a store. Shrinks the window rather than closing it. |
| Denylist of revoked tokens | **You just reintroduced the central store you were avoiding** — though it's much smaller (only revoked, unexpired tokens) |
| Token versioning per user | Requires a lookup → same problem |
| Short expiry + accept the window | Often correct. Say so explicitly. |

**Other JWT gotchas worth knowing:**

- **Don't put JWTs in `localStorage`** — any XSS reads them. Use `HttpOnly; Secure; SameSite` cookies.
- **Size**: a JWT is 500 B–1 KB and is sent on **every request**. At 10 K QPS that's ~10 MB/s of tokens.
- **`alg: none`** and algorithm-confusion attacks — always pin the expected algorithm server-side.
- **JWTs are signed, not encrypted.** The payload is base64, i.e. **public**. No PII in claims.
- HS256 (shared secret, simple) vs RS256 (public key — verifiers don't need the signing secret; the right
  choice for multi-service verification).

> **The senior framing:** *"JWTs trade revocation for statelessness. That's the right trade for a
> high-volume API where a 15-minute stale-permission window is acceptable, and the wrong trade for anything
> where 'ban this user now' has to mean now — payments, moderation, admin. I'd use short-lived access tokens
> with refresh rotation, and be explicit that revocation is bounded by the access-token TTL."*

### 3 · Centralised session store

Client holds an opaque session ID; the server looks it up in Redis.

**Wins:** stateless servers, instant revocation, no size limit, no PII on the wire, and the session ID is
meaningless if stolen from a log.

**Costs:**
- **A network round trip on every request** (~0.5–1 ms — usually fine)
- **Redis becomes a hard dependency in the auth path.** If it's down, *nobody* can log in. Needs replication,
  failover, and a considered degradation story.
- Infrastructure to run

**This is the most common production answer**, and it's a perfectly good default. Don't feel the need to pick
something more exotic.

### Choosing — the decision path

```
Long-lived connection (WebSocket/SSE)?     → sticky routing is unavoidable; embrace it
Need instant revocation?                   → centralised store
Very high volume, revocation window ok?    → short JWT + refresh rotation
Multi-service / cross-domain?              → JWT (RS256) or a token-introspection endpoint
Default / unsure?                          → centralised session store. Boring and correct.
```

**The hybrid that's very common and worth naming:** short-lived JWT for *authentication* (no lookup on the
hot path) plus a small revocation denylist checked at the gateway. You get statelessness for 99.9% of
requests and revocation when you need it.

---

## In your own words

**Name five specific costs of sticky sessions.**

>

**When are sticky sessions genuinely acceptable? Give the strongest case and say why it's not really a choice.**

>

**Explain the JWT revocation problem in two sentences, as you'd say it out loud.**

>

**Why doesn't "short expiry + refresh tokens" fully solve revocation? What does it actually do?**

>

**Why shouldn't a JWT go in localStorage, and why shouldn't it contain PII?**

>

**Your centralised session store (Redis) goes down. What happens, and how would you degrade?**

>

---

## Links

- Why statelessness matters at all → [01-stateless-vs-stateful.md](01-stateless-vs-stateful.md)
- IP-hash stickiness and LB algorithms → [03-load-balancing-algorithms.md](03-load-balancing-algorithms.md)
- WebSocket routing at scale → Phase 9
- OAuth, OIDC, refresh rotation, JWT security in depth → **Phase 10**
