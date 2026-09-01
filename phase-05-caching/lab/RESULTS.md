# Lab Results — Phase 5

**Fill this in with YOUR numbers.** Date run: ______________

---

# Part A — cold cache

| | A1 warm | A2 flushed, no coalescing | A3 flushed, coalescing |
|---|---|---|---|
| hit rate |  |  |  |
| median latency |  |  |  |
| p95 |  |  |  |
| p99 |  |  |  |
| **errors** |  |  |  |
| DB queries |  |  |  |
| coalesced | — | — |  |
| peak DB QPS |  |  |  |

**Q: In A1 the database was nearly idle. What does that mean for your capacity plan?**

>

**Q: In A2, what exactly broke? Trace it from "cache is empty" to "requests fail" — include the connection pool arithmetic.**

>

**Q: Nothing about Redis was broken. State what kind of component failed and what kind of failure resulted.**

>

**Q: A3 removed the errors but only cut DB queries ~9%. Explain honestly why the reduction was modest.**

>

**Q: Why is in-process coalescing insufficient across 50 instances? What do you add?**

>

**Q: List four things coalescing does NOT fix.**

>

---

# Part B — rate limiters

| Algorithm | Test | Allowed | Verdict |
|---|---|---|---|
| Fixed window | 10 at end + 10 at start of window |  |  |
| Sliding window | 10 then 10 more, 400 ms later |  |  |
| Token bucket | burst of 15, then 10 after 1 s |  |  |

**Q: Explain the fixed-window boundary problem. Is the client cheating?**

>

**Q: How many members were in the sliding-window sorted set? What's the memory implication at 10k req/s?**

>

**Q: Why can't `MULTI/EXEC` implement a token bucket? Describe the race, and why Lua fixes it.**

>

**Q: Which would you ship, and why?**

>

---

## The five sentences I'd say in an interview

**1 · On what happens when the cache dies:**

>

**2 · On request coalescing — what it fixes and what it doesn't:**

>

**3 · On hit rate being the wrong metric:**

>

**4 · On why invalidation is hard:**

>

**5 · On Redlock, split by consequence:**

>
