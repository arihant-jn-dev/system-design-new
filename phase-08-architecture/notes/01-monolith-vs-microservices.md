# 08·01 · Monolith vs Modular Monolith vs Microservices

> **Why this exists:** the roadmap's warning is blunt — ***"be prepared to argue* for *the monolith;
> reflexive microservices is a junior tell."*** This is **gate Q1**, and it's the one architecture question
> almost guaranteed to appear.

---

## Reference

### The three options (there are three, not two)

| | **Monolith** | ⭐ **Modular monolith** | **Microservices** |
|---|---|---|---|
| Deployable units | 1 | **1** | N |
| Module boundaries | none / eroded | ⭐ **enforced in code** | enforced by network |
| Database | 1 shared | ⭐ **1, but schema-per-module, no cross-module tables** | 1 per service |
| Cross-module call | function call | function call / in-process bus | network call |
| Transactions | ✅ ACID | ✅ ACID | ⚠️ sagas |
| Refactor a boundary | trivial | ⭐ **trivial** | ⚠️ a project |
| Independent deploy | ❌ | ❌ | ✅ |
| Independent scaling | ❌ | ❌ | ✅ |
| Team autonomy | low | medium | high |
| ⭐ Operational cost | low | low | ⚠️ **high, permanently** |

> ⭐ **The modular monolith is the answer most interviews are looking for and most candidates never
> mention.** It gets you boundaries, ownership and testability — the things you actually wanted — while
> keeping the boundary *cheap to move* while you're still wrong about where it goes.

### ⭐ What microservices actually buy you

Exactly three things. Everything else on the usual list is either achievable in a monolith or is a cost
dressed as a benefit.

| Benefit | The real precondition |
|---|---|
| ⭐ **Independent deployment** | …only if services don't have to deploy together. Otherwise you built a distributed monolith. |
| ⭐ **Independent scaling** | …only matters if components have **genuinely different** scaling profiles |
| ⭐ **Team autonomy / blast radius** | …only if teams also own the data, on-call, and roadmap |

⚠️ **"Different tech per service"** is real but is rarely worth the cost on its own — and it fragments
hiring, tooling, and on-call.
⚠️ **"Better code organisation"** is *not* a microservices benefit. That's modules. Network calls are a very
expensive way to enforce an import rule.

### ⭐ What they cost — and the cost is permanent

| Cost | |
|---|---|
| ⭐ **Every local call becomes a network call** | which can be slow, partial, or lost — timeouts, retries, breakers, everywhere ([Phase 7](../../phase-07-reliability/notes/01-timeouts-and-deadlines.md)) |
| ⭐ **Transactions become sagas** | you trade ACID for compensations and eventual consistency ([07](07-sagas-as-architecture.md)) |
| ⭐ **JOINs become API composition** | or duplicated data you must keep fresh |
| **Debugging needs distributed tracing** | a stack trace no longer spans the request |
| **N deploy pipelines, N on-call rotations** | and someone owns the mesh/discovery layer |
| ⭐ **Refactoring a wrong boundary is a migration**, not a rename | ⭐ **this is the one that hurts most** |
| **Local dev gets hard** | "run 14 services to test a checkout" |
| **Latency adds up** | serial hops compound; see tail amplification ([Phase 0](../../phase-00-foundations/notes/)) |

### ⭐ The distributed monolith — the failure case

**Symptoms** (any one is enough):

- Service A can't deploy without B deploying at the same time
- A single feature routinely touches 5 services
- Services share a database or a table
- A "release train" coordinates all of them
- Changing one API means changing four callers in lockstep

> ⭐ **You now pay every microservices cost and receive none of the benefits.** This is strictly worse than
> the monolith you started with — and it is the *most common* real-world outcome of a decomposition done for
> the wrong reasons.

**The one-line test:** *"can each service deploy on a Tuesday afternoon without asking anyone?"*

### ⭐ The 30-engineer answer (this is gate Q1)

**30 engineers ≈ 4–6 teams.** The honest recommendation:

> ⭐ **A modular monolith, plus extract the two or three components that have a genuinely different scaling
> or reliability profile.**

**Why this scores:**

