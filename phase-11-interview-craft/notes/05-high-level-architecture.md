# 11·05 · Beat 5 — High-Level Architecture

**8–10 minutes.**

> **Why this exists:** ⭐ **the roadmap's key instruction is not about the diagram — it's "walk one write path
> and one read path end to end. Narrating a request beats a static diagram every time."**

---

## Reference

### The default skeleton

```
client ──▶ CDN/edge ──▶ LB ──▶ services ──▶ cache ──▶ DB
                                   │
                                   └──▶ queue ──▶ workers ──▶ (stream/warehouse)
```

⭐ **Start from this and DELETE what you don't need**, saying why: *"no CDN here because everything is
personalised and uncacheable"* — ⭐ **a deliberate omission scores; a silent one looks like a gap.**

⚠️ **And genuinely delete things.** A design with 11 boxes for a 10 K-user product is
[over-engineering](10-failure-patterns.md), which is a failure mode, not thoroughness.

### ⭐ Whiteboard mechanics — they matter more than they should

| | |
|---|---|
| ⭐ **Draw LEFT TO RIGHT**, client on the left | it matches how you'll narrate it |
| ⭐ **LEAVE ROOM** | ⚠️ **you will add things in the deep dive** — start in the top-left third, not the centre |
| **Keep it legible** | if you can't read it back, neither can they |
| ⭐ **Numbers on the diagram** | ⭐ **QPS on arrows, size on datastores** — it keeps your estimates alive and visible |
| **Label the arrows** | *"sync"*, *"async"*, *"CDC"* — the arrow type is a real decision |
| ⭐ **Don't erase — annotate** | crossing something out *with a reason* shows your thinking |

⚠️ **Whiteboard chaos is on the roadmap's failure list.** ⭐ **In a virtual round, use Excalidraw and practise
with it before the day** — fumbling the tool costs real minutes.

### ⭐⭐ Walk the paths — the highest-value 3 minutes in the round

**After the boxes exist, narrate a request through them:**

> ***The write path.*** *"A user posts. The request hits the LB, lands on any app instance — they're
> stateless, so no affinity needed. We validate, write to the primary, and **in the same transaction** write
> an outbox row. The outbox relay publishes to Kafka. A worker consumes it and fans out to followers'
> timelines in Redis. **The user's request returned as soon as the DB commit succeeded — the fan-out is
> async, so a slow follower list can't slow the post.**"*
>
> ***The read path.*** *"They open the app. CDN handles static assets. The timeline request hits a service,
> which reads the precomputed timeline from Redis — that's one lookup. **On a miss we fall back to building
> it from the DB, which is 50× slower, so the miss rate is the number I'd watch.** We hydrate post content
> from a second cache, and return."*

⭐ **Why this works so well:**

| | |
|---|---|
| ⭐ **It proves the boxes connect** | a diagram can hide an impossible hop; a narration can't |
| ⭐ **It surfaces the interesting problems naturally** | *"fan-out to followers"* → the celebrity problem, which is your deep dive |
| ⭐ **It's where tradeoffs come out** | *"the user's request returned before the fan-out finished"* is a consistency decision, stated as a story |
| **It fills silence productively** | you're talking, and every sentence is content |

⭐ **Narrate the FAILURE inline too, briefly** — *"if Kafka is down the outbox row just sits there and we
catch up"* — because it plants beat 7 early and costs you five seconds.

### ⭐ Ask "what's actually hard here?" before drawing

**Every design has one or two genuinely hard parts. The rest is plumbing.**

| Problem | ⭐ The actually-hard part |
|---|---|
| URL shortener | ⭐ **not the hashing — it's the read scale and the cache** |
| Twitter feed | ⭐ **fan-out and the celebrity case** |
| Uber | ⭐ **geospatial matching and high-frequency location writes** |
| Ticketmaster | ⭐ **no overselling under a flash-sale spike** — contention, not scale |
| Chat | ⭐ **connection routing and missed-message replay** |
| Dropbox | ⭐ **chunking, dedupe, and sync conflict resolution** |
| Ad click aggregator | ⭐ **exactly-once-ish counting and late data** |

⭐ **Naming the hard part early does two things: it directs your own time, and it hands the interviewer an
excellent deep-dive candidate** ([06](06-deep-dive.md)).

### Keep the components justified

⭐ **Every box needs a because**, and the strongest version cites your own numbers:

> *"A cache here **because** we're 100:1 read-heavy and the DB is sized for ~5% of read traffic. ⭐ **Which
> also means losing the cache is an availability failure, not a slowdown** — I measured that: p95 went to
> 2 seconds and 271 requests failed with nothing broken except an empty cache."*

⚠️ **A box you can't justify is worse than no box** — it invites a question you can't answer.

---

## In your own words

**⭐ Draw the default skeleton. How do you handle the components you DON'T need?**

>

**Six whiteboard mechanics. Which one do people learn the hard way?**

>

**⭐ Why does narrating a path beat a static diagram? Give four reasons.**

>

**⭐ Narrate a write path end to end for a design you know. Out loud, 60 seconds.**

>

**⭐ Now the read path.**

>

**Why narrate a failure inline?**

>

**⭐ Name the actually-hard part for four different classic problems.**

>

**⭐ Justify one component using a number you measured in an earlier phase.**

>

---

## Links

- ⭐ **Run it** → [`../lab/drill.js`](../lab/drill.js)
- Choosing the deep dive → [06-deep-dive.md](06-deep-dive.md)
- Talking while drawing → [08-communication-skills.md](08-communication-skills.md)
- ⚠️ Whiteboard chaos, over-engineering → [10-failure-patterns.md](10-failure-patterns.md)
- ⭐ The cold-cache numbers → [Phase 5 lab](../../phase-05-caching/lab/)
- Outbox and async fan-out → [Phase 6](../../phase-06-messaging/notes/)
- The building blocks the boxes are made of → [Phase 9](../../phase-09-building-blocks/notes/)
