# 08 · Pagination — Offset vs Cursor/Keyset

> **Why this exists:** the roadmap says *"know exactly why offset breaks at scale."* There are **two**
> independent reasons — one performance, one correctness — and most candidates only know the first. The
> correctness argument is the stronger one and almost nobody raises it.

---

## Reference

### Offset pagination

```sql
SELECT * FROM events ORDER BY created_at DESC LIMIT 20 OFFSET 500000;
```
```
GET /events?page=25001&per_page=20
```

**How the database executes this: it fetches and discards 500,000 rows, then returns 20.** `OFFSET` is not a
seek — there is no index structure that lets you jump to "the 500,000th row." The database walks the index
counting rows until it has skipped enough.

### Keyset (cursor) pagination

```sql
SELECT * FROM events
WHERE (created_at, id) < ($last_created_at, $last_id)   -- the cursor
ORDER BY created_at DESC, id DESC
LIMIT 20;
```
```
GET /events?after=eyJjcmVhdGVkX2F0IjoiMjAyNC0wMS0wMSIsImlkIjo5OTh9&limit=20
```

**The database seeks directly to the cursor position using the index, then reads 20 rows.** The work is
constant regardless of how deep you are.

### Reason 1 — performance

| Page depth | Offset: rows scanned | Keyset: rows scanned |
|---|---|---|
| Page 1 | 20 | 20 |
| Page 100 | 2,020 | 20 |
| Page 5,000 | 100,020 | 20 |
| Page 25,000 | **500,020** | **20** |

**Offset is O(offset + limit). Keyset is O(limit).** Latency grows linearly with page depth until deep pages
time out entirely. You measure exactly this in [`../lab/`](../lab/) Part B.

The reason it hides for so long: **page 1 is fast and page 1 is what everyone tests.** The cliff is only
reachable by crawlers, scrapers, export jobs, and the one customer who clicks "last page."

### Reason 2 — correctness (the one people miss)

**Offset pagination silently skips and duplicates rows when the underlying data changes between requests.**

Feed sorted newest-first. You read page 1 (rows 1–20). Someone posts a new item. You read page 2 (offset 20):

```
Before:  [A][B][C]...[T] | [U][V][W]...        ← page 1 = A..T
Insert N at the top:
After:   [N][A][B][C]...[S] | [T][U][V]...     ← page 2 (offset 20) starts at T
                                                  but you ALREADY SAW T on page 1
```

**T appears twice. And if a row is deleted instead, one row is skipped entirely — the user never sees it.**

On a high-write feed this isn't rare, it's constant. It produces:
- Duplicate items in infinite scroll (visible, annoying)
- **Silently missing items** (invisible, and much worse)
- **Data-integrity bugs in paginated export/sync jobs** — a nightly job paginating through records to sync
  them will skip rows, permanently, with no error

**Keyset pagination is immune** because the cursor is anchored to a *value*, not a *position*. "Give me
everything after `(2024-01-01 10:00, id 998)`" means the same thing regardless of what was inserted or
deleted elsewhere.