| | |
|---|---|
| ⭐ 30 engineers **can** coordinate one deployable. Amazon's two-pizza rule is about *teams*, not services. | |
| ⭐ **You do not yet know where the boundaries are.** Boundaries are discovered by building; getting one wrong in a monolith is a refactor, in microservices it's a quarter. | |
| ⭐ The pain at this size is almost always **deploy contention and unclear ownership** — both fixable with modules, CI, and ownership rules. | |
| ⭐ **The operational tax of 15 services is roughly a whole team**, which you'd rather spend on product. | |
| **Extraction stays available** — a well-modularised monolith is *the cheapest possible starting point* for later extraction. | |

**What you extract anyway, and why:** components with a **different scaling profile** (video transcoding,
search indexing, ML inference), a **different reliability requirement** (payments vs recommendations), or a
**different change cadence entirely**.

> ⭐ **Commit.** The gate marks "argue both sides **and commit**." Fence-sitting scores zero — the point of
> understanding both sides is to make a defensible call.

### ⭐ Migrate *toward* the right shape, not toward microservices

The famous cases (Amazon, Netflix) split **because they hit real, measured pain at a scale you probably
aren't at** — and both had thousands of engineers. The counter-cases matter too: **Shopify** and **GitHub**
run enormous modular monoliths; **Amazon Prime Video's** monitoring service famously moved *back* from
serverless microservices to a monolith and cut cost 90%.

> ⭐ **Architecture is not a ladder you climb. It's a fit to your current constraints, which change.**

### The triggers that actually justify splitting

Write these as **thresholds you measure**, not vibes:

| Trigger | Signal |
|---|---|
| **Deploy contention** | releases blocked/reverted by unrelated teams; deploy frequency falling as headcount rises |
| **Divergent scaling** | one component needs 10× the hardware of the rest, and you're buying it for everything |
| **Divergent reliability** | a low-value component's bugs take down a high-value one |
| **Team ownership** | nobody can say who owns a subsystem, or four teams edit the same files |
| **Blast radius** | one bad deploy takes down everything, and that's now unacceptable |

⚠️ **Not on this list:** "it's a big codebase", "we want to use Go", "the CTO read a blog post".

### ⭐ Conway's law, both directions

> *"Organizations design systems that mirror their communication structure."*

- **Descriptively:** your architecture will drift toward your org chart whether you plan it or not.
- ⭐ **The Inverse Conway Manoeuvre:** *change the org to get the architecture.* If you want three
  independent services, you need three teams that own them end to end — **service boundaries without
  ownership boundaries don't survive contact with a deadline.**

---

## In your own words

**Name the three real benefits of microservices — and the precondition each one has.**

>

**What is a distributed monolith, and what's the one-sentence test for it?**

>

**⭐ Why is "better code organisation" not a microservices benefit?**

>

**⭐ Which cost hurts most in practice, and why?**

>

**Argue FOR the monolith for a 30-engineer team. Make it persuasive — no strawman.**

>

**Now argue FOR splitting, equally well.**

>

**⭐ Commit. What's your recommendation, and what specific condition would change your mind?**

>

**What is a modular monolith, and how do you enforce module boundaries without a network?**

>

**⭐ Why is a wrong boundary so much cheaper in a monolith?**

>

**State Conway's law, and then the inverse manoeuvre.**

>

---

## Links

- ⭐ **You wrote both arguments** → [`../lab/decomposition/WORKSHEET.md`](../lab/decomposition/WORKSHEET.md)
- Where boundaries come from → [02-service-boundaries.md](02-service-boundaries.md)
- The coupling decision → [03-coupling-and-communication.md](03-coupling-and-communication.md)
- Getting there from a monolith → [08-legacy-migration.md](08-legacy-migration.md)
- What you give up transactionally → [07-sagas-as-architecture.md](07-sagas-as-architecture.md)
- Every network call needs these → [Phase 7 notes 01–06](../../phase-07-reliability/notes/01-timeouts-and-deadlines.md)
- **Sam Newman, *Building Microservices* (2nd ed.)** — ch. 1–3 are the honest version
- **Martin Fowler, "MonolithFirst"** and **"Microservice Premium"**
