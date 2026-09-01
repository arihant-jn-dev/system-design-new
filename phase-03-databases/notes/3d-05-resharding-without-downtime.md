# 3D·05 · Resharding Without Downtime

> **Why this exists:** the roadmap calls this *"the question that separates seniors from mids"* — and the
> gate is explicit: **"explain how you'd reshard a live 20-node cluster with zero downtime."** It's testing
> whether you've actually migrated data in production, because the answer is a *procedure*, not a concept.

---

## Reference

### Why rebalancing is hard

You're changing where data lives **while it's being read and written**, with no downtime, no data loss, and
a rollback path at every step.

**The naive approach — `hash(key) mod N` with a changed N — moves ~all the data at once**
(you measured 75% for 3→4 in [Phase 2's lab](../../phase-02-stateless-scaling/lab/)). That's not a
migration, it's an outage.

### The easy case: you planned for it

**If you used logical partitions** ([3d-02](3d-02-partitioning-strategies.md)), rebalancing is
straightforward:

```
1,024 logical partitions, currently on 20 nodes (~51 each)
Add 5 nodes -> move ~10 partitions per node to the new ones

Per partition: copy -> catch up -> briefly pause writes to THAT partition -> flip ownership -> resume
```

**Only one partition is momentarily unavailable, for milliseconds.** Elasticsearch, Kafka, Couchbase,
Citus, CockroachDB and DynamoDB all work this way.

> **The best answer to the gate question starts here:** *"If the cluster was built with a fixed number of
> logical partitions, this is routine — I move partitions, not keys, and the key→partition mapping never
> changes. The hard version is when you have to change the sharding **scheme** or the **shard key**, and
> that's a migration."*

### The hard case: changing the shard key or scheme

**The general procedure — memorise this shape.** It's the same one used for zero-downtime schema
migrations (Phase 7) and for moving between any two stores:

```
1. DUAL WRITE      write to BOTH old and new, on every write path
                   (new is not read yet — it's building)

2. BACKFILL        copy historical data old -> new, in batches
                   idempotent, resumable, rate-limited so it doesn't
                   saturate the production database

3. VERIFY          continuously compare old vs new
                   row counts, checksums, and SHADOW READS:
                   read both, serve OLD, log any mismatch
                   ⭐ this is the step people skip, and it's the one that
                     tells you whether you can safely proceed

4. CUT OVER READS  flip reads to new — gradually.
                   1% -> 10% -> 50% -> 100%, behind a feature flag,
                   watching error rate and latency at each step

5. STOP DUAL WRITE stop writing to old (keep it readable a while longer)

6. DECOMMISSION    after a soak period, drop the old store
```

**Every step is independently reversible until step 5.** That's the property that makes it safe — at any
point you can flip reads back to old, because old is still current.

### The details that show you've done it

| Detail | Why it matters |
|---|---|
| **Backfill must be idempotent and resumable** | It will fail partway through. Use upserts and track progress by key range. |
| **Rate-limit the backfill** | It's competing with production traffic. Watch replication lag and CPU; back off automatically. |
| ⭐ **Handle the race between backfill and live writes** | The backfill reads an old row while a live write updates it → you can overwrite new data with old. **Fix: backfill with "insert if not exists" semantics, or version/timestamp comparison, so a live write always wins.** |
| **Shadow reads before cutting over** | Compare results in production traffic without serving them. The only way to gain real confidence. |
| **Gradual read cutover, per-tenant or per-percentage** | Blast radius control |
| **Keep the old store readable after cutover** | Rollback path |
| **Backfill deletes too** | Rows deleted from old during the migration must be deleted from new |
| **Monitor mismatch rate, not just errors** | Silent divergence is the real risk |

**The backfill/live-write race is the detail that most demonstrates real experience.** Mention it unprompted.

### Variants worth knowing

| Approach | When |
|---|---|
| **Split shards in place** | Range-partitioned: split one range into two, move half. HBase/Bigtable/CockroachDB do this automatically. |
| **Double the shard count** | If N → 2N, each old shard's data splits into exactly two — **no rehash needed**, since `hash mod 2N` puts each key in the same shard or its "partner". A neat trick worth knowing. |
| **Add a new shard, migrate only new data** | Time-based: old data stays, new writes go elsewhere. Cheap, but leaves you with two schemes. |
| **Vitess-style resharding** | Tooling handles it: create target shards, filtered replication, verify, `SwitchTraffic`. **Buy this rather than build it.** |
| **Live migration per tenant** | Multi-tenant: move one tenant at a time, briefly locking that tenant. Small blast radius, easy to schedule. |

**The double-the-count trick** is a genuinely useful thing to mention: going from N to 2N shards means a key's
new shard is either the same one or exactly one other, so you can split each shard's data locally without
consulting every other shard.

### What you must have in place before you start

- [ ] **Every write goes through a single code path** (a repository/DAO layer) — otherwise you cannot dual-write reliably
- [ ] **Feature flags** for read routing, changeable without a deploy
- [ ] **Metrics**: mismatch rate, backfill progress, lag between old and new
- [ ] **A rollback plan you have actually tested**
- [ ] **A soak period budget** — this takes days to weeks, not hours

> **The honest framing:** *"A shard-key change on a live 20-node cluster is a multi-week project, not a
> maintenance window. The procedure is dual-write, backfill, verify with shadow reads, then a gradual read
> cutover behind a flag — and the reason it takes weeks is the verification, not the copying."*

### The gate answer, compressed

> *"First I'd ask whether we're rebalancing or re-keying. If the cluster uses a fixed number of logical
> partitions, adding nodes just means moving partitions — each one is briefly unavailable for milliseconds
> and the key mapping never changes, so it's routine.*
>
> *If we're changing the shard key, that's a migration: dual-write to old and new on every write path;
> backfill history in idempotent, rate-limited batches, being careful that the backfill can't overwrite a
> concurrent live write; verify continuously with shadow reads comparing both stores in production traffic;
> then cut reads over gradually behind a flag — 1%, 10%, 50%, 100% — watching the mismatch rate. Old stays
> writable until I'm confident, so I can roll back at any point. Then stop dual-writing and decommission
> after a soak.*
>
> *And I'd note that the verification step is what takes the time — the copy is the easy part."*

---

## In your own words

**Why is rebalancing hard? What's wrong with the naive `mod N` approach?**

>

**Describe the easy case. What design decision made it easy?**

>

**Write the six-step migration procedure from memory.**

>

**What's the race between the backfill and live writes, and how do you prevent it?**

>

**What are shadow reads and why is skipping them the most common mistake?**

>

**Up to which step is the migration reversible, and what property makes that true?**

>

**Why does N → 2N have a shortcut?**

>

**Answer the gate question out loud, timed. Under 90 seconds.**

>

---

## Links

- Logical partitions, the thing that makes this easy → [3d-02-partitioning-strategies.md](3d-02-partitioning-strategies.md)
- Consistent hashing, measured → [Phase 2 note 04](../../phase-02-stateless-scaling/notes/04-consistent-hashing.md)
- Shard key permanence → [3d-03-shard-key-selection.md](3d-03-shard-key-selection.md)
- **The identical procedure for schema migrations (expand–migrate–contract)** → **Phase 7**
- CDC as a dual-write alternative → [3c-03](3c-03-replication-methods.md), Phase 6
- **DDIA ch. 6**, "Rebalancing Partitions"
