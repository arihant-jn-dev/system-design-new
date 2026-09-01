# Self-Review Rubric

> ⭐ **Watch the recording with this open. Score honestly — a generous score wastes the hour.**
>
> The roadmap: *"It will be unpleasant and it is the fastest improvement you will get from any single hour
> in this roadmap."*

**Problem:** ________________________  **Date:** __________  **Session #:** ____

---

## A · Pacing (the thing recordings expose most)

| | Target | Actual | |
|---|---|---|---|
| Requirements finished by | 07:00 | | |
| Capacity finished by | 11:00 | | |
| API finished by | 15:00 | | |
| Data model finished by | 20:00 | | |
| Architecture finished by | 30:00 | | |
| Deep dive finished by | 38:00 | | |
| ⭐ **Failure modes STARTED by** | **38:00** | | ⭐ **the most commonly missed** |
| Wrapped by | 45:00 | | |

**⭐ Which beat stole time from the others?**

>

**⭐ Did you finish, or did the clock finish you?**

>

---

## B · Content — score each 0/1/2

*(0 = didn't do it · 1 = did it thinly · 2 = did it well)*

### 1 · Requirements & scope

- [ ] ___ Got 3–5 core features before touching architecture
- [ ] ___ ⭐ **Explicitly DEFERRED things** — *"I'll leave analytics out of scope unless you'd like it"*
- [ ] ___ Asked about scale (DAU, QPS, read:write, data size, growth)
- [ ] ___ Asked about non-functionals (latency, availability, consistency, durability)
- [ ] ___ Asked about constraints (mobile, global, regulatory, existing stack)
- [ ] ___ ⭐ **Wrote the scope down and REFERRED BACK to it later**

### 2 · Capacity

- [ ] ___ Average **and peak** QPS
- [ ] ___ Storage/year, bandwidth, cache memory
- [ ] ___ Rounded aggressively and said the assumptions out loud
- [ ] ___ ⭐ **USED the numbers later** — *(if not, this was theatre; score 0)*

### 3 · API

- [ ] ___ 3–5 endpoints/events with real signatures
- [ ] ___ Thought about pagination / idempotency
- [ ] ___ Noticed (or would have noticed) a requirement gap here

### 4 · Data model — ⭐ *seniors are judged hard here*

- [ ] ___ Entities and relationships
- [ ] ___ ⭐ **Datastore choice WITH a because**
- [ ] ___ ⭐ **Shard key WITH a because**
- [ ] ___ Said what gets hot if the shard key is wrong
- [ ] ___ Access patterns actually match the shard key

### 5 · Architecture

- [ ] ___ Legible, left-to-right, room left to extend
- [ ] ___ ⭐ **Walked a WRITE path end to end, out loud**
- [ ] ___ ⭐ **Walked a READ path end to end, out loud**
- [ ] ___ Numbers on the diagram (QPS on arrows, size on stores)

### 6 · Deep dive

- [ ] ___ ⭐ **OFFERED a candidate** rather than waiting to be assigned one
- [ ] ___ It was a genuinely interesting choice (the hard part, not the easy part)
- [ ] ___ Got to actual mechanism — algorithm, data structure, failure case
- [ ] ___ ⭐ Cited a real number from your own labs

### 7 · Failure & scale — ⭐ *the senior differentiator*

- [ ] ___ ⭐ **VOLUNTEERED it, unprompted**
- [ ] ___ For each component: dies / slow / overloaded
- [ ] ___ Named what breaks **first** at 10×
- [ ] ___ Monitoring and alerting
- [ ] ___ ⭐ **Cost and operational burden**
- [ ] ___ ⭐ **An auth story** (Phase 10)

### 8 · Wrap

- [ ] ___ Recapped
- [ ] ___ ⭐ **Named the top 2 tradeoffs**
- [ ] ___ Said what you'd revisit

**Content subtotal:** ____ / 62

---

## C · Delivery — the part only a recording can tell you

| | Score 0–2 | Notes |
|---|---|---|
| ⭐ **Talked continuously while drawing** (silence reads as stuck) | | |
| ⭐ **Every technology had a "because"** | | |
| ⭐ **Volunteered tradeoffs** without being asked | | |
| ⭐ **Stated assumptions and moved on** rather than waiting for permission | | |
| ⭐ **Committed** — landed the plane instead of "it depends" | | |
| Managed the clock deliberately, and *said* you were choosing | | |
| Diagram stayed legible to the end | | |
| Spoke at a steady pace, not rushed | | |

**Delivery subtotal:** ____ / 16

---

## D · The failure patterns — ⚠️ tick any you did

- [ ] ⚠️ ⭐ **Jumped to architecture before requirements** *(the #1 killer)*
- [ ] ⚠️ Buzzword with no justification — ⭐ *Kafka in a design that needed a cron job*
- [ ] ⚠️ Designed for 1 B users when told 10 K
- [ ] ⚠️ ⭐ **Ignored the failure path**
- [ ] ⚠️ Never mentioned cost or operational burden
- [ ] ⚠️ ⭐ **Went silent while thinking** — *(note the timestamps: ______ )*
- [ ] ⚠️ No shard key
- [ ] ⚠️ No consistency story
- [ ] ⚠️ ⭐ **No auth story**
- [ ] ⚠️ ⭐ **Refused to commit** — "it depends", never landed
- [ ] ⚠️ Whiteboard chaos — ran out of room, illegible, jumped around
- [ ] ⚠️ Answered a question you weren't asked instead of the one you were

⭐ **Each tick costs 2 points.** Penalty: ____

---

## Score

| | |
|---|---|
| Content | ____ / 62 |
| Delivery | ____ / 16 |
| Penalties | − ____ |
| ⭐ **TOTAL** | **____ / 78** |

| Score | Reading |
|---|---|
| < 40 | Structure isn't there yet — ⭐ **re-run the same problem tomorrow with the timer** |
| 40–55 | The beats are landing; ⭐ **content depth is the gap** |
| 55–68 | Solid. ⭐ **Delivery polish and volunteering are what's left** |
| > 68 | ⭐ **Strong. Move to harder problems and tighter time.** |

---

## The only three things that matter now

**⭐ 1. The single worst moment in the recording:**

>

**⭐ 2. The one thing to fix in the NEXT session (pick exactly one):**

>

**⭐ 3. Something you did WELL — name it, so you keep doing it:**

>

---

## Session log

| # | Date | Problem | Content | Delivery | Penalty | ⭐ Total | The one fix |
|---|---|---|---|---|---|---|---|
| 1 | | | /62 | /16 | | /78 | |
| 2 | | | /62 | /16 | | /78 | |
| 3 | | | /62 | /16 | | /78 | |
| 4 | | | /62 | /16 | | /78 | |
| 5 | | | /62 | /16 | | /78 | |
| 6 | | | /62 | /16 | | /78 | |

> ⭐ **The trend matters more than any single score.** If the total isn't moving, you're practising without
> changing anything — go back to "the one fix" and make it the *only* thing you focus on next session.
