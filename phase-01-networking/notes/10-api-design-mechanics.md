# 10 · API Design Mechanics

> **Why this exists:** framework step 3 of every interview is "design the API — 3–5 endpoints." These are the
> details that make that section sound like someone who has shipped and maintained an API rather than someone
> who has drawn one.

---

## Reference

### Versioning

| Strategy | Example | Verdict |
|---|---|---|
| **URL path** | `/v1/orders` | **Most common.** Ugly but obvious, trivially routable at the LB/gateway, easy to cache. |
| **Header** | `Accept: application/vnd.api.v2+json` | Purer REST; harder to test, harder to cache, easy to forget |
| **Query param** | `/orders?version=2` | Easy but pollutes caching and logs |
| **Date-based** | `Stripe-Version: 2024-01-15` | **What Stripe does, and it's excellent** — pin each customer to the version they signed up with; roll them forward deliberately |
| **No versioning (additive only)** | — | GraphQL's model: never break, only add and deprecate fields |

**The practical answer:** URL versioning for major breaks, **additive-only changes within a version**. Bump
the major version rarely — every version you support is one you maintain forever.

### Backward vs forward compatibility

| Term | Means |
|---|---|
| **Backward compatible** | **New server** works with **old clients** |
| **Forward compatible** | **Old server** works with **new clients** (i.e. old code tolerates unknown fields) |

**Compatible changes (safe):**
- Add a new **optional** field to a request
- Add a new field to a response *(only if clients ignore unknown fields — Protobuf and most JSON parsers do)*
- Add a new endpoint
- Add a new **optional** query parameter
- Add a new enum value **only if clients handle unknowns gracefully** — otherwise this breaks them

**Breaking changes (need a version bump):**
- Remove or rename any field
- Change a field's type (`"123"` → `123` breaks strict parsers)
- Make an optional field required
- Change default behaviour, validation rules, or error semantics
- Change pagination or sort defaults
- **Tighten** anything

> **The rule that prevents most incidents — Postel's law applied:** *be conservative in what you send, liberal
> in what you accept.* Clients must **ignore unknown fields**; servers must never remove known ones. Write
> that into the contract on day one, because you cannot retrofit it.

### Status codes worth knowing precisely

| Code | Meaning | The nuance |
|---|---|---|
| 200 OK | Success | |
| **201 Created** | Resource created | Include a `Location` header |
| **202 Accepted** | **Accepted, not yet done** | The async-job pattern below |
| 204 No Content | Success, empty body | Common for DELETE |
| 400 Bad Request | Malformed | |
| 401 Unauthorized | **Not authenticated** | Misnamed — it means unauthenticated |
| 403 Forbidden | Authenticated, **not allowed** | |
| 404 Not Found | Missing — **or hidden** | Return 404 instead of 403 when even the resource's existence is sensitive |
| **409 Conflict** | State conflict | Duplicate key, version mismatch, concurrent modification. **Knowing this one signals experience.** |
| 410 Gone | Deleted permanently | Better than 404 for tombstoned resources |
| 422 Unprocessable | Syntactically fine, semantically invalid | Validation failures |
| **429 Too Many Requests** | Rate limited | **Must** include `Retry-After` |
| 500 | Your bug | |
| 502 / 503 / 504 | Bad gateway / unavailable / **gateway timeout** | 503 should carry `Retry-After`. **504 means a slow dependency** — very diagnostic. |

**Error body — return a machine-readable code, not just prose:**
```json
{
  "error": {
    "code": "insufficient_funds",       ← clients switch on this, never on the message
    "message": "Balance is below the requested amount",
    "request_id": "req_8f14e45f",       ← so support can find it in the logs
    "details": [{"field": "amount", "issue": "exceeds_balance"}]
  }
}
```
RFC 7807 (`application/problem+json`) standardises this shape if you want a spec to point at.

