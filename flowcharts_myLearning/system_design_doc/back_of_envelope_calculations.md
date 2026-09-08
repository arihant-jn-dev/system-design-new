# Back of the Envelope Calculations
## System Design Estimation — The Complete Guide

> **What is "Back of the Envelope"?**
> It is the art of making rough but directionally-correct estimates using simple math,
> common sense, and a handful of numbers you keep in your head.
> The goal is NOT precision — it is ORDER OF MAGNITUDE correctness.
> Off by 2x is fine. Off by 1000x is a disaster.
>
> In system design interviews and real engineering, these calculations decide:
> - How many servers do I need?
> - Will a single database handle this load?
> - Do I need caching? Sharding? A CDN?
> - How much will storage cost per year?

---

## PART 0 — The Mental Model Before You Calculate Anything

```
THE THREE QUESTIONS YOU MUST ANSWER FIRST:

  1. SCALE — How many users? How many requests per second?
  2. DATA — What data are we storing? How much grows per day?
  3. PERFORMANCE — What latency is acceptable? What throughput do we need?

ONLY AFTER answering these do you pick architecture.
Calculation drives architecture. NOT the other way around.
```

---

## PART 1 — Numbers Every Engineer Must Memorize

### 1A. Powers of 10 (The Foundation)

```
POWER         VALUE                   STORAGE NAME    NETWORK TERM
─────────────────────────────────────────────────────────────────
10^3        = 1,000                   1 KB            1 Kbps
10^6        = 1,000,000              1 MB            1 Mbps
10^9        = 1,000,000,000          1 GB            1 Gbps
10^12       = 1,000,000,000,000      1 TB            1 Tbps
10^15       = 1,000,000,000,000,000  1 PB

TRICK: Every 3 zeros = one unit jump (KB → MB → GB → TB → PB)
```

### 1B. Time Conversions (Critical for RPS calculations)

```
TIME UNIT     SECONDS
──────────────────────────────────────────────
1 minute    = 60 seconds
1 hour      = 3,600 seconds      (~4K)
1 day       = 86,400 seconds     (~100K)  ← MEMORIZE THIS
1 month     = 2,592,000 seconds  (~2.5M)
1 year      = 31,536,000 seconds (~30M)   ← MEMORIZE THIS

SHORTCUT TRICK:
  1 day  ≈ 100,000 seconds  (actual: 86,400 — close enough)
  1 year ≈ 30,000,000 seconds

WHY THIS MATTERS:
  If you have 10M requests/day → 10,000,000 / 100,000 = 100 RPS (avg)
  If peak = 5x average → peak RPS = 500 RPS
```

### 1C. Latency Numbers (Jeff Dean's famous table — internalize these)

```
OPERATION                              LATENCY        RELATIVE FEEL
──────────────────────────────────────────────────────────────────────────
L1 cache reference                     0.5 ns         1 second
Branch misprediction                   5 ns           10 seconds
L2 cache reference                     7 ns           14 seconds
Mutex lock/unlock                      25 ns          50 seconds
Main memory (RAM) reference            100 ns         3.3 minutes
Compress 1KB with Snappy               3,000 ns       1.5 hours
Read 1 MB sequentially from RAM        250,000 ns     5.5 days
Read 4KB randomly from SSD             150,000 ns     3.3 days
Round trip within datacenter           500,000 ns     11 days
Read 1 MB sequentially from SSD        1,000,000 ns   16.5 days
Disk seek (HDD)                        10,000,000 ns  16.5 weeks
Read 1 MB sequentially from HDD        20,000,000 ns  33 weeks
Send packet CA → Netherlands → CA      150,000,000 ns 5+ years

KEY TAKEAWAYS:
  ✓ RAM is 100x faster than SSD
  ✓ SSD is 100x faster than HDD (for random reads)
  ✓ Network within datacenter ≈ 0.5ms
  ✓ Cross-continent network ≈ 150ms
  ✓ Avoid disk seeks at all costs
  ✓ Prefer sequential reads over random reads
```

### 1D. Availability Numbers (Nines)

```
AVAILABILITY    DOWNTIME/YEAR    DOWNTIME/MONTH    DOWNTIME/WEEK
─────────────────────────────────────────────────────────────────
90%   (1 nine)  36.5 days        72 hours          16.8 hours
99%   (2 nines) 3.65 days        7.2 hours         1.68 hours
99.9% (3 nines) 8.76 hours       43.8 min          10.1 min
99.99%(4 nines) 52.6 minutes     4.38 min          1.01 min
99.999%(5 nines)5.26 minutes     26.28 sec         6.05 sec

RULE: Each additional "9" = 10x less downtime
Most SaaS products target 99.9% (3 nines).
Financial systems target 99.999% (5 nines).
```

### 1E. Typical Data Sizes (What Does 1 Record Weigh?)

