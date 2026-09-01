# 11·08 · Communication — the Skills to Drill

> **Why this exists:** ⭐ **two candidates with identical knowledge do not score identically.** These are the
> behaviours that separate them, and every one of them is drillable — which means they're free points once
> you've noticed them.

---

## Reference

### ⭐ 1 · Talk while you draw

> ⭐ **Silence reads as being stuck.**

**The interviewer can't see your thinking. Ten seconds of silence while you draw a box is ten seconds where,
from the outside, you appear to have run out of ideas.**

⭐ **Narrate the drawing itself** — *"I'm putting the cache between the service and the DB, and I'll come
back to what we put in it"* — and ⭐ **narrate thinking pauses instead of taking them silently**: *"let me
think about whether that write needs to be synchronous… I think it does, because the user needs the id
back."*

⭐ **You are allowed to think. You are not allowed to do it invisibly.**

⚠️ **Recordings expose this brutally** — ⭐ **note the timestamps of every silence in your self-review.** It's
usually the single biggest gap between how well you thought and how well you scored.

### ⭐ 2 · State assumptions and move on

⚠️ **Waiting for permission burns your clock and reads as hesitancy.**

| ⚠️ | *"Should I assume 10 million users? …or would you prefer a different number? …should I go higher?"* |
| ⭐ | *"I'll assume 10 million DAU — **stop me if that's the wrong order of magnitude.**"* |

⭐ **State it, flag it as an assumption, keep moving.** The interviewer will correct you if it matters; they
usually don't, because the number rarely matters as much as your reasoning about it.

### ⭐ 3 · Every choice gets a "because"

> ⭐ ***"Cassandra BECAUSE write-heavy, time-series access, and we can tolerate eventual consistency here."***

⭐ **This is the single highest-leverage verbal habit in the whole round**, because it converts every
technology you name from a buzzword into a judgement.

⭐ **The full four-part form, which takes four seconds:**

> **the choice → because → what it costs → when you'd revisit**

⚠️ **A technology named without a because is worse than not naming it** — it invites *"why?"*, and now
you're answering defensively instead of leading.

### ⭐ 4 · Volunteer tradeoffs

> ⭐ ***"This gives us availability at the cost of read-your-writes — I'd fix that by pinning a user's reads
> to the primary for 5 seconds after a write."***

⭐ **Notice the shape: name the cost, then name the mitigation.** Volunteering the cost shows you understand
the decision; having a mitigation ready shows you've been here before.

⭐ **Every design has tradeoffs. If you present one with none, you are either hiding them or haven't seen
them** — and the interviewer will assume the latter.

### ⭐ 5 · Commit

⚠️ **"It depends" without ever landing the plane is on the roadmap's failure list.**

⭐ **"It depends" is a fine SENTENCE OPENER and a terrible ANSWER.** The full form:

> *"It depends on whether we need read-your-writes. ⭐ **Assuming we do — and for a booking flow I think we
> do — I'd go with the primary-read pin. So: primary reads for 5 seconds post-write.**"*

⭐ **Name the axis, pick a side, say why.** Every gate in this repo has asked you to commit for exactly this
reason.

### ⭐ 6 · Manage the clock out loud

⭐ **Depth on everything is impossible. Choosing is the skill; SAYING you're choosing is the signal:**

> *"There's a lot in the media pipeline, but I think the interesting problem is the hot-key fan-out, so I'll
> go deep there and keep transcoding at the level of a box. **Let me know if you'd rather see it the other
> way round.**"*

⭐ **This does three things at once** — shows judgement, manages the clock, and hands the interviewer a
chance to redirect.

### ⭐ 7 · Numbers on the diagram

**QPS on arrows, size on datastores.** ⭐ **It keeps your estimates alive instead of stranded on a corner of
the board**, makes your reasoning visible without narration, and it's what lets you say *"this arrow is
6,000/sec, which is why there's a cache in front of it."*

### ⭐ 8 · Handle the interviewer's interruptions well

| They | Do |
|---|---|
| **Ask a question** | ⭐ **answer THAT question first**, then return. ⚠️ *"Answered a question you weren't asked" is a real failure mode* |
| **Redirect you** | ⭐ **go where they're steering** — they're telling you what they want to assess |
| **Go quiet** | ⭐ **drive, and check in at beat boundaries** — *"does that scoping sound right before I move on?"* |
| **Push back** | ⭐ **engage on the merits** ([09](09-handling-pressure.md)) |

⚠️ **Never keep marching through your framework while they're trying to steer.** ⭐ **Following the
interviewer beats following the framework, every time.**

### ⭐ The meta-skill: sound like a colleague, not a candidate

⭐ **The target register is a design discussion with a peer**, not a viva. *"What are we actually optimising
for?"*, *"I'd want to measure that before committing"*, *"the honest answer is this is over-engineered for
10 K users"* — ⭐ **these all read as someone who has actually shipped systems**, which is what's being
assessed.

---

## In your own words

**⭐ Why does silence hurt so much, and what do you say instead of taking a silent pause?**

>

**⭐ Rewrite a hesitant assumption as a confident one.**

>

**⭐ State the four-part "because" form, and use it on a real choice.**

>

**⭐ Give a volunteered tradeoff with its mitigation, in the standard shape.**

>

**⭐ Turn "it depends" into a committed answer, out loud.**

>

**⭐ Say the clock-management sentence. What three things does it do?**

>

**Why put numbers on the diagram?**

>

**⭐ What do you do when the interviewer redirects you? Why does that beat your framework?**

>

**⭐ What's the target register, and what makes someone sound like a colleague?**

>

---

## Links

- ⭐ **Score yourself on these** → [`../lab/SELF-REVIEW.md`](../lab/SELF-REVIEW.md) section C
- Pressure, pushback, "I don't know" → [09-handling-pressure.md](09-handling-pressure.md)
- ⚠️ The anti-patterns → [10-failure-patterns.md](10-failure-patterns.md)
- Narrating the paths → [05-high-level-architecture.md](05-high-level-architecture.md)
- Volunteering failure modes → [07-bottlenecks-and-failure.md](07-bottlenecks-and-failure.md)
