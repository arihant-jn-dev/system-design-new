# 08·12 · Serverless / FaaS

> **Why this exists:** the roadmap's framing is *"when it's **genuinely** right"* — which implies the honest
> answer is "sometimes." ⭐ **Knowing the constraints, and being able to say when serverless is the wrong
> tool, is worth more than enthusiasm.**

---

## Reference

### What it actually is

**You deploy a function; the platform runs it on demand, scales it from 0 to N, and bills per invocation ×
duration.** No servers to size, patch or keep warm.

⭐ **The four defining constraints** — everything else follows from these:

| Constraint | |
|---|---|
| ⭐ **Stateless** | any request may hit a brand-new instance; **nothing survives between invocations** (except an opportunistic warm container you must not rely on) |
| ⭐ **Ephemeral** | instances are created and destroyed at will |
| ⭐ **Time-limited** | AWS Lambda caps at **15 minutes**; others less |
| ⭐ **Event-driven** | HTTP, queue, schedule, storage event, stream |

### ⭐ Cold starts — the constraint people ask about

**A cold start is the platform creating a new execution environment**: download code → start runtime →
initialise → *then* run your handler.

| Factor | Effect |
|---|---|
| **Runtime** | Go/Rust/Node ~100–300 ms; ⚠️ JVM/.NET can be **seconds** |
| **Package size** | bigger = slower |
| ⭐ **VPC attachment** | historically brutal; much better now, but still real |
| **Init code** | ⭐ **connections, SDK clients and config loading happen in the cold path** |

**When cold starts actually matter:** ⭐ **spiky traffic** (every burst = many cold starts at once) ·
**user-facing latency SLOs** · ⚠️ ***a fan-out where one request triggers N functions* — cold starts
compound and the tail amplifies** ([Phase 0](../../phase-00-foundations/notes/)).

**When they don't:** steady traffic (instances stay warm) · async/background work · anything already
tolerating hundreds of ms.

**Mitigations:** provisioned concurrency (⚠️ **which is paying for idle capacity — i.e. giving up the main
benefit**) · a fast runtime · small packages · ⭐ **initialise clients OUTSIDE the handler so they're reused
by warm invocations** · keep the function small.

### ⭐ The database problem — the biggest real gotcha

⭐ **Functions scale to thousands of concurrent instances. Each wants a database connection. Postgres does
not.**

1,000 concurrent Lambdas → 1,000 connection attempts → ⭐ **you have DDoS'd your own database**, and this is
*the* classic serverless production incident.

**Fixes:** ⭐ **an external connection proxy (RDS Proxy, PgBouncer)** · an HTTP-based data API · a database
built for it (DynamoDB, Aurora Serverless data API) · **reserved concurrency to cap the fan-out**.

> ⭐ **The general lesson beyond serverless: elastic compute in front of non-elastic state is an
> architectural mismatch.** That sentence transfers to plenty of other designs.

### ⭐ When serverless is genuinely right

| ✅ | Why |
|---|---|
| ⭐ **Spiky or unpredictable traffic** | you pay ~0 at idle. ⭐ **Nothing else scales to zero** |
| ⭐ **Event-driven glue** | S3 upload → resize; queue → process; ⭐ **the sweet spot, and where most successful serverless actually lives** |
| **Scheduled jobs** | replaces a cron box you'd otherwise patch |
| **Genuinely low volume** | a few thousand calls/day costs cents and needs no ops |
| **Rapid prototypes / internal tools** | zero infrastructure |
| **Embarrassingly parallel bursts** | 1,000 concurrent instances instantly |

