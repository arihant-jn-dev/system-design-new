# Lab Results — Phase 3A / 3B

**Fill this in with YOUR numbers.** Date run: ______________

---

# Lab A — indexing

## A1 · Six strategies

| Strategy | Time | Plan node | Scanned | **Filtered** | Buffers |
|---|---|---|---|---|---|
| 1. no index |  |  |  |  |  |
| 2. wrong column order |  |  |  |  |  |
| 3. single column only |  |  |  |  |  |
| 4. right column order |  |  |  |  |  |
| 5. covering (INCLUDE) |  |  |  |  |  |

**no index → covering: ______× faster.  Buffers ______ → ______**

**Q: Scenarios 2 and 4 have the SAME three columns. Why is one 4.7× slower? Be precise about the mechanism.**

>

**Q: Scenario 3 "filtered" 93,814 rows. What does that number tell you, and what's the fix?**

>

**Q: What does `Heap Fetches: 0` on an Index Only Scan mean? What would a non-zero value tell you to do?**

>

**Q: The lab's first version used `ORDER BY ... LIMIT 20` and the "wrong" index was just as fast. Explain why — and what that teaches about index design.**

>

## A2 · Selectivity

| Predicate | Selectivity | Plan chosen | Index used? |
|---|---|---|---|
| `status = 'failed'` |  |  |  |
| `event_type = 'purchase'` |  |  |  |
| `status = 'ok'` |  |  |  |

**Q: Explain all three plans. Why is a Bitmap Heap Scan the "middle ground"?**

>

**Q: The index on `status` is never used for `status='ok'`. Is the planner wrong? What should you do about that index?**

>

## A3 · Partial index

| Index | Size |
|---|---|
| full (`ix_status`) |  |
| partial (`WHERE status='failed'`) |  |

**Q: Why is the partial index so much smaller, and what does that buy you beyond disk space?**

>

## A4 · Functions disable indexes

| Query | Time | Plan |
|---|---|---|
| `WHERE email = '...'` |  |  |
| `WHERE lower(email) = '...'` |  |  |
| after expression index |  |  |

**______× difference.**

**Q: Give two different fixes for `WHERE date(created_at) = '2024-01-01'`. Which is better and why?**

>

## A5 · Write cost

| | Indexes | Time |
|---|---|---|
| 50k inserts, PK only |  |  |
| 50k inserts, PK + 4 |  |  |

**Q: State the read/write trade in one sentence you'd say in an interview.**

>

---

# Lab B — write skew

## Scenario 1 — doctors (aggregate invariant)

| Attempt | T1 | T2 | On call | Held? |
|---|---|---|---|---|
| 1a. REPEATABLE READ |  |  |  |  |
| 1b. SERIALIZABLE |  |  |  |  |
| 1c. SELECT FOR UPDATE |  |  |  |  |

**Q: Why doesn't REPEATABLE READ prevent this? Be precise — what would it have needed to detect?**

>

**Q: What error code did SERIALIZABLE produce, and what MUST your application do about it?**

>

**Q: How does `FOR UPDATE` fix it? What does locking the rows you READ actually accomplish?**

>

## Scenario 2 — room booking (materialisable conflict)

| Attempt | T1 | T2 | Bookings | Held? |
|---|---|---|---|---|
| 2a. no constraint |  |  |  |  |
| 2b. UNIQUE (room_id, slot) |  |  |  |  |

**Q: What error code did T2 get, and how should the API respond to it?**

>

## ⭐ The distinction

**Q: Why does a unique constraint fix the booking write skew but NOT the doctors one? Answer in two sentences, using the word "materialise".**

>

**Q: Give two more invariants a unique constraint CANNOT express.**

>

**Q: What does `EXCLUDE USING gist (... WITH &&)` let you express that `UNIQUE` cannot?**

>

---

## The five sentences I'd say in an interview

**1 · On composite index column order:**

>

**2 · On why an index can be pure cost:**

>

**3 · On functions in the WHERE clause:**

>

**4 · On write skew — the anomaly and why snapshot isolation misses it:**

>

**5 · On when a unique constraint is the right fix and when it can't be:**

>
