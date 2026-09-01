# 06·14 · Scheduled & Delayed Work

> **Why this exists:** "run this later" and "run this every night" look trivial and are full of traps —
> **cron on N instances runs N times**, and Kafka has no native delay at all.

---

## Reference

### ⚠️ Why cron doesn't survive contact with a fleet

| Problem | |
|---|---|
| ⭐ **N instances = N executions** | Deploy 3 replicas with an in-app cron and **every customer gets 3 invoices**. The classic bug ([Phase 2 note 01](../../phase-02-stateless-scaling/notes/01-stateless-vs-stateful.md)). |
| **A single cron host is a SPOF** | It's down at 2 a.m. → the job silently doesn't run |
| **No retries** | The job failed. Did anyone notice? |
| **No visibility** | Is it running? Did it finish? How long did it take? |
| **Overlapping runs** | A job that takes 70 minutes on an hourly schedule now runs concurrently with itself |
| **Timezones and DST** | 2 a.m. happens **twice** on one day a year and **not at all** on another |
| **No backfill** | Missed a day? You're writing a one-off script. |

> ⭐ **The DST point is a real and under-appreciated bug.** A job scheduled at 02:30 local time either runs
> twice or never on the changeover days. **Schedule in UTC** and convert for display.

### Making scheduled jobs safe

| Technique | How |
|---|---|
| ⭐ **Leader election** | Only the leader runs the job — etcd/ZooKeeper lease ([Phase 4 note 08](../../phase-04-distributed-systems/notes/08-coordination-services-and-fencing.md)) |
| ⭐ **A lock with a TTL** | `INSERT INTO job_runs (job_name, run_date) VALUES (...)` with a **`UNIQUE(job_name, run_date)`** — whoever wins the insert runs it. **No lock service needed.** |
| **An external scheduler** | Kubernetes `CronJob`, EventBridge, Airflow, Temporal — one execution by design |
| ⭐ **Make the job idempotent** | So a double-run is harmless. **The most robust answer**, because it doesn't depend on the scheduler being correct. |
| **Overlap protection** | A lock held for the job's duration |
| **Alert on non-execution** | ⭐ **A dead-man's switch** — alert if the job *hasn't* reported success by an expected time. Alerting on failure misses "never ran." |

> ⭐ **The unique-constraint trick is the nicest answer** and it reuses
> [3b-05](../../phase-03-databases/notes/3b-05-idempotency-at-the-db-layer.md): every instance tries to
> insert `(job_name, run_date)`; exactly one succeeds (`23505` for the rest); that one runs the job. **No
> ZooKeeper, no leader election, no new infrastructure.**
>
> **And the dead-man's switch is the monitoring insight**: a job that fails pages you; a job that never
> started is silent. **Alert on the absence of success**, not on failure.

### Delayed work — "do this in 30 minutes"

| Mechanism | How | Notes |
|---|---|---|
| ⭐ **DB table + `run_at`** | `SELECT ... WHERE run_at <= now() FOR UPDATE SKIP LOCKED` | **Simplest, most flexible, transactional.** Cancel = delete a row. |
| **SQS `DelaySeconds`** | Per-message delay | ⚠️ **Max 15 minutes** |
| **RabbitMQ TTL + DLX** | Message expires from a TTL queue into a dead-letter exchange | The idiomatic RabbitMQ trick |
| **Redis sorted set** | Score = `run_at`; poll `ZRANGEBYSCORE` | ⭐ Elegant; you already have Redis ([Phase 5 note 08](../../phase-05-caching/notes/08-redis-beyond-caching.md)) |
| ⚠️ **Kafka** | ❌ **No native delay** | Use a DB/Redis for scheduling and *publish* to Kafka when due |
| **Timer wheel** | Buckets by time slot; O(1) insert/expire | What brokers use internally; overkill for app code |
| **Temporal / Step Functions** | Durable timers as a first-class feature | ⭐ Best for complex, long-running workflows |

> ⭐ **"Kafka has no delay" is a genuinely useful fact.** Retry topics with delays ([08](08-consumer-hygiene.md))
> are implemented by a consumer that *sleeps* before processing — which is why each retry tier needs its own
> topic and consumer. If someone proposes Kafka for scheduled work, that's the gap to point out.

