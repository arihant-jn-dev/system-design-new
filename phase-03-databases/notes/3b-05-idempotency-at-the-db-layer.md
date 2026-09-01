# 3B·05 · Idempotency at the DB Layer

> **Why this exists:** the roadmap phrases it as *"unique constraints as a dedupe primitive"* — and that
> framing is the insight. A `UNIQUE` constraint isn't validation; it's **the cheapest correct concurrency
> control you have**, and it works at *every* isolation level, which almost nothing else does.
>
> This closes the loop with [Phase 1 note 09](../../phase-01-networking/notes/09-idempotency.md), which
> handled the API contract. This note handles what actually enforces it.

---

## Reference

### Why a unique constraint is special

**A `UNIQUE` constraint is enforced by an index, at the storage layer, atomically — *regardless of isolation
level*.**

That's the property nothing else has. Consider two concurrent transactions inserting the same order:

```
T1: INSERT INTO payments (order_id, amount) VALUES ('ord_1', 500);
T2: INSERT INTO payments (order_id, amount) VALUES ('ord_1', 500);

With UNIQUE(order_id):
  one succeeds, the other gets 23505 unique_violation.
  Works at READ COMMITTED. No SELECT-then-INSERT race. No locks you wrote.
```

**Compare that to the naive check:**

```sql
-- ❌ BROKEN: classic check-then-act race
SELECT 1 FROM payments WHERE order_id = 'ord_1';   -- both see nothing
INSERT INTO payments ...;                          -- both insert. Double charge.
```

**The `SELECT` proves nothing** — between it and the `INSERT`, anything can happen. This is a **phantom**
([3b-02](3b-02-isolation-levels-and-anomalies.md)), and only `SERIALIZABLE` or a unique constraint prevents
it.

> **The rule: never check-then-act. Let the database's unique index arbitrate the race.**

### The idempotent-insert patterns

**1 · `INSERT ... ON CONFLICT DO NOTHING`** — "create it if it isn't there"
```sql
INSERT INTO payments (order_id, amount) VALUES ('ord_1', 500)
ON CONFLICT (order_id) DO NOTHING;
-- 0 rows affected = it already existed
```

**2 · `INSERT ... ON CONFLICT DO UPDATE`** (upsert) — "create or overwrite"
```sql
INSERT INTO user_settings (user_id, theme) VALUES (42, 'dark')
ON CONFLICT (user_id) DO UPDATE SET theme = EXCLUDED.theme, updated_at = now();
```

**3 · Return the existing row on conflict** — what an idempotency-key handler needs:
```sql
WITH ins AS (
  INSERT INTO payments (idempotency_key, order_id, amount, response)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING *
)
SELECT * FROM ins
UNION ALL
SELECT * FROM payments WHERE idempotency_key = $1 AND NOT EXISTS (SELECT 1 FROM ins);
```
**One statement, no race, returns the row whether it was just created or already existed.**

**4 · Conditional update (state machine guard)** — the replay is a no-op:
```sql
UPDATE orders SET status = 'shipped', shipped_at = now()
WHERE id = $1 AND status = 'paid';
-- 0 rows affected = already shipped (or never paid). Safe to run twice.
```

**5 · Compare-and-set / OCC** ([3b-04](3b-04-locking-and-deadlocks.md)):
```sql
UPDATE inventory SET quantity = $1, version = version + 1
WHERE id = $2 AND version = $3;
```

**6 · Absolute rather than relative** ([Phase 1 note 09](../../phase-01-networking/notes/09-idempotency.md)):
```sql
UPDATE accounts SET balance = 400   WHERE id = 1;   -- ✅ idempotent
UPDATE accounts SET balance = balance - 100 ...;    -- ❌ NOT idempotent
```

### The idempotency table

Putting the API-level contract on real storage:

```sql
CREATE TABLE idempotency_keys (
  key             text PRIMARY KEY,
  request_hash    text NOT NULL,      -- detect same key + different body
  status          text NOT NULL,      -- 'in_progress' | 'complete'
  response_code   int,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX ON idempotency_keys (expires_at);   -- for cheap cleanup
```

**The safe handler:**

```sql
BEGIN;
  -- The PRIMARY KEY arbitrates the race. No SELECT first.
  INSERT INTO idempotency_keys (key, request_hash, status)
  VALUES ($1, $2, 'in_progress')
  ON CONFLICT (key) DO NOTHING;
  -- 0 rows -> someone else owns this key -> read it and return 409 or the stored response

  -- ...do the actual work...
  INSERT INTO payments (order_id, amount) VALUES ($3, $4);

  UPDATE idempotency_keys
     SET status = 'complete', response_code = 201, response_body = $5
   WHERE key = $1;
COMMIT;   -- ⭐ the key record and the payment commit ATOMICALLY
```

> **The single most important line is the `COMMIT`.** Because the idempotency record and the effect are in
> **one transaction**, the "crashed between doing the work and recording the key" window
> ([Phase 1 note 09](../../phase-01-networking/notes/09-idempotency.md)) **does not exist**. Either both
> happened or neither did.
>
> **This only works when the effect is in the same database.** If the payment goes to Stripe, you're back to
> distributed-systems territory → outbox pattern (Phase 6), sagas (Phase 3E).