```
DATA TYPE                    SIZE
─────────────────────────────────────────
Single ASCII character       1 byte
Single Unicode character     2-4 bytes
Integer (32-bit)             4 bytes
Long integer (64-bit)        8 bytes
Float (64-bit double)        8 bytes
UUID / GUID                  16 bytes
SHA-256 hash                 32 bytes
IPv4 address (string)        15 bytes   ("255.255.255.255")
IPv4 address (binary)        4 bytes
IPv6 address (binary)        16 bytes
Timestamp (Unix epoch)       8 bytes
URL (typical)                100 bytes
Tweet / short text           200 bytes
Typical metadata row         ~1 KB
Small JSON document          ~1-10 KB
Web page (HTML)              ~100 KB
High-quality thumbnail       ~100 KB
MP3 song (5 min)             ~5 MB
HD video (1 min, compressed) ~50 MB
4K video (1 min, compressed) ~200 MB
```

---

## PART 2 — The Estimation Framework (Step-by-Step Process)

```
STEP 1: CLARIFY THE SCOPE
  → Who are the users? (Global? Regional?)
  → What is the core feature to estimate? (reads? writes? storage?)
  → What is the time horizon? (per second? per year?)

STEP 2: ESTIMATE DAU (Daily Active Users)
  → Start from total registered users
  → Apply DAU ratio (typically 10-50% of MAU is DAU)

STEP 3: CALCULATE TRAFFIC (RPS)
  → Estimate requests per user per day
  → Total requests/day = DAU × requests/user/day
  → Avg RPS = Total requests/day ÷ 86,400
  → Peak RPS = Avg RPS × peak factor (typically 2x to 10x)

STEP 4: ESTIMATE STORAGE
  → Per-record size (add up fields)
  → Daily new records = writes per day
  → Daily data growth = writes/day × record size
  → Annual growth = daily × 365
  → Add replication factor (usually 3x)

STEP 5: ESTIMATE BANDWIDTH
  → Read bandwidth = read RPS × avg response size
  → Write bandwidth = write RPS × avg payload size

STEP 6: ESTIMATE COMPUTE (Servers)
  → QPS a single server can handle (typically 1K-10K for HTTP)
  → Servers needed = Peak RPS ÷ QPS per server

STEP 7: SANITY CHECK
  → Do the numbers make sense?
  → Compare to known systems (Twitter handles ~500K RPS total)
```

---

## PART 3 — Key Terms Explained

### Traffic Terms

```
TERM        FULL FORM                    MEANING
────────────────────────────────────────────────────────────────────────
RPS         Requests Per Second          How many HTTP requests hit your server each second
QPS         Queries Per Second           Same as RPS, often used for database queries
TPS         Transactions Per Second      Database write transactions per second
MAU         Monthly Active Users         Users who used app at least once in last 30 days
DAU         Daily Active Users           Users who used app at least once today
DAU/MAU     Engagement ratio             30-70% is healthy; WhatsApp = ~70% (very high)
Peak RPS    —                            Highest traffic spike (usually 5-10x average)
P99 latency —                            99th percentile: 99% of requests served faster than this
```

### Storage Terms

```
TERM            MEANING
────────────────────────────────────────────────────────────────────────
Hot data        Frequently accessed data → Keep in memory/SSD
Warm data       Occasionally accessed → SSD
Cold data       Rarely accessed → HDD / archival (S3 Glacier)
Write amplification  Writing 1 logical byte causes N physical bytes to be written
Read amplification   Reading 1 logical byte requires reading N physical bytes
Replication factor   How many copies of data (usually 3 for fault tolerance)
Compression ratio    Raw size ÷ compressed size (text: ~5x, already-compressed video: ~1.1x)
```

### Compute Terms

```
TERM          MEANING
────────────────────────────────────────────────────────────────────────
CPU core      One processing unit; a 32-core server can run 32 threads simultaneously
Thread        Lightweight execution context; typically 1-2 threads per CPU core
Concurrency   How many requests a server handles simultaneously
Throughput    How many requests/sec a system processes successfully
Latency       Time from request to response (user-perceived delay)
SLA           Service Level Agreement — contractual uptime/latency guarantee
SLO           Service Level Objective — internal target (usually stricter than SLA)
p50/p95/p99   Percentile latency — "95% of requests complete within X ms"
```

### Networking Terms

```
TERM          MEANING
────────────────────────────────────────────────────────────────────────
Bandwidth     Max data transfer rate of a network link (e.g., 1 Gbps NIC)
Throughput    Actual data transferred (always ≤ bandwidth due to overhead)
Ingress       Data coming INTO your system (usually free from cloud providers)
Egress        Data going OUT of your system (cloud providers charge for this!)
CDN           Content Delivery Network — serves static files from edge locations
RTT           Round Trip Time — time for a packet to travel to server and back
TTL           Time To Live — how long a cache entry stays valid
```

---

## PART 4 — Full Worked Examples

---

### EXAMPLE 1: Design Twitter (Simplified)

**Given:** Design the core tweet storage and delivery system.

#### Step 1: Clarify Scale Assumptions

```
Total registered users:   500 million
DAU (Daily Active Users): 100 million (20% of total — realistic for Twitter)
Avg tweets posted/user/day: 2
Read-to-write ratio: 100:1 (people read far more than they tweet)
```

