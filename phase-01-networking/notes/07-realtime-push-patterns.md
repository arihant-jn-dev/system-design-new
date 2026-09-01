# 07 · Real-Time & Push Patterns

> **Why this exists:** this is "the classic interview ladder" and the gate asks *"why would you pick long
> polling over WebSockets?"* The junior answer is always WebSockets. The senior answer notices that
> WebSockets make every layer of your infrastructure harder and asks whether you need them.

---

## Reference

### The ladder

```
short polling  →  long polling  →  SSE  →  WebSockets  →  WebRTC
       cheap, dumb  ................................  powerful, expensive
```

**Climb only as far as the requirement forces you.** Every rung up costs infrastructure complexity.

### The comparison

| | **Short polling** | **Long polling** | **SSE** | **WebSockets** | **WebRTC** |
|---|---|---|---|---|---|
| Direction | Client pulls | Client pulls | **Server → client** | **Bidirectional** | Bidirectional P2P |
| Protocol | HTTP | HTTP | HTTP (`text/event-stream`) | Upgrade from HTTP → `ws://` | UDP (SRTP/SCTP) |
| Connection | New each time | Held open until data/timeout | **One, held open** | **One, held open** | P2P, NAT-traversed |
| Latency | Up to the poll interval | ~Immediate | ~Immediate | ~Immediate | **Lowest** |
| Overhead | **Highest** — full headers every poll | Medium | Low | **Lowest** | Lowest |
| Auto-reconnect | n/a | Manual | ✅ **Built in** (+ `Last-Event-ID`) | Manual | Manual |
| Works through proxies/firewalls | ✅ Always | ✅ Almost always | ✅ Usually | ➖ Usually (needs upgrade support) | ❌ Often needs TURN |
| Browser API | fetch | fetch | `EventSource` | `WebSocket` | `RTCPeerConnection` |
| Binary | ✅ | ✅ | ❌ **Text only** | ✅ | ✅ |
| Server cost | High CPU, low memory | High memory (held conns) | Medium | Medium–high | Low (P2P) |
| Load balancer friendly | ✅ **Perfectly** | ➖ | ✅ Mostly | ❌ **Sticky routing needed** | n/a |
| **Good for** | Low-frequency status | Chat with modest scale, legacy support | **Feeds, notifications, dashboards, LLM token streams, progress** | **Chat, games, collaborative editing** | **Voice/video/screen share** |

### Each rung, with the mechanism

**Short polling** — `GET /messages?since=X` every N seconds.
- Dead simple, stateless, works everywhere, trivially load-balanced
- Wasteful: most polls return nothing. 10 K clients polling every 5 s = **2,000 QPS of mostly-empty responses**,
  each carrying full HTTP headers (~800 bytes) for a 20-byte answer.
- Latency is up to N seconds
- **Genuinely correct when:** updates are rare and latency tolerance is high (order status, background job
  progress, a "new version available" check). Don't be embarrassed by it.

**Long polling** — client requests; server **holds the request open** until data arrives or a timeout (~30 s);
client immediately re-requests.
- Near-real-time delivery over plain HTTP/1.1. Works through anything.
- **Cost: one held connection (and often one thread) per client.** With blocking I/O this is brutal; with
  async servers it's fine.
- Awkward edge: between the response and the next request there's a **gap where events can be missed** — so
  you need a cursor/sequence number, not just "send me what's new."

**SSE (Server-Sent Events)** — one long-lived HTTP response, `Content-Type: text/event-stream`, server writes
events as they occur.
```
data: {"type":"like","postId":42}

id: 1234
event: comment
data: {"user":"ari","text":"hi"}

```
- **Plain HTTP.** Works with existing infrastructure, auth (cookies/headers), compression, HTTP/2.
- **Automatic reconnection with `Last-Event-ID`** — the browser reconnects and tells you where it left off,
  and you resume. This is built in, and it's the feature people underrate.
- One-way only (server→client). The client uses normal HTTP requests to send.
- Text only (base64 your binary).
- Under HTTP/1.1, the 6-connections-per-origin limit bites hard. **Under HTTP/2 it's multiplexed and this
  problem disappears** — a strong reason SSE became viable again.

**WebSockets** — HTTP `Upgrade` handshake, then a persistent full-duplex TCP connection speaking a framed
binary protocol.
- Lowest latency and overhead for two-way traffic; binary support
- **You now own a stateful tier**, and that changes everything (see below)
- No built-in reconnect, no built-in message replay, no request/response semantics — you build all of it

