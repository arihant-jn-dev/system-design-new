# 08·06 · Event Sourcing

> **Why this exists:** the other half of **gate Q2**. Event sourcing is genuinely powerful, genuinely
> expensive, and ⭐ **the single most résumé-driven pattern in this phase.** Knowing precisely when it's
> right — and being willing to say "not here" — is the answer being marked.

---

## Reference

### The idea

**Store the sequence of events as the source of truth. Current state is a fold over that sequence.**

| Traditional | ⭐ Event-sourced |
|---|---|
| `UPDATE accounts SET balance = 80` | append `Withdrew(20)` |
| ⭐ **the previous value is gone** | ⭐ **nothing is ever destroyed** |
| state is stored | ⭐ **state is derived: `state = fold(apply, initial, events)`** |

```
AccountOpened(id, 0) → Deposited(100) → Withdrew(20) → Deposited(5)
                                                     ▼
                                            balance = 85
```

**Vocabulary:** **event store** (append-only, immutable) · **stream** (one aggregate's events, ordered) ·
**projection / read model** (a fold into a queryable shape) · **snapshot** (a cached fold at version N) ·
**replay** (rebuild projections from the log).

### ⭐ What you get that nothing else gives you

| | |
|---|---|
| ⭐ **A perfect, complete audit trail** — it *is* the data model, not a log you hope is right | |
| ⭐ **Time travel** — "what did this look like on March 3rd?" is a fold up to a timestamp | |
| ⭐ **New projections over historical data** — build a read model *today* that answers questions about *last year*, because you kept the facts, not just the conclusions | |
| **Temporal queries and debugging** — replay the exact sequence that produced a bug | |
| **The business intent is preserved** — `AddressCorrected` vs `CustomerMoved` are different facts a final-state row can't distinguish | |
| **Natural fit with CQRS and event-driven integration** | |

> ⭐ **The killer argument: with stored state, you can only ever answer questions you thought of in advance.
> With stored events, you can answer questions you haven't thought of yet.**

### ⭐ What it costs — and this list is the point of the note

| Cost | |
|---|---|
| ⭐ **A simple query is no longer simple** | "all users in London" is not a query over a log — you *must* build and maintain projections |
| ⭐ **EVENT VERSIONING IS THE HARD PART** | ⭐ **events are immutable and live forever, so your code must read a v1 event you wrote three years ago — forever.** Upcasters, weak schemas, versioned types. **This is the cost people underestimate most.** |
| ⭐ **You cannot just fix bad data** | no `UPDATE`. You append a compensating event — ⭐ **and GDPR "delete my data" versus an immutable log is a genuine architectural problem** (crypto-shredding: encrypt per subject, throw away the key) |
| **Eventual consistency** | inherited from CQRS ([05](05-cqrs.md)) |
| ⭐ **Every developer must learn it** | it's unfamiliar, and half-understood event sourcing is worse than none |
| **Storage grows forever** | plus snapshots to keep replay fast |
| **Replays get slow** | rebuilding a projection over 10⁹ events is an operation you must design for |
| **Tooling is thin** | you'll build admin tooling that a SQL table gives you free |
| ⚠️ **Concurrency** | two commands on one stream → optimistic concurrency on expected version |

### ⭐ When it's worth it

| ✅ | |
|---|---|
| ⭐ **Audit is a hard requirement** — finance, healthcare, legal, trading. *You'd have to build the log anyway.* | |
| ⭐ **The history IS the product** — ledgers, version control, order books, insurance claims, medical records | |
| **Temporal questions are common** — "why is this in this state?" | |
| **The domain is genuinely event-shaped** — the business already speaks in events |
| **You need to derive new views over history** | |

| ❌ Résumé-driven | |
|---|---|
| ⚠️ **CRUD** — a blog, an admin panel, a settings page | |
| ⚠️ **Applied system-wide** rather than to the one aggregate that needs it | |
| ⚠️ **The team hasn't done it before and there's no audit requirement** | |
| ⚠️ **You can't answer "how will you version events in three years?"** | |
| ⚠️ **"It gives us an audit log"** — ⭐ **an append-only audit table gives you that for 5% of the cost** | |

> ⭐ **The cheap alternatives, always ask for these first:** an append-only **audit/history table** · Postgres
> **temporal tables** or a `history` schema · **CDC into a warehouse** (you get replayable history without
> changing your model at all) · **soft deletes + `updated_at`**. ⭐ **Most "we need event sourcing" needs are
> met by CDC into a warehouse.**

### Scope it to an aggregate

⭐ **Event-source the *ledger*. Do not event-source the *user profile*.**

A system where `Payments` is event-sourced and everything else is normal CRUD is a *well-designed* system.
A system where everything is event-sourced is usually a team that will rewrite it in two years.

### Practicalities you should be able to name

| | |
|---|---|
| ⭐ **Snapshots** | store the fold at version N; replay only from there. Needed once streams get long — and **a snapshot is a cache, so it must be discardable** |
| ⭐ **Upcasting** | transform old event versions to new on read. Alternative: tolerant readers + additive-only changes |
| **Optimistic concurrency** | append with `expectedVersion`; conflict → reload and retry |
| **Stream design** | one stream per aggregate instance, not per type — or replays get unbounded |
| ⭐ **Never delete or edit an event** | correct it with a new one (`PaymentReversed`, not editing `PaymentTaken`) |
| **Storage** | EventStoreDB, Kafka (⚠️ with care — retention/compaction, and it isn't an aggregate store), or ⭐ **just Postgres: `(stream_id, version, type, payload)` with a unique key. Boring and excellent.** |

⚠️ **Kafka is a log, not an event store.** No per-aggregate optimistic concurrency, no natural "read this
one stream", and retention deletes your source of truth unless you're very careful. It's an excellent
*transport* for events; it's a poor *store* of record.

### ⭐ The answer that scores

> *"Event sourcing is worth it when the history is the product or the audit trail is a hard requirement —
> ledgers, claims, trading. Then you'd build the log anyway, so you may as well make it authoritative. It's
> résumé-driven when it's applied to CRUD, applied system-wide instead of to one aggregate, or chosen for an
> audit log that an append-only table would give you for a fraction of the cost. **The cost people
> underestimate is event versioning: those events are immutable and forever, so your code has to read the
> v1 shape you wrote three years ago — that, plus 'we can't just fix the data', is what makes it
> expensive.** I'd event-source the payments ledger and leave the user profile as CRUD."*

---

## In your own words

**Define event sourcing. What replaces `UPDATE`?**

>

**⭐ The killer argument for keeping events rather than state — say it in one sentence.**

>

**⭐ What is the hardest cost, and why does it get worse with time?**

>

**How do you fix bad data? And what's the GDPR problem?**

>

**When is event sourcing genuinely worth it — three cases?**

>

**⭐ When is it résumé-driven? Name the cheaper alternatives you'd try first.**

>

**⭐ Why is "we need an audit log" usually NOT a reason to event-source?**

>

**Explain snapshots and upcasting.**

>

**⭐ Why isn't Kafka an event store?**

>

**⭐ What's the right scope? Give a concrete "this yes, that no" from a system you know.**

>

---

## Links

- ⭐ **Gate Q2** → [`../GATE.md`](../GATE.md)
- The pattern it's usually paired with (but is separate from) → [05-cqrs.md](05-cqrs.md)
- Events as integration → [03-coupling-and-communication.md](03-coupling-and-communication.md)
- Compensating actions in flows → [07-sagas-as-architecture.md](07-sagas-as-architecture.md)
- Logs, compaction, retention → [Phase 6](../../phase-06-messaging/notes/)
- Schema evolution, which is the same problem → [11-api-evolution-and-contract-testing.md](11-api-evolution-and-contract-testing.md)
- **Greg Young's talks** · **Martin Fowler, "Event Sourcing"**
