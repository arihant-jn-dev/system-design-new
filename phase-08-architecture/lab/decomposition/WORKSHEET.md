# Phase 8 Lab · The Decomposition Worksheet

> ⭐ **This is the phase.** The roadmap's lab for Phase 8 is not code — it is this:
>
> *"Take one service you know well. Write a one-page decomposition: boundaries, data ownership, sync vs
> async per interaction, and what breaks during a migration. Then write the counter-argument for keeping it
> a monolith. **Being able to argue both sides is the actual skill.**"*
>
> The multi-tenancy demo next door is the *second*, smaller lab. **Do this one first.**

---

## Rules

1. **Pick a system you have actually worked on.** Not Twitter, not Uber. Something whose ugly parts you
   know — because the ugly parts are where decomposition arguments are actually won or lost.
2. **Write in full sentences**, not bullets you could bluff past. You are rehearsing speech.
3. ⭐ **Part 2 must be written to WIN.** If your monolith argument reads like a strawman you set up to knock
   down, you have failed the exercise. Argue it like you believe it — because in a 30-engineer org, you
   probably should.
4. Time-box: **45 min for Part 1, 30 min for Part 2, 15 min for Part 3.**

---

# Part 0 · The system

**What is it? (2–3 sentences — what it does, who uses it)**

>

**Roughly how big?** (services today · engineers · requests/day · data size)

| | |
|---|---|
| Services today | |
| Engineers touching it | |
| Traffic | |
| Data size | |