#### Step 2: Calculate Write Traffic

```
TWEETS WRITTEN PER DAY:
  = DAU × tweets per user per day
  = 100,000,000 × 2
  = 200,000,000 tweets/day
  = 200M tweets/day

WRITE RPS (average):
  = 200,000,000 ÷ 86,400
  ≈ 200,000,000 ÷ 100,000  (shortcut)
  = 2,000 writes/sec (avg)

WRITE RPS (peak — assume 3x spike during events):
  = 2,000 × 3 = 6,000 writes/sec
```

#### Step 3: Calculate Read Traffic

```
READ-TO-WRITE RATIO = 100:1

READ RPS (avg):
  = Write RPS × 100
  = 2,000 × 100
  = 200,000 reads/sec (avg)

READ RPS (peak):
  = 6,000 × 100 = 600,000 reads/sec (peak)
```

#### Step 4: Estimate Storage Per Tweet

```
TWEET RECORD FIELDS:
  tweet_id        8 bytes   (64-bit integer)
  user_id         8 bytes
  content         280 bytes (280 Unicode chars max)
  created_at      8 bytes   (Unix timestamp)
  like_count      4 bytes
  retweet_count   4 bytes
  reply_count     4 bytes
  metadata        ~64 bytes (language, client, flags)
  ─────────────────────────
  TOTAL           ~400 bytes per tweet

ROUND UP to 500 bytes per tweet (for indexes, overhead)
```

#### Step 5: Calculate Storage Growth

```
DAILY STORAGE GROWTH:
  = 200M tweets/day × 500 bytes/tweet
  = 100,000,000,000 bytes/day
  = 100 GB/day

ANNUAL STORAGE GROWTH:
  = 100 GB/day × 365 days
  = 36,500 GB
  = ~36 TB/year  (raw data)

WITH REPLICATION (factor of 3):
  = 36 TB × 3
  = ~110 TB/year

OVER 5 YEARS:
  = 110 TB × 5
  = ~550 TB ≈ 0.5 PB
```

#### Step 6: Estimate Bandwidth

```
READ BANDWIDTH:
  Each tweet response ≈ 2 KB (tweet + metadata)
  = 200,000 reads/sec × 2,000 bytes
  = 400,000,000 bytes/sec
  = 400 MB/s average read bandwidth
  = ~3.2 Gbps (need beefy network links)

WRITE BANDWIDTH:
  = 2,000 writes/sec × 500 bytes
  = 1,000,000 bytes/sec
  = 1 MB/s write bandwidth (very manageable)
```

#### Step 7: Estimate Servers Needed

```
ASSUMPTION: 1 modern app server handles ~10,000 read requests/sec

READ SERVERS NEEDED (peak):
  = 600,000 peak read RPS ÷ 10,000 per server
  = 60 servers (minimum)

ADD 50% headroom for safety:
  = 90 app servers for reads

DATABASE SERVERS:
  = 6,000 write RPS — needs sharded DB
  = Assuming each DB primary handles 5,000 writes/sec
  = 2 primary shards (but use 4+ for safety)
  = With replicas (1 primary + 2 replicas) × 4 shards
  = 12 DB nodes minimum
```

#### Summary Box: Twitter Estimates

```
┌─────────────────────────────────────────────────────┐
│           TWITTER SYSTEM ESTIMATES                  │
├─────────────────────────────────────────────────────┤
│ Write RPS (peak)         6,000 writes/sec           │
│ Read RPS (peak)          600,000 reads/sec          │
│ Storage growth           ~100 GB/day                │
│ Storage (5 years w/ rep) ~550 TB                   │
│ Read bandwidth           ~400 MB/s (avg)            │
│ App servers needed       ~90                        │
│ DB nodes needed          ~12                        │
└─────────────────────────────────────────────────────┘
```

---

### EXAMPLE 2: Design YouTube (Video Storage & Streaming)

**Given:** Design the video upload and delivery system.

#### Step 1: Scale Assumptions

```
MAU:  2 billion
DAU:  500 million (25% of MAU — realistic for YouTube)
Videos uploaded/day: 500 hours of video every minute
                   = 500 × 60 = 30,000 hours/day
Avg video length: 10 minutes
Videos uploaded/day: 30,000 hours × 6 videos/hour = 180,000 videos/day

Video views/day: 1 billion (given by YouTube publicly)
```

#### Step 2: Video Storage Calculation

```
RAW VIDEO SIZE:
  1 min of HD video ≈ 50 MB
  10 min video (raw) = 500 MB

AFTER ENCODING (multiple resolutions):
  YouTube encodes each video into multiple formats:
    360p  ≈  2 MB/min  → 10 min = 20 MB
    480p  ≈  4 MB/min  → 10 min = 40 MB
    720p  ≈  8 MB/min  → 10 min = 80 MB
    1080p ≈ 16 MB/min  → 10 min = 160 MB
    4K    ≈ 64 MB/min  → 10 min = 640 MB
    ──────────────────────────────────────
    Total per video ≈ ~1 GB (all resolutions combined)

DAILY STORAGE GROWTH:
  = 180,000 videos/day × 1 GB/video
  = 180,000 GB/day
  = 180 TB/day

WITH REPLICATION (3x) + CDN caching (2x for hot content):
  = 180 TB × 5
  = 900 TB/day in total infrastructure

ANNUAL STORAGE:
  = 180 TB/day × 365
  = 65,700 TB
  = ~66 PB/year  (just for new uploads)
```

