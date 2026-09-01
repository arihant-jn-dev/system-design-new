# 11·09 · Handling Pressure — Disagreement, "I Don't Know", and 10×

> **Why this exists:** these three moments are where rounds are actually decided, because ⭐ **they're the
> only parts you can't rehearse into a script — so they show what you're actually like to work with.**

---

## Reference

### ⭐ 1 · Disagree well

> ⭐ **The roadmap: "if the interviewer pushes a worse option, engage with the merits, don't fold instantly
> and don't dig in. BOTH EXTREMES SCORE BADLY."**

**Why both fail:**

| | |
|---|---|
| ⚠️ **Folding instantly** | ⭐ **reads as having no conviction — or worse, as never having had a reason.** If you abandon a choice the moment it's questioned, the interviewer concludes you were guessing |
| ⚠️ **Digging in** | reads as someone who'll be difficult in a design review. ⭐ **They are, in part, simulating working with you** |

⭐ **The shape that works — acknowledge, engage, then either update or hold with a reason:**

> *"That's a fair point — a relational store would give us transactions across those entities, which I'd
> genuinely want here. ⭐ **My concern is the write volume: at 50 K writes/sec a single primary is past
> comfortable, which is why I leaned to Cassandra.** ⭐ **Though if the consistency requirement is firm, I'd
> take the relational store and shard it rather than give up transactions** — is consistency the harder
> constraint here?"*

⭐ **That answer holds a position, shows the reasoning, offers a genuine alternative, and asks the question
that resolves it.** It's also just how a good design review sounds.

⭐ **And genuinely update when they're right:** *"Ah — you're right, I was assuming reads dominate and that's
not given. That changes it: I'd go with X."* ⭐ **Visibly changing your mind for a stated reason is a
STRENGTH, not a loss.** ⚠️ **What's weak is changing it for no reason.**

⭐ **Sometimes the pushback is a test of whether you'll cave.** Both a wrong suggestion and a correct one get
probed the same way — so respond to the *merits*, never to the *pressure*.

### ⭐ 2 · When you don't know

> ⭐ **The roadmap: "I haven't worked with X directly. My mental model is Y — is that roughly right?"
> Honest + reasoning-forward beats bluffing, WHICH IS ALWAYS DETECTED.**

⭐ **Bluffing fails for a structural reason: the interviewer knows the topic, and the follow-up question you
can't answer costs you far more than the admission would have.** ⚠️ **And it poisons everything else you
said** — once they catch one bluff, every confident statement becomes suspect.

⭐ **The good version has three parts:**

1. ⭐ **Name the boundary** — *"I haven't used Spanner in production."*
2. ⭐ **Reason from what you DO know** — *"but my model is that it's TrueTime plus Paxos, so you're paying a commit-wait for external consistency — call it a few milliseconds per write."*
3. ⭐ **Check** — *"is that roughly right?"*

⭐ **Step 2 is the one that scores.** ⚠️ **"I don't know" and stopping is a dead end; "I don't know, but here's
how I'd reason about it" is nearly as good as knowing** — because reasoning from principles is the thing
actually being tested.

⭐ **You can also just say how you'd find out:** *"I'd benchmark it before committing — I wouldn't want to
design around a number I'd guessed."* ⭐ **That's a real engineer's answer, and it's true.**

### ⭐ 3 · "What if 10×? What if 100×?"

⭐ **The question is not "can you scale?" — it's "do you know which component breaks FIRST?"**

⚠️ **The weak answer:** *"we'd add more servers and shard the database."*

⭐ **The strong answer names the order, with reasons and numbers:**

> *"At 10×: the app tier is stateless so it just scales out. ⭐ **The write path breaks first** — we're at
> ~3 K writes/sec and a single Postgres node tops out around 5 K, so 10× means sharding by tenant_id,
> because every query is already tenant-scoped. ⭐ **Second to break would be the fan-out workers** — that's
> a queue-depth problem I'd see coming in the lag metric.
>
> At 100×: ⭐ **the design changes shape rather than scales.** I'd move the timeline to a hybrid fan-out,
> add regional deployments — and at that point cost becomes a design constraint in its own right."*

⭐ **The move: identify the bottleneck, say why it's the bottleneck, say what you'd do, and say what breaks
next.** ⭐ **And note when the answer is "the design changes" rather than "add more"** — that's the honest and
more senior answer at large multiples.

⭐ **The converse question is a trap worth spotting:** *"what if it's only 1,000 users?"* — ⭐ **the right
answer is to REMOVE components.** *"Then this is one Postgres box and a load balancer, and I'd delete the
queue, the cache and the read replicas until something actually hurts."* ⚠️ **Refusing to simplify is
over-engineering, which is a failure mode.**

### ⭐ 4 · When you get stuck

**It happens. What matters is what it looks like.**

⭐ **Say where you are** — *"I'm trying to work out whether this needs to be transactional, and I can see
arguments both ways."* ⭐ **Narrating being stuck is dramatically better than silently being stuck**, and it
often prompts a useful hint.

⭐ **Then use a reduction:** simplify to one user / one machine and build up · ask what breaks if you do the
dumbest thing · reach for a building block you know ([Phase 9](../../phase-09-building-blocks/notes/)) ·
⭐ **say the constraint out loud** — *"the hard part is that these two things must be atomic and they're in
different services"* — ⚠️ *which usually names the answer for you (a saga, or a boundary that's in the wrong
place)*.

### ⭐ 5 · The register

⭐ **They are assessing what it's like to work with you**, not just what you know.

⭐ **Confident but not arrogant · decisive but not rigid · honest about limits · curious about their
constraints.** ⭐ **"That's a good question, I hadn't considered it" is a completely fine thing to say** —
it's what a senior engineer says in a real design review, and the target register is a design discussion
with a peer, not a viva.

---

## In your own words

**⭐ Why do BOTH folding and digging in score badly?**

>

**⭐ Give a pushback response in the acknowledge → engage → hold-or-update shape, out loud.**

>

**⭐ When is changing your mind a strength, and when is it a weakness?**

>

**⭐ Why does bluffing fail structurally, and what does it poison?**

>

**⭐ State the three-part "I don't know" answer. Which part scores?**

>

**⭐ Answer "what if 10×?" for a design you know — naming what breaks first AND second.**

>

**⭐ What's the right answer to "what if it's only 1,000 users?"**

>

**What do you do when you get stuck, and why is narrating it better?**

>

**⭐ What are they actually assessing in these moments?**

>

---

## Links

- Communication habits → [08-communication-skills.md](08-communication-skills.md)
- ⚠️ Refusing to commit, over-engineering → [10-failure-patterns.md](10-failure-patterns.md)
- What breaks first → [07-bottlenecks-and-failure.md](07-bottlenecks-and-failure.md)
- Building blocks to reach for when stuck → [Phase 9](../../phase-09-building-blocks/notes/)
- ⭐ Every gate in this repo asked you to commit → [Phase 8 GATE](../../phase-08-architecture/GATE.md)