**⭐ What actually hurts about it today?** *(Be specific. "It's a monolith" is not a pain. "Two teams can't
deploy independently because they share one release train" is.)*

>

---

# Part 1 · The decomposition

## 1.1 · Boundaries

List the services you'd split it into. **For each one, name the business capability it owns** — not the
technical layer. (If a proposed service is called `UserServiceUtils` or `DataAccessService`, that is a layer,
not a boundary.)

| # | Service | ⭐ The business capability it owns | Why it's a separate thing |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |

**⭐ Which team owns each? Does that match how your org is actually shaped?** *(Conway's law: you will ship
your org chart whether you meant to or not.)*

>

**⭐ Name one boundary you deliberately did NOT draw, and why.** *(A good answer here shows restraint. The
strongest decompositions are the ones with fewer services than the author's first instinct.)*

>

---

## 1.2 · Data ownership

⭐ **This is the section that separates a real decomposition from a diagram.** One table, one owner. If two
services write the same table, they are one service wearing two hats.

| Data / table | ⭐ Owning service (exactly one) | Who else needs to read it? | ⭐ How do they get it? |
|---|---|---|---|
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |

*(That last column is the hard one. Options: synchronous API call · a cached replica kept fresh by events ·
an event-carried copy they own outright · they don't actually need it. **"Shared database" is not an
option** — write down why not, in your own words:)*

>

**⭐ Which JOIN do you lose?** Every decomposition kills at least one query that used to be a single JOIN.
Name it, and say what replaces it (API composition · a read model · denormalised event data · accepting
staleness).

| The JOIN you lose | What replaces it | What it costs you |
|---|---|---|
| | | |
| | | |

**⭐ Which transaction do you lose?** Name one operation that is currently one ACID transaction and would
span two services after the split. What replaces it — a saga, an outbox, or a redesign that avoids needing
it?

>

---

## 1.3 · Sync vs async, per interaction

⭐ **Do not answer "we'll use events" globally.** Go interaction by interaction. The rule to apply: **is the
caller's own correctness/response blocked on the answer?** If yes → sync. If it merely needs to *eventually*
happen → async.

| From → To | What's exchanged | ⭐ Sync or async | ⭐ Why (the caller does / doesn't need the answer now) | If it's down, what happens? |
|---|---|---|---|---|
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |

**⭐ Where did you choose async purely to decouple, and what did you pay for it?** *(Eventual consistency
somewhere user-visible? Debugging that now needs a trace? A new failure mode where the event is lost?)*

>

**Orchestration or choreography for your most complex multi-service flow? Name the flow and commit.**

>

**⭐ The distributed-monolith test:** if service A can't deploy without service B deploying at the same
time, you have not decomposed anything — you have added network calls to a monolith. **Walk your table
above. Can each service deploy alone?**

>

---

## 1.4 · What breaks during the migration

⭐ **This is where seniority shows.** Anyone can draw the end state. The migration is the actual project, and
it is where the risk lives.

**The order of extraction — which service comes out first, and why that one?** *(Good reasons: it's a leaf
with few dependents · it has a clearly separable data set · it has a different scaling profile · it's the
one causing the pain in Part 0. **Bad reason: it's the easiest.**)*

>

**⭐ The strangler-fig plan for service #1 — the actual steps:**

| Step | What you do | How you'd verify it before moving on |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |

**⭐ How does the data move without downtime?** *(Phase 7's expand → migrate → contract, applied across a
service boundary. Dual-write? CDC? A period where the monolith is still the source of truth?)*

>

**⭐ What is your rollback at each step?** *(And name the step after which you can no longer roll back
cheaply — every migration has one.)*

>

**⭐ Name three things that will break that you can't fully prevent:**

| What breaks | Why it's hard to prevent | How you'd detect it fast |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |

**⭐ What new operational burden does the team take on the day this ships?** *(On-call for N services ·
distributed tracing you don't have yet · N deploy pipelines · schema coordination · a service mesh someone
must now understand.)*

>

**How long does this take, honestly? And what does the team NOT build during that time?**

>

---

# Part 2 · The counter-argument — keep the monolith

> ⭐ **Write this to win.** Not as a foil. If you can't make yourself uncomfortable here, you don't
> understand the trade-off well enough to be trusted with the decision.

**Open with the strongest sentence you can write in favour of not splitting this system:**

>

**⭐ Rebut your own Part 1, point by point:**

| Your Part 1 claim | ⭐ The monolith rebuttal |
|---|---|
| "Teams can't deploy independently" | |
| "It doesn't scale" | |
| "The codebase is unmaintainable" | |
| "We need different tech per service" | |
| *(your own)* | |

**⭐ What do you get back by NOT splitting?** *(Local calls that can't fail · one deploy · one database and
therefore real transactions · refactoring across boundaries with a compiler's help · one thing to
monitor · no distributed tracing requirement · one on-call rotation.)*

>

**⭐ The modular monolith — the answer most interviews are actually looking for.** How would you get 80% of
the decomposition's benefit inside one deployable? *(Enforced module boundaries · a package/module per
bounded context · no cross-module table access · an in-process event bus · module-owning teams · an
architecture test in CI that fails the build on an illegal import.)*

>

**⭐ What would have to become true before splitting is clearly right?** Write these as *thresholds you
would actually measure*, not vibes:

| Trigger | The number/signal you'd watch |
|---|---|
| Deploy contention | |
| Team size / ownership | |
| Divergent scaling profile | |
| Divergent reliability requirement | |
| Blast radius | |

**⭐ What is the real cost of being wrong in each direction?**

| | Cost of splitting too early | Cost of splitting too late |
|---|---|---|
| | | |

*(Worth noticing which one is reversible. It usually isn't the one people fear.)*

---

# Part 3 · Commit

> ⭐ The gate asks you to **argue both sides and then commit**. Sitting on the fence scores zero — the whole
> point of understanding both sides is to make a *defensible* call, not to avoid making one.

**Your recommendation, in one sentence:**

>

**The three reasons that drove it (in priority order):**

1.
2.
3.

**⭐ The condition under which you'd change your mind:**

>

**⭐ What you'd do in the first 30 days — regardless of which way you went:** *(There is almost always work
that's right either way: establishing module boundaries, fixing data ownership, adding tracing, killing the
shared database. Doing that work first is what makes the eventual split cheap — and it's the answer that
makes an interviewer sit up.)*

>

---

## Done when

- [ ] Part 1 fits on one page and every table row is filled
- [ ] ⭐ Part 2 is genuinely persuasive — you'd be uncomfortable arguing against it
- [ ] Part 3 commits, with a named condition for changing your mind
- [ ] ⭐ **You have said the whole thing out loud in under 6 minutes**
- [ ] You did it for a system you actually know

**Then: [`../../GATE.md`](../../GATE.md) Q1 is this worksheet, from memory, under time.**
