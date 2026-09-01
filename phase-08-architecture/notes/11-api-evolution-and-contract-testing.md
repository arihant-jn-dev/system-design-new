# 08·11 · Idempotent, Evolvable APIs & Contract Testing

> **Why this exists:** [note 03](03-coupling-and-communication.md) said **schema coupling is the one coupling
> async doesn't remove.** This is how you manage it — and it's what actually determines whether services can
> deploy independently.

---

## Reference

### ⭐ Idempotency — the prerequisite for everything else

**Idempotent: doing it twice has the same effect as doing it once.**

You need this because ⭐ **the network gives you no choice**: a timeout is *ambiguous* — the request may
have succeeded and only the response was lost. Retries, at-least-once queues, mesh-level retries and
impatient users all produce duplicates.

| Method | Idempotent by spec? |
|---|---|
| `GET`, `HEAD`, `PUT`, `DELETE` | ✅ |
| ⭐ `POST` | ❌ — ⭐ **and this is where the money is** |

**The idempotency-key pattern:**

1. Client generates a key (a UUID) **per logical operation** and sends `Idempotency-Key: …`
2. Server stores `(key → response)` — ⭐ **in the SAME transaction as the effect**, or the whole thing is
   theatre
3. A repeat with the same key returns the **stored response** without re-executing
4. Keys expire (24h–7d is typical)

⚠️ **Details that separate a working implementation from a broken one:**
- ⭐ **Scope the key per tenant/user** — otherwise two customers can collide
- ⭐ **A key in flight must not run twice** — take a lock or a unique constraint on the key, and return
  `409` while the first is still running
