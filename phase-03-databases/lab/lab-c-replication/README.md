# Lab C — Replication Lag & Failover

> Roadmap lab 1: *"Postgres primary + replica in Docker. Write to primary, read from replica, **induce and
> measure replication lag**. Then fail over."*

**Time: ~2 hrs.** Uses its own compose file so it can't collide with the 3A/3B labs.

```bash
cd phase-03-databases/lab
docker compose -f docker-compose.replication.yml up -d
sleep 30
docker compose -f docker-compose.replication.yml ps        # both healthy

# experiments C1-C4 (runs inside the compose network)
docker compose -f docker-compose.replication.yml run --rm lab node lab-c-replication/lag.js

# failover — run from the HOST, it needs to stop containers
npm install pg          # once, anywhere
node lab-c-replication/failover.js
```

Primary on host **5435**, replica on **5436**.

**Verify streaming before you start:**
```bash
docker exec p3c-primary psql -U lab -d lab \
  -c "SELECT application_name, state, sync_state FROM pg_stat_replication;"
docker exec p3c-replica psql -U lab -d lab -tAc "SELECT pg_is_in_recovery();"   # -> t
```

---

## How the replica is built

[`replica-entrypoint.sh`](replica-entrypoint.sh) does the real procedure from
[3c-01](../../notes/3c-01-single-leader-replication.md):

```
pg_basebackup -h primary -U replicator -D $PGDATA -Fp -Xs -P -R -S replica_slot -C
```