#### Step 3: Video Streaming Bandwidth

```
CONCURRENT VIEWERS:
  1 billion views/day ÷ 86,400 sec = 11,574 views/sec (avg)
  Assume avg view duration = 10 min = 600 sec
  Concurrent viewers = views/sec × avg duration
                     = 11,574 × 600
                     = ~7 million concurrent viewers

STREAMING BANDWIDTH PER USER:
  720p at 2 Mbps (typical adaptive streaming)

TOTAL EGRESS BANDWIDTH:
  = 7,000,000 concurrent viewers × 2 Mbps
  = 14,000,000 Mbps
  = 14 Tbps of outgoing bandwidth!

This is why YouTube uses a massive global CDN.
Without CDN: impossible to serve from one location.
With CDN: distribute this 14 Tbps across thousands of edge nodes.
```

#### Step 4: Upload Bandwidth

```
180,000 videos/day uploaded
Average upload speed: 10 min raw video at 500 MB
Upload time (typical): ~5 min for 500 MB at ~13 Mbps

PEAK UPLOAD RPS:
  = 180,000 uploads/day ÷ 86,400 sec = ~2 uploads/sec (avg)
  = Peak (10x): ~20 concurrent uploads/sec

UPLOAD BANDWIDTH:
  = 2 uploads/sec × 500 MB × 8 bits/byte
  = 8,000 Mbps = 8 Gbps ingress bandwidth (avg)
  = Peak: ~80 Gbps ingress

GOOD NEWS: Ingress is free on most cloud platforms.
BAD NEWS: Egress (streaming) is NOT free — 14 Tbps costs millions/month.
```

#### Summary Box: YouTube Estimates

```
┌─────────────────────────────────────────────────────────┐
│              YOUTUBE SYSTEM ESTIMATES                   │
├─────────────────────────────────────────────────────────┤
│ Videos uploaded/day          180,000                    │
│ Daily storage growth         180 TB (raw) / 900 TB total│
│ Annual new storage           ~66 PB/year                │
│ Concurrent viewers           ~7 million                 │
│ Egress streaming bandwidth   ~14 Tbps                   │
│ Upload ingress bandwidth     ~8 Gbps avg                │
└─────────────────────────────────────────────────────────┘
```

---

### EXAMPLE 3: Design WhatsApp (Messaging System)

**Given:** Design real-time message delivery.

#### Step 1: Scale Assumptions

```
Total users:   2 billion
DAU:           1.4 billion (70% DAU/MAU — WhatsApp is very sticky)
Messages/user/day: 50 messages (some send 5, some send 200 → avg 50)
Total messages/day: 1.4B × 50 = 70 billion messages/day
```

#### Step 2: Message RPS

```
WRITE RPS (messages sent):
  = 70,000,000,000 ÷ 86,400
  ≈ 70,000,000,000 ÷ 100,000  (shortcut)
  = 700,000 messages/sec (avg)

PEAK WRITE RPS (3x spike on festivals/events):
  = 700,000 × 3 = 2,100,000 messages/sec
  = 2.1 million messages/sec (peak)
```

#### Step 3: Message Storage

```
MESSAGE RECORD FIELDS:
  message_id      8 bytes
  sender_id       8 bytes
  receiver_id     8 bytes
  chat_id         8 bytes
  content         1000 bytes (avg message ~100 chars, allow up to 1000)
  content_type    1 byte  (text/image/video/audio)
  timestamp       8 bytes
  status          1 byte  (sent/delivered/read)
  ───────────────────────
  TOTAL           ~1042 bytes ≈ 1 KB per message

DAILY STORAGE FOR TEXT MESSAGES:
  = 70B messages × 1 KB
  = 70,000 GB
  = 70 TB/day

BUT WhatsApp encrypts messages and does NOT store them on server
after delivery (end-to-end encryption, messages deleted after delivery).

STORED DATA = undelivered messages only (typically < 1% of total)
  = 70 TB × 1% = 700 GB of pending messages at any time

MEDIA STORAGE (separate estimate):
  ~30% of messages contain media (photos, videos, docs)
  = 70B × 30% = 21B media messages/day
  Average media = 500 KB (mix of photos and small videos)
  = 21,000,000,000 × 500,000 bytes
  = 10,500,000,000,000,000 bytes
  = 10.5 PB/day  ← This is why WhatsApp uses cloud storage!
  (WhatsApp stores media on AWS S3, not on its own servers)
```

#### Step 4: Connection Estimation (WebSocket)

