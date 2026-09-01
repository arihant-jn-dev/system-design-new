# 10·03 · OAuth 2.0 & OIDC

> **Why this exists:** "users log in with Google" appears constantly, and ⭐ **the single most common
> confusion — OAuth is authorization, OIDC is authentication — is exactly what an interviewer listens for.**

---

## Reference

### ⭐ The distinction that matters

| | **OAuth 2.0** | ⭐ **OpenID Connect (OIDC)** |
|---|---|---|
| Answers | ⭐ **"may this app access that resource?"** — *authorization* | ⭐ **"who is this user?"** — *authentication* |
| Gives you | an **access token** (opaque to you) | ⭐ **an ID token — a JWT with identity claims** |
| Built for | *"let Spotify read my Google contacts"* | *"log in with Google"* |
| | | ⭐ **a thin layer ON TOP of OAuth 2.0** |

> ⭐ **OAuth alone does NOT authenticate a user.** An access token means "the bearer may call this API" — it
> says nothing verifiable about *who* is present. ⭐ **Using an access token as proof of identity is a real
> vulnerability class** (a token minted for another app can be replayed at yours).
> **OIDC exists precisely to fix that**, with an ID token that has an `aud` bound to *your* client id.

### The four actors

| | |
|---|---|
| **Resource owner** | the user |
| **Client** | your app |
| **Authorization server** | Google, Okta, Auth0, Keycloak |
| **Resource server** | the API holding the data |

### ⭐ Authorization Code + PKCE — the default flow

⭐ **This is the answer for essentially every user-facing app now — web, SPA and mobile alike.**

```
1. app → browser → authorization server
     ?response_type=code &client_id &redirect_uri &scope &state
     &code_challenge=SHA256(verifier)          ⭐ PKCE
2. user authenticates and consents
3. server redirects back:  ?code=…&state=…
4. ⭐ app exchanges the code BACK-CHANNEL (server to server):
     code + client_secret + code_verifier  →  access + refresh + id token
```

⭐ **Why the code exchange exists at all:** the code travels through the *browser* (URL, history, logs,
referrer), so it's assumed to leak. **It's single-use, short-lived, and useless without the second half of
the exchange.**

⭐ **PKCE (`code_verifier`/`code_challenge`)** closes the gap for clients that can't hold a secret — a SPA or
a mobile app ships its "secret" to every user, so there is no secret. **PKCE proves the app redeeming the
code is the same one that requested it.** ⭐ **Now recommended for confidential clients too**, so treat it as
always-on.

⚠️ **`state` is a CSRF defence** — a random value you generate, store, and verify on return. Without it an
attacker can force *their* authorization code into *your* session (account linking attacks).
⚠️ **And validate `redirect_uri` by exact match on the server side** — open redirects here are how codes get
stolen.

### The other flows, and when

| Flow | Use | Notes |
|---|---|---|
| ⭐ **Authorization Code + PKCE** | ⭐ **web, SPA, mobile — the default** | |
| ⭐ **Client Credentials** | ⭐ **machine-to-machine**, no user present | your service calling another's API ([04](04-service-to-service-auth.md)) |
| **Device Code** | TVs, CLIs, anything without a browser | user visits a URL and types a code |
| **Refresh Token** | getting a new access token | ⭐ **rotate them** ([02](02-sessions-and-tokens.md)) |
| ⚠️ **Implicit** | ⭐ **deprecated** — the token came back in the URL fragment | superseded by code+PKCE |
| ⚠️ **Resource Owner Password** | ⭐ **deprecated** — your app handles the user's password, defeating the point | only for legacy first-party migration |

⚠️ **Naming Implicit and ROPC as deprecated, and saying why, is a quick credibility win.**

### ⭐ The three tokens — keep them straight

| Token | For | Audience | Lifetime |
|---|---|---|---|
| ⭐ **Access token** | calling APIs | ⭐ **the resource server** | minutes |
| ⭐ **ID token** | ⭐ **telling YOUR app who logged in** | ⭐ **your client id** | short; ⭐ **not for API calls** |
| **Refresh token** | getting new access tokens | the authorization server | days–months; ⭐ **stored, revocable** |

⚠️ **Do not send the ID token to APIs, and do not use the access token to identify the user.** Each has an
audience, and ⭐ **the audience is the whole point.**

### Validating what you receive

⭐ **Verify the ID token properly** — signature via the provider's **JWKS** (`/.well-known/jwks.json`, cached,
keys rotate), `iss`, ⭐ **`aud` = your client id**, `exp`, and the `nonce` you sent. ⭐ **Pin the algorithm**
([02](02-sessions-and-tokens.md)).

**Access tokens** are either a JWT you validate the same way, or opaque — then you call the provider's
**introspection** endpoint (⚠️ *a network call per request; cache it briefly*).

⚠️ **A trap worth naming: `email_verified`.** If you match users by email and the provider hasn't verified
it, ⭐ **an attacker who registers `victim@example.com` at a sloppy provider takes over the account.** Match
on `iss` + `sub`, and only trust `email` when `email_verified` is true.

### SSO, SAML, and the vocabulary

⭐ **SSO** = one login across many apps, via a shared identity provider — **OIDC is how you'd build it
today**. **SAML** is the older XML-based enterprise standard; ⚠️ **you'll still meet it, because large
enterprise customers require it** — awareness is enough. **SCIM** handles user *provisioning/deprovisioning*
(⭐ *"an employee left — remove them everywhere"*, which SSO alone doesn't do).

⭐ **"Enterprise SSO" is usually a SALES requirement before a security one** — the same pattern as dedicated
databases in [Phase 8's multi-tenancy](../../phase-08-architecture/notes/10-multi-tenancy.md).

### Consent & scopes

⭐ **Scopes limit what a token can do** — request the minimum, and show the user what they're granting.
⚠️ **Scope creep ("just ask for everything") is both a privacy problem and a conversion problem** — users
decline broad consent screens. ⭐ **Incremental authorization** — ask for more only when the feature needs it.

---

## In your own words

**⭐ OAuth vs OIDC in one sentence each. What's the vulnerability in confusing them?**

>

**Name the four actors.**

>

**⭐ Walk the authorization code flow. Why does the code exchange exist?**

>

**⭐ What does PKCE solve, and why does a SPA have no secret?**

>

**What is `state` for?**

>

**⭐ Which flows are deprecated, and why each?**

>

**⭐ The three tokens — audience and purpose of each. What must you never do?**

>

**⭐ How do you validate an ID token? What's the `email_verified` trap?**

>

**SSO, SAML, SCIM — one line each. What does SSO alone not solve?**

>

---

## Links

- Token handling, storage, revocation → [02-sessions-and-tokens.md](02-sessions-and-tokens.md)
- Client credentials for machines → [04-service-to-service-auth.md](04-service-to-service-auth.md)
- Scopes → [06-api-keys-scopes-quotas.md](06-api-keys-scopes-quotas.md)
- CSRF, open redirects → [10-owasp-top-10.md](10-owasp-top-10.md)
- ⭐ Buy this, never build it → [Phase 8 note 14](../../phase-08-architecture/notes/14-build-vs-buy.md)
