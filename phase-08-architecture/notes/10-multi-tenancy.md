# 08·10 · Multi-Tenancy

> **Why this exists:** **gate Q3** — *"design multi-tenant isolation for a B2B SaaS product at three
> different scales."* And you **watched the failure happen**: in the lab, one forgotten `WHERE` clause let
> Acme read Globex's 50,000 secret deal.

---

## Reference

### The four models

| | ⭐ **Shared schema + `tenant_id`** | ⭐ **+ Row-Level Security** | **Schema per tenant** | **DB per tenant** |
|---|---|---|---|---|
| Isolation | ⚠️ **weak — one bug leaks** | ✅ **DB-enforced** | ✅ structural | ⭐ **strongest** |
| Cost per tenant | ~0 | ~0 | low | ⚠️ high |
| Migrations | ⭐ **1** | 1 | ⚠️ **N** | ⚠️ **N** |
| "Delete tenant X" | `DELETE` (slow, risky) | `DELETE` | ⭐ `DROP SCHEMA` | ⭐ `DROP DATABASE` |
| Per-tenant restore | ⚠️ very hard | very hard | ✅ | ⭐ **trivial** |
| Noisy neighbours | ⚠️ yes | ⚠️ **yes — RLS doesn't fix this** | partly | ✅ isolated |
| Per-tenant tuning | ❌ | ❌ | limited | ✅ |
| Max tenants | ⭐ **millions** | millions | ⚠️ ~thousands | ⚠️ ~hundreds |

### ⭐ What you measured: the leak

The lab's shared-schema model, with the filter removed from **one query**:

```
❌ developer FORGETS the filter -- one missing WHERE clause:
       SELECT customer, amount FROM invoices;
   acme     Acme customer A        100
   globex   Globex SECRET deal   50000     ← ⭐ ACME JUST SAW THIS
```

> ⭐ **This is THE multi-tenancy failure mode, and it is one line of code.** Not an exotic attack — a
> forgotten `WHERE` in a new endpoint, a JOIN that lost its predicate, an admin script, a report someone
> added on a Friday.
>
> ⭐ **"We'll be careful" is not a security model.**