```
WhatsApp uses persistent WebSocket connections for real-time messaging.

CONCURRENT CONNECTIONS:
  DAU = 1.4 billion
  Peak concurrent online (assume 20% online at same time):
  = 1.4B × 20% = 280 million concurrent WebSocket connections

SERVERS FOR CONNECTIONS:
  Each server holds ~50,000 concurrent WebSocket connections
  (modern servers with async I/O can go higher, but 50K is safe)
  
  Servers needed = 280,000,000 ÷ 50,000 = 5,600 servers
  
  With N+1 redundancy: ~6,000 connection servers (called "chat servers")
```

#### Summary Box: WhatsApp Estimates

```
┌─────────────────────────────────────────────────────────┐
│           WHATSAPP SYSTEM ESTIMATES                     │
├─────────────────────────────────────────────────────────┤
│ Messages/day                70 billion                  │
│ Avg write RPS               700,000/sec                 │
│ Peak write RPS              2.1 million/sec             │
│ Pending message storage     ~700 GB                     │
│ Media storage growth        ~10.5 PB/day                │
│ Concurrent WebSocket conns  280 million                 │
│ Chat servers needed         ~6,000                      │
└─────────────────────────────────────────────────────────┘
```

---

### EXAMPLE 4: Design a URL Shortener (like bit.ly)

**Given:** Design a URL shortening service.

#### Step 1: Scale Assumptions

```
New URLs shortened/day:  100 million (100M)
Read:Write ratio:        100:1  (people share and click links far more than create)
URL redirects/day:       100M × 100 = 10 billion
Data retention:          5 years
```

#### Step 2: RPS Calculation

```
WRITE RPS:
  = 100M writes/day ÷ 86,400
  ≈ 100M ÷ 100K = 1,000 writes/sec (avg)
  Peak (3x): 3,000 writes/sec

READ RPS:
  = 10B reads/day ÷ 86,400
  ≈ 10B ÷ 100K = 100,000 reads/sec (avg)
  Peak (3x): 300,000 reads/sec
```

#### Step 3: Short URL Key Design

```
HOW LONG SHOULD THE SHORT CODE BE?

Option A: Numeric only (0-9) = 10 characters to choose from
  6-digit code: 10^6 = 1 million combinations  → NOT ENOUGH
  7-digit code: 10^7 = 10 million              → barely enough
  8-digit code: 10^8 = 100 million             → fits 1 day only!

Option B: Alphanumeric (a-z + A-Z + 0-9) = 62 characters
  6-char code: 62^6 = 56.8 billion combinations
  Over 5 years: 100M × 365 × 5 = 182.5 billion URLs needed
  7-char code: 62^7 = 3.5 trillion → SUFFICIENT for decades

CONCLUSION: Use 7 alphanumeric characters → 3.5 trillion unique short codes
```

#### Step 4: Storage Calculation

```
URL RECORD:
  short_code   7 bytes
  long_url     200 bytes (avg URL length)
  user_id      8 bytes
  created_at   8 bytes
  expires_at   8 bytes
  click_count  8 bytes
  ───────────────────
  TOTAL        ~240 bytes per URL

DAILY STORAGE GROWTH:
  = 100M URLs × 240 bytes
  = 24,000,000,000 bytes
  = 24 GB/day

5-YEAR STORAGE:
  = 24 GB × 365 × 5
  = 43,800 GB
  = ~44 TB  (very manageable — no sharding needed for storage alone)

WITH REPLICATION (3x):
  = 44 × 3 = ~132 TB over 5 years
```

#### Step 5: Cache Strategy

```
"20% of URLs generate 80% of traffic" (Pareto principle)

CACHE ONLY THE HOT 20%:
  Total URLs at year 5: 100M/day × 365 × 5 = 182.5 billion URLs
  Hot 20%: 36.5 billion URLs × 240 bytes = 8.76 TB of cache

That's too large for a single Redis instance.
→ Use a Redis cluster with distributed cache.

HOT-HOURS SHORTCUT:
  If you only cache "today's" links (fresh viral content):
  Today's URLs: 100M × 240 bytes = 24 GB of data in cache
  This fits on a single large Redis instance (128 GB RAM server)
  Cache hit rate ~80% → reduces DB reads by 80%
  DB read RPS drops from 300K → 60K (manageable)
```

#### Summary Box: URL Shortener Estimates

```
┌─────────────────────────────────────────────────────────┐
│         URL SHORTENER SYSTEM ESTIMATES                  │
├─────────────────────────────────────────────────────────┤
│ Write RPS (avg / peak)        1,000 / 3,000             │
│ Read RPS (avg / peak)         100,000 / 300,000         │
│ Short code length             7 alphanumeric chars      │
│ Unique codes available        3.5 trillion              │
│ Daily storage growth          24 GB/day                 │
│ 5-year storage (w/ repl.)     ~132 TB                   │
│ Cache strategy                Cache today's URLs (~24GB)│
└─────────────────────────────────────────────────────────┘
```

---

### EXAMPLE 5: Design Instagram (Photo Storage)

