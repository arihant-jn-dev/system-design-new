# Phase 1 — Gate

> **Rules:** Out loud. From memory. No notes.
> If you can't, don't advance to Phase 2.

---

## Q1 · Walk through everything between typing a URL and the first byte rendering

**This is the highest-frequency pure-knowledge question in system design interviews.** There is no reasoning
your way to it — you either learned it or you visibly didn't. Treat it as a set piece you can perform in
~3 minutes.

**You pass if you name, in order, and can say what each *costs*:**

- [ ] **URL parsing** — scheme, host, path; HSTS check (browser may force https before any request)
- [ ] **DNS resolution** — browser cache → OS cache → hosts file → recursive resolver → root → TLD → authoritative
- [ ] **TCP handshake** — SYN / SYN-ACK / ACK = **1 RTT**
- [ ] **TLS handshake** — **1 RTT for TLS 1.3**, 2 for 1.2; 0-RTT on resumption. Mention SNI and cert validation.
- [ ] **HTTP request sent** — method, path, headers, cookies
- [ ] **The path through infrastructure** — anycast/GeoDNS → L4 LB → CDN/edge (**cache hit ends here**) → L7 LB → API gateway → service
- [ ] **Server work** — auth, cache lookup, DB query, response assembly
- [ ] **Response returns** — status, headers, body; compression; `Content-Type`
- [ ] **Browser render** — parse HTML → build DOM → **CSS blocks rendering, JS blocks parsing** → CSSOM → render tree → layout → paint
- [ ] ⭐ **Subresources** — the first byte isn't the finish line; CSS/JS/fonts/images each repeat the whole cycle

**Bonus — the things that separate a good answer from a complete one:**

- [ ] You gave **round-trip counts**: "cold HTTPS is ~3 RTTs before any data — TCP, TLS, then the request"
- [ ] You gave a **number**: "at 150 ms cross-continent RTT that's ~450 ms before my server does anything"
- [ ] You mentioned **connection reuse / keep-alive** amortising setup
- [ ] You mentioned the **CDN cache hit short-circuits most of this** — the single biggest optimisation
- [ ] You mentioned **HTTP/2 multiplexing** or **HTTP/3 0-RTT** changing the picture

**Self-score:** ___ / 10 (+bonus)

---

## Q2 · Argue for and against GraphQL for a mobile-first product

**You must argue both sides convincingly, then commit.** Refusing to commit scores badly; so does having a
favourite.

**FOR — you pass if you gave at least 3:**

- [ ] **Mobile is latency-bound.** 4 REST calls = 4 sequential RTTs at 50–150 ms each. GraphQL makes it one. *(Strongest argument — lead with it.)*
- [ ] **No over-fetching** — battery, data caps, parse time on a weak CPU
- [ ] **You can't force app updates.** Field-level deprecation beats `/v1/ /v2/ /v3/` and a BFF per platform.
- [ ] **Product velocity** — new screen = new query, no backend deploy
- [ ] Schema as a typed contract between mobile and backend teams

**AGAINST — you pass if you gave at least 3:**

- [ ] **Caching.** REST gets CDN/browser caching free via GET + ETag. GraphQL POSTs an opaque query to one URL — you must rebuild caching yourself.
- [ ] **N+1 moves to the server.** GraphQL didn't remove it; it moved it from the network to your database, where it's less visible. Needs DataLoader everywhere.
- [ ] **Clients can craft expensive queries.** Needs depth limits and complexity scoring or it's a DoS vector.
- [ ] **Observability breaks.** Everything is `POST /graphql` returning `200` — including partial failures. Per-endpoint RED metrics stop working.
- [ ] Field-level authorization on *every* field
- [ ] Operational cost: federation, resolver performance, introspection in prod

**The commit — you pass if:**

- [ ] You **picked one**
- [ ] You justified it **from the workload**, not from preference
- [ ] ⭐ You **named the mitigation for your choice's biggest weakness** (e.g. "persisted queries from day one, which buys back CDN caching and cost control")
- [ ] ⭐ You said **what would change your mind**

**Self-score:** ___ / 6 (+the commit is mandatory)

---

## Q3 · Explain why you'd pick long polling (or SSE) over WebSockets in a specific scenario

**"A specific scenario" is the instruction — a general comparison doesn't pass.**

**You pass if:**

- [ ] You **named a concrete product surface** (order tracking, live scores, notification feed, LLM token stream, job progress)
- [ ] You observed the traffic is **one-directional**, so WebSockets' upstream channel is complexity you'd never use
- [ ] You named at least **three concrete costs of WebSockets** you're avoiding: sticky routing · pub/sub backplane for cross-node fan-out · every deploy drops every connection · autoscaling on connection count · presence state · reconnect-and-replay you build yourself
- [ ] You named what **SSE gives you free**: automatic reconnect + `Last-Event-ID` replay, works with existing HTTP auth/proxies/compression
- [ ] ⭐ You stated **the trigger to revisit** — "I'd switch to WebSockets if we added two-way chat"
- [ ] ⭐ You mentioned that for **mobile background** delivery, native push (APNs/FCM) beats all of them

**Self-score:** ___ / 6

---

## Extra checks — high-frequency, not in the roadmap's gate

- [ ] **L4 vs L7** — three things L7 can do that L4 can't, and why
- [ ] **Why gRPC behind an L4 load balancer produces uneven load**
- [ ] **Why DNS is a bad failover mechanism** — three independent reasons — and what you'd use instead
- [ ] **What problem HTTP/2 solved and what problem it created**
- [ ] **Head-of-line blocking** — explain it without using the phrase
- [ ] **The two independent reasons offset pagination breaks.** Which is more serious?
- [ ] **Idempotency key algorithm** — including the concurrent-retry case
- [ ] **Why "exactly-once delivery" is a marketing term**
- [ ] **Why exponential backoff without jitter is insufficient** — describe what happens on the wire
- [ ] **Retry amplification** — 3 layers × 3 retries = ? What's the rule?
- [ ] **`202 Accepted` + status URL** — why better than holding the connection open

---

## Scoring

| Result | Do this |
|---|---|
| All three passed + most extras | ✅ Advance to Phase 2. Update the tracker in [`../README.md`](../README.md). |
| Passed Q1–Q3, fumbled extras | Advance; re-read the specific notes this week |
| Fumbled any of Q1–Q3 | ⛔ Don't advance. Redo the relevant note's "own words" section, retry in 2 days. |

| Fumbled | Redo |
|---|---|
| Q1 | [notes/03](notes/03-dns.md), [04](notes/04-tls.md), [02](notes/02-tcp-vs-udp.md), [01](notes/01-l4-vs-l7.md) — then write the walkthrough out longhand |
| Q2 | [notes/06](notes/06-api-styles.md) + re-run [lab](lab/) Part A |
| Q3 | [notes/07](notes/07-realtime-push-patterns.md) + re-run lab Part A2 |

---

## Gate log

| Attempt | Date | Q1 | Q2 | Q3 | Notes |
|---|---|---|---|---|---|
| 1 |  | /10 | /6 | /6 |  |
| 2 |  | /10 | /6 | /6 |  |
