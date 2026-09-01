# 09 · Idempotency

> **Why this exists:** the roadmap calls idempotency keys *"the single most reused concept in payment/order
> questions."* That's accurate. It's also the answer to "how do you do exactly-once?", "is it safe to retry?",
> and "what if the webhook is delivered twice?" Learn it once, use it in every interview.

---

## Reference

### The definition

**An operation is idempotent if performing it N times has the same effect as performing it once.**

Note: same *effect*, not necessarily same *response*. Returning the cached original response is usually
what you want.

| Operation | Idempotent? | Why |
|---|---|---|
| `GET /orders/1` | ✅ | Reads change nothing |
| `PUT /orders/1 {status: "shipped"}` | ✅ | Setting to an absolute value; doing it twice = same state |
| `DELETE /orders/1` | ✅ | Already deleted → still deleted. (Return 204 both times, or 404 — pick and document it.) |
| `POST /orders {...}` | ❌ | **Creates a new order each time** |
| `UPDATE accounts SET balance = balance - 100` | ❌ | **Relative change. Runs twice = charged twice.** |
| `UPDATE accounts SET balance = 400` | ✅ | Absolute value |
| `INSERT ... ON CONFLICT DO NOTHING` | ✅ | The unique constraint does the deduplication |

> **The pattern to notice: absolute assignments are idempotent; relative mutations are not.** "Set balance to
> 400" is safe to retry. "Subtract 100" is not. Whenever you can express an operation as an absolute state
> transition, retries become free.

### Why it matters: you cannot know whether your request succeeded

This is the Phase 0 lesson (note 06) made concrete. You POST a payment. You get a timeout. What happened?

```
Possible: request never arrived           → safe to retry
Possible: arrived, processing, slow       → retry = DOUBLE CHARGE
Possible: succeeded, response lost        → retry = DOUBLE CHARGE
```

**These are indistinguishable from the client.** So there are exactly two options:

1. **Don't retry** → you lose orders whenever the network hiccups
2. **Retry, and make the operation idempotent** → safe

**There is no third option, and this is why "exactly-once delivery" is a marketing term.** What actually
exists is **at-least-once delivery + idempotent processing = effectively-once**. Being able to say that
sentence is a Phase 4/6 gate answer that you can already earn here.

### Idempotency keys — the mechanism

The client generates a unique key (UUID) **per logical operation** and sends it with every attempt:

```http
POST /payments
Idempotency-Key: 8f14e45f-ea2b-4b2f-9a1c-3d5e7f9a1b2c
Content-Type: application/json

{"amount": 5000, "currency": "INR", "order_id": "ord_123"}
```

**Critical detail: the key must be generated once and reused across retries.** A client that generates a new
UUID on each retry has implemented nothing. This is the most common implementation bug — state it explicitly.

**Server-side algorithm:**

```
1. Look up the key in the idempotency store.

2. NOT FOUND
   → INSERT (key, status=IN_PROGRESS, request_fingerprint) with a UNIQUE constraint
     - If the insert fails on conflict, another attempt won this race → go to step 3
   → Execute the operation AND record the result, in the SAME transaction if possible
   → Store (key, status=COMPLETE, response, status_code)
   → Return the response

3. FOUND, status=COMPLETE
   → Verify the request fingerprint matches
       - mismatch → 422: "this key was used with a different request body"
   → Return the STORED response (same status code, same body). Do NOT re-execute.

4. FOUND, status=IN_PROGRESS
   → A concurrent attempt is running
   → Return 409 Conflict (or 425 Too Early) with Retry-After — tell the client to retry shortly
```

**Why the request fingerprint matters:** without it, a client that reuses a key with a *different* body would
silently get the old response. Hash the body and compare — mismatch is a client bug and deserves a 4xx.

**Why `IN_PROGRESS` matters:** two concurrent retries must not both execute. The unique constraint on the key
is what makes this safe — **let the database arbitrate the race**, don't try to do it in application code.

### The atomicity problem

The dangerous window:
```
execute the operation  ✅
                          ← CRASH HERE
store the result       ❌
```
Now the payment happened but the key says `IN_PROGRESS` forever. A retry may re-execute.

**Solutions, in order of preference:**

