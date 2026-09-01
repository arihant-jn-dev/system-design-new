# 3E·03 · Sagas

> **Why this exists:** the saga is **the practical answer** to cross-service transactions, and it appears in
> almost every design involving orders, bookings or payments. The subtle parts — that compensations aren't
> rollbacks, and that sagas expose intermediate state — are what interviewers probe.

---

## Reference

### The idea

**Break one distributed transaction into a sequence of local transactions. Each step commits immediately.
If a later step fails, run *compensating* transactions to undo the earlier ones.**

```
T1: create order       T2: reserve stock      T3: charge card      T4: ship
    ✅ committed           ✅ committed           ❌ FAILED
                                    ↓
C2: release stock      C1: cancel order        ← compensations, in REVERSE order
```

**Each step is a real, local, ACID transaction.** There are no distributed locks and no coordinator holding
anyone hostage — that's the whole win over 2PC.

### ⭐ Compensation is not rollback

**This is the concept people get wrong, and the distinction that matters most.**

| | **Rollback (2PC)** | **Compensation (saga)** |
|---|---|---|
| When | Before commit | **After commit** |
| Visible to others? | **No** — nobody saw the change | **Yes** — the change was live and observable |
| Restores | The exact prior state | A *semantically* equivalent state |
| Example | Undo an uncommitted write | **Issue a refund** for a charge that really happened |

```
Charge £50  -> committed. The customer's bank shows it. An email went out.
Compensate  -> refund £50. The bank now shows BOTH a charge AND a refund.

The state is CORRECT. It is not the state that existed before.
```

> **The consequence: sagas expose intermediate state.** For a window, the order exists but isn't paid; the
> stock is reserved but the order may be cancelled. **Your data model and your UI must tolerate that** —
> which is why every saga step needs a status field, not just a success/failure boolean.

**And some things cannot be compensated:** an email that was sent, an SMS delivered, a physical item
shipped. **Order the saga so irreversible steps come last** ([3e-01](3e-01-why-distributed-transactions-are-hard.md)).

### Orchestration vs choreography

**Orchestration — a central coordinator tells each service what to do**

```
        ┌────────────── ORCHESTRATOR ──────────────┐
        │            (owns the state machine)       │
        ▼              ▼             ▼              ▼
     Order          Stock        Payment        Shipping
```

| ✅ | ❌ |
|---|---|
| **The flow is in one place** — readable, testable | The orchestrator is a new service to run |
| Easy to see where a saga is stuck | Risk of becoming a god service with business logic |
| Simple to add steps, reorder, add timeouts | Couples the orchestrator to every participant |
| ⭐ **Debuggable** — you can query "which step is this order on?" | |

**Choreography — services react to each other's events, no coordinator**

```
Order ──OrderCreated──▶ Stock ──StockReserved──▶ Payment ──PaymentTaken──▶ Shipping
```

| ✅ | ❌ |
|---|---|
| No central component; services are decoupled | ⚠️ **The flow exists nowhere** — it's emergent |
| Easy to add a new listener | **Very hard to debug**: "why did this order stall?" means tracing across N services |
| Natural fit for event-driven systems | Cyclic dependencies creep in |
| | Hard to reason about compensations |

> **The recommendation, and it's fairly consensus:** *"Choreography for simple flows of 2–3 steps.
> **Orchestration once there are more steps or real compensation logic**, because the biggest cost of a saga
> is operational — when an order is stuck at 3 a.m. you need to see which step it's on, and with
> choreography that state doesn't exist anywhere."*

**In practice, use a durable workflow engine** — Temporal, AWS Step Functions, Camunda. They give you
orchestration plus persistence, retries, timeouts and visibility for free. **"I'd use Temporal rather than
hand-rolling a saga coordinator"** is a strong, mature answer. → Phase 8.

### Semantic locks — handling the intermediate state

Since data is visible mid-saga, you often need an application-level lock:

