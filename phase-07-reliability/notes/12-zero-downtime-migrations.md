# 07·12 · Zero-Downtime Schema Migrations

> **Why this exists:** gate Q3 — *"walk through a zero-downtime column rename on a 500 M-row table."* The
> roadmap says *"know this concretely — it comes up constantly."* You performed it in the lab with writes
> flowing throughout and **zero errors across 2,742 writes**.

---

## Reference

### ⭐ Why you can't just rename

```sql
ALTER TABLE users RENAME COLUMN email TO email_address;   -- instant in Postgres!
```

**The rename is instant** (a catalog update). **That is not the problem.**

> ⭐ **The problem is that you cannot deploy code and schema atomically.** At the instant it commits, every
> running instance of the old code is still executing `SELECT email FROM users` — **immediate errors across
> the entire fleet** until the rolling deploy finishes.
>
> **Both code versions run simultaneously during a rollout, so the schema must be compatible with BOTH.**
> That is the entire reason for expand–migrate–contract.

### ⭐ The pattern — expand → migrate → contract

**You ran all eight steps. Memorise this shape:**

```
1. EXPAND     add the new column: NULLABLE, NO DEFAULT
2. DEPLOY     dual-write -- BEFORE the backfill
3. BACKFILL   batched, throttled, guarded, LOOPED UNTIL ZERO REMAIN
4. VERIFY     reconcile + shadow reads          <- the step people skip
5. SWITCH     reads to the new column, gradually, behind a flag
                                                 <- last fully reversible step
6. RELAX      DROP NOT NULL on the old column   <- the step everyone forgets
7. STOP       writing the old column
8. CONTRACT   drop it, days later               <- irreversible
```

### The details that matter — each is a real incident

**1 · Add the column NULLABLE with NO DEFAULT.**
A `NOT NULL` column, or a default on older Postgres, **rewrites the entire table** while holding
`ACCESS EXCLUSIVE`. On 500 M rows that's your outage. *(PG11+ optimises constant defaults, but "nullable, no
default, constrain later" is the rule that's always safe.)*

**2 · ⭐ Dual-write must be deployed BEFORE the backfill.**
Otherwise rows written between "backfill finished" and "deploy landed" have a NULL new column — a gap you'd
have to hunt later. **And the dual-writing version must be compatible with the old version still running
beside it**: old instances write one column, new ones write both, reads still use the old column.

**3 · ⭐ The backfill must LOOP UNTIL ZERO REMAIN — not walk a fixed range.**
> **The lab's first version iterated `id 1..200000` and left 309 rows un-backfilled** — everything inserted
> *during* the migration. **Rows are being created while you backfill.** Converge on "zero remaining":
> ```sql
> UPDATE users SET email_address = email
>  WHERE ctid IN (SELECT ctid FROM users WHERE email_address IS NULL LIMIT 5000);
> -- repeat until rowCount = 0
> ```

**4 · ⭐ Guard the backfill against overwriting concurrent writes.**
`AND email_address IS NULL` (or a version/timestamp comparison) means **the backfill can never clobber a
value a live write already set.** Without it, the backfill reads an old value and overwrites a newer one —
silently reverting a user's change. **This detail is the clearest signal of real migration experience.**

**5 · Throttle it.** A backfill competes with production traffic — unthrottled it saturates I/O, spikes
replication lag ([3c-02](../../phase-03-databases/notes/3c-02-replication-lag.md)), and bloats the table with
dead tuples ([3b-03](../../phase-03-databases/notes/3b-03-mvcc.md)). Watch replication lag and back off
automatically.

**6 · ⭐ Verify before switching.** Count NULLs, count mismatches, and **shadow read** — read both columns,
serve the old one, log discrepancies. **The step people skip, and the one that turns hope into confidence.**

**7 · Switch reads gradually behind a flag** — 1% → 10% → 50% → 100%, watching error rate. Still
dual-writing, so **rollback is instant and free**.

**8 · ⭐ DROP NOT NULL before you stop writing the old column.**
> **The lab's first version skipped this and produced 398 write errors:**
> `null value in column "email" violates not-null constraint`
>
> A self-inflicted outage inside a migration whose entire purpose was zero downtime. **Dropping NOT NULL is
> metadata-only and instant.**

**9 · Contract days later.** Once dropped, rollback requires a restore. Everything before is reversible.

### ⚠️ `lock_timeout` — the DDL rule

**Every DDL statement needs a lock. While it WAITS for that lock, every query arriving behind it queues too.**

```
long-running SELECT holds a lock
  -> ALTER TABLE waits (ACCESS EXCLUSIVE)
  -> ⭐ every subsequent query queues behind the WAITING ALTER
  -> the table is effectively DOWN
```