**Given:** Design photo upload and feed delivery.

#### Step 1: Scale Assumptions

```
MAU:  1.5 billion
DAU:  500 million
Photos uploaded/day: 100 million (each user posts ~0.2 photos/day on avg)
Photo views/day:     5 billion (50 views per 100M uploads = 50:1 read:write ratio)
```

#### Step 2: Photo Storage Calculation

```
PHOTO SIZES (after upload processing):
  Original (raw upload):  3-10 MB (camera photo)
  Compressed original:    ~500 KB
  Display size (1080p):   ~200 KB
  Thumbnail (300px):      ~30 KB
  Total per photo:        ~730 KB ≈ 1 MB stored (all versions)

DAILY STORAGE GROWTH:
  = 100M photos × 1 MB
  = 100,000 GB
  = 100 TB/day

WITH REPLICATION (3x on object storage like S3):
  = 300 TB/day

ANNUAL STORAGE GROWTH:
  = 100 TB × 365 = 36.5 PB/year (raw)
  = 36.5 × 3 = ~110 PB/year with replication

→ Instagram stores photos in distributed object storage (like AWS S3)
→ Metadata (user, timestamp, likes, comments) goes in a relational DB
```

#### Step 3: Metadata Storage

```
PHOTO METADATA RECORD:
  photo_id    8 bytes
  user_id     8 bytes
  s3_url      200 bytes (URL to actual photo on S3)
  caption     500 bytes
  location    32 bytes (lat/long + location name)
  created_at  8 bytes
  like_count  8 bytes
  comment_cnt 4 bytes
  ──────────────────
  TOTAL       ~770 bytes ≈ 1 KB per photo record

DAILY METADATA GROWTH:
  = 100M photos × 1 KB = 100 GB/day  ← fits in standard relational DB
  
ANNUAL METADATA GROWTH:
  = 100 GB × 365 = 36.5 TB/year → needs sharding after ~2 years
```

#### Step 4: Feed Generation

```
FEED READ RPS:
  5B photo views/day ÷ 86,400 = 57,870 photo views/sec (avg)
  Peak (5x during prime time): ~290,000 photo views/sec

BANDWIDTH FOR PHOTO DELIVERY:
  Each photo view loads thumbnail (30 KB) + display image (200 KB) = 230 KB
  = 57,870 views/sec × 230,000 bytes
  = 13,310,100,000 bytes/sec
  = ~13 GB/s = 104 Gbps average egress bandwidth

→ This is why Instagram uses CDN aggressively.
→ CDN serves cached photos from edge locations.
→ Without CDN: impossibly high bandwidth cost and latency.
```

#### Summary Box: Instagram Estimates

```
┌─────────────────────────────────────────────────────────┐
│           INSTAGRAM SYSTEM ESTIMATES                    │
├─────────────────────────────────────────────────────────┤
│ Photos uploaded/day          100 million                │
│ Daily photo storage growth   100 TB / 300 TB (w/ repl.) │
│ Annual photo storage         ~110 PB/year               │
│ Daily metadata growth        100 GB                     │
│ Photo view RPS (avg/peak)    57,870 / 290,000           │
│ Egress bandwidth (avg)       ~104 Gbps                  │
│ Architecture insight         MUST use CDN + S3          │
└─────────────────────────────────────────────────────────┘
```

---

## PART 5 — Common Calculation Patterns & Shortcuts

### Pattern 1: The DAU → RPS Formula

```
RPS = (DAU × actions_per_user_per_day) ÷ 86,400

SHORTCUT: ÷ 100,000 for a quick rough estimate (instead of 86,400)
         (gives you ~15% less than actual — safe underestimate)

EXAMPLES:
  100M DAU, 10 actions each: (100M × 10) ÷ 100K = 10,000 RPS
  500M DAU, 2 actions each:  (500M × 2)  ÷ 100K = 10,000 RPS
  1B DAU,   50 actions each: (1B × 50)   ÷ 100K = 500,000 RPS
```

### Pattern 2: Storage Over Time

```
STORAGE_TOTAL = records_per_day × record_size × days × replication_factor

Example: User sessions
  records/day = 10M new sessions/day
  record size = 500 bytes
  retention   = 30 days
  replication = 3x

  = 10M × 500 × 30 × 3
  = 10,000,000 × 500 × 30 × 3
  = 450,000,000,000 bytes
  = 450 GB total session storage

Does this fit in Redis? 
  A single Redis instance typically holds 64-512 GB in RAM.
  450 GB → needs Redis Cluster with 2-3 nodes. Feasible.
```

### Pattern 3: Bandwidth from Throughput

```
BANDWIDTH = RPS × avg_payload_size

UNIT CONVERSION:
  bytes/sec → Mbps: multiply by 8, divide by 1,000,000
  bytes/sec → Gbps: multiply by 8, divide by 1,000,000,000

Example:
  100,000 RPS × 10,000 bytes = 1,000,000,000 bytes/sec = 8 Gbps
  Need at least 10 Gbps network interface on servers.
```

### Pattern 4: Servers Needed

