# 09·11 · WebSocket Infrastructure at Scale

> **Why this exists:** chat, presence, live dashboards, collaborative editing, notifications. ⭐ **The whole
> difficulty is that WebSockets make your servers STATEFUL — which undoes everything Phase 2 was about.**

---

## Reference

### ⭐ Why this is hard

⭐ **A WebSocket is a long-lived connection pinned to ONE server.** That means:

| | |
|---|---|
| ⭐ **The connection is state** | you can't round-robin; the reply must reach *that* box |
| ⭐ **Deploys break connections** | a rolling deploy disconnects everyone — ⭐ **and they all reconnect at once** |
| ⭐ **Load balancing is by CONNECTION, not request** | a box with old, busy connections stays busy; a fresh box may sit idle |
| **Scaling down is destructive** | removing a node drops its connections |

> ⭐ **"Stateless servers" was the foundation of easy scaling. WebSockets give that up, and every problem
> below is a consequence.** Saying that framing is worth more than any individual fix.

### Sizing

⭐ **~50k–100k connections per node** is a realistic planning figure (memory per connection + file
descriptors + the event loop). ⚠️ **Tune `ulimit -n`, ephemeral port ranges and TCP buffers** — the defaults
assume short connections. ⭐ **Memory per connection is the binding constraint**, so keep per-connection state
tiny (an ID and a subscription set, not a user object).

### ⭐ The pub/sub backplane — the core of the design

**Problem:** user A is on node 1, user B on node 3. A sends a message; node 1 has no socket for B.

```
    node1 ──publish──▶ [ Redis pub/sub / Kafka / NATS ] ──▶ node2, node3 …
                                                              │
                                                          local socket for B
```

⭐ **Each node subscribes to the channels its connected users care about, and pushes to its own local
sockets.** ⭐ **This is what removes the need for sticky routing on the WRITE path** — any node can accept
any message.

| Backplane | Trade |
|---|---|
| ⭐ **Redis pub/sub** | ⭐ simplest, low latency. ⚠️ **fire-and-forget — a node that's briefly disconnected MISSES messages entirely** |
| **Redis Streams** | ⭐ replayable, consumer groups — fixes the above |
| **Kafka** | durable, replayable, ordered per partition. ⚠️ heavier, higher latency |
| **NATS** | purpose-built, very fast; optional JetStream persistence |

⚠️ **Naive fan-out doesn't scale:** publishing every message to every node means each node processes all
traffic. ⭐ **Route by channel/room** so a node only receives what its users subscribe to (Redis pub/sub
patterns, or Kafka partitions per room).

### Connection routing

⭐ **You often DON'T need sticky routing** once you have a backplane — that's the point of it. When you do
(session affinity, reduced backplane traffic):

- **A connection registry**: `user_id → node_id` in Redis with a TTL, refreshed by heartbeat
- **Consistent hashing** on user ID → node ([Phase 2](../../phase-02-stateless-scaling/notes/)), so rebalances move few connections
- ⚠️ **Registry staleness is guaranteed** — a node dies and the registry still points at it. ⭐ **Treat the
  registry as a HINT and fall back to broadcast**, rather than trusting it

### ⭐ Heartbeats, and why TCP isn't enough

⚠️ **A dead TCP connection can look alive for a long time** — a client that loses power sends no FIN, so the
socket stays open until an OS-level timeout that may be **hours**. ⭐ **You'd be holding memory and
"presence" for users who are long gone.**

⭐ **Application-level ping/pong** (WebSocket ping frames, ~30 s), **close after 2–3 missed pongs.**
⚠️ **Also required to keep intermediaries from silently dropping an idle connection** — many proxies, load
balancers and mobile carriers kill idle sockets at 60 s.

### ⭐ Reconnect + missed-message replay — the part people skip

⭐ **Reconnection is the normal case, not the failure case** — phones change networks constantly.

