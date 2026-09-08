# XVerify Email Validation — Benchmarking Report & Guide
## 500 Real Requests | What the Numbers Mean | How to Set Timeouts

> **Endpoint tested:**
> `https://usapi.xverify.com/v2/ev/?email=<EMAIL>&type=json&api_key=<KEY>&domain=<DOMAIN>`
> Total requests: 500 | Concurrency: 10 at a time | Total duration: 39.82 seconds

---

## PART 1 — What Is Benchmarking and Why Do It?

```
BENCHMARKING = Running many requests against an API and measuring its behaviour.

WHY YOU DO IT:
  ✓ Know how FAST the API responds (so your users don't wait)
  ✓ Know how RELIABLE it is (does it ever fail or timeout?)
  ✓ Set intelligent TIMEOUT values (not too short, not too long)
  ✓ Understand WHICH email domains are slow vs fast
  ✓ Detect RATE LIMITS before they hit you in production
  ✓ Know the API's response patterns (what statuses come back)

WITHOUT BENCHMARKING:
  You guess your timeout = 5 seconds.
  Turns out p99 is 7.6 seconds → 1% of users get timeout errors.
  You'd never know without data.
```

---

## PART 2 — Benchmark Setup

```
ENDPOINT:    https://usapi.xverify.com/v2/ev/
PARAMETERS:  email, type=json, api_key, domain
TOOL:        Node.js script (custom, async/concurrent)
TOTAL REQS:  500
CONCURRENCY: 10 requests in parallel at a time
TIMEOUT SET: 15,000ms (15s per request — intentionally high to capture real max)
DURATION:    39.82 seconds end-to-end
RPS:         12.6 requests/second

EMAIL DOMAINS TESTED:
  Category          Domains
  ─────────────────────────────────────────────────────
  Major ISP         gmail.com, yahoo.com, outlook.com,
                    hotmail.com, live.com, icloud.com,
                    aol.com, protonmail.com
  Disposable        mailinator.com, guerrillamail.com,
                    throwam.com, tempmail.com, yopmail.com
  Fake/Non-existent fakexyz99999.com, notarealdomain.io,
                    xyzabc12345.net
  Corporate         amazon.com, microsoft.com, apple.com

EMAIL USERNAMES TESTED:
  john.doe, jane.smith, user123, test.user, arihant.j,
  priya.sharma, rahul2024, contact, info, support,
  a, very.long.email.address.here, user+tag, 123456
```

---

## PART 3 — Overall Results

```
┌─────────────────────────────────────────────────────────────────┐
│  OVERALL BENCHMARK RESULTS — 500 REQUESTS                       │
│                                                                 │
│  Total Requests:   500                                          │
│  Successes:        500   (100.00%) ← zero errors or timeouts   │
│  Errors:             0                                          │
│  Timeouts:           0                                          │
│  RPS achieved:     12.6 req/sec                                 │
└─────────────────────────────────────────────────────────────────┘
```

### API Response Status Distribution

```
STATUS          COUNT   PERCENTAGE   WHAT IT MEANS
──────────────────────────────────────────────────────────────────
invalid          334     66.8%       Email is bad — do not send
valid             87     17.4%       Email is deliverable — safe to send
risky             43      8.6%       Email exists but risky (disposable-like)
accept_all        26      5.2%       Server accepts all mail — can't verify
unknown           10      2.0%       Cannot determine — treat as risky
──────────────────────────────────────────────────────────────────
Total            500    100.0%

WHAT EACH STATUS MEANS FOR YOUR BUSINESS:
  valid      → Add to email list. Safe to market to.
  invalid    → DROP. Do not send. Will bounce. Hurts sender reputation.
  risky      → Use caution. Might work, but increases bounce risk.
  accept_all → Server won't reject any email (catch-all). Can't verify.
               Treat as "unknown" — low confidence.
  unknown    → API couldn't determine. Treat conservatively.
```

---

## PART 4 — Latency Analysis (The Most Important Section)

### Raw Numbers

