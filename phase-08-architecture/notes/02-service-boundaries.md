# 08·02 · Service Boundaries — DDD-lite

> **Why this exists:** deciding *whether* to split is [note 01](01-monolith-vs-microservices.md). This is
> **where the lines go** — and a wrong line is the mistake you can't cheaply undo.

---

## Reference

### ⭐ The rule: split by business capability, not by technical layer

| ❌ Layers (a distributed n-tier app) | ✅ Capabilities |
|---|---|
| `UserService`, `DataService`, `ValidationService` | `Ordering`, `Payments`, `Inventory`, `Shipping` |
| Every feature touches all of them | ⭐ **Most features live inside one** |
| Deploys are coupled by definition | Each deploys alone |

> ⭐ **The test: could this service be a company?** *Payments* could. *ValidationService* could not.

⚠️ **A name that ends in `-Manager`, `-Util`, `-Helper`, `-Data`, or `-Common` is a layer, not a boundary.**
A shared `Common` service is a coupling point every team must coordinate on.

### DDD-lite: the four ideas you actually need

| Term | Plain meaning | Why it matters here |
|---|---|---|
| ⭐ **Bounded context** | A boundary within which a term has ONE meaning | ⭐ **This is your service boundary candidate** |
| **Aggregate** | A cluster of objects with one root, changed together, consistent together | ⭐ **This is your transaction boundary** — and therefore your data-ownership unit |
| **Ubiquitous language** | Code uses the words the business uses | Boundaries where the *language changes* are real |
| **Context map** | How contexts relate (shared kernel, customer/supplier, anti-corruption layer) | Tells you which coupling you're accepting |

### ⭐ The most useful practical heuristic: *where does the word change meaning?*

> **"Customer" in Sales** = a lead with a probability and a pipeline stage.
> **"Customer" in Billing** = a payment method and a tax jurisdiction.
> **"Customer" in Support** = a ticket history and an SLA tier.

⭐ **These are three different concepts sharing a name.** Forcing them into one `Customer` model produces the
god-object every monolith has: 80 columns, nulls everywhere, and every team afraid to change it.

**When the same word means different things → you have found a context boundary.** Each context keeps *its
own* model of the customer, linked by ID.

### ⭐ Aggregates set your transaction boundary

**Inside one aggregate:** strong consistency, one ACID transaction, invariants enforced synchronously.
**Between aggregates:** eventual consistency, events, sagas.

> ⭐ **So: draw service boundaries so that things needing to change atomically stay together.**
>
> If "reserve inventory + take payment + create order" must be atomic, splitting them across three services
> means you have chosen a saga ([note 07](07-sagas-as-architecture.md)) and its compensations. Sometimes
> right — but choose it, don't discover it.

### Other signals a boundary is real

| Signal | Why it's evidence |
|---|---|
| ⭐ **Data ownership is clean** | one service writes each table; nobody else needs to |
| ⭐ **Change cadence differs** | one part changes weekly, another yearly — they're different things |
| **Scaling profile differs** | 100× traffic asymmetry |
| **Reliability requirement differs** | payments vs recommendations |
| **Team ownership is obvious** | Conway again — you'll get this shape anyway |
| **Compliance boundary** | PCI/PII scope you want to *shrink* |
| ⭐ **Few chatty calls across the line** | if A calls B six times per request, the line is in the wrong place |

### ⭐ Data ownership is the real boundary

**One table, one writing service. No exceptions.**

If two services write the same table, they are one service with two deployments — they share a schema, so
they share a release, so you have a distributed monolith with extra steps.

**How other services get that data (in order of preference):**

| | Approach | Cost |
|---|---|---|
| 1 | **They don't actually need it** — check first | free |
| 2 | ⭐ **Event-carried state transfer** — the owner publishes changes, consumers keep a local read copy they own | eventual consistency |
| 3 | **Synchronous API call** | a runtime dependency and a latency add |
| 4 | **A read replica / CDC projection** | pipeline to run |
| ❌ | **Shared database** | ⚠️ not a decomposition |

### ⭐ What you lose at every boundary

Say these out loud when you draw a line — volunteering them is the senior move:

| Lost | Replacement |
|---|---|
| ⭐ **A JOIN** | API composition, a read model, or duplicated data |
| ⭐ **A transaction** | a saga + compensations |
| **A foreign key** | eventual referential integrity (and a reconciliation job) |
| **A stack trace** | distributed tracing |
| **A compiler-checked refactor** | a versioned contract + contract tests ([11](11-api-evolution-and-contract-testing.md)) |

### Boundary smells, after the fact

⚠️ Chatty cross-service calls in a single request
⚠️ A change that always touches the same 3 services together
⚠️ Two services that must deploy in lockstep
⚠️ A service that's just CRUD over one table (that's a table, not a capability)
⚠️ Shared libraries containing *business logic* (shared *utility* code is fine)
⚠️ A "core"/"common" service everybody depends on

### ⭐ How to actually find boundaries (practical order)

1. **Start with a monolith** with strong internal modules — Fowler's *MonolithFirst*.
2. **Watch what changes together.** Git history is evidence: files that always change in the same commit
   belong in the same module.
3. **Listen to the language.** Where the vocabulary shifts, there's a context.
4. **Follow the data.** Which module *writes* each table?
5. ⭐ **Extract only when a boundary has proven stable for months** — and extract the pain, not the easy one.

> ⭐ **Boundaries are discovered, not designed.** That is the single best argument for starting modular and
> monolithic: you get to be wrong cheaply while you learn where they are.

---

## In your own words

**⭐ Why is splitting by technical layer wrong? What's the "could it be a company?" test?**

>

**Explain bounded context using a word that means different things in different parts of a system you know.**

>

**⭐ Why is the aggregate your transaction boundary — and what does that imply about where to draw services?**

>

**State the data-ownership rule, and the four ways another service can read data it doesn't own.**

>

**⭐ Why is a shared database not a decomposition?**

>

**List what you lose at every boundary, and its replacement.**

>

**Name four boundary smells you could spot in a code review.**

>

**⭐ Why are boundaries "discovered, not designed", and what does that argue for?**

>

---

## Links

- ⭐ **You drew boundaries and named their owners** → [`../lab/decomposition/WORKSHEET.md`](../lab/decomposition/WORKSHEET.md) §1.1–1.2
- Whether to split at all → [01-monolith-vs-microservices.md](01-monolith-vs-microservices.md)
- The coupling each line creates → [03-coupling-and-communication.md](03-coupling-and-communication.md)
- Transactions across boundaries → [07-sagas-as-architecture.md](07-sagas-as-architecture.md)
- Extracting one safely → [08-legacy-migration.md](08-legacy-migration.md)
- Publishing changes reliably → [Phase 6 outbox](../../phase-06-messaging/notes/)
- **Eric Evans, *Domain-Driven Design*** — or **Vaughn Vernon, *Domain-Driven Design Distilled*** for the short version
