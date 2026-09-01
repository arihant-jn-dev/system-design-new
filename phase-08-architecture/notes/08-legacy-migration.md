# 08·08 · Legacy Migration — Strangler Fig, Branch by Abstraction, ACL

> **Why this exists:** ⭐ **you will almost never design a system from scratch. You will change one that is
> running, that people depend on, that you can't stop.** The migration *is* the project — and it's the part
> most candidates skip.

---

## Reference

### ⭐ The rule: never rewrite

**The big-bang rewrite fails for reasons that are structural, not motivational:**

| | |
|---|---|
| ⭐ **The old system keeps changing** while you rebuild — you're chasing a moving target with a smaller team |
| ⭐ **The legacy behaviour nobody documented is the behaviour customers depend on** — including the bugs |
| **Two systems to maintain** for the whole (always-longer) duration |
| **No value ships until the end** — so the project is cancellable at every moment |
| **The switch-over is one enormous, unrehearsed, un-rollbackable event** |

> ⭐ **Incremental migration means every step delivers value and every step is reversible.** That's the whole
> argument. (Joel Spolsky's *"Things You Should Never Do"* is the canonical essay; Netscape is the canonical
> corpse.)

### ⭐ Strangler fig

Named for the vine that grows around a tree, gradually replaces it, and leaves a hollow shell.

```
        ┌──────────┐         ┌──────────┐         ┌──────────┐
client▶ │ FACADE   │  client▶│ FACADE   │  client▶│ FACADE   │
        │  ↓       │         │ ↓      ↓ │         │       ↓  │
        │ legacy   │         │legacy  new│        │      new │
        └──────────┘         └──────────┘         └──────────┘
          step 1               step 2               step 3
```

| Step | |
|---|---|
| **1. Put a facade in front** — a proxy/gateway routing 100% to legacy. ⭐ **Ship this first and change nothing else**, so you prove the interception layer works while risk is zero |
| **2. Pick one capability**, build it in the new service |
| ⭐ **3. Route a slice** — 1% of traffic, or one tenant, or one endpoint — via the facade |
| ⭐ **4. Verify, then ramp.** ⭐ **Shadow/mirror traffic first: send it to both, compare, serve legacy's answer.** You get production-traffic verification with zero user risk |
| **5. Migrate the data for that capability** |
| **6. Delete the legacy code path.** ⚠️ **This step is what people skip, and skipping it is how you end up permanently running both** |
| **7. Repeat** |