```
LATENCY BREAKDOWN (all 500 requests, in milliseconds):

  Min     297 ms   ← fastest request ever seen
  Avg     715 ms   ← average across all requests
  ─────────────────────────────────────────────────────
  p50     394 ms   ← 50% of requests completed in ≤ 394ms
  p75     499 ms   ← 75% of requests completed in ≤ 499ms
  p90    1543 ms   ← 90% of requests completed in ≤ 1543ms
  p95    2098 ms   ← 95% of requests completed in ≤ 2098ms
  p99    4109 ms   ← 99% of requests completed in ≤ 4109ms
  ─────────────────────────────────────────────────────
  Max    7608 ms   ← slowest request ever seen
```

### What Percentiles Mean (Read This Carefully)

```
PERCENTILE = "What % of requests finished FASTER than this number?"

p50 = 394ms:
  Half your requests are faster than 394ms.
  Half are slower.
  This is the "typical" user experience.

p95 = 2098ms:
  95 out of 100 requests finish in under 2098ms.
  5 out of 100 requests take LONGER than 2098ms.
  In production at 100K requests/day → 5,000 users/day wait > 2 seconds.

p99 = 4109ms:
  99 out of 100 requests finish in under 4109ms.
  1 out of 100 requests takes MORE than 4109ms.
  These are your "tail latency" users — the slow outliers.

Max = 7608ms:
  The single worst request in 500 attempts took 7.6 seconds.
  This could be: slow DNS lookup for that domain, overloaded email server,
  or XVerify doing deep SMTP probing.

VISUAL:
  0ms ──────────────────────────────────────────────── 7608ms
       │        │    │        │        │        │    │
       Min     p50  p75      p90      p95      p99  Max
       297ms  394ms 499ms  1543ms   2098ms  4109ms  7608ms

  The gap between p90 and p99 is HUGE (1543ms → 4109ms).
  This means a small fraction of requests are much slower than the rest.
  These are the "hard" emails — domains that require deep SMTP probing.
```

### Why Is There Such a Big Range?

```
297ms (fast) vs 7608ms (slow) — why the 25× difference?

XVerify does different checks depending on the domain:

FAST CHECKS (< 500ms):
  1. Syntax validation (is the email format correct?)
  2. Domain DNS lookup (does the domain even exist?)
  3. Known disposable/spam database lookup
  → mailinator.com, fakexyz99999.com, yopmail.com → all ~390ms
    (immediately known as invalid/disposable — no deep probing needed)

SLOW CHECKS (500ms – 7000ms):
  1. MX record lookup (who handles email for this domain?)
  2. SMTP connection to the mail server
  3. RCPT TO: probe (does this specific mailbox exist?)
  → yahoo.com, aol.com, protonmail.com, icloud.com → 1000–7000ms
    (real mail servers that require actual SMTP handshake to verify)

THIS IS EXPECTED BEHAVIOUR.
The API is slow for "real" domains because it's doing real work.
Fast for fake/disposable because it knows immediately.
```

---

## PART 5 — Per-Domain Analysis

