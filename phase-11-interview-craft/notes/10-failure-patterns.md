# 11·10 · The Failure Patterns

> **Why this exists:** ⭐ **these are the roadmap's own list, and every one is self-inflicted.** Avoiding them
> costs nothing — no extra knowledge, no extra preparation. ⭐ **Which makes this the cheapest points in the
> entire roadmap.**

---

## Reference

### ⭐ 1 · Jumping to architecture before requirements — *the #1 killer*

⚠️ **The most common failure, and the most avoidable.** *"Design Twitter"* → you draw a load balancer.

⭐ **Why it's fatal beyond the missed beat:** every later decision is unanchored. You can't justify a
component when nobody agreed what the system does, ⭐ **and it signals a memorised answer** — which is exactly
what the round is screening for.

⭐ **Fix: 5–8 minutes, every time, no exceptions** ([02](02-requirements-and-scope.md)).

### ⭐ 2 · Buzzword soup — *"Kafka in a design that needs a cron job"*

⚠️ **Naming technologies without justification.** ⭐ **The roadmap's own example is the perfect one**: a
nightly batch job does not need a distributed streaming platform, and proposing one shows you're pattern-
matching on "sounds senior" rather than reasoning.

⭐ **Fix: every technology gets a "because", plus what it costs** ([08](08-communication-skills.md)). ⭐ **And
know what's inside the box you're naming** — *"we'd use Kafka"* without partitions, consumer groups and
delivery semantics is worse than not mentioning it.

### ⭐ 3 · Designing for 1 B users when told 10 K

⚠️ **Over-engineering is a failure mode, not enthusiasm.** Global multi-region active-active for an internal
tool reads as someone who can't calibrate.

⭐ **Fix: let the capacity estimate drive the design, and be willing to say "this fits on one box."**
⭐ **The strong version:** *"at 10 K users this is one Postgres instance and a load balancer. I'd add a cache
when we measure a read problem, not before."* ⭐ **That answer scores well** — restraint is a senior signal.

### ⭐ 4 · Ignoring the failure path

⚠️ **The single biggest differentiator, skipped.** ⭐ **Two separate phases of this roadmap call it the most
reliable discriminator there is** ([07](07-bottlenecks-and-failure.md), [Phase 7](../../phase-07-reliability/notes/)).

⭐ **Fix: reserve the last 5–10 minutes and VOLUNTEER it.** If you're running out of time, ⭐ **cut the deep
dive short rather than the failure walk.**

### ⭐ 5 · Never mentioning cost or operational burden

⚠️ **Almost nobody does this, which is exactly why it lands.** *"Egress is the dominant cost line here, not
compute"* · *"this is three more services for the team to be on call for"* · *"a mesh means someone now owns
the control plane."*

⭐ **Fix: one sentence in beat 7. That's the whole fix, and it's one of the strongest single sentences
available to you** ([Phase 8 note 14](../../phase-08-architecture/notes/14-build-vs-buy.md)).

### ⭐ 6 · Going silent while thinking

⚠️ **Silence reads as stuck.** ⭐ **The interviewer cannot see your thinking, and they are scoring what they
can observe.**

⭐ **Fix: narrate the pause** — *"let me think about whether that has to be synchronous…"*. ⭐ **Recordings
expose this brutally; note the timestamps** ([`SELF-REVIEW.md`](../lab/SELF-REVIEW.md)).

### ⭐ 7 · No shard key · no consistency story · no auth story

⚠️ **Three specific omissions the roadmap calls out by name**, because each is a *known* checkbox that
candidates simply forget.

⭐ **Fix: they're checklist items, not knowledge gaps.**

| | Say, even when the answer is "we don't need it" |
|---|---|
| ⭐ **Shard key** | *"one primary handles this; I'd shard by tenant_id when we outgrow it, and here's the cost"* |
| ⭐ **Consistency** | *"eventual is fine for the feed; the booking itself needs a real transaction"* |
| ⭐ **Auth** | the 3-minute story from [Phase 10](../../phase-10-security/notes/01-authn-vs-authz.md) |

### ⭐ 8 · Refusing to commit

⚠️ **"It depends" without ever landing the plane.** ⭐ **A fine sentence opener, a fatal answer.**

⭐ **Fix: name the axis, pick a side, say why, name the condition that would change it.** ⭐ **Every gate in
this repo has drilled exactly this** ([09](09-handling-pressure.md)).

### ⭐ 9 · Whiteboard chaos

⚠️ **Ran out of room, illegible, jumped around, erased the thing you needed.**

⭐ **Fix: start top-left, draw left to right, leave room for the deep dive, annotate rather than erase.**
⭐ **And practise with Excalidraw before the day** — fumbling the tool costs real minutes
([05](05-high-level-architecture.md)).

### ⭐ 10 · Answering a question you weren't asked

⚠️ **They ask about the cache eviction policy; you deliver three minutes on sharding.** ⭐ **Reads as not
listening, and it burns the clock.**

⭐ **Fix: answer THAT question, briefly, then return to where you were.** ⭐ **Following the interviewer beats
following your framework, every time.**

---

## ⭐ The pre-flight check

**Read this list once before any real round. In practice, these ten are worth more than any additional
technical topic** — because they cost nothing to fix and they are what actually sinks otherwise-good
candidates.

| ⭐ Before you draw a single box | |
|---|---|
| Have I scoped it? | |
| Have I written the scope down? | |

| ⭐ Before you finish | |
|---|---|
| Shard key with a reason? | |
| Consistency story? | |
| Auth story? | |
| Failure modes, volunteered? | |
| Cost mentioned? | |
| Top 2 tradeoffs named? | |
| Did I commit? | |

---

## In your own words

**⭐ Name all ten from memory.**

>

**⭐ Why is jumping to architecture fatal beyond just missing a beat?**

>

**⭐ Why is over-engineering a failure? What's the strong answer at 10 K users?**

>

**⭐ If you're running out of time, what do you cut — and what do you protect?**

>

**⭐ Which three specific omissions does the roadmap name, and what do you say when the answer is "we don't need it"?**

>

**Why is "it depends" a fine opener and a fatal answer?**

>

**⭐ Which of these ten do YOU actually do? Be honest — check your last recording.**

>

**⭐ Recite the pre-flight check.**

>

---

## Links

- ⭐ **Score yourself** → [`../lab/SELF-REVIEW.md`](../lab/SELF-REVIEW.md) section D
- The beats → [01-the-framework.md](01-the-framework.md)
- Requirements → [02-requirements-and-scope.md](02-requirements-and-scope.md)
- ⭐ Failure modes → [07-bottlenecks-and-failure.md](07-bottlenecks-and-failure.md)
- Communication → [08-communication-skills.md](08-communication-skills.md)
- Committing under pressure → [09-handling-pressure.md](09-handling-pressure.md)
