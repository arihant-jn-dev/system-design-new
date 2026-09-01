# Phase 0 Lab — Measuring Latency, Percentiles & Tail Amplification

> Roadmap assignment: *"Measure p50/p99 under load. Then add a 200 ms artificial delay to one dependency and
> watch what happens to p99. Write down the number."*
>
> This lab does that, plus a third experiment the roadmap's gate demands: **watching tail latency
> amplification happen with real numbers.**

**Time: ~60–90 minutes.** Requires only Docker — k6 runs from its own image, and the services have zero npm
dependencies.

---

## What's here

```
lab/
├── docker-compose.yml
├── dependency/server.js   ← fake downstream: 5 ms most of the time, 205 ms 1% of the time
├── app/server.js          ← the service under test: /api/simple and /api/fanout?n=K
├── k6/load.js             ← open-model load generator
└── RESULTS.md             ← ⚠️ fill this in with YOUR numbers. That's the deliverable.
```

**The system:** `k6 → app → dependency`

The dependency's latency is deliberately **bimodal** — fast most of the time, occasionally slow. That's what
real dependencies look like (GC pause, cache miss, lock contention, noisy neighbour), and a fixed-latency
fake would hide the entire lesson.

---

## Start it

```bash
cd phase-00-foundations/lab
docker compose up -d
docker compose ps          # both should be Up; dependency should be (healthy)

curl localhost:3000/health
curl localhost:3000/api/simple
curl "localhost:3000/api/fanout?n=10"
curl localhost:4000/admin/config
```

Tear down at the end with `docker compose down`.

---

## Experiment 1 — Baseline: how far apart are p50 and p99 already?

```bash
docker compose run --rm k6 run -e TARGET=/api/simple -e RPS=200 -e DURATION=30s /scripts/load.js
```

**Reference result (measured on this setup):**

```
min=1.88ms  med=6.58ms  avg=8.68ms  p(90)=9.57ms  p(95)=10.38ms  p(99)=28.89ms  max=219.98ms
```

**What to notice — write these into RESULTS.md:**

- **p99 (28.9 ms) is ~4× the median (6.6 ms)** on a completely healthy system doing almost no work. Tail
  spread is not a symptom of a broken system; it's the default state of every system.
- **max (220 ms) is 33× the median.** Somebody had that experience.
- **avg (8.68 ms) sits above the median** — already being dragged by the tail, and it describes neither the
  typical user nor the suffering one.

> Your p99 may differ from the reference — 1% slow probability over 6,000 requests puts p99 right at the
> transition point, so it's noisy by construction. That noise is itself the lesson: **a percentile computed
> from too few samples in the tail is not a reliable number.** Run for longer and it stabilises.

---

## Experiment 2 — The roadmap assignment: inject 200 ms into the dependency

Change the dependency **live** — no restart:

```bash
curl -XPOST localhost:4000/admin/config -d '{"baseMs":205,"slowProbability":0}'
docker compose run --rm k6 run -e TARGET=/api/simple -e RPS=200 -e DURATION=20s /scripts/load.js
```

**Reference result:**

```
min=102.65ms  med=205.97ms  avg=208.14ms  p(90)=289.78ms  p(95)=301.08ms  p(99)=309.58ms  max=373.36ms
```

Restore it afterwards:

```bash
curl -XPOST localhost:4000/admin/config -d '{"baseMs":5,"slowProbability":0.01}'
```

**What to notice:**

- p50 went 6.6 ms → **206 ms (31×)**. Your service added ~1 ms of its own work. **You are your slowest
  dependency**, and no amount of optimising your own code recovers this.
- p99 went 28.9 ms → **310 ms** — and note it's *100 ms worse than p50*, not equal to it. The extra spread is
  **queueing**: at 200 req/s with 206 ms latency, Little's Law says ~41 requests are in flight
  (`L = λ × W = 200 × 0.206`). Concurrency you didn't have before.
- This is the mechanism behind cascading failure. A dependency that slows down (but never errors, and stays
  "healthy") consumes your capacity until you have none left. **Nothing crashed. Nothing alerted. Users saw a
  30× regression.** That's a gray failure (note 06).

**The question to answer in RESULTS.md:** at what dependency latency does your service stop being able to
serve 200 req/s at all? Compute it from Little's Law, then verify by raising `baseMs` until it breaks.

---