```
DOMAIN               CATEGORY    AVG(ms)  p95(ms)  STATUS BREAKDOWN
─────────────────────────────────────────────────────────────────────────────
mailinator.com       disposable     433      431    invalid: 100%
guerrillamail.com    disposable     439      440    invalid: 100%
throwam.com          disposable     388      425    invalid: 100%
yopmail.com          disposable     390      423    invalid: 100%
tempmail.com         disposable     391      409    risky: 100%    ←interesting
fakexyz99999.com     fake_domain    393      417    invalid: 100%
notarealdomain.io    fake_domain    396      435    invalid: 100%
xyzabc12345.net      fake_domain    394      412    invalid: 100%
─────────────────────────────────────────────────────────────────────────────
amazon.com           corporate      458      497    accept_all: 100% ←all catch-all
microsoft.com        corporate      684     1223    invalid: 92%, valid: 8%
apple.com            corporate      671     1466    invalid: 81%, risky: 8%, valid: 11%
─────────────────────────────────────────────────────────────────────────────
gmail.com            major_isp      540     1049    risky: 27%, invalid: 62%, valid: 15%
hotmail.com          major_isp      643     1380    valid: 69%, invalid: 19%, risky: 12%
outlook.com          major_isp      802     1472    valid: 50%, invalid: 31%, unknown: 23%
live.com             major_isp      897     2029    valid: 69%, invalid: 31%
icloud.com           major_isp     1182     3037    invalid: 58%, valid: 46%
yahoo.com            major_isp     1215     3941    invalid: 85%, risky: 12%, valid: 8%
aol.com              major_isp     1490     4109    invalid: 73%, valid: 23%, risky: 8%
protonmail.com       major_isp     1709     6451    invalid: 54%, unknown: 12%, valid: 35%
─────────────────────────────────────────────────────────────────────────────

KEY OBSERVATIONS:
  1. Disposable domains are FAST (~390ms) — XVerify knows them immediately.
  2. Fake domains are also FAST (~394ms) — DNS fails instantly.
  3. Major ISPs are SLOW (540–1709ms avg) — require SMTP probing.
  4. protonmail.com is SLOWEST (1709ms avg, p95=6451ms) — strict servers.
  5. amazon.com returns accept_all — catch-all server, no verification possible.
  6. tempmail.com returns "risky" not "invalid" — it IS registered, just disposable.
```

### Per-Category Summary

```
CATEGORY       AVG(ms)   p95(ms)   DOMINANT STATUS
──────────────────────────────────────────────────────────────
disposable       408       425     invalid (fast — known list)
fake_domain      394       419     invalid (fast — DNS fail)
corporate        604      1223     mixed (accept_all or SMTP check)
major_isp       1057      3308     mixed (deep SMTP probing needed)
──────────────────────────────────────────────────────────────

INSIGHT: Build a pre-filter before calling XVerify.
  If you can detect fake domains or disposable locally (cached list),
  skip the API call entirely → saves cost + latency.
```

---

## PART 6 — Timeout Configuration (The Practical Guide)

### What Is a Timeout?

```
TIMEOUT = Maximum time your code will WAIT for a response before giving up.

WITHOUT TIMEOUT:
  Your server sends request to XVerify.
  XVerify is slow (slow SMTP probe) → takes 10 seconds.
  Your server hangs for 10 seconds.
  If 100 users do this simultaneously → 100 hanging threads → server crashes.

WITH TIMEOUT = 3000ms:
  Your server sends request to XVerify.
  After 3 seconds → gives up, returns "unknown" to the user.
  Thread freed. Next request can use it.
  User gets a response quickly (even if it's "we couldn't verify").
```

### What Timeout Value Should You Set?

```
USE YOUR BENCHMARK DATA TO DECIDE:

Our benchmark results:
  p50  = 394ms   → 50% done in under 394ms
  p90  = 1543ms  → 90% done in under 1543ms
  p95  = 2098ms  → 95% done in under 2098ms
  p99  = 4109ms  → 99% done in under 4109ms
  Max  = 7608ms  → absolute worst case

TIMEOUT OPTIONS AND THEIR TRADE-OFFS:

  ┌──────────────┬───────────────┬───────────────────────────────────────────┐
  │ Timeout      │ Requests that │ When to Use                               │
  │ Value        │ will SUCCEED  │                                           │
  ├──────────────┼───────────────┼───────────────────────────────────────────┤
  │ 500ms        │ ~52%          │ Never — too aggressive, half will timeout  │
  │ 1000ms       │ ~78%          │ Very tight — only if UX demands it        │
  │ 2000ms       │ ~93%          │ Balanced for non-critical use cases       │
  │ 3000ms       │ ~96%          │ RECOMMENDED for most use cases            │
  │ 5000ms       │ ~99%          │ Recommended for high-accuracy needs       │
  │ 10000ms      │ ~99.9%        │ For background/batch processing only      │
  │ 15000ms      │ ~100%         │ Only for offline/async validation         │
  └──────────────┴───────────────┴───────────────────────────────────────────┘

RECOMMENDATION:
  Real-time (signup forms, checkout):  timeout = 3000ms
  Background validation (batch jobs):  timeout = 10000ms
  Critical financial flows:            timeout = 5000ms
```

