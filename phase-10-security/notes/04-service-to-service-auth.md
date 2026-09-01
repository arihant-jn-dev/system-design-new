# 10·04 · Service-to-Service Auth

> **Why this exists:** ⭐ **gate Q1 asks "how do services trust each other?"** — and the honest default answer
> in most real systems is "they don't check," which is exactly the omission the roadmap warns about.

---

## Reference

### ⭐ The premise: "internal network" is not authentication

⚠️ **The perimeter model — hard shell, soft centre — fails because the shell always gets breached:** one
SSRF, one compromised pod, one leaked CI credential, one contractor's laptop, and the attacker is *inside*,
where nothing checks anything.

> ⭐ **ZERO TRUST: every request is authenticated and authorized, regardless of where it came from.**
> Network position is not a credential.

⭐ **This is also the answer to "how did one compromised service become a full breach?"** — lateral movement
is free when internal calls are unauthenticated.

### The options

| | How | Best for | Watch |
|---|---|---|---|
| ⭐ **mTLS** | both sides present certificates | ⭐ **the default inside a cluster** | ⚠️ certificate lifecycle is the whole problem |
| ⭐ **Workload identity** | the platform issues short-lived credentials from the workload's identity | ⭐ **cloud-native; no secrets at all** | platform-specific |
| **Short-lived tokens** (client credentials) | a service gets a JWT from an auth server | crossing trust boundaries, third parties | a token service to run |
| **Signed requests (HMAC)** | sign method+path+body+timestamp | ⭐ **webhooks and partner APIs** | ⚠️ shared secret; clock skew |
| ⚠️ **A static API key/shared secret** | a header | ⭐ **the "we'll fix it later" option** | ⚠️ never rotated, ends up in git |

### ⭐ mTLS — the default, and its real cost

**Normal TLS authenticates the *server*. Mutual TLS authenticates *both*** — the client also presents a
cert, and its identity is the certificate subject (`spiffe://cluster/ns/payments/sa/api`).

| | |
|---|---|
| ⭐ **What it gives you** | encryption **and** authentication of both ends, ⭐ **with zero application code** — the sidecar does it ([Phase 8 note 04](../../phase-08-architecture/notes/04-service-discovery-and-mesh.md)) |
| ⚠️ **The actual cost** | ⭐ **certificate lifecycle: issuance, distribution, rotation, revocation.** This is why people don't do it by hand |
| ⭐ **Why a mesh is the answer** | Istio/Linkerd issue and rotate short-lived certs automatically. ⭐ **"mTLS everywhere" is the single strongest reason to adopt a mesh** |
| **SPIFFE/SPIRE** | the vendor-neutral standard for workload identity documents (SVIDs) |

⭐ **Short-lived certificates (hours) make revocation a non-problem** — you don't need CRLs/OCSP if the cert
expires before anyone can use it. **Prefer short lifetimes to revocation infrastructure**, everywhere.

### ⭐ The distinction the mesh does NOT solve

> ⭐ **mTLS tells you WHICH SERVICE is calling. It tells you NOTHING about WHICH USER is on whose behalf.**

**You need both, and they're separate:**

```
user JWT  ──▶ gateway ──▶ orders svc ──▶ payments svc
              ⭐ verifies user identity
                            ⭐ mTLS proves "orders is calling"
                            ⭐ + propagated user context proves "for user 42"
```

⚠️ **Two failure modes to name:**

- ⚠️ **The confused deputy** — `orders` is allowed to call `payments`, so an attacker who can make `orders`
  issue arbitrary requests gets `payments` access. ⭐ **The user context must travel and be checked at the
  point of the decision**, not just at the edge.
- ⚠️ **Blindly forwarding the user's token** downstream is convenient and over-broad: every service now holds
  a credential valid at *every* service. ⭐ **Token exchange (RFC 8693) narrows it** — swap the user token
  for one scoped to exactly the downstream call.

### Signed requests (HMAC) — for webhooks and partners

```
signature = HMAC-SHA256(secret, timestamp + "." + raw_body)
headers:  X-Signature, X-Timestamp
```

⭐ **The three rules:** sign over the **raw body** (not re-serialised JSON — whitespace changes break it) ·
⭐ **include a timestamp and reject anything older than ~5 minutes**, or a captured request replays forever ·
⭐ **constant-time comparison**.

⭐ **This is exactly what Stripe/GitHub webhooks do, and verifying it is non-optional** — an unauthenticated
webhook endpoint means anyone can mark any order as paid ([Phase 9 note 16](../../phase-09-building-blocks/notes/16-payments-primitives.md)).

### ⭐ What to actually say in a design

> *"Inside the cluster, ⭐ **mTLS via the mesh** — every service gets a short-lived workload identity, so
> calls are authenticated and encrypted with no application code, and there are no shared secrets to rotate.
> ⭐ **On top of that I propagate the user context in a signed token with an `aud` for the downstream
> service**, because mTLS tells me which *service* is calling, not which *user* it's acting for.
> Authorization decisions are made where the data is, not at the edge. ⭐ **For third parties I'd use OAuth
> client credentials with scopes, and HMAC-signed webhooks with a timestamp for anything I send out.**"*

⭐ **That covers gate Q1's "how do services trust each other?" completely, in about 30 seconds.**

---

## In your own words

**⭐ Why is "it's on our internal network" not authentication? What does it enable after a breach?**

>

**Name the five options and when each fits.**

>

**What does mTLS give you, and what is its real cost?**

>

**⭐ Why do short-lived certificates make revocation a non-problem?**

>

**⭐ State exactly what mTLS does NOT tell you.**

>

**⭐ Explain the confused deputy problem and its fix.**

>

**⭐ Why is forwarding the user's token downstream a bad default? What's the alternative?**

>

**Three rules for HMAC-signed requests. What does the timestamp prevent?**

>

**⭐ Deliver the 30-second service-trust answer.**

>

---

## Links

- ⭐ **Gate Q1** → [`../GATE.md`](../GATE.md)
- Mesh, sidecars, infra-vs-code → [Phase 8 note 04](../../phase-08-architecture/notes/04-service-discovery-and-mesh.md)
- Client credentials → [03-oauth-and-oidc.md](03-oauth-and-oidc.md)
- Token validation, `aud`, pinning the alg → [02-sessions-and-tokens.md](02-sessions-and-tokens.md)
- ⭐ Webhook verification in practice → [Phase 9 note 16](../../phase-09-building-blocks/notes/16-payments-primitives.md)
- SSRF — how an attacker gets "inside" → [10-owasp-top-10.md](10-owasp-top-10.md)
- No secrets to rotate is the goal → [12-secrets-management.md](12-secrets-management.md)