## Experiment 3 — Tail latency amplification (the important one)

Same dependency, unchanged: **fast 99% of the time, 205 ms 1% of the time.** The only variable is how many
parallel calls one request makes.

**Keep the load on the *dependency* roughly constant** so fan-out width is the only thing changing —
otherwise you're measuring saturation instead of amplification:

```bash
# fan-out 1   → 200 downstream QPS
docker compose run --rm k6 run -e TARGET=/api/simple           -e RPS=200 -e DURATION=30s /scripts/load.js

# fan-out 10  → 200 downstream QPS
docker compose run --rm k6 run -e "TARGET=/api/fanout?n=10"    -e RPS=20  -e DURATION=60s /scripts/load.js

# fan-out 100 → 500 downstream QPS
docker compose run --rm k6 run -e "TARGET=/api/fanout?n=100"   -e RPS=5   -e DURATION=60s /scripts/load.js
```

**Reference results:**

| Fan-out | p50 | p90 | p95 | p99 | avg |
|---|---|---|---|---|---|
| **1** | 6.58 ms | 9.57 ms | 10.38 ms | 28.89 ms | 8.68 ms |
| **10** | 9.86 ms | 14.94 ms | **207.12 ms** | 209.99 ms | 26.64 ms |
| **100** | **212.10 ms** | 218.15 ms | 219.82 ms | 223.06 ms | **140.59 ms** |

### Read this table carefully — three things are happening

**1 · The theory predicts the measurement almost exactly.**

`P(at least one of N calls is slow) = 1 − 0.99^N`

| N | Predicted % slow | So the slow path should start around… | Measured |
|---|---|---|---|
| 1 | 1.0% | p99 | p99 = 28.9 ms, max = 220 ms ✅ |
| 10 | 9.6% | **p90.4** | p90 = 14.9 ms (fast), **p95 = 207 ms (slow)** ✅ |
| 100 | **63.4%** | **p36.6 — i.e. the median** | **p50 = 212 ms** ✅ |

At fan-out 100, **the dependency's p99 has become your p50.** A backend that is slow 1% of the time makes a
100-way fan-out slow *most of the time*. Nothing got slower. Nothing broke. You just asked more people.

**2 · At fan-out 100, the average is LOWER than the median.**

```
avg = 140.59 ms        median = 212.10 ms
```

Look at that for a second. The mean sits below the 50th percentile because the distribution is now bimodal —
37% of requests are ~10 ms and 63% are ~215 ms. **The average describes a user who does not exist.** No
request took 140 ms.

This is the strongest possible answer to the gate question *"why are averages useless?"* — and you produced
it yourself, on your own terminal, in 60 seconds.

**3 · The p99 barely moved between fan-out 10 and 100** (210 ms → 223 ms).

Because once you're near-certain to hit at least one slow call, hitting *two* doesn't cost extra — they're in
parallel. The damage is done at the first one. **The tail stopped being the problem; the median became the
problem.**

---

## Bonus experiments (optional, ~15 min, high value)

**A · Kill keep-alive.** Set `KEEP_ALIVE: "false"` in `docker-compose.yml`, then `docker compose up -d app`
and re-run fan-out 100. Every downstream call now pays a TCP handshake. Connection reuse is not a
micro-optimisation.

**B · Starve the connection pool.** Set `MAX_SOCKETS: "10"` and re-run fan-out 100. Latency explodes — but
the dependency is exactly as fast as before. **You built a queue inside your own process.** This is the
bottleneck people spend days hunting in the wrong service.

**C · Make the tail worse, not slower.** Set `slowProbability` to `0.05` and keep `slowMs` at 200. Re-run
fan-out 10. Predicted: `1 − 0.95^10 = 40%` slow. Verify.

**D · Prove coordinated omission is real.** Change the k6 executor from `constant-arrival-rate` to
`constant-vus` (a closed model) and re-run Experiment 2. The system looks *better* while doing identical
work — because the generator stopped sending during the stall. This is why most load tests flatter you.

---

## Now write it down

Fill in [`RESULTS.md`](RESULTS.md) **with your own numbers**. Not the reference ones — yours.

The roadmap says *"write down the number"* for a reason: a measurement you didn't record is a measurement you
will not remember in an interview, and "I measured this myself and saw the p50 become the dependency's p99"
is a far stronger answer than "tail latency amplification is when..."

```bash
docker compose down
```
