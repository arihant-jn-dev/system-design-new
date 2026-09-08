# Authentication & Authorization — Complete System Design Guide
## Every Method, When to Use It, and How It Works

> **The #1 confusion in system design interviews:**
> Mixing up Authentication and Authorization.
> They are completely different problems, solved by different tools.
>
> **Authentication** = "Who are you?" → Prove your identity.
> **Authorization** = "What can you do?" → Check your permissions.
>
> You must authenticate BEFORE you can authorize.

---

## PART 0 — Authentication vs Authorization (The Foundation)

```
AUTHENTICATION (AuthN)                    AUTHORIZATION (AuthZ)
──────────────────────────────────────────────────────────────────────────────
"Who are you?"                            "What are you allowed to do?"
Verifying identity                        Granting or denying access
Happens FIRST                             Happens AFTER authentication
Result: You are User X                    Result: User X can do A, B but not C

REAL WORLD ANALOGY:
  AUTHENTICATION → Airport security check (Are you who your passport says?)
  AUTHORIZATION  → Boarding pass check   (Are you allowed on THIS flight?)

  Step 1 (AuthN): Guard checks your passport → "Yes, this is John Smith."
  Step 2 (AuthZ): Gate agent checks ticket → "John Smith has access to Gate B7."

SYSTEM ANALOGY:
  AuthN: User sends username + password → System confirms: "This is User #42"
  AuthZ: System checks: "User #42 has role=ADMIN, can access /admin endpoints"

THE ERROR CODES:
  401 Unauthorized  → Authentication failed (you didn't prove who you are)
                       (poorly named — should be "401 Unauthenticated")
  403 Forbidden     → Authorization failed (you're known, but not allowed here)

COMMON MISTAKE:
  Returning 401 when you should return 403.
  If user is logged in but accessing something they can't → 403, not 401.
```

---

## PART 1 — Key Terms You Must Know

```
TERM                DEFINITION
──────────────────────────────────────────────────────────────────────────────
Credential          Proof of identity (password, fingerprint, token, certificate)
Principal           The entity being authenticated (user, service, device)
Identity Provider   Service that manages identities and authenticates users
(IdP)               Examples: Google, Microsoft Azure AD, Okta, Auth0
Service Provider    The app/service that relies on the IdP for authentication
(SP)
Token               A piece of data that represents authenticated identity
                    Can be opaque (random string) or self-contained (JWT)
Access Token        Short-lived credential used to access protected resources
Refresh Token       Long-lived credential used to get new access tokens
Session             Server-side record of a user's authenticated state
Cookie              Browser storage mechanism — often used to hold session ID
Claim               A statement about a subject (name, email, role, expiry)
Scope               What resources/actions an access token is permitted for
                    Example: scope="read:emails write:calendar"
Bearer Token        "Whoever bears (has) this token gets access"
                    No proof of possession required — just having it is enough
PKCE                Proof Key for Code Exchange — prevents auth code theft
                    Used in mobile/SPA OAuth flows
Nonce               A random one-time value — prevents replay attacks
State Parameter     Random value in OAuth to prevent CSRF attacks
SSO                 Single Sign-On — log in once, access many services
Federation          Trusting another organization's identity provider
MFA / 2FA           Multi-Factor / Two-Factor Authentication
                    Something you KNOW + HAVE + ARE (password + OTP + fingerprint)
mTLS                Mutual TLS — both client and server verify each other
JWK                 JSON Web Key — public key used to verify JWT signatures
JWKS                JSON Web Key Set — endpoint serving public keys
Opaque Token        Random string — must call auth server to validate (no info inside)
Self-contained Token JWT — contains claims inside, can be verified locally
Introspection       Asking the auth server "is this token valid?" (for opaque tokens)
```

---

## PART 2 — Authentication Method 1: Basic Authentication

### What It Is

```
The simplest possible authentication method.
Username and password sent directly with every HTTP request.

FORMAT:
  Authorization: Basic <base64(username:password)>

  username = "alice"
  password = "secret123"
  encoded  = base64("alice:secret123") = "YWxpY2U6c2VjcmV0MTIz"

  HTTP Header:
  Authorization: Basic YWxpY2U6c2VjcmV0MTIz

NOTE: base64 is ENCODING, not ENCRYPTION.
      Anyone who intercepts this header can decode it instantly.
      ALWAYS use HTTPS with Basic Auth.
```

### How It Works — Request Flow

```
CLIENT                              SERVER
  │                                   │
  │── GET /api/data ──────────────────►│
  │   Authorization: Basic abc123      │
  │                                   │ 1. Decode base64 → "alice:secret123"
  │                                   │ 2. Look up "alice" in database
  │                                   │ 3. Hash "secret123" and compare
  │                                   │ 4. If match → process request
  │◄── 200 OK ─────────────────────── │
  │                                   │
  │── GET /api/other ─────────────────►│
  │   Authorization: Basic abc123      │ ← SENT AGAIN on every request!
  │◄── 200 OK ─────────────────────── │

EVERY single request carries credentials.
Server must verify credentials every time (database lookup every time).
```

### Pros and Cons

```
PROS:
  ✓ Extremely simple to implement
  ✓ Stateless — server needs no session storage
  ✓ Works with every HTTP client
  ✓ Good for simple internal APIs or scripts

CONS:
  ✗ Credentials sent on EVERY request → more exposure surface
  ✗ Can't log out (no token to revoke) — must change password
  ✗ No expiry — stolen credentials work forever
  ✗ Database hit on every request (slow at scale)
  ✗ Users can't grant partial access to third parties

USE WHEN:
  → Simple scripts, CLI tools, internal APIs
  → Testing environments
  → Legacy systems
  → When simplicity is more important than security features

DO NOT USE WHEN:
  → Public-facing user authentication
  → Mobile or SPA applications
  → When you need token revocation
  → When credentials shouldn't traverse the wire repeatedly
```

---

## PART 3 — Authentication Method 2: Session-Based Authentication

### What It Is

```
The traditional "stateful" approach to web authentication.
Server creates and stores a session; client gets only a session ID (cookie).
Credentials are verified ONCE — subsequent requests use the session ID.

THE KEY DIFFERENCE FROM BASIC AUTH:
  Basic Auth:   Send credentials every request
  Session Auth: Verify credentials once → give the client a session ID ticket
                Client sends only the ticket on subsequent requests
```

### How It Works — Complete Flow

