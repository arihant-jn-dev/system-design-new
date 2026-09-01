# Phase 8 — Gate

> **Rules:** Out loud. From memory. No notes.
> ⭐ **Every question here ends in a COMMITMENT. "It depends" without a decision scores zero.**

---

## Q1 · Argue both sides of monolith vs microservices for a 30-engineer team — and commit

**Time-box: 6 minutes. Both sides, then a recommendation.**

**The case FOR splitting:**

- [ ] ⭐ **The three real benefits**: independent deployment · independent scaling · team autonomy/blast radius
- [ ] …and the **precondition** attached to each
- [ ] **Conway's law** — and the **inverse manoeuvre**
- [ ] The **triggers** you'd actually measure: deploy contention · divergent scaling · divergent reliability · unclear ownership · blast radius

**The case FOR the monolith — ⭐ this half is what's really being marked:**

- [ ] ⭐ **Every local call becomes a network call** — timeouts, retries, breakers, everywhere
- [ ] ⭐ **Transactions become sagas; JOINs become API composition**
- [ ] ⭐ **A wrong boundary is a rename in a monolith and a quarter in microservices**
- [ ] **N pipelines, N on-call rotations, distributed tracing, hard local dev**
- [ ] ⭐ **The operational tax of 15 services is roughly a whole team**
- [ ] ⭐ **You don't yet know where the boundaries are** — they're discovered by building
- [ ] **Shopify and GitHub run enormous modular monoliths; Prime Video moved *back***

**The trap you must name:**

- [ ] ⭐ **The distributed monolith** — all the costs, none of the benefits, strictly worse than where you started
- [ ] ⭐ The one-line test: **"can each service deploy on a Tuesday afternoon without asking anyone?"**

**The answer that scores:**

- [ ] ⭐ **The modular monolith** — enforced module boundaries, schema-per-module, in-process events, ⭐ **a CI architecture test that fails the build on an illegal import**
- [ ] ⭐ **"…plus extract the two or three components with a genuinely different scaling or reliability profile"**
- [ ] ⭐ **You COMMITTED**, and named a **specific condition** that would change your mind
- [ ] Bonus: **"microservices are an organisational solution, not a technical one"**
- [ ] Bonus: ⭐ **"the work that's right either way"** — module boundaries, data ownership, tracing, killing the shared DB

**Self-score:** ___ / 16 · **Time: ____**

---

## Q2 · When are CQRS and event sourcing worth it — and when are they résumé-driven?

- [ ] ⭐ **They are SEPARATE patterns** — you can do either alone *(say this early)*
- [ ] **CQRS levels 0–4**; most people mean 1–2
- [ ] ⭐ **Reads and writes are different workloads** — volume, shape, scaling, consistency
- [ ] ⭐ **You've already built CQRS four times**: read replicas · caches · search indexes · Cassandra's table-per-query
- [ ] **CQRS is worth it** when: extreme read:write · a query the write schema can't serve · many views · independent scaling
- [ ] ⭐ **The first question: "have you tried an index, a materialised view, and a read replica?"**
- [ ] ⭐ **The cost: eventual consistency, user-visible.** Cite **Phase 3C: 95.5% of immediate replica reads missed the user's own write**
- [ ] **Three mitigations**: read-your-writes routing · return the result from the command · a version token
- [ ] **Projections must be idempotent and rebuildable**

- [ ] ⭐ **Event sourcing is worth it when the history IS the product, or audit is a hard requirement** — ledgers, claims, trading. *You'd build the log anyway.*
- [ ] ⭐ **The killer argument**: stored state answers only questions you thought of in advance; stored events answer questions you haven't thought of yet
- [ ] ⭐ **THE COST PEOPLE MISS: event versioning.** Events are immutable and forever — your code must read the v1 shape you wrote three years ago
- [ ] ⭐ **You cannot just fix bad data** — and **GDPR delete vs an immutable log** is a real architectural problem (crypto-shredding)
- [ ] ⭐ **Résumé-driven when**: CRUD · applied system-wide instead of to one aggregate · chosen "for the audit log"
- [ ] ⭐ **The cheaper alternatives**: an append-only audit table · temporal tables · ⭐ **CDC into a warehouse** — *most "we need event sourcing" needs are met by this*
- [ ] ⭐ **Scope**: *"I'd event-source the payments ledger and leave the user profile as CRUD"*
- [ ] Bonus: **Kafka is a log, not an event store** — no per-aggregate optimistic concurrency; retention deletes your source of truth
- [ ] Bonus: **snapshots and upcasting**

