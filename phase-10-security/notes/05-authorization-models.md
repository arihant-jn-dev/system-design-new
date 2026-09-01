# 10·05 · Authorization Models — RBAC, ABAC, ReBAC

> **Why this exists:** the roadmap flags ReBAC/Zanzibar as ⭐ ***"increasingly asked about"*** — and
> authorization is where systems actually break ([01](01-authn-vs-authz.md)). This is also a genuine
> *distributed systems* problem, not just a policy one.

---

## Reference

### The three models

| | **RBAC** | **ABAC** | ⭐ **ReBAC** |
|---|---|---|---|
| Decision on | ⭐ **the user's ROLE** | ⭐ **ATTRIBUTES** of user/resource/context | ⭐ **the RELATIONSHIP between user and resource** |
| Example | `admin` may delete | *"managers may approve < £10k, in office hours"* | ⭐ *"you may edit this doc because you're an editor of the folder that contains it"* |
| Strength | ⭐ simple, auditable, everyone understands it | expressive, dynamic, fine-grained | ⭐ **handles nesting, sharing and inheritance naturally** |
| Weakness | ⚠️ **role explosion**; can't express "their *own* orders" | ⚠️ hard to audit — *"who can access X?"* needs evaluation over everything | ⚠️ a graph to store and traverse; real infrastructure |

### ⭐ RBAC's real limit — role explosion

RBAC is right far more often than people admit. **But it degrades predictably:** you start with
`admin`/`user`, then need `admin-eu`, `admin-eu-readonly`, `billing-admin-eu-readonly`… ⭐ **because RBAC
can only express membership, not RELATIONSHIP.** *"Users may read their own orders"* isn't a role at all —
it's a relationship, and teams end up hard-coding it beside the role check.

⭐ **The practical middle ground most systems land on: RBAC + ownership checks + a few attributes.** Say that;
jumping straight to Zanzibar for a CRUD app is the [same résumé-driven failure](../../phase-08-architecture/notes/06-event-sourcing.md)
as event-sourcing a blog.

### ⭐ ReBAC / Google Zanzibar

**Store permissions as a graph of *relation tuples*:**

```
doc:readme#editor@user:alice              alice is an editor of readme
doc:readme#parent@folder:eng              readme lives in folder eng
folder:eng#viewer@group:engineering#member    ⭐ everyone in the group
group:engineering#member@user:bob

check(user:bob, viewer, doc:readme)?  ⭐ a graph traversal, not a table lookup
```

⭐ **The schema defines how permissions INHERIT** — *"viewer of a doc = anyone with viewer on its parent
folder"* — which is why Google Docs-style sharing works at all. **You cannot express that in RBAC without
materialising every combination.**

| ⭐ Why Zanzibar is interesting as a *systems* problem | |
|---|---|
| ⭐ **Globally distributed, ~10 ms p95 at millions of QPS** | it's the permission check for Drive, YouTube, Calendar |
| ⭐ **Zookies** — a consistency token, so a permission *revocation* is never missed by a stale replica | |
| **Leopard index** — a precomputed set index for deeply nested groups | |
| **Open-source implementations** | SpiceDB, Ory Keto, OpenFGA, Auth0 FGA |

⭐ **The "new enemy" problem is the part worth remembering:** Alice removes Bob from a folder, then adds a
sensitive doc. ⚠️ **If the check hits a stale replica, Bob reads it** — the revocation and the addition were
reordered. ⭐ **Zookies exist to make "check at least as fresh as this change" expressible**, and it's a
beautiful concrete example of why *eventual consistency is unacceptable for authorization*.

### ⭐ Permission checks at scale — and how to cache them

⭐ **Authorization is on the hot path of every request, so it must be fast — but caching a permission is
caching a security decision, which is exactly the thing you must not get stale.**

| Approach | |
|---|---|
| **In the token** | ⭐ **fast, zero lookups — and stale for the token's lifetime** ([02](02-sessions-and-tokens.md)). ⚠️ Fine for coarse roles, ⭐ **not for anything revocable-in-seconds** |
| ⭐ **In the query** | RLS or `WHERE owner_id = $me` — ⭐ **the check and the data are one operation, so it can't be stale or forgotten** ([Phase 8 note 10](../../phase-08-architecture/notes/10-multi-tenancy.md)) |
| **A policy service** | correct and central; ⚠️ a network hop per check and a hard dependency |
| ⭐ **A sidecar/embedded policy engine** (OPA) | policy distributed as data, evaluated locally — ⭐ **no per-check network call** |
| **Cache with short TTL + explicit invalidation** | ⭐ **cache the negative answer too**, and ⚠️ **decide deliberately whether to fail open or closed when the cache/policy service is down** — ⭐ **for authorization, fail CLOSED** |

⭐ **"Fail closed" is the one place the usual availability instinct reverses.** A rate limiter fails open; an
authorization check must not.

### Policy engines

⭐ **OPA/Rego** (general-purpose, CNCF, sidecar or library) · **Cedar** (AWS; designed to be *analysable* —
you can ask "is this policy set equivalent?") · **Casbin** (embedded, simple).

⭐ **The real argument for a policy engine: policy becomes DATA, versioned and testable, instead of `if`
statements spread across 400 files.** ⚠️ **The cost: a second language, and a decision point that can now be
wrong in a new way.**

### ⭐ What to say in a design

> *"⭐ RBAC for coarse roles, plus ownership/tenancy predicates enforced **in the query** — I'd rather the
> database refuse than rely on every handler remembering. ⭐ **Deny by default.** If the product needs
> Google-Docs-style sharing with nested folders and groups, that's ReBAC and I'd use a Zanzibar-style
> service rather than build a permission graph myself — ⭐ **and I'd be careful about caching, because a
> stale permission is a security bug, not a performance one.**"*

---

## In your own words

**⭐ Define the three models in one line each, with an example.**

>

**⭐ Why does RBAC explode, and what can't it express at all?**

>

**What's the practical middle ground most systems should use?**

>

**⭐ Write a relation tuple and explain how inheritance works.**

>

**⭐ Explain the new-enemy problem and what zookies are for.**

>

**⭐ Why is caching an authorization decision dangerous, and which way do you fail?**

>

**Which enforcement point can never be stale or forgotten, and why?**

>

**⭐ What's the real argument for a policy engine, and its cost?**

>

---

## Links

- Where authorization breaks → [01-authn-vs-authz.md](01-authn-vs-authz.md)
- Claims in tokens go stale → [02-sessions-and-tokens.md](02-sessions-and-tokens.md)
- ⭐ RLS — enforcement at the data → [Phase 8 note 10](../../phase-08-architecture/notes/10-multi-tenancy.md)
- Sidecars and embedded policy → [Phase 8 note 04](../../phase-08-architecture/notes/04-service-discovery-and-mesh.md)
- Broken access control → [10-owasp-top-10.md](10-owasp-top-10.md)
- Scopes as coarse authorization → [06-api-keys-scopes-quotas.md](06-api-keys-scopes-quotas.md)
- **The Google Zanzibar paper** — short and genuinely worth reading
