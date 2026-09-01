# 08·07 · Sagas as an Architectural Pattern

> **Why this exists:** you met sagas in [Phase 6](../../phase-06-messaging/notes/) as a messaging mechanism.
> Here they're the **architectural consequence of a boundary**: ⭐ **the moment you split two things that
> used to commit together, you have chosen a saga — whether or not you say the word.**

---

## Reference

### The problem, stated precisely

One ACID transaction across `Order`, `Payment` and `Inventory` becomes three transactions in three services.
**There is no distributed rollback.** Two-phase commit *technically* exists and is ⭐ **almost always the
wrong answer at service scale**: it's a blocking protocol, it holds locks across a network, the coordinator
is a single point of failure, and one slow participant stalls everyone.

> ⭐ **A saga is a sequence of local transactions where each step has a compensating action, and failure is
> handled by compensating the steps already done — not by rolling back.**

### ⭐ Compensation is not rollback

| Rollback | ⭐ Compensation |
|---|---|
| The change never happened | ⭐ **The change happened, and a second change undoes its effect** |
| Invisible to everyone | ⭐ **Visible — someone may have seen the intermediate state** |
| Automatic | ⭐ **You write it, per step, as domain logic** |
| Always possible | ⚠️ **Sometimes impossible** |

**The examples that make it click:** you can't un-send an email — you send a correction. You can't un-charge
a card — you refund it, and the customer sees both lines on their statement. You can't un-ship a parcel —
you start a return.

> ⭐ **"Compensation is a business decision, not a technical one."** What does *undoing* a shipped order
> mean? That's a product question. Saying this out loud is a strong senior signal.

### ⭐ The consequences you must volunteer

| Consequence | |
|---|---|
| ⭐ **No isolation** | ⚠️ **the intermediate states ARE VISIBLE.** Another transaction can read a half-completed saga. Sagas give you **A**, **C** (eventually) and **D** — ⭐ **they explicitly give up I.** |
| **Dirty reads / lost updates** | mitigate with **semantic locks** (an `PENDING` status field), **commutative updates**, or **re-reading and re-validating** |
| ⭐ **Compensation can itself fail** | it must be **retryable and idempotent**, and needs an alert + manual path when it exhausts retries |
| ⭐ **Some steps aren't compensatable** | ⭐ **so order the steps: do the reversible and risky things FIRST, the irreversible ones LAST.** Reserve inventory → authorise payment → **ship**. Never ship first. |
| **Every step must be idempotent** | at-least-once delivery guarantees retries |
| **The flow needs its own state** | "where is saga #123?" must be answerable |

### Pivot transactions — the vocabulary that impresses

| Step type | |
|---|---|
| **Compensatable** | can be undone (reserve inventory) |
| ⭐ **Pivot** | **the point of no return.** Once it commits, the saga must go forward |
| **Retriable** | after the pivot; must eventually succeed (retry forever, alert if not) |

> ⭐ **Design so that everything before the pivot is cheap to undo, and everything after it is guaranteed to
> succeed given enough retries.** That structure is what makes a saga operable.

### Orchestration vs choreography, applied ([03](03-coupling-and-communication.md))

| ⭐ **Orchestrated saga** | **Choreographed saga** |
|---|---|
| A coordinator drives each step and knows the compensations | Each service reacts to the previous event |
| ⭐ **The flow is readable in one file** | ⚠️ the flow exists nowhere |
| ⭐ **State is queryable — "where is saga #123?"** | ⚠️ correlate logs across N services |
| ⭐ **Compensation logic is centralised** | scattered, easy to get subtly wrong |
| Coupling: coordinator ↔ all participants | participants ↔ event shapes |
| Best for: **checkout, refunds, onboarding** | **notifications, fan-out, 2–3 simple steps** |

> ⭐ **For anything with money or more than ~3 steps: orchestrate.** The debugging and compensation story
> is worth the central component — and a **workflow engine** ([13](13-workflow-engines.md)) gives you the
> orchestrator, its persistence, its retries and its timeouts without writing them.

### ⭐ The design instinct that matters more than the pattern

**Before writing a saga, ask whether the boundary is wrong.**

If `Order` and `Payment` must always succeed or fail together, that's evidence they belong in **one
aggregate** ([02](02-service-boundaries.md)) — and then it's one ACID transaction and no saga at all.

> ⭐ **A saga is the price of a boundary. Sometimes the right move is to not pay it.**
>
> Ways to avoid one entirely: keep the two things in one service · make the second step **async and
> guaranteed** rather than transactional (outbox + retry forever — no compensation needed if it can't
> permanently fail) · **redesign the flow** so the user's action commits one thing and everything else is a
> consequence.

### Implementation checklist

- ⭐ **Outbox pattern** so "commit local state" and "publish the next step" are atomic ([Phase 6](../../phase-06-messaging/notes/))
- ⭐ **Idempotency keys** on every step and every compensation
- **Persist saga state** — status, current step, correlation ID
- ⭐ **Timeouts per step**, and a defined action when one fires (compensate? escalate?)
- **A dead-letter path + alert** for sagas that are stuck
- ⭐ **An operator view**: list stuck sagas, retry, force-compensate. **You will need it, at 3am**
- **Test the compensations** — they're the least-exercised and highest-consequence code you have

---

## In your own words

**Define a saga, and explain why compensation ≠ rollback with a real example.**

>

**⭐ Which ACID letter do sagas give up, and what concretely goes wrong because of it?**

>

**What's a semantic lock, and what does it mitigate?**

>

**⭐ Explain the pivot transaction, and how it should shape your step ordering.**

>

**Give an example of a step that cannot be compensated, and where it must go in the sequence.**

>

**Orchestration or choreography for a checkout flow? Defend it.**

>

**⭐ "A saga is the price of a boundary." What should you check before paying it?**

>

**Name three ways to avoid needing a saga at all.**

>

**⭐ What does the 3am operator need that you must build up front?**

>

---

## Links

- The mechanism, and the outbox → [Phase 6](../../phase-06-messaging/notes/)
- Where boundaries come from → [02-service-boundaries.md](02-service-boundaries.md)
- Orchestration vs choreography in general → [03-coupling-and-communication.md](03-coupling-and-communication.md)
- ⭐ Getting the orchestrator for free → [13-workflow-engines.md](13-workflow-engines.md)
- Retries, timeouts, DLQs → [Phase 7](../../phase-07-reliability/notes/02-retries-and-budgets.md)
- ⭐ **You lost a transaction at a boundary** → [`../lab/decomposition/WORKSHEET.md`](../lab/decomposition/WORKSHEET.md) §1.2
- **Chris Richardson, *Microservices Patterns*** — ch. 4 is the definitive treatment