```
SERVERS = peak_RPS ÷ RPS_per_server + 30% headroom

RPS_PER_SERVER benchmarks (rough):
  Simple HTTP (static/cached):    50,000 - 100,000 RPS
  API server (lightweight logic):  5,000 - 20,000 RPS
  API server (DB calls per req):   1,000 - 5,000 RPS
  Compute-heavy processing:          100 - 1,000 RPS
  Database (reads, indexed):       5,000 - 50,000 QPS
  Database (writes, transactional):  500 - 5,000 TPS

Example: 50,000 peak RPS, API with DB calls (2,000 RPS/server)
  = 50,000 ÷ 2,000 = 25 servers + 30% = 33 servers
```

### Pattern 5: Cache Sizing

```
CACHE_SIZE = hot_dataset_size × (1 + overhead_factor)

FINDING HOT DATASET:
  "80/20 rule": 20% of data gets 80% of requests
  Hot dataset = total dataset × 20%

Example:
  1 billion user profile records × 1 KB each = 1 TB total
  Hot 20% = 200 GB
  Cache overhead (Redis memory overhead): × 1.5
  Cache needed = 300 GB → 3 × 128 GB Redis nodes

CACHE HIT RATE IMPACT ON DB:
  90% hit rate: DB sees only 10% of read traffic
  95% hit rate: DB sees only 5% of read traffic
  99% hit rate: DB sees only 1% of read traffic
```

---

## PART 6 — The Estimation Cheat Sheet

```
┌─────────────────────────────────────────────────────────────────────┐
│                    QUICK REFERENCE CARD                             │
├─────────────────────────────────────────────────────────────────────┤
│  TIME                                                               │
│  1 day ≈ 100,000 seconds                                            │
│  1 year ≈ 30,000,000 seconds                                        │
│                                                                     │
│  UNIT CONVERSIONS                                                   │
│  1 KB = 10^3 bytes     1 MB = 10^6 bytes                           │
│  1 GB = 10^9 bytes     1 TB = 10^12 bytes    1 PB = 10^15 bytes    │
│  bytes → bits: × 8     Mbps ÷ 8 = MB/s                            │
│                                                                     │
│  RECORD SIZES (rough)                                               │
│  User metadata row:    ~1 KB                                        │
│  Tweet / short post:   ~500 bytes                                   │
│  Photo (all sizes):    ~1 MB                                        │
│  Video (1 min, HD):    ~50 MB                                       │
│  Video (1 min, 4K):    ~200 MB                                      │
│                                                                     │
│  LATENCY RULES                                                      │
│  RAM > SSD > HDD (each 100x slower)                                 │
│  Intra-datacenter: ~0.5ms                                           │
│  Cross-continent:  ~150ms                                           │
│                                                                     │
│  CAPACITY (per node, rough estimates)                               │
│  HTTP server:   5K–50K RPS                                          │
│  DB server:     5K–50K QPS reads / 1K–5K TPS writes                │
│  Redis/cache:   100K–1M QPS                                         │
│  WebSocket:     50K–500K concurrent connections/server              │
│                                                                     │
│  FORMULA                                                            │
│  Avg RPS = (DAU × actions/user/day) ÷ 86,400                       │
│  Peak RPS = Avg RPS × peak_multiplier (2x–10x)                     │
│  Storage/day = records/day × bytes/record                           │
│  Bandwidth = RPS × payload_size                                     │
│  Servers = Peak RPS ÷ RPS_per_server × 1.3 (headroom)              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## PART 7 — How to Present Estimates in Interviews

```
STRUCTURE YOUR ANSWER LIKE THIS:

1. ASSUMPTIONS (30 seconds)
   "I'm assuming 100M DAU, each user does ~10 actions per day..."
   State your assumptions FIRST. Interviewers reward clear reasoning.

2. TRAFFIC ESTIMATE (1 minute)
   "That gives us 100M × 10 ÷ 86,400 ≈ 10,000 RPS average.
    Assuming 5x peak factor, that's 50,000 peak RPS."

3. STORAGE ESTIMATE (1 minute)
   "Each record is roughly 1 KB. At 10M writes/day, that's 10 GB/day.
    Over 5 years with 3x replication, we need ~55 TB."

4. INFERENCES (1 minute)
   "Given 50,000 peak RPS, we'll need sharding on the database.
    Storage is manageable on a few nodes. We should add a cache layer
    since reads are 100x more than writes."

TIPS:
  ✓ Round aggressively — say "~100K" not "97,280"
  ✓ Say your formula out loud before plugging in numbers
  ✓ Sanity-check against known systems ("This is similar to Twitter's load")
  ✓ Drive to architecture decisions — numbers exist to justify choices
  ✗ Don't get lost in false precision
  ✗ Don't skip to architecture without doing the math first
  ✗ Don't use wrong units — MB vs GB confusion fails interviews
```

---

## PART 8 — Practice Problems (With Answers)

### Problem 1: Estimate Google Search Index Size

```
FACTS:
  Estimated web pages indexed: ~50 billion
  Avg page text content:        ~10 KB
  Average URL length:            ~100 bytes

