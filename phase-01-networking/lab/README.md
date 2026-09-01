# Phase 1 Lab — API Styles & Pagination

> Roadmap assignment: *"Implement the same tiny endpoint three ways: REST/JSON, gRPC, and SSE. Compare
> payload size and latency. Then implement cursor pagination over a 1 M-row table and compare
> `LIMIT 500000 OFFSET` against keyset — watch it fall off a cliff."*

**Time: ~3 hrs total.** Docker only — everything installs inside containers.

---

## What's here

```
lab/
├── docker-compose.yml
├── part-a-api-styles/
│   ├── product.proto      ← the shared schema
│   ├── server.js          ← REST + SSE on :3000, gRPC on :50051
│   └── client.js          ← the benchmark; prints both tables
├── part-b-pagination/
│   ├── seed.js            ← 1M rows into Postgres
│   ├── bench.js           ← REASON 1: the performance cliff (+ EXPLAIN ANALYZE)
│   └── correctness.js     ← REASON 2: duplicates and silent skips
└── RESULTS.md             ← ⚠️ fill this in
```

```bash
cd phase-01-networking/lab
docker compose up -d --build
docker compose ps            # both should be healthy
```

> **Note:** Postgres is published on host port **5433**, not 5432, because 5432 is commonly taken by an
> existing local Postgres or container. Inside the compose network it's still 5432.

---

# Part A — the same endpoint, three ways

```bash
docker compose run --rm bench
```

## A1 · Single fetch — REST/JSON vs gRPC/protobuf

**Reference result:**

| Style | Payload | p50 | p95 | p99 |
|---|---|---|---|---|
| REST / JSON | **337 B** | 2.41 ms | 3.53 ms | 4.39 ms |
| gRPC / protobuf | **211 B** | 0.67 ms | 1.88 ms | 3.77 ms |

**protobuf is 37% smaller for the identical object.**

**Where the saving comes from** — open [`product.proto`](part-a-api-styles/product.proto) and look at the
field numbers:

```
JSON:      {"price_cents":129900,...}     ← ships the KEY NAME as text, every time
Protobuf:  <tag 0x20><varint 129900>      ← ships field NUMBER 4 as one byte
```

JSON re-transmits `"description"`, `"review_count"`, `"updated_at"` on every single response, forever.
Protobuf sends a one-byte tag. **The schema is the compression.**

> ⚠️ **Do not over-read the latency column.** Both run over loopback in the same Docker network, so you're
> measuring process overhead, not encoding. The honest claim from this experiment is about **payload size**.
> The latency win of protobuf is real but shows up at scale (parse CPU) and over real networks, neither of
> which this measures. Being clear about what your benchmark does *not* prove is itself a senior habit.

## A2 · 100 updates delivered — the comparison that actually matters

**Reference result:**

| Transport | Connections | Total bytes | Bytes/update | Wall time |
|---|---|---|---|---|
| REST polling | **100** | **111.0 KB** | 1.1 KB | 260.98 ms |
| SSE | **1** | **7.3 KB** | 74 B | 12.54 ms |
| gRPC streaming | **1** | **2.1 KB** | 22 B | 10.29 ms |

**SSE moves 15× fewer bytes than polling. gRPC streaming, 52× fewer.**

### The insight

The product payload is only ~337 B, but polling costs **1.1 KB per update**. The difference is **HTTP
headers — ~800 B of them, re-sent on every single request.** `Host`, `User-Agent`, `Accept`, `Cookie`,
`Content-Type`, `Date`, `Server`…

**At high update rates, the headers *are* the payload.** That single sentence is the argument for streaming
transports, and it's much more persuasive than "SSE is more efficient."

Note also **connections: 100 vs 1.** Each poll is a fresh request — and if connections weren't being reused,
each would also pay a TCP handshake (note 02).

### Things to try

| Try | Command | What you should see |
|---|---|---|
| Higher update count | `docker compose run --rm -e UPDATES=1000 bench` | The gap widens linearly — header overhead is per-request |
| **Watch SSE raw on the wire** | `curl -N "localhost:3000/sse/products/1/price?count=5&interval=500"` | The `id:` / `event:` / `data:` frame format, arriving live |
| **Resume from an event ID** | `curl -N -H "Last-Event-ID: 42" "localhost:3000/sse/products/1/price?count=5"` | Resumes at 43. **This is SSE's built-in replay** — with WebSockets you build it yourself. |
| Compare a single REST call | `curl -i localhost:3000/rest/products/1` | Check `x-json-bytes` vs `x-protobuf-bytes` |