- ⭐ **Same key, *different* body → reject.** Otherwise a client bug silently returns the wrong answer
- **The client must reuse the key on retry** — a new key per attempt makes it useless (say this out loud;
  it's the most common mistake)

⭐ **Or design the operation to be naturally idempotent:** `PUT /accounts/123/status = closed` instead of
`POST /close`. **A client-supplied ID makes create idempotent for free.** Natural idempotency beats a key
table every time.

### ⭐ Compatible evolution

| | Consumer | Producer |
|---|---|---|
| **Backward compatible** | ⭐ **new server works with old clients** | you may deploy first |
| **Forward compatible** | old server works with new clients | rarer, and worth designing for in events |

> ⭐ **Backward compatibility is what buys you independent deploys.** If every change requires coordinating
> releases, you have a distributed monolith regardless of your architecture diagram.

| ✅ Safe (additive) | ⚠️ Breaking |
|---|---|
| Add an **optional** field | ⚠️ Remove or rename a field |
| Add an endpoint | ⚠️ Add a **required** field |
| Add an enum value ⚠️ *(only if consumers tolerate unknowns)* | ⚠️ Change a type or the meaning of a field |
| Relax a validation rule | ⚠️ Tighten validation |
| Add an optional query param | ⚠️ Change defaults, error codes, or pagination semantics |

⭐ **The rules that make it work:**
- **Tolerant reader** ([Postel's law](https://en.wikipedia.org/wiki/Robustness_principle)): **ignore fields
  you don't understand; never fail on an unexpected one.** ⚠️ A strict-parsing consumer makes *every*
  producer change breaking.
- **Never reuse a field name or a protobuf tag number** — `reserved` exists for this
- ⭐ **Expand → migrate → contract, again** ([Phase 7 note 12](../../phase-07-reliability/notes/12-zero-downtime-migrations.md)): add the new field → dual-write both → migrate consumers → remove the old. **Same shape as a column rename, a shard-key change, and an event-schema change. It's one pattern.**
- **Deprecate with a date, a `Deprecation`/`Sunset` header, and usage metrics** — ⭐ **you cannot remove
  anything you can't measure the use of**

### Versioning strategies

| Strategy | Notes |
|---|---|
| ⭐ **No version — evolve compatibly** | **the best option when you can**; zero fan-out |
| **URL path** `/v2/orders` | obvious, cacheable, ⚠️ N implementations to maintain |
| **Header / media type** | cleaner URLs, ⚠️ harder to test and debug by hand |
| ⭐ **Per-field / per-resource versioning** | a whole-API `v2` is a blunt instrument for a change to one endpoint |

⚠️ **Every version you keep alive is code you maintain forever.** Have a sunset policy *before* you publish
v2. And ⭐ **internal APIs should evolve compatibly rather than version** — versioning is mostly a *public
API* tool, because you can't make external consumers upgrade.

### Event schema evolution — the same problem, harder

Events are worse because ⭐ **you don't know all the consumers, and old events live forever in the log**
([06](06-event-sourcing.md)).

- ⭐ **Use a schema registry with enforced compatibility** (Avro/Protobuf + Confluent Schema Registry) —
  `BACKWARD`, `FORWARD`, or `FULL`. **The registry rejects an incompatible schema at deploy time**, which is
  the entire point
- **Additive-only changes; optional fields with defaults**
- **Version the event type** (`OrderPlaced.v2`) when you must break, and publish both during migration
- ⭐ **Include an event ID and a version in every payload from day one** — retrofitting is miserable

### ⭐ Contract testing

**The problem:** integration tests across N services are slow, flaky and require a whole environment. Unit
tests with mocks are fast — ⚠️ **but your mock and the real provider drift apart silently, and you learn
about it in production.**

**Consumer-driven contracts (Pact and friends):**

```
consumer test ──▶ generates a CONTRACT ──▶ replayed against the real provider in ITS pipeline
                  (the requests it makes,
                   the responses it needs)
```

| Property | |
|---|---|
| ⭐ **The provider's build fails if it breaks a real consumer's expectations** | ⭐ **that's the whole value: breakage is caught at build time, not at 3am** |
| ⭐ **Only the fields consumers actually use are pinned** | so the provider stays free to add and change everything else |
| No shared environment needed | each side tests alone |
| ⭐ **A broker records who consumes what** | which finally makes "can we delete this field?" answerable |

⚠️ **Limits, and you should name them:** it verifies **shape and interaction, not behaviour or semantics** ·
it needs both teams bought in and the broker wired into both pipelines · ⭐ **it's for internal APIs with
known consumers — for a public API with unknown consumers you need versioning and compatibility rules
instead**, since there's no consumer test to generate a contract from.

**Alternatives/complements:** schema-first (OpenAPI/protobuf) with generated clients and a **CI check that
diffs the spec for breaking changes** · provider-side compatibility tests · shadow traffic.

---

## In your own words

**⭐ Why is idempotency mandatory rather than nice-to-have? What makes a timeout ambiguous?**

>

**Walk the idempotency-key pattern. What must happen in the same transaction, and why?**

>

**⭐ Name three ways an idempotency-key implementation is commonly broken.**

>

**⭐ How would you make a create endpoint naturally idempotent, no key table?**

>

**Backward vs forward compatible. Which buys independent deploys, and why?**

>

**⭐ Give four safe changes and four breaking ones.**

>

**What is a tolerant reader, and what breaks without one?**

>

**⭐ Why can't you remove a field you can't measure the use of?**

>

**Why is event schema evolution harder than API evolution? What does a registry give you?**

>

**⭐ Explain consumer-driven contract testing, its value, and its limits.**

>

**When is versioning the right tool instead of compatible evolution?**

>

---

## Links

- ⭐ Schema coupling — the one async can't remove → [03-coupling-and-communication.md](03-coupling-and-communication.md)
- Expand → migrate → contract → [Phase 7 note 12](../../phase-07-reliability/notes/12-zero-downtime-migrations.md)
- ⭐ Why retries need idempotency → [Phase 6](../../phase-06-messaging/notes/) · [Phase 7 note 02](../../phase-07-reliability/notes/02-retries-and-budgets.md)
- The mesh will retry your `POST` → [04-service-discovery-and-mesh.md](04-service-discovery-and-mesh.md)
- Event versioning forever → [06-event-sourcing.md](06-event-sourcing.md)
- API styles → [Phase 1](../../phase-01-networking/notes/)
