# 06 · Load Balancer Operations & Types

> **Why this exists:** the operational details — draining, slow start, outlier ejection — are what separate
> "I've drawn a load balancer" from "I've operated one." Each of these exists because of a specific outage
> someone had.

---

## Reference

## Part 1 — The operational primitives

### Connection draining (graceful shutdown)

**The problem:** you remove an instance from the pool — for a deploy, a scale-down, or a replacement. It has
in-flight requests. Killing it immediately turns them into 502s.

**The correct sequence:**

```
1. Mark the instance "draining"          → LB stops sending NEW requests
2. Instance FAILS its health check       → confirms removal to every LB
3. Instance keeps serving IN-FLIGHT requests
4. Wait for the drain timeout (30-300s)  → or until in-flight hits zero
5. SIGTERM → process finishes and exits cleanly
```

**The subtle ordering detail that catches people:** the instance must **fail its health check *before* it
stops accepting connections.** There's a propagation delay — the LB may take one or two health-check
intervals to notice. If you stop accepting immediately, requests arriving in that window get connection
refused.

**The correct app-side SIGTERM handler:**
```
SIGTERM
  → set health check to FAIL          (LB starts removing you)
  → sleep for ~2 health check intervals  (let the LB actually notice)
  → stop accepting new connections
  → finish in-flight requests (with a deadline)
  → exit
```

**That deliberate sleep is the part everyone omits**, and it's the cause of "we get 502s on every deploy."

**Drain timeout must exceed your longest request.** File uploads, report generation, long polling — a 30 s
drain with a 60 s long-poll still cuts connections.

### Slow start (warm-up)

**The problem:** a new instance joins the pool and immediately receives its full 1/N share. But it has a cold
JIT, empty connection pools, an empty local cache. It's **much slower than the others** — so it times out,
fails health checks, gets ejected, restarts, and repeats.

Worse with **least-connections**, which sees a new (empty) node as "least loaded" and sends it *everything*.

**Slow start ramps traffic up linearly over a window** (30–300 s), letting the node warm before carrying full
load. Available in Envoy, HAProxy, nginx Plus, AWS ALB.

> **This is the fix for the "least connections sends everything to the new node" trap** in note 03, and it's
> also the mitigation for autoscaling death spirals (note 09).

### Outlier ejection (passive health checking)

**Watch real traffic and eject nodes behaving badly**, without an explicit health-check call.

| Trigger | Meaning |
|---|---|
| **Consecutive 5xx** | N errors in a row → eject |
| **Consecutive gateway failures** | Connection errors/timeouts |
| **Success-rate outlier** | Statistical: this node's success rate is >N standard deviations below the fleet mean |
| **Latency outlier** | This node's p95 is far worse than its peers |

**Ejection is temporary and escalating**: eject for 30 s, re-admit; if it fails again, eject for 60 s, then
120 s. Envoy calls this the base ejection time × the ejection count.

**Two safety rails that matter:**
- **`max_ejection_percent`** — never eject more than X% (commonly 10–50%) of the fleet. Prevents a global
  problem (a bad downstream) from ejecting everything. **Same fail-open idea as note 05.**
- **Success-rate outlier detection needs a minimum host count** — with 2 hosts, "statistical outlier" is
  meaningless.

> **Latency-based outlier ejection is the answer to gray failure** — the node that's alive, passing health
> checks, and answering in 5 seconds. Active health checks can't see it. This can.

### Circuit breaking at the LB

Envoy-style limits per upstream cluster: max connections, max pending requests, max concurrent requests,
max retries. When exceeded, requests fail **immediately** rather than queueing.

**Why fail fast is better than queueing:** a queued request consumes memory and a connection while its client
has probably already timed out. Failing fast sheds load and keeps the system on the flat part of the latency
curve ([Phase 0 note 03](../../phase-00-foundations/notes/03-latency-vs-throughput.md)). → Phase 7.

---

## Part 2 — Types of load balancer

