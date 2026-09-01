# Lab Results — Phase 6

**Fill this in with YOUR numbers.** Date run: ______________

---

# Part A — partitions & consumer groups

## A1 · Key → partition → ordering

| Partition | Events |
|---|---|
| 0 |  |
| 1 |  |
| 2 |  |

**Q: Were all events for one order in one partition, in order?**

>

**Q: Can you tell whether order-B's `created` happened before or after order-A's `shipped`? Why not?**

>

## A2–A4 · The parallelism ceiling

| Consumers | Assignment |
|---|---|
| 1 |  |
| 2 |  |
| 3 |  |
| 4 |  |

**Q: What happened to the 4th consumer? State the general rule.**

>

**Q: Why is partition count effectively permanent? What breaks if you change it?**

>

---

# Part B — duplicate delivery

| | B1 no idempotency | B2 idempotent |
|---|---|---|
| processed before crash |  |  |
| processed after restart |  |  |
| **skipped as duplicates** | — |  |
| rows in `charges` |  |  |
| distinct payments |  |  |
| **total charged** |  |  |

**Q: How much was the customer over-billed in B1? Whose fault was it — Kafka's, or the consumer's?**

>

**Q: Why does this prove exactly-once *delivery* is impossible?**

>

**Q: Write the equation, and the SQL that implements it.**

>

**Q: The batch size IS the duplicate window. Explain, and say why that's acceptable.**

>

**Q: Why is `enable.auto.commit=true` dangerous?**

>

---

# Part C — outbox

| | C1 dual write | C2 outbox |
|---|---|---|
| orders in DB |  |  |
| events in Kafka |  |  |
| **missing events** |  |  |

**Q: In C1, did anything error? What are the downstream consequences of the missing events?**

>

**Q: Why doesn't reversing the order (publish then write) fix it?**

>

**Q: State the reframing — what problem did the outbox convert this into?**

>

**Q: The relay is also at-least-once. Why is that acceptable?**

>

**Q: Why key the relay's messages by aggregate ID?**

>

---

## The five sentences I'd say in an interview

**1 · On the dual-write problem and the outbox:**

>

**2 · On why exactly-once delivery doesn't exist:**

>

**3 · On why Kafka can't order globally:**

>

**4 · On the partition/parallelism ceiling:**

>

**5 · On what a DLQ needs to not be a data-loss bucket:**

>
