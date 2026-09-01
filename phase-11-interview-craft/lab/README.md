# Phase 11 Lab

The roadmap's lab, verbatim:

> ⭐ *"Record yourself doing a 45-minute design out loud, alone. Watch it back. **It will be unpleasant and
> it is the fastest improvement you will get from any single hour in this roadmap.** Repeat every two
> weeks."*

⭐ **That's the whole lab.** These three files exist to remove every excuse not to do it.

---

## The three tools

| | | |
|---|---|---|
| ⭐ [`drill.js`](drill.js) | **A 45-minute beat timer.** Calls the beats at you with time remaining, warns a minute before each ends, and dumps eight review questions at the end | `node drill.js` |
| ⭐ [`SELF-REVIEW.md`](SELF-REVIEW.md) | **A 78-point rubric** for scoring the recording — content, delivery, and the failure patterns as penalties | open while watching back |
| ⭐ [`SESSION-TEMPLATE.md`](SESSION-TEMPLATE.md) | **The one-page summary** — step 3 of the Phase 12 loop, including the building-blocks checklist that makes practice compound | copy per problem |

```bash
node drill.js                       # 45 min, a problem picked for you
node drill.js "Design Ticketmaster" # 45 min, your problem
node drill.js --list                # the 25-problem bank
node drill.js --speed 60            # ~45 seconds, to see the shape before committing
```

---

## ⭐ The protocol

**Total: ~90 minutes. Do it today, not tomorrow.**

| | |
|---|---|
| **0 · Set up (2 min)** | Phone recording video *and audio*, pointed at your whiteboard — or screen-record Excalidraw. ⭐ **Audio matters more than video: most of what you're diagnosing is what you SAY** |
| **1 · Design (45 min)** | `node drill.js` in a terminal beside you. ⭐ **Out loud. Nothing looked up. Do not pause the recording** |
| **2 · Answer the eight questions (5 min)** | ⭐ **From memory, BEFORE watching.** The gap between what you remember doing and what you actually did is itself the finding |
| **3 · Watch it back (45 min)** | With [`SELF-REVIEW.md`](SELF-REVIEW.md) open. ⭐ **Score honestly — a generous score wastes the hour** |
| **4 · One fix (2 min)** | ⭐ **Write down exactly ONE thing to change next session.** Not five |

⭐ **Repeat every two weeks.** Log it in the table at the bottom of the rubric — ⭐ **the trend matters far
more than any single score.**

---

## ⭐ What the timer is for

The hardest part of a solo session isn't the design — ⭐ **it's keeping to the beats.** Almost everyone
spends 20 minutes on architecture and then discovers they never did capacity, never named a shard key, and
never reached failure modes.

```
00:00  REQUIREMENTS & SCOPE               7 min
07:00  CAPACITY ESTIMATION                4 min
11:00  API DESIGN                         4 min
15:00  DATA MODEL                         5 min     ⭐ seniors judged hard here
20:00  HIGH-LEVEL ARCHITECTURE           10 min
30:00  DEEP DIVE                          8 min
38:00  BOTTLENECKS, FAILURES & SCALE-UP   5 min     ⭐ the differentiator
43:00  WRAP                               2 min
```

⭐ **After a handful of sessions the pacing becomes internal and you can stop using it — which is the
point.**

---

## ⭐ The eight questions it asks at the end

Answer these **from memory, before watching**:

1. Did you write the scope down and refer back to it?
2. ⭐ **Did you USE your capacity numbers later, or were they theatre?**
3. Did you name a shard key **and** a reason?
4. ⭐ **Did you walk a write path and a read path out loud?**
5. ⭐ **Did you VOLUNTEER failure modes, or wait?**
6. Did you give a "because" for every technology you named?
7. ⭐ **Did you go silent at any point? When?**
8. Did you commit to a recommendation, or hedge?

⭐ **Then watch, and find out how many of your answers were wrong.** That delta is the most useful thing the
exercise produces.

---

## ⭐ What to expect the first time

**It will be worse than you think, in predictable ways.** Nearly everyone's first recording shows:

- ⚠️ **Long silences** you had no idea you were taking
- ⚠️ **Requirements rushed** in 90 seconds because it felt like a preamble
- ⚠️ **Capacity numbers computed and never used again**
- ⚠️ **The architecture beat eating 20 minutes**
- ⚠️ **Failure modes never reached**
- ⚠️ **"…so basically…"** or a filler tic you repeat 40 times
- ⚠️ **A diagram that ran out of room**

⭐ **None of this means you don't know the material. It means delivery is a separate skill — which is exactly
why this phase exists, and why one hour of it moves you more than another phase of reading.**

---

## Session log

| # | Date | Problem | Score /78 | ⭐ The one fix |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |

⭐ **Fuller scoring lives in [`SELF-REVIEW.md`](SELF-REVIEW.md).** This table is the at-a-glance trend.
