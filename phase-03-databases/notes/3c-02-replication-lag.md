# 3C·02 · Replication Lag & Read Guarantees

> **Why this exists:** lag is where replication stops being a diagram and starts being **support tickets**.
> The roadmap wants the three client-centric guarantees — read-your-own-writes, monotonic reads, consistent
> prefix — **and the concrete technique for each**. Those techniques are the answer.

---

## Reference

### What lag actually is

**The delay between a write committing on the leader and being visible on a follower.**

Measured two ways, and **you need both**:

| Metric | Meaning | Why it matters |
|---|---|---|
| **Time lag** | "The replica is 2 seconds behind" | What users experience |
| **Byte/LSN lag** | "The replica is 40 MB behind" | **Leading indicator** — rises before time lag does, and tells you if it's diverging |

```sql
-- On the primary
SELECT client_addr, state,
       pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS bytes_behind,
       write_lag, flush_lag, replay_lag
FROM pg_stat_replication;

-- On the replica
SELECT now() - pg_last_xact_replay_timestamp() AS time_behind;
```

**Lag is not constant.** It's usually ~1 ms and then spikes to seconds or minutes exactly when you can least
afford it. Causes:

| Cause | Why |
|---|---|
| **Write burst on the leader** | Replica can't apply fast enough |
| **Replica replay is single-threaded** (Postgres) | One long transaction on the leader blocks all replay |
| A big `UPDATE`/`DELETE`/index build | One statement = enormous WAL |
| Slow replica hardware or noisy neighbour | Applying is I/O-bound |
| Network saturation | Especially cross-region |
| **A long query on the replica** | With `hot_standby_feedback=on`, replay can be paused to avoid killing it |
| Vacuum on the leader | Generates a lot of WAL |

> **The single-threaded replay point matters:** Postgres applies WAL with one process, so a replica can be
> unable to keep up with a leader that has many parallel writers, **even on identical hardware**. This is a
> genuine scaling limit and a good thing to raise.

### The three anomalies — and the fix for each

These are the **client-centric guarantees** from
[Phase 0 note 07](../../phase-00-foundations/notes/07-consistency-informal.md), now with mechanisms.

---

**1 · Read-your-own-writes (read-after-write)**

```
User posts a comment  → write goes to LEADER
User's page refreshes → read goes to a REPLICA that hasn't got it yet
                      → THEIR OWN COMMENT HAS VANISHED
```

Not theoretical — it's a support ticket, and they'll post it again.

**Fixes, weakest to strongest:**

| Technique | How | Cost |
|---|---|---|
| **Read from the leader for "your own" data** | Route reads of anything the user *can* modify to the leader | Leader takes more read load |
| ⭐ **Sticky-to-leader window** | For N seconds after a user's write, route **that user's** reads to the leader | Simple, bounded, effective. **The usual answer.** |
| **LSN token / read-your-writes token** | Client keeps the LSN of its last write; the router picks a replica whose `replay_lsn ≥ token` (or waits) | Precise, no leader load. Needs plumbing. |
| **`synchronous_commit = remote_apply`** | Commit doesn't return until replicas have applied | Correct by construction; expensive on every write |
| Read from own cache/optimistic UI | Show the local copy | Only fixes the display, not the data |

> **The answer to give:** *"I'd pin a user's reads to the primary for a few seconds after they write —
> tracked by a timestamp or LSN in their session. It's bounded, it only affects users who just wrote, and it
> costs a small amount of leader read load. If that leader load became a problem I'd move to LSN tokens so
> reads can go to any replica that's caught up."*

---

**2 · Monotonic reads**

```
Read 1 → replica A (caught up)   → sees the comment
Read 2 → replica B (lagging)     → comment is GONE
```

**Time appears to move backwards.** Worse than plain staleness because it's *incoherent* — a refresh makes
data disappear.

**Fix: make each user always read from the *same* replica** — hash the user ID to a replica rather than
round-robin. (Note this is consistent hashing again — [Phase 2 note 04](../../phase-02-stateless-scaling/notes/04-consistent-hashing.md).)
**Caveat:** if that replica dies, the user must move, and may go backwards once.

---

**3 · Consistent prefix reads**

```
Alice: "How far are you from the finish?"
Bob:   "About a mile"

An observer reading different partitions sees:
       "About a mile"          ← the answer
       "How far are you...?"   ← the question
```

**Causality violated — the answer appears before the question.** This mostly arises with **partitioned**
data, where different partitions replicate at different speeds.

**Fixes:** keep causally-related writes in the **same partition**; or track causal dependencies explicitly
(version vectors, Lamport timestamps → Phase 4).

---

### The routing decision — what to send where

**This is the practical output of this note.** For each read, decide:

| Data | Route to | Why |
|---|---|---|
| **Anything the user just wrote** | **Leader** (for N seconds) | Read-your-own-writes |
| Account balance, inventory, anything with a correctness invariant | **Leader** | Stale is wrong |
| Another user's profile, feeds, search, listings, analytics | **Replica** | Seconds of staleness is invisible |
| Anything inside a write transaction | **Leader** | Obviously |
| Reports, exports, batch reads | **Replica** (a dedicated one) | Keeps long queries off the primary ([3a-06](3a-06-row-vs-column.md)) |

> **The senior framing is per-query, not per-service:** *"Reads go to replicas by default, with three
> exceptions: reads inside a transaction, reads of data the user modified in the last few seconds, and reads
> where staleness would violate an invariant — balances and inventory."*

### Monitoring lag

| Alert on | Threshold |
|---|---|
| **Replay lag in seconds** | Above your read-staleness tolerance |
| **Bytes behind** | Rising trend = diverging; it will not self-correct |
| **Replica disconnected** | Slot retaining WAL → leader disk fills |
| **`hot_standby_feedback` bloat on leader** | Long replica queries block leader vacuum ([3b-03](3b-03-mvcc.md)) |

> **`hot_standby_feedback` is a genuine trade worth naming:** with it **off**, a long query on the replica
> gets **cancelled** ("canceling statement due to conflict with recovery") when the leader vacuums rows it's
> reading. With it **on**, the replica tells the leader "don't vacuum these yet" — so the query survives, but
> **the leader now bloats because of a query running on the replica.** You are choosing which side takes the
> pain.

---

## In your own words

**Two ways to measure lag. Why do you need both, and which is the leading indicator?**

>

**Why can a replica fail to keep up with a leader on identical hardware?**

>

**Describe read-your-own-writes failing, and give the fix you'd actually implement — with its cost.**

>

**What is a monotonic-read violation, and why is it worse than plain staleness? What's the fix?**

>

**Give the consistent-prefix example and say when it arises.**

>

**Write your routing rule: reads go to replicas EXCEPT ___ (three exceptions).**

>

**Explain the `hot_standby_feedback` trade. Who takes the pain in each setting?**

>

---

## Links

- Informal consistency → [Phase 0 note 07](../../phase-00-foundations/notes/07-consistency-informal.md)
- MVCC and vacuum (the bloat side) → [3b-03-mvcc.md](3b-03-mvcc.md)
- **Induce and measure real lag** → [`../lab/lab-c-replication/`](../lab/lab-c-replication/)
- Formal consistency models → Phase 4
- **DDIA ch. 5**, "Problems with Replication Lag"