```
STEP 1: LOGIN (Credentials verified ONCE)

CLIENT                              SERVER                         SESSION STORE
  │                                   │                                │
  │── POST /login ────────────────────►│                               │
  │   { username: "alice",             │                               │
  │     password: "secret123" }        │                               │
  │                                   │ 1. Verify credentials         │
  │                                   │ 2. Create session record      │
  │                                   │────── STORE ──────────────────►│
  │                                   │   session_id: "abc123xyz"      │
  │                                   │   user_id: 42                  │
  │                                   │   created_at: 2024-01-01       │
  │                                   │   expires_at: 2024-01-02       │
  │◄── 200 OK ─────────────────────── │                               │
  │   Set-Cookie: sessionId=abc123xyz  │                               │
  │   (httpOnly, Secure, SameSite)     │                               │

STEP 2: SUBSEQUENT REQUESTS (No credentials needed)

CLIENT                              SERVER                         SESSION STORE
  │                                   │                                │
  │── GET /api/profile ───────────────►│                               │
  │   Cookie: sessionId=abc123xyz      │                               │
  │                                   │ 1. Extract session ID          │
  │                                   │────── LOOKUP ─────────────────►│
  │                                   │◄── session data (user_id=42) ──│
  │                                   │ 2. Fetch user profile          │
  │◄── 200 OK (profile data) ─────────│                               │

STEP 3: LOGOUT (Session destroyed)

CLIENT                              SERVER                         SESSION STORE
  │── POST /logout ───────────────────►│                               │
  │   Cookie: sessionId=abc123xyz      │────── DELETE ─────────────────►│
  │                                   │   (session "abc123xyz" removed) │
  │◄── 200 OK ─────────────────────── │                               │
  Cookie cleared on client side.
  Even if attacker has the old session ID → server says "session not found."
```

### Cookie Security Attributes

```
Set-Cookie: sessionId=abc123xyz; HttpOnly; Secure; SameSite=Strict; Path=/

ATTRIBUTE      WHAT IT DOES
─────────────────────────────────────────────────────────────────────────────
HttpOnly       Cookie is NOT accessible via JavaScript (document.cookie)
               → Protects against XSS attacks stealing the session

Secure         Cookie is ONLY sent over HTTPS connections
               → Prevents interception over HTTP

SameSite=Strict  Cookie NOT sent on cross-site requests
               → Prevents CSRF attacks (your site can't be triggered from evil.com)

SameSite=Lax   Cookie sent on same-site + top-level navigations
               → Balance between security and usability

Path=/         Cookie applies to all paths on this domain
               (Can restrict to /api if needed)

Expires / Max-Age  When the cookie expires automatically
```

### Pros and Cons

```
PROS:
  ✓ Simple mental model — session = logged-in state
  ✓ Easy to revoke (delete session from store)
  ✓ Browsers handle cookies automatically
  ✓ No sensitive data on the client (just a random session ID)
  ✓ Works great for traditional web apps

CONS:
  ✗ STATEFUL — server must store sessions (Redis, DB)
  ✗ Scaling challenge: sticky sessions or shared session store needed
  ✗ CSRF vulnerability if cookies not configured correctly
  ✗ Doesn't work well for mobile apps or non-browser clients
  ✗ Session store = single point of failure

USE WHEN:
  → Traditional server-rendered web apps (Django, Rails, Express)
  → When you need easy revocation (admin panels, banking)
  → When clients are browsers (cookies work natively)

SESSION STORAGE OPTIONS:
  Memory:    Fast but not shared across servers → can't scale
  Redis:     Fast, shared, supports expiry → BEST choice for sessions
  Database:  Slower but persistent → use for long-lived sessions
```

---

## PART 4 — Authentication Method 3: Token-Based Authentication (JWT)

### What It Is

```
JWT = JSON Web Token.
A self-contained, cryptographically signed token that carries claims (data).
The server does NOT store the token — it just validates the signature.

"Stateless authentication" — server can verify any JWT without a database lookup.

JWT STRUCTURE:
  header.payload.signature
  (each part is base64url encoded)

EXAMPLE JWT (decoded):

HEADER:
{
  "alg": "HS256",      ← Algorithm used for signature
  "typ": "JWT"
}

PAYLOAD (Claims):
{
  "sub": "42",          ← subject: who this token is for (user ID)
  "name": "Alice",
  "email": "alice@example.com",
  "role": "admin",
  "iat": 1700000000,    ← issued at (Unix timestamp)
  "exp": 1700003600,    ← expires at (1 hour later)
  "iss": "myapp.com"    ← issuer: who created this token
}

SIGNATURE:
  HMAC_SHA256(base64(header) + "." + base64(payload), SECRET_KEY)

FULL TOKEN:
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
  eyJzdWIiOiI0MiIsIm5hbWUiOiJBbGljZSIsInJvbGUiOiJhZG1pbiIsImV4cCI6MTcwMDAwMzYwMH0.
  SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

### How It Works — Complete Flow

```
STEP 1: LOGIN — Server creates and returns JWT

CLIENT                              AUTH SERVER
  │── POST /auth/login ──────────────►│
  │   { username, password }           │
  │                                   │ 1. Verify credentials
  │                                   │ 2. Create JWT with user data
  │                                   │ 3. Sign with secret key
  │◄── 200 OK ─────────────────────── │
  │   { access_token: "eyJ...",        │
  │     refresh_token: "xyz...",       │
  │     expires_in: 3600 }            │
  │                                   │
  Client stores tokens (localStorage / memory / httpOnly cookie)

STEP 2: USING THE TOKEN — No database lookup needed!

CLIENT                              API SERVER
  │── GET /api/profile ───────────────►│
  │   Authorization: Bearer eyJ...     │
  │                                   │ 1. Split header.payload.signature
  │                                   │ 2. Verify signature with SECRET_KEY
  │                                   │    (or PUBLIC_KEY for RS256)
  │                                   │ 3. Check exp claim → not expired?
  │                                   │ 4. Extract user_id=42, role=admin
  │                                   │    from payload — NO DB LOOKUP!
  │◄── 200 OK (profile) ──────────────│

STEP 3: TOKEN REFRESH — Before access token expires

CLIENT                              AUTH SERVER
  │── POST /auth/refresh ─────────────►│
  │   { refresh_token: "xyz..." }      │
  │                                   │ 1. Validate refresh token
  │                                   │    (stored in DB for refresh tokens)
  │                                   │ 2. Issue NEW access token
  │◄── 200 OK ─────────────────────── │
  │   { access_token: "eyJ...NEW" }    │

TYPICAL TOKEN LIFETIMES:
  Access Token:   15 minutes to 1 hour   (short — limits damage if stolen)
  Refresh Token:  7 to 30 days           (long — stored server-side for revocation)
```

### JWT Signing Algorithms

```
ALGORITHM    TYPE           KEY           USE CASE
────────────────────────────────────────────────────────────────────────────
HS256        Symmetric      Secret key    Simple setup, same key signs + verifies
             (HMAC SHA256)               ← Don't use when multiple services need to verify

