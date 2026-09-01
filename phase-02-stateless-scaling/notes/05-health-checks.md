# 05 · Health Checks

> **Why this exists:** gate question — *"explain how a deep health check can take down a healthy fleet."*
> This is a favourite follow-up because the obvious instinct ("check everything!") is exactly wrong, and
> explaining *why* requires understanding correlated failure.

---

## Reference

### Active vs passive

| | **Active (proactive)** | **Passive (reactive / outlier detection)** |
|---|---|---|
| How | LB periodically calls `/health` | LB watches **real traffic** for errors/timeouts |
| Detects | Failure before a user hits it | Failure **after** users hit it |
| Cost | Constant background traffic (N LBs × M backends × frequency) | Free — it's the traffic you already have |
| Blind spot | The health endpoint may be healthy while real requests fail | **Someone always eats the first N failures** |
| Examples | ALB/NLB health checks, Envoy active HC, k8s probes | nginx `max_fails`/`fail_timeout`, Envoy outlier detection |

**Use both.** Active catches a dead node before traffic hits it; passive catches the gap between "endpoint
returns 200" and "requests actually work."

> **The passive trade-off is worth stating:** with passive checks only, the failure *is* detected by real
> users — the first `max_fails` requests become errors. You measure exactly this in the lab.

### Shallow vs deep — the important axis

| | **Shallow (liveness)** | **Deep (readiness/dependency)** |
|---|---|---|
| Checks | "Is this process alive and serving?" | "Can I reach the DB, cache, downstream services?" |
| Example | `return 200 OK` | `SELECT 1` + Redis PING + call 3 services |
| Catches | Crashed, hung, out-of-memory process | Misconfiguration, broken dependency |
| **Danger** | Might report healthy while broken | ⚠️ **Correlated failure — can take out the whole fleet** |

### How a deep health check takes down a healthy fleet (the gate answer)

**The failure sequence:**

```
1. Every instance's /health does `SELECT 1` against the shared database.

2. The database has a hiccup — a slow query, a failover, brief overload.
   It's degraded for 30 seconds, not dead. Most user requests would still
   succeed, and reads from cache would succeed entirely.

3. EVERY instance's health check fails AT THE SAME TIME, because they all
   check THE SAME dependency.

4. The load balancer marks EVERY instance unhealthy and removes them all
   from rotation.

5. There is now nothing to route to. The LB returns 503 for 100% of traffic.

6. The application instances are perfectly healthy. Not one of them crashed.
   The database recovers 30 seconds later — but the fleet may not come back
   cleanly, because now all traffic returns at once (thundering herd) into
   cold caches and empty connection pools.
```

**A brief, partial database degradation became a total outage — and the health check is what converted it.**

**The core insight:** a health check that depends on a **shared** resource makes every instance's health
**perfectly correlated**. You lose the entire point of redundancy, because redundancy only helps when
failures are *independent* ([Phase 0 note 05](../../phase-00-foundations/notes/05-availability-vs-durability.md)).

**The second-order version is nastier:** the health check *itself* adds load. 100 instances × 1 check/sec ×
3 dependencies = 300 extra QPS hitting the struggling database. **The health check helps kill the thing it's
checking.**

> **Compressed gate answer:** *"If every instance's health check calls the shared database, then when the
> database is briefly slow, every instance fails its check simultaneously and the load balancer pulls the
> entire fleet out of rotation. A partial degradation of one dependency becomes 100% unavailability — even
> though every application instance is fine and could still serve cached reads. Health checks that depend on
> shared resources make failures perfectly correlated, which is the opposite of what redundancy is for. So
> the load balancer check should be shallow — 'is this process serving?' — and dependency health belongs in
> monitoring and in per-request circuit breakers, not in the routing decision."*

### The right design