| Approach | How |
|---|---|
| **Same-transaction write** | Write the idempotency record **in the same DB transaction** as the effect. Only possible if both live in the same database — but when it is, it's airtight. |
| **Unique constraint on the effect itself** | Put a unique index on `(order_id)` in the `payments` table. Even if the key record is lost, the second insert fails. **This is the strongest and simplest guarantee.** |
| **Outbox + reconciliation** | Record intent first, execute, reconcile stragglers with a sweeper job |
| **Downstream idempotency** | Pass the key through to the payment provider — Stripe, Razorpay etc. accept `Idempotency-Key` for exactly this reason |

> **The best answer combines them:** an idempotency key for the API contract, **plus a unique constraint on
> the natural business key** as the last line of defence. Belt and braces, and it costs almost nothing.

### Storage & retention

| Question | Answer |
|---|---|
| Where? | Redis (fast, TTL built in) or the primary DB (transactional, durable). **For payments, the DB** — you cannot lose these records. |
| How long? | **24 hours is the common default** (Stripe uses 24 h). Long enough to cover any sane retry window. |
| Cost? | Key + fingerprint + response ≈ 1–2 KB. At 1 M ops/day that's ~1–2 GB of rolling storage. Trivial. |
| Scoped to what? | **Scope keys per API-key/tenant**, so one customer can't guess or collide with another's keys |

### Making non-idempotent operations idempotent — the toolkit

| Technique | Example |
|---|---|
| **Idempotency key + dedupe store** | The general answer |
| **Unique constraint as a dedupe primitive** | `UNIQUE(order_id)` on payments. The DB does the work. |
| **Natural idempotency key from the domain** | `(user_id, order_id, attempt_date)` — no client cooperation needed |
| **Conditional updates / optimistic concurrency** | `UPDATE ... WHERE version = 5` — the second attempt affects 0 rows |
| **State machine guards** | `UPDATE orders SET status='shipped' WHERE status='paid'` — a replay is a no-op |
| **Absolute instead of relative** | `SET balance = 400` rather than `balance = balance - 100` |
| **Upserts** | `INSERT ... ON CONFLICT DO UPDATE` |
| **Client-generated IDs** | Let the client generate the order UUID — then create becomes a PUT, which is idempotent by definition |

**That last one is underrated.** Having the client generate the resource ID turns creation into an idempotent
`PUT /orders/{client-generated-uuid}` and removes the need for a separate key entirely.

### Where idempotency shows up (it's everywhere)

| Context | Why |
|---|---|
| **Payments** | Double charge = the canonical disaster |
| **Order placement** | Duplicate orders |
| Message consumers (Kafka/SQS) | At-least-once delivery → **consumers must dedupe.** Phase 6. |
| **Webhooks** | Providers retry aggressively; your handler *will* see duplicates |
| Retries at any layer | Any retry policy is unsafe without it (note 11) |
| **TLS 1.3 0-RTT** | Replayable by design → only idempotent requests allowed (note 04) |
| Job schedulers | At-least-once execution → jobs must be safe to run twice. Phase 9. |
| Saga compensations | Compensating transactions get retried too. Phase 3E. |

### The interview move

Whenever a design involves money, orders, or messaging, **volunteer this without being asked:**

> *"POST /payments takes an `Idempotency-Key` header. The server stores it with a hash of the request body
> and the response, in the same transaction as the charge. A retry with the same key returns the stored
> response rather than re-charging. I'd also put a unique constraint on `order_id` in the payments table as a
> second line of defence, and pass the key through to the payment provider. Keys expire after 24 hours."*
>
> Four sentences, and it covers the contract, the atomicity, the defence-in-depth and the retention.

---

## In your own words

**Define idempotency. Why is "same effect" the right word rather than "same response"?**

>

**You POST a payment and get a timeout. Enumerate what might have happened and why you can't tell.**

>

**Why is "exactly-once delivery" a marketing term? What actually exists?**

>

**Walk the full server-side idempotency-key algorithm, including the concurrent-retry case.**

>

**What's the atomicity problem, and what's the strongest defence against it?**

>

**Give three ways to make an operation idempotent WITHOUT an idempotency key.**

>

**What's the most common client-side implementation bug?**

>

---

## Links

- Why you can't distinguish slow from dead → [Phase 0 note 06](../../phase-00-foundations/notes/06-reliability-fault-tolerance-resilience.md)
- Retries need this to be safe → [11-timeouts-retries-backoff.md](11-timeouts-retries-backoff.md)
- 0-RTT replay → [04-tls.md](04-tls.md)
- Unique constraints as a dedupe primitive → Phase 3B
- At-least-once + dedupe in messaging → Phase 6
- Payments primitives, ledgers, reconciliation → Phase 9