RS256        Asymmetric     Private key   Auth server signs with PRIVATE key
             (RSA SHA256)   signs         API servers verify with PUBLIC key
                            Public key    ← Best for distributed systems / microservices
                            verifies

ES256        Asymmetric     Private key   Like RS256 but smaller keys, faster
             (ECDSA)        signs         ← Modern choice — preferred over RS256

RULE: If only ONE service verifies the token → HS256 is fine.
      If MULTIPLE services verify the token → RS256 or ES256.
      Publish public keys at /.well-known/jwks.json (JWKS endpoint).
```

### JWT vs Sessions — The Core Tradeoff

```
JWT (STATELESS)                          SESSION (STATEFUL)
─────────────────────────────────────────────────────────────────────────────
No server-side storage                   Server stores session data
Any server can verify independently      All servers must share session store
Hard to revoke before expiry             Easy to revoke (delete from store)
Token size grows with claims (~200-500B) Session ID is tiny (~32 bytes)
Scales horizontally easily               Needs Redis/shared store to scale
User data embedded in token              Server fetches user data per request
Good for microservices                   Good for monolithic web apps
Risk: token stolen = valid until expiry  Risk: session store down = no auth

THE REVOCATION PROBLEM:
  JWT is valid until it expires. You cannot "log out" a JWT unless:
  1. Keep a "blocklist" of revoked JWTs (stored in Redis) → adds statefulness
  2. Use very short expiry (15 min) + refresh tokens
  3. Use token versioning (user has "version" field in DB; JWT includes version)
```

---

## PART 5 — Authentication Method 4: API Keys

### What It Is

```
A long, random, secret string assigned to a client (app or user).
Used for identifying who is making API calls, especially for server-to-server.

FORMAT:
  Authorization: Bearer sk-1234567890abcdefghijklmnopqrstuvwxyz
  OR
  X-API-Key: sk-1234567890abcdefghijklmnopqrstuvwxyz
  OR as query param (NOT recommended):
  GET /api/data?api_key=sk-12345...

REAL EXAMPLES:
  OpenAI:     "sk-proj-xxxxxxxxxxxxxxxxxxxx"
  Stripe:     "sk_live_<24_random_chars>"
  GitHub:     "ghp_xxxxxxxxxxxxxxxxxxxxxxxx"
  SendGrid:   "SG.xxxxxxxxxxxxxxxx.yyyyyyyy"
```

### How It Works

```
CREATION:
  Developer signs up → generates API key → stores it (shown ONCE, then hashed)
  Server stores: SHA256(api_key) in database (never the raw key)

  User sees:    sk-abc123def456
  DB stores:    SHA256("sk-abc123def456") = "9f4a8c..."
                + associated user_id, permissions, rate_limits, created_at

REQUEST:
  Client ─── GET /api/data ──────────────────────────────────────► Server
             X-API-Key: sk-abc123def456
                                                         1. SHA256(received key)
                                                         2. Look up hash in DB
                                                         3. Get user_id, permissions
                                                         4. Check rate limits
                                                         5. Process request

IMPORTANT: API keys are typically OPAQUE (like random session IDs).
           Server must always look them up in a database.
           Unlike JWT — no self-contained verification.
```

### API Key Best Practices

```
GENERATION:
  ✓ Use cryptographically secure random generator
  ✓ Minimum 256 bits (32 bytes) of entropy
  ✓ Include a prefix for easy identification (stripe: sk_live_, openai: sk-)
  ✓ Show the key ONLY ONCE at creation time

STORAGE (Server Side):
  ✓ Store only the HASH (SHA-256) of the key — never the raw key
  ✓ Same principle as storing passwords
  ✓ If DB is breached → attacker can't use the hashes directly

STORAGE (Client Side):
  ✓ Environment variables (.env files), never hard-code in source
  ✓ Secret management services (AWS Secrets Manager, HashiCorp Vault)
  ✗ NEVER commit to git
  ✗ NEVER put in frontend/browser code

FEATURES TO BUILD:
  ✓ Per-key rate limiting (100 req/min per key)
  ✓ Per-key permission scopes (read-only vs read-write)
  ✓ Key expiry dates
  ✓ Key rotation without downtime
  ✓ Audit logs (which key called what, when)
  ✓ IP allowlisting per key
```

### Pros and Cons

```
PROS:
  ✓ Simple to implement and use
  ✓ Works for any client (scripts, server apps, SDKs)
  ✓ Easy to issue, rotate, and revoke per client
  ✓ Granular permissions per key
  ✓ No user involved — purely machine-to-machine

CONS:
  ✗ Opaque — requires DB lookup every request
  ✗ Long-lived — if stolen, valid until revoked
  ✗ No expiry by default (must implement manually)
  ✗ No user identity unless you associate key with user
  ✗ Single factor — just knowing the key is enough

USE WHEN:
  → Server-to-server API calls (backend calling another backend)
  → Developer API products (OpenAI, Stripe, Twilio)
  → When clients are not browsers (no CSRF concern)
  → When you want simple, long-lived access for trusted clients
```

---

## PART 6 — Authentication Method 5: OAuth 2.0

### What It Is

```
OAuth 2.0 is an AUTHORIZATION framework (not authentication!).
It allows users to grant third-party apps LIMITED access to their data
WITHOUT giving the app their password.

EXAMPLE: "Log in with Google" on a third-party site.
  You don't give your Google password to the third-party site.
  Google asks you: "Do you allow this app to read your email?"
  You say yes → Google gives the app a token with limited permissions.

THE FOUR ROLES:
  Resource Owner:    The user (who owns the data)
  Client:            The third-party app wanting access
  Authorization Server: The service that authenticates and issues tokens
  Resource Server:   The API that holds the user's data

EXAMPLE MAPPING:
  You are using Trello and want to link your Google Calendar.
  Resource Owner:   You (the user)
  Client:           Trello (wants calendar access)
  Auth Server:      Google (accounts.google.com)
  Resource Server:  Google Calendar API
