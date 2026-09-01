# 02 · TCP vs UDP

> **Why this exists:** "when would you use UDP?" is a standard question, and the good answer isn't "games and
> video" — it's understanding that **TCP's guarantees are sometimes exactly what you don't want**. Head-of-line
> blocking is the concept that makes HTTP/2 and HTTP/3 make sense, so learn it properly here.

---

## Reference

### The comparison

| | **TCP** | **UDP** |
|---|---|---|
| Connection | Connection-oriented (handshake) | Connectionless — just send |
| Reliability | **Guaranteed delivery** (ack + retransmit) | None. Packets may vanish silently. |
| Ordering | **Guaranteed in-order** | None. Arrive in any order. |
| Duplicates | Removed | Possible |
| Congestion control | **Yes** — backs off under loss | **No** — will happily flood the network |
| Flow control | Yes (receive window) | No |
| Header size | 20 bytes | **8 bytes** |
| Setup cost | **1 RTT** (SYN, SYN-ACK, ACK) | 0 RTT |
| Head-of-line blocking | **Yes** — the big one | No |
| Multicast/broadcast | No | Yes |

### The TCP handshake — and why it costs you

```
Client                    Server
  │──────── SYN ─────────▶│
  │◀────── SYN-ACK ───────│      1 full RTT before any data
  │──────── ACK ─────────▶│
  │─────── DATA ─────────▶│
```

**1 RTT before a single byte of your request.** Add TLS (note 04) and it's 2–3 RTTs.

**Cross-continent (150 ms RTT), a cold HTTPS request:**
```
TCP handshake      150 ms
TLS 1.3 handshake  150 ms
HTTP request/resp  150 ms
                   ------
                   450 ms before your application logic has produced anything
```

**This is why connection reuse matters so much** — keep-alive, connection pools, HTTP/2 multiplexing. You
paid 300 ms of setup; amortise it over thousands of requests, not one.

Teardown is worse: 4-way FIN handshake, and the closing side sits in `TIME_WAIT` for ~60 s holding the port.
At high connection churn you can **exhaust ephemeral ports** — a classic production failure that looks like
"the network is broken."

### Head-of-line (HOL) blocking — the concept to actually understand

**TCP guarantees in-order delivery. So if packet #3 is lost, packets #4–#100 sit in the kernel buffer,
already received, and are not given to your application until #3 is retransmitted.**

```
sent:      [1][2][3][4][5][6]
received:  [1][2][ ][4][5][6]      ← 3 was dropped
delivered: [1][2] ...waiting...    ← 4,5,6 are HERE but held hostage
```

One lost packet stalls *everything behind it*, even unrelated data.

**This is the root problem behind the whole HTTP evolution story:**

| Level | Where HOL blocking happens | Fixed by |
|---|---|---|
| **Application** | HTTP/1.1: one request at a time per connection; a slow response blocks the next | **HTTP/2 multiplexing** |
| **Transport** | HTTP/2: streams are multiplexed over **one TCP connection**, so one lost packet stalls *all* streams | **HTTP/3 / QUIC** (UDP-based, per-stream loss recovery) |

**HTTP/2 fixed application-level HOL blocking and, by putting everything on one TCP connection, made
transport-level HOL blocking worse.** That single sentence explains why HTTP/3 exists. It's a great thing to
say in an interview.

### Congestion control — the invisible mechanism

TCP treats **packet loss as a signal of congestion** and reduces its sending rate. Slow start → congestion
avoidance → back off on loss.

Consequences worth knowing:
- **A new TCP connection starts slow** (small congestion window, ~10 packets ≈ 14 KB). A large response needs
  several RTTs to reach full speed. Another reason connection reuse matters.
- **On lossy links (mobile, wifi), TCP interprets corruption-loss as congestion and slows down** even though
  there's plenty of bandwidth. This is why mobile networks feel bad in ways bandwidth numbers don't explain.
- **BBR** (Google) models bandwidth and RTT instead of reacting to loss — notably better on lossy links.
- **UDP has none of this.** That's a feature (no artificial slowdown) *and* a hazard (an unthrottled UDP
  flood can collapse a network — which is why UDP is the amplification vector of choice in DDoS attacks).

### When UDP is the right answer

The pattern: **when late data is worthless, retransmission is a liability, not a feature.**

| Use case | Why UDP |
|---|---|
| **Live video / voice (VoIP, RTP)** | A frame that arrives 500 ms late is useless — you've already played past it. Better to drop it and conceal the gap than to stall the stream retransmitting it. |
| **Real-time multiplayer games** | Position update #47 is obsolete the moment #48 exists. Retransmitting stale state is worse than losing it. |
| **DNS** | Single small request/response. A handshake would triple the cost. If it's lost, just ask again. |
| **QUIC / HTTP/3** | Builds *better* reliability on top of UDP — per-stream, so loss on one stream doesn't stall others |
| **Metrics / logs (StatsD)** | Enormous volume; losing 0.1% of samples doesn't change a percentile |
| **Service discovery / gossip** | Broadcast/multicast; the protocol is designed to tolerate loss |
| **NTP** | Tiny, frequent, self-correcting |

> **The senior framing:** "TCP gives you reliability and ordering *whether or not you want them*. For real-time
> media, ordering-with-retransmission is actively harmful — a late frame is worse than a missing one. UDP lets
> me implement exactly the reliability I need and nothing more, which is precisely what QUIC does."

### QUIC — why it's the interesting answer

QUIC is **UDP at L4 with reliability, ordering, congestion control and TLS 1.3 built in at the application
layer.** Reimplementing TCP on UDP sounds absurd; it's the right call for four reasons:

| Property | Benefit |
|---|---|
| **Independent streams** | Loss on stream A doesn't block stream B — **transport-level HOL blocking eliminated** |
| **0-RTT / 1-RTT connection setup** | TLS is merged into the handshake. Resumed connections send data in the *first* packet. |
| **Connection migration** | Connections are identified by a **connection ID, not the 4-tuple**. Switch wifi → 5G and your connection survives. TCP would break. |
| **Ships in userspace** | TCP changes need kernel/OS updates (years). QUIC updates with the browser/app. |

---

## In your own words

**Explain head-of-line blocking without using the phrase "head-of-line blocking."**

>

**Why did HTTP/2 make transport-level HOL blocking worse, even though it fixed the application-level kind?**

>

**Give a scenario where TCP's guaranteed delivery is a bug, not a feature.**

>

**A cold cross-continent HTTPS request takes ~450 ms before any application work. Break down where that goes.**

>

**Why does a brand-new TCP connection transfer slowly at first, and why does that argue for connection pooling?**

>

**What does QUIC's "connection migration" solve, and why can't TCP do it?**

>

---

## Links

- The HTTP versions built on this → [05-http-evolution.md](05-http-evolution.md)
- TLS handshake cost → [04-tls.md](04-tls.md)
- Latency numbers behind all of this → [Phase 0 note 02](../../phase-00-foundations/notes/02-latency-numbers.md)
- WebRTC (UDP-based P2P media) → [07-realtime-push-patterns.md](07-realtime-push-patterns.md)
