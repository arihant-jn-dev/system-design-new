# Phase 7 Lab — Resilience Patterns & Zero-Downtime Migration

> Roadmap: *"Wrap a flaky downstream dependency with timeout + retry-with-jitter + circuit breaker. Load test
> it and graph the difference. Then do a real expand–contract migration on a live table: rename a column with
> zero downtime, with writes flowing the whole time."*

**Time: ~3 hrs.**

```bash
cd phase-07-reliability/lab
docker compose up -d dependency app postgres

./part-a-resilience/run.sh                              # ~2.5 min
docker compose build migration
docker compose run --rm migration node run.js
```

App on **3007**, dependency on **4001**, Postgres on **5439**.

---

# Part A — what a slow dependency does to you

## The setup

| Setting | Value | Why |
|---|---|---|
| `MAX_CONCURRENCY` | **50** | A real service has finite capacity — and running out is *how* a slow dependency kills you |
| `TIMEOUT_MS` | 150 | ~3× the healthy p99 |
| `MAX_ATTEMPTS` | 3 | |
| Breaker | 10 failures → open 3 s → half-open probes | |
| Load | 200 req/s, open model | Closed-model would hide the overload |

**The dependency is healthy for 8 seconds, then responds in 5 SECONDS.** It never returns an error — this is
a *slow* failure, which is the dangerous kind.

## The results

| Mode | Success | p99 | Dependency calls | Notes |
|---|---|---|---|---|
| **1. none** | 28.4% | ⚠️ **6.41 s** | 1,588 | 4,013 rejected; requests hang |
| **2. timeout** | 25.7% | ✅ **154 ms** | 5,601 | Fast failure, bounded |
| **3. + retry** | 25.0% ⬇ | 571 ms | ⚠️ **7,405** ⬆ | **Worse on both counts** |
| **4. + breaker + fallback** | ⭐ **100%** | **152 ms** | ⭐ **1,655** | 4,182 fallbacks served |

## 1 · No protection — the cascade ⭐

```
p99 = 6.41s     71.6% failed
```

**Little's Law:** `concurrency = throughput × latency = 200 × 5 = 1,000` in-flight requests needed just to
keep up. **You have capacity for 50.** The pool fills, everything queues, and the service is down.

> ⭐ **"Slow is worse than down."** A dead dependency fails fast and you shed the load. A **slow** one
> silently consumes your capacity while you politely wait. **And the dependency never returned a single
> error** — every one of its responses was a success, just late.

## 2 · Timeout only

```
p99: 6.41s -> 154ms          success: 28.4% -> 25.7%
```

> ⭐ **A timeout doesn't make requests succeed — it makes failure fast and bounded.** The success rate barely
> moved; the p99 improved 42×. That's the point: you've stopped the dependency consuming your capacity,
> which is what lets the next two patterns work at all.

## 3 · Adding retries — the storm ⚠️

```
dependency calls: 5,601 -> 7,405   (+32%)
success:          25.7% -> 25.0%   (worse)
```

> ⭐ **Retrying a dependency that is slow FOR EVERYONE cannot help — the next attempt is just as slow.** You
> multiplied load on a struggling system and the success rate went *down*.
>
> **Retries are for transient, INDEPENDENT failures.** During a systemic one they are actively harmful.
>
> ⚠️ **Note full jitter was already enabled here.** Jitter prevents *spikes*; it does not prevent
> *amplification*. Only a breaker or a retry budget does that.

## 4 · Circuit breaker + fallback ✅

```
success:          25.0% -> 100%
dependency calls: 7,405 -> 1,655    (4.5x LESS)
fallbacks served: 4,182
breaker state:    open
```

> ⭐ **100% success with 4.5× less load on the dependency.** The breaker simultaneously made the user
> experience better *and* the dependency's situation better. Almost nothing else in reliability engineering
> does both.

**How:** after 10 consecutive failures the breaker opens → the app **stops calling the dependency entirely**
→ serves a fallback → the dependency gets breathing room → half-open probes test recovery automatically.

⭐ **The fallback is what makes it 100% rather than 0%.** A breaker without a fallback converts slow errors
into fast errors — better for stability, still an error for the user.

## ⭐ The gate Q4 answer, assembled