**The timer wheel, briefly:** an array of buckets, each a time slot, with a rotating cursor. Inserting a
timer is O(1) (compute the bucket); expiring is O(1) (advance the cursor and fire that bucket).
**Compare to a sorted set/heap: O(log n) insert.** Used inside Kafka, Netty and most brokers. Know the name.

### Long-running jobs

| Concern | Approach |
|---|---|
| **Progress reporting** | Write progress to a row; the client polls `GET /jobs/{id}` ([Phase 1 note 10](../../phase-01-networking/notes/10-api-design-mechanics.md)) |
| ⭐ **Checkpointing** | Record progress so a restart resumes rather than restarting from zero |
| **Cancellation** | A `cancelled` flag the worker checks periodically — you cannot kill a worker mid-transaction safely |
| ⭐ **Chunking** | Split into many small tasks. **Better than one huge one**: parallelisable, resumable, and one failure doesn't lose everything. |
| **Timeouts** | A job stuck forever is worse than one that failed. Lease + heartbeat; reclaim if the heartbeat stops. |
| **Idempotency** | It *will* be retried |

⭐ **"Chunk it" is the highest-leverage advice here.** A 6-hour job that fails at hour 5 with no checkpointing
loses everything; 360 one-minute chunks lose one minute.

### Worker pools & task queues

| Concern | |
|---|---|
| **Concurrency** | Bounded pool ([Phase 4 note 11](../../phase-04-distributed-systems/notes/11-backpressure-and-flow-control.md)) |
| ⭐ **Isolation** | **Separate queues per job type.** Otherwise a flood of low-priority work starves your critical jobs — a **bulkhead** (Phase 7). |
| **Priority** | Separate queues, or a broker with priorities |
| **Fairness** | Per-tenant quotas so one customer's bulk import doesn't monopolise the pool |
| **Visibility** | Queue depth, oldest-job age, failure rate, duration percentiles |

**Celery / Sidekiq / BullMQ** are the familiar shapes. ⚠️ **Note that Celery-with-Redis and Sidekiq inherit
Redis's durability limits** — a failover can lose jobs ([Phase 5 note 07](../../phase-05-caching/notes/07-redis-persistence-and-ha.md)).
**If jobs represent money, use a durable store.**

### The decision

```
Recurring, needs exactly-one execution?     -> external scheduler (k8s CronJob / EventBridge)
                                               + ⭐ idempotent job + dead-man's switch
Recurring, in-app?                          -> ⭐ UNIQUE(job_name, run_date) as the lock
Delay < 15 min, on AWS?                     -> SQS DelaySeconds
Arbitrary delay, cancellable, queryable?    -> ⭐ a DB table with run_at + SKIP LOCKED
Complex multi-step workflow with timers?    -> Temporal / Step Functions
High-volume short delays?                   -> Redis sorted set
```

---

## In your own words

**Why does an in-app cron break with 3 replicas? What's the standard bug it causes?**

>

**Give the unique-constraint trick for single execution. Why is it appealing?**

>

**What's a dead-man's switch and what does it catch that failure-alerting misses?**

>

**Kafka and delayed messages — what's the gap, and how do retry topics work around it?**

>

**What is a timer wheel and what's its complexity advantage?**

>

**Why chunk a long-running job? Give the arithmetic.**

>

**Why separate queues per job type?**

>

---

## Links

- Statelessness and in-app cron → [Phase 2 note 01](../../phase-02-stateless-scaling/notes/01-stateless-vs-stateful.md)
- Leader election and leases → [Phase 4 note 08](../../phase-04-distributed-systems/notes/08-coordination-services-and-fencing.md)
- Unique constraints → [3b-05](../../phase-03-databases/notes/3b-05-idempotency-at-the-db-layer.md)
- `SKIP LOCKED` → [3b-04](../../phase-03-databases/notes/3b-04-locking-and-deadlocks.md)
- Async job + polling API → [Phase 1 note 10](../../phase-01-networking/notes/10-api-design-mechanics.md)
- Bulkheads → Phase 7 · **Distributed job scheduler** → Phase 9 / Phase 12 problem 29
