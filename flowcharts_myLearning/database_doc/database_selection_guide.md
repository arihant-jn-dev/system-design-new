# Database & Storage Selection Guide
## Which DB, When, Why — System Design Perspective

> **The #1 mistake in system design interviews:**
> Defaulting to one database for everything.
> Every storage technology was built to solve a SPECIFIC problem.
> Using the wrong one = poor performance, scaling nightmares, or data loss.
>
> This guide teaches you to MATCH the storage to the problem.

---

## PART 0 — The Decision Framework (Ask These Questions First)

```
Before picking ANY database, answer these 5 questions:

QUESTION 1: WHAT IS THE DATA SHAPE?
  □ Structured, fixed schema (user: id, name, email, age)?  → Relational DB
  □ Flexible, nested, document-like (product with varying fields)? → Document DB
  □ Simple key → value pairs (session: token → user_id)? → Key-Value store
  □ Relationships between entities (who follows whom)? → Graph DB
  □ Time-stamped measurements (CPU 92% at 14:03:22)? → Time-Series DB
  □ Large files (images, videos, PDFs)? → Object Storage (S3)

QUESTION 2: WHAT IS THE ACCESS PATTERN?
  □ Complex queries with JOIN across tables? → Relational DB
  □ Read by primary key only, massive scale? → Key-Value / Wide-Column
  □ Full-text search ("find posts about cricket")? → Search Engine
  □ Range queries by time? → Time-Series DB
  □ Graph traversal (friends of friends)? → Graph DB

QUESTION 3: WHAT ARE THE SCALE REQUIREMENTS?
  □ < 10M rows, moderate traffic? → Any relational DB
  □ 100M+ rows, global users? → Cassandra / DynamoDB
  □ Billions of time-series data points? → InfluxDB / TimescaleDB
  □ Terabytes of files? → S3 / Blob storage

QUESTION 4: WHAT ARE THE CONSISTENCY REQUIREMENTS?
  □ Money, inventory, critical data? → Strong consistency → Relational DB
  □ Social feeds, likes, views? → Eventual consistency OK → Cassandra/DynamoDB
  □ Cached data (can be slightly stale)? → Redis with TTL

QUESTION 5: READ-HEAVY OR WRITE-HEAVY?
  □ 90% reads (product catalog): → Add caching (Redis) + read replicas
  □ 90% writes (IoT sensors): → Cassandra / Kafka + time-series DB
  □ Balanced: → PostgreSQL with proper indexing

USE THE ANSWERS → match to the right storage below.
```

---

## PART 1 — Relational Databases (PostgreSQL, MySQL)

### What They Are

```
RELATIONAL DB = Data stored in TABLES with ROWS and COLUMNS.
                Tables are linked by foreign keys.
                SQL is the query language.

  users table:                orders table:
  ┌────┬────────┬──────────┐  ┌─────┬─────────┬──────────┬────────┐
  │ id │ name   │ email    │  │ id  │ user_id │ amount   │ status │
  ├────┼────────┼──────────┤  ├─────┼─────────┼──────────┼────────┤
  │ 1  │ Arihant│ a@x.com  │  │ 101 │    1    │ ₹2,500  │ paid   │
  │ 2  │ Priya  │ p@x.com  │  │ 102 │    2    │ ₹1,800  │ pending│
  └────┴────────┴──────────┘  └─────┴─────────┴──────────┴────────┘

  JOIN query: "Give me all orders for Arihant with his email"
  SELECT u.name, u.email, o.amount FROM users u
  JOIN orders o ON u.id = o.user_id WHERE u.id = 1;
```

### When to Use

```
USE RELATIONAL DB WHEN:
  ✓ Data has clear relationships (users → orders → payments → products)
  ✓ You need ACID transactions (bank transfers, inventory deduction)
  ✓ Complex queries with multiple JOINs
  ✓ Data is structured and schema is stable
  ✓ Strong consistency is required (money, healthcare, legal records)
  ✓ Team knows SQL (almost everyone does)

DO NOT USE WHEN:
  ✗ Schema changes constantly (product has 100 different attribute types)
  ✗ Need to scale writes to millions/sec (one primary node bottleneck)
  ✗ Storing massive unstructured files (store path in DB, file in S3)
  ✗ Time-series data (relational DBs are slow for append-only time data)
```

### Real-World Use Cases

```
SYSTEM             WHAT'S STORED IN RELATIONAL DB
──────────────────────────────────────────────────────────────────────────
Banking App        Accounts, transactions, balances, KYC records
                   WHY: Money requires ACID — partial transfers = disaster

E-Commerce         Users, orders, products, inventory, payments
(Flipkart/Amazon)  WHY: Order placed must atomically deduct inventory
                   AND create payment record AND update order status

Swiggy / Zomato    Restaurants, menus, orders, delivery partners, payouts
                   WHY: "Order placed" atomically triggers: order record +
                   restaurant notification + delivery assignment + payment

HR System          Employees, salaries, departments, leaves, payroll
                   WHY: Payroll must be exactly right — strong consistency

GitHub / GitLab    Users, repos, PRs, issues, comments, permissions
                   WHY: Structured relationships, complex queries needed
──────────────────────────────────────────────────────────────────────────
```

### ACID — Why Relational DBs Are Trusted for Money

```
ACID = Atomicity, Consistency, Isolation, Durability

ATOMICITY: All or nothing.
  Bank transfer: debit ₹500 from A AND credit ₹500 to B.
  If credit fails → debit is ROLLED BACK. Never half-done.

CONSISTENCY: Data always follows rules.
  Rule: "account balance cannot go negative"
  Any transaction that would violate this → REJECTED.

ISOLATION: Concurrent transactions don't see each other's partial state.
  1000 users buying the last item simultaneously.
  Only ONE succeeds. Others see "out of stock."
  No two users both think they got it.

DURABILITY: Committed data survives crashes.
  After "payment confirmed" → power goes out.
  When DB restarts: your payment is still there (written to disk log).

WITHOUT ACID (early NoSQL DBs):
  Flipkart sold the same last item to 3 people simultaneously.
  All 3 got "order confirmed." Only 1 item in stock. Chaos.
```

### Scaling Relational DBs

