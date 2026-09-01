# 3A·08 · Connection Pooling

> **Why this exists:** the roadmap flags it precisely — *"why connection count is a real scaling limit."*
> This is the concrete failure that connects Phase 2's autoscaling death spiral to the database, and
> "we scaled the app tier and killed the database" is a story every senior engineer has lived.

---

## Reference

### Why connections are expensive in Postgres

**Postgres forks a whole OS process per connection.** (MySQL uses threads — cheaper, but not free.)

| Cost per connection | Amount |
|---|---|
| Memory (backend process) | **~5–10 MB** |
| `work_mem` (per sort/hash **operation**, not per connection) | 4 MB default × several per query |
| Snapshot/visibility bookkeeping | Grows with connection count |
| Context switching | Grows superlinearly past core count |

```
500 connections × 8 MB ≈ 4 GB of RAM before a single query runs
```

**But memory isn't the real limit — contention is.** Postgres maintains shared structures (the proc array,
lock tables, snapshots) that every backend touches. Past a few hundred connections, backends spend more time
coordinating than working.

### The counter-intuitive fact

> **Throughput *peaks* at roughly `2 × CPU cores` to `4 × cores` active connections, then DECLINES.**
>
> A 16-core box performs best at ~32–64 active connections. At 500, throughput is measurably **worse** —
> not just "no better."

**Why:** at any moment only `cores` queries can actually execute. Everything else is queued — but in Postgres
each waiter is a *process* consuming memory and contending on shared locks. **You've built a queue in the
most expensive place possible.**

This is Little's Law and the latency knee from
[Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md), applied to the database.

> **The formula people quote** (PgBouncer/pgtune folklore, good enough as a starting point):
> `connections ≈ (cores × 2) + effective_spindle_count`
> For a 16-core box on SSD: **~35–40**. Not 500.

### The failure this causes

Straight from Phase 2's autoscaling note:

```
Traffic grows → autoscaler adds app instances
  → each instance has its own pool of 20 connections
  → 100 instances × 20 = 2,000 connections to a database configured for 500
  → connection refusals: "FATAL: sorry, too many clients already"
  → OR, if max_connections was raised: memory exhaustion and contention collapse
  → the database gets SLOWER
  → requests take longer, so instances hold connections longer
  → autoscaler adds MORE instances
```

**Every app instance you add makes the database worse.** Scaling the stateless tier scaled you straight into
the state tier's hardest limit.

> **The interview line:** *"Connection count is the coupling between the stateless tier and the database, and
> it's the thing that breaks when you autoscale. I'd put PgBouncer in transaction mode between them so app
> instance count and database connection count are decoupled — 200 instances can share 40 real backends."*

### The solution: a pooler

**Two layers, and people conflate them:**

| | **Client-side pool** (HikariCP, `pg` Pool, SQLAlchemy) | **External pooler** (PgBouncer, pgcat, RDS Proxy) |
|---|---|---|
| Lives | Inside each app process | As a separate service |
| Reuses connections within | **One instance** | **The whole fleet** |
| Fixes | Connection setup cost | **The fleet-wide connection count problem** |
| Needed? | Always | **Once you have many instances** |

**You need both.** A client-side pool alone still means `instances × pool_size` real connections.

### PgBouncer pooling modes — know these three

| Mode | A server connection is held for | Concurrency | Breaks |
|---|---|---|---|
| **Session** | The client's whole connection | Poor — barely better than no pooler | Nothing |
| **Transaction** ⭐ | **One transaction** | **Excellent — the standard choice** | Session state (see below) |
| **Statement** | One statement | Maximum | Multi-statement transactions. Rarely usable. |

**Transaction mode is the answer**, and it's where the multiplexing comes from: between transactions, the
server connection returns to the pool. 200 app instances can share 40 backends because they're not all *in a
transaction* simultaneously.

**⚠️ What transaction mode breaks — you must know this list:**