### The Two Types of Timeout

```
TYPE 1: CONNECTION TIMEOUT
  How long to wait for the TCP connection to be established.
  (Can we even REACH the XVerify server?)
  Recommended: 3000ms
  If this triggers: network issue, DNS issue, XVerify server down.

TYPE 2: READ/RESPONSE TIMEOUT
  How long to wait for the full response after connection is established.
  (We connected, but XVerify hasn't responded yet.)
  Recommended: 3000ms–5000ms
  If this triggers: XVerify is doing a slow SMTP probe (deep verification).

CODE EXAMPLE (Node.js):
  const axios = require('axios');

  const response = await axios.get('https://usapi.xverify.com/v2/ev/', {
    params: { email, type: 'json', api_key: KEY, domain: DOMAIN },
    timeout: 5000,          // 5s total timeout (connect + read combined)
  });

CODE EXAMPLE (Python requests):
  import requests
  response = requests.get(
    'https://usapi.xverify.com/v2/ev/',
    params={'email': email, 'type': 'json', 'api_key': KEY, 'domain': DOMAIN},
    timeout=(3, 5)  # (connect_timeout=3s, read_timeout=5s)
  )
```

### What to Do When a Timeout Happens

```
TIMEOUT STRATEGY (don't just return an error to the user):

  OPTION 1: TREAT AS "UNKNOWN" (recommended for signup flows)
    If XVerify times out → treat email as unknown/unverified.
    Let the user proceed. Send a verification email instead.
    Better user experience than blocking them.

  OPTION 2: RETRY ONCE (for batch processing)
    Retry with a slightly longer timeout.
    Wait 500ms before retry to avoid hammering the API.
    If second attempt fails → mark as unknown.

  OPTION 3: QUEUE FOR LATER (for non-blocking flows)
    Accept the email immediately.
    Put validation in a background job queue (SQS, RabbitMQ).
    Mark email as "pending validation" in your DB.
    Update status when validation completes.
    Best for: bulk import, lead gen forms.

  OPTION 4: CIRCUIT BREAKER (advanced)
    If XVerify times out 5 times in a row → stop calling it for 30 seconds.
    Prevents cascading failures when XVerify has an outage.
    After 30s → try one request → if it succeeds, resume normal operation.
```

---

## PART 7 — Key Metrics to Monitor in Production

### The 5 Metrics You Must Track

```
METRIC 1: LATENCY PERCENTILES (p50, p95, p99)
  WHY: Average is misleading. p95 shows what your slow users experience.
  ALERT THRESHOLD: p95 > 4000ms → XVerify might be degraded
  ALERT THRESHOLD: p99 > 8000ms → serious issue
  HOW TO MEASURE: Track every API call duration, compute percentiles every 1 min

METRIC 2: ERROR RATE
  WHY: Tells you if XVerify is having an outage or rejecting your requests.
  ALERT THRESHOLD: Error rate > 1% → investigate
  ALERT THRESHOLD: Error rate > 5% → circuit break + alert team
  ERRORS INCLUDE: HTTP 5xx responses, connection refused, timeouts

METRIC 3: TIMEOUT RATE
  WHY: If your timeout rate spikes, your timeout value might be too low,
       OR XVerify is genuinely slow.
  ALERT THRESHOLD: Timeout rate > 2% → check XVerify status page
  FORMULA: timeout_rate = timeouts / total_requests × 100

METRIC 4: STATUS DISTRIBUTION SHIFT
  WHY: If "invalid" suddenly drops from 67% to 10%, something's wrong
       (API returning wrong data, change in email list quality).
  TRACK: % valid, % invalid, % risky per hour
  ALERT: If distribution shifts > 20% from baseline → review

METRIC 5: COST PER REQUEST
  WHY: XVerify charges per verification. Knowing RPS × cost = monthly spend.
  OUR BENCHMARK: 12.6 RPS with concurrency=10
  EXAMPLE: 100K verifications/day × $0.001/verification = $100/day → $3,000/month
  OPTIMIZE: Cache results. Don't re-verify the same email twice.
```