> **The interview line:** *"I'd use keyset pagination — not mainly for the performance, though `OFFSET
> 500000` does scan half a million rows. The bigger issue is correctness: with offset, any insert or delete
> between page requests shifts the window, so users see duplicates and, worse, silently miss rows. That's a
> data-loss bug in any paginated sync or export job."*

### The comparison

| | **Offset** | **Keyset / cursor** |
|---|---|---|
| Deep-page performance | ❌ O(offset) | ✅ O(limit) |
| Stable under concurrent writes | ❌ Skips & duplicates | ✅ Stable |
| Jump to arbitrary page ("page 500") | ✅ | ❌ **Cannot** |
| Show total page count | ✅ (needs a COUNT) | ❌ Usually omitted |
| Jump backwards | ✅ | ➖ Needs a reverse cursor |
| Implementation | Trivial | Moderate |
| Sort by arbitrary/multiple columns | ✅ Easy | ➖ Needs the sort key in the cursor + a matching index |
| **Requires a unique tiebreaker** | No | **Yes** |

### The tiebreaker requirement — the bug everyone hits

If you paginate on a non-unique column, keyset breaks at the boundary:

```sql
-- BROKEN: 50 rows share the same created_at
WHERE created_at < $last_created_at          -- skips the rest of that timestamp's rows
```
```sql
-- CORRECT: append a unique tiebreaker
WHERE (created_at, id) < ($last_created_at, $last_id)
ORDER BY created_at DESC, id DESC
```

**The sort key must be unique, and the index must match the sort order exactly.** In Postgres the row-value
comparison `(a, b) < (x, y)` is directly index-usable — that's the idiom to know.

This is also why **time-sortable IDs (UUIDv7, ULID, Snowflake) are so convenient**: one column that is both
unique and chronologically ordered, so your cursor is a single value. → Phase 9.

### Cursor design

**Encode, don't expose.** Base64 the cursor payload so clients treat it as opaque:

```json
{"created_at":"2024-01-01T10:00:00Z","id":998,"v":1}
```
→ `eyJjcmVhdGVkX2F0IjoiMjAyNC0wMS0wMVQxMDowMDowMFoiLCJpZCI6OTk4LCJ2IjoxfQ==`

| Practice | Why |
|---|---|
| **Opaque (base64/encrypted)** | Clients can't construct or depend on the internals; you can change the format |
| **Version field** | Lets you evolve the cursor format without breaking in-flight clients |
| **Include the sort spec** | Prevents "sort changed mid-pagination" producing nonsense |
| **Sign or encrypt it** | Stops clients from tampering to read other tenants' data |
| **Return `next_cursor: null` at the end** | Unambiguous termination |
| **Cap `limit`** | `limit=100000` is a denial-of-service vector |

**Response shape:**
```json
{
  "data": [...],
  "page": { "next_cursor": "eyJ...", "has_more": true }
}
```

### When offset is genuinely fine

Don't over-engineer — say this out loud, it shows judgement:

- **Small, bounded datasets** (< ~10 K rows). The scan is trivial.
- **Admin/back-office tools** where users legitimately want "jump to page 47" and total counts
- **Static or slow-changing data** where the correctness issue can't arise
- **Search results**, where relevance ranking means position is inherently unstable anyway — though note that
  Elasticsearch caps `from + size` at 10,000 by default for exactly this reason, and pushes you to
  `search_after` (which is keyset) for deep paging

### Related patterns

| Pattern | Use |
|---|---|
| **Seek + count separately** | Keyset for the data, a cached/approximate `COUNT` for the UI |
| **Approximate counts** | `reltuples` in Postgres, or "about 12,000 results" — an exact deep count is expensive |
| **Snapshot pagination** | Pin to a point-in-time (ES PIT, DB snapshot) so results are stable for an export |
| **Time-bucketed** | For feeds: paginate by day/hour buckets rather than a global cursor |
| **Deep paging limits** | Just cap it: "results beyond 10,000 aren't available — refine your search." Google does this. |

---

## In your own words

**Explain the two independent reasons offset pagination breaks at scale. Which is more serious and why?**

>

**Walk through the exact sequence where offset pagination causes a user to silently miss a row.**

>

**Why does keyset pagination need a unique tiebreaker? Show the broken query and the fixed one.**

>

**Why should a cursor be opaque? Give two concrete failure modes of exposing its internals.**

>

**When is offset pagination the right call? Name two cases.**

>

**Your nightly sync job paginates 2 M records with OFFSET and occasionally misses some. Explain the bug to the team.**

>

---

## Links

- Time-sortable IDs that make cursors trivial (UUIDv7, Snowflake) → **Phase 9**
- Deep paging in Elasticsearch → Phase 9
- Distributed pagination across shards (much harder) → Phase 3D
- **Watch it fall off a cliff yourself** → [`../lab/`](../lab/) Part B
