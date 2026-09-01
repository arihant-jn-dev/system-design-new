# Phase 3C + 3D — Gate

> **Rules:** Out loud. From memory. No notes.
> Pass this before moving to 3E/3F.

---

## Q1 · Explain how you'd reshard a live 20-node cluster with zero downtime

**The roadmap calls this "the question that separates seniors from mids."** It's testing whether you've
actually migrated production data — the answer is a *procedure*, not a concept.

**You pass if:**

- [ ] ⭐ **You first asked which problem it is:** rebalancing (adding nodes) vs re-keying (changing the shard
      key). They have completely different answers.
- [ ] **Rebalancing, easy case:** with a fixed number of **logical partitions**, you move *partitions*, not
      keys — the key→partition mapping never changes, and each partition is unavailable for milliseconds
- [ ] **Re-keying** requires the six-step migration, and you named all of it:
  - [ ] **1. Dual write** to old and new on every write path
  - [ ] **2. Backfill** history — idempotent, resumable, rate-limited
  - [ ] **3. Verify** — ⭐ **shadow reads**: read both, serve old, log mismatches
  - [ ] **4. Cut over reads gradually** behind a flag: 1% → 10% → 50% → 100%
  - [ ] **5. Stop dual-writing**
  - [ ] **6. Decommission** after a soak
- [ ] ⭐ **The backfill/live-write race** — the backfill can overwrite a concurrent live write with stale
      data. Fix: insert-if-not-exists, or version/timestamp comparison so live writes win.
- [ ] You said it's **reversible up to step 5**, and why (old is still current)
- [ ] ⭐ You said **verification is what takes the time**, not the copying — this is a multi-week project

**Self-score:** ___ / 10

---

## Q2 · Given a workload, choose a shard key and defend it against a hostile follow-up

**You pass if:**

- [ ] You named the three properties: **high cardinality**, **even distribution**, ⭐ **query alignment**
- [ ] You said **query alignment matters most** — a perfectly-distributed key nobody queries by means every
      read is scatter-gather
- [ ] Your method: **list the top queries by volume first**, then pick the key that appears in most of them
- [ ] ⭐ You framed it as **colocation** — "I chose X so everything a single request touches lives on one
      shard," which covers joins *and* transactions *and* latency
- [ ] ⭐ You acknowledged **no perfect key exists** (Zipfian distributions guarantee hot keys) and handled
      celebrities as an **explicit special case** rather than searching for a better key
- [ ] Shard keys must be **immutable**

**Hostile follow-ups — have an answer for each:**

- [ ] *"Queries that don't include the shard key?"* → scatter-gather (if rare), global secondary index, or
      **CDC into Elasticsearch** (the best answer)
- [ ] *"One tenant is 50% of your data?"* → directory-based routing, dedicated shard
- [ ] *"Cross-shard transactions?"* → **design so you don't need them**; else saga
- [ ] *"Change the key later?"* → honest: a multi-week migration (Q1)
- [ ] *"Global uniqueness for usernames?"* → ⭐ **shard the constraint by the value itself**, making the check
      single-shard

**Self-score:** ___ / 11

---

## Q3 · Replication lag — the anomalies and the fixes

**You pass if:**

- [ ] Lag is measured in **both seconds and bytes**, and **bytes is the leading indicator**
- [ ] ⭐ **Read-your-own-writes**: describe the failure (user posts, refresh loses it) and give the fix —
      pin that user's reads to the primary for N seconds, or use an **LSN read token**
- [ ] **Monotonic reads**: time appears to go backwards; fix = pin a user to one replica
- [ ] **Consistent prefix**: the answer appears before the question; arises with partitioned data
- [ ] ⭐ **Your routing rule**: reads go to replicas EXCEPT (1) inside a transaction, (2) data the user
      modified recently, (3) where staleness violates an invariant (balances, inventory)
