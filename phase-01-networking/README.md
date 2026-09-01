# Phase 1 — Networking & Communication

**Week 2 · ~10 hrs**

---

## Why this phase exists

The roadmap's framing is blunt and correct: *"Most candidates are hand-wavy here and it shows immediately.
This phase is cheap and high-return."*

Networking is where vagueness is most *detectable*. If you say "the load balancer routes it" and can't say
whether that's L4 or L7 and what each can actually see, the interviewer learns something about you in three
seconds. Conversely, casually saying *"I'd terminate TLS at the edge so the L7 balancer can route on path,
which costs us an extra hop but lets us do header-based canary routing"* signals real operational experience
faster than any amount of box-drawing.

**The specific failure this phase prevents:** the gate question *"walk me through what happens between typing
a URL and the first byte rendering"* is asked constantly, and it's a pure knowledge check. There is no way to
reason your way to DNS → TCP → TLS → HTTP if you never learned it. You either know it or you visibly don't.

---

## How to work this phase (in order)

| Step | Do this | Time |
|---|---|---|
| 1 | Read [`notes/`](notes/) 01 → 11. Reference half, **once**. | ~1.5 hrs |
| 2 | Fill in the "In your own words" half of each. **The actual work.** | ~3 hrs |
| 3 | Run [`lab/`](lab/) **Part A** — same endpoint as REST, gRPC and SSE. Record bytes and latency. | ~1.5 hrs |
| 4 | Run [`lab/`](lab/) **Part B** — offset vs keyset pagination on 1 M rows. Watch it fall off a cliff. | ~1.5 hrs |
| 5 | Write the URL→first-byte walkthrough from memory, then check it. | ~1 hr |
| 6 | Attempt [`GATE.md`](GATE.md) out loud. | ~1 hr |

---

## Topics covered (maps 1:1 to the roadmap)

| # | Note | The one thing it's for |
|---|---|---|
| 01 | [L4 vs L7](notes/01-l4-vs-l7.md) | The only OSI distinction you'll actually use — and it's used *everywhere* in Phase 2 |
| 02 | [TCP vs UDP](notes/02-tcp-vs-udp.md) | Handshakes, ordering, congestion control, head-of-line blocking |
| 03 | [DNS](notes/03-dns.md) | Resolution path, TTL, and **why DNS is a bad failover mechanism** |
| 04 | [TLS](notes/04-tls.md) | Handshake cost, resumption, where you terminate, mTLS |
| 05 | [HTTP evolution](notes/05-http-evolution.md) | The *problem each version solved* — that's the interview question |
| 06 | [API styles](notes/06-api-styles.md) | REST vs gRPC vs GraphQL — argue all three |
| 07 | [Real-time push patterns](notes/07-realtime-push-patterns.md) | The polling → SSE → WebSocket ladder, and when to stop climbing |
| 08 | [Pagination](notes/08-pagination.md) | Why `OFFSET` breaks at scale — for two independent reasons |
| 09 | [Idempotency](notes/09-idempotency.md) | **The single most reused concept in payment/order questions** |
| 10 | [API design mechanics](notes/10-api-design-mechanics.md) | Versioning, compat, `429`/`Retry-After`, bulk, async job + polling |
| 11 | [Timeouts, retries, backoff](notes/11-timeouts-retries-backoff.md) | Why jitter is mandatory, not a nicety |

---

## Lab

[`lab/`](lab/) — two parts, both from the roadmap.

**Part A — the same endpoint three ways.** One product lookup, served as REST/JSON, gRPC/protobuf and SSE.
You measure actual bytes on the wire and actual latency. Then the more interesting comparison: **100 updates
delivered by polling vs by SSE** — where the header overhead of repeated HTTP requests becomes the whole cost.

**Part B — pagination falling off a cliff.** 1 M rows in Postgres. `LIMIT 20 OFFSET 500000` against keyset
pagination, with `EXPLAIN ANALYZE` for both. Then the part most people miss: a **correctness** demo showing
offset pagination silently skipping and duplicating rows when the underlying data changes. The performance
argument is the famous one; the correctness argument is the stronger one.

---

## Gate

[`GATE.md`](GATE.md) — three questions. Q1 (URL → first byte) is the highest-frequency pure-knowledge
question in system design interviews. Treat it as a set piece you can perform.

---

## Definition of done

- [ ] All 11 notes have the "In your own words" half filled in
- [ ] `lab/RESULTS.md` has real measured numbers for both parts
- [ ] You watched offset pagination both *slow down* and *return wrong results*
- [ ] You can perform the URL → first byte walkthrough in ~3 minutes, unprompted
- [ ] You can argue **both sides** of GraphQL without preparation
