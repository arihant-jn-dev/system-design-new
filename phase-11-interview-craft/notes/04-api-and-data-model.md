# 11·04 · Beats 3 & 4 — API Design and Data Model

**API: 3–5 min · Data model: 5 min.**

> **Why this exists:** ⭐ **the roadmap says of the data model: "seniors are judged hard here."** It is the
> most reliable single discriminator between a mid-level and a senior answer.

---

## Reference

# Beat 3 · API design (3–5 min)

### ⭐ Why a beat this short earns its place

**It forces concrete thinking**, and ⭐ **it often exposes a requirement gap while it's still cheap to fix.**

You write `POST /orders` and immediately have to answer: *what's in the body? what does it return? what's
the id? what happens on a retry?* ⭐ **Those questions surface omissions that a box-and-arrow diagram hides
for another 20 minutes.**

⭐ **And if it DOES expose a gap, say so out loud** — *"writing this out, I realise I never asked whether a
booking can be modified — let me assume no for now"* — because noticing is the signal, not being flawless.

### What to write

**3–5 core endpoints or events, with real signatures:**

```
POST /v1/urls              {url, custom_alias?, ttl?}  -> {short_url, expires_at}
GET  /{code}                                           -> 302 Location
GET  /v1/urls/{code}/stats ?from&to                    -> {clicks, by_day[]}
```

⭐ **Things to show you thought about, in one word each:**

| | |
|---|---|
| ⭐ **Idempotency** | an `Idempotency-Key` on creates ([Phase 9 note 14](../../phase-09-building-blocks/notes/14-idempotency-and-dedupe.md)) |
| ⭐ **Pagination** | ⭐ **cursor, not offset** ([Phase 1](../../phase-01-networking/notes/)) |
| **Versioning** | `/v1/` or a header |
| **Auth** | which endpoints need what ([Phase 10](../../phase-10-security/notes/)) |
| **Sync vs async** | ⭐ **a `202` + status URL for slow work** |

⚠️ **Don't design 15 endpoints.** ⭐ **The core 3–5, then say "the rest is CRUD" and move on.**

---

# ⭐ Beat 4 · Data model (5 min) — where seniors are judged

### The four things, in order

| | | |
|---|---|---|
| **1** | **Entities and relationships** | brief — this is the easy part |
| **2** | ⭐ **Access patterns** | ⭐ **do this BEFORE choosing a store.** *"Read a user's last 20 orders by time"* is a design input; the store is the output |
| **3** | ⭐ **Datastore choice, WITH a because** | |
| **4** | ⭐ **Shard key, WITH a because** | ⭐ **and what gets hot if you choose wrong** |

⭐ **Doing access patterns before the store choice is the ordering that reads as experience** — it's
[Cassandra's query-first modelling](../../phase-03-databases/notes/) applied as a habit, and it prevents the
buzzword answer.

### ⭐ The "because" is the whole thing

| ⚠️ Mid-level | ⭐ Senior |
|---|---|
| *"I'd use Cassandra."* | *"Cassandra, **because** this is write-heavy, the access pattern is time-series by user, and we can tolerate eventual consistency here. **The cost is that I lose ad-hoc queries and joins**, so the analytics path goes to a warehouse instead."* |
| *"Shard by user_id."* | *"Shard by user_id, **because** every read is scoped to one user, so a query hits one shard. **The risk is a power user becoming a hot partition** — I'd watch for that and could add a composite key with a bucket if it happened."* |

⭐ **Structure every choice as: the choice → because → what it costs → when you'd revisit.** That's four
seconds of speech and it's most of what separates the two columns.

### ⭐ The shard key checklist

**Say all four:**

1. ⭐ **What is it?**
2. ⭐ **Why?** — usually *"because the dominant access pattern is scoped to it, so reads hit one shard"*
3. ⭐ **What gets hot?** — the celebrity, the whale tenant, the popular product
4. ⭐ **What can't you do any more?** — cross-shard queries, global secondary indexes, transactions across shards

⚠️ **"No shard key" is on the roadmap's explicit failure list.** ⭐ **Even if the answer is "we don't need to
shard at 2 TB", SAY THAT** — *"one Postgres primary handles this comfortably; I'd shard by tenant_id when we
outgrow it, and here's what that would cost"* is a strong answer, not a dodge.

### ⭐ Also volunteer

| | |
|---|---|
| ⭐ **The consistency story** | which operations need strong consistency and which tolerate staleness. ⚠️ *"No consistency story" is on the failure list too* |
| **Indexes** | which, on what, and the write cost |
| **Hot/cold split** | recent data hot, archive cold |
| ⭐ **What you'd denormalise, and why** | ⭐ *"I'd duplicate the author name onto the post to avoid a join on the read path — the cost is fixing it up on rename, which I'd do asynchronously"* |

### ⚠️ Traps

⚠️ **Choosing a store before stating access patterns** · ⚠️ ⭐ **buzzword soup** — *"Kafka in a design that
needs a cron job"* is the roadmap's own example · ⚠️ **no shard key** · ⚠️ **no consistency story** ·
⚠️ **modelling like a relational schema and then picking a KV store** (the two must match) · ⚠️ **spending 12
minutes drawing a full ERD** — ⭐ **the entities are cheap; the store/shard/consistency decisions are what
you're being paid for.**

---

## In your own words

**⭐ Why does a 3-minute API beat earn its place? What should you do if it exposes a gap?**

>

**Five things to show you thought about in the API.**

>

**⭐ Why do access patterns come before the datastore choice?**

>

**⭐ Give a datastore choice in the four-part structure: choice → because → cost → when you'd revisit.**

>

**⭐ Say all four parts of the shard-key checklist for a design you know.**

>

**⭐ What do you say when the honest answer is "we don't need to shard"?**

>

**Name three things to volunteer beyond the four core items.**

>

**⭐ Give an example of something you'd denormalise, with its cost.**

>

**Name four traps.**

>

---

## Links

- ⭐ **Run it** → [`../lab/drill.js`](../lab/drill.js)
- Query-first modelling → [Phase 3F](../../phase-03-databases/notes/)
- Sharding and hot partitions → [Phase 3D](../../phase-03-databases/notes/)
- Consistency models → [Phase 4](../../phase-04-distributed-systems/notes/)
- API styles, pagination → [Phase 1](../../phase-01-networking/notes/)
- Idempotency → [Phase 9 note 14](../../phase-09-building-blocks/notes/14-idempotency-and-dedupe.md)
- ⚠️ Buzzword soup → [10-failure-patterns.md](10-failure-patterns.md)