| Type | Examples | Pros | Cons |
|---|---|---|---|
| **DNS round-robin** | Multiple A records | Free, no infrastructure | **No health awareness**, cache-bound, poor distribution. Not really load balancing. |
| **Hardware** | F5 BIG-IP, Citrix | Very high throughput, mature | Expensive, slow to change, a physical SPOF |
| **Software** | **nginx, HAProxy, Envoy** | Cheap, flexible, scriptable, runs anywhere | You operate it |
| **Cloud managed** | ALB/NLB, GCP LB, Azure LB | Managed, autoscaling, integrated | Cost, less control, provider lock-in |
| **Client-side** | gRPC LB, Ribbon, service mesh | **No extra hop**, per-request balancing | Every client needs the logic + service discovery |

### Choosing between the software ones

| | **nginx** | **HAProxy** | **Envoy** |
|---|---|---|---|
| Strength | Web serving + reverse proxy, static files, caching | **Pure load balancing**, very mature, great stats | **Dynamic config (xDS)**, observability, gRPC/HTTP2-native |
| Config | File, reload to change | File, reload (or runtime API) | **API-driven, hot-reloads without restart** |
| Active health checks | **nginx Plus only** (OSS has passive only) | ✅ Built in | ✅ Built in |
| Best for | Edge / web tier | L4/L7 balancing at scale | **Service mesh sidecar, dynamic environments** |

> **The nginx OSS detail is worth knowing** and it shows up in the lab: open-source nginx has **passive**
> health checks only (`max_fails` / `fail_timeout`). Active health checks are a paid feature. So with nginx
> OSS, **real user requests are what discover a failure** — someone always eats the first `max_fails` errors.

### Client-side load balancing

The client fetches the list of healthy backends from service discovery and picks one itself.

**Wins:** no extra network hop (saves ~0.5 ms + a failure domain), per-request balancing for HTTP/2 and gRPC,
no LB to scale.

**Costs:** every client (in every language) needs the logic; propagating membership changes takes time; harder
to enforce policy centrally.

**A service mesh gets you both** — a sidecar proxy per pod does client-side balancing, but the logic lives in
the sidecar rather than in your code. That's the actual pitch for a mesh (note 07).

---

## Part 3 — Global load balancing (GSLB)

Getting users to the *right region*, then the right instance.

| Mechanism | How | Failover speed | Notes |
|---|---|---|---|
| **GeoDNS** | Different IP per region based on resolver location | ❌ **Slow** — TTL/cache bound | Sees the resolver, not the user |
| **Anycast** | Same IP announced from many regions; BGP routes to nearest | ✅ **Seconds** | The strong answer |
| **Global LB service** | One stable anycast IP → provider routes to healthy backends | ✅ Seconds | AWS Global Accelerator, Cloudflare, GCP Global LB |
| **Client-side** | App measures latency and picks a region | Fast, but per-client | Netflix/Spotify-style |

**The important carry-over from [Phase 1 note 03](../../phase-01-networking/notes/03-dns.md):
DNS is a bad failover mechanism** — TTL is a hint, resolvers ignore it, and open connections never
re-resolve. **Use DNS to pick a region; use anycast or a global LB to fail over.**

**Latency-based vs geographic routing:** geographic proximity ≠ network proximity. Latency-based routing
measures actual RTT and routes accordingly — usually better.

---

## In your own words

**Write the correct SIGTERM sequence. Why must the health check fail BEFORE you stop accepting connections?**

>

**What is slow start, and which two problems from earlier notes does it fix?**

>

**What's the difference between active health checks and outlier ejection? Why do you want both?**

>

**Why does outlier ejection need a `max_ejection_percent`? What failure does that prevent?**

>

**Which type of outlier detection catches a gray failure, and why can't active health checks?**

>

**nginx OSS has only passive health checks. What's the user-visible consequence when a backend dies?**

>

**Why is client-side load balancing attractive, and what does a service mesh change about the trade?**

>

---

## Links

- Health check design → [05-health-checks.md](05-health-checks.md)
- Least-connections + new nodes → [03-load-balancing-algorithms.md](03-load-balancing-algorithms.md)
- Why DNS can't fail over → [Phase 1 note 03](../../phase-01-networking/notes/03-dns.md)
- Service mesh → [07-proxy-gateway-mesh.md](07-proxy-gateway-mesh.md)
- Load shedding, circuit breakers in depth → Phase 7
- **Measure draining vs killing** → [`../lab/`](../lab/) Part A
