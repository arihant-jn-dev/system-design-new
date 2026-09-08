# REST vs HTTP - A Simple Guide

## Table of Contents
1. [What is HTTP?](#what-is-http)
2. [What is REST?](#what-is-rest)
3. [Key Difference - One Line Summary](#key-difference)
4. [HTTP Verbs and What They Do](#http-verbs)
5. [Everything is a Resource](#everything-is-a-resource)
6. [REST + HTTP Working Together](#rest-and-http-together)
7. [Real-World Example](#real-world-example)
8. [Challenges with REST](#challenges-with-rest)
9. [HTTP Downsides and Latency Problem](#http-downsides-and-latency-problem)
10. [Quick Cheat Sheet](#quick-cheat-sheet)

---

## What is HTTP?

**HTTP (HyperText Transfer Protocol)** is the language/protocol that your browser and a server use to talk to each other over the internet.

Think of HTTP as the **postal system** — it defines:
- How to send a message (request)
- How to receive a reply (response)
- What format letters (data) should be in

### HTTP gives you "verbs" (actions):

| Verb | Meaning |
|------|---------|
| `GET` | Fetch/read something |
| `POST` | Create something new |
| `PUT` | Update/replace something |
| `DELETE` | Remove something |

**Example:** When you open `https://amazon.com`, your browser sends an HTTP `GET` request to Amazon's server, and the server sends back the webpage HTML.

---

## What is REST?

**REST (Representational State Transfer)** is a **set of rules/style** for designing how your app's API should behave. It is NOT a protocol — it is a design philosophy.

Think of REST as the **rules for how to write a good letter** — HTTP is the postal system, REST tells you how to write clearly and consistently.

REST says:
> "Treat everything in your system as a **resource**, give it a URL, and use HTTP verbs to act on it."

### REST is built on these ideas:
- Every piece of data is a **resource** (a user, a product, an order)
- Each resource has a **unique URL** (address)
- Use standard HTTP verbs (`GET`, `POST`, `PUT`, `DELETE`) to perform actions
- The server does **not remember** previous requests (stateless)

---

## Key Difference

| | HTTP | REST |
|--|------|------|
| What is it? | A communication protocol | A design style/architecture |
| What does it define? | How data travels over the internet | How your API should be structured |
| Can it exist alone? | Yes | No — REST uses HTTP to work |
| Analogy | The postal system | The rules for writing a good letter |

> **Simple one-liner:** HTTP is the road. REST is the traffic rules you follow on that road.

---

## HTTP Verbs

REST uses HTTP verbs to define what action to perform on a resource:

```
GET    /users        → Get list of all users
GET    /users/42     → Get user with ID 42
POST   /users        → Create a new user
PUT    /users/42     → Update user with ID 42
DELETE /users/42     → Delete user with ID 42
```

Without REST, you might see messy URLs like:
```
GET  /getUser?id=42
GET  /getAllUsers
POST /createNewUser
GET  /deleteUser?id=42   ← confusing! using GET to delete
```

REST brings **consistency** by mapping verbs to actions.

---

## Everything is a Resource

REST treats everything as a **resource** — a "thing" you can create, read, update, or delete.

Examples of resources:
- A **user** → `/users/42`
- A **product** → `/products/101`
- An **order** → `/orders/9988`
- A **photo** → `/photos/556`

The resource is just data. REST doesn't care whether it's stored in a database, a file, or generated live — it just gives you a clean URL to access it.

---

## REST and HTTP Together

REST is designed to **fit naturally on top of HTTP** because HTTP already has everything REST needs:

| REST Needs | HTTP Provides |
|-----------|--------------|
| Actions on resources | Verbs: GET, POST, PUT, DELETE |
| Address for each resource | URLs |
| Status of the response | Status codes (200, 404, 500...) |
| Data format | Headers + Body (JSON, XML, etc.) |

This is why REST became so popular — you don't need to invent new tools. HTTP already exists everywhere (browsers, servers, CDNs, load balancers), so REST **just works** with all existing infrastructure.

---

## Real-World Example

### Scenario: A Todo App API

**Resource:** A "todo" item

#### Without REST (messy, inconsistent):
```
GET  /getTodo?id=1
GET  /fetchAllTodos
POST /addNewTodo
GET  /markTodoDone?id=1       ← using GET to change data (wrong!)
GET  /removeTodo?id=1         ← using GET to delete (wrong!)
```

#### With REST (clean, consistent):
```
GET    /todos          → Get all todos
GET    /todos/1        → Get todo with ID 1
POST   /todos          → Create a new todo
PUT    /todos/1        → Update todo with ID 1
DELETE /todos/1        → Delete todo with ID 1
```

**Why REST is better here:**
- Anyone new to the API immediately understands what each endpoint does
- The verb tells you the action, the URL tells you what resource
- Works perfectly with HTTP — no extra setup needed

---

## Challenges with REST

REST is great, but it has some downsides worth knowing:

### 1. Over-fetching
You ask for a user and get back 20 fields, but you only needed their name.
```json
{
  "id": 42,
  "name": "Arihant",        ← you only needed this
  "email": "...",           ← extra
  "address": "...",         ← extra
  "phone": "...",           ← extra
  "created_at": "..."       ← extra
}
```

### 2. Under-fetching (multiple requests)
To show a user's profile page, you might need:
```
GET /users/42           → get user
GET /users/42/posts     → get their posts
GET /users/42/followers → get their followers
```
Three separate trips to the server — slower performance.

### 3. Repetitive code for each resource
Every resource (users, products, orders, photos) needs its own set of endpoints — lots of repetitive coding.

> **Note:** These challenges are why alternatives like **GraphQL** were created — it lets you ask for exactly the data you need in one request.

---

## HTTP Downsides and Latency Problem

### The Core Problem: Every Request Has Overhead

HTTP is text-based and verbose. Every single request carries a lot of **extra baggage** even before your actual data is sent.

A simple API call looks innocent:
```
GET /users/42
```

But what actually travels over the wire is much bigger:
```
GET /users/42 HTTP/1.1
Host: api.example.com
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)
Accept: application/json
Accept-Language: en-US,en;q=0.9
Accept-Encoding: gzip, deflate, br
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Cookie: session_id=abc123; theme=dark; lang=en
Connection: keep-alive
Cache-Control: no-cache
```

All of that header text goes on **every single request** — even if you're making 100 requests per second. That's a lot of wasted bytes.

---

### Problem 1: Large Payloads = High Latency

**Latency** = the time delay between sending a request and getting a response.

**Why big payloads cause high latency:**
```
Small payload  →  fast to send  →  low latency
Large payload  →  slow to send  →  high latency
```

Real example:
- You have 1000 users listed on a page
- Each user object is 2KB of JSON
- Total payload = **2MB** going over the network
- On a slow mobile connection (1 Mbps) → takes **~16 seconds** to load

**Common culprits:**
- Sending all database fields when you only need 2-3
- Uncompressed JSON responses
- Repeated headers on every request (HTTP/1.1)
- Sending images/files as base64 encoded strings inside JSON

---

### Problem 2: HTTP/1.1 — One Request at a Time (Head-of-Line Blocking)

With **HTTP/1.1** (the old standard), a browser can only handle **6 connections** to a server at once, and each connection handles **one request at a time**.

```
Request 1 ──► [waiting...] ──► Response 1
Request 2 ──►              [waiting for R1 to finish] ──► Response 2
Request 3 ──►                                         [waiting...] ──► Response 3
```

If request 1 is slow (big file, slow DB), everything behind it waits. This is called **Head-of-Line (HOL) Blocking**.

---

### Solutions — How to Minimize Latency

#### Solution 1: Compression (Gzip / Brotli)
Compress the response before sending it. The client decompresses it on arrival.

```
Without compression:  2MB JSON   → 16 seconds on slow connection
With Gzip:            ~200KB     → 1.6 seconds (10x smaller)
With Brotli:          ~150KB     → even better (Google's newer algorithm)
```

How it looks in HTTP headers:
```
Request:   Accept-Encoding: gzip, br
Response:  Content-Encoding: gzip
```

> Think of it like zipping a folder before emailing it — same data, much smaller size.

---

#### Solution 2: HTTP/2 — Multiplexing (Multiple requests, one connection)

**HTTP/2** was built to fix HTTP/1.1's biggest problems.

Key improvement — **Multiplexing**:
```
HTTP/1.1:                          HTTP/2:
Req 1 ──► wait ──► Res 1          Req 1 ──►
Req 2 ──►          ──► Res 2      Req 2 ──►  all at once, one connection
Req 3 ──►               ──► Res 3 Req 3 ──►
```

HTTP/2 also sends **headers in binary** (not plain text) and compresses them using **HPACK** — so repeated headers (like `Authorization`, `Host`) are not resent every time.

| Feature | HTTP/1.1 | HTTP/2 |
|---------|----------|--------|
| Requests per connection | 1 at a time | Many simultaneously |
| Header format | Plain text | Binary + compressed |
| Speed | Slower | 2-3x faster for most apps |

---

#### Solution 3: HTTP/3 — Built on UDP (Not TCP)

**HTTP/2** still has one problem: it runs over **TCP**, which requires a "handshake" before any data flows, and if one packet is lost, everything waits.

**HTTP/3** switches to **QUIC** (runs on UDP):
- No TCP handshake delay
- If one packet is lost, only that stream waits — others keep going
- Much better on **mobile networks** where connections drop often

```
HTTP/1.1  →  TCP  →  1 req/connection,  text headers
HTTP/2    →  TCP  →  multiplexed,       binary headers
HTTP/3    →  UDP  →  multiplexed,       no handshake delay
```

> HTTP/3 is what YouTube, Google, and Cloudflare use today for minimum latency.

---

#### Solution 4: gRPC (For Internal Services / Microservices)

**gRPC** is a completely different communication framework built by Google. Instead of JSON over HTTP, it uses:
- **Protocol Buffers (Protobuf)** — a binary format, much smaller than JSON
- **HTTP/2** under the hood — so multiplexing is built-in
- **Strongly typed** — both sides agree on the data structure upfront

```
REST + JSON:   {"user_id": 42, "name": "Arihant", "email": "a@b.com"}  → ~60 bytes
gRPC Protobuf: binary encoding of same data                             → ~15 bytes (4x smaller)
```

**When to use gRPC:**
- Microservices talking to each other (internal APIs)
- When latency is critical (real-time systems, trading platforms)
- When you send millions of small messages per second

**When NOT to use gRPC:**
- Public APIs that browsers call directly (browsers don't support gRPC natively yet)
- Simple CRUD apps — REST is fine

---

#### Solution 5: WebSockets (For Real-Time, Bidirectional Communication)

Normal HTTP is **one-way per request**: client asks → server responds → connection closes.

For real-time apps (chat, live scores, stock prices), this is terrible:
```
Client: "any new messages?" → Server: "no"  (1 second later)
Client: "any new messages?" → Server: "no"  (1 second later)
Client: "any new messages?" → Server: "YES" (1 second later)
```
This is called **polling** — wasteful and slow.

**WebSockets** open a **persistent two-way connection**:
```
Client ──connects──► Server
         ←── message (instantly pushed)
         ←── message (instantly pushed)
         ──► sends message
         ←── reply
```
No repeated requests. No headers on every message. Data flows both ways instantly.

| Use Case | Best Protocol |
|----------|-------------|
| Fetching data (users, products) | REST + HTTP |
| Real-time chat / notifications | WebSockets |
| Internal microservice calls | gRPC |
| Public API, browser-facing | REST + HTTP/2 |
| Mobile apps with poor network | HTTP/3 |

---

### Summary: HTTP Latency Problem and Fixes

```
Problem                          Solution
─────────────────────────────────────────────────────
Large JSON payload               → Gzip / Brotli compression
Repeated text headers            → HTTP/2 (binary + header compression)
One request at a time (HOL)      → HTTP/2 Multiplexing
TCP handshake delay, packet loss → HTTP/3 (QUIC over UDP)
Heavy JSON encoding              → gRPC + Protobuf (4x smaller)
Repeated polling for updates     → WebSockets (persistent connection)
```

> **Rule of thumb:** For most web apps, just enabling **HTTP/2 + Gzip** on your server cuts latency significantly with zero code changes. gRPC and WebSockets are tools for specific problems — don't reach for them until you actually need them.

---

## Quick Cheat Sheet

```
HTTP  = Protocol (how data travels)
REST  = Architecture style (how your API is designed)

REST uses HTTP verbs:
  GET    → Read
  POST   → Create
  PUT    → Update
  DELETE → Delete

REST treats data as Resources with clean URLs:
  /users, /products, /orders

REST is stateless:
  Server doesn't remember your previous request
  Each request carries all info it needs

REST fits naturally with HTTP:
  Works with all existing browsers, servers, CDNs, load balancers
```

---

## Summary

| Concept | What to Remember |
|---------|-----------------|
| HTTP | The communication protocol — the "how" of sending data |
| REST | A design style — the "what" and "how to structure" your API |
| Resource | Any piece of data with a URL (`/users/42`) |
| Stateless | Server treats every request as brand new |
| HTTP Verbs | GET, POST, PUT, DELETE map to Read, Create, Update, Delete |
| Why REST + HTTP | They fit perfectly — HTTP already has everything REST needs |
| Latency | Delay caused by large payloads, text headers, repeated requests |
| HTTP/1.1 Problem | One request at a time per connection (Head-of-Line Blocking) |
| HTTP/2 | Multiplexing — many requests over one connection, binary headers |
| HTTP/3 | Runs on UDP (QUIC) — no handshake delay, better on mobile |
| Gzip / Brotli | Compress responses — can reduce payload by 10x |
| gRPC | Binary protocol (Protobuf) — 4x smaller than JSON, uses HTTP/2 |
| WebSockets | Persistent two-way connection — for real-time apps (chat, live data) |