```
TRAFFIC LEVEL     WHAT TO DO                    EXAMPLE SETUP
──────────────────────────────────────────────────────────────────────
< 10K req/sec     Single PostgreSQL + indexes    1 machine: r6g.2xlarge
10K–100K req/sec  Add Read Replicas              1 Primary + 3 Replicas
                  (reads go to replicas)
100K–500K req/sec Add Redis caching layer        Cache frequent reads
                  Vertical scale primary         (p99 queries < 10ms)
500K+ req/sec     Functional sharding            User DB, Order DB,
                  (split by domain)              Product DB separate
Millions/sec      Horizontal sharding (Vitess)   Google uses Vitess for
                  or move write-heavy to NoSQL   MySQL sharding at scale

PRACTICAL RULE:
  PostgreSQL can handle most startups to mid-size companies.
  You need 10M+ active users before you truly outgrow it.
  Instagram ran on PostgreSQL for YEARS at massive scale.
  Don't pre-optimize. Start relational. Migrate specific parts as needed.
```

### PostgreSQL vs MySQL

```
              PostgreSQL                    MySQL
──────────────────────────────────────────────────────────────────────
JSON support  JSONB — excellent             JSON — decent
Full-text     Built-in, good               Decent, not as powerful
Extensions    pgvector, PostGIS, etc.       Fewer extensions
Performance   Better for complex queries    Better for simple reads
              (analytics, joins)            (web apps, high concurrency)
ACID          Full ACID + MVCC             Full ACID
Replication   Streaming replication        Binary log replication
Used by       Instagram, Uber, Airbnb      Facebook, Twitter (early),
              GitHub, Notion               Wikipedia, YouTube

CHOOSE PostgreSQL for: new projects, complex queries, JSON data, analytics
CHOOSE MySQL for: high-concurrency simple reads, existing team experience
```

---

## PART 2 — Document Databases (MongoDB, Firestore)

### What They Are

```
DOCUMENT DB = Stores data as JSON-like documents.
              No fixed schema — each document can have different fields.
              No JOINs — related data is embedded in the document.

  // Product document in MongoDB (no fixed schema!)
  {
    "_id": "prod_001",
    "name": "iPhone 16 Pro",
    "category": "smartphone",
    "price": 134900,
    "specs": {                          // nested object
      "storage": ["128GB", "256GB", "512GB", "1TB"],
      "colors": ["black", "white", "desert"],
      "camera": { "main": "48MP", "ultra": "12MP", "zoom": "12MP" }
    },
    "reviews": [                        // array of objects
      { "user": "arihant", "rating": 5, "text": "Amazing camera" },
      { "user": "priya", "rating": 4, "text": "Battery could be better" }
    ],
    "availability": {
      "Mumbai": true,
      "Delhi": true,
      "Tier3_cities": false
    }
  }

  // Headphones document (DIFFERENT FIELDS — no schema enforcement)
  {
    "_id": "prod_002",
    "name": "Sony WH-1000XM5",
    "category": "audio",
    "price": 24990,
    "specs": {
      "noise_cancellation": true,
      "battery_life_hours": 30,
      "codec": ["AAC", "LDAC", "SBC"]
    }
    // No "camera" field — that's fine!
  }
```

### When to Use

```
USE DOCUMENT DB WHEN:
  ✓ Schema changes frequently (product catalog with 100 different types)
  ✓ Data is naturally hierarchical/nested (user + profile + preferences + history)
  ✓ You read/write the entire document at once (load user profile)
  ✓ No complex multi-table JOINs needed
  ✓ Need to scale writes horizontally (MongoDB shards natively)
  ✓ Content management (articles, blogs with varying fields)

DO NOT USE WHEN:
  ✗ You need strong ACID transactions across multiple documents
  ✗ Data is highly relational (many-to-many, deep joins needed)
  ✗ You need to run complex aggregations across millions of documents
  ✗ Money is involved (use relational for financial data)
```

### Real-World Use Cases

```
SYSTEM             WHAT'S STORED IN DOCUMENT DB
──────────────────────────────────────────────────────────────────────
E-Commerce         Product catalog (each product has different attributes)
Product Catalog    Laptop ≠ Book ≠ Shoe (all have totally different fields)
                   MongoDB perfect — flexible schema per category

Content Platform   Articles, blogs, CMS content
(Medium, Notion)   Each article has varying structure, metadata, blocks
                   Notion stores entire page structure as one document

User Profiles      Complex nested user data
(LinkedIn, Naukri) Skills, experience, education, recommendations — all nested
                   Better as one document than 7 normalized tables

Mobile Apps        User settings, preferences, app state
(Firebase/Firestore)Real-time sync, offline support built-in
                   Perfect for apps that need offline-first behavior

Gaming             Player profiles, inventory, achievements, game state
                   Player has variable items — impossible in fixed schema
──────────────────────────────────────────────────────────────────────
```

### Scaling Document DBs

```
MONGODB NATIVE SHARDING:
  MongoDB shards by a "shard key" automatically.
  Unlike PostgreSQL where you need Vitess/manual sharding.

  Example: shard key = user_id
  Shard 1: user_id 1 – 10M
  Shard 2: user_id 10M – 20M
  Shard 3: user_id 20M – 30M

  Reads and writes for a user → routed to their shard automatically.
  Add more shards → add more capacity. Linear scaling.

ATLAS SEARCH: MongoDB's built-in Lucene-powered search.
  Avoids needing a separate Elasticsearch cluster for many use cases.

WHEN DOCUMENT DB DOESN'T SCALE:
  Complex aggregations across ALL documents (analytics) → move to data warehouse
  Transactions across multiple documents → MongoDB 4.0+ added multi-doc ACID
  (but still slower than native relational ACID)
```

---

## PART 3 — Key-Value Stores (Redis, DynamoDB, Memcached)

### What They Are

```
KEY-VALUE STORE = Simplest data model: key → value.
                  Like a giant hash map / dictionary.
                  Extremely fast (often in-memory).

  SET "session:abc123"  → '{"user_id": 1, "name": "Arihant", "role": "admin"}'
  GET "session:abc123"  → returns the value instantly

  SET "product:iphone16:price" → "134900"
  GET "product:iphone16:price" → "134900"

  SET "rate_limit:user:1001" → "47"  (47 requests made in last minute)
  INCR "rate_limit:user:1001"         (atomic increment — no race condition)

REDIS EXTRA FEATURES (beyond pure key-value):
  Strings, Lists, Sets, Sorted Sets, Hashes, Streams, Pub/Sub
  TTL (time-to-live) — keys auto-delete after expiry
  Atomic operations (INCR, SETNX) — safe for counters and locks
```

