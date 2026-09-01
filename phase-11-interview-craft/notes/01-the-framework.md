# 11·01 · The Framework — the Eight Beats

> **Why this exists:** the roadmap's own framing — ⭐ ***"knowledge you can't deliver in 45 minutes is worth
> nothing in a round. This phase is pure ROI."***
>
> ⚠️ **And its warning: internalize the beats, DON'T RECITE THEM.** A candidate announcing *"now I'll move to
> step four"* sounds like they're following a script, not thinking.

---

## Reference

### ⭐ The time budget

| Beat | Minutes | Ends at | The one thing |
|---|---|---|---|
| **1 · Requirements & scope** | 5–8 | ~07:00 | ⭐ **Never skip. Never rush.** |
| **2 · Capacity estimation** | 3–5 | ~11:00 | ⭐ **Use the numbers later** |
| **3 · API design** | 3–5 | ~15:00 | Forces concrete thinking |
| **4 · Data model** | 5 | ~20:00 | ⭐ **Seniors are judged hard here** |
| **5 · High-level architecture** | 8–10 | ~30:00 | ⭐ **Walk a write path and a read path** |
| **6 · Deep dive** | 10–15 | ~38:00 | ⭐ **Offer a candidate** |
| **7 · Bottlenecks & failures** | 5–10 | ~43:00 | ⭐ **VOLUNTEER IT — the differentiator** |
| **8 · Wrap** | 1–2 | 45:00 | ⭐ **Name the top 2 tradeoffs** |

⭐ **Roughly: a third on framing, a third on the design, a third on depth and failure.** Most people spend
75% on the middle third and never reach the last one.

### ⭐ Why the order is the order

**It isn't arbitrary — each beat makes the next one possible:**

```
requirements ──▶ tells you the SCALE
   scale      ──▶ tells you whether this is a 1-box or a 100-box problem
   API        ──▶ forces the entities to be concrete, and often exposes a
                  requirement you missed while it's still cheap to add
   data model ──▶ the access patterns determine the datastore and shard key
   architecture ▶ now the boxes have a REASON to exist
   deep dive  ──▶ you can only choose a good one once the design is on the board
   failures   ──▶ you can only enumerate failures for components you've drawn
```

⭐ **This is why "jumping to architecture" is the #1 killer** — you end up drawing boxes you can't justify,
and every later beat has nothing to stand on.

### ⭐ The three beats that actually differentiate

Most candidates do 3, 5 and 8 acceptably. ⭐ **These three are where rounds are won and lost:**

| | |
|---|---|
| ⭐ **1 · Requirements** | ⚠️ Skipping it is the #1 killer, and it's entirely self-inflicted. **The fix is free.** |
| ⭐ **4 · Data model** | ⭐ **A shard key with a reason, and access patterns that match it.** This is the beat that most reliably separates senior from mid |
| ⭐ **7 · Failure modes** | ⭐ **Volunteered, not extracted.** Phase 7's whole point: *"mid-level candidates design the happy path; senior candidates design the failure path"* |

### ⭐ Making it not sound like a script

| ⚠️ Scripted | ⭐ Natural |
|---|---|
| *"Step 1: requirements gathering."* | *"Before I draw anything — what are we actually optimising for here?"* |
| *"Now I'll do capacity estimation."* | *"Let me put rough numbers on this, because it changes whether we need sharding at all."* |
| *"Moving to step 7, failure modes."* | *"Let me walk what happens when each of these dies — I think the cache is the interesting one."* |

⭐ **The beats should show up as the SHAPE of your answer, not as its narration.**

⭐ **But DO narrate transitions and time choices**, which is different: *"I'll spend a couple more minutes on
the data model because the shard key drives everything downstream"* is a strong signal — it shows you're
managing the clock deliberately rather than drifting.

### ⭐ Adapting when the interviewer intervenes

**The framework is a default, not a contract.**

| They say | Do |
|---|---|
| *"Assume the requirements, let's get to design"* | ⭐ **Compress to 90 seconds** — *"then I'll assume X, Y, Z; stop me if any of those are wrong"* — ⭐ **but still say them**, because they anchor everything after |
| *"Let's go deep on the storage layer"* | ⭐ **Go. Abandon the remaining beats.** They're steering to what they want to assess |
| *"What about 100× traffic?"* | Jump to beat 7 and come back |
| They're silent throughout | ⭐ **Drive it yourself, and check in at each beat boundary** — *"does that scoping sound right before I move on?"* |

⚠️ **Never keep marching through your beats while the interviewer is trying to redirect you.** ⭐ **Following
the interviewer beats following the framework, every time.**

### The 45-minute reality

⭐ **Depth on everything is impossible. Choose deliberately, and SAY you're choosing** — *"there's a lot in
the media pipeline, but I think the interesting problem is the hot-key fan-out, so I'll go deep there and
keep transcoding at the level of a box."*

⭐ **That sentence does three things at once:** shows judgement, manages the clock, and hands the interviewer
a chance to redirect you if they disagree.

---

## In your own words

**⭐ Write out the eight beats with their time budget, from memory.**

>

**⭐ Explain why the order is the order — what does each beat give the next?**

>

**Which three beats actually differentiate, and why each?**

>

**⭐ Why is "jumping to architecture" so damaging, beyond just missing requirements?**

>

**⭐ Rewrite three scripted-sounding transitions as natural ones.**

>

**Which transitions SHOULD you narrate, and why?**

>

**⭐ What do you do when the interviewer redirects you mid-framework?**

>

**⭐ Say the "I'm choosing where to go deep" sentence for a design you know.**

>

---

## Links

- ⭐ **Run it** → [`../lab/drill.js`](../lab/drill.js)
- Beat 1 → [02-requirements-and-scope.md](02-requirements-and-scope.md)
- Beat 2 → [03-capacity-estimation.md](03-capacity-estimation.md)
- Beats 3–4 → [04-api-and-data-model.md](04-api-and-data-model.md)
- Beat 5 → [05-high-level-architecture.md](05-high-level-architecture.md)
- Beat 6 → [06-deep-dive.md](06-deep-dive.md)
- ⭐ Beat 7 → [07-bottlenecks-and-failure.md](07-bottlenecks-and-failure.md)
- The anti-patterns → [10-failure-patterns.md](10-failure-patterns.md)
