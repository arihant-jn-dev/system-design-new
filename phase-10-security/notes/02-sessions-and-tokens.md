# 10·02 · Sessions vs Tokens, and the JWT Revocation Problem

> **Why this exists:** ⭐ **you built a JWT verifier and broke it three ways.** The revocation problem is the
> single most important thing in this note, because it's the trade-off people adopt JWTs without knowing they
> made.

---

## Reference

### The two shapes

| | ⭐ **Server-side session** | ⭐ **JWT (self-contained token)** |
|---|---|---|
| The client holds | an opaque id | ⭐ **the claims themselves, signed** |
| Validation | ⚠️ a lookup (Redis/DB) | ⭐ **a signature check — no lookup** |
| ⭐ **Revocation** | ⭐ **instant — delete the row** | ⚠️ **you can't** |
| Size on the wire | tiny | ⚠️ 500 B–2 KB on *every* request |
| Scales to N services | needs a shared store | ⭐ **each service verifies alone** |
| Third parties | must share your store | ⭐ **works** |

> ⭐ **THE TRADE, IN ONE SENTENCE: the statelessness that makes a JWT fast is the same property that makes it
> unrevocable. You cannot have one without the other.**

⭐ **Sessions are not legacy.** For a single first-party web app, a signed session cookie backed by Redis is
simpler, instantly revocable and smaller over the wire. ⭐ **JWTs earn their cost when many services must
validate without calling the auth service, or a third party can't share your session store.**

### Structure — and what it is not

```
header.payload.signature      ⭐ base64url ENCODED, not encrypted
```

⭐ **Anyone can read the payload.** The signature prevents *tampering*, not *reading*.
⚠️ **So never put a secret in a JWT** — no password, no card number, no internal flag you wouldn't show the
user.

### ⭐ The three attacks you reproduced

| | Attack | The fix |
|---|---|---|
| 1 | ⭐ **`alg: none`** — the attacker sends an unsigned token with `role: admin`; a verifier that honours `header.alg` **accepts it** | ⭐ **The SERVER pins the algorithm. Never branch on `header.alg`.** Any library that lets you `verify()` without naming the expected algorithm hands that decision to the attacker |
| 2 | ⭐ **HS256/RS256 confusion** — the RSA *public* key is public, so the attacker HMAC-signs using it as the shared secret, and a verifier that accepts either algorithm validates it | ⭐ **Same root cause, same fix: pin the algorithm** |
| 3 | **A valid signature on an invalid token** | ⭐ **Validate `exp`, `nbf`, `aud`, `iss`** |

⭐ **On `aud` specifically — the check people skip:** without it, a token minted for a low-value internal
service is accepted by your payments API. **Same signature, same issuer, completely different trust.**

⭐ **And the asymmetry that justifies RS256's cost: with HS256, every service that VERIFIES tokens holds the
key that can also MINT them.** With RS256 only the auth server has the private key.

⭐ **Also: constant-time signature comparison** (`crypto.timingSafeEqual`) — `a === b` on strings leaks
timing.

### ⭐⭐ The revocation problem — you demonstrated it

> **You logged in, "logged out", and replayed the captured token. ⭐ It still worked.**

**And so does a token belonging to a user you just banned, or whose role you just downgraded, or whose
password was just reset after a compromise.** ⭐ **Nothing you do server-side stops it**, because nothing
server-side is consulted.

**The fixes — each gives back some of what you paid for:**

| | | |
|---|---|---|
| a | ⭐ **Short expiry + refresh tokens** | ⭐ **The standard answer.** Access token 5–15 min (stateless, fast); refresh token days (⭐ **stateful, stored, revocable**). The blast radius of a stolen access token becomes *minutes* |
| b | ⭐ **Refresh token rotation + reuse detection** | Each refresh issues a new refresh token and invalidates the old. ⭐ **If an OLD one is ever presented again, it was stolen → revoke the whole family and force re-auth.** This turns a stolen refresh token from permanent access into a *detectable event* |
| c | **A denylist** (`jti`/`sub`) in Redis | ⚠️ Reintroduces the lookup you used a JWT to avoid — but it's small and TTL'd to the token lifetime, so far cheaper than a session store. ⭐ **Say the trade out loud** |
| d | ⭐ **A per-user "valid after T" epoch** | One cacheable field; handles ban and password-reset well |

> ⭐ **AND THE QUESTION UNDERNEATH: if you need instant revocation, per-request user lookups and server-side
> state anyway — you have rebuilt sessions, but worse.** Being willing to say that is the senior answer.

### ⭐ Where the token lives

| Store | XSS | CSRF |
|---|---|---|
| `localStorage` | ⚠️ **readable by any JS** | immune |
| JS-readable cookie | ⚠️ readable by any JS | ⚠️ vulnerable |
| ⭐ **httpOnly cookie** | ⭐ **not readable by JS** | vulnerable → ⭐ **`SameSite`** |
| In memory only | lost on reload | immune |

⭐ **The answer: `httpOnly` + `Secure` + `SameSite=Lax|Strict`**, plus CSRF protection on state-changing
requests.

⚠️ **"localStorage is fine, just prevent XSS" misses the point:** with XSS the attacker doesn't need to
*steal* the token — they can make requests as the user. ⭐ **But a token in localStorage is EXFILTRATED, so
it keeps working after the XSS is patched and the tab is closed. httpOnly turns "permanent stolen
credential" into "temporary same-origin abuse."**

⭐ **A good common pattern: refresh token in an httpOnly cookie; access token in MEMORY only, re-obtained on
page load.**

### Claims worth knowing

`sub` (subject) · `iss` (issuer) · ⭐ `aud` (audience) · `exp` / `nbf` / `iat` · ⭐ `jti` (a unique id —
**needed for denylisting and replay detection**) · `scope` / custom claims.

⚠️ **Keep tokens small** — they're sent on every request. ⚠️ **And don't put slow-changing authorization data
in them** (a permission list) unless you accept it being stale for the token's lifetime.

---

## In your own words

**⭐ State the fundamental trade in one sentence.**

>

**When is a session the better choice? When does a JWT earn its cost?**

>

**Why must you never put a secret in a JWT?**

>

**⭐ Describe the `alg: none` attack and the one-line fix.**

>

**⭐ Describe HS/RS confusion. Why does RS256 justify its cost?**

>

**⭐ Why is the `aud` check the one people skip, and what does skipping it allow?**

>

**⭐ Demonstrate the revocation problem in three sentences, citing what you measured.**

>

**⭐ Name the four fixes. What does refresh-token reuse detection actually give you?**

>

**⭐ Why not localStorage — and why is "just prevent XSS" not an answer?**

>

**⭐ What's the question underneath all the revocation workarounds?**

>

---

## Links

- ⭐ **You built and broke it** → [`../lab/jwt/run.js`](../lab/jwt/run.js)
- ⭐ **Gate Q1** → [`../GATE.md`](../GATE.md)
- Where tokens come from → [03-oauth-and-oidc.md](03-oauth-and-oidc.md)
- XSS and CSRF in detail → [10-owasp-top-10.md](10-owasp-top-10.md)
- AuthN vs AuthZ → [01-authn-vs-authz.md](01-authn-vs-authz.md)
- Redis for denylists/sessions → [Phase 5](../../phase-05-caching/notes/)
