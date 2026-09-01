# Phase 2 Lab — Load Balancing & Consistent Hashing

> Roadmap assignment: *"`docker compose` with nginx + 3 identical app containers. Kill one mid-load-test and
> watch the error rate. Then implement consistent hashing in ~50 lines and verify that adding a node moves
> ~1/N of keys, not all of them."*

**Time: ~3.5 hrs.** Part A needs Docker; **Part B is plain Node — just run it.**

---

## What's here

```
lab/
├── docker-compose.yml
├── part-a-load-balancing/
│   ├── nginx/nginx.conf     ← read the comments; the config IS the lesson
│   └── app/server.js        ← breakable at runtime: healthy | error | hang
├── part-b-consistent-hashing/
│   └── hashing.js           ← the algorithm + 5 experiments. No deps.
├── k6/load.js               ← open-model, counts requests per instance
└── RESULTS.md               ← ⚠️ fill this in
```

---

# Part A — one load balancer, three ways to break a backend

```bash
cd phase-02-stateless-scaling/lab
docker compose up -d
docker compose ps          # 3 apps healthy + nginx
curl localhost:8080/api/work
```

Ports: nginx on **8080**, and each replica directly on **8081 / 8082 / 8083** so you can inject failures.

## The point of this lab

"Kill a backend and watch the error rate" is the assignment, and doing it produces a **surprising result**.
So the lab breaks a replica in **three distinct ways**, because *"a backend failed"* is not one failure mode:

| Break | What the LB sees | Fast to detect? |
|---|---|---|
| **Crash** (`docker kill`) | Connection refused | ✅ Instantly |
| **Errors** (HTTP 500) | A valid HTTP response | ⚠️ Depends entirely on config |
| **Hang** (no response) | ...nothing. Still waiting. | ❌ **This is the gray failure** |

## A1 · Baseline

```bash
docker compose run --rm k6 run -e RPS=200 -e DURATION=20s /scripts/load.js
```

**Reference result:**
```
served_app1: 1334    served_app2: 1334    served_app3: 1333
http_req_failed: 0.00%     med=9.83ms  p(99)=14.26ms
```
Round robin, exactly even. Note the per-instance counters — the load test reads the `x-instance` header, so
you see distribution directly rather than inferring it.

## A2 · Kill a replica mid-test — the surprise

```bash
( sleep 8; docker kill lab-app2-1 ) &
docker compose run --rm k6 run -e RPS=200 -e DURATION=25s /scripts/load.js
```

**Reference result:**
```
http_req_failed: 0.00%   ←  ZERO errors. checks_succeeded 100%.
served_app1: 2269   served_app2: 462   served_app3: 2269
med=9.73ms   p(99)=15.53ms   max=1s     ←  the ONLY trace of the failure
```

**You killed a third of the fleet under load and no user saw an error.**

**Why:** nginx's default `proxy_next_upstream error timeout` transparently retried each connection-refused
request against a healthy upstream. The only evidence is `max=1s` — one request paid the 1 s
`proxy_connect_timeout` before being retried.

**What to take from this:**
- Retry at the LB is *extremely* effective for crash failures — and it's on by **default**, which is why the
  naive version of this experiment is anticlimactic.
- **But it's only safe because these requests are idempotent.** Retrying a `POST /payments` after a timeout
  is how you double-charge someone ([Phase 1 note 09](../../phase-01-networking/notes/09-idempotency.md)).
  Real configs restrict `proxy_next_upstream` to `GET`/idempotent methods, or require an idempotency key.
- Retries hide failures **from users** and **from your error-rate dashboards**. Watch latency and upstream
  metrics, not just 5xx.

## A3 · Make a replica return 500s — and watch nginx not care

```bash
( sleep 8; curl -XPOST localhost:8082/admin/mode -d '{"mode":"error"}' ) &
docker compose run --rm k6 run -e RPS=200 -e DURATION=25s /scripts/load.js
```

**Reference result:**
```
http_req_failed: 24.09%   ←  a QUARTER of all requests failed
served_app1: 1668    served_app2: 1666    served_app3: 1667
```

**Look at `served_app2`: 1666. It kept receiving its full one-third share the entire time.**

**nginx never took the broken replica out of rotation.** Why not? Two things people conflate:

1. `proxy_next_upstream error timeout` doesn't include `http_500`, **so nginx retried nothing.**
2. **`max_fails` only counts failures that match `proxy_next_upstream`.** Since a 500 isn't in that list,
   nginx considers the proxying a *success* — the backend answered! So the passive health check never
   incremented, and the replica was never ejected.

> **This is a genuinely important operational fact: by default, nginx does not treat an HTTP 500 as a backend
> failure.** A replica can return errors forever and remain in the pool. If your mental model was "the load
> balancer will notice and pull it out," this is where that breaks.

**The fix — verified:**
```nginx
proxy_next_upstream error timeout http_500;
```
```bash
# edit nginx.conf, then (bind-mounted single files need a recreate, not a reload):
docker compose up -d --force-recreate nginx
```
**Result: `http_req_failed: 0.00%`**, and app2's count drops to 475 while app1/app3 absorb the rest
(2262 / 2263).

**The trade you just made:** errors vanished, but your two survivors now carry 150% of their normal load.
**Retry converts an availability problem into a capacity problem.** If you were running at 70% utilisation,
you now aren't. That's the sentence to say in an interview.

## A4 · Make a replica hang — the gray failure ⭐

**This is the most important experiment in the phase.**

```bash
( sleep 8; curl -XPOST localhost:8082/admin/mode -d '{"mode":"hang"}' ) &
docker compose run --rm k6 run -e RPS=200 -e DURATION=25s /scripts/load.js

# while it's hanging, in another terminal:
curl localhost:8082/health
```

**Reference result:**
```
http_req_failed: 0.00%          ←  error rate: PERFECT
med=9.71ms                      ←  median: PERFECT (unchanged from baseline)
avg=61.55ms
p(99)=2.01s                     ←  p99: 143x WORSE
max=2.06s

curl localhost:8082/health  →  {"ok":true,"instance":"app2","mode":"hang"}
                                    ↑ health check: GREEN, while hanging
```

**Every signal you'd normally page on is green:**

| Signal | Reading | Verdict |
|---|---|---|
| Error rate | 0.00% | ✅ perfect |
| Median latency | 9.71 ms | ✅ unchanged |
| Health check | 200 OK | ✅ green |
| **p99 latency** | **2.01 s** | ❌ **143× regression** |

**This is a gray failure** ([Phase 0 note 06](../../phase-00-foundations/notes/06-reliability-fault-tolerance-resilience.md)):
the process is alive, accepting connections, and answering health checks — while being useless.

**Why the p99 is exactly ~2 s:** that's `proxy_read_timeout 2s`. nginx waits the full 2 seconds, gives up,
then retries on a healthy upstream (`timeout` *is* in the default `proxy_next_upstream`). The user gets a
correct answer — after two seconds.

**The lessons, and they're the phase's most valuable:**

1. **Alert on p99, not on error rate or median.** Both looked perfect here.
2. **A shallow health check cannot detect slowness.** It's still the right check for LB rotation
   ([note 05](../../phase-02-stateless-scaling/notes/05-health-checks.md)) — but you need **latency-based
   outlier ejection** to catch this, which nginx OSS doesn't have and Envoy does.
3. **Your timeout value directly sets your p99 under this failure.** Try `proxy_read_timeout 60s` (the nginx
   default!) and re-run — the p99 becomes 60 s and connections pile up until you exhaust the worker pool.
   **This is why "always set a timeout, and pick it from the dependency's p99" matters**
   ([Phase 1 note 11](../../phase-01-networking/notes/11-timeouts-retries-backoff.md)).

### The complete picture

| Experiment | Failure | Error rate | Median | p99 | Ejected? |
|---|---|---|---|---|---|
| A1 baseline | — | 0% | 9.83 ms | 14.3 ms | — |
| A2 crash | SIGKILL | **0%** | 9.73 ms | 15.5 ms | n/a (conn refused) |
| A3 errors | HTTP 500 | **24.1%** | 8.61 ms | 14.0 ms | ❌ **never** |
| A4 **hang** | no response | **0%** | 9.71 ms | **2.01 s** | ❌ never |
| A5 errors + fix | HTTP 500 | **0%** | 9.59 ms | 13.1 ms | ✅ effectively |

**The crash — the one the assignment asks about — was the least damaging of the three.**

## Bonus