```

### The Most Common Flow: Authorization Code Flow

```
USER            CLIENT (Trello)         AUTH SERVER (Google)       RESOURCE SERVER
  │                   │                        │                          │
  │ Click             │                        │                          │
  │ "Connect Google"  │                        │                          │
  │──────────────────►│                        │                          │
  │                   │── Redirect user to ───►│                          │
  │                   │   Google OAuth URL      │                          │
  │                   │   ?client_id=trello     │                          │
  │                   │   &redirect_uri=...     │                          │
  │                   │   &scope=calendar       │                          │
  │                   │   &state=random123      │                          │
  │                   │   &response_type=code   │                          │
  │◄──────────────────│                        │                          │
  │                                            │                          │
  │ Google shows login + consent screen         │                          │
  │ "Allow Trello to access your Calendar?"    │                          │
  │──────────────────────────────────────────►│                          │
  │ You click "Allow"                           │                          │
  │                                            │                          │
  │◄── Redirect back to Trello ───────────────│                          │
  │    trello.com/callback                      │                          │
  │    ?code=AUTH_CODE_XYZ                      │                          │
  │    &state=random123  ← verify this!         │                          │
  │                   │                        │                          │
  │                   │── POST /token ─────────►│                          │
  │                   │   code=AUTH_CODE_XYZ    │                          │
  │                   │   client_id=trello      │                          │
  │                   │   client_secret=...     │                          │
  │                   │   redirect_uri=...      │                          │
  │                   │◄── access_token, ───────│                          │
  │                   │    refresh_token         │                          │
  │                   │                        │                          │
  │                   │── GET /calendar/events ─────────────────────────►│
  │                   │   Authorization: Bearer access_token               │
  │                   │◄── Calendar data ──────────────────────────────── │
  │◄── Shows calendar │                        │                          │
  │    data in Trello │                        │                          │

STATE PARAMETER: Random value Trello generates, Google echoes back.
  Trello checks: state in redirect == state it sent?
  If not → CSRF attack → reject!

WHY TWO STEPS (code then token)?
  Browser URL bar is visible. If access_token were in the URL → leaked in:
  - Browser history
  - Server logs
  - Referrer header
  Authorization code is short-lived (30 sec) and useless without client_secret.
  Token exchange happens server-to-server → never in the URL.
```

### OAuth 2.0 Grant Types (Flows)

```
GRANT TYPE              USE CASE                        When to Use
────────────────────────────────────────────────────────────────────────────
Authorization Code      Web apps with a backend server  Most common — use this
                        Most secure

Authorization Code      Mobile apps, SPAs               Same as above but with PKCE
+ PKCE                  (no client_secret possible)     (client_secret can't be hidden
                                                         in mobile/browser apps)

Client Credentials      Machine-to-machine              Service A calls Service B
                        No user involved                No user — pure service auth

Device Code             Smart TVs, CLI tools            Limited input device flow
                        Hard to type URLs

Resource Owner          Legacy, NEVER use this          Direct username/password to
Password                                                OAuth server — defeats purpose

PKCE (Proof Key for Code Exchange):
  Mobile apps can't keep client_secret secret (code can be decompiled).
  PKCE replaces client_secret with a dynamic code_verifier/code_challenge.
  code_verifier = random 64-byte string
  code_challenge = SHA256(code_verifier)  ← sent in auth request
  code_verifier → sent in token exchange  ← proves same client made both requests
```

### OAuth Scopes — Granular Permissions

```
SCOPE EXAMPLES (Google):
  https://www.googleapis.com/auth/gmail.readonly   → Read emails only
  https://www.googleapis.com/auth/gmail.send       → Send emails
  https://www.googleapis.com/auth/calendar         → Full calendar access
  profile                                          → View your name, photo
  email                                            → View your email address

SCOPE EXAMPLES (GitHub):
  repo          → Full access to repositories
  repo:read     → Read-only repo access
  user:email    → Read email addresses
  gist          → Create/edit gists

PRINCIPLE OF LEAST PRIVILEGE:
  Request ONLY the scopes you need.
  Users are more likely to approve minimal scopes.
  If your app is breached, attacker has limited access.
```

---

## PART 7 — Authentication Method 6: OpenID Connect (OIDC)

### What It Is

```
OpenID Connect = OAuth 2.0 + Identity Layer

OAuth 2.0 was designed for AUTHORIZATION (access to resources).
It answers: "Can this app access your calendar?" 
It does NOT answer: "Who is the user?"

OIDC adds AUTHENTICATION on top of OAuth 2.0.
It answers: "Who is this user?"

THE ADDITION: OIDC adds one new token → the ID Token (a JWT).
  OAuth 2.0:   access_token (for resource access) + refresh_token
  OIDC:        access_token + refresh_token + ID TOKEN (who the user is)

ID TOKEN contains:
{
  "iss": "https://accounts.google.com",    ← issuer
  "sub": "110248495819238910000",          ← unique user ID at Google
  "aud": "client_id_of_your_app",          ← audience (your app)
  "exp": 1700003600,                       ← expiry
  "iat": 1700000000,                       ← issued at
  "email": "alice@gmail.com",
  "email_verified": true,
  "name": "Alice Smith",
  "picture": "https://lh3.googleusercontent.com/..."
}

WHEN YOU USE OIDC:
  Your app learns WHO the user is (name, email, profile photo).
  Your app can create/link a local account.
  You don't need to store or verify passwords.
```

### OIDC vs OAuth 2.0 vs SAML

```
PROTOCOL       PURPOSE              TOKEN FORMAT     WHO USES IT
──────────────────────────────────────────────────────────────────────────
OAuth 2.0      Authorization only   Opaque / JWT     APIs, resource access
OIDC           AuthN + AuthZ        JWT (ID Token)   Modern "Login with X" flows
SAML 2.0       AuthN for enterprise XML assertion    Enterprise SSO (corporate)

"Login with Google" → OIDC (not just OAuth!)
AWS IAM roles        → OAuth + STS
Corporate SSO        → SAML or OIDC
```

### How "Login with Google" Actually Works (OIDC)

```
1. User clicks "Login with Google" on your app.
2. Your app redirects to Google with:
   scope=openid email profile  ← "openid" scope TRIGGERS OIDC!
