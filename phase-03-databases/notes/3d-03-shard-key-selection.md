# 3D·03 · Shard Key Selection & Hot Keys

> **Why this exists:** the roadmap calls the shard key *"a design decision with permanent consequences"* —
> and the gate asks you to **choose one and defend it against a hostile follow-up.** Get this wrong and every
> query in the system becomes expensive, forever.

---

## Reference

### The three properties a good shard key needs

**Score every candidate against all three. A key that fails any one of them will hurt.**

| Property | Question | Failure mode if absent |
|---|---|---|
| **1 · High cardinality** | Are there far more distinct values than shards? | Can't spread. `country` with 3 dominant values ≠ 100 shards. |
| **2 · Even distribution** | Is traffic spread across values? | **Hot shards.** One celebrity, one big tenant. |
| **3 · Query alignment** ⭐ | Do your **most common queries** include this key? | **Every query becomes scatter-gather.** The killer. |

**Property 3 is the one people underweight and it's the most important.** A perfectly-distributed key that
none of your queries filter on means every read hits every shard — you've built N databases and query all of
them every time.

> **The method to state out loud:** *"I'd list the top 5 queries by volume first, then pick the key that
> appears in most of them, then check cardinality and distribution. Query pattern drives the shard key —
> not the data model."*

### Worked examples

| System | Candidate keys | Choice & why |
|---|---|---|
| **Twitter/feeds** | `user_id`, `tweet_id`, `timestamp` | **`user_id`** — most queries are "this user's tweets/timeline". Cardinality huge. ⚠️ Celebrities are hot. |
| **E-commerce orders** | `order_id`, `user_id`, `merchant_id` | **`user_id`** — "my orders" is the dominant query. `order_id` would scatter every user query. |
| **Multi-tenant SaaS** | `tenant_id`, `user_id` | **`tenant_id`** — near-perfect query alignment (everything is tenant-scoped) and natural isolation. ⚠️ Big tenants are hot. |
| **Chat** | `user_id`, **`conversation_id`** | **`conversation_id`** — messages are read per-conversation. `user_id` would split a conversation across shards. |
| **IoT / metrics** | `device_id`, `timestamp` | **`(device_id, timestamp)`** — hash device, sort by time. Never timestamp alone. |
| **Ad impressions** | `campaign_id`, `user_id`, `request_id` | Depends: `campaign_id` aligns with advertiser reporting but is skewed; `request_id` distributes perfectly but scatters every report. **Often both — sharded raw store + pre-aggregated rollups.** |

> **The chat row is the best interview example** because the naive answer (`user_id`) is wrong for a
> non-obvious reason: a conversation has two participants, so sharding by user splits every conversation
> across two shards and doubles every read.

### Hot keys / the celebrity problem

**Even with a great key, real distributions are Zipfian**
([Phase 0 note 10](../../phase-00-foundations/notes/10-workload-shape.md)) — a few keys get enormous traffic.

- Justin Bieber's `user_id` is one shard's worth of load by itself
- One enterprise tenant is 40% of your data
- One viral product page during a sale

**A single key cannot be split by definition** — that's the fundamental limit. So you work around it:

| Technique | How | Cost |
|---|---|---|
| ⭐ **Cache the hot key** | Hot keys are hot = high cache hit rate. **Often the entire answer.** | Staleness |
| **Key salting / splitting** | Write to `celebrity_123#0` … `#9`, read all 10 and merge | Reads fan out 10×; needs logic to know which keys are salted |
| **Read replicas for hot shards** | Replicate the hot shard more heavily | Doesn't help hot *writes* |
| **Dedicated shard** | Give the big tenant its own | Directory-based routing (3D·02) |
| ⭐ **Special-case at the application layer** | **Twitter's actual answer**: fan-out-on-write for normal users, fan-out-on-read for celebrities | Two code paths — but it's the correct answer |
| **Compound key** | `(user_id, bucket)` to spread one user's data | Complicates reads |

> **The interview move:** *"I'd shard by `user_id`, and handle celebrities as an explicit special case rather
> than trying to find a key that has no hot spots — because with a Zipfian distribution, no such key exists.
> Above a follower threshold I'd switch that account to a different fan-out path."*
>
> **Naming that no perfect key exists** is the senior part. Candidates often keep searching for one.

**Salting, concretely:**
```
write:  key = f"{celebrity_id}#{random(0,9)}"     -> 10 partitions absorb the writes
read:   fan out to all 10, merge                   -> 10x read cost
```
Use it only for **write** hot spots, and only for keys you've identified as hot — you need a hot-key detector
(count-min sketch, Phase 9) to know which.

### Anti-patterns

| Key | Why it's wrong |
|---|---|
| **`timestamp` / auto-increment ID** | All writes hit the newest shard. N machines, 1 machine's throughput. |
| **Low cardinality** (`country`, `status`, `type`) | Can't spread beyond the number of values |
| **A mutable field** | Changing the value means **moving the row between shards** — expensive and racy. **Shard keys must be immutable.** |
| **A key absent from your hot queries** | Scatter-gather forever |
| **UUIDv4 as a range key** | Random → no locality (though fine as a *hash* key) |

**"Shard keys must be immutable" is worth stating** — sharding by `status` or `region` means a status change
becomes a cross-shard move.

### Defending your choice — the hostile follow-ups

The gate says *"defend it against a hostile follow-up."* Have answers ready:

| Challenge | Answer shape |
|---|---|
| *"What about a query that doesn't include the shard key?"* | Scatter-gather (acceptable if rare/async), a **global secondary index** (3D·04), or a denormalised copy keyed differently |
| *"What if one tenant is 50% of your data?"* | Directory-based routing → dedicated shard; or split that tenant internally |
| *"What happens when you need to change the key?"* | Honest answer: **a full migration** — double-write, backfill, verify, cut over (3D·05). Say it's expensive; that's why we chose carefully. |
| *"How do you do cross-shard transactions?"* | Usually: **design so you don't need them.** Keep a transaction's data in one shard. Otherwise saga (3E). |
| *"How do you count all rows?"* | Fan out and sum, or maintain a counter, or approximate (HLL, Phase 9) |
| *"What about joins?"* | Colocate related data on the same shard by using the same key; otherwise join in the app |

**The strongest defence is colocation:** *"I chose `tenant_id` so that every row a single request touches
lives on one shard — which means I keep single-shard transactions and joins for the common case."*
**Shard-key choice is really about deciding what stays together.**

---

## In your own words

**Name the three properties of a good shard key. Which is most underweighted, and what's the failure mode?**

>

**State your method for choosing one, in the order you'd actually do it.**

>

**Why is `user_id` the wrong shard key for a chat app? What's right?**

>

**Why does no perfect shard key exist for real workloads? What do you do instead?**

>

**Explain salting. When does it apply, and what does it cost?**

>

**Why must a shard key be immutable?**

>

**Answer the hostile follow-up: "what about queries that don't include your shard key?"**

>

---

## Links

- Zipfian distributions → [Phase 0 note 10](../../phase-00-foundations/notes/10-workload-shape.md)
- Strategies → [3d-02-partitioning-strategies.md](3d-02-partitioning-strategies.md)
- Queries that miss the key → [3d-04-secondary-indexes-when-sharded.md](3d-04-secondary-indexes-when-sharded.md)
- Changing the key later → [3d-05-resharding-without-downtime.md](3d-05-resharding-without-downtime.md)
- Hot-key detection (count-min sketch), celebrity fan-out → **Phase 9**
- Caching hot keys → Phase 5
