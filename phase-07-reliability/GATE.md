# Phase 7 — Gate

> **Rules:** Out loud. From memory. No notes.
> **Q1 is the phase's whole point: you must VOLUNTEER it, unprompted.**

---

## Q1 · For a design you've drawn, list every failure mode and its mitigation — unprompted

**Take any design from your practice problems. Walk it. Nobody should have to ask.**

**You pass if you walked the diagram systematically:**

- [ ] ⭐ **For every box: what happens when it DIES? when it's SLOW? when it's OVERLOADED?**
- [ ] For every arrow: **what's the timeout, the retry policy, the fallback?**
- [ ] **CDN dies** → origin gets 100% of traffic, sized for 5%
- [ ] **App instance dies** → LB routes around it; N−1 capacity
- [ ] ⭐ **App instance is SLOW** → gray failure; only p99 catches it
- [ ] ⭐ **Cache dies** → **the cold-cache outage** (cite your Phase 5 numbers)
- [ ] **DB primary dies** → failover, split brain, fencing, RPO
- [ ] ⭐ **A dependency is SLOW** → cascade (cite your 6.41 s p99)
- [ ] **Queue** → unbounded growth; alert on lag *growth*
- [ ] **DNS provider** → total outage; use two
- [ ] ⭐ **The deploy pipeline** → correlated across every replica

**And the marks that separate a strong answer:**

- [ ] ⭐ **You volunteered it** without being prompted
- [ ] ⭐ **"Slow is worse than down"** — with the reason
- [ ] ⭐ **The cold cache** — losing a *performance* component causing an *availability* failure
- [ ] ⭐ **Correlated failure via change** — "multi-AZ defends the rarer cause"
- [ ] You named **metastable failure** and the diagnostic question
- [ ] You gave **mitigations**, not just failure names

**Self-score:** ___ / 16

---

## Q2 · Design a distributed rate limiter and defend the accuracy/latency tradeoff

- [ ] **Algorithms** and their trades; ⭐ **token bucket as the default** (O(1), tunable bursts)
- [ ] **Fixed window's boundary problem** — cite your Phase 5 measurement (20 through a 10-limit)
- [ ] ⭐ **The distributed trade**: centralised = exact + a round trip; local-only = free + **wrong**; **local + periodic sync = the answer**
- [ ] ⭐ **State the overshoot BOUND**: `instances × sync interval × per-instance rate` — *"a few percent, which is irrelevant for a 1,000/min limit"*
- [ ] ⭐ **When you'd take the round trip instead**: when the limit is a paid quota, i.e. billing
- [ ] ⭐ **What happens when the limiter is down** — fail open (usually), fail closed (expensive endpoints), or **degrade to local limits**
- [ ] **Enforce as early as possible**; limit on **several dimensions**
- [ ] **Client contract**: `429` + `Retry-After` + limit headers on success too; ⚠️ clients still need jitter
- [ ] **429 vs 503** — *you're* over your limit vs *we're* overloaded
- [ ] Bonus: **quotas need accuracy** (billing); **throttling doesn't**
- [ ] Bonus: ⚠️ IP-based limiting breaks behind NAT

**Self-score:** ___ / 11

---

## Q3 · Walk through a zero-downtime column rename on a 500 M-row table

