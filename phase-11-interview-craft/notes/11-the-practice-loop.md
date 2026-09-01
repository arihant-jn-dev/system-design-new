# 11·11 · The Practice Loop

> **Why this exists:** Phase 11 is craft; ⭐ **Phase 12 is the phase that actually gets you hired.** This note
> is the bridge — the method, the cadence, and why the loop is built the way it is.
>
> ⭐ **The roadmap wanted this started in Week 6, in parallel with everything else.**

---

## Reference

### ⭐ The 90-minute loop

| Step | Time | ⭐ Why it's there |
|---|---|---|
| **1 · Solve it timed, out loud, nothing looked up** | 45 min | ⭐ **The only step that simulates the actual task.** Looking things up makes it a reading exercise |
| **2 · Read 2–3 good write-ups. Note ONLY what you missed** | 20 min | ⭐ **"Only what you missed" is the discipline** — summarising the article teaches you nothing |
| **3 · Write your own one-page summary** | 15 min | ⭐ **Writing it yourself is what makes it stick** ([`SESSION-TEMPLATE.md`](../lab/SESSION-TEMPLATE.md)) |
| **4 · List the reusable building blocks it used** | 10 min | ⭐ **The compounding step** — see below |

⭐ **Step 1 is non-negotiable and it's the one people skip**, because doing it badly is unpleasant. ⚠️ **But
reading a write-up before attempting the problem converts an active skill into passive knowledge, and the
round tests the active one.**

### ⭐ Step 4 is the one that compounds

> ⭐ **The roadmap: "watch the overlap grow; by problem 15 most questions are recombinations."**

⭐ **This is the entire strategic claim of the practice phase, and it's why Phase 9 exists.** Every problem
you do should end with: *"that was hybrid fan-out + an idempotency store + a roll-up pipeline."*

⭐ **After ~15 problems, a new question stops feeling novel** — you recognise the bricks and spend your
thinking on what's *different* about this one rather than reconstructing the whole thing.

⚠️ **Skip step 4 and you get 30 memorised designs instead of 16 composable components.** ⭐ **The first
doesn't generalise to a question you haven't seen; the second does.**

### Cadence and target

| | |
|---|---|
| **From Week 6** | 2 problems/week |
| **From Week 12** | 3 problems/week |
| ⭐ **Target** | **~30 problems** |

⭐ **Record one every two weeks and self-review it** ([`SELF-REVIEW.md`](../lab/SELF-REVIEW.md)). ⚠️ **Not
every session — recording every time makes it a chore you'll abandon. Every fourth or so.**

### ⭐ If you're behind — and you probably are

⭐ **The honest reprioritisation, in order:**

| | |
|---|---|
| ⭐ **1** | ⭐ **Stop building knowledge. You have more than enough** — twelve phases of it, with measured numbers. **The gap is delivery, and delivery only improves by delivering** |
| ⭐ **2** | ⭐ **Do ONE recorded session today.** Not tomorrow. It is the highest-information hour available to you, and it will tell you exactly what to fix |
| **3** | Then volume: 3/week, Tier 1 first — they're short and they build the pacing habit |
| **4** | ⭐ **Do step 4 every time**, even when you skip steps 2 and 3 |
| ⭐ **5** | ⭐ **Re-do a problem you've already done, cold, two weeks later.** Much more valuable than a new one — it tests retention rather than recognition |

⭐ **Ten problems done properly beats thirty rushed.** ⚠️ **But zero problems done properly beats nothing at
all, which is where "I'll practise after I finish the notes" always ends.**

### ⭐ Ordering: easy → hard

**Tier 1 — core mechanics.** URL shortener · Pastebin · rate limiter · web crawler.
⭐ **Start here even though they feel beneath you** — they're short enough that you can focus on *pacing*
rather than content, which is what you're actually building.

**Tier 2 — the classics.** Twitter/feed · chat · Instagram · Dropbox · YouTube · Uber · notifications ·
job scheduler.

**Tier 3 — the ones with a genuine twist.** Ticketmaster (⭐ *contention, not scale*) · payments
(⭐ *correctness over throughput*) · collaborative editing (⭐ *CRDTs/OT*) · ad aggregator (⭐ *late data*) ·
stock exchange (⭐ *latency and ordering*).

⭐ **Tier 3 problems are where the interesting deep dives live**, because their hard part isn't scale.

### Making it real

⭐ **Out loud, always** — thinking silently is a different and much easier skill · **on a whiteboard or
Excalidraw**, not in your head · ⭐ **timed, with [`drill.js`](../lab/drill.js) running** · **alone is fine**
— a mock partner is better, but ⚠️ **"I'll start when I find a partner" is a way of not starting** ·
⭐ **and mock interviews with a real person for the last few, because a human interrupts and redirects in ways
you can't simulate.**

---

## In your own words

**⭐ State the four steps and why each is there.**

>

**⭐ Why must you attempt the problem BEFORE reading any write-up?**

>

**⭐ Why is step 4 the one that compounds? What happens if you skip it?**

>

**What's the cadence and target? How often do you record?**

>

**⭐ You're behind. What are the five things you do, in order?**

>

**⭐ Why start with problems that feel too easy?**

>

**What makes Tier 3 problems interesting?**

>

**⭐ What's the honest reason people don't start?**

>

---

## Links

- ⭐ **The timer** → [`../lab/drill.js`](../lab/drill.js) · `node drill.js --list` for the problem bank
- ⭐ **The one-pager** → [`../lab/SESSION-TEMPLATE.md`](../lab/SESSION-TEMPLATE.md)
- ⭐ **The rubric** → [`../lab/SELF-REVIEW.md`](../lab/SELF-REVIEW.md)
- ⭐ **The building blocks to recognise** → [Phase 9](../../phase-09-building-blocks/notes/)
- The beats → [01-the-framework.md](01-the-framework.md)
- ⚠️ What to avoid → [10-failure-patterns.md](10-failure-patterns.md)
