# 09·14 · The Idempotency / Dedupe Store

> **Why this exists:** every phase since 6 has said *"make it idempotent."* ⭐ **This is the component that
> actually does it** — and its design is mostly about **TTL windows and storage cost**, which is exactly what
> people hand-wave.

---

## Reference

### ⭐ Why you can never avoid this

⭐ **A timeout is ambiguous.** The request may have succeeded and only the response was lost. **The caller
cannot tell**, so it retries — and *every* layer independently produces duplicates:

⭐ client retries · load balancer `proxy_next_upstream` · ⭐ **a service mesh retrying a `POST` it doesn't know
is unsafe** ([Phase 8 note 04](../../phase-08-architecture/notes/04-service-discovery-and-mesh.md)) ·
at-least-once queues · consumer rebalances re-delivering uncommitted offsets (⭐ **you measured 5 duplicates
and 1,500 billed vs 1,000 in Phase 6**) · a user double-clicking.

> ⭐ **Exactly-once DELIVERY is not available. Exactly-once EFFECT is — and idempotency is how you get it.**

### ⭐ Natural idempotency beats a store

**Always ask this first.** No component to run, no TTL to size, no storage cost:

| Instead of | Do |
|---|---|
| `POST /orders` | ⭐ **`PUT /orders/{client-supplied-id}`** — a client-generated ID makes create idempotent for free |
| `POST /account/close` | ⭐ **`PUT /account/status = closed`** — setting an absolute state is naturally idempotent |
| `balance += 10` | ⭐ **`balance = 110`**, or an append-only ledger entry keyed by transaction id ([16](16-payments-primitives.md)) |
| "insert if not exists" | ⭐ **a UNIQUE constraint + `ON CONFLICT DO NOTHING`** — the database is already a dedupe store |

⭐ **A unique constraint on a natural business key is the cheapest, most reliable dedupe there is.** Reach for
a dedicated store only when there isn't one.

### The store

**`key → (status, response, created_at)`**, where the key is a **client-supplied** `Idempotency-Key`.

```
1. BEGIN
2. INSERT key WITH status=in_progress   -- ⭐ unique constraint = the lock
     conflict + in_progress  -> 409 (or wait)   ⚠️ don't run it twice concurrently
     conflict + completed    -> ⭐ return the STORED response, don't re-execute
3. do the work
4. store (status=completed, response)   ⭐ IN THE SAME TRANSACTION as the effect
5. COMMIT
```

> ⭐ **STEP 4 IS THE WHOLE THING. If the effect commits and the key doesn't, a retry re-executes.** Two
> systems (your DB and Redis) cannot commit atomically — ⭐ **so the idempotency record belongs in the SAME
> database as the effect**, or you need the outbox pattern.

⚠️ **The details that separate working from broken:**

- ⭐ **Scope the key per tenant/user** — otherwise two customers collide
- ⭐ **Same key + DIFFERENT body → reject (`422`)**, don't silently return the old response
- ⭐ **The client must REUSE the key on retry.** A new key per attempt makes the whole thing useless — ⭐ **the most common real-world mistake**
- **Store the response**, not just "done" — the retry needs an answer
- ⚠️ **Don't cache failures as final** — a `500` should be retryable; a `400` should not

### ⭐ TTL windows and storage cost — the actual design question

> ⭐ **The TTL is the SLA on how long you promise a retry will be deduplicated.** Say it that way.

| TTL | |
|---|---|
| **Minutes** | covers automatic retries only |
| ⭐ **24 h** | ⭐ **the common default** (Stripe's) — covers a client that retries after an outage |
| **7–30 d** | manual/human retries, reconciliation |
| ⚠️ **Forever** | ⭐ **unbounded growth — never** |

**The arithmetic you should do out loud:**

> 10,000 req/s × 86,400 s = **864 M keys/day**. At ~200 bytes (key + response) that's ⭐ **~170 GB for a
> 24-hour window.** Which tells you two things: ⭐ **only apply idempotency to MUTATING, EXPENSIVE
> operations** (not reads, not every endpoint), and ⭐ **use a store with native TTL eviction** — Redis, or
> DynamoDB TTL, or a partitioned Postgres table you **DROP by partition** rather than `DELETE` (⚠️ *a bulk
> `DELETE` of 800 M rows will ruin your day, and leave the bloat behind*).

⚠️ **Redis is tempting and has a real flaw here: it's a separate system from your database, so step 4 isn't
atomic, and an eviction under memory pressure silently removes a key you promised to honour.** ⭐ **Use
Postgres for money and Redis for cheap operations** — and if you use Redis, set `noeviction` for that
instance ([Phase 5](../../phase-05-caching/notes/)).

### The consumer-side twin: the inbox pattern

⭐ **For message consumers, the same idea with a different name.** Record processed message IDs in an
**inbox** table **in the same transaction as the side effect**; skip anything already present.

⭐ **Outbox = publish exactly once. Inbox = consume exactly once. Together they give you exactly-once EFFECT
over at-least-once delivery** ([Phase 6](../../phase-06-messaging/notes/)) — ⭐ **that sentence is worth
memorising.**

### Where it shows up

⭐ **Payments** (the canonical case — [16](16-payments-primitives.md)) · **order creation** ·
⭐ **webhook receipt** (providers retry aggressively; ⚠️ *and they may deliver out of order, so also check a
version/timestamp*) · **notifications** ([10](10-notifications-and-fanout.md)) · **media jobs**
([13](13-media-pipelines.md)) · **any queue consumer**.

---

## In your own words

**⭐ Why is a timeout ambiguous, and name four layers that independently create duplicates.**

>

**⭐ State the exactly-once sentence.**

>

**⭐ Give three ways to get natural idempotency with no store at all.**

>

**Walk the store's algorithm. Which step is load-bearing, and why?**

>

**⭐ Why must the idempotency record live in the same database as the effect?**

>

**⭐ Three ways implementations are commonly broken.**

>

**⭐ What does the TTL actually represent? Do the storage arithmetic for 10k req/s.**

>

**What does that arithmetic tell you to do?**

>

**⭐ Why is Redis risky for this, and when is it fine?**

>

**⭐ Explain the inbox pattern and its relationship to the outbox.**

>

---

## Links

- ⭐ **You measured duplicates from offset commits** → [Phase 6 lab](../../phase-06-messaging/lab/)
- Outbox/inbox, delivery semantics → [Phase 6](../../phase-06-messaging/notes/)
- The API contract → [Phase 8 note 11](../../phase-08-architecture/notes/11-api-evolution-and-contract-testing.md)
- ⚠️ The mesh will retry your `POST` → [Phase 8 note 04](../../phase-08-architecture/notes/04-service-discovery-and-mesh.md)
- Redis eviction policies → [Phase 5](../../phase-05-caching/notes/)
- Retries, budgets, jitter → [Phase 7 note 02](../../phase-07-reliability/notes/02-retries-and-budgets.md)
- The canonical use → [16-payments-primitives.md](16-payments-primitives.md)
