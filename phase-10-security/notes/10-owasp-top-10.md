# 10·10 · OWASP Top 10, Practically

> **Why this exists:** the roadmap says ⭐ ***"at a practical level"*** — you're not being asked to be a
> pentester. ⭐ **You're being asked to not design the vulnerability in.** So each entry here is framed as a
> design decision, not an exploit.

---

## Reference

### ⭐ 1 · Broken Access Control — #1, and it's yours

**The most common real vulnerability, because authentication is bought and authorization is hand-written.**

⚠️ **IDOR** — `GET /api/orders/1234` returns anyone's order. ⚠️ **Missing function-level checks** — the admin
endpoint isn't linked in the UI, so nobody guarded it. ⚠️ **Client-side-only checks** — hiding a button is
not authorization. ⚠️ **Mass assignment** — `PATCH /users/me` with `{"role":"admin"}` in the body.

⭐ **Design answers:** deny by default · enforce centrally, ⭐ **ideally in the query (RLS)** · ⭐ **never
build an object from an unfiltered request body — allowlist the fields** · return `404` for resources whose
existence is sensitive · ⭐ **and the strongest structural fix: don't accept an id and then check it — derive
the scope from the session** (`WHERE user_id = $session_user`), so there's nothing to forget.

### 2 · Injection

**SQL, NoSQL, OS command, LDAP, template.** ⭐ **Root cause is always the same: data got treated as code.**

⭐ **Parameterised queries, always.** ⚠️ **An ORM is not automatic protection** — raw fragments and
`whereRaw` reintroduce it. ⚠️ **Escaping is a weaker fallback than parameterisation.** ⭐ **Allowlist anything
that can't be parameterised** (column names, sort direction). **Least-privilege DB users.**

⭐ **And note the modern variant: prompt injection into an LLM.** Same shape — untrusted input reaching an
interpreter — and the same conclusion: ⭐ **treat model output as untrusted input, and never give it
un-scoped tool access.**

### ⭐ 3 · SSRF — the one to actually understand

⭐ **You make the server fetch a URL the attacker controls, and it fetches something on your internal
network.**

```
POST /api/import  { "url": "http://169.254.169.254/latest/meta-data/iam/..." }
                              ⭐ the cloud metadata endpoint -> credentials
```

⭐ **This is how "we're on a private network" becomes a full breach** ([04](04-service-to-service-auth.md)) —
and it's the mechanism behind the Capital One incident.

⭐ **Defences, in order:** ⭐ **allowlist destinations** (never denylist — DNS rebinding, redirects,
`0x7f.0.0.1`, IPv6 and decimal IPs all defeat blocklists) · ⭐ **block the link-local metadata range and
require IMDSv2** · **resolve DNS and validate the IP, then pin it for the connection** (⚠️ *or TOCTOU via DNS
rebinding* ) · **don't follow redirects** · ⭐ **egress through a proxy with its own allowlist** ·
⭐ **and the real fix: zero-trust internally, so reaching a service isn't the same as being authorized by
it.**

### 4 · XSS

| | |
|---|---|
| **Stored / reflected / DOM-based** | attacker JS runs in your users' browsers |
| ⭐ **Defence** | ⭐ **context-aware output encoding** (HTML vs attribute vs JS vs URL differ) · a framework that escapes by default · ⚠️ **`dangerouslySetInnerHTML` / `v-html` are where it comes back** · sanitise HTML with a vetted library, never a regex |
| ⭐ **Defence in depth** | ⭐ **Content-Security-Policy** (nonce-based, no `unsafe-inline`), `httpOnly` cookies ([02](02-sessions-and-tokens.md)), `X-Content-Type-Options: nosniff` |

⭐ **Remember from the lab: with XSS the attacker doesn't need to steal the token — they can act as the
user.** ⭐ **`httpOnly` still matters because it turns a permanent stolen credential into temporary
same-origin abuse.**

### 5 · CSRF

⭐ **The browser attaches your cookies automatically, so a form on `evil.com` can POST to your bank.**