### Dashboard Setup (What to Show)

```
RECOMMENDED MONITORING DASHBOARD:

  ┌────────────────────────────────────────────────────────┐
  │  XVERIFY API HEALTH DASHBOARD                          │
  │                                                        │
  │  [p50 Latency]  [p95 Latency]  [p99 Latency]          │
  │     394ms          2098ms         4109ms               │
  │  (real-time graph — alert if spikes)                   │
  │                                                        │
  │  [Error Rate]   [Timeout Rate]  [RPS]                  │
  │      0.0%           0.0%         12.6                  │
  │  (alert if > 1%)  (alert if > 2%)                     │
  │                                                        │
  │  [Status Distribution]                                 │
  │   valid: 17.4%  invalid: 66.8%  risky: 8.6%           │
  │   accept_all: 5.2%  unknown: 2.0%                     │
  │  (alert if valid% drops by > 20%)                     │
  │                                                        │
  │  [Slow Domain Tracker]  (which domains are slowest)    │
  │   protonmail: 1709ms avg                               │
  │   aol.com:    1490ms avg                               │
  │   yahoo.com:  1215ms avg                               │
  └────────────────────────────────────────────────────────┘

TOOLS TO USE:
  AWS CloudWatch  → if using Lambda / EC2
  Datadog / Grafana → full metrics dashboards
  Prometheus + AlertManager → open source
  Simple: log each request time to a file, parse with scripts
```

---

## PART 8 — Caching Strategy (Save Cost + Speed)

```
INSIGHT FROM BENCHMARK: The same email validated twice gets the same result.
                         There's no need to call XVerify twice for same email.

CACHING RULES:

  CACHE valid results:    24 hours
    Email "john@gmail.com" was valid yesterday → still valid today.
    gmail.com accounts don't disappear overnight.

  CACHE invalid results:  7 days
    "john@fakexyz999.com" is invalid → will be invalid for weeks.
    Domain doesn't exist → safe to cache long.

  CACHE risky results:    6 hours
    Risky might change (user might delete disposable account).
    Shorter TTL.

  DO NOT CACHE accept_all: Never
    accept_all means we don't know. Next call might give better info.

  DO NOT CACHE unknown:   Never
    Unknown means API couldn't determine. Try again next time.

CACHE KEY: hash(email.toLowerCase())
  "John.Doe@Gmail.COM" → normalize to "john.doe@gmail.com" → same cache key

CACHE IMPLEMENTATION (Redis):
  SET "xverify:john.doe@gmail.com" '{"status":"valid"}' EX 86400  // 24 hours

SAVINGS:
  If 30% of your signups are duplicate emails (common in marketing):
    Without cache: 100K/day × $0.001 = $100/day
    With cache:    70K/day × $0.001 = $70/day  (30% savings)
  At scale: $900/month saved just from caching.
```

---

## PART 9 — Rate Limiting Considerations

```
OUR BENCHMARK RESULT:
  12.6 RPS with concurrency=10 over 40 seconds.
  No rate limit errors observed.

HOWEVER — CHECK YOUR PLAN:

  Most XVerify plans have:
    Concurrent connections limit (e.g., max 10 at once)
    Daily request quota
    Monthly request quota

WHAT HAPPENS IF YOU EXCEED:
  HTTP 429 (Too Many Requests) response
  OR API returns error status in response body
  Your monitoring should catch 429s and alert.

SAFE CONCURRENCY:
  From our test: concurrency=10 was fine.
  Don't go above what your plan allows.
  Add retry-after logic when 429 is received:
    if response.status == 429:
      wait(response.headers['Retry-After'])
      retry()
```

---

## PART 10 — Decision Flow: What to Do With Each Status

