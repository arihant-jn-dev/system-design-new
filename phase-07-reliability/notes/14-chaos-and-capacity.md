# 07·14 · Capacity Planning, Load Testing & Chaos Engineering

> **Why this exists:** everything else in Phase 7 is a *hypothesis* until you test it. **An untested failover
> doesn't work. An untested rollback doesn't work. An untested circuit breaker doesn't work** — and you find
> out during the incident.

---

## Reference

## Capacity planning

### The method

```
1. MEASURE  current peak throughput and headroom
2. PROJECT  growth (organic + known events: launches, sales, marketing)
3. FIND     the bottleneck -- which resource saturates FIRST?
4. PROVISION for peak x growth x safety factor
5. VERIFY   with a load test
```

### ⭐ Run at 60–70%, not 95%

**Latency is flat until you approach saturation, then it goes vertical**
([Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md)).

> ⭐ **Headroom isn't waste — it's what keeps you on the flat part of the curve.** "The servers are only at
> 80% CPU, we're fine" is wrong: at 80% you're at the knee, and a 20% traffic bump puts you over it.

**What to leave headroom for:**

| Reason | Typical |
|---|---|
| Traffic spikes | Peak = 2–3× average |
| ⭐ **N−1 (an AZ dies)** | You lose 1/3 → **run at ≤66%** |
| Deploys (rolling reduces capacity) | ~10% |
| ⭐ **Degraded-mode load** — cold cache, retries | **Can be several ×** |

⭐ **That last row is the one people miss.** Your capacity plan silently assumes a 95% cache hit rate. You
measured what happens when that goes to 0% — **271 errors and a 2 s p95**
([Phase 5 lab](../../phase-05-caching/lab/)). **Provision for a plausible degraded mode, or decide
explicitly that it's an outage.**

### Load testing — the four types

| Type | Question |
|---|---|
| **Load** | Does it handle expected peak? |
| ⭐ **Stress** | **Where does it break, and HOW?** (gracefully or catastrophically) |
| ⭐ **Soak** | Does it survive 24h+? **Catches leaks, disk fill, connection exhaustion, fragmentation** |
| **Spike** | Can it handle a sudden 10× (and does autoscaling help in time)? |

> ⭐ **Stress testing matters more than load testing.** Knowing you handle 10 K QPS is useful; knowing that at
> 12 K you shed cleanly rather than entering a metastable spiral is what actually saves you.

⚠️ **Test methodology traps** — you've hit both:
- ⭐ **Closed-model tests lie.** Fixed VUs waiting for responses send *fewer* requests when the system slows,
  hiding overload (**coordinated omission**). Use an open model / constant arrival rate — every lab here does.
- ⭐ **The test harness is often the bottleneck.** In Phase 0 your first harness reported 363 ms for 5 ms of
  work. **Always verify the generator isn't what you're measuring.**

**Test with production-like data volumes** — an index that's fast on 10 K rows behaves differently at 10 M
([Phase 3A lab](../../phase-03-databases/lab/lab-a-indexing/)).

## Chaos engineering

### ⭐ It is not "randomly break things"

**It is a controlled experiment:**

```
1. HYPOTHESIS   "if one replica dies, error rate stays under 0.1%"
2. BLAST RADIUS smallest possible -- one instance, one AZ, 1% of traffic
3. RUN          in production if you can; staging if you must
4. MEASURE      did the hypothesis hold?
5. FIX          what you learned
6. ⭐ AUTOMATE   so it can never regress
```

> ⭐ **A chaos experiment with no hypothesis is just an outage you caused.** The value is in stating what you
> *expect* — because when reality disagrees, you've learned something specific.
>
> **And always have an abort button.**

### What to inject

| Failure | Tests |
|---|---|
| **Kill an instance** | Health checks, LB ejection, N−1 capacity |
| ⭐ **Add LATENCY to a dependency** | **Timeouts, breakers, bulkheads — the thing you actually built** |
| Return errors from a dependency | Fallbacks, degradation |
| ⭐ **Kill the cache** | **The cold-cache outage** |
| Fill a disk / exhaust a pool | Resource limits |
| Partition the network | Split brain, quorum behaviour |
| ⭐ **Fail over the database** | RPO/RTO — **is it what you claim?** |
| Clock skew | Time-dependent logic |

⭐ **Latency injection is the highest-value experiment**, because slow is worse than down
([08](08-failure-modes.md)) and it's the failure your monitoring is worst at catching. **Everything in the
Phase 7 lab is exactly this experiment, run in miniature.**

### Game days

**A scheduled, rehearsed incident with real people.**

| Tests | |
|---|---|
| Do the **runbooks** actually work? |
| Do people know **who to call**? |
| Does the **failover procedure** work when a human runs it under pressure? |
| ⭐ **How long does it really take?** — the honest measure of your RTO |
| Do the **dashboards** show what you need? |

> ⭐ **Game days test the humans and the process, not just the system.** A perfect automated failover is
> useless if nobody knows it exists or how to confirm it worked.
>
> **And the Chubby lesson:** Google's lock service was *so* reliable that teams stopped handling its
> downtime — so its owners began taking it down deliberately to keep dependents honest. **If you exceed your
> SLA consistently, people build on the actual level, not the promised one.**

### The maturity ladder

```
1. Test failure paths in unit tests            (fault injection at the code level)
2. Test failure paths in staging               (kill instances, inject latency)
3. Run game days with humans                   (test the process)
4. Run chaos experiments in production, 1%     (test reality)
5. ⭐ AUTOMATE them continuously                (test that it never regresses)
```

**Most teams stop at 1. Getting to 3 is achievable and buys most of the value** — you don't need Chaos Monkey
to run a scheduled failover drill.

### ⭐ What this phase actually asks you to prove

**Every pattern in Phase 7 is a claim. The claims are only true if tested:**

| Claim | Test |
|---|---|
| "We have circuit breakers" | ⭐ Inject latency. Does it open? **Does a fallback fire?** |
| "We can fail over" | Do it. **Time it.** Is the RPO what you claim? |
| "We can roll back" | Roll something back. **Under load.** |
| "We degrade gracefully" | Kill a non-critical dependency. Does the page render? |
| "The DLQ is monitored" | Put a message in it. **Did anyone get paged?** |
| "Our backups work" | ⭐ **Restore one. Time it.** That's your real RTO. |

> ⭐ **Every row is something teams believe and have never verified.** The gap between "we have X" and "X
> works" is where outages live — and closing it is exactly what makes this the senior phase.

---

## In your own words

**Why run at 60–70%? Name four things headroom is for, including the one people miss.**

>

**Why does stress testing matter more than load testing?**

>

**Name two test-methodology traps you personally hit, and what they taught you.**

>

**What separates a chaos experiment from an outage you caused?**

>

**Which failure injection is highest value, and why?**

>

**What do game days test that automated chaos doesn't?**

>

**Pick three reliability claims about a system you know. How would you test each?**

>

---

## Links

- The latency knee → [Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md)
- Coordinated omission, measured → [Phase 0 lab](../../phase-00-foundations/lab/)
- ⭐ **Latency injection, measured** → [`../lab/`](../lab/) Part A
- Cold cache, measured → [Phase 5 lab](../../phase-05-caching/lab/)
- RPO measured → [Phase 3C lab](../../phase-03-databases/lab/lab-c-replication/)
- Failure modes → [08-failure-modes.md](08-failure-modes.md) · DR → [13-multi-region-and-dr.md](13-multi-region-and-dr.md)
- **Google SRE Book ch. 21–22** · Netflix Chaos Engineering · *Release It!*
