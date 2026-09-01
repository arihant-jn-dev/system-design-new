# 3B·03 · MVCC

> **Why this exists:** gate question — *"explain MVCC and what a long-running read transaction does to your
> database."* MVCC is why readers don't block writers, and its cost — **bloat** — is one of the most common
> real Postgres incidents. It also ties together vacuum, index-only scans, and the analytics warning from
> [3a-06](3a-06-row-vs-column.md).

---

## Reference

### The problem MVCC solves

Without it, a read must lock rows so a writer can't change them mid-read. **Readers block writers and
writers block readers** — which destroys concurrency in read-heavy systems.

**MVCC's answer: keep multiple versions of each row. A reader sees a consistent *snapshot* as of a point in
time, and never blocks or is blocked.**

> **The headline: readers don't block writers, and writers don't block readers.** Writers still block writers
> on the same row — that part is unavoidable.

### How Postgres does it

Every row (tuple) carries two hidden system columns:

| Column | Meaning |
|---|---|
| `xmin` | The transaction ID that **created** this version |
| `xmax` | The transaction ID that **deleted/superseded** it (0 if still live) |

```
UPDATE accounts SET balance = 200 WHERE id = 1;

Before:  (id=1, balance=100, xmin=50,  xmax=0)
After:   (id=1, balance=100, xmin=50,  xmax=100)   ← old version: now marked dead
         (id=1, balance=200, xmin=100, xmax=0)     ← NEW ROW APPENDED
```

**An `UPDATE` in Postgres is an INSERT plus a mark-as-dead. It does not modify the row in place.**

**Visibility rule (simplified):** a transaction with snapshot `S` sees a version iff
`xmin` is committed and visible to `S`, **and** `xmax` is either 0 or not visible to `S`.

**Consequences that follow directly:**
- `UPDATE` is roughly as expensive as `INSERT`
- **Every index pointing at that row must be updated** to point at the new tuple *(unless HOT applies — see
  below)*
- Dead tuples accumulate and must be cleaned up → **`VACUUM`**
- A `DELETE` doesn't free space immediately — it just sets `xmax`

**HOT updates (Heap-Only Tuples)** are the optimisation: if **no indexed column changed** *and* the new
version fits **on the same page**, Postgres chains it on the page and **skips updating the indexes entirely.**
This is why `fillfactor` and having fewer indexes ([3a-04](3a-04-indexes.md)) genuinely improve update
performance.

### How InnoDB does it differently — worth knowing

InnoDB updates the row **in place** and pushes the *old* version into a separate **undo log**. A reader
needing an older snapshot reconstructs it by walking the undo log backwards.

| | **Postgres** | **InnoDB** |
|---|---|---|
| Old versions live | **In the table itself** | **In the undo log (separate)** |
| Table bloat from updates | ✅ **Yes** | No — table stays compact |
| Cleanup | `VACUUM` | Purge thread |
| Long transaction cost | **Table + index bloat** | **Undo log growth**, slower reads walking long chains |
| Rollback cost | Cheap (just don't commit) | More work (apply undo) |

**Both suffer from long transactions**, just in different places. The symptom differs; the cause is identical.

### VACUUM

**What it does:**
- Marks dead tuples' space **reusable** (does *not* return it to the OS — that needs `VACUUM FULL`, which
  takes an **`ACCESS EXCLUSIVE` lock** and rewrites the table)
- Updates the **visibility map** — which enables **index-only scans** ([3a-04](3a-04-indexes.md))
- Updates the **free space map**
- **Freezes** old transaction IDs to prevent wraparound
- `ANALYZE` (usually run alongside) refreshes planner statistics

**Autovacuum** handles this automatically, but its default thresholds are tuned for small tables:
`autovacuum_vacuum_scale_factor = 0.2` means **20% of the table must be dead before it triggers.** On a
100 M-row table that's 20 M dead tuples — far too late. **Lowering the scale factor (or setting
`autovacuum_vacuum_threshold`) on large, hot tables is standard tuning.**

### What a long-running transaction does — the gate answer

> **A transaction's snapshot pins every row version that was live when it started. `VACUUM` cannot remove any
> dead tuple newer than the oldest running transaction — *anywhere in the database*.**