- [ ] ⭐ **Why not just rename**: it's instant, but **you can't deploy code and schema atomically** — old code breaks the moment it commits
- [ ] **1. EXPAND** — add the column **nullable, no default** (else a full table rewrite under `ACCESS EXCLUSIVE`)
- [ ] ⭐ **2. DEPLOY dual-write BEFORE the backfill** — and it must coexist with the old version
- [ ] **3. BACKFILL** — batched, throttled
- [ ] ⭐ **…guarded with `AND email_address IS NULL`** so it can never overwrite a concurrent live write
- [ ] ⭐ **…LOOPED UNTIL ZERO REMAIN**, not a fixed range — rows are created while you run *(cite the lab's 309-row bug)*
- [ ] **4. VERIFY** — counts + **shadow reads**
- [ ] **5. SWITCH reads** gradually behind a flag ← **last reversible step**
- [ ] ⭐ **6. DROP NOT NULL on the old column** before you stop writing it *(cite the lab's 398 errors)*
- [ ] **7. STOP** dual-writing · **8. CONTRACT** days later
- [ ] ⭐ **`SET lock_timeout` before DDL** — a waiting `ALTER` queues every query behind it
- [ ] ⭐ **The pattern generalises** — shard keys, store migrations, API versions, event schemas
- [ ] At 500 M rows: the **backfill is the long pole** — days, throttled against replication lag

**Self-score:** ___ / 13 · **Time: ____**

---

## Q4 · What happens when a downstream dependency slows to 5 s p99 — and what stops it taking you down?

- [ ] ⭐ **The mechanism**: Little's Law — `200 req/s × 5 s = 1,000 concurrent` needed; you have 50
- [ ] Pool exhausted → everything queues → **your service is down**
- [ ] Your callers time out → **they** fill up → the cascade propagates upstream
- [ ] ⭐ **"Slow is worse than down"** — a dead dependency fails fast and you shed; a slow one consumes your capacity
- [ ] ⭐ **The dependency never returned an error** — every response was a success, just late

**What stops it:**

- [ ] **Timeout** — bounds the damage. Cite: **p99 6.41 s → 154 ms**
- [ ] **Bulkhead** — caps how much capacity one dependency can consume
- [ ] ⭐ **Circuit breaker** — stops calling it. Cite: **25% → 100% success, 4.5× less dependency load**
- [ ] ⭐ **Fallback** — what makes it 100% rather than a faster 0%
- [ ] **Load shedding** — reject excess early
- [ ] ⭐ **And retries WITHOUT a breaker make it worse** — cite: **5,601 → 7,405 calls, success went down**
- [ ] Bonus: **deadline propagation** — don't start work whose deadline has passed
- [ ] Bonus: monitoring — this is a **gray failure**; alert on p99, not error rate

**Self-score:** ___ / 13

---

## Extra checks

- [ ] Four timeout types — which is forgotten, and what bug follows?
- [ ] ⭐ **How do you pick a timeout value?** Why is too short also dangerous?
- [ ] Why must your timeout be **shorter than your caller's**?
- [ ] ⭐ **Retry budget** vs a fixed count
- [ ] **Full jitter** — what it fixes and what it doesn't
- [ ] Circuit breaker states; why is one failure in half-open enough to re-open?
- [ ] Should **4xx** count as a breaker failure? Why not?
- [ ] **Bulkhead sizing** with Little's Law; semaphore vs thread pool
- [ ] ⭐ **Prioritised load shedding** — what goes first, and why retries?
- [ ] Why must **rejection be cheap**?
- [ ] ⭐ **Why "shed first, then scale"?**
- [ ] The **degradation ladder**; why is a breaker without a fallback half a pattern?
- [ ] ⭐ **Metastable failure** — the diagnostic question and the only fix
- [ ] **Three pillars** — what each is *bad* at
- [ ] ⭐ **Cardinality** — what belongs in labels vs logs
- [ ] ⭐ **RED vs USE**; why is saturation the predictor?
- [ ] **Head vs tail sampling**
- [ ] ⭐ **Symptoms not causes** — the test, and the one exception
- [ ] **Burn-rate alerting** — why it cures alert fatigue
- [ ] ⭐ **"Most outages come from change"** — what does that imply about where to invest?
- [ ] Four cases where you **cannot roll back**
- [ ] ⭐ Why are **config pushes** the least safe change?
- [ ] **RPO/RTO** with numbers; why is **replication not a backup**?
- [ ] ⭐ **Cells and shuffle sharding** — what do they convert an outage into?
- [ ] ⭐ **What separates a chaos experiment from an outage you caused?**

---

## Scoring

| Result | Do this |
|---|---|
| All four passed + most extras | ✅ Advance to **Phase 8 — Architecture Patterns** |
| Fumbled any of Q1–Q4 | ⛔ Redo that note's "own words" section, retry in 2 days |

| Fumbled | Redo |
|---|---|
| Q1 | [notes/08](notes/08-failure-modes.md) — then annotate three of your own designs |
| Q2 | [notes/07](notes/07-rate-limiting.md) + [Phase 5 lab](../phase-05-caching/lab/) Part B |
| Q3 | [notes/12](notes/12-zero-downtime-migrations.md) + re-run lab Part B |
| Q4 | [notes/01](notes/01-timeouts-and-deadlines.md)–[06](notes/06-graceful-degradation.md) + re-run lab Part A |

---

## Before Phase 8

You have now covered **every technically heavy phase**. Phases 8–11 are architecture, security, and
interview craft — lighter, and the roadmap says to let 8–10 go shallow if time is compressed.

- [ ] ⭐ **Practice problems: the roadmap wants 13–15 by Week 11.** This gate has flagged it every phase.
      **If you are still near zero, stop building knowledge and start practising delivery** — Phase 7 gives
      you the failure-path material that most improves a mock, and it only helps if you use it.
- [ ] ⭐ **Record yourself doing a 45-minute design.** The roadmap: *"the fastest improvement you will get
      from any single hour."*
- [ ] Go back to one earlier design and **add the full failure analysis** you can now do.

---

## Gate log

| Attempt | Date | Q1 | Q2 | Q3 (time) | Q4 | Notes |
|---|---|---|---|---|---|---|
| 1 |  | /16 | /11 | /13 ( ) | /13 |  |
| 2 |  | /16 | /11 | /13 ( ) | /13 |  |
