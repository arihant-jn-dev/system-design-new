# Phase 11 — Gate

> ⭐ **This gate is different from every other one in this repo.**
>
> Every previous gate asked you to *say things from memory*. ⭐ **This one is a PERFORMANCE, scored from a
> recording** — because the skill being tested is delivery, and delivery cannot be assessed by recall.
>
> ⚠️ **You cannot pass this gate by reading. You pass it by recording.**

---

## Q1 · A scored 45-minute design — the gate itself

**Pick a problem you have NOT practised. Record it. Score it with
[`lab/SELF-REVIEW.md`](lab/SELF-REVIEW.md).**

```bash
node lab/drill.js --list      # pick something you haven't done
node lab/drill.js "Design X"
```

### ⭐ The pass bar

- [ ] ⭐ **Total ≥ 55 / 78**
- [ ] ⭐ **You reached the failure-modes beat by 38:00, UNPROMPTED**
- [ ] ⭐ **Zero of these three penalties**: jumped to architecture before requirements · no shard key · refused to commit
- [ ] ⭐ **No silence longer than ~10 seconds**
- [ ] You wrapped inside 45 minutes

**Score:** ____ / 78 · **Failure beat started at:** ______ · **Longest silence:** ______

⚠️ **If you scored yourself above 70 on a first attempt, re-watch it more critically.** ⭐ **A generous score
wastes the exercise** — the point is to find the gap, not to pass.

---

## Q2 · The framework, from memory

- [ ] ⭐ **All eight beats, in order, with their time budgets**
- [ ] ⭐ **Why the order is the order** — what each beat gives the next
- [ ] Which three beats actually differentiate, and why
- [ ] ⭐ **How you adapt when the interviewer redirects you** — and why that beats your framework
- [ ] Three scripted transitions, rewritten as natural ones
- [ ] ⭐ **Which transitions you SHOULD narrate** (clock choices) vs which you shouldn't (beat numbers)

**Self-score:** ___ / 6

---

## Q3 · The ten failure patterns

- [ ] ⭐ **Name all ten**
- [ ] ⭐ **Why is jumping to architecture fatal beyond the missed beat?**
- [ ] ⭐ **Why is over-engineering a failure, and what's the strong answer at 10 K users?**
- [ ] ⭐ **The three named omissions** — shard key, consistency story, auth story — and what you say when the answer is "we don't need it"
- [ ] ⭐ **If you're running out of time, what do you cut and what do you protect?**
- [ ] Why is "it depends" a fine opener and a fatal answer?
- [ ] ⭐ **Which of the ten do YOU actually do?** *(Check the recording — don't guess)*
- [ ] The pre-flight check, recited

**Self-score:** ___ / 8

---

## Q4 · Delivery under pressure

**Have someone push back on a design decision, or do it to yourself on video.**

- [ ] ⭐ **Why do BOTH folding and digging in score badly?**
- [ ] ⭐ **A pushback response in the acknowledge → engage → hold-or-update shape**
- [ ] ⭐ **When is changing your mind a strength, and when a weakness?**
- [ ] ⭐ **The three-part "I don't know" answer — and which part scores**
- [ ] ⭐ **"What if 10×?" — name what breaks FIRST and SECOND, with numbers**
- [ ] ⭐ **"What if only 1,000 users?" — the answer is to REMOVE components**
- [ ] What you do when stuck, and why narrating it is better

**Self-score:** ___ / 7

---

## Extra checks

- [ ] ⭐ **The explicit-deferral sentence** — and the four things it does at once
- [ ] ⭐ **What do you do when they say "you tell me" about scale?**
- [ ] 1 M/day, 100 M/day, 1 B/day → per second, from memory
- [ ] ⭐ **Memory vs SSD vs cross-continent round trip — and what each justifies**
- [ ] Rough QPS: a server, Postgres, Redis, a WebSocket node
- [ ] ⭐ **Five places you'd cash in your capacity numbers later**
- [ ] ⭐ **Why do access patterns come before the datastore choice?**
- [ ] ⭐ **A datastore choice in the four-part form: choice → because → cost → when you'd revisit**
- [ ] ⭐ **All four parts of the shard-key checklist**
- [ ] ⭐ **Narrate a write path and a read path, out loud, 60 seconds each**
- [ ] ⭐ **The actually-hard part of four classic problems**
- [ ] ⭐ **Why offering a deep dive beats waiting** — and the two tests for a good candidate
- [ ] ⭐ **"Box" vs "mechanism" for the same component**
- [ ] ⭐ **Three measured numbers from your own labs you could cite**
- [ ] ⭐ **The systematic failure walk** — every box, every arrow
- [ ] ⭐ **Why "slow" is worse than "down"** — cite the 6.41 s p99
- [ ] ⭐ **The cold-cache outage in one sentence**, with its numbers
- [ ] ⭐ **Why mentioning cost is a senior marker**
- [ ] ⭐ **"A failure injection that shows no problem usually means the injection didn't work"** — and the story
- [ ] ⭐ **The four-part "because" form**, used on a real choice
- [ ] ⭐ **A volunteered tradeoff with its mitigation**
- [ ] ⭐ **The clock-management sentence, and the three things it does**
- [ ] Why put numbers on the diagram?
- [ ] ⭐ **The four steps of the practice loop, and why step 4 compounds**
- [ ] ⭐ **Why must you attempt a problem before reading any write-up?**

---

## Scoring

| Result | Do this |
|---|---|
| Q1 ≥ 55 with no fatal penalty, Q2–Q4 passed | ✅ ⭐ **Advance to Phase 12 — and Phase 12 is the whole game now** |
| Q1 40–54 | ⭐ **The beats are landing; content depth is the gap.** Record again in 3 days |
| Q1 < 40 | ⭐ **Structure isn't there yet. Re-run the SAME problem tomorrow with the timer** |
| Reached failure modes late or not at all | ⛔ ⭐ **Redo [notes/07](notes/07-bottlenecks-and-failure.md), then record again — protecting that beat is the fix** |

---

## ⭐ Before Phase 12 — read this honestly

⭐ **You have finished the knowledge phases. All of them.** Twelve phases, with real measurements: a 1.00%
bloom-filter false-positive rate, 3,506× on an autocomplete precompute, 71% of acknowledged commits lost on
a failover, 271 requests failing from nothing but an empty cache, retries making an outage worse, 150,400×
on password hashing.

⭐ **None of that scores a point until it comes out of your mouth in 45 minutes.**

- [ ] ⭐ **PHASE 12 IS NOW THE ONLY THING THAT MATTERS.** The roadmap wanted it started in Week 6 and running
      in parallel. It has been flagged at every gate since Phase 5.
- [ ] ⭐ **Target 3 problems/week, Tier 1 first.** Ten done properly beats thirty rushed — and zero beats
      nothing, which is where *"I'll practise after I finish the notes"* always ends.
- [ ] ⭐ **Do step 4 of the loop every single time** — list the building blocks. ⭐ **That's what turns 30
      designs into 16 composable components, and it's the difference between memorising answers and being
      able to handle a question you've never seen.**
- [ ] ⭐ **Re-do a problem cold two weeks later.** More valuable than a new one — it tests retention, not
      recognition.
- [ ] ⭐ **Book a real mock with a human for the last few.** A person interrupts and redirects in ways you
      cannot simulate alone.

---

## Gate log

| Attempt | Date | Problem | Q1 /78 | Failure beat at | Longest silence | Q2 | Q3 | Q4 |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | /6 | /8 | /7 |
| 2 | | | | | | /6 | /8 | /7 |