### When to Use Redis

```
USE REDIS WHEN:
  ✓ Caching (store expensive DB query results, serve from memory)
  ✓ Session storage (user login sessions, JWT blacklists)
  ✓ Rate limiting (X requests per minute per user)
  ✓ Real-time leaderboards (sorted sets with scores)
  ✓ Pub/Sub messaging (lightweight, not for durability)
  ✓ Distributed locks (prevent two servers doing same job simultaneously)
  ✓ Queue (simple task queues with lists)
  ✓ Real-time features (active users count, live counters)

DO NOT USE REDIS WHEN:
  ✗ Primary database (Redis data is in RAM — expensive, limited size)
  ✗ Data that must survive restarts without configuration (use Redis persistence)
  ✗ Complex queries or relationships
  ✗ Large data (full video files, large documents → S3)
```

### Redis Use Cases Deep Dive

```
USE CASE 1: CACHING
  Problem: PostgreSQL query "get all products with reviews and ratings"
           takes 800ms. 50,000 users hit it every minute.

  Without cache:
    50,000 queries × 800ms each → DB overwhelmed → 503 errors

  With Redis cache:
    First request → query DB (800ms) → store result in Redis with TTL 5min
    Next 49,999 requests → get from Redis (< 1ms)
    DB load: 1 query per 5 minutes instead of 50,000

  Code pattern:
    result = redis.get("products:all")
    if not result:
      result = postgres.query("SELECT * FROM products...")
      redis.setex("products:all", 300, result)  // cache 5 min
    return result

USE CASE 2: SESSION STORE
  User logs in → server creates session → stores in Redis:
    SET "session:token_xyz" '{"user_id":1,"role":"admin"}' EX 86400
  User makes request → server checks Redis (1ms) → validates session
  User logs out → DEL "session:token_xyz"

  WHY REDIS OVER DB FOR SESSIONS?
    Sessions are read on EVERY request. 1ms vs 50ms makes massive UX difference.
    Sessions expire automatically (TTL). No cleanup job needed.

USE CASE 3: RATE LIMITING
  Limit users to 100 API calls per minute:

  Every request:
    key = "ratelimit:{user_id}:{current_minute}"
    count = INCR key            // atomic increment
    if first time: EXPIRE key 60 // auto-delete after 1 minute
    if count > 100: return 429 Too Many Requests

  WHY REDIS?
    INCR is atomic — no race condition even with 1000 concurrent servers.
    TTL handles cleanup automatically.
    Millisecond response — doesn't slow down API.

USE CASE 4: REAL-TIME LEADERBOARD
  Game: track top 1000 players globally in real-time.

  Player completes level:
    ZADD "leaderboard:global" 15420 "arihant"  // add score

  Get top 10:
    ZREVRANGE "leaderboard:global" 0 9 WITHSCORES

  Get Arihant's rank:
    ZREVRANK "leaderboard:global" "arihant"    // returns rank number

  Sorted Sets are PERFECT for leaderboards — O(log N) for all operations.
  PostgreSQL with ORDER BY on 10M rows: 2–3 seconds.
  Redis sorted set on 10M members: < 1ms. 3000× faster.

USE CASE 5: DISTRIBUTED LOCK
  Problem: 3 servers all try to process the same payment simultaneously.
  Without lock: payment charged 3 times.

  With Redis distributed lock:
    acquired = redis.SET "lock:payment:order_123" 1 NX EX 30
    // NX = only set if not exists (atomic)
    // EX 30 = auto-release after 30 seconds
    if acquired:
      process_payment()
      redis.DEL "lock:payment:order_123"
    else:
      // another server is processing, skip or queue

USE CASE 6: PUB/SUB (for real-time notifications)
  User 1 sends message to User 2:
    PUBLISH "user:2:notifications" '{"type":"message","from":"user1"}'

  User 2's connection server is subscribed:
    SUBSCRIBE "user:2:notifications"
    // receives instantly → pushes to WebSocket → user sees notification

  Used by: Redis pub/sub for real-time notifications before upgrading to Kafka.
```

### DynamoDB vs Redis

```
              Redis                    DynamoDB
──────────────────────────────────────────────────────────────────────
Location      In-memory (fast!)        Disk-based (slower than Redis)
Speed         < 1ms reads              1–10ms reads
Persistence   Optional (can lose data) Always durable
Scale         Up to ~1TB per cluster   Unlimited (AWS manages)
Cost          RAM-based = expensive    Cheaper at large scale
Use for       Cache, sessions, RT      Primary NoSQL DB, user data
              features                 at global scale
Query         Only by key              Only by key + range
Complex ops   Lists, Sets, Streams     Limited
Managed       Yes (ElastiCache)        Yes (fully managed)
──────────────────────────────────────────────────────────────────────

USE DynamoDB WHEN:
  ✓ Primary database for massive scale (billions of records)
  ✓ Need guaranteed durability (not just cache)
  ✓ Single-digit millisecond latency at any scale (guaranteed SLA)
  ✓ Already on AWS (integrates perfectly with Lambda, API Gateway)
  ✓ Key-value or simple range queries only
  ✗ NOT for complex queries (no JOINs, no filtering by non-key attributes)

REAL EXAMPLE:
  Amazon.com uses DynamoDB for: shopping cart, order status, session data
  Why? Billions of users, < 10ms latency requirement, simple key lookups.
```

---

## PART 4 — Wide-Column Databases (Cassandra, HBase)

### What They Are

```
WIDE-COLUMN = Rows identified by a key, but each row can have
              THOUSANDS of columns — and different rows can have different columns.
              Optimized for massive write throughput and time-ordered data.

  Think of it like:
    Row key: "user:1001:messages:2026-03"
    Columns: each message timestamp → message content

  user:1001:messages:2026-03
    14:03:22.100  → "Hey, how are you?"
    14:03:45.200  → "I'm good!"
    14:05:01.300  → "Want to meet tonight?"
    ...thousands of messages, all in one row

  WHY EFFICIENT?
    Related data is stored physically adjacent on disk.
    Reading all messages for a user in a time range = one sequential disk read.
    No JOINs. No indexes needed. Just read the row.
```

### When to Use Cassandra

