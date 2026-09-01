# 09·08 · Geospatial Indexing

> **Why this exists:** "find drivers near me", "restaurants within 2 km", "who's in this delivery zone" — and
> ⭐ **the core trick generalises far beyond maps: turn 2-D proximity into a 1-D range query so an ordinary
> B-tree can serve it.**

---

## Reference

### The problem

`WHERE lat BETWEEN … AND lng BETWEEN …` cannot use two B-tree indexes well: ⭐ **a composite index on
`(lat, lng)` only narrows on `lat`**, then scans. And a bounding box isn't a circle, so you still filter by
real distance afterwards.

### ⭐ Geohash — the one to explain

**Recursively bisect the world and interleave the bits of latitude and longitude, then base32-encode.**

```
gcpvj0…      each extra character = a smaller cell
g         ±2500 km        gcpv      ±20 km
gc        ±630 km         gcpvj     ±2.4 km
gcp       ±78 km          gcpvj0    ±0.6 km
```

⭐ **THE PROPERTY THAT MATTERS: nearby points share a prefix.** So *"find things near me"* becomes
`WHERE geohash LIKE 'gcpvj%'` — ⭐ **a prefix range scan on an ordinary B-tree or a sorted key-value store.**
No special index type required, which is why geohash shows up in Redis, DynamoDB, HBase and plain Postgres.

⚠️ **Two failure modes you must name:**

| | |
|---|---|
| ⭐ **The edge problem** | Two points **10 m apart across a cell boundary share NO prefix.** ⭐ **Always query the cell PLUS its 8 NEIGHBOURS** — every geohash library has a `neighbors()` for exactly this |
| ⚠️ **Cells aren't square** | They're lat/lng rectangles, so a "1 km cell" is a very different shape in Singapore than in Norway |

### The alternatives, and when each wins

| | Idea | Strength | Watch |
|---|---|---|---|
| ⭐ **Geohash** | interleaved bits → prefix | ⭐ **works in any sorted store; trivial to explain** | edges, non-square cells |
| **Quadtree** | recursive 4-way split, ⭐ **splits only where data is dense** | ⭐ adapts to density — good for wildly uneven data | a tree to maintain; rebalancing |
| ⭐ **S2** (Google) | ⭐ **projects the sphere onto a CUBE**, then a Hilbert curve | ⭐ **near-uniform cell size everywhere; excellent locality** | more complex |
| ⭐ **H3** (Uber) | ⭐ **HEXAGONS** | ⭐ **all 6 neighbours are EQUIDISTANT** — ideal for flow/aggregation | ⚠️ hexes don't subdivide perfectly (approximate hierarchy) |
| **R-tree / PostGIS GiST** | bounding boxes | ⭐ **handles polygons, not just points**; real distance/containment ops | a real spatial index |

> ⭐ **THE ANSWER THAT SCORES: "PostGIS with a GiST index unless I have a reason not to."** Real distance
> functions, polygons, `ST_DWithin`, kNN ordering, no edge-case hand-rolling. ⭐ **Reach for geohash/S2/H3
> when you need proximity in a store that has NO spatial index** — Redis, DynamoDB, Cassandra, Kafka keys —
> which is the actual reason they exist.

⭐ **Why hexagons (H3):** with squares, the 4 edge-neighbours are closer than the 4 corner-neighbours, so any
"spread to neighbours" analysis is distorted. **Hexagons have 6 neighbours all at the same distance** — which
is why Uber uses them for surge pricing and supply/demand aggregation, not just lookup.

### ⭐ Radius search vs kNN — different queries

| | |
|---|---|
| **Radius** ("within 2 km") | ⭐ **bounded work** — the cell + neighbours, then filter by true distance. Result count is unbounded |
| ⭐ **kNN** ("nearest 10") | ⚠️ **unbounded search** — if the area is empty you must expand outward. ⭐ **Expand ring by ring, and CAP the expansion**, or a user in the Atlantic scans the planet |

⭐ **Always do a real distance filter after the cell lookup.** The cell is a *candidate generator*, not the
answer — and Haversine (or PostGIS `ST_Distance`) is what actually decides.

### ⭐ Moving objects — the hard version

"Find drivers near me" means **positions updating every few seconds**, which is a **write** problem, not a
read problem:

| | |
|---|---|
| ⭐ **Keep live positions in memory/Redis, not the primary DB** | 100k drivers × 1 update/4 s = 25k writes/s of data that's stale in seconds — ⭐ **never durable-write that** |
| **Redis `GEOADD`/`GEOSEARCH`** | geohash in a sorted set; ⭐ **exactly this use case, and it's ~15 lines** |
| ⭐ **Shard by geohash prefix** | a city's drivers live on one node → local queries. ⚠️ Hot cells (an airport, a stadium) need finer splitting |
| **Only persist what matters** | trip history, yes; every 4-second ping, no (or → Kafka → cold storage) |
| **Map matching** | snapping a noisy GPS trace to the road network — a separate, genuinely hard problem (HMM/Viterbi). ⭐ **Name it, don't design it** |

### Geo-sharding and the other traps

⭐ **Shard by geo cell**, so a proximity query touches one or a few shards rather than fanning out to all.
⚠️ **But population is wildly non-uniform** — Manhattan vs Montana. ⭐ **Use variable-precision cells: split
dense cells further** (this is exactly what a quadtree does, and why S2 cell IDs come in levels).

⚠️ Other things worth a sentence: **the antimeridian and the poles break naive bounding boxes** ·
**straight-line distance ≠ travel time** (⭐ *"nearest by road, not by crow"* is usually what the product
means) · **privacy** — precise location is sensitive data; store fuzzed/coarse cells where you can
([Phase 10](../../ROADMAP.md)).

---

## In your own words

**⭐ Why can't two B-tree indexes serve a proximity query well?**

>

**⭐ Explain geohash in two sentences, including the property that makes it useful.**

>

**⭐ Name the edge problem and the fix. Why aren't cells square?**

>

**Quadtree vs S2 vs H3 — one strength each.**

>

**⭐ Why hexagons?**

>

**⭐ What's your default answer, and when do you reach for geohash instead?**

>

**Radius vs kNN — which is unbounded, and what do you do about it?**

>

**Why is the cell lookup only a candidate generator?**

>

**⭐ Why are moving objects a write problem, and where do live positions belong?**

>

**What breaks when you shard by geography, and what's the fix?**

>

---

## Links

- B-tree range scans → [Phase 3A](../../phase-03-databases/notes/)
- Redis sorted sets (`GEOADD` is one) → [Phase 5](../../phase-05-caching/notes/)
- Sharding and hot partitions → [Phase 3D](../../phase-03-databases/notes/)
- Turning 2-D into a 1-D key — the same instinct → [01-unique-ids.md](01-unique-ids.md)
- High-rate position updates → [11-websocket-infrastructure.md](11-websocket-infrastructure.md)
- Location is sensitive data → Phase 10