| Try | How | Expect |
|---|---|---|
| **Graceful drain vs kill** | `docker stop lab-app2-1` (SIGTERM) vs `docker kill` | Watch the logs: it fails its health check, waits `DRAIN_MS`, *then* closes. Remove the wait from `server.js` and see 502s appear. |
| **Timeout sets your p99** | `proxy_read_timeout 60s`, re-run A4 | p99 → 60 s, workers exhaust |
| **Two broken replicas** | Set app2 *and* app3 to `error` | Only one healthy backend left; retries can't save you |
| **Watch ejection happen** | `mode=hang` on app2, then tail `docker logs p2-nginx` | `upstream timed out` messages |

---

# Part B — consistent hashing

**No Docker needed:**

```bash
node part-b-consistent-hashing/hashing.js
```

## B1 · Adding a node — how many keys move?

**Reference result** (100,000 keys, 3 nodes → 4):
```
modulo  hash(key) % N     keys moved: 75.1%
consistent hashing        keys moved: 25.0%
theoretical minimum (1/N with N=4):   25.0%
```

**Consistent hashing hits the theoretical minimum exactly.** Modulo moves 3× more keys than necessary.

**If these were cache keys, the modulo row is an outage:** 75% of your cache misses simultaneously, and every
one of those requests hits the database. **Adding a cache node takes down your database.**

## B2 · It gets *worse* as the cluster grows

```
nodes N -> N+1     modulo moved    consistent moved    ideal 1/(N+1)
  3 -> 4              75.1%             25.6%             25.0%
  5 -> 6              83.3%             16.4%             16.7%
 10 -> 11             91.0%              9.7%              9.1%
 20 -> 21             95.2%              4.7%              4.8%
 50 -> 51             98.0%              2.0%              2.0%
```

**Modulo approaches 100% as the cluster grows** — the bigger your cluster, the more catastrophic adding one
node becomes. Consistent hashing tracks 1/N. Note the perverse incentive modulo creates: **scaling up causes
an outage, so teams stop scaling.**

## B3 · What virtual nodes actually do — and their limit

```
1 vnode per node:     spread (max-min)/ideal = 199.7%   ← one node owned 3x its share
150 vnodes per node:  spread (max-min)/ideal =  21.5%
```

**⚠️ Note what this does *not* say.** 150 vnodes gives roughly **±8% std dev**, not near-perfect balance.

**The rule: std dev ≈ 1/√V.** That's a slow function — 10× the vnodes buys only ~3× the evenness:

| V | std dev |
|---|---|
| 1 | ~100% |
| 10 | ~32% |
| 150 | ~8% |
| 1000 | ~3% |

If you need tighter balance than that, **change algorithm** (rendezvous, Maglev) rather than adding vnodes.

### The hash function matters as much as the vnode count

The lab originally used **FNV-1a** and produced a **74.7%** spread at 150 vnodes — three times worse than it
should be. The cause: ring keys are `nodeA#0`, `nodeA#1`, … — near-identical strings. FNV-1a has weak
**avalanche**, so it mapped them to *clustered* ring positions, and no number of vnodes fixes clustering.

Switching to **MurmurHash3** dropped the spread to 22.5%, matching theory.

> **The transferable lesson:** for hash-based partitioning, the hash's *avalanche* property is a correctness
> concern, not a micro-optimisation. And **never** use a language's built-in `hashCode` — some runtimes
> randomise it per process, which would give every server a **different ring**, so the same key routes
> somewhere different depending on who's asking.

## B4 · Removing a node — where does the load go?

```
nodeC held 21,602 keys. After removing it:
  nodeA gained 5272 (24.4%)   nodeB gained 5541 (25.7%)
  nodeD gained 4632 (21.4%)   nodeE gained 6157 (28.5%)
Total keys moved: 21.6%  (ideal for removing 1 of 5 = 20.0%)
```

**The orphaned keys spread across *all* survivors**, roughly evenly. That's the **second** thing vnodes buy
you: with 1 vnode per node, a single successor inherits the entire arc and may fall over from the load
spike — turning one node failure into two.

## B5 · Replica placement

```
user:1  -> nodeE, nodeA, nodeB
user:42 -> nodeA, nodeD, nodeB
```
Walk clockwise collecting **distinct physical** nodes. With 150 vnodes each, consecutive ring entries often
belong to the same machine — getting this wrong puts all three "replicas" on one box. Real systems extend
this to distinct racks/AZs.

---

## Now write it down

Fill in [`RESULTS.md`](RESULTS.md).

```bash
docker compose down
```