CALCULATE:
  Raw text storage:
    50B pages × 10 KB = 500,000,000,000 KB = 500 PB  ← just for raw text!
  
  After compression (~5x for text):
    500 PB ÷ 5 = 100 PB compressed
  
  URL storage:
    50B × 100 bytes = 5 TB (negligible)
  
  Inverted index (roughly 3x raw text due to term expansion):
    100 PB × 3 = 300 PB for the search index

ANSWER: Google's index is on the order of hundreds of petabytes.
(Google publicly confirmed it's 100+ PB — our estimate is in the right ballpark!)
```

### Problem 2: Estimate Uber's Peak RPS

```
FACTS:
  Users: 100 million
  DAU:   20 million
  Avg trips/user/day: 1 (some use 0, some use 3)
  Each trip: multiple location pings (driver sends location every 4 sec)
  Avg trip duration: 20 minutes = 300 seconds
  Driver location updates: every 4 sec = 75 updates per trip

CALCULATE:
  Trips/day: 20M users × 1 trip = 20M trips/day
  Location updates/day: 20M trips × 75 updates = 1.5 billion updates/day
  Avg write RPS: 1.5B ÷ 86,400 ≈ 17,000 RPS
  Peak RPS (3x evening rush): ~51,000 RPS of GPS writes alone

ANSWER: Uber handles ~50K+ location update writes/sec at peak.
This requires a specialized time-series or geospatial DB (Uber uses custom Cassandra + H3).
```

### Problem 3: Estimate Netflix CDN Bandwidth

```
FACTS:
  Subscribers: 250 million
  Concurrent peak viewers (evening): ~15% of subscribers
  = 250M × 15% = 37.5 million concurrent streams

  Avg stream quality: 1080p HD at 5 Mbps

CALCULATE:
  Total streaming bandwidth:
    37.5M viewers × 5 Mbps = 187,500,000 Mbps
                            = 187,500 Gbps
                            = 187.5 Tbps!

  Netflix is ~37% of North American internet traffic at peak.
  (They publicly claim ~15% of global internet bandwidth.)

ANSWER: ~200 Tbps at peak — Netflix owns one of the world's largest CDNs (Open Connect).
This is why they co-locate servers inside ISPs around the world.
```

---

## PART 9 — Common Mistakes to Avoid

```
MISTAKE 1: Forgetting peak multiplier
  WRONG: "We need servers for 10,000 avg RPS"
  RIGHT: "Avg is 10,000 RPS, but peak is 5x = 50,000 RPS. Design for peak."

MISTAKE 2: Ignoring replication factor
  WRONG: "We need 100 TB of storage"
  RIGHT: "We need 100 TB × 3 replication = 300 TB of actual disk space"

MISTAKE 3: Confusing MB and Mbps
  MB   = megabytes (storage)
  Mbps = megabits per second (network speed)
  1 MB/s = 8 Mbps  ← multiply bytes by 8 to get bits

MISTAKE 4: Not converting units consistently
  Mix of KB, MB, GB in same calculation = likely error
  Pick ONE unit, convert everything to it, then calculate

MISTAKE 5: Precise numbers signal wrong thinking
  "We need exactly 47,293 RPS" sounds unconfident
  "We need roughly 50K RPS" sounds like an engineer who understands estimation

MISTAKE 6: Forgetting egress costs
  Storage is cheap. Bandwidth OUT of cloud is expensive.
  Always estimate egress bandwidth — it drives CDN decisions.

MISTAKE 7: Assuming a single machine
  If your estimate gives you >10K RPS or >a few TB, you likely need
  distributed systems. This should trigger sharding, caching, CDN discussions.
```

---

## PART 10 — Quick Decision Tree After Estimating

```
AFTER YOU CALCULATE, ASK:

Peak RPS > 10,000?
  YES → Need load balancer + multiple app servers
  NO  → Single server might be enough

Read RPS >> Write RPS (ratio > 10:1)?
  YES → Add caching layer (Redis/Memcached)
  NO  → Standard DB setup might work

Storage > 10 TB?
  YES → Need distributed storage or object storage (S3)
  NO  → Single large server works

Storage > 1 TB for a relational DB?
  YES → Consider sharding or read replicas
  NO  → Single primary + replicas

Need low latency reads (<10ms) globally?
  YES → Add CDN + cache at edge
  NO  → Single region is fine

Write RPS > 5,000?
  YES → Need write sharding (split DB by key range or hash)
  NO  → Single primary DB can handle it

Data > 1 PB?
  YES → Consider data lake / warehouse (Hadoop, BigQuery, Snowflake)
  NO  → Standard operational DB works
```

---

> **Remember the golden rule of back-of-envelope calculations:**
> You are not trying to be exact. You are trying to find out if you need
> 10 servers or 10,000 servers. If you are off by 2x, that is fine.
> If you miss by 1,000x, you have a different architecture problem entirely.
>
> The goal is: **right order of magnitude → right architecture decisions.**