| ❌ | Why |
|---|---|
| ⚠️ **High, steady traffic** | ⭐ **serverless is ~3–10× the cost of equivalent always-on compute** at scale |
| ⚠️ **Long-running work** | the hard time limit |
| ⚠️ **Sub-50 ms p99 requirements** | cold starts + platform overhead |
| ⚠️ **Stateful / long-lived connections** | WebSockets need a separate mechanism |
| ⚠️ **Heavy DB connection use** | see above |
| ⚠️ **A chatty distributed system built of functions** | ⭐ **a "nanoservice" mess: hundreds of tiny functions with no cohesion, impossible to reason about locally** |

> ⭐ **The Prime Video case** is the honest counter-example worth naming: their monitoring service moved from
> serverless microservices **back to a monolith and cut cost ~90%.** ⭐ **The mistake wasn't serverless — it
> was serverless for high-volume, steady, data-intensive work**, which is exactly the ❌ column.

### Cost — where the intuition breaks

**Billing is per-request + GB-second.** Cheap at low/spiky volume; ⭐ **crosses over into much more expensive
than a reserved instance once you're steadily busy.**

⚠️ **And the hidden costs are usually bigger than the compute:** API Gateway per-request charges (often
exceeding the Lambda bill) · NAT gateway data transfer · CloudWatch logs · the extra managed services the
architecture requires.

> ⭐ **Compute cost is the easy part to model and rarely the part that surprises you. Model the whole
> architecture.**

### Operational reality

| | |
|---|---|
| ⭐ **Observability is different, not free** | no long-lived process to attach to; **distributed tracing is mandatory, not optional** |
| ⭐ **Local development is harder** | emulators drift from the real platform |
| ⭐ **Vendor lock-in is real** | not the runtime — ⭐ **the *event sources, IAM and managed services* around it**. That's what makes a migration expensive |
| **Testing** | unit tests are easy; integration tests need the cloud |
| **Concurrency limits** | account-level caps; ⭐ **one runaway function can starve every other function in the account.** Reserved concurrency is a **bulkhead** ([Phase 7 note 04](../../phase-07-reliability/notes/04-bulkheads-and-isolation.md)) |
| **Retries and DLQs** | the platform retries automatically — ⭐ **so your function MUST be idempotent** ([11](11-api-evolution-and-contract-testing.md)) |

### The middle ground worth naming

⭐ **"Serverless" ≠ FaaS.** The interesting modern option is **serverless *containers*** — Cloud Run, AWS
Fargate, Container Apps: scale-to-zero and per-use billing, **but a normal long-running process**, so no
15-minute cap, normal connection pooling, normal local dev, and far less lock-in.

> ⭐ **For most "should we go serverless?" questions, a scale-to-zero container platform is the better
> answer** — you get the elasticity and the ops savings without the FaaS constraints. Saying this is a
> stronger answer than picking a side of the Lambda debate.

---

## In your own words

**⭐ Name the four defining constraints. What follows from each?**

>

**What is a cold start, mechanically? When does it actually matter?**

>

**⭐ Why is provisioned concurrency a partial contradiction?**

>

**⭐ Describe the database connection problem, and state the general lesson it teaches.**

>

**Three cases where serverless is genuinely right, and three where it isn't.**

>

**⭐ What does the Prime Video case actually demonstrate?**

>

**Where does the cost intuition break? What costs more than the compute?**

>

**⭐ Where does the real lock-in live?**

>

**Why must a serverless function be idempotent?**

>

**⭐ What's the middle ground, and why is it often the better answer?**

>

---

## Links

- Statelessness as a general property → [Phase 2](../../phase-02-stateless-scaling/notes/)
- Idempotency, required here → [11-api-evolution-and-contract-testing.md](11-api-evolution-and-contract-testing.md)
- Reserved concurrency as a bulkhead → [Phase 7 note 04](../../phase-07-reliability/notes/04-bulkheads-and-isolation.md)
- Cold starts and tail amplification → [Phase 0](../../phase-00-foundations/notes/)
- Event sources → [Phase 6](../../phase-06-messaging/notes/)
- The cost/ops trade in general → [14-build-vs-buy.md](14-build-vs-buy.md)