```
USE CASSANDRA WHEN:
  ✓ Massive write throughput (millions of writes/sec — IoT, logs, events)
  ✓ Time-series-like data (activity feeds, messages, sensor readings)
  ✓ Global distribution — multiple data centers, write locally everywhere
  ✓ Linear scalability — add nodes, get proportional more capacity
  ✓ High availability — no single point of failure (all nodes equal)
  ✓ Append-heavy workloads (rarely UPDATE/DELETE, mostly INSERT)

DO NOT USE WHEN:
  ✗ Complex queries with JOINs or aggregations
  ✗ Frequent UPDATEs (Cassandra is slow for updates — uses tombstones)
  ✗ Strong consistency required (Cassandra is eventually consistent by default)
  ✗ Small datasets (overkill, relational is simpler)
  ✗ Ad-hoc queries (must design tables around queries in Cassandra)
```

### Real-World Use Cases

```
SYSTEM             CASSANDRA USE CASE
──────────────────────────────────────────────────────────────────────
WhatsApp /         Message history for billions of users
Facebook Messenger Read: "Give me user 1001's last 50 messages"
                   Write: billions of messages/day
                   WHY: Time-ordered, append-only, massive scale

Netflix            User activity log (what you watched, when, duration)
                   100M+ users × their viewing history = petabytes
                   Write-heavy, time-ordered, never need complex queries

Uber               Driver location updates (every 4 seconds per driver)
                   10M drivers × 1 update/4s = 2.5M writes/sec
                   WHY: Pure writes, time-series, no complex queries

Instagram          Activity feed raw events (before processing)
                   Every like/comment/follow → append to Cassandra
                   WHY: Massive write throughput, time-ordered

Discord            Message storage for all servers/channels
                   Stores TRILLIONS of messages
                   Moved FROM PostgreSQL TO Cassandra when scale hit
──────────────────────────────────────────────────────────────────────
```

### Cassandra's Key Design Principle

```
DESIGN YOUR TABLES AROUND YOUR QUERIES (not around your data).

In relational DB: normalize first, query however you want (use JOINs).
In Cassandra: decide your queries FIRST, then design tables to serve them.

EXAMPLE: Design for "get user's messages in a channel"

QUERY WE NEED:
  "Get last 50 messages in channel_id=42 for user_id=1001"

CASSANDRA TABLE DESIGN:
  CREATE TABLE messages (
    user_id    BIGINT,
    channel_id BIGINT,
    created_at TIMESTAMP,
    message    TEXT,
    PRIMARY KEY ((user_id, channel_id), created_at)
  ) WITH CLUSTERING ORDER BY (created_at DESC);

  Now this query is O(1) fast:
    SELECT * FROM messages
    WHERE user_id = 1001 AND channel_id = 42
    LIMIT 50;

  But this query is IMPOSSIBLE in Cassandra (no index on message content):
    SELECT * FROM messages WHERE message LIKE '%hello%';  ← can't do this
```

---

## PART 5 — Search Engines (Elasticsearch, OpenSearch)

### What They Are

```
SEARCH ENGINE = Database optimized for FULL-TEXT SEARCH.
                Find documents that contain specific words/phrases.
                Works across millions of documents in < 100ms.

  User types: "gaming laptop under 80000"

  Elasticsearch:
    1. Tokenizes: ["gaming", "laptop", "under", "80000"]
    2. Searches inverted index: which documents contain these words?
    3. Ranks by relevance (TF-IDF + BM25 algorithm)
    4. Returns: top 10 most relevant products in 15ms

  SQL LIKE search on same data:
    SELECT * FROM products WHERE description LIKE '%gaming laptop%'
    → Full table scan on 10M products → 45 seconds → unusable

  INVERTED INDEX (why search is fast):
    word "gaming"  → appears in product IDs: [101, 203, 445, 891, ...]
    word "laptop"  → appears in product IDs: [101, 203, 504, 677, ...]
    Intersection: [101, 203] → these products have BOTH words → results!
```

### When to Use

```
USE ELASTICSEARCH WHEN:
  ✓ Full-text search ("find all tweets about cricket")
  ✓ Fuzzy search (typo tolerance: "lapptop" → "laptop")
  ✓ Faceted search (filter by brand, price range, rating simultaneously)
  ✓ Log analytics and monitoring (ELK Stack: Elasticsearch+Logstash+Kibana)
  ✓ Autocomplete / type-ahead suggestions
  ✓ Relevance ranking (most relevant results first)
  ✓ Geospatial search ("restaurants within 2km")

DO NOT USE WHEN:
  ✗ Primary database (not ACID, not reliable for source of truth)
  ✗ Simple key lookups (use Redis — overkill)
  ✗ Complex transactions (no ACID)
  ✗ Frequently updated data (Elasticsearch is slow to update)

ARCHITECTURE PATTERN:
  PostgreSQL (source of truth) → sync → Elasticsearch (search layer)
  Write to PostgreSQL.
  Sync changes to Elasticsearch (via CDC or Kafka).
  All search queries go to Elasticsearch.
  PostgreSQL and Elasticsearch always in sync.
```

### Real-World Use Cases

```
SYSTEM             ELASTICSEARCH USE CASE
──────────────────────────────────────────────────────────────────────
Swiggy / Zomato    "biryani near me" — full text + geo search
                   Fuzzy: "biriayni" → still finds "biryani"
                   Facets: filter by rating, cuisine, delivery time

LinkedIn / Naukri  Job search: "React developer 3 years remote Bangalore"
                   Skill matching, relevance ranking, typo tolerance

GitHub             Code search: "function handlePayment" across all repos
                   Searches billions of lines of code in < 1 second

Netflix            Search: "action movies with Tom Hanks"
                   Multi-field search: genre + actor + content type

Flipkart/Amazon    Product search with filters:
                   "smartphone" + brand:Apple + price:<100000 + rating:>4

ELK Stack          Application log monitoring:
(DevOps)           "Show me all ERROR logs from payment-service in last 1 hour"
                   Real-time log ingestion + search + dashboards (Kibana)
──────────────────────────────────────────────────────────────────────
```

---

## PART 6 — Time-Series Databases (InfluxDB, TimescaleDB, Prometheus)

### What They Are

