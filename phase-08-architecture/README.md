# Phase 8 — Architecture Patterns

**Week 12 · ~8 hrs**

---

## Why this phase exists

Phases 0–7 were about making systems work and making them survive failure. This phase is about **how you cut
a system up** — and, more importantly, **when you shouldn't.**

The roadmap's warning is the whole phase in one line:

> ⭐ *"**Be prepared to argue *for* the monolith.** Reflexive microservices is a junior tell."*

Every topic here has the same shape: a pattern that is genuinely powerful, genuinely expensive, and applied
reflexively by people who've read about it. **CQRS. Event sourcing. Microservices. Serverless. A mesh.**
⭐ **The senior skill isn't knowing them — it's knowing the cost, naming it unprompted, and being willing to
say "not here."**

⭐ **And you must commit.** All three gate questions ask you to argue both sides *and then choose*. Fence-
sitting scores zero — the point of understanding both sides is to make a defensible call.

**The roadmap says 8–10 may go shallow if time is compressed.** ⭐ **If you're compressing, do the
[worksheet](lab/decomposition/WORKSHEET.md), notes [01](notes/01-monolith-vs-microservices.md),
[02](notes/02-service-boundaries.md), [05](notes/05-cqrs.md), [06](notes/06-event-sourcing.md),
[10](notes/10-multi-tenancy.md), [14](notes/14-build-vs-buy.md), and the gate.** That's the examinable core.

---

## How to work this phase

| Step | Do this | Time |
|---|---|---|
| 1 | Read [`notes/`](notes/) 01 → 14. Reference half, once. | ~2 hrs |
| 2 | Fill in the "In your own words" halves. **The actual work.** | ~2 hrs |
| 3 | ⭐ [`lab/decomposition/WORKSHEET.md`](lab/decomposition/WORKSHEET.md) — **the phase's real lab** | ~1.5 hrs |
| 4 | [`lab/`](lab/) Part B — multi-tenancy isolation, measured | ~30 min |
| 5 | ⭐ **Say the worksheet out loud in under 6 minutes.** Both sides, then commit. | ~30 min |
| 6 | [`GATE.md`](GATE.md) out loud. | ~1 hr |

**Read alongside:** **Sam Newman, *Building Microservices* (2nd ed.)** ch. 1–3 · **Martin Fowler,
"MonolithFirst"** and **"Microservice Premium"** · **Chris Richardson, *Microservices Patterns*** ch. 4 for
sagas.

---

## Topics

| # | Note | The one thing it's for |
|---|---|---|
| 01 | [Monolith vs microservices](notes/01-monolith-vs-microservices.md) | ⭐ **Gate Q1** · the three real benefits · **the distributed monolith** |
| 02 | [Service boundaries](notes/02-service-boundaries.md) | Capability not layer · ⭐ **data ownership is the boundary** |
| 03 | [Coupling & communication](notes/03-coupling-and-communication.md) | ⭐ Sync/async **per interaction** · **async doesn't remove schema coupling** |
| 04 | [Discovery & mesh](notes/04-service-discovery-and-mesh.md) | ⭐ **What belongs in infrastructure vs in code** |
| 05 | [CQRS](notes/05-cqrs.md) | ⭐ **Gate Q2** · the levels · read/write separation as an instinct |
| 06 | [Event sourcing](notes/06-event-sourcing.md) | ⭐ **Gate Q2** · **event versioning is the cost people miss** |
| 07 | [Sagas as architecture](notes/07-sagas-as-architecture.md) | ⭐ **Compensation ≠ rollback** · sagas give up **I** · pivot steps |
| 08 | [Legacy migration](notes/08-legacy-migration.md) | Strangler fig · ⭐ **shadow traffic** · **the 80% stall** |
| 09 | [BFF & composition](notes/09-bff-and-api-composition.md) | ⭐ Availability multiplies · **REQUIRED vs OPTIONAL dependencies** |
| 10 | [Multi-tenancy](notes/10-multi-tenancy.md) | ⭐ **Gate Q3** · you watched the leak, and RLS stop it |
| 11 | [API evolution & contracts](notes/11-api-evolution-and-contract-testing.md) | ⭐ **Idempotency** · compatible evolution · consumer-driven contracts |
| 12 | [Serverless](notes/12-serverless.md) | Cold starts · ⭐ **elastic compute in front of non-elastic state** |
| 13 | [Workflow engines](notes/13-workflow-engines.md) | ⭐ **Durable execution** · Airflow ≠ Temporal · Kappa > Lambda |
| 14 | [Build vs buy](notes/14-build-vs-buy.md) | ⭐ **"A senior consideration interviewers listen for"** · TCO · reversibility |

---

## Lab

[`lab/`](lab/) — **two parts, very unequal.**

### ⭐ Part A — [the decomposition worksheet](lab/decomposition/WORKSHEET.md) · *this is the phase*

The roadmap's own lab, as a fill-in worksheet: boundaries, data ownership, sync vs async per interaction,
what breaks during the migration — **then the counter-argument for keeping it a monolith, written to win** —
then **commit**.

### Part B — multi-tenancy isolation, measured

| What you see | |
|---|---|
| ⭐ **The leak** | one forgotten `WHERE` and Acme reads **Globex's 50,000 secret deal** |
| ⭐ **RLS** | the **identical buggy query**, now returning only the caller's rows |
| **Schema per tenant** | unreachable, not merely filtered — and **N migrations** |
| ⭐ **Noisy neighbour** | a minnow's query: **7.7 ms → 0.1 ms**, a **58×** difference caused entirely by *another tenant's* data |

> ⭐ **The rule it proves: `tenant_id` must lead essentially every index — and even then, performance
> isolation needs quotas or separation, not just indexing.**

---

## Definition of done

- [ ] All 14 notes have the "In your own words" half filled in
- [ ] ⭐ **The worksheet is complete for a system you actually know**
- [ ] ⭐ **Part 2 of the worksheet is genuinely persuasive** — not a strawman
- [ ] ⭐ **You can deliver both sides + a commitment in under 6 minutes, out loud**
- [ ] `lab/README.md` RESULTS filled in with your own multi-tenancy numbers
- [ ] You can write the RLS policy from memory, including `FORCE`
- [ ] You can give the three-scale multi-tenancy answer without notes
- [ ] You can say when CQRS and event sourcing are **résumé-driven**
- [ ] [`GATE.md`](GATE.md) passed out loud