### ⭐ What you measured: RLS fixes the *same buggy query*

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;   -- ⚠️ or the OWNER bypasses it
CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = current_setting('app.tenant_id', true));
```

Then, per request, from the *authenticated session*:

```sql
SELECT set_config('app.tenant_id', $1, false);
```

**The lab result:** the identical unfiltered `SELECT * FROM invoices` returned **2 rows as acme, 2 rows as
globex.** Postgres rewrote the query to include the predicate.

> ⭐ **That is the difference between a CONVENTION your team must follow perfectly forever, and a CONSTRAINT
> the system enforces.** It's the single highest-leverage thing in this note.

⚠️ **Three traps that make people say "RLS doesn't work":**
1. ⭐ **The table OWNER and superusers bypass policies** unless you `FORCE ROW LEVEL SECURITY`. Your app
   should connect as a **non-owner role** anyway.
2. ⭐ **Connection pooling**: if you `SET` the tenant on a pooled connection and don't reset it, the next
   request inherits it. Use `set_config(..., true)` (transaction-scoped) inside a transaction, or reset on
   release. **This is a real, shipped bug in real products.**
3. ⭐ **Derive `tenant_id` from the authenticated session/JWT — never from a request parameter.** Otherwise
   you've built a beautifully-enforced policy over an attacker-supplied value.

**What RLS still doesn't fix:** noisy neighbours · blast radius (one bad migration hits everyone) ·
"delete tenant" is still a `DELETE` · a compromised app role can still set a different tenant.

### ⭐ What you measured: the noisy neighbour

One whale tenant with 500k invoices, everyone else with a handful, all in one table:

| | |
|---|---|
| minnow's 50 invoices, **no index on `tenant_id`** | **7.7 ms** (scans all 500k) |
| minnow's 50 invoices, **index on `(tenant_id, id)`** | **0.1 ms** |
| | ⭐ **58× — for the SMALL tenant, purely because of the BIG tenant's data** |

> ⭐ **THE RULE: in a shared-schema model, `tenant_id` must be the LEADING COLUMN of essentially every
> index.** It is your shard key in miniature ([Phase 3D](../../phase-03-databases/notes/)) — without it,
> every small tenant pays for the largest one.

⭐ **And note what the index does NOT fix:** the whale still evicts the minnow's pages from the buffer cache,
still consumes connections, still generates WAL, still hogs CPU. ⭐ **Performance isolation needs QUOTAS or
SEPARATION, not just indexing.**

### Noisy-neighbour defences beyond indexing

| | |
|---|---|
| ⭐ **Per-tenant rate limits and quotas** ([Phase 7 note 07](../../phase-07-reliability/notes/07-rate-limiting.md)) |
| ⭐ **Per-tenant concurrency caps** — a bulkhead per tenant, so one can't drain the pool |
| **Query cost limits / statement timeouts** |
| ⭐ **Separate pools or replicas for the big tenants** |
| ⭐ **Cells / shuffle sharding** — put tenants in groups; one bad tenant hurts its cell, not the fleet, and **shuffle sharding makes it statistically unlikely that any two tenants share a full blast radius** |
| **A separate queue/worker pool for large async jobs** |

### ⭐ The three-scale answer (this is gate Q3)

| Scale | Answer |
|---|---|
| ⭐ **EARLY** — 10s–1000s of tenants, self-serve, low-value data | **Shared schema + `tenant_id` + RLS**, with `tenant_id` leading every index. One migration, one backup, and the **database — not your discipline — enforces isolation.** |
| ⭐ **MID** — large tenants appear, or compliance shows up | ⭐ **HYBRID.** Most tenants stay shared; the few large or regulated ones get their own schema or database. A **directory table maps tenant → location** ([Phase 3D directory sharding](../../phase-03-databases/notes/)). ⭐ **This is what most real B2B SaaS actually looks like.** |
| ⭐ **LARGE** — enterprise, regulated, data residency | **Database (or cluster) per tenant, or cells holding a subset of tenants.** Isolation, blast radius and per-tenant restore all become trivial; you pay in **operational machinery** — N migrations, N backups, fleet management. |

> ⭐ **AND THE POINT THAT SCORES: the driver is usually NOT technical. It is what you SELL.** If your
> enterprise contract says "dedicated database", that is the architecture — and it arrives as a **sales
> requirement long before it arrives as a scaling one.** Data residency ("our data stays in the EU") does
> the same thing.

### Cross-cutting concerns you should mention

| | |
|---|---|
| ⭐ **Tenant context propagation** | it must flow through every layer — HTTP → service → DB session → queue message → background job. ⚠️ **Async jobs are where tenant context gets lost**, and that's where leaks happen |
| ⭐ **Enforce centrally** | a middleware/repository layer that adds the filter, not 400 hand-written queries. Better still: RLS, so even a raw query is safe |
| **Per-tenant everything** | metrics, logs, and cost — ⭐ **"which tenant is causing this?" must be a query you can run** |
| **Tenant lifecycle** | onboarding (provision), offboarding (**export**, then delete), suspension |
| **Migrations at N** | schema-per-tenant means orchestration, partial failure, and ⭐ **tenants on two schema versions at once — so your code must support both during rollout.** That's Phase 7's expand–contract multiplied by N |
| ⚠️ **Catalog bloat** | thousands of schemas × tables = a huge system catalog, slowing planning and connection setup **for everyone** |
| **Testing** | ⭐ **a test that asserts tenant A cannot see tenant B's data, running in CI, for every endpoint** |

---

## In your own words

**Name the four models with their isolation/cost/migration trade-offs.**

>

**⭐ Describe THE multi-tenancy failure mode, and cite what you saw in the lab.**

>

**Write the RLS policy from memory. What does `FORCE` do and why do you need it?**

>

**⭐ Name the connection-pooling trap and the "where does tenant_id come from" trap.**

>

**⭐ What does RLS still NOT fix? (four things)**

>

**Cite your noisy-neighbour numbers. What's the rule they imply?**

>

**⭐ What does indexing on tenant_id NOT fix, and what does that require instead?**

>

**⭐ Give the three-scale answer. What does the middle one actually look like?**

>

**⭐ What usually drives the choice, and why is that surprising?**

>

**Where does tenant context most often get lost?**

>

---

## Links

- ⭐ **You watched every one of these** → [`../lab/multi-tenancy/run.js`](../lab/multi-tenancy/run.js) · [`../lab/README.md`](../lab/README.md)
- ⭐ **Gate Q3** → [`../GATE.md`](../GATE.md)
- Sharding and directory lookup → [Phase 3D](../../phase-03-databases/notes/)
- Per-tenant rate limits → [Phase 7 note 07](../../phase-07-reliability/notes/07-rate-limiting.md)
- Bulkheads → [Phase 7 note 04](../../phase-07-reliability/notes/04-bulkheads-and-isolation.md)
- Cells & shuffle sharding → [Phase 7 note 13](../../phase-07-reliability/notes/13-multi-region-and-dr.md)
- Migrating N schemas → [Phase 7 note 12](../../phase-07-reliability/notes/12-zero-downtime-migrations.md)
