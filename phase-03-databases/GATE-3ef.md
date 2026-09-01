# Phase 3E + 3F — Gate

> **Rules:** Out loud. From memory. No notes.
> Passing this closes **Phase 3** — the heaviest phase in the roadmap.

---

## Q1 · Explain why "exactly-once delivery" is a marketing term

*(A roadmap gate question, and one of the shortest high-value answers you'll ever give.)*

**You pass if:**

- [ ] ⭐ **The core argument in three lines:** the sender gets no ack → it cannot tell whether the *message*
      was lost or the *ack* was lost → so it must either not resend (**risk loss**) or resend
      (**risk duplication**). There is no third option.
- [ ] You wrote the equation: **at-least-once delivery + idempotent processing = effectively-once**
- [ ] You named concrete idempotency mechanisms: dedupe store on a message ID, unique constraint on a natural
      key, conditional update, absolute-not-relative writes
- [ ] ⭐ **You were precise about Kafka's EOS:** idempotent producer (sequence numbers, per partition) and
      transactional read-process-write **within Kafka** — and that it does **not** cover side effects outside
      Kafka (a DB write, an HTTP call, an email)
- [ ] Bonus: dedupe keys must be kept for the **worst replay window**, not the normal retry window
- [ ] Bonus: an email can't be un-sent — dedupe immediately before an irreversible action

**Self-score:** ___ / 6

---

## Q2 · A design needs an order and a payment to be consistent across two services. Walk me through the options.

**You pass if you covered, in roughly this order:**

- [ ] ⭐ **First: question the boundary.** If two services are always in the same transaction, that's an
      argument they should be one service or share a database. **A cross-shard/cross-service transaction is
      often a sign the boundary or the shard key is wrong.**
- [ ] **2PC** — describe it, then kill it: **blocking on coordinator failure**, participants hold locks
      indefinitely, availability is the product of all participants
- [ ] **Saga** — local transactions plus compensations
  - [ ] ⭐ **Compensation ≠ rollback:** the charge really happened; you issue a **refund**. The state is
        correct, not restored.
  - [ ] **Sagas expose intermediate state** — your data model and UI must tolerate it
  - [ ] Orchestration vs choreography, and the 3 a.m. argument for orchestration
  - [ ] Every step **and every compensation** must be idempotent and retried
- [ ] ⭐ **Order the steps so irreversible actions come last**
- [ ] **Reservations with a TTL** so a crashed saga self-heals
- [ ] Bonus: *"I'd use Temporal rather than hand-rolling a coordinator"*
- [ ] Bonus: *"or evaluate CockroachDB — distributed SQL can make this a product feature instead of
      application complexity"*

**And the killer follow-up:**
- [ ] ⭐ *"What if the compensation fails?"* → retried with backoff indefinitely; then a DLQ with an alert and
      manual resolution. **There is no further fallback** — which is *why* you order irreversible steps last.

**Self-score:** ___ / 10

---

## Q3 · You need to "save an order and publish an OrderCreated event." How?

*(The single most reusable answer in Phase 3.)*

- [ ] You named it: **the dual-write problem**
- [ ] You showed **both orderings fail** — commit-then-publish loses events; publish-then-commit publishes lies
- [ ] **The outbox pattern**: insert the event row **in the same transaction** as the order
- [ ] ⭐ **The reframing**: you converted a distributed-transaction problem into a **local transaction plus an
      at-least-once delivery problem** — and the latter is solved
- [ ] **The relay**: polling with `FOR UPDATE SKIP LOCKED`, or **CDC/Debezium tailing the WAL** (better)
- [ ] **Consumers must be idempotent** on the event ID — delivery is at-least-once
- [ ] Bonus: **partition key = aggregate ID** to preserve per-aggregate ordering
- [ ] Bonus: **the inbox pattern** — dedupe row + effect in one transaction
- [ ] Bonus: clean up the outbox, and **monitor relay lag**

**Self-score:** ___ / 9

---

## Q4 · Given a workload, choose a datastore — and defend it

**You pass if:**

- [ ] ⭐ You **stated workload properties before naming any technology** (R:W, top queries, access pattern,
      consistency needs, size, latency budget)
- [ ] ⭐ You **did the capacity math** and let it tell you how big the problem actually is
- [ ] You justified the choice **from the properties**, never "I'd use X" alone
- [ ] ⭐ You were willing to **defend Postgres** with concrete numbers (10–50 K write QPS, multiple TB,
      billions of rows) and **named a trigger** to revisit
- [ ] You picked a shard key by **query alignment first** ([3d-03](notes/3d-03-shard-key-selection.md))
- [ ] ⭐ You **volunteered the weaknesses** of your own choice and a mitigation
- [ ] ⭐ **Polyglot cost:** every additional datastore is expertise, on-call, backups, upgrades, monitoring —
      and **every pair is a dual-write problem**
- [ ] You'd prefer **managed services** to reduce ops cost to money rather than headcount
- [ ] Bonus: you were willing to say **"that's over-engineered for this scale"**

**Self-score:** ___ / 9

---

## Extra checks

- [ ] Give three distributed transactions that **don't** involve microservices
- [ ] Why is a **prepared** participant unable to abort on its own?
- [ ] Why doesn't **3PC** solve 2PC's problem? What actually does?
- [ ] Postgres ships `max_prepared_transactions = 0`. What does that tell you?
- [ ] **TrueTime** — what does it return, and what is **commit-wait** trading?
- [ ] How does **CockroachDB** manage without atomic clocks, and where does the cost land?
- [ ] ⭐ **Query-first modelling** — why one table per query? What happens when a new query appears later?
- [ ] **RF=3**: which CLs survive one node down? Show the arithmetic.
- [ ] `QUORUM` write + `ONE` read — does R+W>N hold? *(No — it's exactly 3.)*
- [ ] Why is **"don't use Cassandra as a queue"** a rule?
- [ ] What's the **#1 Cassandra modelling mistake**, and the standard fix?
- [ ] Why are **Cassandra secondary indexes** a trap?
- [ ] **Embed vs reference** in MongoDB — the rule and the classic failure
- [ ] Why is **Elasticsearch not a system of record**? What's the correct architecture?
- [ ] What's the **defining constraint** of a time-series database?
- [ ] Argue for **pgvector** over a dedicated vector DB. Where does the argument stop?
- [ ] Four reasons **blobs don't belong in a database**; describe the presigned-URL flow
- [ ] **ETL vs ELT** — the real argument for ELT
- [ ] Why is **denormalisation** a deliberate choice, and what do you take ownership of?

---

## Scoring

| Result | Do this |
|---|---|
| All four passed + most extras | ✅ **Phase 3 complete.** Move to **Phase 4 — Distributed Systems Theory.** |
| Fumbled any of Q1–Q4 | ⛔ Redo that note's "own words" section, retry in 2 days |

| Fumbled | Redo |
|---|---|
| Q1 | [3e-06](notes/3e-06-exactly-once.md) |
| Q2 | [3e-01](notes/3e-01-why-distributed-transactions-are-hard.md) + [3e-03](notes/3e-03-sagas.md) |
| Q3 | [3e-04](notes/3e-04-outbox-and-cdc.md) — **memorise this one; it recurs constantly** |
| Q4 | [3f-06](notes/3f-06-choosing-and-polyglot-cost.md) + re-run [Lab D](lab/lab-d-cassandra/) |

---

## 🎓 Before Phase 4

Phase 3 is done — the heaviest phase in the roadmap. Two things before you advance:

- [ ] **Re-read every Phase 3 note's "own words" section** (~40 min). Phase 4 formalises what you've been
      using informally: quorums become consensus, fencing tokens become Raft leases, replication lag becomes
      consistency models.
- [ ] **Start practice problems if you haven't.** The roadmap wants your first design in **Week 6**, and
      you're at the end of Week 6. Do **URL shortener** and **rate limiter** this week even though you'll be
      shaky — bad early is cheap.

---

## Gate log

| Attempt | Date | Q1 | Q2 | Q3 | Q4 | Notes |
|---|---|---|---|---|---|---|
| 1 |  | /6 | /10 | /9 | /9 |  |
| 2 |  | /6 | /10 | /9 | /9 |  |