⭐ **Where the facade lives:** an API gateway/reverse proxy (cleanest) · your existing LB · the monolith
itself calling out to the new service (works well when there's no clean HTTP edge) · a client-side flag
(⚠️ worst — you can't change routing without a client release).

### Branch by abstraction — for what a facade can't reach

When the thing you're replacing is *inside* the code (an ORM, a payments library, a core module), there's no
network edge to intercept:

| Step | |
|---|---|
| 1 | **Introduce an abstraction** over the existing implementation |
| 2 | **Move all callers onto the abstraction** — behaviour unchanged, easy to review, ships immediately |
| 3 | **Build the new implementation behind the same abstraction** |
| 4 | ⭐ **Switch via a flag — per-request, so rollback is instant.** Optionally run both and compare |
| 5 | **Remove the old implementation and (usually) the abstraction** |

> ⭐ **The point: the trunk is always releasable.** No long-lived branch, no merge hell, and you can stop at
> any step without leaving the system broken.

### ⭐ Anti-corruption layer (ACL)

**A translation layer that keeps the legacy model out of your new service.**

```
new service (clean model) ──▶ [ ACL ] ──▶ legacy (CUST_MSTR, status codes 1/2/7)
```

⭐ **Without one, the legacy schema leaks into your new code and you have rebuilt the old system with new
syntax.** With one, exactly one small, ugly, well-tested module knows that `status = 7` means "closed
pending review", and everything else speaks the clean language.

⚠️ **It's a cost, not a feature.** It's extra code with no business value, and it should have a planned
death: ⭐ **the ACL dies when the legacy system does. Say that out loud, or it becomes permanent.**

### ⭐ Moving the data — the actually hard part

Routing is easy. **Data is where migrations fail.** The order that works:

| Phase | |
|---|---|
| **1. New service reads legacy's data** (via API or a replica). Legacy still owns and writes it. ⭐ **Lowest-risk starting point** |
| **2. Dual-write** — writes go to both stores. ⭐ **Legacy remains the source of truth**, so an inconsistency in the new store is harmless |
| **3. Backfill** history into the new store — batched, throttled, ⭐ **looped until zero remain, not over a fixed range** *(Phase 7's 309-row bug)* |
| ⭐ **4. Reconcile continuously** — a job that compares and reports drift. **Do not skip this: dual-write drift is silent** |
| **5. Flip the source of truth** — new store becomes authoritative. ⭐ **This is the last cheaply reversible step** |
| **6. Stop writing to legacy**, then delete legacy's copy — days later, after the backup window |

> ⭐ **This is Phase 7's expand → migrate → contract, applied across a service boundary instead of across a
> column.** Same shape, same traps: don't stop dual-writing until the constraints allow it, and don't
> contract until you're sure.

### What breaks — say these before you're asked

⚠️ **Behaviour parity** — the legacy system has undocumented behaviour customers rely on. **Shadow traffic
and diff the responses; that's how you find it.**
⚠️ **Silent dual-write drift** — one write path fails and nobody notices for a month.
⚠️ **Distributed transactions appear** where there used to be one.
⚠️ **Latency regresses** — a function call became a network call.
⚠️ **Reporting breaks** — someone's dashboard queried the old table directly. (⭐ Always more consumers than
you think. Audit them *first*.)
⚠️ **The facade becomes a permanent bottleneck** and a piece of business logic.
⚠️ ⭐ **The migration stalls at 80%** — the interesting parts are done, the last capabilities are boring and
hard, funding moves on, and **you run both systems forever.** ⭐ **This is the most common real outcome; the
mitigation is to fund and schedule the *deletion* as part of the project, not after it.**

### Making it survivable

- ⭐ **Feature flags with instant, per-request rollback** ([Phase 7 note 11](../../phase-07-reliability/notes/11-deployment-safety.md))
- ⭐ **Shadow traffic + response diffing** before every cutover
- **Ramp by percentage, tenant, or region** — and know what triggers a rollback *before* you start
- ⭐ **A metric that proves parity**, not just absence of errors
- **Migrate the painful capability early enough to prove value** — that's what keeps the project funded
- ⭐ **Define "done" as legacy DELETED**, and put it in the plan

---

## In your own words

**⭐ Give three structural reasons the big-bang rewrite fails.**

>

**Walk the strangler fig steps. Which step do people skip, and what happens?**

>

**⭐ Why ship the facade first, routing 100% to legacy?**

>

**What is shadow traffic and why is it the highest-value verification step?**

>

**When do you need branch by abstraction instead of a strangler fig?**

>

**⭐ What is an ACL protecting you from, and when should it die?**

>

**Walk the six data-migration phases. Which is the last reversible step?**

>

**⭐ Why is continuous reconciliation non-negotiable during dual-write?**

>

**Name four things that break during a migration and how you'd detect each fast.**

>

**⭐ What is the most common real outcome of a decomposition, and how do you prevent it?**

>

---

## Links

- ⭐ **You wrote a migration plan** → [`../lab/decomposition/WORKSHEET.md`](../lab/decomposition/WORKSHEET.md) §1.4
- ⭐ **You performed expand → migrate → contract with writes flowing** → [Phase 7 lab Part B](../../phase-07-reliability/lab/)
- Flags, canaries, rollback → [Phase 7 note 11](../../phase-07-reliability/notes/11-deployment-safety.md)
- Zero-downtime schema change → [Phase 7 note 12](../../phase-07-reliability/notes/12-zero-downtime-migrations.md)
- Where to draw the first boundary → [02-service-boundaries.md](02-service-boundaries.md)
- The facade is often a BFF or gateway → [09-bff-and-api-composition.md](09-bff-and-api-composition.md)
- **Martin Fowler, "StranglerFigApplication"** · **Joel Spolsky, "Things You Should Never Do"**
