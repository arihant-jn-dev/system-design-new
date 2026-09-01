# 09·10 · Notifications & Multi-Channel Fan-Out

> **Why this exists:** every product has one, it's a favourite "design X" question, and ⭐ **the interesting
> parts are all the ones people skip: preferences, dedupe, digests, quiet hours and provider failover.**

---

## Reference

### The shape

```
events ──▶ [ TRIGGER ] ──▶ [ PREFERENCES ] ──▶ [ DEDUPE ] ──▶ [ RATE/DIGEST ]
                                                                    │
                          ┌──────────────┬──────────────┬───────────┘
                          ▼              ▼              ▼
                       push (APNs/    email (SES/     SMS (Twilio)   in-app
                        FCM)          SendGrid)
                          └──────────────┴──────────────┴──▶ delivery tracking
```

⭐ **The pipeline order matters and is worth stating:** *decide whether to send at all* → *decide the
channel* → *decide when* → *render* → *deliver* → *track*. **Most bad notification systems render and send
first and bolt preferences on later.**

### ⭐ Preferences — the part that's actually load-bearing

**A matrix, not a boolean:** *(user × event type × channel) → on/off*, plus **quiet hours in the user's
timezone**, plus per-channel frequency caps, plus a **global kill switch**.

⚠️ **Legal, not optional:** email needs one-click unsubscribe (CAN-SPAM/GDPR), SMS needs STOP handling.
⭐ **Some notifications are TRANSACTIONAL and MUST bypass preferences** — password reset, security alerts,
payment failures. ⭐ **Getting the transactional/marketing split wrong is a compliance incident, not a bug.**

⭐ **Check preferences as early as possible** — a notification suppressed before rendering costs nothing; one
suppressed after you've paid SendGrid costs money and burns your sender reputation.

### ⭐ Deduplication

⚠️ **At-least-once delivery + retries + multiple triggers for one real-world event = the user gets the same
alert four times.** That's the #1 complaint about every notification system.

| | |
|---|---|
| ⭐ **An idempotency key per logical notification** | `(user, event_type, entity_id)` → a dedupe store with a TTL ([14](14-idempotency-and-dedupe.md)) |
| ⭐ **Collapse, don't just suppress** | *"Alice and 4 others liked your post"* — ⭐ **the right answer is usually AGGREGATION, not deletion** |
| **Per-channel dedupe** | the same alert may legitimately go to push *and* email |
| ⚠️ **TTL sizing** | too short → duplicates return; too long → a legitimate repeat is swallowed |

### ⭐ Batching & digests

⭐ **The single biggest lever on both cost and user goodwill.** 50 individual "someone liked your post"
pushes is a reason to uninstall; one hourly summary is a feature.

**Windowing:** hold events for N minutes, then flush a combined notification · **debounce** (reset the timer
on each new event, so a burst produces one message) · **daily/weekly digests** for low-urgency types.

⭐ **Escalate by urgency instead of sending everything everywhere:** in-app immediately → push if unread
after 5 min → email if unread after an hour. ⭐ **That "notification ladder" is a strong thing to volunteer.**

### Priority lanes

⚠️ **A marketing blast must never delay a 2FA code.** ⭐ **Separate queues (and separate worker pools and
separate provider accounts) per priority class** — this is a **bulkhead**
([Phase 7 note 04](../../phase-07-reliability/notes/04-bulkheads-and-isolation.md)).

| Lane | |
|---|---|
| ⭐ **Critical** | 2FA, security, payment failure — **immediate, bypasses preferences and rate limits** |
| **Transactional** | receipts, shipping — prompt, respects channel preference |
| **Social** | likes, mentions — batchable |
| **Marketing** | ⭐ **strictly rate-limited, first to be shed under load** |

### ⭐ Channels — their real properties

| Channel | Latency | Cost | The gotcha |
|---|---|---|---|
| **In-app** | instant | ~0 | only if they're in the app |
| **Push** (APNs/FCM) | seconds | ~0 | ⚠️ **tokens expire and rotate** — you must prune dead tokens or your delivery rate quietly rots; payload size limits; per-platform quirks |
| **Email** | seconds–minutes | low | ⭐ **deliverability is the whole game** — SPF/DKIM/DMARC, warm-up, bounce/complaint handling. ⚠️ **A spam-flagged domain is a weeks-long recovery** |
| **SMS** | seconds | ⚠️ **expensive** | carrier filtering, country rules, ⚠️ **fraud: "SMS pumping" attacks bill you for traffic to premium numbers** |
| **Webhook** | seconds | ~0 | you're now *someone else's* unreliable dependency — sign payloads, retry with backoff ([16](16-payments-primitives.md)) |

### ⭐ Provider failover and delivery tracking

⭐ **Two providers per channel, behind one interface**, with health-based routing — providers *do* have
outages, and a notification system that's down during an incident is down exactly when you need it.
⚠️ **But failover across providers risks duplicates** — the idempotency key must be carried across.

**Track the funnel, don't just count sends:** `queued → sent → accepted by provider → delivered → opened →
clicked`. ⭐ **Alert on the RATIOS, not the raw counts** — *"push delivery rate fell from 94% to 61%"* is the
signal; *"we sent 4 M notifications"* is not. ⚠️ **A silent collapse in delivery rate is the classic
notification outage** — everything looks healthy because nothing errors.

### Templating & i18n

Versioned templates with variable interpolation, **rendered at send time** (not at queue time — content can
change) · localisation with **per-locale fallbacks** · **preview + test-send tooling** · ⚠️ **never build
templates by string concatenation in application code** — you'll be shipping a deploy to fix a typo.

---

## In your own words

**⭐ Draw the pipeline in order. Why does the order matter?**

>

**⭐ Why is a preference matrix, not a boolean? What must bypass it, and why does that matter legally?**

>

**⭐ Why check preferences early?**

>

**Why do duplicates happen, and what's usually better than suppression?**

>

**⭐ What's the biggest lever on cost and goodwill? Describe the notification ladder.**

>

**⭐ Why do you need priority lanes, and what pattern is that?**

>

**One real gotcha for each of push, email, and SMS.**

>

**⭐ What do you alert on, and why is the raw send count useless?**

>

**Why two providers per channel, and what does failover risk?**

>

---

## Links

- Queues, at-least-once, DLQs → [Phase 6](../../phase-06-messaging/notes/)
- Bulkheads and priority shedding → [Phase 7 notes 04](../../phase-07-reliability/notes/04-bulkheads-and-isolation.md), [05](../../phase-07-reliability/notes/05-load-shedding.md)
- Dedupe stores and TTLs → [14-idempotency-and-dedupe.md](14-idempotency-and-dedupe.md)
- Fan-out cost, celebrity accounts → [09-feed-and-timeline.md](09-feed-and-timeline.md)
- In-app delivery in real time → [11-websocket-infrastructure.md](11-websocket-infrastructure.md)
- Alert on ratios, not counts → [Phase 7 note 10](../../phase-07-reliability/notes/10-alerting-and-slos.md)
