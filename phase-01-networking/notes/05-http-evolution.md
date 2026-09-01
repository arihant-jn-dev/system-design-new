# 05 · HTTP Evolution — 1.1 → 2 → 3

> **Why this exists:** the roadmap is explicit — learn **the problem each version solved**, not the feature
> list. "HTTP/2 has multiplexing" is a memorised fact. "HTTP/2 exists because HTTP/1.1 could only have one
> request in flight per connection, so browsers opened 6 connections per domain and people sharded assets
> across subdomains to cheat the limit" is understanding.

---

## Reference

### The one-line story

```
HTTP/1.1  →  one request at a time per connection      (application-level HOL blocking)
HTTP/2    →  many streams over ONE TCP connection      (fixes app HOL, exposes transport HOL)
HTTP/3    →  many streams over QUIC/UDP                (fixes transport HOL too)
```

Each version fixed the previous one's bottleneck and revealed the next one down the stack.

---

### HTTP/1.1 (1997) — the baseline

**What it added over 1.0:** persistent connections (`Connection: keep-alive`), chunked transfer encoding, the
`Host` header (which made virtual hosting — many sites per IP — possible).

**The core limitation: one outstanding request per connection.** Responses must come back in order.

**Pipelining was the attempted fix and it failed.** You *could* send multiple requests without waiting — but
responses still had to return in order, so one slow response blocked all the ones behind it (**head-of-line
blocking at the application layer**). Combined with broken proxies, it was disabled everywhere. Effectively
dead.

**The workarounds people built — recognise these as historical hacks:**

| Hack | What it did | Why it's now an anti-pattern |
|---|---|---|
| **6 connections per origin** (browser default) | Crude parallelism | 6× the handshakes; each starts in TCP slow start |
| **Domain sharding** (`img1.`, `img2.`, `img3.`) | Beat the 6-connection limit | More DNS lookups, more handshakes. **Actively harmful under H2/H3.** |
| **Sprite sheets, CSS/JS concatenation** | Fewer requests | Bad caching — change one icon, re-download everything |
| **Inlining assets as data URIs** | Zero requests | Uncacheable, bloats the HTML |

> **A good interview beat:** "Most HTTP/1.1 performance advice — sharding, spriting, concatenation — became
> counterproductive under HTTP/2. If I saw domain sharding in a modern codebase I'd treat it as tech debt."

**Also worth knowing:** HTTP/1.1 headers are **plaintext and repeated on every request**. Cookies, User-Agent,
Accept-* — often 500–800 bytes, sent again and again for every asset. On a page with 100 requests that's
~80 KB of pure redundancy.

---

### HTTP/2 (2015) — multiplexing

**Problem solved: application-level head-of-line blocking and header redundancy.**

| Feature | What it does |
|---|---|
| **Binary framing** | Messages split into frames — the enabler for everything else. No longer human-readable on the wire. |
| **Multiplexing** | Many concurrent **streams** over **one** TCP connection. Responses may interleave and arrive out of order. **This is the headline feature.** |
| **HPACK header compression** | Headers compressed *and* a shared dynamic table — repeated headers cost ~1 byte after the first request |
| **Stream prioritisation** | Client hints what matters (CSS before images). Poorly implemented in practice; replaced in H3. |
| **Server push** | Server proactively sends resources the client hasn't asked for |
| Flow control | Per-stream and per-connection windows |

**Why server push died** — a genuinely instructive story:
- The server can't know what's already in the client's cache, so it **pushes bytes the client already has**
- It competes for bandwidth with things the client actually asked for
- Complex to implement correctly; measurements showed it was usually a net *loss*
- **Chrome removed support in 2022.** The replacement is `103 Early Hints` — the server *tells* the client
  what to fetch and lets the client decide. **Hinting beats pushing.**

**The new problem HTTP/2 created:** everything now shares **one TCP connection**. TCP guarantees in-order
delivery *of the byte stream*, so **one lost packet stalls every multiplexed stream**, even unrelated ones.
HTTP/2 solved HOL blocking at the application layer and inherited it at the transport layer.

> On a clean network HTTP/2 is a clear win. On a lossy network (mobile, congested wifi), HTTP/2 can be
> **worse** than HTTP/1.1 with 6 connections — because 6 connections means loss only stalls 1/6 of your
> traffic. This is exactly the observation that motivated QUIC.

