# Phase 8 Lab

Two parts, and they are very unequal in importance.

| | | Time |
|---|---|---|
| ⭐ **A** | [`decomposition/WORKSHEET.md`](decomposition/WORKSHEET.md) — **the roadmap's actual lab.** A writing exercise. **No Docker.** | ~90 min |
| B | [`multi-tenancy/`](multi-tenancy/) — a Postgres demo of tenant isolation (gate Q3) | ~15 min |

> ⭐ **Part A is the phase.** The roadmap: *"Take one service you know well… Then write the counter-argument
> for keeping it a monolith. **Being able to argue both sides is the actual skill.**"* Part B exists because
> multi-tenancy is much more convincing when you watch the leak happen than when you read about it.

---

# Part A · The decomposition worksheet

Open [`decomposition/WORKSHEET.md`](decomposition/WORKSHEET.md) and fill it in for **a system you have
actually worked on**.

Structure:

| § | |
|---|---|
| **0** | The system, and ⭐ **what actually hurts about it today** |
| **1.1** | Boundaries — the business capability each service owns |
| **1.2** | ⭐ **Data ownership** — one table, one writer; which JOIN and which transaction you lose |
| **1.3** | ⭐ **Sync vs async, per interaction** — with the reason for each |
| **1.4** | ⭐ **What breaks during the migration** — the part most candidates skip |
| **2** | ⭐ **The counter-argument — written to WIN** |
| **3** | ⭐ **Commit**, with the condition that would change your mind |

⭐ **Done when you can say the whole thing out loud in under 6 minutes.** That's gate Q1.

---

# Part B · Multi-tenancy isolation

## Run it

```bash
docker compose up -d              # Postgres on host port 5440
docker compose ps                 # wait for (healthy)

docker compose build lab          # ⚠️ profile'd services are skipped by `up --build`
                                  #    (../../DOCKER-GUIDE.md Gotcha 1)

docker compose run --rm lab node multi-tenancy/run.js
```

Poke at it yourself:

```bash
psql postgresql://lab:lab@localhost:5440/lab
  \dn                          -- the per-tenant schemas
  \d invoices                  -- the shared table
  SELECT * FROM pg_policies;   -- ⭐ the RLS policy itself
```

Clean up: `docker compose down -v`

## What it shows

### ⭐ 1 · Shared schema — the leak

One table, a `tenant_id` column, and the filter removed from **one query**:

```
❌ now a developer FORGETS the filter -- one missing WHERE clause:
       SELECT customer, amount FROM invoices;
   acme      Acme customer A        100
   acme      Acme customer B        200
   globex    Globex customer X      999
   globex    Globex SECRET deal   50000     ← ⭐ ACME JUST SAW THIS
   initech   Initech customer Z     300
```

> ⭐ **THE multi-tenancy failure mode, and it is one line of code.** Not an exotic attack — a forgotten
> `WHERE` in a new endpoint, a JOIN that lost its predicate, an admin script, a report added on a Friday.
> ⭐ **"We'll be careful" is not a security model.**

### ⭐ 2 · Row-Level Security — the *same buggy query*, now safe

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE  ROW LEVEL SECURITY;   -- ⚠️ or the table OWNER bypasses it
CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = current_setting('app.tenant_id', true));
```

The script then connects as a **non-owner role** (`app_user`), sets the tenant per connection, and runs the
**identical unfiltered query**:

```
as tenant "acme"   -> SELECT tenant_id, customer, amount FROM invoices;   -> 2 rows (acme only)
as tenant "globex" -> SELECT tenant_id, customer, amount FROM invoices;   -> 2 rows (globex only)
```

> ⭐ **That is the difference between a CONVENTION your team must follow perfectly forever, and a CONSTRAINT
> the system enforces.**

⚠️ **Three traps** the script deliberately demonstrates or warns about:
`FORCE ROW LEVEL SECURITY` (owners bypass policies) · **connection pooling** — a `SET` that isn't reset
leaks the previous request's tenant · ⭐ **derive `tenant_id` from the authenticated session, never from
request input.**

### 3 · Schema per tenant — isolation by construction, and the bill

```
connection with search_path=tenant_acme, unfiltered query -> 2 rows.
   ⭐ Globex is not merely filtered -- it is UNREACHABLE.

⭐ AND NOW THE COST. A schema change must run 3 times.
```

At 3 tenants that's trivial. ⭐ **At 5,000 it's a migration *orchestration* problem** — hours, partial
failure, and tenants on two schema versions at once, so your code must support both during rollout (Phase
7's expand–contract × N). ⚠️ Plus catalog bloat slowing planning for *everyone*.

### ⭐ 4 · The noisy neighbour

One whale tenant with 500k invoices, minnows with 50, all in one table:

| | |
|---|---|
| minnow's 50 invoices, **no index on `tenant_id`** | **7.7 ms** — it scans all 500k |
| minnow's 50 invoices, **index on `(tenant_id, id)`** | **0.1 ms** |
| whale's 500k invoices, indexed | 10.5 ms |
| | ⭐ **58× for the SMALL tenant, purely because of the BIG tenant's data** |

> ⭐ **THE RULE: `tenant_id` must be the LEADING COLUMN of essentially every index.** It's your shard key in
> miniature — without it, every small tenant pays for the largest one.
>
> ⭐ **And what the index does NOT fix:** the whale still evicts the minnow's pages from the buffer cache,
> still consumes connections, still generates WAL. **Performance isolation needs QUOTAS or SEPARATION, not
> just indexing.**

### 5 · Choosing — the gate Q3 answer

| model | isolation | cost/tenant | ops at scale | "delete tenant" |
|---|---|---|---|---|
| shared + `tenant_id` | ⚠️ weak | ~0 | ⭐ 1 migration | `DELETE` (slow, risky) |
| shared + RLS | ✅ good | ~0 | 1 migration | `DELETE` |
| schema per tenant | ✅ strong | low | ⚠️ N migrations | ⭐ `DROP SCHEMA` |
| database per tenant | ⭐ strongest | high | ⚠️ N databases | ⭐ `DROP DATABASE` |

⭐ **EARLY** → shared + RLS + tenant_id-leading indexes.
⭐ **MID** → **hybrid**: most shared, big/regulated tenants get their own schema or DB, with a directory
table mapping tenant → location. **This is what most real B2B SaaS looks like.**
⭐ **LARGE** → DB/cluster per tenant, or cells.

> ⭐ **AND THE POINT THAT SCORES: the driver is usually NOT technical. It is what you SELL.** If the
> enterprise contract says "dedicated database", that is the architecture — and it arrives as a **sales
> requirement long before a scaling one.**

---

## RESULTS

Record your own numbers — they'll differ from the ones above, and **your** numbers are what you cite.

| Measurement | ⭐ Your result |
|---|---|
| Rows leaked by the unfiltered query | |
| Rows returned per tenant with RLS on | |
| `ALTER TABLE` × N schemas | |
| Minnow query, **no** `tenant_id` index | |
| Minnow query, **with** `(tenant_id, id)` index | |
| ⭐ **Ratio** | |

**⭐ Anything that surprised you:**

>

**⭐ Which model would you pick for a system you actually work on, and why?**

>

---

## Files

| | |
|---|---|
| [`decomposition/WORKSHEET.md`](decomposition/WORKSHEET.md) | ⭐ **Part A — the real lab** |
| [`multi-tenancy/run.js`](multi-tenancy/run.js) | Part B — all four demos |
| [`docker-compose.yml`](docker-compose.yml) | Postgres on **5440** (annotated) |
| [`Dockerfile`](Dockerfile) | node + `pg` |