- [ ] Why a replica falls behind: **single-threaded replay**, write bursts, big DDL, long replica queries
- [ ] Bonus: the **`hot_standby_feedback` trade** — replica query gets cancelled, or the primary bloats.
      You choose who takes the pain.

**Self-score:** ___ / 7

---

## Q4 · Failover, split brain and fencing

**You pass if:**

- [ ] The five steps: detect → elect → promote → redirect → **fence**
- [ ] ⭐ **Detection is the hard part** — you can't distinguish slow from dead, so it's always a timeout, and
      too-short causes **spurious failovers that reduce availability**
- [ ] **Split brain**: two nodes both accept writes; describe the partition version **and the GC-pause
      version** (the old leader was never partitioned, just paused, and has no idea time passed)
- [ ] ⭐ **Fencing tokens**: monotonically increasing number per leadership grant; **the resource enforces
      it**, not the leader. Walk a concrete sequence.
- [ ] **RPO ≈ replication lag** at failure; **RTO ≈ detect + promote + redirect**. Give numbers.
- [ ] ⭐ **The second-order problem**: lost writes may already exist in a cache, a Kafka topic, a sent email,
      a captured payment → **cross-system inconsistency**, not just data loss
- [ ] Post-promotion problems: sequence collisions, cold cache, reconnect storms, the old primary needing
      `pg_rewind`
- [ ] Bonus: *"I'd use a managed service or Patroni rather than write failover logic"*

**Self-score:** ___ / 8

---

## Extra checks

- [ ] **Why do replicas scale reads but not writes?** What do you need instead?
- [ ] **Why does nobody run exactly one synchronous replica?**
- [ ] **Statement-based replication** — three concrete reasons it was abandoned
- [ ] ⭐ **How would you do a zero-downtime Postgres major-version upgrade?** Why can't physical replication?
- [ ] **What does logical replication unlock?** (CDC, outbox, cross-engine, writable target)
- [ ] **Derive R + W > N.** Why isn't it strong consistency? Give three reasons.
- [ ] **Sloppy quorum + hinted handoff** — what does it trade away?
- [ ] **Merkle trees** — why, and what's the complexity improvement?
- [ ] **Why is LWW dangerous?** What can detect concurrency that timestamps can't?
- [ ] **Three legitimate reasons for multi-leader**, and the wrong reason
- [ ] **Why "don't shard until you must"** — five things you permanently lose
- [ ] **Federation** — what is it and why is it cheaper than sharding?
- [ ] **Why is partitioning by timestamp a classic mistake?**
- [ ] ⭐ **Logical partitions** — what problem do they solve?
- [ ] **Local vs global secondary index** — where does the cost land in each?
- [ ] **50 shards at 99.9% each** — what's a scatter-gather query's availability?
- [ ] **Why can't you average the averages?**
- [ ] **Why is "ask each shard for page 2" wrong?**

---

## Scoring

| Result | Do this |
|---|---|
| All four passed + most extras | ✅ Move to **3E / 3F** |
| Fumbled any of Q1–Q4 | ⛔ Redo that note's "own words" section, retry in 2 days |

| Fumbled | Redo |
|---|---|
| Q1 | [3d-05](notes/3d-05-resharding-without-downtime.md) — and write the six steps out longhand, twice |
| Q2 | [3d-03](notes/3d-03-shard-key-selection.md) + [3d-06](notes/3d-06-cross-shard-operations.md) |
| Q3 | [3c-02](notes/3c-02-replication-lag.md) + re-run [Lab C](lab/lab-c-replication/) C2 |
| Q4 | [3c-04](notes/3c-04-failover.md) + re-run the failover script |

---

## Gate log

| Attempt | Date | Q1 | Q2 | Q3 | Q4 | Notes |
|---|---|---|---|---|---|---|
| 1 |  | /10 | /11 | /7 | /8 |  |
| 2 |  | /10 | /11 | /7 | /8 |  |
