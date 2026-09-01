# 06·11 · Event-Driven Design & Schema Evolution

> **Why this exists:** the three event styles have very different coupling consequences, and **schema
> evolution is where event-driven systems actually break** — because an event is a public contract you can
> never take back.

---

## Reference

## The three event styles

**1 · Event notification — "something happened, go look"**

```json
{ "type": "OrderPlaced", "orderId": "ord_123" }
```

| ✅ | ❌ |
|---|---|
| Tiny; minimal coupling to the producer's schema | ⭐ **Every consumer calls back** to fetch details |
| Producer can change its model freely | **Chatty**, and re-couples you synchronously |
| | ⚠️ The callback may return **newer** data than the event described — a subtle race |

**2 · ⭐ Event-carried state transfer — "here's what happened, and the data"**

```json
{ "type": "OrderPlaced", "orderId": "ord_123",
  "userId": "u_1", "total": 4999, "items": [...] }
```

| ✅ | ❌ |
|---|---|
| ⭐ **No callback — consumers are fully decoupled and can work while the producer is down** | Bigger messages |
| Consumers can keep their own read model | **The event schema is now a public contract** |
| Naturally replayable | Data duplication across services |

⭐ **This is the usual default**, and it pairs perfectly with **compacted topics**
([06](06-kafka-replication-and-retention.md)): the topic becomes the current state of every entity, so a new
consumer bootstraps by reading it from the beginning — no API calls, no backfill script.

**3 · Event sourcing — "the event log IS the source of truth"**

State is **derived** by replaying events; nothing else is authoritative.

| ✅ | ❌ |
|---|---|
| Complete audit history, for free | ⚠️ **Very large commitment** |
| ⭐ **Time travel** — state as of any moment | Querying current state needs projections |
| Replay to rebuild any projection | ⚠️ **Schema versioning of events is forever** |
| Removes the dual-write problem entirely | ⚠️ **GDPR erasure vs an immutable log** (→ Phase 10, crypto-shredding) |

> ⭐ **The honest position: event sourcing is frequently résumé-driven.** It's genuinely right when the
> *history* is the product — ledgers, audit trails, regulated workflows, anything where "how did we get
> here?" is a business question. It's the wrong call when you just wanted a durable event stream, which is
> what event-carried state transfer already gives you. → Phase 8.

### Commands vs events — a distinction worth making

| | **Command** | **Event** |
|---|---|---|
| Says | *"Do this"* — `PlaceOrder` | *"This happened"* — `OrderPlaced` |
| Tense | Imperative | ⭐ **Past tense** |
| Recipients | **One** handler | **Any number** |
| Can be rejected | ✅ Yes | ❌ **No — it already happened** |
| Coupling | Sender knows the receiver | ⭐ Publisher doesn't know or care |

⭐ **Name events in the past tense.** `OrderPlaced`, not `PlaceOrder`. It sounds trivial and it isn't — a
present-tense "event" is really a command in disguise, and it quietly re-couples the publisher to one
specific consumer's behaviour.

## ⭐ Schema evolution — where this actually breaks

**An event schema is a public contract with consumers you may not know about, deployed at times you don't
control, reading messages that may be months old.**

### Compatibility modes

| Mode | Means | Allows |
|---|---|---|
| **Backward** | ⭐ **New consumer reads OLD data** | Delete a field; add an **optional** field |
| **Forward** | **Old consumer reads NEW data** | Add a field; delete an optional one |
| ⭐ **Full** | Both | Add/remove **optional fields with defaults** only |
| None | Anything | 💥 |

> ⭐ **Backward compatibility is the one that matters most for a log**, because **replay** means a new
> consumer will read messages written a year ago. If it can't parse them, replay — the entire point of using
> a log — is broken.

### The rules

| ✅ Safe | ❌ Breaking |
|---|---|
| Add an **optional** field **with a default** | Add a **required** field |
| Remove an optional field | Remove/rename a required field |
| Add an enum value *(if consumers handle unknowns)* | Change a field's **type** |
| Widen a type (int32 → int64) | Narrow a type |
| | ⭐ **Change a field's MEANING while keeping its name** — the worst, because nothing detects it |

**That last row deserves emphasis:** repurposing `status` from an order state to a payment state passes every
schema check and breaks every consumer silently. **Add a new field instead.**

### Schema registry

**A central store of schemas with enforced compatibility.**

```
producer -> registry: "here's my schema"  -> registry: compatible? ✅/❌
message on the wire = [schema ID][payload]      ← ID, not the whole schema
consumer -> registry: "what is schema 47?"      -> deserialise
```

| Benefit | |
|---|---|
| ⭐ **Incompatible changes are rejected at BUILD/PUBLISH time**, not discovered in production | |
| **Smaller messages** — an ID, not an embedded schema | |
| Central documentation of every event | |

**Formats:** ⭐ **Avro** (compact, schema-required, great evolution rules — the Kafka default) ·
**Protobuf** (compact, widely used, good tooling) · **JSON Schema** (readable, verbose, weaker evolution).

> **The interview line:** *"I'd use a schema registry with backward compatibility enforced. An event schema
> is a public contract, and with a replayable log a new consumer will read messages written a year ago —
> so 'we'll just update all the consumers' isn't available to me. The registry turns a runtime failure into
> a build-time one."*

### Practical event design

| Rule | Why |
|---|---|
| ⭐ **A stable, producer-assigned `event_id`** | Consumers dedupe on it ([07](07-delivery-semantics.md)) |
| **`occurred_at`** in the payload | **Event time**, not processing time ([13](13-stream-processing.md)) |
| **Version** the event type | `OrderPlaced.v2` when you must break |
| ⭐ **Key by aggregate ID** | Per-entity ordering; enables compaction |
| **Include a correlation/trace ID** | Otherwise you cannot debug across the boundary ([01](01-why-async.md)) |
| ⚠️ **Don't put PII in events you keep forever** | GDPR erasure vs an immutable log → Phase 10 |
| Keep events **self-contained** | So a consumer needn't call back |

---

## In your own words

**Name the three event styles and the coupling consequence of each.**

>

**Why does event-carried state transfer pair so well with compacted topics?**

>

**When is event sourcing genuinely right, and when is it résumé-driven?**

>

**Commands vs events — five differences. Why does past-tense naming matter?**

>

**Why is BACKWARD compatibility the critical mode for a log?**

>

**What's the most dangerous schema change, and why does no tool catch it?**

>

**What does a schema registry convert a runtime failure into?**

>

---

## Links

- Compacted topics as state → [06-kafka-replication-and-retention.md](06-kafka-replication-and-retention.md)
- Event IDs and dedupe → [07-delivery-semantics.md](07-delivery-semantics.md)
- Event time → [13-stream-processing.md](13-stream-processing.md)
- API versioning (same problem, different surface) → [Phase 1 note 10](../../phase-01-networking/notes/10-api-design-mechanics.md)
- **Event sourcing, CQRS as architecture** → Phase 8
- GDPR and immutable logs → Phase 10
