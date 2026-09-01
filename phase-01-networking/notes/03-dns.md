# 03 · DNS

> **Why this exists:** DNS is step one of the gate question (URL → first byte), and *"why is DNS a bad
> failover mechanism?"* is a question that separates people who have run production systems from people who
> have read about them. The answer — **you do not control the caches** — generalises to a lot of other things.

---

## Reference

### The resolution path

```
1. Browser cache            (~60 s, browser-specific)
2. OS cache                 (stub resolver / systemd-resolved / nscd)
3. hosts file               (/etc/hosts — checked before any network call)
4. Recursive resolver       (your ISP, or 8.8.8.8 / 1.1.1.1) ← the cache that matters
      │
      ├─▶ 5. Root nameservers (.)          "ask the .com servers"      [13 logical, anycast]
      ├─▶ 6. TLD nameservers (.com)        "ask ns1.example.com"
      └─▶ 7. Authoritative NS (example.com) "it's 93.184.216.34"        ← the real answer
```

**Steps 5–7 are the "iterative" part** — the recursive resolver does the walking; your machine just asks once.
A cold full resolution is 4+ round trips. A warm cache hit is ~0 ms. **In practice DNS is nearly always
cached**, which is exactly what makes it fast *and* what makes it dangerous for failover.

Mostly over **UDP port 53** (small, single packet, cheap). Falls back to TCP for responses > 512 bytes
(DNSSEC, big record sets) and for zone transfers.

### Record types

| Record | Maps | Notes |
|---|---|---|
| **A** | name → IPv4 | The basic one |
| **AAAA** | name → IPv6 | |
| **CNAME** | name → **another name** | **Cannot coexist with other records at the same name**, so no CNAME at the zone apex (`example.com`). This is why cloud providers invented ALIAS/ANAME records. |
| **ALIAS / ANAME** | apex → name | Provider-specific CNAME-at-apex workaround; resolved server-side |
| **MX** | domain → mail server | Has a priority field |
| **TXT** | arbitrary text | SPF, DKIM, domain-ownership verification |
| **NS** | zone → nameservers | Delegation |
| **SRV** | service → host **+ port** | Used by service discovery, SIP, XMPP. Notable because it carries a **port**. |
| **PTR** | IP → name | Reverse DNS; mail servers check it |
| **CAA** | which CAs may issue certs | |
| **SOA** | zone metadata | Serial, refresh, **negative-caching TTL** |

### TTL — and the trap

TTL tells resolvers **how long they may cache** an answer.

| TTL | Effect |
|---|---|
| Low (30–60 s) | Fast propagation of changes; **much higher query volume**; slower average resolution |
| High (24 h) | Fast, cheap, resilient; **changes take a day to take effect** |

**The trap: TTL is a hint, not a contract.**

- Some resolvers **clamp** TTLs to their own minimum (ignoring your 30 s and caching for 5 minutes)
- Some **serve stale** entries past expiry, deliberately (RFC 8767 — it's an availability feature)
- **Java's JVM historically cached DNS forever** by default (`networkaddress.cache.ttl = -1` with a security
  manager). A famous source of "we failed over but the app kept hitting the dead IP."
- Browsers, OSes and connection pools each cache independently
- **Existing open connections don't re-resolve at all** — a long-lived connection pool will keep using the old
  IP indefinitely, no matter what TTL you set

### Why DNS is a bad failover mechanism

**Because you do not control the caches, and therefore you cannot bound your recovery time.**

Concretely, when you repoint a record during an incident:

1. You update the record. **You have no idea when clients will notice.** RTO becomes unbounded.
2. Misbehaving resolvers and stale caches keep sending traffic to the dead IP for *hours*.
3. Long-lived connections never re-resolve — they stay pinned to the failed host until they're closed.
4. Lowering TTL only helps if you did it **in advance**; lowering it during an incident is too late, because
   the old high TTL is already cached.
5. There's no health signal in the protocol. DNS returns a record; it has no idea the host is down.

**So DNS is for *coarse* traffic direction (which region, which provider), not for failover.**

**What to use instead:**

| Level | Mechanism | Failover speed |
|---|---|---|
| Within a DC | **Load balancer health checks** | Seconds |
| Across AZs | LB across AZs, single VIP | Seconds |
| Across regions | **Anycast** — same IP announced from many locations; BGP reroutes | Seconds, and no client change |
| Across regions (alt) | Global LB with health-checked endpoints behind one stable name | Seconds |
| Last resort | DNS failover with low TTL + health checks (Route 53) | **Minutes to hours. Unbounded.** |

> **The interview line:** *"I'd avoid DNS-based failover — TTL is only a hint, resolvers ignore it, and open
> connections never re-resolve, so my RTO would be unbounded. I'd put a stable anycast IP or a global load
> balancer in front and fail over behind it, where I control the health checks."*

### GeoDNS and anycast — the two ways to route users to a nearby region

| | **GeoDNS** | **Anycast** |
|---|---|---|
| How | Authoritative server returns a *different IP* based on the resolver's location | The *same IP* is announced from many datacentres; BGP routes to the nearest |
| Granularity | Sees the **resolver's** IP, not the user's (mitigated by EDNS Client Subnet) | Actual network topology |
| Failover | Slow — cache-bound | **Fast** — withdraw the BGP announcement and traffic reroutes |
| Precision | Coarse, and wrong when users use 8.8.8.8 | Follows real routing |
| Complexity | Easy — a DNS provider feature | Needs BGP, own ASN, or a provider (CDNs do this for you) |
| Used by | Many SaaS products | **Cloudflare, Google, AWS Global Accelerator, root DNS servers** |

**Anycast's quirk:** it's connectionless-friendly (perfect for DNS over UDP) but a routing change mid-TCP
connection can break it, because packets suddenly land on a different machine with no connection state. In
practice BGP is stable enough that this is rare, and QUIC's connection IDs handle it better than TCP.

### Other DNS facts worth having

- **Negative caching**: NXDOMAIN responses are cached too (per the SOA minimum). Creating a record that
  someone already queried can take a while to become visible.
- **Round-robin DNS** returns multiple A records — a poor man's load balancer. No health awareness, and
  clients cache/pick unpredictably. Fine for spreading load; useless for availability.
- **DNS is a dependency and an SPOF.** The 2016 Dyn DDoS took down Twitter, Spotify, GitHub and Reddit —
  none of which were themselves attacked. **Use two DNS providers** for anything critical.
- **Internal service discovery** often uses DNS (Kubernetes `svc.cluster.local`, Consul) — same caching
  caveats apply, which is why k8s uses short TTLs and why sidecars often bypass DNS.
- **DoH/DoT** (DNS over HTTPS/TLS) encrypt queries — good for privacy, and they take resolution *away* from
  the network operator, which breaks some enterprise split-horizon setups.

---

## In your own words

**Trace a full cold DNS resolution for `www.example.com`. Name every cache and every server tier.**

>

**Why is DNS a bad failover mechanism? Give at least three independent reasons.**

>

**What would you use instead for a fast regional failover, and why is it better?**

>

**Why can't you put a CNAME at the zone apex? What do providers do about it?**

>

**GeoDNS vs anycast — when would you pick each?**

>

**Your team lowers TTL to 30 s during an incident to speed up a failover. Why doesn't that work?**

>

---

## Links

- This is step 1 of the gate question → [`../GATE.md`](../GATE.md)
- Anycast and GSLB in a load-balancing context → Phase 2
- Multi-region failover, RTO/RPO → Phase 7
- UDP, and why DNS uses it → [02-tcp-vs-udp.md](02-tcp-vs-udp.md)
