# 08·13 · Batch, Pipelines & Workflow Engines

> **Why this exists:** [note 07](07-sagas-as-architecture.md) left you needing an orchestrator with
> persistence, retries, timeouts and an operator view. ⭐ **Workflow engines are that component, already
> built** — and *"use Temporal / Step Functions rather than hand-rolling saga state"* is a strong senior
> answer.

---

## Reference

### ⭐ The problem: long-running, multi-step, must-not-be-lost

A refund flow: validate → reverse payment → restock → notify → update ledger. It takes seconds to *days*,
must survive process restarts and deploys, must retry each step, must be resumable, and must be
**answerable**: *"where is refund #123?"*

**Hand-rolled, you end up writing:** a state machine, a state table, a retry mechanism with backoff, timeout
handling, an idempotency scheme, a scheduler for delayed steps, and an admin UI.

> ⭐ **That list IS a workflow engine. The question is only whether you write it or adopt it.**

### ⭐ Durable execution — the idea worth understanding

**You write ordinary sequential code. The engine records every step's result in a durable log. If the
process dies, it replays the code, skipping already-completed steps using the log — and your function
resumes exactly where it was.**

```js
// Temporal-style: this looks like normal code and survives a machine dying mid-way
async function refund(orderId) {
  const order = await activity.validateOrder(orderId);
  await activity.reversePayment(order.paymentId);      // retried automatically
  await sleep('3 days');                               // ⭐ survives restarts, deploys, everything
  await activity.restockInventory(order.items);
  await activity.notifyCustomer(order.customerId);
}
```

> ⭐ **`await sleep('3 days')` is the demo that makes it click.** No cron row, no scheduler table, no
> "check for pending refunds" job. The workflow simply *is* paused for three days.
>
> ⭐ **The value: business logic looks like business logic** — no state machine, no event handlers, no
> correlation IDs threaded through six services.

⚠️ **The constraint that makes it work: workflow code must be DETERMINISTIC.** Replay must take the same
path. So no `Date.now()`, no `Math.random()`, no direct I/O, no unordered map iteration **in workflow code**
— all of that goes in *activities*, whose results are recorded. ⭐ **And "determinism" extends to
versioning: changing workflow code while workflows are in flight can break replay**, so engines give you
explicit versioning/patching APIs. **This is the real learning curve.**

### The options

| | Model | Best at | Watch out |
|---|---|---|---|
| ⭐ **Temporal / Cadence** | ⭐ **durable execution, code-as-workflow** | complex, long-lived business flows; sagas | ⚠️ a cluster + DB to run; determinism rules; real learning curve |
| **AWS Step Functions** | state machine as JSON/ASL | AWS-native orchestration, serverless glue | ⚠️ lock-in; ⚠️ logic in JSON gets unpleasant fast |
| ⭐ **Airflow / Dagster / Prefect** | ⭐ **scheduled DAGs over data** | ETL, batch pipelines, ML | ⚠️ **not for per-request business workflows** |
| **Camunda / Zeebe (BPMN)** | modelled processes | flows where business analysts model the process | heavier, enterprise-shaped |
| **A queue + your own state table** | DIY | simple 2–3 step flows | ⭐ **fine, and often correct — until it isn't** |

⭐ **The distinction that matters most: Airflow orchestrates *data on a schedule*; Temporal orchestrates
*business processes per entity*.** They look similar on a slide and are not interchangeable — ⚠️ using
Airflow to drive per-order workflows is a well-known mistake (it's a scheduler, and its unit is a DAG run,
not an entity).

### Batch and pipeline architecture

| Shape | |
|---|---|
| ⭐ **Batch** | bounded data, scheduled, ⭐ **restartable and reprocessable** — this is its superpower |
| **Streaming** | unbounded, continuous, low latency, windowed |
| ⚠️ **Lambda architecture** | batch + streaming in parallel, results merged. ⭐ **Two implementations of the same logic — a maintenance tax people regret** |
| ⭐ **Kappa architecture** | streaming only; reprocess by **replaying the log**. ⭐ **Simpler, and the modern default when your log retention allows it** |

**Batch pipeline properties to name:** ⭐ **idempotent stages** (a rerun must be safe) · ⭐ **partial failure
recovery** — restart from the failed stage, not from the beginning · **backfill support** — reprocess
history when logic changes · **data quality gates between stages** · **lineage** — where did this number
come from?

### ⭐ When to reach for an engine

| ✅ | ❌ |
|---|---|
| ⭐ Flows lasting **minutes to months** | a single synchronous request |
| ⭐ **You'd otherwise write a state machine + state table + retries** | 2 steps and a queue |
| Complex compensation ([sagas](07-sagas-as-architecture.md)) | fire-and-forget |
| ⭐ **"Where is order #123?" must be answerable** | no operational visibility need |
| Human-in-the-loop steps (approvals) | |
| ⭐ **Many flows, and the state-machine code is spreading** | one flow, ever |

> ⭐ **The honest trade:** an engine is **real operational weight** (Temporal is a cluster and a database)
> and a real learning curve. ⭐ **For one simple saga, a queue plus a state column is the right answer.** For
> five complex flows with compensation, the engine costs less than the fifth hand-rolled state machine —
> **and it comes with the operator UI you'd otherwise never get funded to build.**

### ⭐ Read/write path separation, one more time

Batch and streaming are the same instinct as [CQRS](05-cqrs.md): ⭐ **the path that accepts data and the path
that serves it have different requirements, so give them different designs.** Ingest fast and simple; derive
the query-shaped views separately; keep the derivation **rebuildable**. That instinct — *separate the paths,
keep the derived side disposable* — is the transferable idea in this whole phase.

---

## In your own words

**⭐ What do you end up writing by hand, and what does that list amount to?**

>

**Explain durable execution. What makes `await sleep('3 days')` possible?**

>

**⭐ Why must workflow code be deterministic, and what does that ban? What's the versioning problem?**

>

**⭐ Airflow vs Temporal — state the distinction and the classic misuse.**

>

**Lambda vs Kappa architecture. Which is simpler and why?**

>

**Name four properties a batch pipeline needs.**

>

**⭐ When is a queue plus a state column the right answer instead of an engine?**

>

**⭐ What tips it the other way?**

>

**⭐ How is batch/streaming the same instinct as CQRS?**

>

---

## Links

- The orchestrator this replaces → [07-sagas-as-architecture.md](07-sagas-as-architecture.md)
- Orchestration vs choreography → [03-coupling-and-communication.md](03-coupling-and-communication.md)
- Read/write separation → [05-cqrs.md](05-cqrs.md)
- Replay as a first-class idea → [06-event-sourcing.md](06-event-sourcing.md)
- Queues, retries, DLQs, log replay → [Phase 6](../../phase-06-messaging/notes/)
- Adopt or build? → [14-build-vs-buy.md](14-build-vs-buy.md)
