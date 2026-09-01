# 3B·01 · ACID

> **Why this exists:** the roadmap says *"each letter precisely; what 'isolation' actually promises."*
> ACID is recited constantly and understood rarely — and the interesting part is that **three of the four
> letters are weaker than people assume**, and the C is arguably not a database property at all.

---

## Reference

### The four letters, precisely

| Letter | Promise | Provided by | The nuance |
|---|---|---|---|
| **A**tomicity | **All or nothing.** A transaction either fully applies or leaves no trace. | Undo log / WAL rollback | It's about **abortability**, not concurrency. Nothing to do with "atomic" in the concurrent-programming sense. |
| **C**onsistency | The database moves from one **valid** state to another (constraints hold) | ⚠️ **Mostly the application** | **The odd one out — see below** |
| **I**solation | Concurrent transactions don't interfere | Locks / MVCC | ⚠️ **Almost never fully provided by default** |
| **D**urability | Committed data survives a crash | WAL + `fsync` | Bounded by your hardware and settings ([3a-07](3a-07-wal-and-durability.md)) |

### A — Atomicity

**What it actually means: if anything goes wrong mid-transaction, the whole thing can be discarded.**
Kleppmann argues *"abortability"* would be the better word, and he's right — the value is that a failed
transaction is safe to **retry**, because you know it left nothing half-done.

```sql
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  -- crash here
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
```
Without atomicity, £100 vanishes. With it, the first update is rolled back on recovery.

**Note what atomicity does NOT give you:** it says nothing about what *other* transactions see while yours is
running. That's isolation.

### C — Consistency: the letter that doesn't belong

**The database cannot know your invariants.** It enforces what you declare — `NOT NULL`, `CHECK`, `UNIQUE`,
foreign keys — but "every order must have at least one line item" or "the ledger must balance" is
**application logic**.

> Kleppmann: *"Atomicity, isolation, and durability are properties of the database, whereas consistency in
> the ACID sense is a property of the application."* The C was, in his words, largely there to make the
> acronym work.

**And critically: this C is completely unrelated to the C in CAP**, which is about replicas agreeing.
[Phase 0 note 07](../../phase-00-foundations/notes/07-consistency-informal.md) makes the same point —
interviewers do notice when you conflate them.

**What the database *does* give you** is a set of enforcement primitives, and using them is a design choice
worth defending: a `UNIQUE` constraint is not just validation, it's a **concurrency primitive** that works
correctly under any isolation level ([3b-05](3b-05-idempotency-at-the-db-layer.md)).

### I — Isolation: the promise nobody keeps

**The textbook promise: transactions execute as if they ran one at a time (serializably).**

**The reality: almost no database does this by default.**

| Database | Default isolation |
|---|---|
| **PostgreSQL** | **Read Committed** |
| **MySQL / InnoDB** | **Repeatable Read** |
| Oracle | Read Committed |
| SQL Server | Read Committed |
| CockroachDB | Serializable ✅ (a notable exception) |

**Serializable is available almost everywhere — and almost nowhere turned on**, because it costs throughput
and produces retryable aborts your application must handle.

> **So the honest statement of the I is: "isolation is a dial, and the default setting permits real anomalies
> that will corrupt your data if you don't design for them."** That's the whole of [3b-02](3b-02-isolation-levels-and-anomalies.md),
> and it's why the write-skew lab exists.

### D — Durability

"Once committed, it survives a crash." Bounded in practice by:

- **`fsync` actually reaching the platter** — some drives lie ([3a-07](3a-07-wal-and-durability.md))
- **Single-node durability ≠ survival.** A committed, fsynced transaction is gone if the disk is destroyed.
  Real durability needs **replication** (3C) and **backups** (which are not the same thing —
  [Phase 0 note 05](../../phase-00-foundations/notes/05-availability-vs-durability.md)).
- Settings like `synchronous_commit = off` trade a bounded loss window for throughput

> **The complete answer: durability is a spectrum — memory → OS cache → local disk → replicated to another
> node → replicated to another region → backed up offsite.** "Durable" is meaningless until you say against
> *which* failure.

### BASE — the contrast

Coined as a deliberate pun on ACID, for systems that choose availability over strong guarantees:

- **B**asically **A**vailable
- **S**oft state (may change without input, as replicas converge)
- **E**ventual consistency

**It's a marketing acronym more than a technical one**, but it names a real posture: Dynamo-style stores
(Cassandra, DynamoDB in its eventual mode) accept temporary disagreement to stay available under partition.

**Don't treat it as a binary.** Modern systems are on a spectrum, and most offer **tunable** guarantees:
DynamoDB has strongly-consistent reads, Cassandra has `QUORUM`, Postgres has synchronous replicas. **The
right framing is per-operation, not per-database** ([Phase 0 note 07](../../phase-00-foundations/notes/07-consistency-informal.md)).

### What a transaction actually costs

Worth knowing, because "just use transactions" has a price:

| Cost | Detail |
|---|---|
| **Locks held until commit** | Long transactions block others |
| **Snapshot held** | Blocks MVCC cleanup → bloat ([3b-03](3b-03-mvcc.md)) |
| **`fsync` on commit** | Sets your max commit rate |
| **Abort/retry logic** | At `SERIALIZABLE` you *must* handle `40001` retries |
| **Doesn't cross service boundaries** | The entire reason Phase 3E (sagas, outbox) exists |

**That last one is the big architectural consequence:** ACID is a *single-database* guarantee. The moment
your data spans two services or two databases, you don't have transactions any more — you have a distributed
systems problem.

---

## In your own words

**Define each letter precisely. Which is a property of the application rather than the database?**

>

**Why is "abortability" a better word than "atomicity"? What does it enable?**

>

**Distinguish the C in ACID from the C in CAP.**

>

**What does isolation promise, and what do real databases actually deliver by default? Name two defaults.**

>

**"Durable" against what? List the spectrum from weakest to strongest.**

>

**Name three costs of holding a transaction open.**

>

**Why does ACID stop helping the moment data spans two services?**

>

---

## Links

- Durability mechanics → [3a-07-wal-and-durability.md](3a-07-wal-and-durability.md)
- **What isolation actually permits** → [3b-02-isolation-levels-and-anomalies.md](3b-02-isolation-levels-and-anomalies.md)
- Snapshots and bloat → [3b-03-mvcc.md](3b-03-mvcc.md)
- Constraints as concurrency primitives → [3b-05-idempotency-at-the-db-layer.md](3b-05-idempotency-at-the-db-layer.md)
- Consistency informally → [Phase 0 note 07](../../phase-00-foundations/notes/07-consistency-informal.md)
- Transactions across services → Phase 3E
- **DDIA ch. 7**
