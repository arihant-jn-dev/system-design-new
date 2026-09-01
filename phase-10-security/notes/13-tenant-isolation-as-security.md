# 10·13 · Tenant Isolation as a Security Boundary

> **Why this exists:** you designed multi-tenancy as an *architecture* problem in
> [Phase 8](../../phase-08-architecture/notes/10-multi-tenancy.md). ⭐ **This note re-frames the same
> structures as a SECURITY boundary — because a cross-tenant leak isn't a bug report, it's a breach
> notification.**

---

## Reference

### ⭐ The reframe

| Phase 8 asked | ⭐ Phase 10 asks |
|---|---|
| Which model scales? | ⭐ **What happens when the check is missing?** |
| What does isolation cost? | ⭐ **What's the blast radius of one bug?** |
| How many migrations? | ⭐ **Can I PROVE tenant A can't reach tenant B?** |

⭐ **You already watched the failure**: one forgotten `WHERE tenant_id` and Acme read Globex's 50,000 secret
deal. ⭐ **That is simultaneously the multi-tenancy failure mode AND OWASP #1, broken access control** — the
same missing predicate ([10](10-owasp-top-10.md)).

> ⭐ **"We'll be careful" is not a security model.**

### ⭐ Defence in depth, by layer

```
edge      ⭐ tenant derived from the AUTHENTICATED session/JWT, never from a
             request parameter, header, or path the client controls
   ↓
app       a repository/middleware layer that adds the predicate centrally
   ↓
⭐ database  ROW-LEVEL SECURITY -- so even a raw query written at 3am is safe
   ↓
infra     separate schemas/databases/clusters for the tenants that require it
```

⭐ **Each layer assumes the one above it failed.** ⭐ **RLS is the highest-leverage single control** because
it converts a convention every developer must remember into a constraint the system enforces — you measured
the identical buggy `SELECT * FROM invoices` returning only the caller's rows.

⚠️ **Three RLS traps you demonstrated or noted:** the table **owner bypasses policies** unless you `FORCE`
(and the app should connect as a non-owner anyway) · ⭐ **a pooled connection whose tenant setting isn't
reset leaks the previous request's tenant** — transaction-scoped `set_config`, or reset on release ·
⭐ **and the tenant id must come from the authenticated session, never from input** — otherwise you've built
a beautifully enforced policy over an attacker-supplied value.

### ⭐ Where tenant context gets lost

**The predicate is easy on the main request path. It leaks everywhere else:**

⚠️ **Async jobs and queue consumers** (⭐ *the most common leak — the tenant was in the request context and
the background job doesn't have one*) · **caches** (⭐ **a cache key without a tenant id serves tenant A's
data to tenant B** — a genuinely common bug) · **search indexes** (⭐ *tenant must be a filter, and must be
non-optional*) · **exports, reports and admin tools** · **webhooks** · **error messages and logs** ·
**analytics warehouses** · **file/blob paths** (⭐ *include the tenant in the key and check it on presign*).

⭐ **The rule: tenant context propagates like a trace id — through every layer, every queue message, every
background job — or you enforce it structurally so it can't be forgotten.**

### ⭐ Proving isolation

⭐ **A test in CI that asserts tenant A cannot see tenant B's data, for every endpoint.** Generate it from
the route table so a new endpoint is covered by default (⭐ *deny by default, applied to tests*).

**Plus:** ⭐ **negative tests as the norm** — assert `404`/`403`, not just the happy path · a
**cross-tenant fuzzer** in staging that replays tenant A's requests with tenant B's ids ·
⭐ **per-tenant audit logging** so *"did anyone access this tenant's data?"* is answerable ·
**alerting on any query that returns rows from more than one tenant.**

### ⭐ When isolation must be physical

| Driver | Consequence |
|---|---|
| ⭐ **Contractual** — *"our data is on dedicated infrastructure"* | ⭐ **a separate database or cluster. It's a SALES requirement before a technical one** |
| ⭐ **Data residency** — *"EU data stays in the EU"* | ⭐ **regional deployments, and a directory mapping tenant → region.** This one is genuinely architectural — you can't bolt it on |
| **Regulatory** — HIPAA/PCI scope | isolate the regulated tenants to shrink the audit boundary |
| **Blast radius** — one tenant's incident must not touch others | ⭐ **cells: groups of tenants, so an outage or a bad migration is contained** |

⭐ **The hybrid is what most real B2B SaaS looks like** — shared schema + RLS for most, dedicated
infrastructure for the few who demand it ([Phase 8](../../phase-08-architecture/notes/10-multi-tenancy.md)).

### ⭐ And the internal threat model people skip

⚠️ **Your own staff are a tenant boundary too.** *"Support can view any account to help customers"* is a
real requirement and a real risk.

⭐ **Design it explicitly:** impersonation must be **time-bound, reason-logged, visible to the customer
where appropriate, and heavily audited** · ⭐ **admin tools need the same authorization model, not a bypass
of it** · **separate the ability to *read* customer data from the ability to *act* as them** ·
⚠️ **a full-access admin panel with no audit trail is how insider incidents become undetectable.**

---

## In your own words

**⭐ Restate the three questions this note asks that Phase 8 didn't.**

>

**⭐ Why is the multi-tenancy failure mode the same thing as OWASP #1?**

>

**⭐ Draw the four layers of defence. Which single control is highest-leverage, and why?**

>

**Name the three RLS traps.**

>

**⭐ List five places tenant context gets lost. Which is the most common?**

>

**⭐ Why is a cache key without a tenant id dangerous?**

>

**⭐ How do you PROVE isolation? What makes the test survive new endpoints?**

>

**Four drivers that force physical isolation. Which is genuinely architectural?**

>

**⭐ How do you design staff access to customer data safely?**

>

---

## Links

- ⭐ **You measured the leak and RLS stopping it** → [Phase 8 note 10](../../phase-08-architecture/notes/10-multi-tenancy.md) · [Phase 8 lab](../../phase-08-architecture/lab/)
- Broken access control → [10-owasp-top-10.md](10-owasp-top-10.md), [01-authn-vs-authz.md](01-authn-vs-authz.md)
- Authorization models → [05-authorization-models.md](05-authorization-models.md)
- Cells and blast radius → [Phase 7 note 13](../../phase-07-reliability/notes/13-multi-region-and-dr.md)
- Cache key design → [Phase 5](../../phase-05-caching/notes/)
- Residency as a legal constraint → [14-compliance-vocabulary.md](14-compliance-vocabulary.md)