| | |
|---|---|
| ⭐ **Exponential backoff WITH JITTER** | ⚠️ **without jitter, a deploy causes a synchronised thundering herd that keeps knocking you over** ([Phase 7](../../phase-07-reliability/notes/02-retries-and-budgets.md)) |
| ⭐ **A per-connection cursor** | the client sends *"last message id I saw"* on reconnect; the server replays the gap |
| ⭐ **So messages must be PERSISTED and SEQUENCED**, not just broadcast | ⭐ **this is the design decision that makes reconnect work at all** — pub/sub alone loses them |
| **Bound the replay** | if the gap is too large, tell the client to do a full resync |
| **Idempotent client handling** | dedupe by message ID — replay *will* overlap |

### Presence

**"Who's online" is deceptively expensive.** A heartbeat-refreshed key with a TTL (`presence:user:123`,
30 s) is the standard shape. ⚠️ **The cost is the FAN-OUT of status changes** — a user with 5,000 contacts
going online is 5,000 notifications, ⭐ **which is the celebrity fan-out problem again**
([09](09-feed-and-timeline.md)). ⭐ **Mitigate: only push presence for people currently VIEWING you, batch
changes, and accept coarse accuracy** — "last seen recently" is usually enough, and it's also better for
privacy.

### Deploys and operations

⭐ **Connection draining:** stop accepting new connections, ⭐ **ask clients to reconnect gradually** (a
server-sent "please reconnect" with a random delay), then shut down. ⚠️ **Never just kill the node** — you
create the thundering herd yourself.

⚠️ **Load balancers need long idle timeouts** (ALB defaults to 60 s and will cut your sockets) and, for the
HTTP/1.1 upgrade, correct proxy configuration.

### ⭐ When NOT to use WebSockets

| Instead | When |
|---|---|
| ⭐ **SSE (Server-Sent Events)** | ⭐ **server→client only** — notifications, live feeds, dashboards. **Plain HTTP, auto-reconnect with `Last-Event-ID` built in, works through every proxy.** ⭐ **Strictly simpler; prefer it when you don't need client→server** |
| **Long polling** | terrible fit, universal compatibility |
| ⭐ **Plain polling** | ⭐ **honestly fine for anything ≥5 s.** A dashboard that polls every 10 s does not need a stateful connection tier |
| **WebTransport / HTTP/3** | emerging; datagram support for latency-sensitive cases |

> ⭐ **Say this: "WebSockets when you need low-latency BIDIRECTIONAL communication. SSE when it's one-way.
> Polling when the interval can be seconds."** ⭐ **Choosing the simplest one that works is the senior
> answer** — the stateful tier is a real, permanent operational cost.

---

## In your own words

**⭐ Why do WebSockets undo Phase 2's assumptions? Name the four consequences.**

>

**Roughly how many connections per node, and what's the binding constraint?**

>

**⭐ Explain the backplane. What problem does it solve, and what does it remove the need for?**

>

**⭐ What's the catch with Redis pub/sub, and what fixes it?**

>

**Why is a connection registry only a hint?**

>

**⭐ Why isn't TCP enough to detect a dead client? What do you do instead?**

>

**⭐ What makes missed-message replay possible, and what does that require of your message store?**

>

**⭐ Why is jitter on reconnect non-negotiable?**

>

**Why is presence expensive, and which earlier problem is it?**

>

**⭐ How do you deploy without causing a thundering herd?**

>

**⭐ SSE vs WebSocket vs polling — state the rule.**

>

---

## Links

- Stateless scaling, and what you're giving up → [Phase 2](../../phase-02-stateless-scaling/notes/)
- Consistent hashing → [Phase 2](../../phase-02-stateless-scaling/notes/)
- SSE and the API-style trade → [Phase 1](../../phase-01-networking/notes/)
- Jitter, thundering herds → [Phase 7 note 02](../../phase-07-reliability/notes/02-retries-and-budgets.md)
- Redis pub/sub and Streams → [Phase 5](../../phase-05-caching/notes/), [Phase 6](../../phase-06-messaging/notes/)
- Presence fan-out = celebrity fan-out → [09-feed-and-timeline.md](09-feed-and-timeline.md)
- Draining and deploy safety → [Phase 7 note 11](../../phase-07-reliability/notes/11-deployment-safety.md)
