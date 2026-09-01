# 3C·03 · Replication Methods

> **Why this exists:** *how* changes are encoded on the wire determines what you can do with them — and
> **logical replication is what makes CDC, the outbox pattern and zero-downtime migrations possible**, so
> this note pays off again in Phase 6 and Phase 7.

---

## Reference

### The four methods

| Method | Ships | Used by |
|---|---|---|
| **Statement-based** | The SQL text | MySQL (legacy), old MySQL default |
| **WAL / physical** | Byte-level page changes | **Postgres streaming replication** |
| **Logical (row-based)** | Row-level before/after images | MySQL row-based binlog, **Postgres logical replication** |
| **Trigger-based** | Application-managed | Legacy tools, cross-DB replication |

---

### 1 · Statement-based — and why it was abandoned

Ship `UPDATE users SET last_seen = now() WHERE id = 42;` and re-run it on the follower.

**Compact. And broken, for a wonderfully instructive set of reasons:**

| Problem | Example |
|---|---|
| **Non-determinism** | `now()`, `random()`, `uuid_generate_v4()` produce **different values** on each node |
| **Auto-increment / sequences** | Different values assigned |
| **Order-dependent statements** | Statements with side effects must execute in exactly the same order |
| **Triggers / stored procedures** | May behave differently (different config, different data) |
| **Non-deterministic `LIMIT` without `ORDER BY`** | Different rows updated |

**MySQL's `MIXED` mode** exists precisely because of this: use statement-based when safe, silently fall back
to row-based when the statement is non-deterministic.

> Worth remembering as an example of a general principle: **replicating the *intent* is fragile; replicating
> the *effect* is robust.** Same idea recurs in event sourcing (commands vs events) in Phase 8.

---

### 2 · WAL / physical replication — Postgres streaming

**Ship the WAL byte stream** ([3a-07](3a-07-wal-and-durability.md)) and have the replica replay it.

| ✅ | ❌ |
|---|---|
| Exact byte-for-byte copy — **cannot diverge** | **Replica is read-only**, and an identical copy of *everything* |
| Very efficient | **Tightly coupled to the storage format** |
| Simple, battle-tested | **Cannot replicate between different major versions** |
| Replica is instantly promotable | Can't filter — no "just these tables" |
| | Replay is **single-threaded** in Postgres |

> ⚠️ **The version-coupling consequence is a real operational constraint:** you **cannot** do a
> zero-downtime major-version upgrade with physical replication, because a PG16 primary can't stream to a
> PG17 replica. That's exactly what **logical** replication is for — and it's a great, concrete answer to
> "how would you upgrade Postgres with no downtime?"

---

### 3 · Logical replication — the interesting one

Ship **row-level changes** in a format decoupled from storage:

```
INSERT  users  {id: 42, name: "ari", email: "..."}
UPDATE  users  before {balance: 100}  after {balance: 200}
DELETE  users  {id: 42}
```

| ✅ | ❌ |
|---|---|
| **Version- and engine-independent** | More overhead than physical |
| **Filter by table/row** | **Doesn't replicate DDL** (schema changes) — a real gotcha |
| Target can have **different indexes, extra columns** | Needs a **replica identity** (PK) for UPDATE/DELETE |
| **Target is writable** — enables multi-leader, and dual-writing during a migration | Sequences aren't replicated |
| ⭐ **Consumable by non-databases** | |

**That last row is the point.** A logical change stream can be consumed by Kafka, a search index, a cache, a
data warehouse — which is **Change Data Capture**.

**What logical replication unlocks:**

| Use | How |
|---|---|
| **Zero-downtime major upgrades** | PG16 → PG17 logically, then cut over |
| **CDC → Kafka** (Debezium) | Tail the WAL, publish row changes → **Phase 6** |
| **The outbox pattern** | Write business row + outbox row in one transaction; CDC relays the outbox → **Phase 6**. Solves the dual-write problem. |
| **Zero-downtime migrations** | Replicate old schema → new schema, backfill, verify, cut over → **Phase 7** |
| Selective replication | Only the tables a service needs |
| Cross-engine | Postgres → BigQuery/Snowflake/Elasticsearch |
| Multi-leader | Because the target is writable |

> **CDC is one of the highest-leverage patterns in the whole roadmap**, and this is where it comes from:
> *the database's own replication log, read by something that isn't a database.*

**Postgres mechanics:** `wal_level = logical`, then `CREATE PUBLICATION` on the source and
`CREATE SUBSCRIPTION` on the target. Output plugins (`pgoutput`, `wal2json`) decode WAL into row changes.

**The `REPLICA IDENTITY` gotcha:** to replicate an UPDATE or DELETE, the downstream needs to know *which row*.
By default that's the primary key. **A table with no primary key can't be logically replicated** without
`REPLICA IDENTITY FULL` (which ships the entire old row — expensive). Worth knowing; it bites people.

---

### 4 · Trigger-based

Triggers write changes to a queue table that an external process ships. Flexible, works anywhere — but
**high overhead and more failure modes**. Largely obsolete now that logical replication and CDC exist.
Mention it only as history.

---

### Choosing

```
Standby / HA / read replicas, same version    → PHYSICAL (simple, exact, promotable)
Major-version upgrade with no downtime        → LOGICAL
Feed a search index / warehouse / Kafka       → LOGICAL (CDC)
Selective tables, or a writable target        → LOGICAL
Cross-engine                                  → LOGICAL / CDC tooling
```

**Most production setups run both:** physical replicas for HA and read scaling, plus a logical slot feeding
CDC into the analytics and event pipelines.

---

## In your own words

**Why was statement-based replication abandoned? Give three concrete failure cases.**

>

**State the general principle: replicating intent vs replicating effect.**

>

**Physical vs logical — give the one-line trade, and the operational constraint physical imposes.**

>

**How would you do a zero-downtime Postgres major-version upgrade? Why can't physical replication do it?**

>

**What does logical replication unlock that physical cannot? Name four things.**

>

**What's `REPLICA IDENTITY` for, and what breaks without a primary key?**

>

---

## Links

- The WAL being shipped → [3a-07-wal-and-durability.md](3a-07-wal-and-durability.md)
- **CDC, Debezium, the outbox pattern, the dual-write problem** → **Phase 6**
- Zero-downtime schema migrations → Phase 7
- Multi-leader (needs a writable target) → [3c-05-multi-leader.md](3c-05-multi-leader.md)
- **DDIA ch. 5**, "Implementation of Replication Logs"
