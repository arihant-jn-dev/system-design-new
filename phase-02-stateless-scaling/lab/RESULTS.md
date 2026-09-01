# Lab Results — Phase 2

**Fill this in with YOUR numbers.**

Date run: ______________

---

# Part A — load balancing & failure modes

## The comparison table (fill every cell)

| Experiment | Failure | Error rate | Median | p99 | app2's share | Ejected? |
|---|---|---|---|---|---|---|
| A1 baseline | — |  |  |  |  | — |
| A2 crash | SIGKILL |  |  |  |  |  |
| A3 errors | HTTP 500 |  |  |  |  |  |
| A4 **hang** | no response |  |  |  |  |  |
| A5 errors + `http_500` | HTTP 500 |  |  |  |  |  |

## A1 · Baseline

**Q: Was distribution even? What algorithm is nginx using by default?**

>

## A2 · Killing a replica

**Q: You killed a third of the fleet under load. What was the error rate, and why was it that low?**

>

**Q: What was the only trace of the failure in the metrics? Where did that number come from?**

>

**Q: Why is this retry behaviour dangerous for a `POST /payments`? What makes it safe here?**

>

## A3 · A replica returning 500s

**Q: How many requests did the broken replica keep serving? Was it ever ejected?**

>

**Q: Explain why `max_fails=3` did nothing here. (Two mechanisms — name both.)**

>

**Q: After adding `http_500` to `proxy_next_upstream`, errors went to 0. What did you trade away?**

>

## A4 · The hang ⭐

**Fill in every signal:**

| Signal | Reading | Would it have paged you? |
|---|---|---|
| Error rate |  |  |
| Median latency |  |  |
| Health check |  |  |
| **p99 latency** |  |  |

**Q: What is this failure mode called, and why is it worse than a crash?**

>

**Q: Why was p99 almost exactly 2 seconds? What config value set it?**

>

**Q: What would p99 be with nginx's DEFAULT `proxy_read_timeout` of 60s? What else would break?**

>

**Q: Your shallow health check passed throughout. Was that a bug in the health check? Justify your answer.**

>

**Q: What mechanism WOULD have caught this, and does nginx OSS have it?**

>

**Q: Given all three failure modes, which single metric should you alert on?**

>

---

# Part B — consistent hashing

## B1 · Adding a node (3 → 4)

| Strategy | Keys moved |
|---|---|
| Modulo |  |
| Consistent hashing |  |
| Theoretical minimum (1/N) |  |

**Q: Trace the failure: 75% of cache keys move. What happens next, step by step, to the database?**

>

## B2 · Scaling behaviour

| N → N+1 | Modulo | Consistent | Ideal |
|---|---|---|---|
| 3 → 4 |  |  |  |
| 10 → 11 |  |  |  |
| 50 → 51 |  |  |  |

**Q: Modulo gets WORSE as the cluster grows. Why, and what perverse incentive does that create for a team?**

>

## B3 · Virtual nodes

| Vnodes | Spread (max−min)/ideal |
|---|---|
| 1 |  |
| 10 |  |
| 150 |  |

**Q: What's the rule relating vnode count to load std dev? Why is 10× the vnodes NOT 10× better?**

>

**Q: The lab originally used FNV-1a and got a 74.7% spread. What property was missing, and why do ring keys specifically expose it?**

>

**Q: Why must you never use a language's built-in `hashCode` for a ring? Describe the bug concretely.**

>

## B4 · Removing a node

**Q: Where did the orphaned keys go? What would have happened with 1 vnode per node?**

>

## B5 · Replicas

**Q: Why "distinct physical nodes" rather than the next R ring entries? What breaks otherwise?**

>

---

## The five sentences I'd say in an interview

**1 · On why a crashed backend is the *easiest* failure:**

>

**2 · On gray failure and what to alert on:**

>

**3 · On what retries at the LB actually trade away:**

>

**4 · On why `hash(key) % N` is dangerous for a cache:**

>

**5 · On what virtual nodes buy — and their limit:**

>
