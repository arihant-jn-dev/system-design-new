# 3B·02 · Isolation Levels & Anomalies

> **Why this exists:** this is the highest-value note in 3B. The gate wants **write skew** with a concrete
> example, and knowing the anomalies **by name** is one of the clearest senior signals in a database
> conversation — because it proves you've had to reason about a real concurrency bug.

---

## Reference

### The levels, weakest to strongest

| Level | Prevents | Still permits |
|---|---|---|
| **Read Uncommitted** | (almost nothing) | Dirty reads, and everything below |
| **Read Committed** ⭐ | Dirty reads | Non-repeatable read, phantom, **lost update**, **write skew**, read skew |
| **Repeatable Read** / Snapshot | + non-repeatable read, read skew | **Phantoms** (in the standard), **lost update** (standard), **write skew** |
| **Serializable** | **Everything** | — (but you pay: aborts, or reduced throughput) |

⭐ = the default in Postgres, Oracle, SQL Server. MySQL/InnoDB defaults to Repeatable Read.

### The anomalies — know each by name and example

**1 · Dirty read** — reading data another transaction wrote but hasn't committed.
```
T1: UPDATE accounts SET balance = 500 WHERE id = 1;    (not committed)
T2: SELECT balance FROM accounts WHERE id = 1;   → 500
T1: ROLLBACK;                                     ← T2 read a value that never existed
```
Prevented at Read Committed and above. **Postgres never permits dirty reads at any level** — it doesn't even
implement Read Uncommitted meaningfully.

**2 · Non-repeatable read (read skew)** — reading the same row twice in one transaction gives different
values.
```
T1: SELECT balance FROM accounts WHERE id=1;  → 100
T2: UPDATE accounts SET balance=200 WHERE id=1; COMMIT;
T1: SELECT balance FROM accounts WHERE id=1;  → 200      ← changed mid-transaction
```
**Why it matters:** a backup or report reading many rows sees an *inconsistent snapshot* — money that appears
to vanish because it was read from account A before a transfer and account B after.

**3 · Phantom read** — a *query* returns different **rows** on re-execution because another transaction
inserted or deleted.
```
T1: SELECT count(*) FROM orders WHERE status='pending';  → 5
T2: INSERT INTO orders (status) VALUES ('pending'); COMMIT;
T1: SELECT count(*) FROM orders WHERE status='pending';  → 6     ← a phantom appeared
```
**Non-repeatable read is about a *row* changing; a phantom is about the *set of rows* changing.** That
distinction is the thing to get right.

**4 · Lost update** — two transactions read-modify-write the same value; one overwrites the other.
```
T1: SELECT counter FROM page WHERE id=1;   → 10
T2: SELECT counter FROM page WHERE id=1;   → 10
T1: UPDATE page SET counter = 11;  COMMIT;
T2: UPDATE page SET counter = 11;  COMMIT;     ← should be 12. One increment LOST.
```
**The most common real-world concurrency bug**, and it's everywhere: counters, inventory, wallet balances,
"likes."

**Four ways to fix it — know all four:**

| Fix | How |
|---|---|
| **Atomic write** | `UPDATE page SET counter = counter + 1` — let the DB do the read-modify-write. **Simplest and best when it applies.** |
| **Explicit lock** | `SELECT ... FOR UPDATE`, then update |
| **Optimistic / compare-and-set** | `UPDATE ... WHERE version = 5` → 0 rows affected means you lost; retry |
| **Serializable** | The DB detects it and aborts one |

*(Postgres at Repeatable Read also detects lost updates and aborts with `40001` — stricter than the SQL
standard requires.)*

**5 · WRITE SKEW — the important one** ⭐

**Two transactions read an overlapping set of rows, each makes a decision based on what it read, then each
writes to a *different* row. Neither write conflicts, but the combination violates an invariant that held
for each of them individually.**

**The canonical example — doctors on call:**

```
Invariant: AT LEAST ONE doctor must remain on call.
Currently: Alice and Bob are both on call.

T1 (Alice wants off)              T2 (Bob wants off)
─────────────────────────────     ─────────────────────────────
SELECT count(*) WHERE on_call     SELECT count(*) WHERE on_call
  → 2  (fine, I can leave)          → 2  (fine, I can leave)
UPDATE doctors SET on_call=false  UPDATE doctors SET on_call=false
  WHERE name='Alice'                WHERE name='Bob'
COMMIT ✅                          COMMIT ✅

Result: ZERO doctors on call. The invariant is broken and
        NEITHER transaction did anything wrong on its own.
```

**Why snapshot isolation / Repeatable Read doesn't catch it:** they wrote **different rows**. There's no
write-write conflict to detect. Each saw a valid snapshot and made a locally-correct decision.

**This is the anomaly to have ready**, because it's the one that proves you understand that isolation levels
are about *what you're allowed to observe*, not just *who writes last*.

**Other write skews you'll recognise:**