### Rate-limit response contract

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 30
RateLimit-Limit: 1000
RateLimit-Remaining: 0
RateLimit-Reset: 1735689600
```

- **`Retry-After`** — seconds, or an HTTP date. **The single most important one**: it tells a well-behaved
  client exactly when to come back, which converts a retry storm into an orderly queue.
- Return limit headers on **successful** responses too, so clients can self-throttle *before* hitting the wall
- Also use `Retry-After` on **503** during overload or maintenance
- **Clients must still add jitter** — if you tell 10,000 clients "retry in 30s," they all return at exactly
  the same instant (note 11)

### Bulk endpoints & partial failure

Bulk operations reduce round trips — but **what does "success" mean when 3 of 100 items fail?**

| Approach | Semantics | Use when |
|---|---|---|
| **All-or-nothing** | Transactional; any failure rolls back everything | Financial/consistency-critical |
| **Best-effort with per-item results** | **207 Multi-Status** (or 200 with a results array) | Most bulk APIs |
| **Reject the whole batch on any validation error** | Fail fast before executing | Simplest to reason about |

```json
{
  "results": [
    {"index": 0, "status": "created", "id": "ord_1"},
    {"index": 1, "status": "failed", "error": {"code": "invalid_sku"}},
    {"index": 2, "status": "created", "id": "ord_3"}
  ],
  "summary": {"succeeded": 2, "failed": 1}
}
```

**Always:** cap the batch size (state it in the error), make the whole batch idempotent via one key, and
return results **in request order with explicit indices** so clients can correlate.

> **Say the semantics out loud when you design a bulk endpoint.** "Bulk create, best-effort, 207 with
> per-item results, max 100 items, one idempotency key for the batch" is a complete answer in one line.

### The async job pattern (202 + status URL)

**Use when work takes longer than a reasonable HTTP timeout (~10–30 s):** report generation, video transcode,
bulk import, LLM generation.

```http
POST /reports
→ 202 Accepted
  Location: /jobs/job_abc123
  Retry-After: 5
  {"job_id": "job_abc123", "status": "queued"}

GET /jobs/job_abc123
→ 200 {"status": "running", "progress": 0.4}
→ 200 {"status": "succeeded", "result_url": "/reports/rep_789"}
→ 200 {"status": "failed", "error": {...}}
```

**Why this beats holding the connection open:**
- No client, proxy or LB timeout to fight
- The client can disconnect, crash and come back — **the job survives**
- Progress is reportable; the job is cancellable (`DELETE /jobs/{id}`)
- Retries are safe (`POST` with an idempotency key returns the *same* job)
- Backend can queue, prioritise, and scale workers independently

**Completion notification, best to worst:** webhook → SSE/WebSocket push → polling with `Retry-After`.
**Offer at least polling**, since webhooks require the client to have an endpoint.

### Webhooks — the other direction

If you're the one calling out, the contract you owe your consumers:

| Requirement | Why |
|---|---|
| **Signed payloads** (HMAC + timestamp) | Consumers must verify it's really you; the timestamp prevents replay |
| **At-least-once delivery, documented** | Be explicit — consumers **must** dedupe on your event ID |
| **Stable event IDs** | So consumers *can* dedupe (note 09) |
| **Retries with backoff, then a DLQ** | And a way to replay from the dashboard |
| **Fast ack expected** (2 s) | Consumer should enqueue and return 200, not process inline |
| **Ordering not guaranteed** | Include a sequence number or version so consumers can discard stale events |

---

## In your own words

**Backward vs forward compatibility — define both, and give an example change that breaks each.**

>

**List five changes that are safe to make to an existing API, and five that require a version bump.**

>

**Why does `Retry-After` matter so much on a 429? What must the client still do?**

>

**Design a bulk endpoint. State its partial-failure semantics in one sentence.**

>

**Why is `202 Accepted` + a status URL better than holding the connection open for a 3-minute job?**

>

**You're publishing webhooks. What do you owe consumers so they can process safely?**

>

---

## Links

- Idempotency keys, which every POST here depends on → [09-idempotency.md](09-idempotency.md)
- Retry behaviour and jitter → [11-timeouts-retries-backoff.md](11-timeouts-retries-backoff.md)
- Pagination contract → [08-pagination.md](08-pagination.md)
- Rate-limiting *algorithms* (this note is only the contract) → Phase 7
- Async workers, queues, DLQs → Phase 6