```
TIME-SERIES DB = Optimized for storing and querying data where
                  TIME is the primary axis.
                  Each record = (timestamp, metric_name, value, tags)

  Prometheus stores:
    cpu_usage{server="api-1", region="mumbai"} 87.3  @1711534802
    cpu_usage{server="api-1", region="mumbai"} 85.1  @1711534812  (10s later)
    cpu_usage{server="api-1", region="mumbai"} 91.4  @1711534822
    memory_bytes{server="api-1"}               4.2GB @1711534802
    http_requests_total{endpoint="/api/users"} 1250  @1711534802

  QUERY: "Average CPU usage of api-1 in last 1 hour, per minute"
    SELECT mean(cpu_usage) FROM metrics
    WHERE server='api-1'
    AND time > NOW() - 1h
    GROUP BY time(1m)
    → Returns 60 data points (one per minute) instantly.

WHY NOT POSTGRESQL FOR THIS?
  One server reporting every 10 seconds = 8,640 rows/day/server.
  1,000 servers = 8.64 million rows/day = 315 billion rows/year.
  PostgreSQL: can't handle this write rate or storage efficiently.
  TimescaleDB: built on PostgreSQL + hypertables → handles it perfectly.
```

### When to Use

```
USE TIME-SERIES DB WHEN:
  ✓ IoT sensors (temperature, pressure every second)
  ✓ Infrastructure monitoring (CPU, RAM, network per server)
  ✓ Application metrics (requests/sec, error rate, latency)
  ✓ Financial tick data (stock prices every millisecond)
  ✓ User analytics (page views, clicks over time)
  ✓ ANY "how did X change over time" question

DO NOT USE WHEN:
  ✗ Data without a time component
  ✗ Random access by non-time key (use relational/NoSQL)
  ✗ Complex relational queries across multiple entities
```

### Real-World Use Cases

```
SYSTEM             TIME-SERIES USE CASE
──────────────────────────────────────────────────────────────────────
AWS CloudWatch     CPU, RAM, network for every EC2 instance every 1 minute
                   Billions of data points daily

Grafana + Prometheus Infrastructure monitoring for any company
                   "Alert me if API latency p99 > 2s for 5 minutes"

Razorpay / PayTM   Transaction volume per second, failure rate over time
                   "Did payment success rate drop at 3 PM?" → graph answer

Smart Grid /       Power consumption per household every 15 minutes
Energy Companies   Anomaly detection (unusual usage = potential issue)

Tesla              Every car sends 50+ sensor readings per second
                   Stored in time-series DB → analyzed for safety + features

Zerodha / Groww    Stock price every millisecond during market hours
                   "What was Nifty at 10:34:22.543 on Jan 15?" → instant
──────────────────────────────────────────────────────────────────────
```

---

## PART 7 — Graph Databases (Neo4j, Amazon Neptune)

### What They Are

```
GRAPH DB = Data stored as NODES and EDGES (relationships).
           Optimized for traversing relationships.
           Queries like "friends of friends" that are nightmares in SQL.

  SQL "friends of friends" (Who does Arihant's friends follow?):
    SELECT DISTINCT u3.name
    FROM users u1
    JOIN follows f1 ON u1.id = f1.follower_id     -- Arihant's follows
    JOIN users u2 ON f1.following_id = u2.id       -- his friends
    JOIN follows f2 ON u2.id = f2.follower_id       -- friends' follows
    JOIN users u3 ON f2.following_id = u3.id        -- friends of friends
    WHERE u1.id = 1 AND u3.id != 1;

    With 100M users: this JOIN explodes. 10+ seconds.

  Neo4j Cypher (graph query):
    MATCH (a:User {id: 1})-[:FOLLOWS]->(:User)-[:FOLLOWS]->(rec:User)
    WHERE NOT (a)-[:FOLLOWS]->(rec)
    RETURN rec.name LIMIT 10;

    Same data, same result: < 50ms regardless of scale.
    Graph databases are O(depth of traversal) not O(total nodes).
```

### When to Use

```
USE GRAPH DB WHEN:
  ✓ Social networks (who follows whom, mutual friends)
  ✓ Recommendation engines (users who bought X also bought Y)
  ✓ Fraud detection (find circular payment patterns, suspicious networks)
  ✓ Knowledge graphs (entities and their relationships)
  ✓ Access control (who has permission to access what through chains)
  ✓ Supply chain (dependency graphs, impact analysis)

DO NOT USE WHEN:
  ✗ Simple tabular data without complex relationships
  ✗ High write throughput (graph DBs are write-slower)
  ✗ Full-text search (use Elasticsearch)
  ✗ Time-series data (use time-series DB)
```

### Real-World Use Cases

```
SYSTEM             GRAPH DB USE CASE
──────────────────────────────────────────────────────────────────────
LinkedIn           "People You May Know" — 2nd/3rd degree connections
                   Graph traversal impossible in relational at their scale

Netflix            Recommendation engine: nodes=movies, users, genres
                   Edge= "watched", "liked", "similar_to"
                   "You watched Dune → users like you watched Oppenheimer"

PayPal / Razorpay  Fraud detection: find ring of accounts doing circular transfers
                   A → B → C → D → A (circular money mule pattern)
                   SQL JOIN: takes minutes. Graph: seconds.

Google             Knowledge Graph (entities and their relationships)
                   "Who is Sachin Tendulkar?" → Person → plays → Cricket
                   → born in → Mumbai → teammate → Sourav Ganguly

Airbnb             Find hosts similar to ones you liked, in the same area
                   via shared property characteristics and review patterns
──────────────────────────────────────────────────────────────────────
```

---

## PART 8 — Object Storage (AWS S3, Google Cloud Storage, Azure Blob)

### What They Are

```
OBJECT STORAGE = Store LARGE UNSTRUCTURED FILES (images, videos, PDFs).
                 Access via URL. Infinitely scalable. Very cheap.
                 Not for querying — just store and retrieve by key.

  Store a file:
    s3.upload("arihant-profile-pic.jpg") → stored at
    https://mybucket.s3.amazonaws.com/users/1001/profile.jpg

  Store in DB:
    UPDATE users SET profile_pic = 'https://...s3.../profile.jpg'
    WHERE id = 1001;

  RULE: Store the FILE in S3. Store the URL in your database.
        NEVER store binary files in a relational database.

WHY NEVER IN RELATIONAL DB?
  User profile pic = 500 KB
  10M users × 500 KB = 5 TB
  PostgreSQL table = 5 TB → queries slow for everything, not just images
  S3 for 5 TB = ~$115/month. PostgreSQL storage = much more expensive.
  S3 is designed for this. Databases are not.
```

### When to Use

