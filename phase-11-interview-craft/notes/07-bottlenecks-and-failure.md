# 11·07 · Beat 7 — Bottlenecks, Failures & Scale-Up

**5–10 minutes. ⭐ VOLUNTEER IT — don't wait to be asked.**

> **Why this exists:** the roadmap calls this ⭐ ***"the senior differentiator"*** here, and Phase 7 called
> the same skill ⭐ ***"the most reliable single differentiator in the whole round."*** ⭐ **Two phases, same
> verdict. This is the highest-value five minutes you will spend.**

---

## Reference

### ⭐ Volunteering is the point

> ⭐ **"Mid-level candidates design the happy path. Senior candidates design the failure path."**

⭐ **And the delivery matters as much as the content: if the interviewer has to ASK "what happens when the
database goes down?", you've already lost most of the credit.** Arriving there yourself, unprompted, is what
signals that failure analysis is a habit rather than a topic you revised.

**The transition is one sentence:**

> *"Before I wrap up — let me walk the failure modes, because I think that's the interesting part of this
> design."*

### ⭐ The systematic walk

**Don't free-associate. Walk the diagram.**

> ⭐ **For every BOX: what happens when it DIES? when it's SLOW? when it's OVERLOADED?**
> ⭐ **For every ARROW: what's the timeout, the retry policy, the fallback?**

⭐ **"Slow" is the important column and the one people skip.** Phase 7 measured why: a dependency that
degraded to 5 s p99 — while returning *zero errors* — took the whole service from a 154 ms p99 to
**6.41 seconds** and 28% success. ⭐ **"Slow is worse than down": a dead dependency fails fast and you shed;
a slow one consumes your capacity via Little's Law.**

### The checklist, with the numbers you own

| Component dies | ⭐ Consequence — cite your own measurement |
|---|---|
| **CDN** | origin takes 100% of traffic, sized for 5% |
| **App instance** | LB routes around it; N−1 capacity. ⭐ **Slow instance = gray failure, only p99 catches it** |
| ⭐ **Cache** | ⭐ **THE COLD-CACHE OUTAGE — you measured 271 failures and a 2-second p95 with nothing broken but an empty cache. Losing a PERFORMANCE component caused an AVAILABILITY failure** |
| ⭐ **DB primary** | failover, split brain, fencing, RPO. ⭐ **You measured 10,862 acknowledged commits lost (71%) on failover with a lagging replica — and then BOTH nodes claiming to be primary** |
| ⭐ **A dependency is SLOW** | ⭐ **cascade — cite the 6.41 s p99, and that retries made it WORSE (5,601 → 7,405 calls, success went DOWN)** |
| **Queue** | unbounded growth; ⭐ **alert on lag GROWTH, not depth** |
| **DNS provider** | total outage — use two |
| ⭐ **The deploy pipeline** | ⭐ **correlated failure across every replica — "most outages come from change"** |

### ⭐ What breaks FIRST at 10×?

⚠️ **The weak answer is "we'd add more servers."** ⭐ **The strong answer names the specific component and
why:**

> *"At 10× the app tier scales horizontally — it's stateless, that's fine. ⭐ **The write path to the primary
> is what breaks first**, because we're at ~3 K writes/sec and a single Postgres node tops out around 5 K.
> So 10× means sharding, and I'd shard by tenant_id **because** every query is already tenant-scoped. ⭐ **The
> second thing to break would be the fan-out workers**, and that's a queue-depth problem I'd see coming in
> the lag metric."*

⭐ **Naming the ORDER in which things break — first, then second — is what makes this answer land.**

### Also volunteer, briefly

| | |
|---|---|
| ⭐ **Hot spots** | the celebrity, the whale tenant, the popular key — ⭐ *and how you'd detect one* |
| **Monitoring & alerting** | ⭐ **symptoms not causes; alert on p99 and on burn rate, not on CPU** |
| ⭐ **COST** | ⭐ **"egress is the dominant line here, not compute" — mentioning cost is a reliable senior marker, and it's on the roadmap's failure list if you never do** |
| **Operational burden** | how many services is the team now on call for? |
| ⭐ **The auth story** | if you haven't given one yet ([Phase 10](../../phase-10-security/notes/01-authn-vs-authz.md)) |
| **Blast radius** | cells, shuffle sharding, per-tenant isolation |

### ⭐ A failure injection that shows no problem usually means the injection didn't work

⭐ **A genuinely good line to have, and you earned it twice:** in Phase 3C, killing the primary under load
showed zero loss (the replica had kept up), and `docker pause` showed zero loss again (the kernel still
accepted into TCP buffers). ⭐ **Only `docker stop`, which actually severs the connection, revealed 71% data
loss.**

⭐ **The general form — "if my failure test shows nothing, I suspect the test before I trust the system" — is
exactly the instinct interviewers are probing for**, and it's rare.

---

## In your own words

**⭐ Why does volunteering matter as much as the content? Say the transition sentence.**

>

**⭐ State the systematic walk — what do you ask of every box and every arrow?**

>

**⭐ Why is "slow" worse than "down"? Cite your number.**

>

**⭐ Walk the eight components with a consequence each. Cite three of your own measurements.**

>

**⭐ What breaks FIRST at 10× in a design you know — and second? Say it out loud with the reasoning.**

>

**Six things to volunteer beyond the component walk.**

>

**⭐ Why is mentioning cost a senior marker?**

>

**⭐ Say the "failure injection that shows nothing" line and the story behind it.**

>

---

## Links

- ⭐ **Run it** → [`../lab/drill.js`](../lab/drill.js)
- ⭐ **The whole phase this comes from** → [Phase 7](../../phase-07-reliability/notes/) · [Phase 7 GATE Q1](../../phase-07-reliability/GATE.md)
- The cold-cache outage → [Phase 5 lab](../../phase-05-caching/lab/)
- Failover data loss → [Phase 3C lab](../../phase-03-databases/lab/lab-c-replication/)
- Retries making it worse → [Phase 7 lab](../../phase-07-reliability/lab/)
- Auth story → [Phase 10 note 01](../../phase-10-security/notes/01-authn-vs-authz.md)
- Wrapping up → [01-the-framework.md](01-the-framework.md)
