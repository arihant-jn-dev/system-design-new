# Practice Session — One-Page Summary

> ⭐ **Copy this file per problem.** It's step 3 of the roadmap's Phase 12 method, and it's what turns a
> practice session into something that compounds instead of evaporating.
>
> **The full ~90-minute loop:**
> **45 min** solve it timed and out loud, nothing looked up → **20 min** read 2–3 good write-ups and note
> ⭐ *only what you missed* → **15 min** fill in this page → **10 min** list the building blocks.

**Problem:** ________________________  **Date:** __________

---

## 1 · Requirements (as you scoped them)

**In scope:**

1.
2.
3.

**⭐ Explicitly deferred:**

>

**Scale assumed:** DAU ______ · QPS avg ______ / peak ______ · read:write ______ · data/yr ______

**Non-functional:** latency ______ · availability ______ · consistency ______

---

## 2 · Capacity — the numbers that mattered

| | Value | ⭐ Where you used it later |
|---|---|---|
| Peak QPS | | |
| Storage/year | | |
| Cache size | | |
| Bandwidth | | |

⚠️ **If the right-hand column is empty, the estimate was theatre. Say so here:**

>

---

## 3 · Architecture

*(Sketch it, paste the Excalidraw link, or describe the boxes and arrows.)*

```



```

**The write path, in one sentence:**

>

**The read path, in one sentence:**

>

---

## 4 · The decisions, with their reasons

| Decision | ⭐ Because | The alternative you rejected, and why |
|---|---|---|
| Datastore | | |
| ⭐ **Shard key** | | |
| Cache strategy | | |
| Sync vs async boundary | | |
| Consistency model | | |

---

## 5 · ⭐ The top 2 tradeoffs

**1.**

> *What you gave up:*
> *What you got:*
> *When you'd choose differently:*

**2.**

> *What you gave up:*
> *What you got:*
> *When you'd choose differently:*

---

## 6 · Failure modes

| Component | Dies | Slow | Overloaded |
|---|---|---|---|
| | | | |
| | | | |
| | | | |

**⭐ What breaks FIRST at 10×?**

>

**⭐ Auth story, in one line:**

>

---

## 7 · ⭐ The building blocks this used

> ⭐ **This is the highest-value section, and the one people skip.** The roadmap: *"watch the overlap grow;
> by problem 15 most questions are recombinations."*

- [ ] Unique IDs — which scheme, and why
- [ ] Rate limiter
- [ ] Distributed lock / leader election
- [ ] Probabilistic structure (bloom / HLL / CMS)
- [ ] Counters at scale
- [ ] Search / inverted index
- [ ] Autocomplete
- [ ] Geospatial
- [ ] Feed / fan-out
- [ ] Notifications
- [ ] WebSockets
- [ ] Blob storage
- [ ] Media pipeline
- [ ] Idempotency / dedupe
- [ ] Analytics / roll-ups
- [ ] Payments / ledger
- [ ] Other: ______________________

**⭐ Which of these had you already built or measured in a lab?**

>

---

## 8 · What you MISSED

> ⭐ **From the write-ups you read afterwards. Only what you MISSED — not a summary of the article.**

| What you missed | ⭐ Why you missed it (didn't know it / knew it but forgot / ran out of time) |
|---|---|
| | |
| | |
| | |

⭐ **The "why" column is the important one.** *Didn't know* → go read. *Knew but forgot* → it's a checklist
problem. *Ran out of time* → it's a pacing problem. **Three different fixes.**

---

## 9 · The one thing to do differently next time

>