```
USE OBJECT STORAGE WHEN:
  ✓ User-uploaded files (profile pictures, documents, videos)
  ✓ Application assets (static images, CSS, JavaScript bundles)
  ✓ Backups (database snapshots, application logs)
  ✓ Data lake (raw data before analytics processing)
  ✓ Anything > 100KB that you need to serve to users

DO NOT USE WHEN:
  ✗ Data you need to query (S3 has no fast query capability — use Athena for analytics)
  ✗ Frequently updated small records (use DB)
  ✗ Real-time streaming (use Kafka)
```

### S3 + CDN Pattern (Critical for Performance)

```
WITHOUT CDN:
  Arihant in Mumbai requests profile picture from S3 bucket in us-east-1 (Virginia).
  Distance: ~14,000 km.
  Latency: 200–300ms just for the network.
  1000 users in India → 1000 requests to Virginia → slow + costly.

WITH CLOUDFRONT CDN:
  First request: CloudFront fetches from S3 in Virginia, caches at Mumbai edge.
  ALL subsequent requests: served from Mumbai edge (< 5ms).
  Cost: lower (fewer S3 GET requests).
  Speed: 60× faster for Indian users.

ARCHITECTURE:
  User → CloudFront Edge (Mumbai) → [cache HIT: return file]
                                  → [cache MISS: fetch from S3 → cache → return]

  Profile pic URL:
    Without CDN: https://mybucket.s3.amazonaws.com/pic.jpg
    With CDN:    https://d123.cloudfront.net/pic.jpg
                 (same file, served from nearest edge server)

STORAGE TIERS (S3 has cost tiers based on access frequency):
  S3 Standard:        frequent access    → $0.023/GB/month
  S3 Standard-IA:     infrequent access  → $0.0125/GB/month (45% cheaper)
  S3 Glacier:         archival (hours)   → $0.004/GB/month (83% cheaper)
  S3 Glacier Deep:    archival (12 hours)→ $0.00099/GB/month (96% cheaper)

LIFECYCLE POLICY (auto-move to cheaper storage):
  Profile pics accessed daily → S3 Standard
  After 30 days not accessed → move to S3-IA (automated)
  After 1 year not accessed → move to Glacier (automated)
  → Pay 96% less for old, rarely accessed files. Automatically.
```

---

## PART 9 — Data Warehouses (Redshift, BigQuery, Snowflake)

### What They Are

```
DATA WAREHOUSE = Database optimized for ANALYTICS and REPORTING.
                 Read-heavy. Complex aggregations on HUGE datasets.
                 NOT for transactional (OLTP) workloads.

  OLTP (your app's DB):          OLAP (data warehouse):
  ──────────────────────────      ──────────────────────────
  Insert/update/delete rows       Run complex aggregations
  Read single record by ID        Read millions of rows
  Low latency (< 10ms)            High latency OK (seconds)
  Many small concurrent queries   Few large complex queries
  Row-oriented storage            Column-oriented storage
  PostgreSQL, MySQL               BigQuery, Redshift, Snowflake

EXAMPLE ANALYTICS QUERY (horrible in PostgreSQL, fast in BigQuery):
  "Show me daily active users, revenue per city, and top products
   sold in the last 6 months, broken down by device type"

  PostgreSQL on 1B rows: 45 minutes (if it doesn't timeout)
  BigQuery on same data:  8 seconds (columnar + massively parallel)

WHY COLUMNAR STORAGE IS FASTER FOR ANALYTICS:
  Row storage: [id, name, city, amount, date] | [id, name, city, amount, date] | ...
  Columnar:    [id, id, id, ...] | [city, city, city, ...] | [amount, amount, ...]

  For "total amount by city": only scan the city and amount columns.
  In row storage: scan every row (reading name, date you don't need).
  In columnar: skip all other columns. Read ONLY what you need.
  On 1B rows: 100× less data to read = 100× faster.
```

### When to Use

```
USE DATA WAREHOUSE WHEN:
  ✓ Business intelligence (dashboards, reports for business teams)
  ✓ Analytics: "how many users signed up last month by city?"
  ✓ Complex aggregations on historical data
  ✓ Machine learning feature engineering (prepare training datasets)
  ✓ Data that doesn't need real-time (minutes/hours of latency OK)
  ✓ Combining data from multiple sources (app DB + ad platform + payments)

DO NOT USE WHEN:
  ✗ Transactional workloads (use relational DB)
  ✗ Real-time queries (latency is seconds to minutes)
  ✗ Frequent small inserts/updates
```

### The Modern Data Pipeline

```
DATA PIPELINE (how data flows from app to analytics):

  APP (PostgreSQL/MongoDB)
       │
       │  CDC (Change Data Capture) — captures every change in real-time
       ▼
  KAFKA (message queue — buffers the stream)
       │
       │  ETL (Extract, Transform, Load)
       ▼
  DATA LAKE (S3) — raw data stored cheaply
       │
       │  dbt (data build tool) — transform and clean
       ▼
  DATA WAREHOUSE (BigQuery / Redshift / Snowflake)
       │
       ▼
  BI TOOL (Tableau / Metabase / Looker) → Business dashboards

REAL EXAMPLE:
  Swiggy captures every order in PostgreSQL.
  CDC streams every order event to Kafka.
  Kafka → S3 (data lake, raw storage).
  dbt transforms: clean, join with restaurant data, calculate metrics.
  Redshift stores processed data.
  Business teams run: "revenue per city per month" in Tableau.
  Zero impact on production PostgreSQL. Completely separate pipeline.
```

---

## PART 10 — Message Queues (Kafka, RabbitMQ, AWS SQS)

### What They Are

```
MESSAGE QUEUE = A buffer between services. Producer sends messages.
                Consumer processes them. Decouples systems.
                Messages persist until consumed.

  WITHOUT QUEUE (tight coupling):
    Order Service → calls Payment Service directly (HTTP)
    → calls Inventory Service directly
    → calls Notification Service directly
    → calls Analytics Service directly

    Payment Service is slow? Order Service waits. Timeout. Order fails.
    Any downstream service down? Order creation fails entirely.
    Traffic spike → all services overwhelmed simultaneously.

  WITH KAFKA (loose coupling):
    Order Service → publishes "OrderCreated" event → Kafka topic
    → done! Returns "order confirmed" to user instantly.

    Payment Service → reads from Kafka when ready → processes
    Inventory Service → reads from Kafka when ready → deducts
    Notification Service → reads from Kafka → sends email
    Analytics Service → reads from Kafka → updates dashboard

    Any service down? Messages wait in Kafka. Processed when it recovers.
    Traffic spike? Kafka buffers the surge. Services process at their pace.
    Order Service doesn't even know other services exist.
```