| Scenario | Invariant broken |
|---|---|
| Booking a meeting room | Two bookings for the same room + time |
| Claiming a username | Two users, same username |
| Withdrawing from a **joint** account | Combined balance goes negative |
| Multiplayer game — moving to the same square | Two pieces on one square |
| Preventing double-spend across two rows | Both spend the same funds |

**How to fix write skew — and the trade for each:**

| Fix | How | Cost |
|---|---|---|
| **`SERIALIZABLE`** | Postgres SSI detects the read-write dependency cycle and aborts one with `40001` | **You must implement retry logic.** Throughput cost under contention. |
| **`SELECT ... FOR UPDATE`** | Explicitly lock the rows you *read* to make the decision | You must remember to do it, everywhere. Deadlock risk. |
| **Materialise the conflict** | Create a row that the conflicting transactions both write, so a **unique constraint** or lock applies | Only possible for *some* invariants — **see below** |
| Serialise on a single object | Advisory lock on e.g. the shift ID | Serialises more than necessary |

> ⚠️ **The catch the lab makes explicit:** a **unique constraint only fixes write skew when the conflict can
> be materialised into a row.**
>
> - *"No two bookings for the same room+time"* → `UNIQUE(room_id, slot)` works perfectly. The conflict **is**
>   a row.
> - *"At least 2 doctors on call"* → **there is no row to make unique.** The invariant is an *aggregate over a
>   set*. No constraint expresses it, so you need SSI or explicit locks.
>
> **Being able to state that distinction is a genuinely strong senior signal**, and it's why Lab B runs two
> scenarios instead of one.

### What each database actually does

**Important: the SQL standard's level names are notoriously loose, and vendors differ.**

| | **Postgres** | **MySQL / InnoDB** |
|---|---|---|
| Read Committed | New snapshot **per statement** | New snapshot per statement |
| **Repeatable Read** | **Actually Snapshot Isolation.** One snapshot for the whole transaction. **Prevents phantoms** (unlike the standard). Detects lost updates → `40001`. | One snapshot + **gap locks**, which prevent phantoms *for locking reads*. Does **not** detect write skew. |
| Serializable | **SSI** — optimistic, tracks read-write dependencies, aborts on a dangerous cycle. **No extra locks; readers don't block.** | **Actually 2PL** — locking-based, converts all reads to locking reads. Readers block writers. |
| Write skew at RR | ❌ Permitted | ❌ Permitted |

> **Two things worth saying out loud:**
> 1. **Postgres's "Repeatable Read" is really Snapshot Isolation and is stronger than the standard requires** —
>    it prevents phantoms. So "RR permits phantoms" is true of the *standard*, not of Postgres.
> 2. **Postgres and MySQL implement Serializable completely differently** — Postgres SSI is optimistic
>    (aborts), MySQL is pessimistic (blocks). That changes how your application must be written: with SSI you
>    **must** handle `40001` retries; with 2PL you must handle deadlocks and lock waits.

### Choosing a level

```
Default (Read Committed)      → fine for most CRUD. Know that lost update and write skew are possible.
Repeatable Read               → reports/backups needing a consistent snapshot; multi-statement reads
Serializable                  → invariants across MULTIPLE rows: bookings, inventory, ledgers, on-call
```

**The practical answer isn't "always use Serializable."** It's:

> *"Read Committed by default, and for the specific operations with a cross-row invariant, either
> Serializable with retry logic or an explicit lock. I'd rather have three carefully-chosen Serializable
> transactions than a global setting nobody understands."*

**And always: if you use `SERIALIZABLE`, you must wrap the transaction in a retry loop for `40001`
(`serialization_failure`).** An unhandled `40001` in production is just an error to the user. This is
**mandatory**, not optional, and forgetting it is the most common mistake.

---

## In your own words

**List the four levels and what each prevents.**

>

**Distinguish non-repeatable read from phantom read. What exactly changes in each?**

>

**Explain lost update with a concrete example. Give all four fixes.**

>

**Explain write skew using the doctors example. Why doesn't snapshot isolation catch it?**

>

**Why does a unique constraint fix the room-booking write skew but NOT the doctors one?**

>

**How do Postgres and MySQL implement Serializable differently, and how does that change your application code?**

>

**What must you always do when you use SERIALIZABLE? What happens if you forget?**

>

**Give a write skew from a system you've worked on (or could plausibly exist in one).**

>

---

## Links

- ACID's I → [3b-01-acid.md](3b-01-acid.md)
- Snapshots underneath all of this → [3b-03-mvcc.md](3b-03-mvcc.md)
- `FOR UPDATE`, 2PL, deadlocks → [3b-04-locking-and-deadlocks.md](3b-04-locking-and-deadlocks.md)
- Unique constraints as primitives → [3b-05-idempotency-at-the-db-layer.md](3b-05-idempotency-at-the-db-layer.md)
- **Reproduce and fix write skew yourself** → [`../lab/lab-b-write-skew/`](../lab/lab-b-write-skew/)
- **DDIA ch. 7** — the definitive treatment
