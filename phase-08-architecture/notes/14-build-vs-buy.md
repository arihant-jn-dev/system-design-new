# 08·14 · Build vs Buy & Total Cost of Ownership

> **Why this exists:** the roadmap calls this ⭐ ***"a senior consideration interviewers listen for."***
> It's the cheapest way to sound senior and the easiest to skip: **most candidates design everything from
> scratch because that's what the question seems to ask for.**

---

## Reference

### ⭐ The default

> ⭐ **Buy (or adopt open source) unless this thing is your competitive differentiator.**

**Nobody buys your product because you wrote your own queue.** They buy it because of the thing your queue
carries. ⭐ **Engineering time is your scarcest resource — spend it where it differentiates.**

### ⭐ The core question

> ⭐ **"Is this a core competency or a commodity?"**

| Almost always **buy/adopt** | Consider **building** |
|---|---|
| Auth (Auth0, Cognito, Keycloak) | ⭐ Your **core domain logic** |
| Payments — ⭐ **never build; PCI scope alone decides it** | Something with a **genuinely unusual requirement** no vendor meets |
| Email/SMS delivery | A scale where vendor pricing breaks down **and you've measured it** |
| Monitoring, logging, tracing | ⭐ A **hard regulatory/residency constraint** |
| Search (Elastic/OpenSearch/Algolia) | Where the integration cost exceeds the build cost (rare) |
| Queues, databases, caches | |
| CI/CD | |
| Feature flags | |

⚠️ **The tell: building a commodity because it's more interesting than the product.** ⭐ **This is
résumé-driven development at the infrastructure layer**, and it's the same failure mode as event-sourcing a
blog ([06](06-event-sourcing.md)).

### ⭐ TCO — what "build" actually costs

The build estimate is always the *first version*. The real cost is:

| | |
|---|---|
| Initial build | the only number people quote |
| ⭐ **Ongoing maintenance** | ⭐ **realistically 15–30% of the build cost, every year, forever** |
| ⭐ **Operations** | on-call, incidents, capacity, upgrades |
| **Security patching** | forever, urgently, at inconvenient times |
| ⭐ **The opportunity cost** | ⭐ **the features you didn't ship. Usually the biggest number and never on the slide** |
| **Onboarding** | every new hire learns your bespoke thing instead of a tool they already know |
| ⭐ **The bus factor** | the one person who understands it leaves |
| **Documentation** | which you will not write |

**And "buy" isn't just the invoice:** licence/usage fees (⚠️ **which scale with your success**) ·
integration effort · ⭐ **vendor lock-in and migration cost** · vendor reliability becoming *your* incident ·
feature gaps you must work around · data egress · ⭐ **compliance/procurement/security review — which at a
large company can take longer than the build**.

> ⭐ **Compare 3-year TCO, not sticker price. And include the opportunity cost of the build explicitly** —
> saying that sentence out loud is most of the point.

### ⭐ The middle grounds people forget

| | |
|---|---|
| ⭐ **Adopt open source and self-host** | no licence fee, ⚠️ **but you own the operations — which is the majority of the cost.** *"Free" software has a salary attached* |
| ⭐ **Managed open source** | RDS, MSK, Confluent, Elastic Cloud. ⭐ **Usually the sweet spot: no lock-in at the *interface* level, no ops** |
| **Buy now, build later** | ship with a vendor, revisit if it becomes core or the bill becomes absurd |
| ⭐ **Build a thin abstraction over the vendor** | keeps the switch cheap. ⚠️ Don't over-abstract — a leaky lowest-common-denominator wrapper is worse than the lock-in |
| **Buy the commodity, build the differentiator on top** | ⭐ **usually the right shape**: buy the search engine, build the ranking |

### ⭐ Reversibility — the framing that actually decides it

> ⭐ **How expensive is it to change this decision later?**

| | Decision | Reversibility |
|---|---|---|
| ✅ | Which email provider | ⭐ **cheap — a week. Just pick one, don't hold a meeting** |
| ⚠️ | Which database | expensive — months |
| ⚠️ | Which cloud | very expensive |
| ⚠️ | Your data model | ⭐ **the most expensive thing on this list** |

⭐ **Spend deliberation proportional to irreversibility.** (Bezos: type-1 vs type-2 doors.) **A cheap-to-
reverse decision made slowly is itself a cost.**

### ⭐ How to say it in an interview

Don't build a queue, an auth system and a metrics pipeline in your design. Say:

> ⭐ *"I'd use a managed Kafka rather than run our own — the operational cost of a broker fleet isn't where I
> want this team's time. Same for auth: I'd use an OIDC provider, because owning credential storage is
> nothing but risk with no upside. **What I would build is the ranking logic, because that's the product.**"*

⭐ **This does two things at once: it shows you know what the components *are*, and it shows judgement about
where engineering time goes.** It also buys you back interview minutes for the parts that are actually being
assessed.

⚠️ **But know what's inside the box.** ⭐ **"We'd use Kafka" without being able to explain partitions,
consumer groups and delivery semantics is worse than not mentioning it** — that's the whole reason Phase 6
exists. **Buy the component; understand the component.**

### The senior version of the question

⭐ **The best answer isn't "buy" — it's the one that names the *constraint that decides it*:**

> *"For 10,000 events/second, managed Kafka is obviously right. If we hit a scale where the bill is
> £2m/year and we have a dedicated platform team, that arithmetic changes — but that's a problem I'd like to
> have, and by then we'd know far more about our actual requirements. **So: buy now, and set a review
> trigger at the point where the numbers change.**"*

---

## In your own words

**⭐ State the default rule and the core question in one sentence each.**

>

**Name five things you'd almost always buy, and what would justify building instead.**

>

**⭐ List the hidden costs of "build." Which is the biggest and least discussed?**

>

**What are the hidden costs of "buy"?**

>

**⭐ What does "adopt open source and self-host" really cost?**

>

**Name the middle grounds. Which is usually the sweet spot?**

>

**⭐ Explain the reversibility framing. Give a cheap-to-reverse and an expensive-to-reverse decision.**

>

**⭐ Write out how you'd say this in an interview, in three sentences.**

>

**⭐ What's the trap in saying "we'd just use Kafka"?**

>

---

## Links

- The same résumé-driven failure mode → [06-event-sourcing.md](06-event-sourcing.md)
- Adopt an engine or write a state machine? → [13-workflow-engines.md](13-workflow-engines.md)
- Buy the mesh or write a library? → [04-service-discovery-and-mesh.md](04-service-discovery-and-mesh.md)
- Serverless as an ops-cost decision → [12-serverless.md](12-serverless.md)
- ⭐ Understanding what's in the box you're buying → [Phase 6](../../phase-06-messaging/notes/), [Phase 3](../../phase-03-databases/notes/)
- Operational cost is the microservices cost too → [01-monolith-vs-microservices.md](01-monolith-vs-microservices.md)