```
YOU RECEIVE AN EMAIL ADDRESS → Call XVerify → You get a status

                    ┌─────────────────┐
                    │   status=valid  │
                    └────────┬────────┘
                             │ → ADD TO LIST. Safe to send.
                             │   High deliverability. Low bounce risk.

                    ┌─────────────────┐
                    │  status=invalid │
                    └────────┬────────┘
                             │ → REJECT/DROP. Do not send.
                             │   Will hard bounce. Hurts sender reputation.
                             │   Show user: "Please enter a valid email"

                    ┌─────────────────┐
                    │  status=risky   │
                    └────────┬────────┘
                             │ → SOFT ACCEPT. Send a confirmation email.
                             │   If they confirm → add to list.
                             │   If they don't → remove after 48h.

                    ┌─────────────────────┐
                    │ status=accept_all   │
                    └──────────┬──────────┘
                               │ → TREAT AS RISKY. Server accepts everything.
                               │   Can't know if mailbox really exists.
                               │   Send confirmation email to verify.

                    ┌─────────────────┐
                    │ status=unknown  │
                    └────────┬────────┘
                             │ → TREAT AS RISKY. Couldn't determine.
                             │   Send confirmation email.

                    ┌──────────────────┐
                    │ TIMEOUT / ERROR  │
                    └────────┬─────────┘
                             │ → DO NOT BLOCK USER.
                             │   Allow signup. Queue for background validation.
                             │   Mark email as "pending_verification" in DB.
```

---

## PART 11 — Full Benchmark Summary Table

```
METRIC                         VALUE          INTERPRETATION
──────────────────────────────────────────────────────────────────────────────
Total requests run             500            Good sample size for benchmarking
Duration                       39.82 seconds  ~40 seconds total
Requests per second            12.6 RPS       With concurrency=10
Success rate                   100%           No errors or timeouts ✓
────────────────────────────────────────────────────────────────────────────
Min latency                    297 ms         Best case (cached/known domain)
Average latency                715 ms         Misleading — skewed by slow ones
p50 (median) latency           394 ms         Typical user waits ~0.4 seconds
p90 latency                    1543 ms        1 in 10 users waits > 1.5 seconds
p95 latency                    2098 ms        1 in 20 users waits > 2 seconds
p99 latency                    4109 ms        1 in 100 users waits > 4 seconds
Max latency                    7608 ms        Worst case (deep SMTP probe)
────────────────────────────────────────────────────────────────────────────
Status: valid                  17.4%          ~1 in 6 emails valid in test set
Status: invalid                66.8%          ~2 in 3 emails invalid in test set
Status: risky                  8.6%
Status: accept_all             5.2%
Status: unknown                2.0%
────────────────────────────────────────────────────────────────────────────
Fastest category               fake_domain    394ms avg (DNS fails instantly)
Slowest category               major_isp      1057ms avg (SMTP probing needed)
Fastest domain                 throwam.com    388ms avg
Slowest domain                 protonmail.com 1709ms avg
────────────────────────────────────────────────────────────────────────────
RECOMMENDED timeout            3000ms         Covers ~96% of requests
STRICT timeout (high accuracy) 5000ms         Covers ~99% of requests
Batch/background timeout       10000ms        Covers ~99.9% of requests
──────────────────────────────────────────────────────────────────────────────
```

---

## PART 12 — Quick Implementation Checklist

```
BEFORE GOING TO PRODUCTION:

  □ Set timeout to 3000ms for real-time flows
  □ Set timeout to 10000ms for background/batch flows
  □ Handle timeout → treat as "unknown", don't block user
  □ Cache results: valid=24h, invalid=7d, risky=6h
  □ Normalize emails to lowercase before caching
  □ Log every request: email_hash, latency, status, timestamp
  □ Set up alerting: p95 > 4000ms, error_rate > 1%, timeout_rate > 2%
  □ Implement retry (max 1 retry, 500ms wait) for errors
  □ Implement circuit breaker for XVerify outages
  □ Never expose API key in frontend code (server-side only)
  □ Check your plan's rate limits — don't exceed concurrency limit
  □ Pre-filter obvious invalids locally (no @, no domain, etc.) before API call
```
