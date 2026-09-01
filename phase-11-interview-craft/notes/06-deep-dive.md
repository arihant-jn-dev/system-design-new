# 11·06 · Beat 6 — The Deep Dive

**10–15 minutes.**

> **Why this exists:** ⭐ **the roadmap's insight is that OFFERING a good deep-dive candidate is itself a
> strong signal** — *"the interesting problem here is the hot-key fan-out — shall I go deep there?"*

---

## Reference

### ⭐ Offer, don't wait

**Two candidates walk into the same round:**

| ⚠️ | *"…and that's the design."* → the interviewer picks something → you go where you're sent |
| ⭐ | *"The interesting problem here is X — shall I go deep there? Though if you'd rather see Y, happy to."* |

⭐ **The second demonstrates that you can identify what's hard, which is exactly the judgement being
assessed** — and you land in territory you're strong in.

⭐ **Offer a choice of two.** It's collaborative rather than controlling, and it lets them steer without
having to override you.

### ⭐ Choosing a good candidate

| ✅ A good deep dive | ⚠️ A bad one |
|---|---|
| ⭐ **The part that breaks first at scale** | a part with an obvious, boring answer |
| ⭐ **Where a real tradeoff exists** and you can argue both sides | something you happen to have memorised |
| ⭐ **Where you have a MEASURED number** | a tangent that doesn't affect the design |
| The thing the whole product depends on | a component you'd buy off the shelf anyway |

⭐ **A test: if the answer is "use a library", it's a bad deep dive.** ⭐ **If the answer starts with "it
depends on whether we…", it's a good one.**

### ⭐ Go to mechanism

**Depth means the layer below the box.** ⭐ **"We'd use a cache" is a box; "read-through with a 60-second
TTL and jitter, plus request coalescing so a stampede on a hot key is one DB query instead of a hundred" is
a mechanism.**

| Go to | Example |
|---|---|
| ⭐ **The algorithm or data structure** | *"top-K precomputed at every trie node, so a query is O(prefix length) rather than O(subtree)"* |
| ⭐ **The exact failure case** | *"two concurrent bookings for the last seat — here's the transaction and the isolation level"* |
| ⭐ **The concrete numbers** | *"7.7 ms → 0.1 ms once tenant_id leads the index"* |
| **The migration** | *"how we'd get from the current shape to this without downtime"* |
| ⭐ **The thing you'd get wrong** | *"the naive version of this looks right and silently loses data — here's why"* |

⭐ **This is where all the earlier phases cash in.** You have measured numbers for cold caches, retries
making things worse, replication data loss, write skew, index column order, false-positive rates, feed
fan-out, B-tree locality, and password hashing. ⭐ **Citing one real number you produced yourself is worth
more than any amount of confident description** — and it's checkable, which is what makes it land.

### ⭐ Structure a deep dive

**Four moves, ~10 minutes:**

| | | |
|---|---|---|
| 1 | ⭐ **Name the problem precisely** | *"a celebrity with 100 M followers makes fan-out-on-write cost 100 M writes for one post"* — 30 s |
| 2 | ⭐ **Give the naive approach and why it fails** | shows you understand the shape of the problem — 1 min |
| 3 | ⭐ **Give your approach, with the mechanism** | ~5 min |
| 4 | ⭐ **Name what it costs and what you'd watch** | ⭐ **this is the part people skip, and it's the senior part** — 2 min |

⚠️ **Don't skip step 2.** ⭐ **Explaining why the obvious answer fails is what proves you didn't just
memorise the clever one.**

### Good deep dives per classic problem

| Problem | Deep dive |
|---|---|
| Twitter feed | ⭐ **hybrid fan-out + the celebrity threshold logic** |
| URL shortener | the read path: cache, hot keys, and ID generation |
| Uber | ⭐ **geospatial index + high-frequency location writes** |
| Ticketmaster | ⭐ **no overselling: the lock/transaction, and the queue in front of the spike** |
| Chat | connection routing, the backplane, ⭐ **missed-message replay** |
| Dropbox | ⭐ **chunking + content-addressed dedupe + conflict resolution** |
| Ad aggregator | ⭐ **late data, windowing, exactly-once-ish counting** |
| Rate limiter | the distributed accuracy/latency trade, with the overshoot bound |
| Payments | ⭐ **the ledger, idempotency, and reconciliation** |

### ⚠️ Traps

⚠️ **Going deep on the easy part** because you know it — ⭐ *transparent, and it wastes your best 15 minutes* ·
⚠️ **going so deep you never resurface** (⭐ *watch the clock; beat 7 still has to happen*) · ⚠️ **describing
without mechanism** · ⚠️ **refusing to commit inside the deep dive** — ⭐ *this is where you land the plane,
not where you list options.*

⭐ **And if they pick something you're weak on: say so and reason anyway** — *"I haven't implemented this
directly; my mental model is X — is that roughly right?"* ⭐ **Honest and reasoning-forward beats bluffing,
which is always detected** ([09](09-handling-pressure.md)).

---

## In your own words

**⭐ Why is offering a deep dive better than waiting? What do you actually say?**

>

**⭐ What makes a good candidate vs a bad one? State the two tests.**

>

**⭐ Give an example of "box" vs "mechanism" for the same component.**

>

**⭐ Name three measured numbers from your own labs you could cite in a deep dive.**

>

**⭐ The four moves. Why must you not skip the second?**

>

**Pick two classic problems and name a strong deep dive for each.**

>

**⭐ What do you do if they pick something you're weak on?**

>

**Name four traps.**

>

---

## Links

- ⭐ **Run it** → [`../lab/drill.js`](../lab/drill.js)
- ⭐ Your measured numbers live here → [Phase 5](../../phase-05-caching/lab/), [Phase 7](../../phase-07-reliability/lab/), [Phase 9](../../phase-09-building-blocks/lab/)
- The building blocks → [Phase 9](../../phase-09-building-blocks/notes/)
- Hybrid fan-out → [Phase 9 note 09](../../phase-09-building-blocks/notes/09-feed-and-timeline.md)
- Saying "I don't know" well → [09-handling-pressure.md](09-handling-pressure.md)
- What comes next → [07-bottlenecks-and-failure.md](07-bottlenecks-and-failure.md)
