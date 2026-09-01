# 10·06 · API Keys, Scopes & Quotas

> **Why this exists:** the moment your design has a public or partner API, this is its auth story — and
> ⭐ **API keys are the credential most often designed badly, because they look trivial.**

---

## Reference

### ⭐ What an API key actually is

**A long-lived bearer credential.** ⭐ **"Bearer" means whoever holds it *is* you** — there's no proof of
possession, no expiry by default, no user present.

| ✅ Good for | ⚠️ Bad for |
|---|---|
| Server-to-server, partner APIs | ⭐ **anything shipped to a browser or mobile app** — it's public the moment you ship it |
| Simple integrations where OAuth is overkill | Delegated user access (⭐ **that's OAuth**) |
| Machine identity where you can't do mTLS | Anything needing per-user permissions |

### ⭐ Designing keys properly

| | |
|---|---|
| ⭐ **Store a HASH, not the key** | ⭐ **Treat it exactly like a password** — a leaked database must not yield working keys. **SHA-256 is fine here** (unlike passwords) because the key is high-entropy, so brute force is hopeless and you need the lookup to be fast |
| ⭐ **Show it once, at creation** | you can't display it again; you can only rotate |
| ⭐ **Prefix it** — `sk_live_`, `sk_test_`, `ghp_` | ⭐ **so secret scanners (GitHub, TruffleHog) can detect leaks**, and so a human can tell prod from test at a glance. **This is why every major API does it** |
| **Include a lookup id** | `sk_live_<keyid>_<secret>` — so you can find the record without scanning every hash |
| ⭐ **Support MULTIPLE ACTIVE KEYS per account** | ⭐ **otherwise rotation requires downtime**, so nobody rotates |
| **Record `last_used_at`** | ⭐ makes "delete the unused keys" possible, which is most of key hygiene |
| **Bind where you can** | IP allowlist, expiry dates |

⭐ **Rotation only works if it's zero-downtime: issue new → deploy → verify the new key is being used →
revoke old.** ⚠️ **A single-key design guarantees keys are never rotated.**

### Scopes — least privilege for keys

⭐ **A key should carry the minimum permissions the integration needs**, e.g. `read:orders`,
`write:refunds`. **A read-only key leaked in a public repo is an incident; a full-access one is a breach.**

⭐ **Make scopes coarse enough to be understandable and fine enough to be useful** — ⚠️ 200 scopes is a UX
failure, and users will just tick everything. **Show the user what they're granting, and ⭐ default the
"create key" UI to read-only.**

### ⭐ Quotas vs rate limits — they're different

| | **Rate limit** | ⭐ **Quota** |
|---|---|---|
| Window | seconds/minutes | ⭐ a billing period |
| Purpose | ⭐ **protect the system** | ⭐ **enforce the commercial agreement** |
| Accuracy | ⭐ **approximate is fine** | ⭐ **must be accurate — it's money** |
| Overshoot | irrelevant | ⚠️ **you undercharged, or wrongly cut someone off** |
| Storage | in-memory + periodic sync | ⭐ **durable and reconcilable** |

⭐ **This is the trade you already know from [Phase 9 note 03](../../phase-09-building-blocks/notes/03-rate-limiter-as-a-component.md):**
local counters + periodic sync are fine for a throttle because you can *bound* the overshoot — ⭐ **but a
quota is billing, so take the round trip.**

### The client contract

⭐ **`429` + `Retry-After` + `X-RateLimit-*` headers on successful responses too**, so a well-behaved client
self-throttles instead of discovering the limit by hitting it. ⭐ **Document the limits**, and distinguish
`429` ("you're over *your* limit") from `503` ("*we're* overloaded").

⭐ **Give partners a sandbox with the same limits** — integrations break in production precisely because
nobody tested against the limit.

### ⭐ Where keys actually leak — and what to do about it

⚠️ **Committed to git** (⭐ *and rewriting history doesn't help — assume it's compromised the moment it's
pushed*) · in a mobile app binary · in client-side JS · in CI logs · in an error report or a screenshot ·
in a Postman collection someone shared.

⭐ **The mitigations that work:**
**Secret scanning in CI and on the repo host** (⭐ *GitHub will notify major providers automatically — which
is why the prefix format matters*) · ⭐ **short-lived credentials wherever possible, so a leak expires
itself** · **anomaly detection on key usage** (new country, 100× normal volume) · ⭐ **a one-click revoke
that a support engineer can run at 3am** · **and telling customers how to rotate**, in your docs.

⭐ **The strategic answer: the best API key is the one that doesn't exist.** For machine access inside your
own infrastructure, use [workload identity or mTLS](04-service-to-service-auth.md) — ⭐ **no shared secret to
leak, nothing to rotate.** Keys are for people you don't control.

---

## In your own words

**⭐ What does "bearer credential" mean, and what is an API key bad for?**

>

**⭐ Why hash stored keys — and why is SHA-256 acceptable here but not for passwords?**

>

**⭐ Why prefix keys? Give two reasons.**

>

**⭐ Why must an account support multiple active keys?**

>

**Walk a zero-downtime rotation.**

>

**⭐ Rate limit vs quota — four differences. Which needs accuracy, and why?**

>

**What headers do you return, and why on successful responses too?**

>

**Name four places keys leak, and three mitigations that actually work.**

>

**⭐ What's the best API key?**

>

---

## Links

- Rate limiter as a component → [Phase 9 note 03](../../phase-09-building-blocks/notes/03-rate-limiter-as-a-component.md)
- The full treatment → [Phase 7 note 07](../../phase-07-reliability/notes/07-rate-limiting.md)
- Scopes and consent → [03-oauth-and-oidc.md](03-oauth-and-oidc.md)
- No-secret alternatives → [04-service-to-service-auth.md](04-service-to-service-auth.md)
- Where secrets live → [12-secrets-management.md](12-secrets-management.md)
- Abuse detection → [11-ddos-and-abuse.md](11-ddos-and-abuse.md)
