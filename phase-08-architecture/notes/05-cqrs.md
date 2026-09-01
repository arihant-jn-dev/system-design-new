# 08·05 · CQRS — and Read/Write Path Separation

> **Why this exists:** **gate Q2** is *"explain when CQRS and event sourcing are worth it — and when they're
> résumé-driven."* CQRS is also the general instinct the roadmap wants you to develop: ⭐ **reads and writes
> are different workloads and deserve different designs.**

---

## Reference

### What CQRS actually is

**Command Query Responsibility Segregation: separate the model you write through from the model you read
through.**

```
                 ┌──▶ COMMAND side ──▶ write model ──▶ write DB (normalised, constraints)
   client ───────┤                                          │
                 │                                     (events / CDC / replication)
                 │                                          ▼
                 └──▶ QUERY side  ◀── read model  ◀──  read store (denormalised, per-view)
```

⚠️ **CQRS ≠ event sourcing.** They're independent. You can do CQRS with two Postgres tables and a trigger.
They're paired so often that people think they're one thing — **saying they're separable is itself a scoring
point** ([06](06-event-sourcing.md)).

### ⭐ The levels — most people mean level 1 or 2

| Level | What it means | Cost |
|---|---|---|
| **0** | One model, one store | none |
| ⭐ **1** | **Separate read/write *code paths*** — different DTOs, queries bypass the domain model | ⭐ **near zero. Often just good sense.** |
| **2** | Separate read **store**: a replica, a materialised view, a cache, a search index | ⚠️ eventual consistency |
| **3** | ⭐ **Separate read *database technology*** — Postgres writes → Elasticsearch/Redis/ClickHouse reads | pipelines, consistency, ops |
| **4** | Level 3 + event sourcing | ⚠️ maximum |

> ⭐ **"We use CQRS" usually means level 1 or 2, and that's fine.** Interviewers who hear "CQRS" and mean
> level 4 are the ones who'll ask about the costs. Name the level you mean.

### ⭐ Why reads and writes genuinely differ

| | **Writes** | **Reads** |
|---|---|---|
| Volume | typically 1–10% | ⭐ **90–99%** |
| Shape needed | normalised, constrained, transactional | denormalised, pre-joined, per-screen |
| Scaling | ⚠️ hard — one leader | ⭐ easy — replicate freely |
| Consistency need | strong | ⭐ often seconds of staleness are fine |
| Optimised by | correctness + write throughput | ⭐ the specific query |

> ⭐ **This is the general instinct the roadmap wants**, and it appears everywhere you've already been:
> **read replicas** (Phase 3C) · **caches** (Phase 5) · **search indexes** · **materialised views** ·
> **Cassandra's a-table-per-query** (Phase 3F) · **a data warehouse**. **All of these are CQRS.** You've
> been doing it for six phases.

### ⭐ When CQRS earns its complexity

| ✅ Worth it | |
|---|---|
| ⭐ **Read:write ratio is extreme** (100:1+) and the read shape fights the write shape | |
| ⭐ **A query the write schema simply can't serve well** — full-text search, faceting, analytics, geospatial | |
| **Many different views over the same data** (a user view, an admin view, a report) | |
| **Independent scaling matters** — the read side is 20× the write side | |
| **Complex domain on write, simple projections on read** | |

| ❌ Résumé-driven | |
|---|---|
| ⚠️ **CRUD** where the read shape ≈ the write shape | |
| ⚠️ **You haven't measured a read problem** — an index or a cache would have fixed it | |
| ⚠️ **Applied to the whole system** rather than the one bounded context that needs it | |
| ⚠️ **The team can't articulate what goes stale, for how long** | |
| ⚠️ "It's the modern architecture" | |

> ⭐ **The honest first question is always: "have you tried an index, a materialised view, and a read
> replica?"** Those are levels 1–2 with a fraction of the cost. **CQRS at level 3+ is what you do when
> you've outgrown them** — and being able to say that is what separates the answer from the buzzword.

### ⭐ The cost you must be able to name: eventual consistency, user-visible

The read model lags the write model. **The user writes, then immediately reads, and doesn't see their own
change.** (You measured exactly this in Phase 3C: ⭐ **95.5% of immediate replica reads missed the user's own
write.**)

**Mitigations — know at least three:**

| Fix | |
|---|---|
| ⭐ **Read-your-own-writes routing** — after a write, route *that user* to the write model for N seconds | |
| ⭐ **Return the result from the command** so the UI doesn't need to re-read | |
| **Optimistic UI** — render the expected state locally, reconcile later |
| **A version/LSN token** the client passes so the read side can wait for it | |
| ⭐ **Design the UX around it** — "processing…" is honest and often fine | |

**Other costs:** two schemas to migrate · a projection pipeline to run, monitor and **alert on lag** ·
⭐ **projections can break and need rebuilding** (so make them rebuildable from scratch — that's a design
requirement, not a nice-to-have) · duplicate storage · more moving parts to debug.

### Building the read model

| Mechanism | Notes |
|---|---|
| **Synchronous, same transaction** | strongly consistent, ⚠️ couples the write path to the read store's availability |
| ⭐ **Domain events + outbox** | the standard; atomic with the write, at-least-once, ⭐ **needs idempotent projections** |
| ⭐ **CDC (Debezium / logical replication)** | no application changes; the DB's log is the source of truth |
| **Batch rebuild** | simple, high latency; good as a *repair* mechanism even if not the primary one |

⚠️ **Projections must be idempotent** — at-least-once delivery means the same event will be applied twice
([Phase 6](../../phase-06-messaging/notes/)).

### ⭐ Scope it

**Apply CQRS to one bounded context, not to a system.** Your `Orders` context can be CQRS while `Users`
stays boring CRUD. ⭐ **Blanket architectural patterns are the tell**; targeted ones are the skill.

---

## In your own words

**Define CQRS in one sentence. What is it NOT the same as?**

>

**⭐ Name the levels. Which do most teams actually mean?**

>

**Why do reads and writes deserve different designs? Give four differences.**

>

**⭐ List four things you've already built in earlier phases that are really CQRS.**

>

**When does CQRS earn its complexity — three cases?**

>

**⭐ When is it résumé-driven? What's the question you ask first?**

>

**⭐ Name the main cost and cite your Phase 3C number for it. Give three mitigations.**

>

**Why must projections be idempotent and rebuildable?**

>

**⭐ What's the right scope for applying CQRS, and why is a blanket application a tell?**

>

---

## Links

- ⭐ **Gate Q2** → [`../GATE.md`](../GATE.md)
- Often paired, actually separate → [06-event-sourcing.md](06-event-sourcing.md)
- ⭐ **You measured read-your-writes failing** → [Phase 3C lab](../../phase-03-databases/lab/lab-c-replication/)
- Caching as level-2 CQRS → [Phase 5](../../phase-05-caching/notes/)
- Query-first modelling — CQRS as a *database's* native model → [Phase 3F Cassandra](../../phase-03-databases/notes/)
- Outbox, at-least-once, idempotent consumers → [Phase 6](../../phase-06-messaging/notes/)
- Composing reads across services → [09-bff-and-api-composition.md](09-bff-and-api-composition.md)