**One slow query plus one migration takes the table offline.** The fix:
```sql
SET lock_timeout = '3s';
ALTER TABLE ...;      -- fails fast instead of queueing the world; retry later
```
**Always set `lock_timeout` before DDL in production.** This is cheap, and its absence causes real outages.

### Safe vs unsafe operations (Postgres)

| ✅ Safe / instant | ⚠️ Dangerous |
|---|---|
| `ADD COLUMN` (nullable, no default) | `ADD COLUMN NOT NULL` (older versions: full rewrite) |
| `DROP COLUMN` | ⚠️ **Changing a column TYPE** (rewrite + lock) |
| ⭐ `CREATE INDEX CONCURRENTLY` | **`CREATE INDEX`** — blocks writes for the whole build |
| `ADD CONSTRAINT ... NOT VALID` then `VALIDATE` | `ADD CONSTRAINT` (full scan under lock) |
| `RENAME` (catalog only — but breaks code) | `ALTER COLUMN SET NOT NULL` on a big table |
| `ALTER COLUMN DROP NOT NULL` | |

> ⭐ **`CREATE INDEX CONCURRENTLY` is the one to remember**: it builds without blocking writes, at the cost
> of two table passes and the possibility of leaving an **INVALID** index if it fails — which you must drop
> and retry. **And it cannot run inside a transaction**, which surprises migration tools.
>
> **`ADD CONSTRAINT ... NOT VALID` then `VALIDATE CONSTRAINT`** is the same trick for constraints: add it
> cheaply for new rows, then validate old rows without an exclusive lock.

### The generalisation ⭐

**This is the same shape as every other migration you've learned:**

| Migration | Same pattern |
|---|---|
| **Shard key change** | [3d-05](../../phase-03-databases/notes/3d-05-resharding-without-downtime.md) — dual write, backfill, verify, cut over |
| **Store to store** (Postgres → Cassandra) | Identical |
| **API version change** | Expand (add v2), migrate clients, contract (remove v1) |
| **Event schema change** | Add optional field, migrate consumers, remove old |
| **Cache key format change** | Versioned keys ([Phase 5 note 03](../../phase-05-caching/notes/03-invalidation.md)) |

> ⭐ **Learn it once. "Expand, migrate, verify, contract — and never break backward compatibility during the
> transition" is a universal answer**, and recognising that it's the *same* procedure across all five rows is
> itself a strong signal.

### The gate answer, compressed

> *"You can't just rename it — the rename is instant, but you can't deploy code and schema atomically, so
> the moment it commits every running instance of the old code breaks. So: expand–migrate–contract.*
>
> *Add `email_address` nullable with no default — instant, no table rewrite. Deploy the version that
> dual-writes both columns, and crucially deploy that **before** the backfill, so nothing falls in the gap.
> Backfill in throttled batches with `WHERE email_address IS NULL` so it can never overwrite a concurrent
> live write, and **loop until zero rows remain** rather than walking a fixed range, because rows are being
> created while you run. Verify with counts and shadow reads. Then switch reads over behind a feature flag,
> ramped — that's the last fully reversible step. Then **drop `NOT NULL` on the old column** before you stop
> writing it, or every insert fails. Stop dual-writing, soak for a few days, and drop the column last.*
>
> *And I'd set `lock_timeout` before every DDL statement, because a waiting `ALTER` queues every query behind
> it and turns one slow query into a table outage. On 500 M rows the backfill is the long pole — days, not
> hours, throttled against replication lag."*

---

## In your own words

**Why can't you just rename the column? The answer is not about locks.**

>

**Write the eight steps from memory.**

>

**Why must dual-write be deployed BEFORE the backfill?**

>

**What's the backfill race, and the one-clause guard against it?**

>

**Why must the backfill loop rather than walk a range? Cite the lab's bug.**

>

**Which step did the lab's first version skip, and what error did it produce?**

>

**Explain `lock_timeout` and the outage it prevents.**

>

**Give the full gate answer out loud, timed. Under two minutes.**

>

---

## Links

- ⭐ **You performed this with zero errors** → [`../lab/`](../lab/) Part B
- The same shape for shard keys → [3d-05](../../phase-03-databases/notes/3d-05-resharding-without-downtime.md)
- Deploy safety, feature flags, canaries → [11-deployment-safety.md](11-deployment-safety.md)
- Replication lag during backfills → [3c-02](../../phase-03-databases/notes/3c-02-replication-lag.md)
- MVCC bloat from bulk updates → [3b-03](../../phase-03-databases/notes/3b-03-mvcc.md)
- Locks and DDL → [3b-04](../../phase-03-databases/notes/3b-04-locking-and-deadlocks.md)
