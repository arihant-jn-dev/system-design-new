# 11 · Cost Dimensions

> **Why this exists:** cost is a real interview axis at senior level and almost nobody mentions it
> unprompted. Mentioning it — with numbers — is one of the cheapest ways to sound like someone who has
> operated a system rather than only designed one.

---

## Reference

### The four dimensions

| Dimension | What you pay for | Rough order of magnitude |
|---|---|---|
| **Compute** | vCPU-hours, RAM-hours, container/lambda invocations | ~$0.03–0.05 / vCPU-hour on-demand |
| **Storage** | GB-months, IOPS, snapshots | Object $0.02/GB-mo · Block SSD $0.10/GB-mo · **Managed DB $0.10–0.25/GB-mo** |
| **Network** | **Egress**, cross-AZ, cross-region, NAT gateway | **$0.05–0.12/GB egress to internet.** Ingress is free. |
| **Ops burden** | Engineer time, on-call, incidents, upgrades | **Usually the largest and always the least measured** |

*(Prices are 2024-era AWS-ish list prices. Memorise the **ratios**, not the digits — same discipline as
latency numbers. The point is to know that egress dwarfs storage, not to quote a price list.)*

### Egress — the sneaky one

**This is the item the roadmap calls out, and it's the one that surprises people.**

Data *into* the cloud is free. Data *out* costs $0.05–0.12/GB. That asymmetry is deliberate, and it's why
"just serve it from S3" can be a five-figure monthly line item.

**Worked example — the one to have ready:**

> Video platform serving 1 PB/month of egress.
> 1,000,000 GB × $0.085/GB = **$85,000/month = ~$1 M/year — in bandwidth alone.**
>
> The storage for that content might be $20,000/month. **Egress is 4× the storage cost.**
> This is precisely why every video company builds or buys a CDN, negotiates committed-use bandwidth
> deals, and peers directly with ISPs. It's not a performance decision — it's the P&L.

**The three hidden network costs people forget:**

1. **Cross-AZ traffic costs money** (~$0.01–0.02/GB *each way*). Your multi-AZ deployment for availability
   has an ongoing chatty-microservice tax. A service mesh that adds a hop adds a bill.
2. **NAT Gateway** — ~$0.045/GB *plus* an hourly charge. Private-subnet services pulling container images or
   calling external APIs route through it. Famous source of mystery bills.
3. **Cross-region replication** — you pay egress on every replicated byte, continuously, forever.

> **Interview line:** "This design fans out to three services per request across AZs. That's an availability
> win, but it's also cross-AZ egress on every request — worth checking against the bill before we commit."

### Cost intuition by architecture choice

| Choice | Cost effect | Notes |
|---|---|---|
| **CDN in front of static/media** | **Massive egress saving** | Offloads origin bandwidth *and* compute. Usually the single biggest cost lever. |
| **Cache** | Saves DB compute (the expensive tier) | Trades cheap RAM for expensive database load |
| **Denormalisation** | More storage, less compute | Storage is cheap; compute and latency are not. Usually a good trade. |
| **Microservices** | **More network, more ops, more idle capacity** | Each service needs its own headroom. 20 services at 30% utilisation is a lot of paid-for idle CPU. |
| **Serverless** | Cheap when spiky/low-volume, **expensive when steady and high-volume** | The crossover is real. At sustained load, reserved instances win decisively. |
| **Managed services (RDS, MSK)** | ~2–3× the raw infra cost | **Usually still correct** — an engineer costs more than the markup. Say this out loud; it's a mature take. |
| **Multi-region active-active** | ~2× everything + replication egress | Only justify it with a *business* requirement (latency SLA, data residency, regulatory) |
| **Over-retention of logs/metrics** | Silent, compounding | Retention policy is a cost decision. So is **metric cardinality** (Phase 7). |
| **Tiered storage (hot → cold → archive)** | 10–20× cheaper for cold data | Requires knowing your data temperature (note 10) |

### Ops burden — the cost nobody puts on the slide

A senior engineer is ~$150–300 K/year fully loaded. **One engineer maintaining a system costs more than most
infrastructure bills.**

So the honest cost of a design includes:

- How many people must understand it to operate it?
- How many alerts does it generate at 3 a.m.?
- How many *distinct technologies* is the team now on the hook for upgrading, patching and debugging?
- What's the on-call load?

> **This is the real argument against polyglot persistence.** "Postgres for orders, Cassandra for events,
> Elasticsearch for search, Redis for cache, Kafka for streaming" is five systems to operate, back up,
> upgrade, secure, monitor and be paged for. Each one is defensible alone; together they can exceed a small
> team's entire capacity.
>
> **Senior answer:** "I could use Cassandra here, but we're already running Postgres and this workload fits
> it for the next 2–3 years. I'd rather not add an operational surface for a problem we don't have yet."
>
> That sentence — declining a technology *for operational reasons* — is a strong seniority signal precisely
> because it shows you've been on call.

### Build vs buy

| Favour **buy** when | Favour **build** when |
|---|---|
| It's not your differentiator (auth, email, payments, search) | It **is** your core product |
| Team is small | The vendor cost exceeds engineer cost at your scale |
| Time-to-market matters | You have genuinely unusual requirements |
| The problem is well-solved by others | Vendor lock-in is an existential risk |

**Total Cost of Ownership = licence/infra + integration + ongoing ops + migration-out cost.** People compare
the first term only, which is how "we'll just build it, it's only two weeks" happens.

### Where to bring cost up in an interview

Don't derail the design. Two natural moments:

1. **When choosing between viable options** — "both work; option B is ~3× the egress, so I'd go with A."
2. **In the wrap-up / bottlenecks section (framework step 7)** — "the dominant cost here is egress on media
   delivery, which is why the CDN isn't optional. Second is the Kafka cluster, which I'd revisit if volume
   stays this low."

**One sentence with a number beats a paragraph of hand-waving.**

---

## In your own words

**Why is egress the sneaky cost? Give a worked example with your own numbers.**

>

**Name the three network costs people forget.**

>

**Why is "we're already running Postgres" a legitimate technical argument, not laziness?**

>

**When is serverless cheaper, and when does it become expensive?**

>

**Estimate the monthly cost of a system you've worked on across all four dimensions. Which surprised you?**

>

---

## Links

- Data temperature and tiering → [10-workload-shape.md](10-workload-shape.md)
- Storage volumes to price → [01-napkin-math.md](01-napkin-math.md)
- CDN mechanics → Phase 2
- Metric cardinality as a cost bomb → Phase 7
- Polyglot persistence and its operational cost → Phase 3F
- Build vs buy as an architecture decision → Phase 8