⭐ **Defences:** `SameSite=Lax` (⭐ *now the browser default, which killed most CSRF*) or `Strict` ·
**anti-CSRF tokens** (synchroniser or double-submit) · ⭐ **check `Origin`/`Referer` on state-changing
requests** · ⚠️ **`GET` must never change state.**
⭐ **Bearer tokens in an `Authorization` header are immune** — the browser doesn't attach them — ⭐ **which is
exactly the trade against `httpOnly` cookies: cookies fix XSS exfiltration, headers fix CSRF. Pick cookies +
`SameSite` + CSRF tokens.**

### 6 · Insecure Deserialization

⚠️ **Deserialising attacker-controlled data into objects can execute code** — Java, Python `pickle`, PHP,
.NET `BinaryFormatter`.
⭐ **Rules: never deserialise untrusted input into arbitrary types. Use JSON with a strict schema. Never
`pickle` anything from a user.**

### The rest, briefly

| | |
|---|---|
| **Cryptographic failures** | plaintext, weak/rolled-your-own crypto, no TLS ([07](07-encryption-and-key-management.md), [08](08-password-storage.md)) |
| ⭐ **Security misconfiguration** | default credentials, debug mode in prod, ⭐ **a public S3 bucket**, verbose stack traces, an open admin port. ⭐ **Boring, and the single most common real cause** |
| ⭐ **Vulnerable components** | ⭐ **most of your code is dependencies.** SCA scanning, an SBOM, patching cadence, ⚠️ **lockfiles + provenance for supply-chain attacks** |
| **Identification/auth failures** | credential stuffing, weak reset flows, session fixation ([08](08-password-storage.md), [11](11-ddos-and-abuse.md)) |
| **Software/data integrity failures** | unsigned updates, untrusted CI plugins, ⚠️ **a compromised build pipeline** |
| ⭐ **Logging & monitoring failures** | ⭐ **you were breached and didn't notice for 200 days.** ⚠️ **And logging too much is its own bug — never log tokens, passwords or PII** ([09](09-pii-and-privacy-by-design.md)) |

### ⭐ How to use this in a design discussion

⭐ **Don't recite the list.** Volunteer the two or three that the design you just drew actually exposes:

> *"This endpoint takes a user-supplied URL, so ⭐ **SSRF is the risk** — I'd allowlist destinations and
> block the metadata endpoint. And since these are per-tenant documents, ⭐ **the access-control check goes
> in the query via RLS**, not in the handler, so a new endpoint can't forget it."*

⭐ **That's worth more than naming all ten**, because it shows you're reading *your own design* for
weaknesses — which is the same instinct as volunteering failure modes in
[Phase 7](../../phase-07-reliability/GATE.md).

---

## In your own words

**⭐ Why is broken access control #1, and what's the strongest structural fix?**

>

**What is mass assignment, and how do you prevent it?**

>

**⭐ What's the root cause common to every injection? Why isn't an ORM automatic protection?**

>

**⭐ Explain SSRF and why it's so damaging. Why allowlist rather than denylist?**

>

**Why does CSP matter if you already escape output?**

>

**⭐ Cookies vs Authorization header — which fixes XSS exfiltration, which fixes CSRF, and what do you pick?**

>

**Why did `SameSite=Lax` as a default matter so much?**

>

**⭐ Which category is the most common real cause of breaches, and why is that ironic?**

>

**⭐ How should you actually bring this up in a design discussion?**

>

---

## Links

- Access control → [01-authn-vs-authz.md](01-authn-vs-authz.md), [05-authorization-models.md](05-authorization-models.md)
- ⭐ RLS as structural enforcement → [Phase 8 note 10](../../phase-08-architecture/notes/10-multi-tenancy.md)
- ⭐ SSRF is why internal auth matters → [04-service-to-service-auth.md](04-service-to-service-auth.md)
- Token storage, XSS/CSRF trade → [02-sessions-and-tokens.md](02-sessions-and-tokens.md)
- Volunteering weaknesses in your own design → [Phase 7 GATE Q1](../../phase-07-reliability/GATE.md)
- **OWASP Top 10** and **OWASP Cheat Sheet Series** — the cheat sheets are the genuinely useful part
