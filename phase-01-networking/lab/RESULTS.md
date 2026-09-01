# Lab Results — Phase 1

**Fill this in with YOUR numbers.** The recording is the deliverable.

Date run: ______________

---

# Part A — API styles

## A1 · Single fetch

| Style | Payload | p50 | p95 | p99 |
|---|---|---|---|---|
| REST / JSON |  |  |  |  |
| gRPC / protobuf |  |  |  |  |

**protobuf is ______% smaller.**

**Q: Where does the size saving actually come from? Look at `product.proto` and be specific.**

>

**Q: This benchmark runs over loopback. What does it therefore NOT prove about gRPC's latency?**

>

**Q: Renaming a field in `product.proto` is a compatible change; renumbering one is catastrophic. Why?**

>

## A2 · 100 updates delivered

| Transport | Connections | Total bytes | Bytes/update | Wall time |
|---|---|---|---|---|
| REST polling |  |  |  |  |
| SSE |  |  |  |  |
| gRPC streaming |  |  |  |  |

**SSE moves ______× fewer bytes than polling. gRPC streaming, ______×.**

**Q: The product JSON is ~337 B but polling costs ~1.1 KB per update. Where does the rest go?**

>

**Q: You ran `curl -N -H "Last-Event-ID: 42" ...`. What happened, and what would you have had to build yourself to get that behaviour over WebSockets?**

>

**Q: Given these numbers, when is polling still the right choice? Be specific.**

>

**Q: Re-run with `UPDATES=1000`. Does the gap widen linearly, and why?**

>

---

# Part B — pagination

## B1 · Performance

| Page depth | OFFSET time | Rows scanned | KEYSET time | Rows scanned |
|---|---|---|---|---|
| 0 |  |  |  |  |
| 1,000 |  |  |  |  |
| 10,000 |  |  |  |  |
| 100,000 |  |  |  |  |
| 500,000 |  |  |  |  |
| 900,000 |  |  |  |  |

**OFFSET degraded ______×. At the deepest page keyset is ______× faster.**

**From `EXPLAIN ANALYZE` at OFFSET 500000:**

| | OFFSET | KEYSET |
|---|---|---|
| `Buffers: shared hit` |  |  |
| `Heap Fetches` |  |  |
| Has an `Index Cond`? |  |  |

**Q: Both queries use the same index. So why is OFFSET slow? Answer in one sentence.**

>

**Q: Why does this bug survive code review and QA for years before anyone notices?**

>

## B2 · Correctness

| Scenario | What OFFSET did | What KEYSET did |
|---|---|---|
| 5 rows inserted at the top |  |  |
| 5 rows deleted from the top |  |  |

**Q: Walk through the exact sequence that caused a row to be silently skipped.**

>

**Q: Why is the skip more dangerous than the duplicate?**

>

**Q: Describe a real system where this would cause data loss you'd only detect months later.**

>

**Q: Why is keyset immune? One sentence, using the words "position" and "value".**

>

---

## The four sentences I'd say in an interview

**1 · On choosing gRPC internally:**

>

**2 · On choosing SSE over WebSockets:**

>

**3 · On why offset pagination breaks (performance):**

>

**4 · On why offset pagination breaks (correctness) — the one nobody else says:**

>
