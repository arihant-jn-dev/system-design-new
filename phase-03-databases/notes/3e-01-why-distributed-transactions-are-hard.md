# 3E·01 · Why Distributed Transactions Are Hard

> **Why this exists:** the roadmap's framing is *"why they're expensive and usually avoidable."* The most
> valuable thing in 3E is knowing how to **design so you don't need one** — the protocols that follow are
> what you reach for when you've failed to.

---

## Reference

### The problem

A single database gives you atomic commit for free: one WAL, one commit point, one fsync
([3a-07](3a-07-wal-and-durability.md)). **Once state spans two systems, there is no shared commit point.**

```
Order service DB:    INSERT order       ✅ committed
Payment service DB:  INSERT charge      ❌ failed

Now what? The order exists and was never paid for.
```

**And the reverse is worse:** charge succeeds, order fails — you took money for nothing.

### Where the boundary actually appears

You don't need microservices to hit this. Any of these is a distributed transaction:

| Situation | The two systems |
|---|---|
| Two microservices with their own databases | DB A, DB B |
| **Sharded database, one transaction spanning shards** | shard 1, shard 2 ([3d-06](3d-06-cross-shard-operations.md)) |
| **Write to the DB and publish to Kafka** | DB, broker — **the dual-write problem** |
| Write to the DB and invalidate a cache | DB, Redis |
| Write to the DB and call a third party (Stripe) | DB, external API |
| Write a row and upload a file | DB, S3 |

> **The dual-write problem is the one you'll meet most often**, and it's the same shape: *"save the order and
> publish `OrderCreated`"* has no atomic form. [3e-04](3e-04-outbox-and-cdc.md) is its answer.

### Why it's genuinely hard, not just annoying

**1 · You cannot tell failure from slowness.**
([Phase 0 note 06](../../phase-00-foundations/notes/06-reliability-fault-tolerance-resilience.md)) The
participant didn't respond. Did it commit? Is it about to? Nobody can say — so any protocol must handle a
participant whose state is *unknown*.

**2 · Atomic commit requires everyone to agree, forever.**
Once a participant says "I can commit," it must be able to honour that **even if it crashes and restarts**.
That means durably logging a promise before making it.

**3 · Availability multiplies.**
([Phase 0 note 05](../../phase-00-foundations/notes/05-availability-vs-durability.md)) A transaction across 5
services at 99.9% each succeeds at best 99.5% of the time. **The transaction is less available than any of
its participants.**

**4 · Locks are held across the network.**
A distributed transaction holds locks for the duration of a *network round trip plus a coordinator decision*
— orders of magnitude longer than a local transaction. Throughput collapses under contention
([3b-04](3b-04-locking-and-deadlocks.md)).

### ⭐ The first answer: don't have one

**Most "distributed transaction" requirements dissolve under a design change.** Run this list before
reaching for a protocol:

| Technique | How |
|---|---|
| ⭐ **Colocate the data** | Put everything a transaction touches in **one** shard/service. This is what shard-key choice is deciding ([3d-03](3d-03-shard-key-selection.md)). A cross-shard transaction is usually a sign the shard key is wrong. |
| ⭐ **Redraw the service boundary** | If two services are always in the same transaction, **they are one service.** The boundary is wrong. (Phase 8: a distributed monolith is exactly this.) |
| **Accept eventual consistency** | Does the inventory count need to be exact *this instant*, or within a second? Usually the latter. |
| **Make it idempotent + retry** | At-least-once delivery plus a dedupe key ([3b-05](3b-05-idempotency-at-the-db-layer.md)) covers an enormous number of cases |
| **Use a single unique constraint** | If the invariant is "one payment per order", `UNIQUE(order_id)` enforces it without any coordination |
| **Reorder the operations** | Do the reversible thing first and the irreversible thing last. Reserve inventory (reversible) → charge card (harder to reverse) → ship (irreversible). |
| **Outbox pattern** | For the dual-write case specifically → [3e-04](3e-04-outbox-and-cdc.md) |

> **The interview line:** *"Before designing a distributed transaction I'd check whether the boundary is
> wrong. If an order and its payment always commit together, that's an argument they belong to the same
> service or at least the same database. When it genuinely spans systems — a third-party payment processor,
> say — I'd use a saga with compensations rather than 2PC, and make every step idempotent."*

### The reorder trick, spelled out

**Order operations so that failures leave you in a recoverable state.**

```
❌ charge card -> create order        crash between = money taken, no order (customer-visible harm)
✅ create order (pending) -> charge -> mark paid
                                       crash anywhere = a pending order you can reconcile or expire
```

**The principle: make the *recoverable* failure the likely one.** A dangling pending order is a background
job's problem. A charge with no order is a support ticket and a refund.

### The spectrum of answers

```
strongest / most expensive
   │
   │  2PC                    atomic, blocking, expensive           -> 3e-02
   │  Spanner / Percolator   atomic + external consistency, needs
   │                         special infrastructure (TrueTime)     -> 3e-05
   │  Saga                   eventually consistent, compensations  -> 3e-03
   │  Outbox + CDC           solves the DUAL-WRITE case exactly    -> 3e-04
   │  Idempotency + retry    at-least-once + dedupe                -> 3e-06
   │  Design it away         colocate, redraw boundaries           -> THIS NOTE
   ▼
weakest / cheapest / most common in practice
```

**Read that bottom-up.** The bottom three cover the overwhelming majority of real systems.

---

## In your own words

**Give three situations that are distributed transactions but don't involve microservices.**

>

**State the dual-write problem in one sentence.**

>

**Why does "can't tell failure from slowness" make atomic commit hard?**

>

**Five services at 99.9% each — what's the transaction's availability, and what does that imply?**

>

**Give four ways to design a distributed transaction away. Which is the strongest?**

>

**Explain the reorder trick and the principle behind it.**

>

**Write the sentence you'd say when an interviewer proposes a cross-service transaction.**

>

---

## Links

- Cross-shard operations → [3d-06-cross-shard-operations.md](3d-06-cross-shard-operations.md)
- Unique constraints as coordination-free enforcement → [3b-05](3b-05-idempotency-at-the-db-layer.md)
- **2PC** → [3e-02-two-phase-commit.md](3e-02-two-phase-commit.md) · **Sagas** → [3e-03-sagas.md](3e-03-sagas.md)
- **Outbox / dual-write** → [3e-04-outbox-and-cdc.md](3e-04-outbox-and-cdc.md)
- Service boundaries, distributed monolith → Phase 8
- **DDIA ch. 9**
