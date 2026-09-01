# System Design — Working Repo

This is the working repo for [ROADMAP.md](ROADMAP.md) (16 weeks, senior level).
The roadmap is the *plan*. This repo is the *work*.

---

## How this repo is organised

One folder per phase. Every phase folder has the same four things, in the order you use them:

```
phase-NN-name/
├── README.md    ← start here: what this phase is, why it exists, how to work it
├── notes/       ← one file per topic. Reference half is filled in; you write the other half.
├── drills/      ← repetition until it's reflex (only where the phase needs it)
├── lab/         ← runnable code. This is the part that makes you able to answer "and what happens when that fails?"
└── GATE.md      ← the exit exam. Answer out loud, from memory. Don't advance until you pass.
```

### The note format, and why

Each note in `notes/` has two halves:

| Half | Who fills it | Why |
|---|---|---|
| **Reference** | Pre-filled | Latency numbers, nines tables, formulas. Pure lookup. Nothing is learned by rediscovering that a day has 86,400 seconds. |
| **In your own words** | **You. Blank on purpose.** | Roadmap rule #3: *"Writing forces the gaps into the open."* If you read a pre-written explanation and nod, you have learned nothing and you will find out during a mock. |

Reading the Reference half feels like progress. It isn't. The blank half is the phase.

---

## Running the labs

Every phase has a `lab/` you actually run. **[DOCKER-GUIDE.md](DOCKER-GUIDE.md)** explains the Docker
concepts once — the mental model, the keys you'll see, the three gotchas that will otherwise cost you an
hour, the command cheat-sheet, and a port map so no two labs collide.

Each `docker-compose.yml` then opens with a header explaining **what that lab builds, what you learn from it,
and the exact commands in order.**

---

## Progress tracker

Tick a phase only when its **GATE.md is passed out loud, from memory, without notes.**

| # | Phase | Week | Status | Gate passed |
|---|---|---|---|---|
| 0 | [Foundations & Vocabulary](phase-00-foundations/) | 1 | 🟡 In progress | ☐ |
| 1 | [Networking & Communication](phase-01-networking/) | 2 | 🟡 In progress | ☐ |
| 2 | [Scaling the Stateless Tier](phase-02-stateless-scaling/) | 3 | 🟡 In progress | ☐ |
| 3 | [Databases](phase-03-databases/) | 4–6 | 🟡 In progress (all 6 parts built) | ☐ |
| 4 | [Distributed Systems Theory](phase-04-distributed-systems/) | 7 | 🟡 In progress | ☐ |
| 5 | [Caching](phase-05-caching/) | 8 | 🟡 In progress | ☐ |
| 6 | [Async, Messaging & Streaming](phase-06-messaging/) | 9–10 | 🟡 In progress | ☐ |
| 7 | [Reliability, Resilience & Observability](phase-07-reliability/) | 11 | 🟡 In progress | ☐ |
| 8 | [Architecture Patterns](phase-08-architecture/) | 12 | 🟡 In progress | ☐ |
| 9 | [Reusable Building Blocks](phase-09-building-blocks/) | 13 | 🟡 In progress | ☐ |
| 10 | [Security, Privacy & Compliance](phase-10-security/) | 14a | 🟡 In progress | ☐ |
| 11 | [Interview Craft](phase-11-interview-craft/) | 14b | 🟡 In progress | ☐ |
| 12 | Practice problems (starts Week 6, runs to end) | 6–16 | ⬜ Not started | n/a |

**Do not skip a gate.** Per the roadmap: skipping gates is how people end up "knowing" 40 topics and failing every round.

---

## The three rules (from the roadmap, repeated because they're the whole thing)

1. **Never learn a topic without building or breaking something.** Every phase has a lab. A 45-minute Docker experiment beats 5 hours of video.
2. **Never learn a topic without a "why does this exist" answer.** Every technology is a response to a specific failure. If you can't state the problem, you've memorised a name, not a tool.
3. **Start mock interviews at Week 6, not Week 16.** You will be bad. That's the point — bad early is cheap.

---

## Retention

Every 4 weeks: re-read every `notes/` folder end to end (~20 min) and redo one earlier practice problem cold.

Retention is the thing that quietly fails. This is the cheap fix.