| Check | Depends on | Used for | Failure action |
|---|---|---|---|
| **Liveness** | Nothing external | "Restart me" | Restart the container |
| **Readiness** (LB rotation) | **Only this instance's own ability to serve** | Add/remove from LB | Remove from rotation |
| **Startup** | Warm-up state | Delay traffic until ready | Wait |
| **Dependency health** | Everything downstream | **Dashboards and alerts** | **Page a human. Do NOT change routing.** |

**Rules:**

1. **The LB health check must be shallow.** Check only what's local: process alive, thread pool not
   exhausted, not shutting down, warm-up complete.
2. **If you must check a dependency, degrade rather than fail.** Report healthy-but-degraded and let the
   application serve what it can (cache, stale, partial).
3. **Never fail a health check on a *non-critical* dependency.** The recommendations service being down must
   not remove your checkout instances from rotation.
4. **Fail-open at the fleet level.** Many LBs implement this: *if more than X% of the fleet is unhealthy,
   assume the health check is wrong and route to everything anyway.* AWS ALB does this. **Mentioning
   fail-open is a strong signal** — it's the direct mitigation for the scenario above.
5. **Health checks should be cheap and cached.** Don't do real work per check.
6. **Distinguish liveness from readiness.** Restarting a container because the *database* is slow is exactly
   the wrong response, and it's a classic Kubernetes misconfiguration.

### The Kubernetes framing (concrete and commonly asked)

| Probe | Failure means | Use |
|---|---|---|
| **`livenessProbe`** | **Kill and restart the container** | Only for genuinely unrecoverable states (deadlock). **Keep it shallow.** A liveness probe that checks the DB will restart-loop your whole deployment during a DB blip. |
| **`readinessProbe`** | Remove from Service endpoints | Warm-up, temporary overload, graceful shutdown |
| **`startupProbe`** | Give slow starters more time | Prevents liveness from killing a slow-booting app |

> **The classic k8s incident:** liveness probe includes a database call → DB slows → every pod fails liveness
> → **every pod restarts simultaneously** → cold caches and a connection stampede → the DB gets worse →
> CrashLoopBackOff across the deployment. All from a health check.

### Health check design checklist

- [ ] Shallow for LB rotation; deep only for monitoring
- [ ] Returns quickly (< 100 ms) and does no real work
- [ ] Fails during graceful shutdown, **before** the process stops accepting connections (this is what makes
      connection draining work — note 06)
- [ ] Doesn't require auth (but isn't publicly exposed either)
- [ ] Separate liveness and readiness
- [ ] Thresholds tuned: N consecutive failures before ejection (avoid flapping on one blip), and a
      *different*, usually stricter, threshold to re-admit
- [ ] Interval balanced against detection time — a 30 s interval × 3 failures = **90 seconds of errors**
      before ejection

**That last item is a genuinely useful number to quote:** *"a 10-second interval with a 3-failure threshold
means 30 seconds of user-visible errors before that node is removed — so I'd also want passive outlier
ejection to catch it faster."*

---

## In your own words

**Walk the full sequence by which a deep health check takes down a healthy fleet. Say it out loud, then write it.**

>

**Why is the health check adding load to the struggling dependency the "second-order" version of the problem?**

>

**What is fail-open at the fleet level, and which problem does it directly solve?**

>

**Liveness vs readiness — what does each failure DO, and why is a DB check in a liveness probe dangerous?**

>

**Your health check runs every 30 s with a 3-failure threshold. How long are users seeing errors? What would you add?**

>

**Where does dependency health belong, if not in the routing decision?**

>

---

## Links

- Why correlated failure breaks redundancy → [Phase 0 note 05](../../phase-00-foundations/notes/05-availability-vs-durability.md)
- Gray failure — the case health checks miss → [Phase 0 note 06](../../phase-00-foundations/notes/06-reliability-fault-tolerance-resilience.md)
- Outlier ejection, draining, slow start → [06-lb-operations-and-types.md](06-lb-operations-and-types.md)
- Circuit breakers as the per-request equivalent → Phase 7
- Alerting on symptoms not causes → Phase 7
- **Watch a "healthy" node poison your p99** → [`../lab/`](../lab/) Part A, experiment 4
