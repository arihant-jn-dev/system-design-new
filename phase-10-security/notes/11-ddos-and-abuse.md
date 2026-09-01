# 10·11 · DDoS Mitigation, Abuse & Fraud

> **Why this exists:** ⭐ **the framing that makes this a design topic rather than an ops one is
> COST-OF-ATTACK ASYMMETRY** — and once you have it, most mitigations become obvious.

---

## Reference

### ⭐ The asymmetry, which is the whole idea

> ⭐ **Every request should cost the ATTACKER more than it costs YOU. Most vulnerabilities to overload are
> places where that ratio is inverted.**

⚠️ **Where it's inverted, and these are design bugs:**

| The attacker sends | You spend |
|---|---|
| a 60-byte DNS query | ⭐ **a 4,000-byte response** (amplification) |
| one login attempt | ⭐ **84 ms of CPU on a password hash** ([08](08-password-storage.md)) |
| `?page=100000` | a deep-paging scan across every shard ([Phase 9 note 06](../../phase-09-building-blocks/notes/06-search-and-inverted-index.md)) |
| one nested GraphQL query | ⭐ **thousands of resolver calls** ([Phase 8 note 09](../../phase-08-architecture/notes/09-bff-and-api-composition.md)) |
| a 10 KB zip | a 10 GB decompression (zip bomb) |
| one image URL | an on-demand resize ([Phase 9 note 13](../../phase-09-building-blocks/notes/13-media-pipelines.md)) |

⭐ **Fix the asymmetry and the attack stops being economical:** cap it, cost it, cache it, or require auth
before you do the expensive part.

### L3/L4 vs L7

| | **L3/L4 — volumetric** | ⭐ **L7 — application** |
|---|---|---|
| Looks like | SYN floods, UDP amplification, 2 Tbps of noise | ⭐ **plausible HTTP requests** |
| Goal | saturate your pipe | ⭐ **exhaust your CPU, DB or connections** |
| Detected by | traffic volume | ⚠️ **hard — it looks like real users** |
| Mitigated by | ⭐ **anycast + scrubbing centres — you must buy this** | ⭐ **rate limits, WAF, bot detection, load shedding** |

⭐ **Volumetric defence is not something you build.** If 2 Tbps arrives, your origin is gone before any code
runs — ⭐ **you need a provider with more capacity than the attacker** (Cloudflare, Akamai, AWS Shield).
**Anycast is the mechanism: the attack is spread across hundreds of PoPs instead of concentrating on one.**

⭐ **L7 is the one you design for.** *"Add a CDN"* is a real answer to a volumetric attack; ⭐ **it is not an
answer to 10,000 requests/sec of expensive, cache-missing search queries** — that's rate limiting, shedding
and cost caps ([Phase 7 note 05](../../phase-07-reliability/notes/05-load-shedding.md)).

### The layered defence

```
anycast + scrubbing  →  WAF  →  bot detection  →  rate limits  →  ⭐ load shedding  →  app
     (volumetric)      (known    (behavioural)     (per key)      (the honest last
                       patterns)                                   line: reject early
                                                                   and cheaply)
```

⭐ **Reject as early and as cheaply as possible.** A request dropped at the edge costs you nothing; one
rejected after auth and a DB lookup has already cost you most of the work.

⚠️ **WAF caveats worth stating:** signature-based rules are bypassable, ⭐ **false positives block real
customers** (a user writing about SQL in a support ticket), and ⭐ **you should run it in "log only" mode
first** — the classic self-inflicted outage is turning a WAF to blocking on day one.

### ⭐ Hiding the origin

⚠️ **A CDN is useless if the attacker can reach your origin IP directly.** ⭐ **Lock the origin's firewall to
the CDN's IP ranges, and require a shared secret header from the CDN.** ⚠️ **Watch the leaks: DNS history,
an SSL certificate transparency log, an old subdomain, a direct-connecting mail server, or an error page
that reveals the origin.**

### Bot detection & CAPTCHA

⭐ **A ladder, not a switch:** reputation (IP, ASN, prior behaviour) → behavioural signals (mouse movement,
timing, ordering) → ⭐ **a proof-of-work or invisible challenge** (Turnstile/hCaptcha) → an interactive
CAPTCHA only as a last resort.

