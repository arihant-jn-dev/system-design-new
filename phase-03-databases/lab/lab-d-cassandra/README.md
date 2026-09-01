# Lab D — 3-Node Cassandra

> Roadmap lab 4: *"3-node Cassandra. Model one query-first table. Write at `QUORUM`, kill a node, observe
> behaviour at different consistency levels."*

**Time: ~1.5 hrs** (most of it waiting for the cluster to form).

```bash
cd phase-03-databases/lab
docker compose -f docker-compose.cassandra.yml up -d     # ~3 min, nodes join SEQUENTIALLY
docker exec p3f-cass1 nodetool status                    # wait for 3x UN
./lab-d-cassandra/run.sh
```

No driver to install — everything goes through `docker exec … cqlsh`. Heaps are capped at 512 MB so three
nodes fit in a laptop's Docker allocation.

> **Two setup gotchas this lab hit, both worth knowing:**
>
> 1. **The healthcheck must confirm *this* node has joined.** Grepping `nodetool status` for any `^UN` is
>    wrong — a still-joining node sees its *seed* as UN and reports healthy, so the next node bootstraps
>    concurrently and you get **`Bootstrap Token collision`**. `nodetool netstats | grep 'Mode: NORMAL'` is
>    per-node and only true once joining completes.
> 2. **`cqlsh -e` splits on `;`.** A leading newline, or a trailing `-- comment` after the last semicolon,
>    becomes an empty/comment-only statement and fails with `no viable alternative at input ';'`.

---

## D1 · Query-first modelling

Two queries — *"messages in a conversation"* and *"messages by a sender"* — become **two tables**:

```cql
CREATE TABLE messages_by_conversation (
  conversation_id text, sent_at timestamp, message_id uuid, sender_id text, body text,
  PRIMARY KEY ((conversation_id), sent_at, message_id)
) WITH CLUSTERING ORDER BY (sent_at DESC, message_id DESC);

CREATE TABLE messages_by_sender (
  sender_id text, sent_at timestamp, message_id uuid, conversation_id text, body text,
  PRIMARY KEY ((sender_id), sent_at, message_id)
);
```

**The same two messages are written four times** — twice per table. There is no join, so the only way to
answer a query in one round trip is to have already stored it in that shape.

### ⭐ The query Cassandra refuses

```
SELECT * FROM messages_by_conversation WHERE sender_id='ari';

InvalidRequest: code=2200 [Invalid query] message="Cannot execute this query as it might
involve data filtering and thus may have unpredictable performance. If you want to execute
this query despite the performance unpredictability, use ALLOW FILTERING"
```

**That error is the whole lesson.** Postgres would have silently run a sequential scan. Cassandra refuses,
because at 100 nodes that query is a scatter-gather across the entire cluster.

**Read `ALLOW FILTERING` as "this query does not fit your data model."** It is not a hint to add the flag —
it's a hint to add a table.

---

## D2 · Tunable consistency, all 3 nodes up

```
write CL=ONE     ✅        read CL=ONE      ✅
write CL=QUORUM  ✅        read CL=QUORUM   ✅
write CL=ALL     ✅        read CL=ALL      ✅
```
Everything works. **Consistency is a per-query dial, not a database property.**

## D3 · Kill a node ⭐

```
UN  172.22.0.2    (cass1)
UN  172.22.0.3    (cass2)
DN  172.22.0.4    (cass3)   <- Down/Normal
```

**Note what did NOT happen: no failover, no leader election, no promotion.** There's no leader to lose. The
cluster just keeps serving — that's the leaderless model's entire pitch.

```
write CL=ONE     ✅        read CL=ONE      ✅
write CL=QUORUM  ✅        read CL=QUORUM   ✅
write CL=ALL     ❌ NoHostAvailable         read CL=ALL   ❌ NoHostAvailable
```

**The arithmetic, confirmed on real hardware:**

```
RF=3,  QUORUM = floor(3/2)+1 = 2   -> tolerates exactly ONE node down  ✅
RF=3,  ALL    = 3                  -> tolerates ZERO                   ❌
```

**`ALL` makes every node a single point of failure.** That's why it's almost never used — it converts a
distributed database into something *less* available than a single machine.

**And R + W > N, which you can now state from measurement:**

| Write CL | Read CL | R+W | vs N=3 | Guarantee |
|---|---|---|---|---|
| QUORUM (2) | QUORUM (2) | 4 | **> 3** | ✅ read sees the latest write |
| ONE (1) | ONE (1) | 2 | ≤ 3 | ⚠️ may read stale |
| ONE (1) | ALL (3) | 4 | > 3 | ✅ — but no failure tolerance on reads |
| QUORUM (2) | ONE (1) | 3 | = 3 | ⚠️ **not >** — may read stale |

That last row is the one to remember: **`R + W > N` is strict.** `QUORUM` write + `ONE` read is exactly 3,
not more, and gives you nothing.

## D4 · Hinted handoff

Restart cass3, wait for `Mode: NORMAL`, then:

```
read CL=ALL   ✅ SUCCESS
```

**`ALL` requires all three replicas to have the data — so it succeeding proves cass3 received the writes it
missed.** While it was down, its peers stored **hints** and replayed them on recovery.

⚠️ **Hinted handoff is a durability/availability aid, not a consistency guarantee.** With a **sloppy quorum**,
a write may be acked by nodes that aren't in the key's replica set at all — so `R + W > N` doesn't hold
during the outage ([3c-06](../../notes/3c-06-leaderless-quorum.md)).

---

## Things to try

| Try | How | Expect |
|---|---|---|
| **Two nodes down** | `docker stop p3f-cass2 p3f-cass3` | **`QUORUM` now fails too** — only `ONE` survives |
| **Prove a stale read** | Stop cass3, write at `ONE`, restart it, read at `ONE` repeatedly | Occasionally the old value, until read repair fixes it |
| **Watch read repair** | `nodetool tablestats chat.messages_by_conversation` | Read-repair counters climb |
| **Tombstones** | Insert 10k rows, delete them all, `nodetool flush`, then `SELECT` | Reads scan tombstones. This is "don't use Cassandra as a queue" ([3a-02](../../notes/3a-02-lsm-tree.md)). |
| **Unbounded partition** | Insert 200k rows into one `conversation_id` | `nodetool tablehistograms` shows partition size blowing past the 100 MB guideline |
| **Token ranges** | `nodetool ring` | 16 vnodes per node — consistent hashing ([Phase 2 note 04](../../phase-02-stateless-scaling/notes/04-consistent-hashing.md)) |
| **`LOCAL_QUORUM`** | Add a second DC | The multi-DC standard |

```bash
docker compose -f docker-compose.cassandra.yml down -v
```