**Self-score:** ___ / 18

---

## Q3 · Design multi-tenant isolation for a B2B SaaS product at three scales

- [ ] **The four models** with isolation / cost / migration count / "delete tenant"
- [ ] ⭐ **THE failure mode**: one forgotten `WHERE tenant_id` — cite your lab (**Acme read Globex's 50,000 deal**)
- [ ] ⭐ **"We'll be careful" is not a security model**
- [ ] ⭐ **RLS**: write the policy. `ENABLE` + **`FORCE`** + `current_setting('app.tenant_id', true)`
- [ ] ⭐ **The same buggy query is now safe** — *"a CONSTRAINT the system enforces, not a CONVENTION your team must follow forever"*
- [ ] ⚠️ **The owner/superuser bypass** — hence `FORCE`, and connect as a **non-owner** role
- [ ] ⭐ **The connection-pooling trap** — a `SET` that isn't reset leaks the previous request's tenant
- [ ] ⭐ **`tenant_id` comes from the authenticated session/JWT, NEVER from request input**
- [ ] **What RLS does NOT fix**: noisy neighbours · blast radius · delete is still a `DELETE`
- [ ] ⭐ **Noisy neighbour, measured**: minnow **7.7 ms → 0.1 ms**, ⭐ **58×, caused entirely by another tenant's data**
- [ ] ⭐ **The rule: `tenant_id` leads essentially every index** — your shard key in miniature
- [ ] ⭐ **What indexing does NOT fix** — buffer cache, connections, WAL, CPU ⇒ **quotas or separation**
- [ ] **Noisy-neighbour defences**: per-tenant rate limits · per-tenant concurrency bulkheads · statement timeouts · separate pools for whales · **cells / shuffle sharding**

**The three scales:**

- [ ] ⭐ **EARLY** — shared schema + `tenant_id` + **RLS**, tenant_id-leading indexes. One migration, one backup
- [ ] ⭐ **MID** — ⭐ **HYBRID**: most shared, large/regulated tenants get their own schema or DB, **directory table maps tenant → location.** *"This is what most real B2B SaaS actually looks like"*
- [ ] ⭐ **LARGE** — DB/cluster per tenant, or **cells**. Trivial isolation, blast radius and per-tenant restore; you pay in operational machinery
- [ ] ⭐ **AND: the driver is usually NOT technical — it is what you SELL.** A "dedicated database" clause arrives as a **sales requirement long before a scaling one**
- [ ] Bonus: **tenant context propagation** — and ⚠️ **async jobs are where it gets lost**
- [ ] Bonus: **schema-per-tenant migrations at 5,000 tenants** — orchestration, partial failure, two live schema versions, catalog bloat
- [ ] Bonus: ⭐ **a CI test asserting tenant A cannot see tenant B's data**

**Self-score:** ___ / 20

---

## Extra checks

- [ ] ⭐ **Why is "better code organisation" not a microservices benefit?**
- [ ] The **"could this service be a company?"** test; why `UserServiceUtils` is a layer
- [ ] ⭐ **Bounded context** via a word that means three things (`Customer` in Sales/Billing/Support)
- [ ] ⭐ **The aggregate is your transaction boundary** — what does that imply for where you cut?
- [ ] **One table, one writer.** The four ways another service reads it — and why "shared database" isn't one
- [ ] ⭐ **What you lose at every boundary**: a JOIN, a transaction, a foreign key, a stack trace, a compiler-checked refactor
- [ ] ⭐ **The sync/async rule in one sentence**
- [ ] ⭐ **The three couplings** — which async removes and which it **doesn't**
- [ ] **Command vs event** — why an event couples less
- [ ] ⭐ **Choreography's failure mode at 30 services**
- [ ] **Async request-reply** (`202` + status URL) — when it's the right shape
- [ ] ⭐ **Compensation ≠ rollback**; sagas give up **I**; **semantic locks**
- [ ] ⭐ **Pivot transactions** — and how they order your steps
- [ ] ⭐ **"A saga is the price of a boundary"** — and three ways to avoid paying it
- [ ] **Never rewrite** — three *structural* reasons
- [ ] ⭐ **Ship the facade first, routing 100% to legacy.** Why?
- [ ] ⭐ **Shadow traffic + response diffing**
- [ ] **Branch by abstraction** — when a facade can't reach it
- [ ] ⭐ **The ACL, and when it should die**
- [ ] **The six data-migration phases**; the last reversible step; ⭐ **why continuous reconciliation is non-negotiable**
- [ ] ⭐ **The 80% stall** — and funding the deletion as part of the project
- [ ] ⭐ **Availability multiplies**: five required 99.9% deps ⇒ ~99.5%. ⭐ **REQUIRED vs OPTIONAL is the fix**
- [ ] **Composite p99 > any component's p99** — why
- [ ] **N+1 over the network**; batch endpoints / DataLoader
- [ ] ⭐ **Three GraphQL costs not in the pitch** (caching, unbounded query cost, meaningless request-count limits)
- [ ] **What a BFF must never own**
- [ ] ⭐ **Idempotency-key pattern** — same transaction · scoped per tenant · same key + different body ⇒ reject · ⭐ **the client must REUSE the key**
- [ ] ⭐ **Natural idempotency beats a key table** — client-supplied IDs, `PUT` over `POST`
- [ ] **Backward vs forward compatibility**; ⭐ **tolerant reader**; never reuse a field name or tag number
- [ ] ⭐ **Consumer-driven contract testing** — the value, and its limits
- [ ] ⭐ **Infrastructure vs code** — and ⚠️ **why the mesh can't own your fallbacks or know your `POST` isn't retry-safe**
- [ ] **Discovery: client-side vs server-side**; liveness vs readiness
- [ ] ⭐ **When is a mesh worth it?**
- [ ] **Serverless: the four constraints** · cold starts · ⭐ **the DB connection problem and its general lesson**
- [ ] ⭐ **Where serverless lock-in actually lives**; ⭐ **scale-to-zero containers as the middle ground**
- [ ] ⭐ **Durable execution** — and why workflow code must be deterministic
- [ ] **Airflow vs Temporal**; **Kappa vs Lambda architecture**
- [ ] ⭐ **Build vs buy: the core question, TCO, and reversibility**
- [ ] ⭐ **Say the build-vs-buy sentence you'd use in an interview** — and the trap of "we'd just use Kafka"

---

## Scoring

| Result | Do this |
|---|---|
| All three passed + most extras | ✅ Advance to **Phase 9 — Reusable Building Blocks** |
| Fumbled any of Q1–Q3 | ⛔ Redo that note's "own words" section, retry in 2 days |

| Fumbled | Redo |
|---|---|
| Q1 | [notes/01](notes/01-monolith-vs-microservices.md) + [02](notes/02-service-boundaries.md) — then **rewrite Part 2 of the worksheet until it's genuinely persuasive** |
| Q2 | [notes/05](notes/05-cqrs.md) + [06](notes/06-event-sourcing.md) |
| Q3 | [notes/10](notes/10-multi-tenancy.md) + re-run the multi-tenancy lab |

---

## Before Phase 9

- [ ] ⭐ **PRACTICE PROBLEMS. The roadmap wanted 13–15 by Week 11 — you are now at Week 12.** Every gate
      since Phase 5 has flagged this, and it is now the single largest gap between where you are and where
      the roadmap says you should be. ⭐ **If you are still near zero, stop building knowledge and start
      practising delivery.** You have more than enough material; what you lack is reps.
- [ ] ⭐ **Record a 45-minute design and watch it back.** The roadmap: *"the fastest improvement you will get
      from any single hour."*
- [ ] Take one earlier design and ⭐ **add the build-vs-buy sentence and the failure analysis** — the two
      things that most cheaply read as senior.
- [ ] ⭐ Phases 8–10 are the ones the roadmap says may go shallow. **Phases 9 and 11 are where the remaining
      interview leverage is** — 9 gives you reusable components, 11 is delivery craft.

---

## Gate log

| Attempt | Date | Q1 (time) | Q2 | Q3 | Notes |
|---|---|---|---|---|---|
| 1 |  | /16 ( ) | /18 | /20 |  |
| 2 |  | /16 ( ) | /18 | /20 |  |