⭐ **Proof-of-work is the purest expression of the asymmetry idea: make each attempt cost the client real CPU
so a million attempts become expensive, while one attempt is imperceptible.**

⚠️ **CAPTCHAs are an accessibility and conversion problem** — ⭐ **trigger them on risk, not universally.**

### ⭐ Abuse & fraud

**Distinct from DDoS: the attacker wants *value*, not downtime — and they look like a user because they
are one.**

| Attack | Defence |
|---|---|
| ⭐ **Credential stuffing** | ⭐ **breached-password checks**, MFA, per-account *and* per-IP limits, ⭐ **device fingerprinting**, and **alert on the pattern: many accounts, few attempts each** — which per-account limits alone won't see |
| **Card testing** | velocity limits on payment attempts, 3DS, ⭐ **a per-card and per-device counter, not just per-user** |
| **Promo/referral abuse** | one signup per device/payment method; ⭐ **graph analysis — the same device across 500 "users"** |
| **Scraping** | rate limits, ⭐ **cost the expensive endpoints**, watermarking |
| **Spam / fake accounts** | ⭐ **shadow bans** — the account works normally but its content is invisible, ⭐ **so the abuser doesn't know to make a new one.** Removing the feedback signal is the point |
| **Account takeover** | MFA, re-auth for sensitive actions, notify on new device |

⭐ **Velocity checks are the workhorse:** *"N of X per Y"* per user, per IP, per device, per card, per ASN.
⚠️ **The signal is almost always the ratio across dimensions, not the raw count on one.**

⚠️ **And every abuse control has false positives that hurt real users.** ⭐ **Design the appeal path and the
manual-review queue as part of the system** — a fraud system without a way to be wrong gracefully generates
support load and churn.

### ⭐ What to say in a design

> *"Volumetric DDoS I'd buy — anycast and scrubbing at the edge, with the origin firewalled to the CDN's
> ranges. ⭐ **The interesting one is L7, and I'd look for cost asymmetries in my own design**: the login
> endpoint burns 84 ms on a password hash, and search is unbounded, so both get their own rate limits and a
> concurrency bulkhead. ⭐ **Then load shedding as the honest last line — reject early and cheaply, shed
> low-priority traffic first.** For abuse, velocity checks across user/IP/device and a shadow-ban rather than
> a hard block, so the abuser doesn't learn to evade."*

---

## In your own words

**⭐ State the cost-of-attack asymmetry principle, and give three places it's inverted in a typical design.**

>

**L3/L4 vs L7 — which do you buy, and which do you design for? Why?**

>

**⭐ Why is "add a CDN" a real answer to one and not the other?**

>

**Draw the layered defence. Why reject early?**

>

**⭐ Two WAF caveats, and how you'd roll one out.**

>

**⭐ How does an attacker bypass your CDN, and how do you stop that?**

>

**Why is proof-of-work the purest form of the asymmetry idea?**

>

**⭐ How does credential stuffing evade per-account rate limits, and what catches it?**

>

**⭐ Why is a shadow ban more effective than a hard block?**

>

**⭐ What must you design alongside every abuse control?**

>

---

## Links

- ⭐ Load shedding — the honest last line → [Phase 7 note 05](../../phase-07-reliability/notes/05-load-shedding.md)
- Rate limiting → [Phase 9 note 03](../../phase-09-building-blocks/notes/03-rate-limiter-as-a-component.md)
- Bulkheads for expensive endpoints → [Phase 7 note 04](../../phase-07-reliability/notes/04-bulkheads-and-isolation.md)
- ⭐ A slow hash is a DoS surface → [08-password-storage.md](08-password-storage.md)
- Unbounded GraphQL query cost → [Phase 8 note 09](../../phase-08-architecture/notes/09-bff-and-api-composition.md)
- Deep paging → [Phase 9 note 06](../../phase-09-building-blocks/notes/06-search-and-inverted-index.md)
- CDN and edge behaviour → [Phase 5](../../phase-05-caching/notes/)