**Operational gotcha:** HTTP/2's single long-lived connection interacts badly with **L4 load balancers**
(note 01) — one connection is pinned to one backend, so load distribution becomes uneven. This is *the* gRPC
load-balancing problem.

---

### HTTP/3 (2022) — QUIC

**Problem solved: transport-level head-of-line blocking, plus connection setup cost and mobility.**

HTTP/3 runs over **QUIC**, which is UDP-based and implements reliability, ordering, congestion control and
TLS 1.3 *in userspace* at the application layer.

| Property | Benefit |
|---|---|
| **Independent stream delivery** | Loss on stream A doesn't block stream B. **HOL blocking finally gone.** |
| **TLS built into the handshake** | 1-RTT connection setup; **0-RTT on resumption** |
| **Connection IDs, not 4-tuples** | **Connection migration** — wifi → cellular without dropping the connection. TCP cannot do this. |
| **Userspace implementation** | Iterate without kernel/OS upgrades. TCP improvements take a decade to deploy; QUIC ships with the browser. |
| QPACK | Header compression redesigned to avoid re-introducing HOL blocking |

**The costs, honestly:**
- **Higher CPU** — UDP packet processing lacks decades of kernel/NIC offload optimisation (improving fast)
- Some corporate firewalls and middleboxes **block or throttle UDP 443**, so clients must fall back to H2
- Harder to debug — encrypted transport headers mean much less visibility for network operators
- Load balancers and observability tooling needed to relearn everything

**Discovery:** a client doesn't know a server speaks H3 up front. The server advertises it via the
`Alt-Svc` header (or an HTTPS/SVCB DNS record), and the client upgrades on a *subsequent* connection.

---

### The comparison table

| | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---|---|---|---|
| Transport | TCP | TCP | **QUIC/UDP** |
| Format | Text | Binary | Binary |
| Requests per connection | 1 at a time | **Many (multiplexed)** | Many (multiplexed) |
| App-level HOL blocking | **Yes** | No | No |
| Transport-level HOL blocking | Per-connection | **Yes (worse — shared)** | **No** |
| Header compression | None | HPACK | QPACK |
| Setup RTTs (with TLS 1.3) | 2 | 2 | **1 (0 on resume)** |
| Connection migration | No | No | **Yes** |
| Server push | No | Yes (dead) | Deprecated |

---

### What this means for design decisions

| Situation | Choice |
|---|---|
| Public web/API, modern clients | **H2 minimum, H3 where available.** Free win. |
| Mobile-first, lossy networks | **H3 matters a lot** — HOL blocking and connection migration are exactly the mobile pain points |
| Internal service-to-service | **HTTP/2 (gRPC).** Multiplexing + binary + streaming. But you need **L7 load balancing** (note 01). |
| Behind an L4 balancer | Be careful with H2/gRPC — connection pinning causes uneven load |
| Very high throughput, one hop | H2 is usually enough; H3's CPU cost may not pay off |
| Legacy/enterprise clients | Keep H1.1 available; some middleboxes still mangle H2 |

**The practical answer for most systems:** terminate H2/H3 at the CDN or edge, speak H2 (or H1.1) to origin.
You get the client-side benefits without re-plumbing your internal network.

---

## In your own words

**What problem did HTTP/2 solve, and what new problem did it create?**

>

**Why is domain sharding an anti-pattern under HTTP/2? What was it for originally?**

>

**Why did server push fail? What replaced it, and why is that better?**

>

**Explain why HTTP/2 can be slower than HTTP/1.1 on a lossy mobile network.**

>

**What does connection migration solve, and why can't TCP do it?**

>

**You're designing an internal service mesh. Which HTTP version, and what does that force you to do about load balancing?**

>

---

## Links

- HOL blocking and QUIC fundamentals → [02-tcp-vs-udp.md](02-tcp-vs-udp.md)
- TLS handshake costs folded into QUIC → [04-tls.md](04-tls.md)
- Why gRPC needs L7 balancing → [01-l4-vs-l7.md](01-l4-vs-l7.md)
- gRPC streaming modes → [06-api-styles.md](06-api-styles.md)
- SSE rides on HTTP and benefits directly from H2 multiplexing → [07-realtime-push-patterns.md](07-realtime-push-patterns.md)