| Feature | Why it breaks |
|---|---|
| `SET`/session variables | Next transaction may get a different backend |
| **Prepared statements** | Prepared on one backend, executed on another. *(PgBouncer 1.21+ can track these; older versions can't — hence `prepareThreshold=0` / `prepare_threshold=None` in many configs.)* |
| `LISTEN`/`NOTIFY` | Session-scoped |
| Advisory locks (session-level) | Session-scoped — **use transaction-level `pg_advisory_xact_lock` instead** |
| Temp tables | Session-scoped |
| `WITH HOLD` cursors | Span transactions |

> **The prepared-statement one bites hardest** because ORMs enable them by default and the failure is
> intermittent and confusing. It's an excellent detail to raise.

### Sizing the pool

```
Total DB connections = (app instances) × (pool size per instance)

WITH PgBouncer:
Total DB connections = PgBouncer's `default_pool_size`   ← decoupled from instance count
```

**Rules:**
1. **Size the *database* pool to the database** (~2–4× cores), not to your app instance count
2. **Small pools are usually faster.** Counter-intuitive, and true: less contention, less context switching.
3. **Leave headroom** — `superuser_reserved_connections` so you can still connect to *diagnose* an incident
4. **Set a pool acquisition timeout** in the client, or a connection leak silently becomes an infinite hang
5. **Separate pools per workload** — don't let a batch job exhaust the pool serving user traffic (this is a
   **bulkhead**, Phase 7)

### Symptoms and diagnosis

| Symptom | Likely cause |
|---|---|
| `FATAL: sorry, too many clients already` | `max_connections` hit |
| App threads blocked acquiring a connection | Pool exhausted — often a **leak** (connection not returned on an error path) |
| DB CPU low, throughput low, latency high | Contention / too many connections — **counter-intuitive but common** |
| Idle-in-transaction connections | ⚠️ **A transaction left open.** Holds locks and blocks vacuum → see [3b-03](3b-03-mvcc.md) |
| Sudden collapse after a deploy | Instance count or pool size changed |

**`idle in transaction` is the one to watch.** A connection sitting idle *inside* a transaction holds its
snapshot and its locks, blocking `VACUUM` across the whole database. Set
`idle_in_transaction_session_timeout`.

### The serverless problem

Serverless functions are the pathological case: each concurrent invocation wants its own connection, and
there may be **thousands**, each short-lived. Client-side pooling doesn't help — there's no long-lived process
to pool in.

**Answers:** an external pooler in front (RDS Proxy, PgBouncer, Supabase pooler), a **data API over HTTP**
(Neon/PlanetScale serverless drivers), or a datastore whose model is HTTP-native (DynamoDB) rather than
connection-oriented.

> Worth naming as a genuine architectural constraint: **"Postgres + Lambda" needs a pooler or it doesn't
> work at scale**, and that's a real input to a build-vs-buy decision.

---

## In your own words

**Why is a Postgres connection expensive? Give the memory number and the contention reason.**

>

**Why does throughput DECLINE past ~4× cores of connections? Connect it to Little's Law.**

>

**Walk the failure: autoscaling the app tier kills the database. Show the arithmetic.**

>

**Client-side pool vs external pooler — what does each fix, and why do you need both?**

>

**What is transaction-mode pooling, where does the multiplexing come from, and name three things it breaks.**

>

**DB CPU is low, latency is high, throughput is poor. What's your first hypothesis?**

>

**Why is `idle in transaction` dangerous beyond just holding a connection?**

>

---

## Links

- Little's Law & the latency knee → [Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md)
- **The autoscaling death spiral this completes** → [Phase 2 note 09](../../phase-02-stateless-scaling/notes/09-autoscaling.md)
- Long transactions and vacuum → [3b-03-mvcc.md](3b-03-mvcc.md)
- Advisory locks → [3b-04-locking-and-deadlocks.md](3b-04-locking-and-deadlocks.md)
- Bulkheads → Phase 7