```sql
-- Not "deduct stock", but "mark it reserved"
UPDATE inventory SET reserved = reserved + 1 WHERE sku = 'x' AND (stock - reserved) >= 1;
```

| Pattern | How |
|---|---|
| **Status field** | `order.status = 'pending' → 'confirmed' → 'shipped'`. Other processes respect the state. |
| **Reservation / soft lock** | Reserve stock with a **TTL**; a sweeper releases expired reservations |
| **Commutative updates** | `balance = balance - 100` compensated by `+ 100` — order doesn't matter |
| **Re-read and validate** | Check preconditions again before the irreversible step |

**Reservations with a TTL are the workhorse pattern** — it's how seat booking, ticketing and checkout holds
all work, and it means a crashed saga self-heals rather than leaking inventory forever.

### The requirements every saga step has

Non-negotiable, and worth listing unprompted:

| Requirement | Why |
|---|---|
| ⭐ **Idempotent** | Steps get retried. Every step needs an idempotency key ([3b-05](3b-05-idempotency-at-the-db-layer.md)). |
| ⭐ **Compensations must also be idempotent** | And they must be **retried until they succeed** — a failed compensation leaves permanent inconsistency |
| **Compensations must not fail permanently** | Design them to always be possible. If a compensation can fail, you need a manual-intervention queue and an alarm. |
| **Persist saga state** | Which step are we on? Needed to resume after a crash. |
| **Timeouts on every step** | A saga stuck forever is worse than one that failed |
| **Observability** | Trace ID across all steps; a dashboard of in-flight and stuck sagas |

> **"What if the compensation fails?"** is the killer follow-up. The honest answer: *"Compensations are
> retried with backoff indefinitely, because there's no further fallback. If retries are exhausted it goes to
> a dead-letter queue with an alert, and a human resolves it. That's why I order steps so the hardest things
> to compensate happen last — by then everything before them has already succeeded."*

### Saga vs 2PC

| | **2PC** | **Saga** |
|---|---|---|
| Consistency | **Atomic** (ACID) | **Eventual** |
| Locks | Held across the network | **Local only, released immediately** |
| Blocking | ⚠️ **Yes** on coordinator failure | No |
| Intermediate state visible | No | **Yes** — must be designed for |
| Failure handling | Automatic rollback | **You write the compensations** |
| Availability | Product of all participants | **Each step independent** |
| Complexity | In the protocol | **In your application code** |
| Practical for microservices | ❌ | ✅ **The standard answer** |

**The trade in one line: 2PC puts the complexity in the protocol and pays for it with blocking; a saga puts
the complexity in your code and pays for it with eventual consistency and visible intermediate state.**

---

## In your own words

**Explain compensation vs rollback with a concrete example. Why can't a saga "undo" a charge?**

>

**What does "sagas expose intermediate state" mean for your data model and UI?**

>

**Orchestration vs choreography — give the recommendation and the reason (hint: 3 a.m.).**

>

**What's a semantic lock? Describe the TTL reservation pattern and why it self-heals.**

>

**List the requirements every saga step must satisfy.**

>

**Answer the killer follow-up: "what if the compensation fails?"**

>

**State the 2PC-vs-saga trade in one sentence.**

>

---

## Links

- Design it away first → [3e-01](3e-01-why-distributed-transactions-are-hard.md)
- The alternative → [3e-02-two-phase-commit.md](3e-02-two-phase-commit.md)
- Idempotency, which every step needs → [3b-05](3b-05-idempotency-at-the-db-layer.md) and [Phase 1 note 09](../../phase-01-networking/notes/09-idempotency.md)
- Reliable event publishing for choreography → [3e-04-outbox-and-cdc.md](3e-04-outbox-and-cdc.md)
- DLQs and retry topics → Phase 6
- **Saga as an architectural pattern, Temporal, workflow engines** → Phase 8
- **DDIA ch. 9** · Chris Richardson, *Microservices Patterns*