### Kafka vs RabbitMQ vs SQS

```
              Kafka                   RabbitMQ            AWS SQS
──────────────────────────────────────────────────────────────────────────
Model         Log-based stream        Traditional queue   Managed queue
Retention     Days/weeks/forever      Until consumed      Until consumed
Replay        YES (re-read old msgs)  NO                  NO
Throughput    Millions/sec            Thousands/sec       Thousands/sec
Ordering      Per partition           Per queue           FIFO queue option
Complexity    High (setup + ops)      Medium              Low (fully managed)
Use for       Event streaming, logs   Task queues,        Simple task queues
              real-time pipelines     RPC patterns        on AWS, serverless
Consumers     Multiple consumer       One consumer        One consumer
              groups, each get all    gets the message    gets the message
              messages
──────────────────────────────────────────────────────────────────────────

USE KAFKA WHEN:
  ✓ Multiple teams need to consume the same events
  ✓ Need to replay historical events (re-process old data)
  ✓ Event sourcing architecture
  ✓ Real-time analytics pipeline
  ✓ Millions of events per second (IoT, clickstream)
  ✓ Audit log (permanent ordered record of all events)

USE RABBITMQ / SQS WHEN:
  ✓ Simple task queue (send email, resize image, process payment)
  ✓ Don't need replay / multiple consumers
  ✓ Simpler setup needed
  ✓ Already on AWS (SQS = zero ops, pay per message)
```

### Real-World Queue Use Cases

```
SYSTEM          MESSAGE QUEUE USE CASE
──────────────────────────────────────────────────────────────────────────
Flipkart        "OrderPlaced" → Kafka topic
                → Payment consumer, Inventory consumer, Email consumer,
                  Fraud consumer, Analytics consumer
                All get the same event. None blocks the other.

Swiggy          Order → Queue → Restaurant notification system
                If restaurant app is down: order waits in queue.
                When restaurant app recovers: all pending orders delivered.

Razorpay        Payment webhook events → Kafka
                Multiple systems (risk, reconciliation, reporting) each
                consume the same payment events independently.

YouTube         Video upload → SQS queue → transcoding workers
                Workers pull jobs from queue, transcode video in parallel.
                Queue buffers uploads during traffic spikes.
                If transcoding fails → message goes back to queue → retry.

Netflix         User activity (play, pause, seek) → Kafka
                → Real-time recommendations (what to suggest next)
                → Analytics (how long people watch each show)
                → ML training data pipeline
──────────────────────────────────────────────────────────────────────────
```

---

## PART 11 — Real-World Architecture Examples

### Instagram Architecture (Simplified)

```
USER UPLOADS A PHOTO:
  App → API Server
           │
           ├── Save post metadata (caption, user_id, timestamp)
           │     → PostgreSQL (source of truth)
           │
           ├── Upload image file
           │     → S3 (original + compressed versions)
           │     → CloudFront CDN (served globally)
           │
           ├── Publish "PhotoUploaded" event
           │     → Kafka
           │         ├── → Feed Service (fanout to followers)
           │         ├── → Notification Service (push notification)
           │         ├── → Recommendation Service (update suggestions)
           │         └── → Analytics Pipeline (Redshift)
           │
           └── Update user's recent posts cache
                 → Redis (for fast profile page loads)

USER VIEWS THEIR FEED:
  App → API Server
           │
           ├── Check Redis cache: "feed:{user_id}" → cache HIT? → return instantly
           │
           └── Cache MISS:
                 ├── Get followed users from PostgreSQL
                 ├── Get recent posts from Cassandra (time-ordered)
                 ├── Get like counts from Redis
                 ├── Run through ML ranking model
                 ├── Store result in Redis (TTL: 5 minutes)
                 └── Return ranked feed

STORAGES INSTAGRAM USES:
  PostgreSQL   → User accounts, relationships (who follows whom)
  Cassandra    → Photo metadata, comments (time-ordered, massive scale)
  Redis        → Feed cache, session, like counts, real-time data
  S3           → Photo and video files (petabytes)
  Elasticsearch→ Hashtag and location search
  Kafka        → Event streaming between services
  Redshift     → Analytics and business metrics
```

### Uber Architecture (Simplified)

```
DRIVER LOCATION UPDATE (every 4 seconds):
  Driver App → Location Service → Kafka → Location DB (Cassandra)
                                        → Geospatial Index (in-memory)

RIDER REQUESTS A RIDE:
  Rider App → Ride Request Service
                    │
                    ├── Find nearby drivers
                    │     → Query geospatial index (Redis with geo commands)
                    │     → Returns drivers within 2km, sorted by distance
                    │
                    ├── Match best driver (supply/demand algorithm)
                    │     → Python ML model
                    │
                    ├── Create trip record
                    │     → PostgreSQL (ACID — trip + payment must be atomic)
                    │
                    ├── Notify driver
                    │     → Push notification service → Kafka → driver app
                    │
                    └── Start real-time tracking
                          → WebSocket connection to rider app
                          → Driver location updates streamed via Redis pub/sub

STORAGES UBER USES:
  PostgreSQL   → Trips, payments (ACID critical)
  Cassandra    → Driver location history, trip events (time-series, massive writes)
  Redis        → Real-time driver locations, surge pricing cache, rate limiting
  Kafka        → Location updates, trip events, notifications
  Elasticsearch→ Search (driver lookup, trip search)
  S3           → Maps, static assets, ML model artifacts
  Schemaless   → Uber's custom MySQL-based storage for trip data at scale
```

### WhatsApp Architecture (Simplified)