```
timeout   -> bounds the damage (fail fast, don't hang)
bulkhead  -> caps how much capacity one dependency can consume
breaker   -> stops calling something you know is broken, and lets it recover
fallback  -> the user still gets an answer
And retries WITHOUT a breaker make a systemic failure worse.
```

**Ship them together.** Each is insufficient alone — which is exactly what the four cases show.

---

# Part B — zero-downtime column rename

Rename `email` → `email_address` on a live table, **with a writer inserting and updating throughout**.

## Why not just `RENAME COLUMN`?

The rename is **instant** in Postgres. That's not the problem.

> ⭐ **You cannot deploy code and schema atomically.** The moment it commits, every running instance of the
> old code is still executing `SELECT email` — **immediate errors across the fleet** until the rolling deploy
> finishes. Both versions run simultaneously, so the schema must satisfy both.

## The eight steps

```
1. EXPAND     ADD COLUMN email_address text      -- NULLABLE, NO DEFAULT
2. DEPLOY     dual-write                          -- BEFORE the backfill
3. BACKFILL   batched, throttled, guarded, LOOPED UNTIL ZERO REMAIN
4. VERIFY     0 NULLs, 0 mismatches
5. SWITCH     reads over, behind a flag           <- last reversible step
6. RELAX      ALTER COLUMN email DROP NOT NULL    <- the step everyone forgets
7. STOP       writing the old column
8. CONTRACT   DROP COLUMN, days later             <- irreversible
```

## The result

```
writes attempted during the migration : 2,742
⭐ WRITE ERRORS                        : 0
NULL new column                       : 0
mismatched                            : 0
```

## ⭐ Two bugs this lab hit, both worth keeping

**1 · The backfill left 309 rows behind.** The first version iterated `id 1..200000` — but **rows are being
created while the backfill runs**, and everything inserted during the migration fell outside the planned
range.

> ⭐ **A backfill must converge on "zero remaining", not "I walked the range I planned for."**
> ```sql
> UPDATE users SET email_address = email
>  WHERE ctid IN (SELECT ctid FROM users WHERE email_address IS NULL LIMIT 5000);
> -- repeat until rowCount = 0
> ```

**2 · 398 write errors from a missing step.** `email` was declared `NOT NULL`. The moment the app stopped
writing it:

```
null value in column "email" of relation "users" violates not-null constraint
```

> ⭐ **You must `DROP NOT NULL` on the old column before you stop writing it.** A self-inflicted outage
> inside a migration whose entire purpose was zero downtime. **The constraint drop is metadata-only and
> instant.**

## The other details that matter

| Detail | Why |
|---|---|
| **Nullable, no default** | `NOT NULL` (or a default on older PG) **rewrites the whole table** under `ACCESS EXCLUSIVE` |
| ⭐ **Dual-write deployed BEFORE the backfill** | Otherwise rows land in the gap with a NULL new column |
| ⭐ **`AND email_address IS NULL` guard** | The backfill can **never overwrite a concurrent live write** — the detail that shows real experience |
| **Throttled batches** | A backfill competes with production traffic; unthrottled it spikes replication lag and bloats the table |
| **Verify before switching** | Counts + shadow reads. The step people skip. |
| ⭐ **`SET lock_timeout` before DDL** | A *waiting* `ALTER` queues every query behind it — one slow query + one migration = the table is down |

## ⭐ The pattern generalises

**Identical shape to:** a shard-key change ([3d-05](../../phase-03-databases/notes/3d-05-resharding-without-downtime.md)) ·
a store-to-store migration · an API version change · an event schema change · a cache key format change.

**Learn it once.**

---

## Things to try

| Try | How | Expect |
|---|---|---|
| **Tune the breaker** | `BREAKER_THRESHOLD=3`, `BREAKER_COOLDOWN=10000` | Trips sooner, recovers slower |
| **Remove the bulkhead** | Raise `MAX_CONCURRENCY` to 10000, mode `none` | Unbounded in-flight requests; the process degrades badly |
| **Errors instead of slowness** | `{"errorProbability":1}` on the dependency | ⭐ Much *less* damaging than slowness — fast failures |
| **Retry without jitter** | Replace `backoff()` with a constant | Synchronised retry waves |
| **Skip DROP NOT NULL** | Comment out step 6 | Reproduce the 398 errors |
| **Skip the `IS NULL` guard** | Remove it from the backfill | The backfill overwrites live writes |

```bash
docker compose down -v
```
