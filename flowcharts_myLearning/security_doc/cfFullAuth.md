# Cloudflare Access — Full Authentication Flow

Let's draw the complete production flow assuming your company uses:

- **Cloudflare Zero Trust (Access)**
- **Google Workspace / Okta** as the Identity Provider
- **Next.js** Frontend
- **NestJS** Backend
- Backend validates the Cloudflare JWT (recommended approach)

## The Complete Picture

```text
┌────────────┐
│   Browser  │
└─────┬──────┘
      │
      │ GET https://dashboard.company.com
      ▼
┌────────────────────────────┐
│ Cloudflare Access          │
└──────────┬─────────────────┘
           │
           │ Valid Cookie?
           │
     ┌─────┴─────┐
     │           │
    No          Yes
     │           │
     ▼           ▼
┌────────────────────────────┐
│ Google / Okta / Entra ID   │
└──────────┬─────────────────┘
           │
           │ User authenticated
           ▼
┌────────────────────────────┐
│ Cloudflare creates         │
│ CF_Authorization Cookie    │
└──────────┬─────────────────┘
           │
           │ Browser retries request
           ▼
┌────────────────────────────┐
│ Cloudflare validates       │
│ Cookie & Access Policies   │
└──────────┬─────────────────┘
           │
           │ Adds identity headers
           │
           ▼
┌────────────────────────────┐
│ Next.js / NestJS Server    │
└──────────┬─────────────────┘
           │
           │ Validate
           │ CF-Access-JWT
           ▼
┌────────────────────────────┐
│ Extract User Claims        │
│ email                      │
│ groups                     │
│ roles                      │
└──────────┬─────────────────┘
           │
           │ Application Authorization
           ▼
┌────────────────────────────┐
│ Business Logic             │
│ Can view dashboard?        │
│ Can edit?                  │
│ Can delete?                │
└──────────┬─────────────────┘
           │
           ▼
      JSON / HTML Response
           │
           ▼
        Browser
```

## Points

### 1. If no CF cookie, then redirect to Identity Provider

**First Login**

```text
Browser
    │
    ▼
Google Workspace / Okta
```

User enters: **email, password and MFA** (if enabled)

```text
↓
Google verifies
↓
Returns success to Cloudflare
User = arihant@company.com
```

**Now Cloudflare creates a session**

```text
CF_Authorization = eyJhbGc...
```

stored as a **Secure HTTP-only Cookie**.

Browser now has:

```text
Cookie
CF_Authorization=eyJhbGc...
```

**Browser retries request**

```text
GET /dashboard
Cookie:
CF_Authorization=...
↓
Cloudflare receives
↓
Validates :
Signature
Expiration
Identity
Group Membership
Device Policy
MFA Policy

Everything OK
↓
```

**Cloudflare forwards request**

Now Cloudflare sends the request to your application:

```http
GET /dashboard
CF-Access-Jwt-Assertion: eyJhbGc...
CF-Access-Authenticated-User-Email:
arihant@company.com
CF-Connecting-IP:
1.2.3.4
Other Headers...
```

> **Notice:** The browser never sends these headers. **Cloudflare adds them.**

### Your Next.js / NestJS Server

Now your backend receives:

```text
Incoming Request
↓
Read
CF-Access-Jwt-Assertion
↓
Verify JWT
Signature ✔
Audience ✔
Issuer ✔
Expiration ✔
↓
Extract claims
```

```json
{
  "email": "arihant@company.com",
  "sub": "...",
  "groups": [
      "engineering"
  ]
}
```

```text
↓
Now your application decides
↓
```

This part is your **application's authorization logic**.

> Cloudflare **authenticated** the user.
> Your application decides **what that authenticated user is allowed to do**.

---

## Why is it Called "Multi"-Factor?

```text
Factor 1:
Password
+
Factor 2:
OTP from your phone
```

**Suppose** you open: `https://dashboard.company.com`

- **Step 1:** Enter email + password — Google verifies it.
  Then Google says: *This organization requires MFA.*
- **Step 2:** Google asks for another proof — for example: approve login on your
  phone, or enter a 6-digit OTP.

Only after **both** checks succeed (password & phone), Google tells Cloudflare:
**User authenticated.**
