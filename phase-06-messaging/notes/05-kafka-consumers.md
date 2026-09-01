# 06·05 · Kafka Consumers, Groups & Rebalancing

> **Why this exists:** you **measured** the partition ceiling in the lab — a 4th consumer on a 3-partition
> topic sat **idle**. And "my consumer keeps rebalancing" is one of the most common real Kafka problems,
> with a cause that isn't obvious.

---

## Reference

### Consumer groups

```
topic (3 partitions) ──▶ group "billing"    each partition to exactly ONE member
                     └─▶ group "analytics"  reads everything independently
```

| Rule | |
|---|---|
| ⭐ **A partition is consumed by exactly one member of a group** | So partition count is a **hard ceiling** on parallelism |
| Each group tracks **its own offsets** | Groups are fully independent — queue *and* pub/sub in one primitive |
| More consumers than partitions | ⭐ **The extras sit IDLE.** You measured this. |
| Offsets live in `__consumer_offsets` | A compacted internal topic |

**Your lab result:**
```
1 consumer  -> [0,1,2]
2 consumers -> [0,1] and [2]
3 consumers -> [0], [1], [2]      ⭐ maximum useful parallelism
4 consumers -> one member with []  ⚠️ IDLE
```

### Offset management — where duplicates come from

| Setting | Behaviour |
|---|---|
| ⚠️ **`enable.auto.commit=true`** (default) | Commits periodically in the background — **including offsets for messages you haven't finished processing.** Silent **at-most-once**, i.e. data loss. |
| **Manual commit after processing** | ⭐ **At-least-once.** The correct default. |
| Manual commit before processing | At-most-once, deliberately |
| Per-message commit | Safest, slowest (a round trip each) |
| ⭐ **Batch commit (every N or every T)** | **What real consumers do** — and it widens the duplicate window to the whole batch |

> ⭐ **You measured the batch effect:** committing every 5 messages and crashing mid-batch redelivered
> **5 messages**, charging 5 payments twice. Committing per-message would have redelivered 1. **The batch
> size is the size of your duplicate window** — which is fine, because idempotent consumers make it
> harmless ([07](07-delivery-semantics.md)).

**Where a consumer starts** (`auto.offset.reset`): `earliest` (from the beginning) · `latest` (only new
messages) · `none` (error). ⚠️ **Only applies when there's no committed offset** — a new group, or offsets
expired.

### Rebalancing

**Triggered when group membership or partition assignment changes:**

- A consumer **joins** (deploy, scale up)
- A consumer **leaves** cleanly
- A consumer **crashes** — detected via `session.timeout.ms`
- ⭐ **A consumer takes too long between polls** — `max.poll.interval.ms`
- Partitions are added to the topic

**The two protocols:**

| | **Eager** (older) | ⭐ **Cooperative sticky** (modern) |
|---|---|---|
| How | **Everyone revokes everything**, re-joins, gets new assignments | Only partitions that **must** move are revoked |
| Impact | ⚠️ **Stop-the-world for the whole group** | Unaffected members keep consuming |
| Rounds | 1 | Possibly 2 |

**Cooperative sticky (`CooperativeStickyAssignor`) is the modern default and you should use it** — especially
with large groups, where an eager rebalance means every consumer stops.

### ⭐ "My consumer keeps rebalancing" — the classic bug

```
max.poll.interval.ms  (default 5 min)
   = the maximum time you may spend PROCESSING a batch before calling poll() again
```

**If processing a batch takes longer than that, the broker assumes the consumer is dead and rebalances it
out** — even though it's working perfectly.

```
poll() returns 500 records
process each one: 1 second each = 500 seconds
max.poll.interval.ms = 300 seconds
  -> kicked from the group MID-BATCH
  -> partitions reassigned; another consumer reprocesses them
  -> the original finishes, tries to commit -> ⚠️ CommitFailedException
  -> it rejoins... and the cycle repeats
```

> ⭐ **The consumer is stuck in a rebalance loop, makes no progress, and lag grows — while each individual
> message processes fine.** This is the single most common Kafka consumer incident and it's genuinely
> non-obvious, because nothing is failing.

**Fixes, in order of preference:**
1. ⭐ **Reduce `max.poll.records`** — take fewer messages per poll. Usually the right fix.
2. Increase `max.poll.interval.ms` — treats the symptom
3. Process **asynchronously** (hand off to a worker pool, poll promptly) — ⚠️ but now you must manage offset
   commits carefully, or you commit work that hasn't finished
4. Make processing faster (batch the DB writes)

**Two related timeouts, frequently confused:**

| | Meaning |
|---|---|
| **`session.timeout.ms`** (~45 s) | ⭐ Missed **heartbeats** — sent on a **background thread**, so this detects a *crashed* consumer |
| **`max.poll.interval.ms`** (5 min) | ⭐ Time between **poll() calls** — detects a *stuck or slow* consumer |

**A consumer can be heartbeating happily while being far too slow to process** — which is exactly why the
second timeout exists.

### Static membership — the deploy fix

`group.instance.id` gives a consumer a **stable identity**. On a quick restart within
`session.timeout.ms`, it **reclaims its partitions without triggering a rebalance.**

⭐ **Valuable for rolling deploys**: without it, restarting 10 consumers one at a time causes 20 rebalances
(one leaving, one joining, each time). With static membership and a short restart, roughly zero.

### Consumer lag

```
lag = log-end-offset − committed-offset      (per partition)
```

⭐ **Alert on the derivative, not the value** — a lag of 100,000 that's shrinking is recovery; 5,000 and
growing is an outage in progress. And **lag on one partition only** points at a hot key or a stuck consumer
([08](08-consumer-hygiene.md)).

### Practical checklist

- [ ] ⭐ **Disable auto-commit**; commit after processing
- [ ] **Cooperative sticky** assignor
- [ ] ⭐ **Tune `max.poll.records`** to your processing speed
- [ ] **Static membership** if you deploy frequently
- [ ] **Idempotent processing** — you *will* get duplicates ([07](07-delivery-semantics.md))
- [ ] **Handle rebalance callbacks**: commit offsets in `onPartitionsRevoked`
- [ ] **Alert on lag growth**
- [ ] Never block the partition on a poison message ([08](08-consumer-hygiene.md))

---

## In your own words

**State the partition/consumer rule and cite your own lab numbers for 1, 2, 3 and 4 consumers.**

>

**Why is `enable.auto.commit=true` dangerous? What semantic does it silently produce?**

>

**Why does batch committing widen the duplicate window? Cite your measurement.**

>

**Eager vs cooperative sticky — what does each do to consumers not involved in the change?**

>

**Walk the rebalance-loop bug end to end. Why is it hard to spot?**

>

**`session.timeout.ms` vs `max.poll.interval.ms` — what does each detect?**

>

**What does static membership fix, and when is it most valuable?**

>

---

## Links

- ⭐ **You measured the partition ceiling** → [`../lab/`](../lab/) Part A
- ⭐ **You measured the duplicate window** → [`../lab/`](../lab/) Part B
- Partitions and ordering → [03-kafka-fundamentals.md](03-kafka-fundamentals.md)
- Delivery semantics → [07-delivery-semantics.md](07-delivery-semantics.md)
- DLQs, retry topics, lag → [08-consumer-hygiene.md](08-consumer-hygiene.md)
