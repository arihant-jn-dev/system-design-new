# 04 · TLS

> **Why this exists:** TLS is step 3 of the URL→first-byte walkthrough, and its **cost in round trips** is the
> part that matters for design. You don't need cryptography depth. You need to know what it costs, where it
> terminates, and how certificates fail.

---

## Reference

### What TLS actually provides

| Property | Mechanism |
|---|---|
| **Confidentiality** | Symmetric encryption (AES-GCM, ChaCha20) of all traffic |
| **Integrity** | AEAD — tampering is detected |
| **Authentication** (of the server) | Certificate chain signed by a trusted CA |
| **Authentication of the client** (optional) | **mTLS** — client presents a cert too |

**Note what it does *not* provide:** it doesn't hide *who* you're talking to. The SNI field (which hostname
you want) is sent in **plaintext** in the ClientHello, so a network observer sees the domain even though the
content is encrypted. (Encrypted Client Hello / ECH is the fix, still rolling out.)

### The handshake — and its cost in RTTs

**TLS 1.2 — 2 RTTs**
```
Client                                  Server
  │──── ClientHello ────────────────────▶│
  │◀─── ServerHello, Certificate, ... ───│    RTT 1
  │──── KeyExchange, ChangeCipherSpec ──▶│
  │◀─── ChangeCipherSpec, Finished ──────│    RTT 2
  │──── Application data ───────────────▶│
```

**TLS 1.3 — 1 RTT** (and 0-RTT on resumption)
```
Client                                  Server
  │──── ClientHello + key share ────────▶│
  │◀─── ServerHello + cert + Finished ───│    RTT 1
  │──── Application data ───────────────▶│
```

**Total cost of a cold HTTPS request:**

| | TLS 1.2 | TLS 1.3 | TLS 1.3 + resumption |
|---|---|---|---|
| TCP handshake | 1 RTT | 1 RTT | 1 RTT |
| TLS handshake | 2 RTT | 1 RTT | **0 RTT** |
| **Total before data** | **3 RTT** | **2 RTT** | **1 RTT** |
| At 150 ms RTT | **450 ms** | **300 ms** | **150 ms** |
| Over QUIC/HTTP-3 | — | 1 RTT total | **0 RTT** |

**This is the number to carry:** TLS 1.3 costs ~1 extra RTT over plain TCP. Cross-continent, that's 150 ms of
pure waiting. **Which is the argument for terminating TLS at the edge** — a CDN PoP 10 ms away turns a 300 ms
handshake into a 20 ms one, then reuses a warm connection to origin.

### Session resumption — how you avoid paying twice

| Mechanism | How | Tradeoff |
|---|---|---|
| **Session IDs** | Server stores session state, client sends the ID | Server-side memory; **breaks across load-balanced servers** unless the cache is shared |
| **Session tickets** | Server encrypts session state and hands it to the client to store | Stateless and LB-friendly. **All servers must share the ticket key**, and that key must be rotated (it's a forward-secrecy risk if stolen). |
| **TLS 1.3 PSK / 0-RTT** | Resume with data in the very first packet | **0-RTT data is replayable** — an attacker can capture and resend it. So 0-RTT must only carry **idempotent** requests (GETs), never a POST that charges a card. |

> **0-RTT replay is a great detail to know.** It's a concrete example of why idempotency (note 09) shows up in
> places you don't expect.

### Where to terminate — and the tradeoff

Covered in [01-l4-vs-l7.md](01-l4-vs-l7.md); the short version:

| Model | Trade |
|---|---|
| **Terminate at CDN/edge** | Best latency (handshake is local), enables caching/WAF/routing. Edge provider is inside your trust boundary. |
| **Terminate at LB, re-encrypt to backend** | The common compliance answer. Slight extra cost, keeps internal traffic encrypted. |
| **Passthrough to backend (L4)** | True end-to-end. Loses L7 routing, caching, and per-request LB. |
| **mTLS everywhere (service mesh)** | Zero-trust; every hop authenticated. High operational cost — cert issuance and rotation for every workload. |

### Certificates — where the failures actually come from

| Failure | Why it happens | Prevention |
|---|---|---|
| **Expiry** | Nobody renewed it. Still a top-tier outage cause at large companies. | **Automate** (ACME/Let's Encrypt, ACM). **Alert at 30 *and* 14 days.** |
| Wrong hostname / missing SAN | Cert doesn't cover the name being requested | Wildcards or SAN lists; test in staging with the real name |
| Incomplete chain | Server sends leaf but not intermediates. Works in browsers (which cache intermediates), **fails in curl/Java/mobile.** | Always serve the full chain; test with `openssl s_client` |
| Clock skew | Client clock wrong → cert appears not-yet-valid or expired | NTP |
| Root expiry | e.g. the 2021 Let's Encrypt DST Root X3 expiry broke many old Android devices | Track root lifecycles for old clients |

**Rotation for mTLS is the hard part.** Public certs are ~90 days; internal workload certs in a mesh are often
hours. That's only feasible with automated issuance (SPIFFE/SPIRE, Vault, Istio citadel) — which is a real
argument in the "do we need a service mesh?" conversation.

### mTLS — mutual TLS

Both sides present certificates. The server verifies the client's cert against a CA it trusts.

| | Good for | Cost |
|---|---|---|
| **mTLS** | Service-to-service auth, zero-trust networks, high-value B2B APIs | Cert lifecycle for every client; painful with browsers/mobile |
| Alternative: **short-lived bearer tokens** | Simpler to issue and revoke | Bearer tokens can be replayed if stolen |
| Alternative: **signed requests (HMAC)** | No TLS client-cert plumbing | Key distribution problem |

**mTLS gives you identity at the transport layer**, so services don't have to implement authn themselves —
this is exactly what a service mesh sells. → Phase 8 / Phase 10.

### Performance notes worth knowing

- **The handshake is the expensive part** (asymmetric crypto); bulk encryption after it is cheap — modern CPUs
  have AES-NI, so throughput cost is a few percent. **TLS is a latency cost, not a throughput cost.**
- **Session resumption + keep-alive is the whole optimisation.** Reuse connections.
- **OCSP stapling** — the server attaches its own revocation proof, so the client doesn't make a separate
  blocking call to the CA (which was historically a real latency and availability hazard).
- **TLS 1.3 removed** the insecure options (RSA key exchange, CBC, RC4, compression), so it's both faster and
  simpler. There's essentially no reason to support anything below 1.2 today.

---

## In your own words

**How many round trips before application data on a cold HTTPS connection with TLS 1.3? Break it down.**

>

**Why is "terminate TLS at the edge" a latency argument as much as an architecture one?**

>

**Why must 0-RTT data be idempotent? Describe the attack.**

>

**Session IDs vs session tickets — why does the choice matter behind a load balancer?**

>

**Your API works in the browser but fails from curl and a Java client. What's the most likely cert problem?**

>

**When is mTLS worth its operational cost, and what's the cheaper alternative?**

>

---

## Links

- Where termination happens, L4 vs L7 → [01-l4-vs-l7.md](01-l4-vs-l7.md)
- Round-trip costs → [02-tcp-vs-udp.md](02-tcp-vs-udp.md)
- QUIC folds TLS into the transport handshake → [05-http-evolution.md](05-http-evolution.md)
- Idempotency (why 0-RTT needs it) → [09-idempotency.md](09-idempotency.md)
- Auth, JWT, OAuth, secrets → Phase 10