**The failure sequence:**

```
1. Someone starts a transaction and leaves it open.
   (An analytics query. A stuck connection "idle in transaction". A debugger at a breakpoint.
    A `BEGIN` with no matching COMMIT in an ORM.)

2. That transaction's snapshot must remain valid, so every row version newer than it
   must be preserved -- across the WHOLE database, not just tables it touched.

3. VACUUM runs, finds millions of dead tuples, and CANNOT REMOVE THEM.
   (pg_stat_activity shows autovacuum running constantly and achieving nothing.)

4. Dead tuples accumulate. Tables and indexes BLOAT -- often 2-10x.

5. Everything slows: more pages to scan for the same live rows, buffer cache
   filled with dead tuples, index-only scans stop working (visibility map stale).

6. Worst case: transaction ID WRAPAROUND. Postgres has a 32-bit txid. If freezing
   is blocked long enough, Postgres will REFUSE ALL WRITES to protect itself:
   "database is not accepting commands to avoid wraparound data loss".
   Recovery requires a single-user-mode VACUUM. This is a genuine, famous outage
   (Sentry and Mailchimp have both written it up publicly).
```

> **Compressed gate answer:** *"MVCC keeps multiple versions of each row so readers see a consistent snapshot
> without blocking writers. The cost is that old versions have to be cleaned up by vacuum — and vacuum can
> only remove versions older than the **oldest running transaction**. So one long-running read transaction
> pins dead tuples across the entire database. Tables and indexes bloat, scans get slower, index-only scans
> stop working, and in the extreme you hit transaction ID wraparound and Postgres stops accepting writes
> entirely. It's why you keep analytical queries off your OLTP primary and set
> `idle_in_transaction_session_timeout`."*

### Monitoring & prevention

| Do this | Why |
|---|---|
| **`idle_in_transaction_session_timeout`** | Kills connections holding a transaction open doing nothing. **The single highest-value setting here.** |
| `statement_timeout` | Bounds runaway queries |
| Monitor `pg_stat_activity` for long `xact_start` | Catch it before it bloats |
| Monitor **transaction age** (`age(datfrozenxid)`) | Wraparound early warning |
| Tune autovacuum on large tables | Defaults are too lax |
| **Keep analytics off the primary** | The most common cause ([3a-06](3a-06-row-vs-column.md)) |
| Don't hold transactions across network calls | An ORM `BEGIN` → HTTP call → `COMMIT` is a common source |

**That last one deserves emphasis: never hold a database transaction open across an external API call.** The
remote service's p99 becomes your transaction duration, and its timeout becomes your bloat.

### Snapshot isolation is MVCC

Repeatable Read = "take one snapshot at transaction start, use it throughout."
Read Committed = "take a **new** snapshot at the start of each statement."

**That single difference explains the whole isolation-level table** in
[3b-02](3b-02-isolation-levels-and-anomalies.md): non-repeatable reads happen at Read Committed precisely
because each statement gets a fresh snapshot.

---

## In your own words

**What problem does MVCC solve? State the headline guarantee.**

>

**Walk through what Postgres actually does on an UPDATE, using xmin/xmax.**

>

**Why is an UPDATE roughly as expensive as an INSERT in Postgres? What optimisation avoids part of it?**

>

**How does InnoDB differ, and where does ITS pain show up instead?**

>

**Walk the full sequence: one long-running transaction → database-wide degradation → wraparound.**

>

**Why can't vacuum clean up tables the long transaction never even touched?**

>

**Name the single highest-value setting to prevent this, and two other mitigations.**

>

**Why should you never hold a transaction open across an HTTP call?**

>

---

## Links

- Isolation levels built on snapshots → [3b-02-isolation-levels-and-anomalies.md](3b-02-isolation-levels-and-anomalies.md)
- Index-only scans need the visibility map → [3a-04-indexes.md](3a-04-indexes.md)
- Why analytics on the primary is dangerous → [3a-06-row-vs-column.md](3a-06-row-vs-column.md)
- `idle in transaction` and pooling → [3a-08-connection-pooling.md](3a-08-connection-pooling.md)
- Long transactions vs replication lag → Phase 3C
- **DDIA ch. 7**, "Snapshot Isolation and Repeatable Read"
