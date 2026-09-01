# 11·02 · Beat 1 — Requirements & Scope

**5–8 minutes. ⭐ Never skip. Never rush.**

> **Why this exists:** ⭐ **jumping to architecture before requirements is the #1 killer**, and it is
> entirely self-inflicted. This beat is free points, and skipping it makes every later beat weaker.

---

## Reference

### ⭐ Why it matters more than it looks

⭐ **A design is only "good" relative to requirements.** Without them, the interviewer cannot judge your
design and neither can you — so every subsequent decision is unanchored.

**And it signals the thing being assessed:** ⭐ **a senior engineer's first instinct on a vague brief is to
scope it, not to start building.** ⚠️ **Starting to draw immediately reads as "I have a memorised answer",
which is precisely what they're screening for.**

### The four questions

| | Ask | Why |
|---|---|---|
| **1 · Functional** | ⭐ **Get 3–5 CORE features** | more than 5 and you can't design any of them in 45 min |
| **2 · Scale** | DAU/MAU · QPS · read:write ratio · data size · growth | ⭐ **determines whether this is a 1-box or a 100-box problem** |
| **3 · Non-functional** | latency target · availability target · ⭐ **consistency requirement** · durability | ⭐ **the consistency answer drives your datastore and your whole write path** |
| **4 · Constraints** | mobile? global? regulatory? existing stack? team size? | ⭐ **each of these can invalidate an otherwise-correct design** |

### ⭐ Explicitly defer — the move most people miss

> ⭐ ***"I'll leave analytics out of scope unless you'd like it — say the word."***

**This does four things at once:**

| | |
|---|---|
| ⭐ **Shows you SAW it** | you're not ignorant of it, you're prioritising |
| ⭐ **Hands the interviewer control** | they can pull it back in if it's what they wanted |
| ⭐ **Protects your clock** | you've pre-agreed not to spend time there |
| **Demonstrates prioritisation** | which is the actual senior skill |

⭐ **Defer explicitly, don't just omit.** Silence on a feature looks like you missed it; ⭐ **naming it and
setting it aside looks like judgement.**

### ⭐ Write the scope down and refer back

**In a corner of the board. Boxed. Left there all session.**

⭐ **It anchors the conversation and stops scope creep** — yours and theirs. When you're 30 minutes in and
tempted to design the recommendation engine, the box says you agreed not to.

⭐ **And REFER BACK TO IT out loud, at least twice**: *"coming back to the scope — we said 10 K writes/sec and
strong consistency on the booking, so…"* ⭐ **That's what converts it from decoration into a tool**, and it's
the specific thing the self-review rubric checks.

### ⭐ When the interviewer won't give you numbers

**Very often they'll say *"you tell me"* — that's a test, not an obstacle.**

⭐ **Propose, don't ask again:**

> *"Let's say 10 million DAU, each opening the app 5 times a day — call it 50 million sessions, ~600
> requests/sec average, and I'll assume a 5× peak so ~3,000/sec. Read-heavy, maybe 100:1. **Does that sound
> like the right order of magnitude, or should I be designing for something bigger?**"*

⭐ **State an assumption and move on. Waiting for permission burns your clock and reads as hesitancy** —
[08](08-communication-skills.md).

### ⚠️ The traps

⚠️ **Asking 20 questions** — this is scoping, not an interrogation. ⭐ **4–6 good questions, then propose.**
⚠️ **Accepting "design Twitter" at face value** — ⭐ *which Twitter? the feed? DMs? search? trends? all of it
is a week of work.* **Narrow it explicitly.**
⚠️ **Designing for 1 B users when told 10 K** — ⭐ **over-engineering is a failure mode, not enthusiasm.** If
the scale is small, ⭐ **say so and design accordingly**: *"at 10 K users this fits on one Postgres box, and
I'd want a very good reason to add anything else."* **That answer scores well.**
⚠️ **Forgetting the consistency question** — it's the one non-functional that most changes the design.
⚠️ **Spending 12 minutes here** — ⭐ **it's 5–8, and the clock is unforgiving.**

### The output

**Before you move on, you should be able to say in one breath:**

> *"So: N core features, roughly X QPS peak, Y:1 read-heavy, Z TB in year one, p99 under 200 ms, high
> availability, eventual consistency acceptable except on the booking itself. **Anything I've got wrong
> before I go further?**"*

⭐ **That sentence is the deliverable of beat 1.** If you can't say it, you're not ready for beat 2.

---

## In your own words

**⭐ Why is a design only "good" relative to requirements? What does skipping this signal?**

>

**Name the four question categories, and which non-functional matters most.**

>

**⭐ Say the explicit-deferral sentence. What four things does it do at once?**

>

**⭐ Why write the scope down, and what makes it a tool rather than decoration?**

>

**⭐ What do you do when they say "you tell me"? Say it out loud for a design you know.**

>

**⭐ Why is designing for 1 B users when told 10 K a failure? What's the good answer?**

>

**Name four traps in this beat.**

>

**⭐ Deliver the one-breath summary that closes this beat.**

>

---

## Links

- ⭐ **Run it** → [`../lab/drill.js`](../lab/drill.js)
- The beats in order → [01-the-framework.md](01-the-framework.md)
- Turning scale into numbers → [03-capacity-estimation.md](03-capacity-estimation.md)
- Stating assumptions and moving on → [08-communication-skills.md](08-communication-skills.md)
- ⚠️ The anti-patterns → [10-failure-patterns.md](10-failure-patterns.md)
- Consistency requirements → [Phase 4](../../phase-04-distributed-systems/notes/)