### Defence in depth — the answer to give

```sql
-- Layer 1: the API contract
UNIQUE (idempotency_key)

-- Layer 2: the BUSINESS invariant -- works even if layer 1 is bypassed entirely
ALTER TABLE payments ADD CONSTRAINT one_payment_per_order UNIQUE (order_id);
```

**Layer 2 is the one people forget, and it's the stronger one.** The idempotency key protects against
*client retries*. The natural-key constraint protects against **everything** — a bug, a bad migration, a
manual script, a second service, a replayed message from Kafka.

> **The interview line:** *"I'd use an idempotency key for the API contract, stored in the same transaction
> as the payment so there's no window where the charge happened but the key didn't record. And separately I'd
> put a unique constraint on `order_id` in the payments table — that's the invariant I actually care about,
> and it holds no matter how the write arrives."*

### Partial unique indexes — when "unique" has exceptions

Real invariants are usually conditional:

```sql
-- Only ONE active subscription per user -- but many cancelled ones
CREATE UNIQUE INDEX ON subscriptions (user_id) WHERE status = 'active';

-- Unique email among non-deleted users (soft deletes)
CREATE UNIQUE INDEX ON users (lower(email)) WHERE deleted_at IS NULL;

-- One pending booking per (room, slot)
CREATE UNIQUE INDEX ON bookings (room_id, slot) WHERE status <> 'cancelled';
```

**Partial unique indexes are how you express most real business rules**, and they're underused. Note the
second one also handles case-insensitivity via an expression index ([3a-04](3a-04-indexes.md)).

### The important limitation ⚠️

**A unique constraint can only enforce an invariant you can express as "this row must be unique."**

| Invariant | Constraint works? | Why |
|---|---|---|
| "One payment per order" | ✅ `UNIQUE(order_id)` | The conflict **is** a row |
| "No double-booking a room+slot" | ✅ `UNIQUE(room_id, slot)` | The conflict **is** a row |
| "Username taken once" | ✅ | Same |
| **"At least 2 doctors on call"** | ❌ | **Aggregate over a set.** No row to make unique. |
| **"Account balance >= 0"** across many rows | ❌ | Aggregate |
| "Total inventory across warehouses >= 0" | ❌ | Aggregate |

**For aggregate invariants you need `SERIALIZABLE` or explicit locks** — there is no constraint that
expresses them.

> **This is exactly the distinction Lab B is built around**, and being able to state it cleanly separates
> people who've read about write skew from people who've had to fix one.

**A partial escape hatch:** `EXCLUDE` constraints handle "no two rows may overlap," which covers a lot of
booking/scheduling cases that a plain `UNIQUE` cannot:
```sql
-- No two reservations for the same room with overlapping time ranges
ALTER TABLE reservations ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (room_id WITH =, during WITH &&);
```
**`EXCLUDE ... WITH &&` on a range type is the correct, elegant answer to the room-booking problem**, and
almost nobody knows it exists.

### Handling the errors

| Code | Meaning | Do |
|---|---|---|
| `23505` unique_violation | Duplicate | **Usually success** — the row already exists. Return the existing one. |
| `23503` foreign_key_violation | Missing parent | Client error, 4xx |
| `23514` check_violation | Invariant broken | Client error, 422 |
| `40001` serialization_failure | SSI conflict | **Retry the whole transaction** |
| `40P01` deadlock_detected | Deadlock | **Retry**, then fix lock ordering |

**Catch `23505` specifically and treat it as success in idempotent paths** — don't let it surface as a 500.
And **check the constraint name**, because a table may have several unique constraints meaning different
things.

---

## In your own words

**Why is a unique constraint special compared to every other concurrency tool?**

>

**Write the broken check-then-act pattern, name the anomaly, and give two fixes.**

>

**Why does putting the idempotency record in the SAME transaction as the effect close a real gap? Which gap?**

>

**What's "layer 2" defence in depth, and why is it stronger than the idempotency key?**

>

**Give three real invariants a unique constraint CAN'T express. What do you use instead?**

>

**What does an `EXCLUDE` constraint do that `UNIQUE` can't?**

>

**How should your code treat error `23505` in an idempotent insert path?**

>

---

## Links

- The API contract this enforces → [Phase 1 note 09](../../phase-01-networking/notes/09-idempotency.md)
- Write skew and why constraints sometimes can't help → [3b-02-isolation-levels-and-anomalies.md](3b-02-isolation-levels-and-anomalies.md)
- OCC and lock-based alternatives → [3b-04-locking-and-deadlocks.md](3b-04-locking-and-deadlocks.md)
- Partial & expression indexes → [3a-04-indexes.md](3a-04-indexes.md)
- **Prove the constraint fixes one write skew and not the other** → [`../lab/lab-b-write-skew/`](../lab/lab-b-write-skew/)
- Outbox pattern, when the effect is in another system → Phase 6
- Sagas → Phase 3E