3. User logs in to Google, grants consent.
4. Google redirects back with authorization code.
5. Your app exchanges code for:
   - access_token  (to call Google APIs)
   - id_token      (JWT with user's identity)
   - refresh_token (to get new tokens)
6. Your app verifies the id_token signature using Google's public keys
   (from https://accounts.google.com/.well-known/jwks.json)
7. Your app reads id_token claims: sub, email, name, picture
8. Your app creates or finds user account by "sub" (Google's unique user ID)
9. User is now "logged in" to your app.

THE "sub" CLAIM IS THE USER'S STABLE IDENTIFIER:
  Email can change → don't use email as primary key
  "sub" never changes for a given user + provider combination
  Combine: (iss, sub) = globally unique user identity
```

---

## PART 8 — Authentication Method 7: SAML 2.0

### What It Is

```
SAML = Security Assertion Markup Language (version 2.0)
An enterprise standard for Single Sign-On (SSO), especially common in:
  - Corporate environments (Okta, Azure AD, ADFS)
  - B2B SaaS products (Salesforce, Slack enterprise, GitHub Enterprise)

KEY DIFFERENCE FROM OIDC:
  OIDC: Uses JSON + JWT (modern, REST-friendly)
  SAML: Uses XML (verbose, older, but deeply entrenched in enterprise)

EXAMPLE SCENARIO:
  BigCorp uses Okta as their Identity Provider.
  All employees can log in to Salesforce, Slack, GitHub
  using their BigCorp Okta credentials — ONE login for everything.
```

### How SAML SSO Works

```
USER            SERVICE PROVIDER (Salesforce)    IDENTITY PROVIDER (Okta)
  │                        │                              │
  │ Go to salesforce.com   │                              │
  │───────────────────────►│                              │
  │                        │ User not logged in           │
  │                        │ Create SAML AuthnRequest     │
  │◄─── Redirect ──────────│                              │
  │     to Okta login page │                              │
  │                        │                              │
  │ Arrive at Okta ────────────────────────────────────►  │
  │ Enter corporate credentials (or SSO already active)   │
  │                                                      │ Verify user
  │                                                      │ Create SAML Assertion
  │                                                      │ (XML document)
  │◄────────── HTML form with SAML Response ─────────────│
  │                        │                              │
  │ Browser auto-POSTs SAML Response to Salesforce        │
  │───────────────────────►│                              │
  │                        │ Verify SAML signature         │
  │                        │ Extract: NameID (email)      │
  │                        │ Extract: Attributes (role)   │
  │                        │ Find/create user account     │
  │◄── Logged into Salesforce ─────────────────────────── │

THE SAML ASSERTION (XML) CONTAINS:
  <saml:Assertion>
    <saml:Subject>
      <saml:NameID>alice@bigcorp.com</saml:NameID>
    </saml:Subject>
    <saml:AuthnStatement AuthnInstant="2024-01-01T12:00:00Z"/>
    <saml:AttributeStatement>
      <saml:Attribute Name="email">
        <saml:AttributeValue>alice@bigcorp.com</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="role">
        <saml:AttributeValue>admin</saml:AttributeValue>
      </saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
```

---

## PART 9 — Authentication Method 8: Multi-Factor Authentication (MFA)

### What It Is

```
MFA = Using multiple INDEPENDENT forms of proof to authenticate.

THE THREE FACTORS:
  Factor 1 — KNOWLEDGE: "Something you KNOW"
    → Password, PIN, security question answer

  Factor 2 — POSSESSION: "Something you HAVE"
    → Phone (SMS/TOTP app), hardware security key (YubiKey)

  Factor 3 — INHERENCE: "Something you ARE"
    → Fingerprint, face scan, iris scan (biometrics)

2FA uses 2 factors. MFA uses 2 or more.
Using two knowledge factors (password + security question) = NOT true MFA.

WHY IT MATTERS:
  Password alone compromised → attacker still needs the second factor.
  Phishing steals your password → useless without your phone.
  Data breach exposes hashed passwords → second factor still required.
```

### MFA Methods Ranked by Security

```
METHOD            HOW IT WORKS                    SECURITY    UX
────────────────────────────────────────────────────────────────────────────
Hardware Key      Physical device (YubiKey)       ★★★★★      ★★★★
(WebAuthn/FIDO2)  Cryptographic proof of key      Phishing    Requires
                  Touch the key → signed challenge resistant   device

Authenticator App TOTP: 6-digit code from app     ★★★★       ★★★
(TOTP)            (Google Authenticator, Authy)   Changes     Slight friction
                  Time-based one-time password     every 30s

Push Notification App receives push, tap Approve  ★★★★       ★★★★★
(Duo, Okta Verify) No code to type               Vulnerable   Most convenient
                                                  to push
                                                  fatigue

Email OTP         Code sent to registered email   ★★          ★★★
                  Depends on email account security

SMS OTP           Code sent via text message      ★★          ★★★★
                  Vulnerable to SIM swapping
                  (Telco tricks to redirect your number)

Security Question "What was your first pet?"      ★           ★★
                  Not true MFA — guessable/public

TOTP HOW IT WORKS:
  User and server share a SECRET seed during setup.
  TOTP = HMAC-SHA1(secret, floor(current_time / 30))
  Every 30 seconds, both app and server compute the same 6-digit code.
  User enters the code → server computes its own code → compare.
  No network needed to generate codes (works offline)!
```

---

## PART 10 — Authentication Method 9: mTLS (Mutual TLS)

### What It Is

```
TLS (Transport Layer Security) normally:
  Client verifies SERVER's certificate. (HTTPS)
  Server does NOT verify client's identity via certificate.

mTLS (Mutual TLS):
  BOTH sides present and verify certificates.
  Client proves its identity via its own certificate.
  No passwords, no tokens — identity is the certificate itself.

USE CASE: Service-to-service communication in microservices.
  Payment Service → calls → Database Service
  Both services have certificates from the same CA.
  Each verifies the other's certificate → mutual trust established.

REAL WORLD:
  Cloudflare uses mTLS for their Zero Trust network.
  Kubernetes uses mTLS for inter-pod communication (via Istio/Linkerd).
  Banking APIs often require mTLS for enterprise clients.
```

### How mTLS Works

```
SERVICE A (Payment)                     SERVICE B (Database)
      │                                        │
      │── Client Hello ────────────────────────►│
      │                                        │◄── "Send me your certificate"
      │── Client Certificate ──────────────────►│
      │   (cert signed by trusted CA)           │ Verify signature
      │                                        │ Confirm it's signed by our CA
      │◄── Server Certificate ─────────────────│
      │   Verify: signed by trusted CA?         │
      │   Verify: hostname matches?             │
      │◄── TLS Handshake Complete ─────────────►│
      │                                        │
      │── GET /api/user/42 ────────────────────►│
      │   (Encrypted. No extra auth header.)    │ Already know who called us.
      │◄── 200 OK (user data) ─────────────────│

KEY POINT: Authentication happens at the CONNECTION level (TLS handshake).
           No tokens, no headers, no login flow.
           If the certificate is valid → you're authenticated.
```

---

## PART 11 — Authentication Method 10: Passwordless Authentication

### Magic Links

```
FLOW:
  1. User enters email address (no password).
  2. Server generates a one-time link:
     https://app.com/auth?token=random_token_here&expires=5min
  3. Server emails the link to the user.
  4. User clicks the link.
  5. Server validates: token exists? not expired? not used?
  6. Server deletes token (one-time use), creates session/JWT.
  7. User is logged in.

TOKEN SECURITY:
  ✓ Stored as hash in database
  ✓ Expires in 5-15 minutes
  ✓ Single use only (deleted after use)
  ✓ Tied to the device/browser session (optional: bind to IP)

USED BY: Notion (originally), Slack, Medium (optional), many B2B SaaS

PROS: No passwords to forget, no credential stuffing attacks possible.
CONS: Depends on email security. Slow if email is delayed.
```

### WebAuthn / Passkeys (FIDO2)

```
THE FUTURE OF AUTHENTICATION — Passwordless + Phishing-resistant.

USED BY: Apple, Google, GitHub, 1Password, Microsoft

SETUP (Registration):
  1. User visits site and registers a passkey.
  2. Browser/device generates a PUBLIC/PRIVATE key pair.
  3. PUBLIC key sent to and stored by the website.
  4. PRIVATE key stored in device's secure enclave (Secure Enclave, TPM).
     (Never leaves the device — not even visible to the OS)

LOGIN (Authentication):
  1. Site sends a random challenge to the browser.
  2. Browser asks user: fingerprint / face ID / PIN (local verification).
  3. Device signs the challenge with the PRIVATE key.
  4. Site verifies the signature with the stored PUBLIC key.
  5. Login successful!

WHY IT'S PHISHING-RESISTANT:
  The private key is bound to the ORIGIN (domain).
  Even if you're tricked to evil-google.com:
  → Your key won't sign because the origin doesn't match accounts.google.com.
  → Phishing attack fails completely.

PASSKEYS = WebAuthn stored in iCloud Keychain / Google Password Manager.
  → Same experience across your devices.
```

---

## PART 12 — Authorization Methods

```
After authentication (we know WHO you are), we must answer:
"WHAT are you allowed to do?"
```

### Method 1: ACL — Access Control List

```
WHAT IT IS:
  A list that says: "Resource X can be accessed by users A, B, C."
  Attached to the RESOURCE.

EXAMPLE (file permissions on Linux):
  /etc/passwd:   owner=root, group=root, permissions=rw-r--r--
                 (root can read/write, group can read, others can read)

EXAMPLE (AWS S3 bucket policy):
  {
    "Resource": "arn:aws:s3:::my-bucket/*",
    "Principal": { "AWS": ["arn:aws:iam::123:user/alice"] },
    "Action": ["s3:GetObject"],
    "Effect": "Allow"
  }

PROS:  Very precise control per resource.
CONS:  Doesn't scale — 1000 users × 10000 files = managing 10M entries.
       Hard to answer "what can user X access?" (need to scan all resources)
USE WHEN: Small systems, file systems, network firewalls, AWS IAM.
```

### Method 2: RBAC — Role-Based Access Control

```
WHAT IT IS:
  Users are assigned to ROLES. Permissions are granted to ROLES.
  User → Role → Permissions

EXAMPLE:
  ROLES:
    admin:   create, read, update, delete everything
    editor:  create, read, update posts; read comments
    viewer:  read posts and comments only
    moderator: delete comments, read everything

  USERS → ROLES:
    alice → admin
    bob   → editor
    carol → viewer

  REQUEST:
    Bob wants to delete a post.
    Bob has role: editor.
    Editor role does NOT have "delete posts" permission.
    → 403 Forbidden.

BENEFITS:
  ✓ Simple to understand and explain
  ✓ Easy to audit: "Who has admin access?"
  ✓ Adding a user to a role gives all permissions instantly
  ✓ Removing a role removes all permissions

LIMITATIONS:
  ✗ "Taxi driver at night in New York" problem:
     You can't express "edit posts ONLY between 9am-5pm"
     or "edit ONLY your OWN posts"
     or "view data ONLY from your country"
     Fine-grained context is not possible.

USED BY: Most web applications, operating systems, databases (MySQL, PostgreSQL).
```

### Method 3: ABAC — Attribute-Based Access Control

```
WHAT IT IS:
  Access decisions based on ATTRIBUTES of:
  - The user (age, department, clearance level, location)
  - The resource (classification, owner, creation date)
  - The environment (time of day, IP address, device type)
  - The action (read, write, admin)

POLICY EXAMPLES:
  "Allow access IF user.department == resource.department
   AND user.clearanceLevel >= resource.classification
   AND environment.time BETWEEN '09:00' AND '17:00'
   AND environment.ipAddress IN company_network"

  "Allow users to edit posts IF post.author_id == user.id
   AND user.accountStatus == 'active'
   AND post.status != 'published'"

PROS:
  ✓ Extremely fine-grained control
  ✓ Can express ANY business rule
  ✓ Fewer roles needed (attributes replace role explosion)

CONS:
  ✗ Complex to implement and reason about
  ✗ Policies can conflict — need a conflict resolution strategy
  ✗ Harder to audit ("What can user X do?")
  ✗ Performance cost — evaluating many attributes per request

USED BY: AWS IAM policies, government/military systems, healthcare (HIPAA).
```

### Method 4: ReBAC — Relationship-Based Access Control

```
WHAT IT IS:
  Access is based on RELATIONSHIPS between entities.
  "Can Alice view this document?"
  → Only if Alice is in a group that has view access to this document's folder,
    OR Alice is the document owner, OR Alice was explicitly shared the document.

MADE POPULAR BY: Google Zanzibar (the authorization system behind Google Drive,
                 Google Docs, YouTube, Maps — serving millions of checks/second)

EXAMPLE (Google Drive style):
  TUPLES:
    document:123#owner → user:alice
    document:123#viewer → group:engineering
    group:engineering#member → user:bob

  QUESTION: Can bob view document:123?
  CHECK: document:123#viewer → group:engineering → user:bob? YES ✓

REAL PRODUCTS BASED ON ZANZIBAR:
  Authzed / SpiceDB, Auth0 FGA, Ory Keto, Warrant

USED WHEN: Collaborative features (Google Drive, Notion, Figma sharing model).
```

### Method 5: PBAC — Policy-Based Access Control

```
WHAT IT IS:
  Centralized policies written in a policy language.
  Systems like OPA (Open Policy Agent) evaluate these policies.

OPA EXAMPLE (Rego language):
  package myapp.authz

  allow {
    input.user.role == "admin"
  }

  allow {
    input.user.role == "editor"
    input.action == "read"
  }

  allow {
    input.user.id == input.resource.owner_id
    input.action != "delete"
  }

YOUR APP CALLS OPA:
  POST /v1/data/myapp/authz/allow
  {
    "input": {
      "user": {"id": 42, "role": "editor"},
      "resource": {"owner_id": 42},
      "action": "update"
    }
  }
  → Response: {"result": true}

USED BY: Kubernetes (admission control), microservices authorization,
         infrastructure policy (Terraform policies).
```

---

## PART 13 — Decision Framework: Which to Use When

```
SCENARIO                                 RECOMMENDED APPROACH
──────────────────────────────────────────────────────────────────────────────

Traditional web app (e.g., Django/Rails  Session-based Auth (cookies)
  with server-rendered pages)            + RBAC for authorization
                                         Add MFA via TOTP for sensitive features

Single Page App (React/Vue/Angular)      JWT with short expiry (15-60 min)
  with REST/GraphQL API                  + Refresh tokens (httpOnly cookie)
                                         + OIDC for "Login with Google"

Mobile App (iOS/Android)                 OAuth 2.0 + PKCE (Authorization Code)
                                         + JWT as access token
                                         + Biometric/device PIN as 2nd factor

Public REST API (developer product)      API Keys for server-side callers
  (like Stripe, Twilio, OpenAI)          + Rate limiting per key
                                         + Scoped permissions per key

Microservices (service-to-service)       mTLS for network-level auth
  internal communication                 + JWT for request-level identity propagation
                                         + Service mesh (Istio) manages certs

Enterprise SSO (corporate users         SAML 2.0 or OIDC
  logging into your SaaS product)        Integrate with Okta/Azure AD/OneLogin
                                         Let the IdP handle the authentication

User needs to grant app access           OAuth 2.0 Authorization Code Flow
  to their data (integrations)           with PKCE for mobile/SPA

High-security application                Passkeys (WebAuthn) as primary auth
  (banking, healthcare)                  + MFA (hardware key or TOTP)
                                         + Short session timeouts
                                         + mTLS for service-to-service

Complex permission rules                 ABAC or ReBAC
  (Google Drive-like sharing)            (Zanzibar model for at-scale)
  (user can edit ONLY their own posts)

Simple role-based permissions            RBAC
  (most web apps)                        Well-understood, easy to audit
```

---

## PART 14 — Real-World Examples

### Example 1: How "Login with Google" Works End-to-End

```
SETUP (one-time, by developer):
  1. Register app at console.cloud.google.com
  2. Get client_id and client_secret
  3. Set redirect_uri: https://yourapp.com/auth/google/callback

USER FLOW:
  1. User clicks "Login with Google"
  2. Your app redirects to:
     https://accounts.google.com/o/oauth2/v2/auth
     ?client_id=YOUR_CLIENT_ID
     &redirect_uri=https://yourapp.com/auth/google/callback
     &response_type=code
     &scope=openid email profile
     &state=RANDOM_STATE_VALUE
     &nonce=RANDOM_NONCE_VALUE

  3. User logs in to Google (if not already), consents.
  4. Google redirects to your callback:
     https://yourapp.com/auth/google/callback
     ?code=4/P7q7W91a-oMsCeLvIaQm6bTrgtp7
     &state=RANDOM_STATE_VALUE  ← verify this matches!

  5. Your server calls Google:
     POST https://oauth2.googleapis.com/token
     {
       code: "4/P7q7W91a...",
       client_id: "YOUR_CLIENT_ID",
       client_secret: "YOUR_SECRET",
       redirect_uri: "https://yourapp.com/auth/google/callback",
       grant_type: "authorization_code"
     }

  6. Google responds:
     {
       access_token: "ya29.a0ARrdaM...",
       id_token: "eyJhbGciOiJSUzI...",  ← JWT
       expires_in: 3600,
       refresh_token: "1//04dU..."
     }

  7. Your server verifies id_token signature using:
     GET https://www.googleapis.com/oauth2/v3/certs  ← Google's public keys

  8. Decode id_token → get: sub, email, name, picture
  9. CREATE or FIND user by (iss="accounts.google.com", sub="110248...")
  10. Issue your own session/JWT to the user.
```

### Example 2: How GitHub API Keys Work

```
DEVELOPER SETUP:
  GitHub → Settings → Developer settings → Personal access tokens → Generate new

ARCHITECTURE:
  Token shown ONCE: ghp_1234567890abcdefghijklmnopqrstuv
  GitHub stores:    hash(token) in their database

API CALL:
  curl -H "Authorization: Bearer ghp_1234..." https://api.github.com/user

GITHUB SERVER:
  1. Receive request with token
  2. hash(received_token) = "9f4a8c..."
  3. Look up "9f4a8c..." in database → find user + permissions
  4. Check token not expired / not revoked
  5. Process request

GITHUB'S FINE-GRAINED TOKENS (new):
  scope: repo → full repo access
  scope: repo:read → read only
  Expiry date can be set
  Can be limited to specific repositories
```

### Example 3: How AWS Authenticates API Calls (SigV4)

```
AWS uses HMAC signature — not a simple token.
Every request is signed with your secret key.

INPUT:
  Access Key ID: AKIAIOSFODNN7EXAMPLE
  Secret Key:    wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
  Request:       GET /s3/my-bucket
  Date:          Mon, 09 Sep 2011 23:36:00 GMT

SIGNING PROCESS:
  1. Create canonical request string (method, URI, headers, body hash)
  2. Create "string to sign" (algorithm, date, region, service, canonical hash)
  3. Calculate signing key = HMAC(HMAC(HMAC(HMAC("AWS4"+SecretKey, date), region), service), "aws4_request")
  4. Signature = HMAC(signingKey, stringToSign)

REQUEST SENT:
  Authorization: AWS4-HMAC-SHA256
    Credential=AKIAIOSFODNN7EXAMPLE/20110909/us-east-1/s3/aws4_request,
    SignedHeaders=host;x-amz-date,
    Signature=fe5f80f77d5fa3beca038a248ff027d0445342fe2855ddc963176630326f1024

AWS VERIFIES:
  1. Look up the secret key for the given access key ID
  2. Recompute the signature using the SAME process
  3. Compare → if match → valid request

BENEFITS:
  No token to steal (signature is computed fresh each request)
  Request body is also signed → can't be tampered in transit
  Timestamp included → replay attacks prevented (5 min window)
```

### Example 4: JWT in Microservices

```
ARCHITECTURE:
  Frontend → API Gateway → [Service A, Service B, Service C]

FLOW:
  1. User logs in to API Gateway.
  2. API Gateway validates credentials, issues JWT signed with PRIVATE key.
  3. API Gateway forwards JWT in Authorization header to downstream services.
  4. Each service verifies JWT using PUBLIC key (from JWKS endpoint).
     No service needs to call a central auth server!
  5. Services extract user_id, role from JWT claims.
  6. Each service makes its own authorization decision based on role.

THE JWKS ENDPOINT:
  GET https://auth.yourapp.com/.well-known/jwks.json
  {
    "keys": [{
      "kty": "RSA",
      "kid": "2024-01",
      "n": "0vx7agoebGcQSuuPiLJXZptN9...",
      "e": "AQAB"
    }]
  }
  Services cache these keys and use them to verify JWT signatures locally.
```

---

## PART 15 — Security Best Practices

### Passwords

```
STORAGE:
  ✗ NEVER store plain text passwords
  ✗ NEVER store encrypted passwords (reversible)
  ✓ Store password HASH using bcrypt, scrypt, or Argon2
    - These are slow by design (makes brute force expensive)
    - bcrypt: cost factor 12+ (auto-adds salt)
    - Argon2id: winner of Password Hashing Competition — recommended for new apps

  bcrypt("secret123", rounds=12) = "$2b$12$EXRAFpWgx.../result..."

POLICY:
  ✓ Minimum 8-12 characters (longer is better, don't over-restrict)
  ✓ Check against known breached passwords (HaveIBeenPwned database)
  ✓ Don't require frequent password changes (causes weak patterns)
  ✓ Allow paste (managers can paste long passwords)
  ✓ Show strength meter
  ✗ Don't restrict character types unnecessarily
```

### Token Security

```
JWT:
  ✓ Use short expiry for access tokens (15 min - 1 hour)
  ✓ Store refresh tokens in database (so they can be revoked)
  ✓ Use RS256 or ES256 (asymmetric) for multi-service architectures
  ✓ Validate ALL claims: exp, iss, aud, nbf
  ✗ NEVER put sensitive data in JWT payload (it's only base64-encoded, not encrypted)
  ✗ Don't accept "alg: none" — explicitly whitelist allowed algorithms

COOKIE STORAGE vs localStorage (for frontend):
  httpOnly cookie:   ✓ Safe from XSS, ✗ Vulnerable to CSRF (use SameSite)
  localStorage:      ✓ No CSRF risk, ✗ Accessible to JavaScript (XSS risk)
  Memory (JS var):   ✓ Most secure, ✗ Lost on page refresh

RECOMMENDATION: httpOnly cookie with SameSite=Strict for sessions.
                Memory (state) for short-lived access tokens in SPA.
```

### General Security Rules

```
HTTPS EVERYWHERE:
  ✓ ALL endpoints must use TLS
  ✓ Enable HSTS (HTTP Strict Transport Security)
  ✓ Redirect all HTTP → HTTPS

RATE LIMITING:
  ✓ Limit login attempts (5 per minute per IP)
  ✓ Implement progressive delays (exponential backoff)
  ✓ Lock accounts after N failed attempts (with notification)
  ✓ Use CAPTCHA after suspicious patterns

PREVENT COMMON ATTACKS:
  Brute Force:     Rate limiting + account lockout
  Credential Stuffing: Breach password detection + MFA + CAPTCHAs
  CSRF:            SameSite cookies + CSRF tokens
  XSS:             Content Security Policy + httpOnly cookies + input sanitization
  Session Fixation: Regenerate session ID after login
  Timing Attacks:  Use constant-time comparison for token validation
  SSRF:            Validate and whitelist URLs for outbound requests

ALWAYS:
  ✓ Log all authentication events (successes and failures)
  ✓ Alert on unusual login patterns (new location, new device)
  ✓ Support account recovery with identity verification
  ✓ Implement proper logout (invalidate server-side state)
  ✓ Use security headers (X-Frame-Options, CSP, X-Content-Type-Options)
```

---

## PART 16 — Complete Comparison Table

```
METHOD              STATEFUL?  REVOCABLE?  SCALES?  BROWSER?  SERVICE?  SECURITY
────────────────────────────────────────────────────────────────────────────────────
Basic Auth          No         No (pwd change) Yes   Yes       Yes       ★★
Session + Cookie    Yes        Yes (easy)  Medium    Yes       Limited   ★★★★
JWT                 No         Hard        Yes       Yes       Yes       ★★★★
API Key             Lookup     Yes         Yes       No        Yes       ★★★
OAuth 2.0           Varies     Yes         Yes       Yes       Yes       ★★★★★
OIDC                Varies     Yes         Yes       Yes       Yes       ★★★★★
SAML                Varies     Yes         Yes       Yes       Limited   ★★★★★
MFA (any)           Depends    Depends     Depends   Yes       Limited   +★★★★
mTLS                No         Yes (revoke cert) Yes Rare      Yes       ★★★★★
Passkeys/WebAuthn   No         Yes         Yes       Yes       No        ★★★★★

AUTHORIZATION:
RBAC                —          —           Good      —         —         ★★★★
ABAC                —          —           Good      —         —         ★★★★★
ReBAC               —          —           Great     —         —         ★★★★★
ACL                 —          —           Poor      —         —         ★★★
```

---

## PART 17 — Quick Cheat Sheet

```
AUTHENTICATION DECISION:
  Simple web app → Sessions (cookies)
  Mobile or SPA → JWT + refresh token
  Service-to-service → mTLS + JWT
  Developer API → API Keys
  Enterprise → SAML or OIDC
  High security → Passkeys + MFA
  "Login with Google/GitHub" → OIDC (OAuth 2.0 + identity layer)

AUTHORIZATION DECISION:
  Simple roles (admin/user/guest) → RBAC
  "Only edit your own posts" → ABAC
  "Share with specific people" → ReBAC (Zanzibar model)
  Infrastructure policy → OPA (PBAC)

IMPORTANT NUMBERS:
  bcrypt rounds:   12+ (balances security and speed)
  Access token:    15 min - 1 hour expiry
  Refresh token:   7 - 30 days expiry
  Session:         30 min idle timeout, 24hr absolute max (for banking: shorter)
  API key length:  32+ bytes (256 bits) of entropy
  TOTP window:     30 seconds, allow ±1 window for clock skew
  Password min:    8 characters (12+ recommended)

COMMON HTTP STATUS CODES:
  200 OK            Request succeeded, user authenticated and authorized
  401 Unauthorized  Authentication required or failed (send credentials)
  403 Forbidden     Authenticated but not authorized (wrong permissions)
  429 Too Many      Rate limit exceeded (login brute force protection)

THE THREE NON-NEGOTIABLES:
  1. ALWAYS use HTTPS (TLS) — no exceptions
  2. NEVER store plain-text passwords — always hash (bcrypt/Argon2)
  3. ALWAYS validate tokens on every request — never trust client claims
```

---

> **Summary for System Design Interviews:**
> When asked "how do you handle authentication?", walk through:
> 1. Which method (JWT / Session / OAuth) and WHY for this use case.
> 2. How tokens are stored and transmitted securely.
> 3. How you handle revocation / logout.
> 4. How authorization works (RBAC / ABAC).
> 5. What security measures prevent common attacks.
> This shows you understand not just the happy path, but the full security model.
