# 10·01 · AuthN vs AuthZ

> **Why this exists:** the roadmap is blunt — ⭐ ***"you don't need a security-engineer's depth. You DO need
> to never leave auth undesigned — the omission is noticed."*** This note is the frame the whole phase hangs
> on, and confusing the two words is an immediate tell.

---

## Reference

### ⭐ The distinction

| | **Authentication (AuthN)** | **Authorization (AuthZ)** |
|---|---|---|
| Question | ⭐ **"Who are you?"** | ⭐ **"What may you do?"** |
| Happens | once per session/request | ⭐ **on EVERY protected operation** |
| Output | an identity | a yes/no decision |
| Fails with | `401 Unauthorized` | `403 Forbidden` |
| Owned by | an identity provider | ⭐ **your application** |

⚠️ **HTTP's naming is famously wrong: `401 Unauthorized` actually means *unauthenticated*.** Say it right
even though the status code doesn't.

⭐ **`401` = "I don't know who you are — go authenticate."** `403` = "I know exactly who you are, and no."

⚠️ **And a subtlety worth knowing:** returning `403` for a resource the user isn't allowed to *see the
existence of* leaks information. ⭐ **For sensitive resources, return `404` instead** — "does user 900's
private document exist?" should not be answerable.

### ⭐ The failure that actually happens

> ⭐ **Broken access control is #1 on the OWASP Top 10** — above injection, above everything.
> **Authentication is usually fine, because you bought it. Authorization is where systems break, because
> you wrote it, per endpoint, by hand.**

The canonical bug, and it's one line:

```js
// ❌ IDOR — Insecure Direct Object Reference
app.get('/api/orders/:id', requireAuth, async (req, res) => {
  const order = await db.getOrder(req.params.id);   // ⚠️ authenticated, NOT authorized
  res.json(order);                                  //    any logged-in user reads ANY order
});

// ✅
const order = await db.getOrder(req.params.id);
if (order.userId !== req.user.id) return res.sendStatus(404);
```

⭐ **You already watched the identical mistake in Phase 8** — a forgotten `WHERE tenant_id` let Acme read
Globex's 50,000 secret deal. ⭐ **Same bug, different name: a missing authorization predicate.** And the same
fix applies: ⭐ **make it a CONSTRAINT the system enforces, not a CONVENTION every developer must remember.**

### ⭐ Enforce centrally, deny by default

| ⚠️ Fragile | ⭐ Robust |
|---|---|
| Every handler remembers to check | ⭐ **Middleware/policy layer enforces it** |
| Allowlist what's protected | ⭐ **DENY BY DEFAULT — a new endpoint is protected until someone opts it out**, and that opt-out is visible in review |
| Checks scattered across 400 files | A single decision point you can test |
| Trust the client's `role` field | ⭐ **Derive identity from the verified token, never from a request parameter** |

⭐ **Push the check as close to the DATA as you can.** Row-level security ([Phase 8 note 10](../../phase-08-architecture/notes/10-multi-tenancy.md))
is the strongest version — even a raw query written at 3am is safe.

### The other axes you must not skip

| | |
|---|---|
| ⭐ **Where does the identity come from?** | a session cookie, a JWT, mTLS, an API key ([02](02-sessions-and-tokens.md), [04](04-service-to-service-auth.md)) |
| ⭐ **Service-to-service** | ⚠️ **"it's on our internal network" is not authentication.** Zero trust: every hop authenticates ([04](04-service-to-service-auth.md)) |
| **Which model?** | RBAC / ABAC / ReBAC ([05](05-authorization-models.md)) |
| ⭐ **Revocation** | how does a ban, a role change or a password reset take effect *now*? ([02](02-sessions-and-tokens.md)) |
| **Audit** | ⭐ **who did what, when — and it must be tamper-evident** |

### ⭐ The 3-minute auth story (this is gate Q1)

**Every design you draw needs these six, volunteered:**

1. ⭐ **WHO authenticates** — end users? services? third-party apps? admin staff?
2. ⭐ **HOW** — OIDC via an identity provider for users; mTLS or workload identity between services; API keys + scopes for partners
3. ⭐ **WHERE the credential lives** — httpOnly+Secure+SameSite cookie, or a short-lived bearer token held in memory
4. ⭐ **HOW IT'S REVOKED** — short-lived access tokens + rotating refresh tokens with reuse detection; a per-user "tokens issued before T are invalid" epoch
5. ⭐ **HOW SERVICES TRUST EACH OTHER** — mTLS from the mesh, or short-lived signed tokens with an audience claim
6. ⭐ **HOW AUTHORIZATION IS DECIDED AND ENFORCED** — the model, the central enforcement point, and deny-by-default

> ⭐ **Volunteer it. The roadmap's point is that the OMISSION is what's noticed** — nobody expects a
> security-engineer's depth, but leaving auth off the diagram entirely reads as inexperience.

---

## In your own words

**⭐ Define both in one question each. Which status code goes with which, and what's wrong with the naming?**

>

**⭐ When should you return `404` instead of `403`, and why?**

>

**⭐ Why is authorization where systems actually break, not authentication?**

>

**Write the IDOR bug and its fix. Which earlier phase did you see the same bug in?**

>

**⭐ What does "deny by default" mean concretely for a new endpoint?**

>

**⭐ Why push the check as close to the data as possible?**

>

**⭐ Give the six-part auth story out loud, in under 3 minutes, for a design you've drawn.**

>

---

## Links

- ⭐ **Gate Q1** → [`../GATE.md`](../GATE.md)
- Tokens, sessions, revocation → [02-sessions-and-tokens.md](02-sessions-and-tokens.md)
- Authorization models → [05-authorization-models.md](05-authorization-models.md)
- Service-to-service → [04-service-to-service-auth.md](04-service-to-service-auth.md)
- ⭐ Broken access control in context → [10-owasp-top-10.md](10-owasp-top-10.md)
- ⭐ The same bug as a missing `WHERE tenant_id` → [Phase 8 note 10](../../phase-08-architecture/notes/10-multi-tenancy.md)
- ⚠️ The mesh gives you transport auth, not authorization → [Phase 8 note 04](../../phase-08-architecture/notes/04-service-discovery-and-mesh.md)