**WebRTC** — peer-to-peer media/data with NAT traversal (STUN/TURN), for voice, video and screen share.
- Server cost near zero for 1:1 (media goes peer to peer)
- Group calls need an **SFU** (selective forwarding unit) — a real media server
- TURN relay is needed for ~10–20% of users behind strict NATs, and TURN relays *all* their media (expensive)
- **Only reach for it when you're moving live media.** For data, it's almost never worth the complexity.

### Why you'd pick long polling (or SSE) over WebSockets — the gate question

**Have a specific scenario ready.** Any of these is a strong answer:

1. **The traffic is one-directional.** Notifications, live scores, dashboards, order tracking, LLM token
   streaming. WebSockets buy you an upstream channel you will never use — you're paying full complexity for
   half a feature. **SSE with built-in reconnect and replay is strictly simpler.**
2. **Your infrastructure doesn't love WebSockets.** Corporate proxies, older load balancers, some API gateways
   and WAFs mishandle or forbid the `Upgrade`. Long polling works through absolutely everything, which is why
   it's the universal fallback in every real-time library (Socket.IO still ships it).
3. **Updates are infrequent.** A held-open connection per user for an event every 10 minutes is a lot of
   memory to hold nothing. Long polling has the same latency profile at a fraction of the sustained cost.
4. **You're stateless today and want to stay that way.** WebSockets force sticky routing, a pub/sub backplane
   for cross-node fan-out, connection-count-based autoscaling, and graceful-drain handling on deploy —
   *every deploy disconnects every user*. That's a large, permanent operational bill.
5. **Scale/cost.** 1 M idle WebSocket connections is real memory and file descriptors across a fleet sized by
   connection count rather than CPU. If updates are rare, polling is genuinely cheaper.
6. **Client constraints.** Mobile radios: a persistent connection keeps the radio warm and drains battery.
   For background updates, **native push (APNs/FCM) beats any of these** — worth saying out loud.

> **A model gate answer:** *"For a food-delivery order-tracking screen I'd use SSE, not WebSockets. Traffic is
> purely server-to-client, updates are every few seconds for maybe 30 minutes, and SSE gives me automatic
> reconnect with Last-Event-ID for free — which matters because mobile connections drop constantly. Choosing
> WebSockets would mean sticky routing, a Redis backplane, and every deploy dropping every connection, in
> exchange for an upstream channel I'd never use. I'd switch to WebSockets if we added live two-way chat with
> the driver."*
>
> That answer picks, justifies from the workload, names the concrete cost avoided, and states the trigger to
> revisit.

### What WebSockets at scale actually costs (preview of Phase 9)

Naming these unprompted signals real experience:

| Problem | Why |
|---|---|
| **Sticky routing** | User's connection lives on node 7. A message for them arriving at node 3 must find node 7. |
| **Pub/sub backplane** | Redis/Kafka to fan out across nodes — a whole new dependency |
| **Presence** | "Who's online" is now distributed state with expiry |
| **Reconnect + replay** | Client was offline for 4 s — what did they miss? Needs sequence numbers and a buffer. |
| **Deploys** | Every deploy drops every connection → thundering-herd reconnect. Needs staggered drain + client jitter. |
| **Autoscaling** | Scale on connection count, not CPU. Scaling *down* forcibly disconnects users. |
| **Idle timeouts** | LBs/proxies kill idle connections → you need heartbeats/pings |
| **Load balancing** | Connections are long-lived, so a new node gets no traffic until clients reconnect |

### Choosing — the decision path

```
Is it live audio/video?              → WebRTC (+ SFU for groups)
Does the CLIENT need to send often?  → WebSockets
Server→client only?                  → SSE          ← the underrated default
Updates rare / high latency ok?      → short polling
Legacy/hostile network, need 2-way?  → long polling
Mobile background delivery?          → native push (APNs/FCM)
```

---

## In your own words

**Walk the ladder from short polling to WebRTC. One line each on what it adds and what it costs.**

>

**Give a specific scenario where you'd pick long polling or SSE over WebSockets. Say it as you would in an interview, including the trigger to revisit.**

>

**What does SSE give you for free that you'd have to build yourself with WebSockets?**

>

**Name five things that get harder the moment you adopt WebSockets at scale.**

>

**Why is short polling sometimes the correct, senior answer?**

>

---

## Links

- SSE benefits directly from H2 multiplexing → [05-http-evolution.md](05-http-evolution.md)
- gRPC streaming as the internal equivalent → [06-api-styles.md](06-api-styles.md)
- WebSocket infrastructure at scale, presence, backplanes → **Phase 9**
- Sticky sessions and their cost → Phase 2
- Notification systems, APNs/FCM → Phase 9
- **Measure polling vs SSE overhead yourself** → [`../lab/`](../lab/) Part A
