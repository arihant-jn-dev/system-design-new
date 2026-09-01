# 09·15 · Analytics & Aggregation Pipelines

> **Why this exists:** *"and show the customer a dashboard"* is bolted onto half of all design questions.
> ⭐ **The instinct that matters: an analytical query has nothing in common with a transactional one, so
> don't run it on the same system.**

---

## Reference

### ⭐ OLTP vs OLAP — why the split exists

| | **OLTP** | ⭐ **OLAP** |
|---|---|---|
| Query | *"this user's last 10 orders"* | *"revenue by region by day for 2 years"* |
| Touches | a few rows, many columns | ⭐ **billions of rows, 3 columns** |
| Storage | ⭐ **row-oriented** | ⭐ **COLUMN-oriented** |
| Optimised for | point lookups, writes | ⭐ **scans and aggregates** |
| Users | your product | analysts, dashboards |

> ⭐ **Column storage is the whole trick.** `SELECT sum(amount) GROUP BY region` reads **two columns instead
> of every row**, and a column of similar values compresses ~10× — so it's often **50–100× less I/O** for
> the same answer. **Say the mechanism, not just the word "columnar."**

⚠️ **Running analytics on your production database is the mistake to name:** a full-table scan evicts your
OLTP working set from the buffer cache, and one analyst's `GROUP BY` degrades every user's request.
⭐ **Even a read replica only fixes the locking, not the fundamental storage mismatch.**

### ⭐ Pre-aggregation and roll-ups

⭐ **The core technique: don't scan raw events at query time. Aggregate once, on write, into progressively
coarser tables.**

```
raw events  ──▶ 1-minute rollups ──▶ hourly ──▶ daily ──▶ monthly
  (30 days)        (90 days)         (1 yr)     (forever)
```

⭐ **A dashboard query hits the coarsest table that can answer it** — so "revenue this year by month" reads
12 rows, not 4 billion.

| Design point | |
|---|---|
| ⭐ **Roll-ups must be idempotent and re-runnable** | late data and reprocessing are normal |
| ⭐ **Choose ADDITIVE measures where you can** | sums and counts roll up trivially; ⚠️ **averages and percentiles DO NOT** — ⭐ **store `sum` and `count` and divide at read time; use t-digest/HLL sketches for percentiles and uniques** ([04](04-probabilistic-structures.md)) |
| ⭐ **Sketches make non-additive measures roll up** | ⭐ **an HLL per hour merges into a day losslessly; unique counts do not sum** |
| **Lifecycle raw data** | keep raw for a reprocessing window, then drop it |

⭐ **"You cannot average an average, and you cannot sum a unique count"** is a small sentence that reliably
signals you've done this for real.

### The stores

| | Strength | Watch |
|---|---|---|
| ⭐ **ClickHouse** | ⭐ **extraordinarily fast scans, simple ops, cheap** | ⚠️ weak updates/deletes; joins are improving but not its strength |
| **Druid** | real-time ingest + sub-second slice-and-dice | complex to operate |
| **Pinot** | designed for ⭐ **user-facing** analytics at high QPS | complex |
| **BigQuery / Snowflake / Redshift** | serverless-ish, huge scale, SQL | ⚠️ **per-query cost — an unbounded dashboard query can be expensive** |
| ⭐ **Postgres + roll-up tables** | ⭐ **honestly fine to surprisingly large scale, and one fewer system** | won't scan billions |

> ⭐ **Start with roll-up tables in the database you already have.** Adding ClickHouse on day one is
> [build-vs-buy](../../phase-08-architecture/notes/14-build-vs-buy.md) failure in the other direction —
> operational weight for a problem you don't yet have.

### ⭐ Lambda vs Kappa, applied

| | |
|---|---|
| ⚠️ **Lambda** | a batch layer *and* a streaming layer, results merged. ⭐ **Two implementations of the same business logic — the maintenance tax people regret** |
| ⭐ **Kappa** | ⭐ **streaming only; reprocess by REPLAYING the log.** One codebase. ⭐ **The modern default when log retention allows it** |

⭐ **Kappa's requirement is that your log is replayable and long-retained** — which is exactly what Kafka
compaction/retention gives you ([Phase 6](../../phase-06-messaging/notes/)). **That's the trade: storage in
exchange for deleting an entire codebase.**

### ⭐ Event collection — where correctness is actually lost

```
client SDK ─▶ collector ─▶ Kafka ─▶ ├─ stream aggregation ─▶ real-time rollups
                                    └─ raw archive (S3)  ─▶ batch reprocessing
```

⚠️ **The traps:**

- ⭐ **Client clocks are wrong.** Record **both** `event_time` (client) and `ingest_time` (server), and be
  explicit about which one you aggregate by — ⭐ **this decision silently changes every number on the
  dashboard**
- ⭐ **Late and out-of-order data is normal** (mobile offline for hours). ⭐ **Windowing needs a watermark and
  an allowed-lateness policy, plus a way to restate a closed window**
- **Duplicates** — at-least-once again; dedupe by event ID ([14](14-idempotency-and-dedupe.md))
- ⭐ **Schema evolution** — a registry with enforced compatibility, or your pipeline breaks on a client
  release you don't control ([Phase 8 note 11](../../phase-08-architecture/notes/11-api-evolution-and-contract-testing.md))
- ⚠️ **Bot and internal traffic** inflate everything — filter, and ⭐ **keep the filter versioned, because
  changing it changes history**

### ⭐ User-facing analytics is a different product

⚠️ **An internal dashboard for 20 analysts and a customer-facing one for 100,000 tenants are not the same
system.** User-facing needs: high QPS, ⭐ **strict per-tenant isolation** (tenant_id leading every key —
[Phase 8 note 10](../../phase-08-architecture/notes/10-multi-tenancy.md)), predictable sub-second latency,
and ⭐ **query cost limits so one tenant's date range can't melt the cluster.**

⭐ **This is where Pinot/Druid earn their keep — and where "just point Metabase at the replica" definitively
does not.**

---

## In your own words

**⭐ Why is column storage so much faster for aggregates? Give the mechanism.**

>

**⭐ Why is running analytics on your production DB bad — and why doesn't a read replica fix it?**

>

**Explain roll-ups. What does a dashboard query actually read?**

>

**⭐ Which measures roll up trivially and which don't? What do you store instead?**

>

**⭐ Say the sentence about averages and unique counts.**

>

**Lambda vs Kappa. What does Kappa require, and what does it buy?**

>

**⭐ Why record both event_time and ingest_time?**

>

**What does late data require of your windowing?**

>

**⭐ Why is user-facing analytics a different system, and what does it need?**

>

**⭐ What would you actually build first?**

>

---

## Links

- Kafka, replay, retention, compaction → [Phase 6](../../phase-06-messaging/notes/)
- HLL and t-digest — how non-additive measures roll up → [04-probabilistic-structures.md](04-probabilistic-structures.md)
- CQRS — the same read/write split → [Phase 8 note 05](../../phase-08-architecture/notes/05-cqrs.md)
- Kappa, batch DAGs, workflow engines → [Phase 8 note 13](../../phase-08-architecture/notes/13-workflow-engines.md)
- Per-tenant isolation → [Phase 8 note 10](../../phase-08-architecture/notes/10-multi-tenancy.md)
- Dedupe by event ID → [14-idempotency-and-dedupe.md](14-idempotency-and-dedupe.md)
- Counters, trending, heavy hitters → [05-counters-at-scale.md](05-counters-at-scale.md)
