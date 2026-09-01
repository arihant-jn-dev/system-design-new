# 08·03 · Coupling — Sync vs Async, Orchestration vs Choreography

> **Why this exists:** the roadmap frames it exactly right — sync vs async is **a coupling decision**, not a
> performance one. Answering "we'll use events" globally is a tell; answering it *per interaction* is the
> skill.

---

## Reference

### ⭐ The decision rule

> ⭐ **Is the caller's own correctness or response blocked on the answer?**
> **Yes → synchronous.** **No, it just needs to eventually happen → asynchronous.**

| | **Synchronous** | **Asynchronous** |
|---|---|---|
| Caller | blocks, gets the answer | fires, moves on |
| ⭐ Coupling | **temporal** — both must be up *now* | ⭐ **decoupled in time** |
| Callee down | ⚠️ caller fails (or degrades) | ⭐ messages queue, catch up later |
| Consistency | immediate | eventual |
| Failure handling | timeout / retry / breaker | retry from the broker, DLQ |
| ⭐ Debugging | a trace, roughly linear | ⚠️ **much harder** — no single thread of control |
| Backpressure | ⚠️ propagates to the user | absorbed by the queue |
| Latency to caller | the callee's latency | ~0 |

### Worked examples

| Interaction | Choice | Why |
|---|---|---|
| Checkout → **authorise payment** | ⭐ **sync** | the user must be told yes/no now; correctness depends on it |
| Checkout → **send confirmation email** | ⭐ **async** | nobody's checkout should fail because SMTP is down |
| Order → **update search index** | async | staleness of seconds is fine |
| API → **read the user's profile to render** | sync | you can't render without it |
| Order placed → **analytics / warehouse** | async | zero user impact |
| Signup → **check username uniqueness** | sync | it's an invariant, not a notification |
| Upload → **transcode video** | async | long-running; the user gets a status |

### ⭐ The three couplings, and which you can actually remove

| Coupling | Meaning | Removed by |
|---|---|---|
| ⭐ **Temporal** | both must be running at the same instant | ⭐ **async messaging** |
| **Spatial / location** | caller must know where the callee is | discovery, a broker |
| ⭐ **Schema / contract** | both must agree on the payload shape | ⚠️ **nothing removes this** — only *manage* it, with compatible evolution ([11](11-api-evolution-and-contract-testing.md)) |

> ⭐ **Async removes temporal coupling. It does NOT remove schema coupling** — and schema coupling is what
> actually blocks independent deploys. Publishing an event whose shape four consumers depend on is still a
> contract you can break. **This is the most common misunderstanding of "events decouple us."**

### ⭐ What async actually costs

| Cost | |
|---|---|
| ⭐ **Eventual consistency becomes user-visible** | "I placed the order but don't see it" |
| ⭐ **Debugging without a linear trace** | you need correlation IDs and tracing from day one |
| **Idempotency is mandatory** | at-least-once delivery ⇒ duplicates ([Phase 6](../../phase-06-messaging/notes/)) |
| **Ordering is only per-partition** | global ordering is not on the menu |
| **A broker to run** | plus lag alerts, DLQs, and a replay story |
| ⚠️ **Dual-write** | "update DB and publish" is not atomic → **outbox pattern** |

### Command vs event — a distinction that changes your coupling

| | **Command** | ⭐ **Event** |
|---|---|---|
| Says | *"do this"* (`ChargeCard`) | *"this happened"* (`OrderPlaced`) |
| Recipients | one, named | ⭐ **any number, unknown to the publisher** |
| Coupling direction | caller knows the callee | ⭐ **publisher knows nothing about consumers** |
| Can be rejected | yes | no — it's already true |

> ⭐ **Events give the loosest coupling because the publisher doesn't know who's listening** — adding a
> fifth consumer requires zero changes upstream. That is the actual decoupling benefit; "async" alone isn't.

⚠️ **A "command sent over a topic" is still a command.** Naming a queue `events` doesn't decouple anything if
the payload is `PleaseSendEmail` addressed at one consumer.

### ⭐ Orchestration vs choreography

| | **Orchestration** | **Choreography** |
|---|---|---|
| Shape | a central coordinator calls each step | each service reacts to others' events |
| ⭐ Visibility | ⭐ **the flow exists in one readable place** | ⚠️ **the flow exists nowhere** — it's emergent |
| Coupling | coordinator knows all participants | participants know only event shapes |
| Adding a step | change the coordinator | add a subscriber, change nothing |
| Debugging | ⭐ ask the coordinator for state | ⚠️ correlate logs across N services |
| Failure handling | ⭐ centralised, explicit compensation | scattered |
| Risk | the coordinator becomes a god service | ⚠️ **nobody understands the whole flow** |

**The practical rule:**

> ⭐ **Orchestrate business-critical, multi-step flows that need visibility and compensation** (checkout,
> onboarding, refunds) — ideally with a workflow engine ([13](13-workflow-engines.md)).
> ⭐ **Choreograph notifications and fan-out** where the publisher genuinely doesn't care who reacts.

⚠️ **Choreography's failure mode is real and common:** the only way to know what happens after
`OrderPlaced` is to grep every repo for subscribers. At 3 services it's elegant; at 30 it's archaeology.

### Sync patterns worth naming

- **Request/response** — REST, gRPC ([Phase 1](../../phase-01-networking/notes/))
- ⭐ **Sync-over-async / "async request-reply"** — the caller gets a `202 Accepted` + a status URL. **The
  best of both when the work is slow**: no temporal coupling, but the client still gets an answer path.
- **Server push** — SSE/WebSocket, for telling the user when the async work finished

---

## In your own words

**⭐ State the sync-vs-async decision rule in one sentence.**

>

**Give three interactions from a system you know: one clearly sync, one clearly async, one you'd argue about.**

>

**⭐ Name the three couplings. Which does async remove, and which does it NOT?**

>

**⭐ Why is "we'll use events, so we're decoupled" incomplete?**

>

**Command vs event — and why does an event couple less?**

>

**List what async costs you.**

>

**⭐ Orchestration vs choreography: when each, and what's choreography's failure mode at 30 services?**

>

**What is async request-reply, and when is it the right shape?**

>

---

## Links

- ⭐ **You chose sync/async per interaction** → [`../lab/decomposition/WORKSHEET.md`](../lab/decomposition/WORKSHEET.md) §1.3
- Where the lines go → [02-service-boundaries.md](02-service-boundaries.md)
- Orchestrated flows with compensation → [07-sagas-as-architecture.md](07-sagas-as-architecture.md)
- Durable orchestration → [13-workflow-engines.md](13-workflow-engines.md)
- Schema coupling, managed → [11-api-evolution-and-contract-testing.md](11-api-evolution-and-contract-testing.md)
- ⭐ Delivery semantics, outbox, DLQs → [Phase 6](../../phase-06-messaging/notes/)
- Every sync call needs a timeout → [Phase 7 note 01](../../phase-07-reliability/notes/01-timeouts-and-deadlines.md)