---

# Part B — pagination falling off a cliff

```bash
docker compose run --rm pagination node seed.js         # ~3s for 1M rows / 186 MB
docker compose run --rm pagination node bench.js        # REASON 1: performance
docker compose run --rm pagination node correctness.js  # REASON 2: correctness
```

## B1 · Reason 1 — performance

**Reference result** (1 M rows, index on `(created_at DESC, id DESC)`, page size 20, median of 5):

| Page depth (OFFSET) | OFFSET time | Rows scanned | KEYSET time | Rows scanned |
|---|---|---|---|---|
| 0 | 0.3 ms | 20 | 0.3 ms | 20 |
| 1,000 | 0.3 ms | 1,020 | 0.3 ms | 20 |
| 10,000 | 0.7 ms | 10,020 | 0.2 ms | 20 |
| 100,000 | 6.0 ms | 100,020 | 0.1 ms | 20 |
| 500,000 | 33.4 ms | 500,020 | 0.3 ms | 20 |
| 900,000 | **61.6 ms** | **900,020** | **0.3 ms** | **20** |

**OFFSET got 195× slower. KEYSET stayed flat. At the deepest page, keyset is 202× faster.**

### The `EXPLAIN ANALYZE` is the proof

```
OFFSET 500000:
  Limit  (actual time=55.838..55.841 rows=20 loops=1)
    Buffers: shared hit=10540                          ← 10,540 pages read
    ->  Index Only Scan  (actual time=0.013..45.575 rows=500020 loops=1)
          Heap Fetches: 500020                         ← half a million rows touched

KEYSET at the same depth:
  Limit  (actual time=0.015..0.017 rows=20 loops=1)
    Buffers: shared hit=5                              ← 5 pages
    ->  Index Only Scan  (actual time=0.014..0.017 rows=20 loops=1)
          Index Cond: (ROW(created_at, id) <= ROW(...))  ← SEEKS to the cursor
          Heap Fetches: 20
```

**10,540 buffers vs 5.** Same table, same index, same 20 rows returned.

**The critical detail: both queries use the same index.** OFFSET isn't slow because it lacks an index —
it's slow because **`OFFSET` is not a seek.** There is no structure that can jump to "the 500,000th row";
the database must walk the index counting rows and discarding them. `Index Cond` appears only in the keyset
plan, and that's the whole difference.

## B2 · Reason 2 — correctness (the argument almost nobody makes)

**Reference result:**

```
SCENARIO 1 — rows INSERTED between page reads
  offset page 1  -> 20 rows, ids 1..20
  ...5 new rows arrive at the top
  offset page 2  -> ❌ DUPLICATES: ids 16, 17, 18, 19, 20 appeared on BOTH pages

  keyset page 1  -> 20 rows, last id 20
  ...same 5 rows arrive
  keyset page 2  -> ✅ NO DUPLICATES

SCENARIO 2 — rows DELETED between page reads
  offset page 1  -> ids 1 .. 20
  ...5 rows deleted from the top
  offset page 2  -> ids 26 .. 45
  ❌ SILENTLY SKIPPED: ids 21, 22, 23, 24, 25 still exist but appeared on NO page
```

**Scenario 2 is the serious one.** Five rows that still exist were never returned by any page. Nothing
errored. No exception, no warning, no log line.

**Now imagine that's your nightly sync job** paginating 2 M records into a warehouse, or your export
endpoint, or your "migrate all users" script. It silently drops records, and you find out months later when
the numbers don't reconcile.

> **This is why the correctness argument beats the performance argument.** Slow queries get noticed. Missing
> rows don't.

**The mechanism, in one line:** `OFFSET` addresses a **position** in a result set that is still changing.
A cursor addresses a **value**, which means the same thing regardless of what was inserted or deleted
elsewhere.

### Things to try

| Try | How |
|---|---|
| See the broken tiebreaker bug | Change the keyset query in `correctness.js` to use `WHERE created_at < $1` only (drop `id`). Insert rows with identical timestamps. Watch rows vanish at page boundaries. |
| Bigger table | `docker compose run --rm -e ROWS=5000000 pagination node seed.js`, then re-run `bench.js`. The cliff scales linearly. |
| Query it directly | `psql postgresql://lab:lab@localhost:5433/lab` |

---

## Now write it down

Fill in [`RESULTS.md`](RESULTS.md) with **your** numbers.

```bash
docker compose down -v      # -v also drops the 1M-row volume
```