```
ARIHANT SENDS A MESSAGE TO PRIYA:

  Arihant's App
       │
       │ (WebSocket connection — persistent, open connection)
       ▼
  Chat Server (Arihant's server — millions of WebSocket connections)
       │
       ├── Store message persistently
       │     → Cassandra (user:priya:messages — time-ordered)
       │
       ├── Is Priya connected right now?
       │     → Redis: GET "online:priya" → YES (connected to chat-server-7)
       │
       │   YES: route to Priya's server
       │         → Kafka: publish to "chat-server-7:outbox"
       │         → Priya's server → WebSocket → Priya's app
       │         → Message delivered ✓
       │
       │   NO: Priya is offline
       │         → Push notification service → APNs/FCM → Priya's phone
       │         → When Priya opens app: fetch from Cassandra
       │
       └── Update message status
             → "sent" → "delivered" → "read" receipts
             → Stored in Cassandra, real-time via WebSocket

STORAGES WHATSAPP USES:
  Cassandra    → Message history (billions of messages, time-ordered)
  Redis        → Online presence (who's online on which server)
  Kafka        → Message routing between chat servers
  S3           → Media files (images, videos, voice notes)
  MNESIA       → Erlang's built-in DB for routing tables (WhatsApp runs on Erlang)
```

---

## PART 12 — The Master Decision Table

```
STORAGE TYPE      BEST FOR                    AVOID FOR               EXAMPLES
────────────────────────────────────────────────────────────────────────────────────────
PostgreSQL        Transactions, complex        Massive write scale     Instagram, GitHub
                  queries, ACID critical       (> 500K writes/sec)     Airbnb, Notion
                  structured data

MySQL             High-concurrency web         Complex analytics       Facebook (early)
                  read-heavy apps              write-heavy workloads   Wikipedia

MongoDB           Flexible schema, nested      Complex multi-doc       Airbnb (listings)
                  documents, product catalog   transactions, joins      Forbes, Lyft

Cassandra         Massive writes, time-        Complex queries,        Instagram, Netflix
                  ordered data, global HA      strong consistency      Discord, Uber

Redis             Cache, sessions, rate        Primary DB, large       Every major app
                  limiting, real-time data     files, complex queries  as cache layer

DynamoDB          Primary NoSQL at AWS         Complex queries,        Amazon, Lyft
                  scale, simple key-value      not on AWS              Snapchat

Elasticsearch     Full-text search, log        Primary DB, ACID        Swiggy, GitHub
                  analytics, faceted search    transactions            LinkedIn search

InfluxDB /        IoT metrics, monitoring,     Relational data,        AWS CloudWatch
TimescaleDB       time-series data             random access           Grafana, Tesla

Neo4j             Graph traversal, social      High write throughput   LinkedIn, PayPal
                  networks, fraud detection    large-scale OLTP        (fraud)

S3 / Object       Files, images, videos,       Queryable data,         Netflix, Dropbox
Storage           backups, data lake           frequent small updates  Instagram, Slack

BigQuery /        Business analytics,          Real-time OLTP,         Flipkart analytics
Redshift          historical reports, ML        transactional workloads all large companies
Snowflake         feature engineering

Kafka             Event streaming, decoupling   Simple one-consumer    Uber, Netflix,
                  services, audit log          task queues (use SQS)   LinkedIn, Airbnb

SQS / RabbitMQ    Task queues, background       Event replay,           Most companies
                  jobs, simple messaging        multiple consumers      on AWS
────────────────────────────────────────────────────────────────────────────────────────
```

---

## PART 13 — Traffic-Based Selection Guide

```
TRAFFIC TIER       ARCHITECTURE                    STORAGES TO USE
────────────────────────────────────────────────────────────────────────────
STARTUP            Single DB + cache               PostgreSQL + Redis
< 10K users        One PostgreSQL instance         (most startups never need more)
< 100 req/sec      Redis for session/cache         Don't over-engineer early!

GROWTH             Read replicas + cache           PostgreSQL (1P + 3R replicas)
10K–1M users       Offload reads to replicas       Redis cluster
100–10K req/sec    CDN for static assets           S3 + CloudFront
                   Queue for async tasks           SQS or RabbitMQ

SCALE              Domain separation               PostgreSQL per service
1M–100M users      Each service gets own DB        Redis cluster (sharded)
10K–100K req/sec   Add Elasticsearch for search    Kafka for events
                   Cassandra for time-ordered data S3 + CloudFront
                   Message queue for decoupling    Elasticsearch
                   Read from cache, write to DB    Data warehouse (Redshift)

HYPERSCALE         Full multi-store architecture   PostgreSQL (with Vitess/sharding)
100M+ users        Every service has optimal DB    Cassandra (messages, activity)
100K+ req/sec      Global multi-region setup       Redis (cache, rate limit)
                   Geo-distributed data            DynamoDB (global tables)
                   ML-driven recommendations       Kafka (event backbone)
                   Separate analytics pipeline     Elasticsearch (search)
                                                   S3 data lake + BigQuery
────────────────────────────────────────────────────────────────────────────

GOLDEN RULE:
  Start with PostgreSQL + Redis.
  Add storage types only when you have a SPECIFIC, MEASURED problem.
  "Our search is slow" → add Elasticsearch.
  "Our write throughput is too high" → add Cassandra.
  "Our DB queries are slow" → add caching first (Redis).
  Don't add Kafka because Netflix uses it. Add it when YOU need it.
```

---

## PART 14 — Decision Tree (Quick Reference)

```
START: What kind of data are you storing?
            │
     ┌──────┴──────────────┬──────────────────┬─────────────────┐
     ▼                     ▼                  ▼                 ▼
  STRUCTURED            DOCUMENTS          KEY-VALUE          FILES/BLOBS
  (tables, relations)   (JSON, flexible)   (simple lookup)    (images, video)
     │                     │                  │                 │
     ▼                     ▼                  ▼                 ▼
  PostgreSQL/MySQL       MongoDB            Redis/DynamoDB     S3 + CDN
     │
     └─▶ Need strong   ─▶ Use PostgreSQL (ACID)
         consistency?
     └─▶ Need massive  ─▶ Add read replicas + Redis cache
         read scale?
     └─▶ Need massive  ─▶ Shard (Vitess) or switch write-heavy
         write scale?      parts to Cassandra

     ▼                     ▼                  ▼                 ▼
  NEED SEARCH?          TIME-SERIES?       RELATIONSHIPS?    ANALYTICS?
     │                     │               (graph)              │
     ▼                     ▼                  ▼                 ▼
  Elasticsearch         InfluxDB/         Neo4j/Neptune      BigQuery/
  OpenSearch            Prometheus/                          Redshift/
                        TimescaleDB                         Snowflake

     ▼
  NEED DECOUPLING / ASYNC?
     │
     ├─▶ Multiple consumers, replay needed → Kafka
     └─▶ Simple task queue, no replay      → SQS / RabbitMQ
```