- **snapshot + log position** in one operation
- `-R` writes `standby.signal` + `primary_conninfo` so it starts as a standby
- `-S ... -C` creates a **replication slot** so the primary retains WAL for it
  (which is also how a dead replica fills the primary's disk — [3a-07](../../notes/3a-07-wal-and-durability.md))

> **A `pg_hba.conf` gotcha this lab hit:** the file is **first-match-wins**, and the official image's
> entrypoint appends `host all all all scram-sha-256`. Anything you append *after* it is shadowed. Also,
> `all` in the database column does **not** cover replication connections — they need their own
> `host replication` line. Both are why the compose file sets `POSTGRES_HOST_AUTH_METHOD=trust` *and* the
> init script adds a replication line.

---

## C1 · Baseline propagation delay

```
p50 0.89 ms   p95 10.76 ms   p99 11.27 ms   max 11.27 ms
```

Sub-millisecond on an idle local system. **That's exactly why lag bugs hide in development.** Lag isn't
constant — it spikes under load, which is C3.

## C2 · Read-your-own-writes — the anomaly, quantified ⭐

Write to the primary, immediately read the replica (what an app does when it round-robins reads):

```
191/200 reads did NOT see the user's own write   (95.5%)
```

**95.5%.** On an *idle, local* system. Every one of those is a user posting a comment and watching it vanish.

**The fix, measured:**
```
stale reads after the fix: 0/50
cost of waiting: p50 0.13 ms, p95 1.71 ms
```

The fix is an **LSN token**: capture `pg_current_wal_lsn()` at write time, then only read from a replica whose
`pg_last_wal_replay_lsn()` has passed it.

```js
const { rows } = await primary.query('SELECT pg_current_wal_lsn() AS lsn');
// later, on the read path:
'SELECT pg_last_wal_replay_lsn() >= $1::pg_lsn AS caught_up'
```

In production you don't *wait* — you hand that LSN to the router as a read token and it picks a replica that
has already caught up. The simpler variant most teams use: **pin that user's reads to the primary for a few
seconds after they write.**

## C3 · Lag under write load — seconds AND bytes

```
elapsed   time lag    bytes behind   write/flush/replay lag
1s        0.243 s     12.9 MB        0.0003 / 0.0005 / 0.303
2s        0.090 s      5.0 MB        0.0003 / 0.0006 / 0.111
4s        0.365 s      7.5 MB        0.0034 / 0.0051 / 0.213
...
peak:     0.365 s     12.9 MB
```

**Sub-millisecond at idle → 365 ms and 12.9 MB behind under load.** A 400× swing.

Note the three separate lags: **write** (received) / **flush** (on the replica's disk) / **replay** (visible
to queries). They're wildly different — write and flush are microseconds, **replay is 300 ms**. Replay is
what your users experience, and Postgres replays with a **single process**, which is why it's the one that
falls behind.

**Alert on both metrics:** seconds for user-visible staleness, **bytes for whether it will self-correct.**
Bytes-behind is the leading indicator.

## C4 · Sync vs async — the trade as a number

```
async (no synchronous standby)     p50  0.30 ms   p95  1.11 ms
SYNCHRONOUS standby, ANY 1         p50  0.43 ms   p95  1.08 ms
synchronous_commit = off           p50  0.11 ms   p95  0.37 ms
```

**Sync costs 0.12 ms per commit (1.4×) — over a local Docker network.** Across regions it's one full RTT:
**50–150 ms per commit**, which is a product-level latency change, not a tuning detail.

**What you buy:** RPO = 0. **What you pay:** every commit waits for a replica, and if the sync replica is
slow or down, **writes block entirely.** Hence `ANY 1 (a, b)` quorum form rather than naming one required
standby.

`synchronous_commit = off` is 2.7× faster than async — it skips even the *local* fsync, for a ~600 ms window
of committed-but-lost transactions.

---

# Failover ⭐

```bash
node lab-c-replication/failover.js
```

## The result

```
4,432  commits acknowledged while the replica was keeping up
       >>> docker stop the replica
10,862 MORE commits acknowledged while the replica was gone
       >>> SIGKILL the primary
15,295 total acknowledged
       >>> promote the replica

acknowledged by the old primary : 15,295
present on the promoted replica :  4,433
------------------------------------------
LOST                            : 10,862   (71.02%)
```

**10,862 transactions that the database acknowledged as committed are gone.** Users were told "your order
was placed."

**That is asynchronous replication working exactly as designed.** Your RPO is whatever hadn't shipped when
the primary died.

> ⚠️ **A methodology note worth reading, because the first two attempts taught the wrong lesson.**
>
> **Attempt 1:** kill the primary under normal load → **0 rows lost.** Single-row inserts over a local network
> replicate faster than they're generated, so the replica was never behind.
>
> **Attempt 2:** `docker pause` the replica first → **still 0 rows lost.** `pause` freezes the container's
> *processes*, but the **kernel keeps accepting data into the TCP socket buffer and ACKing at the transport
> layer.** The WAL still arrived; the replica just drained it on unpause.
>
> **Attempt 3:** `docker stop` the replica — which actually severs the connection → **71% loss.**
>
> The lesson isn't just about the lab. **A benchmark that shows no problem usually means your failure
> injection didn't work**, not that the system is safe. "We tested failover and lost nothing" is a claim to
> be suspicious of.

## Split brain — demonstrated, not described

After promotion, the script restarts the old primary:

```
OLD primary : 15,295 rows,  in_recovery = false
NEW primary :  4,433 rows,  in_recovery = false
```

**Both report `in_recovery = false`. Both believe they are the primary. They hold different datasets.**

If a load balancer or a stale DNS entry routed any client to the old node, it would accept writes and the
histories would diverge permanently. **No automatic process can merge them afterwards.**

**The fencing token, live:**
```
promoted replica timeline ID: 2      (was 1)
```

Postgres bumps the **timeline ID** on promotion. That's exactly the fencing-token mechanism from
[3c-04](../../notes/3c-04-failover.md): the old node **cannot rejoin as a replica** without `pg_rewind`,
because its history diverged at a known point. "The old primary won't rejoin after failover" is correct
behaviour, not a bug.

---

## Things to try

| Try | How | Expect |
|---|---|---|
| **Sync replication prevents the loss** | Set `synchronous_standby_names='ANY 1 (walreceiver)'`, re-run failover | Writes **block** while the replica is stopped — availability traded for RPO=0 |
| **`hot_standby_feedback` trade** | Run a long query on the replica while vacuuming the primary | Off → query cancelled ("conflict with recovery"). On → primary bloats. ([3b-03](../../notes/3b-03-mvcc.md)) |
| **Orphaned replication slot** | `docker stop` the replica, write heavily, watch `pg_replication_slots` | WAL retained forever → the primary's disk fills ([3a-07](../../notes/3a-07-wal-and-durability.md)) |
| **Monotonic reads** | Add a second replica; alternate reads between them | Data appears and disappears |
| **Rewind the old primary** | `pg_rewind` it back into the new timeline | The real recovery procedure |

```bash
docker compose -f docker-compose.replication.yml down -v
```
