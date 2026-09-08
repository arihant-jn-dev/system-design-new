# Browser Networking — Complete Guide
## Everything That Happens Between You and a Website

> We'll use **ShopEase** (an e-commerce site) as our running example.
> Open Chrome DevTools → Network tab while reading this. It'll click instantly.

---

## Table of Contents

1. [The Big Picture — What Happens When You Open a Website](#1-the-big-picture)
2. [Types of Requests — Document vs Fetch vs XHR vs Script vs Image](#2-types-of-requests)
3. [XHR vs Fetch — The Old vs New Way to Make API Calls](#3-xhr-vs-fetch)
4. [The Network Tab — Every Column Explained](#4-the-network-tab)
5. [Anatomy of a Request — Headers, Method, Body](#5-anatomy-of-a-request)
6. [Anatomy of a Response — Status, Headers, Body](#6-anatomy-of-a-response)
7. [HTTP Methods — GET POST PUT PATCH DELETE](#7-http-methods)
8. [Status Codes — What Every Number Means](#8-status-codes)
9. [CORS — Why Your API Call Gets Blocked](#9-cors)
10. [Cookies vs localStorage vs sessionStorage](#10-browser-storage)
11. [Caching — Why the Second Load is Always Faster](#11-caching)
12. [WebSockets — Real-Time Two-Way Communication](#12-websockets)
13. [Performance Timing — TTFB, DOMContentLoaded, LCP](#13-performance-timing)
14. [HTTP/1.1 vs HTTP/2 vs HTTP/3](#14-http-versions)
15. [The Full Picture — DevTools Walkthrough](#15-full-devtools-walkthrough)

---

## 1. The Big Picture

### What Happens When You Type `shopease.in` and Press Enter

```
YOU TYPE: shopease.in  →  Press Enter

STEP 1: DNS LOOKUP
  Browser checks: "What IP address is shopease.in?"
  
  Cache chain (fastest to slowest):
  Browser DNS cache (< 1ms)
     ↓ (if not found)
  OS DNS cache (< 1ms)
     ↓ (if not found)
  Router cache (< 5ms)
     ↓ (if not found)
  ISP DNS server (10-30ms)
     ↓ (if not found)
  Root DNS → Authoritative DNS → returns: 52.66.47.89
  
  Result: shopease.in = 52.66.47.89

STEP 2: TCP CONNECTION
  Browser opens a connection to 52.66.47.89:443
  
  TCP 3-Way Handshake:
  Browser  →  SYN         →  Server    "Hello, can we talk?"
  Browser  ←  SYN-ACK     ←  Server    "Yes, I hear you"
  Browser  →  ACK         →  Server    "Great, let's go"
  
  Time: 1 round trip (~10-50ms depending on distance)

STEP 3: TLS (Transport Layer Security) HANDSHAKE (for HTTPS)
  Browser and server agree on encryption:
  Browser  →  "I support TLS 1.3, here are my cipher suites"
  Server   ←  "Use AES-256-GCM, here's my SSL certificate"
  Browser  →  Verify certificate (is it signed by trusted CA? not expired?)
  Browser  →  Generate session keys
  
  Time: 1-2 more round trips (~20-100ms)

STEP 4: HTTP REQUEST SENT
  Browser sends:
  GET / HTTP/2
  Host: shopease.in
  Accept: text/html
  Cookie: session=abc123

STEP 5: SERVER PROCESSES AND RESPONDS
  Server sends back the HTML page (shopease.in homepage)
  
  HTTP/1.1 200 OK
  Content-Type: text/html
  Content-Length: 48291
  
  <!DOCTYPE html>
  <html>
    <head>...</head>
    <body>...</body>
  </html>

STEP 6: BROWSER PARSES HTML
  Browser reads HTML top to bottom and discovers:
    <link rel="stylesheet" href="/styles.css">     → fetch CSS
    <script src="/main.js"></script>               → fetch JS
    <img src="/hero-banner.jpg">                   → fetch image
    fetch('/api/products?featured=true')           → JS fetch call

STEP 7: ALL THOSE RESOURCES GET FETCHED
  Browser fires multiple requests simultaneously for all discovered resources.
  This is what you see in the Network tab waterfall.
```

**What the Network tab shows for this one page load:**
```
Type        Name                    Status  Size    Time
────────────────────────────────────────────────────────
Document    shopease.in/            200     48 KB   240ms  ← the HTML page
Stylesheet  styles.css              200     95 KB   85ms
Script      main.js                 200     312 KB  145ms
Script      analytics.js            200     42 KB   65ms
Image       hero-banner.jpg         200     840 KB  320ms
Image       logo.png                200     8 KB    40ms
Font        inter-regular.woff2     200     28 KB   95ms
Fetch       /api/products?featured  200     12 KB   180ms  ← JS API call
Fetch       /api/cart               200     2 KB    95ms
```

---

## 2. Types of Requests

**The browser makes different types of requests for different purposes.**
In DevTools Network tab, you can filter by these types.

```
REQUEST TYPES:
────────────────────────────────────────────────────────────────────

TYPE: Document
  What it is: The main HTML page itself
  Triggered by: Typing URL, clicking a link, form submit, redirect
  
  Example: GET https://shopease.in/products
  Response: An entire HTML page (<!DOCTYPE html>...)
  
  KEY POINT: This is what causes a full page reload.
  The browser discards everything and starts fresh.

────────────────────────────────────────────────────────────────────

TYPE: Fetch / XHR
  What it is: JavaScript making an API call in the background
  Triggered by: fetch() or XMLHttpRequest in your JS code
  
  Example: fetch('/api/products?page=2')
  Response: JSON data (not a new page)
  
  KEY POINT: Page does NOT reload. JS gets the data and updates
  the DOM dynamically. This is what makes SPAs (React/Vue) work.
  
  VISUAL DIFFERENCE:
  Document request → browser address bar changes, page goes blank, reloads
  Fetch/XHR       → nothing visible changes in browser UI, 
                    page updates smoothly via JavaScript

────────────────────────────────────────────────────────────────────

TYPE: Script
  What it is: JavaScript files being loaded
  Triggered by: <script src="..."> in HTML, or dynamic script injection
  
  Example: GET https://shopease.in/main.js
  Response: JavaScript code text (the .js file content)
  
  The browser then executes this JavaScript.

────────────────────────────────────────────────────────────────────

TYPE: Stylesheet
  What it is: CSS files being loaded
  Triggered by: <link rel="stylesheet" href="..."> in HTML
  
  Example: GET https://shopease.in/styles.css
  Response: CSS text (the .css file content)
  
  IMPORTANT: CSS is render-blocking — browser won't display the page
  until all CSS is downloaded and parsed. That's why CSS goes in <head>.

────────────────────────────────────────────────────────────────────

TYPE: Image
  What it is: Images (jpg, png, gif, webp, svg)
  Triggered by: <img src="...">, CSS background-image, fetch()
  
  Example: GET https://shopease.in/products/iphone-15.jpg
  Response: Binary image data

────────────────────────────────────────────────────────────────────

TYPE: Font
  What it is: Web font files (woff2, woff, ttf)
  Triggered by: @font-face in CSS
  
  Example: GET https://fonts.gstatic.com/inter-regular.woff2
  Response: Binary font data
  
  GOTCHA: Fonts load AFTER CSS, so text initially renders in fallback
  font (Times New Roman, Arial) then switches to web font.
  This "flash" is called FOUT (Flash of Unstyled Text).

────────────────────────────────────────────────────────────────────

TYPE: Media
  What it is: Audio and video files
  Triggered by: <video src="...">, <audio src="...">

────────────────────────────────────────────────────────────────────

TYPE: WebSocket
  What it is: Persistent two-way connection
  Triggered by: new WebSocket('wss://...')
  
  Different from all others: stays open, server can push data anytime.
  Used for: live chat, real-time price updates, live cricket scores

────────────────────────────────────────────────────────────────────

TYPE: Preflight (OPTIONS)
  What it is: An automatic "permission check" before CORS requests
  Triggered by: Browser automatically (you don't control this)
  
  Example: OPTIONS https://api.shopease.in/products
  This is the browser asking: "Hey server, am I allowed to do this?"
  Server says yes → actual request follows
  Server says no → request blocked (CORS error)
  
  See section 9 for full CORS explanation.
```

---

## 3. XHR vs Fetch

**Both make API calls from JavaScript. Fetch is the modern replacement for XHR.**

### XHR — XMLHttpRequest (Old Way, 2000s)

```javascript
// XHR — verbose, callback-based, harder to read
const xhr = new XMLHttpRequest();

xhr.open('GET', '/api/products?category=electronics');  // set method + URL

// Set headers
xhr.setRequestHeader('Authorization', 'Bearer token123');
xhr.setRequestHeader('Content-Type', 'application/json');

// What to do when response arrives (callback hell)
xhr.onload = function() {
    if (xhr.status === 200) {
        const products = JSON.parse(xhr.responseText);
        console.log(products);
    } else {
        console.error('Request failed:', xhr.status);
    }
};

xhr.onerror = function() {
    console.error('Network error');
};

xhr.send();  // fire the request

// POST with XHR (even more verbose):
const xhr2 = new XMLHttpRequest();
xhr2.open('POST', '/api/cart');
xhr2.setRequestHeader('Content-Type', 'application/json');
xhr2.onload = function() { /* handle response */ };
xhr2.send(JSON.stringify({ product_id: 'prod-789', quantity: 2 }));
```

### Fetch — Modern Way (2015+)

```javascript
// FETCH — clean, Promise-based, readable

// Simple GET:
const response = await fetch('/api/products?category=electronics');
const products = await response.json();
console.log(products);

// With headers:
const response = await fetch('/api/products', {
    method: 'GET',
    headers: {
        'Authorization': 'Bearer token123',
        'Accept': 'application/json'
    }
});

// POST with body:
const response = await fetch('/api/cart', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token123'
    },
    body: JSON.stringify({
        product_id: 'prod-789',
        quantity: 2
    })
});

const result = await response.json();
console.log(result);  // { success: true, cart_items: 3 }

// Error handling with fetch:
try {
    const response = await fetch('/api/products');
    
    if (!response.ok) {  // ← IMPORTANT: fetch doesn't throw on 4xx/5xx
        throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
} catch (error) {
    console.error('Request failed:', error);
}
```

### XHR vs Fetch — Side by Side

```
FEATURE             XHR                     FETCH
────────────────────────────────────────────────────────────────────
Syntax              Callback-based          Promise/async-await
Readability         Verbose, complex        Clean, minimal
Error handling      status in onload        .ok property + try/catch
Upload progress     xhr.upload.onprogress   No built-in (use XHR)
Request cancel      xhr.abort()             AbortController
Cookies             Sent automatically      credentials: 'include' needed
Response types      responseText/XML        .json() .text() .blob() .arrayBuffer()
Browser support     All browsers            All modern browsers (IE not supported)
Introduced          1999 (IE5)              2015 (Fetch API spec)

WHEN TO STILL USE XHR:
  ✅ Upload progress bar (need to track % uploaded)
  ✅ Legacy codebase maintaining old code
  ✅ Need to support very old browsers (rare now)

USE FETCH FOR:
  ✅ All new code — it's cleaner and modern
  ✅ Simple API calls (GET, POST, PUT, DELETE)
  ✅ Streaming responses
```

### GOTCHA: Fetch Does NOT Throw on HTTP Errors

```javascript
// Common mistake with Fetch:
const response = await fetch('/api/products/999999');  // product doesn't exist

// You might think this throws an error... IT DOESN'T
// response.status = 404, but NO exception is thrown

// You MUST check manually:
if (!response.ok) {
    // response.ok is true for 200-299 only
    const errorData = await response.json();
    throw new Error(`${response.status}: ${errorData.message}`);
}

// Fetch ONLY throws on network failures (no internet, DNS fails, etc.)
// NOT on HTTP error responses (404, 500, etc.)
```

### Real ShopEase Examples

```javascript
// EXAMPLE 1: Load products when page scrolls to bottom
async function loadMoreProducts(page) {
    const response = await fetch(`/api/products?page=${page}&limit=20`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    });
    
    if (!response.ok) throw new Error('Failed to load products');
    
    const { products, hasMore } = await response.json();
    renderProducts(products);  // update DOM
    return hasMore;
}

// EXAMPLE 2: Add item to cart
async function addToCart(productId, quantity) {
    const response = await fetch('/api/cart/items', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ product_id: productId, quantity })
    });
    
    const cart = await response.json();
    updateCartIcon(cart.total_items);  // "3" in cart icon
}

// EXAMPLE 3: Search with debounce (cancel previous request)
let abortController = null;

async function searchProducts(query) {
    // Cancel the previous search request if still pending
    if (abortController) abortController.abort();
    
    abortController = new AbortController();
    
    try {
        const response = await fetch(`/api/search?q=${query}`, {
            signal: abortController.signal  // attach cancel signal
        });
        const results = await response.json();
        renderSearchResults(results);
    } catch (error) {
        if (error.name === 'AbortError') return;  // normal, ignore
        console.error('Search failed:', error);
    }
}
// User types "iph" → request 1 starts
// User types "ipho" → request 1 CANCELLED, request 2 starts
// User types "iphone" → request 2 CANCELLED, request 3 starts
// Only the final search request completes
```

---

## 4. The Network Tab

**Open DevTools → Network tab. Here's what every column and section means.**

### The Column Headers

```
NAME        URL path of the request
            shopease.in/ 
            /api/products?page=1
            hero-banner.jpg

STATUS      HTTP status code
            200 = OK (success)
            304 = Not Modified (from cache)
            404 = Not Found
            500 = Server Error
            (see full list in section 8)

TYPE        Request type (Document, Fetch, Script, Image, etc.)
            (see section 2)

INITIATOR   What caused this request to be made
            "parser"          → HTML parser found <img> or <link>
            "script"          → JavaScript called fetch() or XHR
            main.js:247       → fetch() on line 247 of main.js
            "(index)"         → from the HTML page itself

SIZE        Two numbers:
            18.5 kB / 102 kB
            ↑               ↑
            Transferred     Actual size
            (compressed)    (uncompressed)
            
            If Size shows "(memory cache)" or "(disk cache)" → 
            request wasn't even made, served from browser cache.

TIME        How long this request took total
            Hover over it → see breakdown (DNS, TCP, SSL, Wait, Download)

WATERFALL   Visual timeline showing when each request started and ended
            ─────────────────────────────────────────────────────
            Request 1: ══════════════
            Request 2:      ═══════════════════
            Request 3:      ═════
            Request 4:                    ══════════════════
            ─────────────────────────────────────────────────────
            Width = duration. Position = when it started.
            Parallel = multiple requests at same time (HTTP/2)
```

### Clicking a Request — The Tabs Inside

```
When you click any request in the Network tab, you see:

HEADERS TAB:
  General:
    Request URL:     https://shopease.in/api/products?page=1
    Request Method:  GET
    Status Code:     200 OK
    Remote Address:  52.66.47.89:443  ← actual server IP
    Referrer Policy: strict-origin-when-cross-origin
  
  Response Headers (what server sent back):
    Content-Type:    application/json; charset=utf-8
    Cache-Control:   max-age=60
    X-Request-ID:    req-abc-123-xyz
    ...
  
  Request Headers (what browser sent):
    Accept:          application/json
    Authorization:   Bearer eyJhbGci...
    Cookie:          session=xyz; _ga=GA1.2...
    User-Agent:      Mozilla/5.0 (Mac) Chrome/120...
    ...

PREVIEW TAB:
  Shows the response body in a pretty, readable format
  For JSON: collapsible tree structure
  For HTML: rendered preview
  For images: shows the actual image

RESPONSE TAB:
  Raw response body exactly as received
  {
    "products": [...],
    "total": 1247,
    "page": 1,
    "hasMore": true
  }

TIMING TAB (THE MOST USEFUL FOR DEBUGGING):
  Queueing:          12ms  ← waiting for browser to start it (HTTP/1 limit)
  Stalled:           2ms   ← waiting for connection to be free
  DNS Lookup:        0ms   ← (cached from earlier request)
  Initial connection: 48ms  ← TCP handshake
  SSL:               35ms  ← TLS handshake
  Request sent:      0.5ms ← sending HTTP request
  Waiting (TTFB):    180ms ← waiting for server's FIRST byte ← server speed
  Content Download:  45ms  ← downloading the response body

  DIAGNOSIS GUIDE:
  Large DNS Lookup    → DNS is slow, consider pre-connecting
  Large Initial conn  → Server is far away, use CDN
  Large SSL           → TLS negotiation slow (normal first time)
  Large TTFB          → SERVER is slow (DB query, processing time)
  Large Download      → Response is large, consider compression
```

### Network Tab Filters

```
FILTER BAR at the top of Network tab:
  All        → show every request
  Fetch/XHR  → only API calls (what React/Vue apps make)
  Doc        → only document (HTML page) requests
  CSS        → only stylesheets
  JS         → only JavaScript files
  Img        → only images
  Media      → audio/video
  Font       → web fonts
  WS         → WebSocket connections
  Wasm       → WebAssembly
  Other      → anything that doesn't fit above

SEARCH BOX: Filter by URL
  Type "api" → shows only requests with "api" in URL
  Type "products" → shows only product-related calls

RIGHT-CLICK OPTIONS:
  Copy as cURL    → get the exact curl command to replay this request in terminal
  Copy as Fetch   → get JS fetch() code for this request
  Copy Response   → copy the response body
  Replay XHR      → re-send the request (great for testing)
```

---

## 5. Anatomy of a Request

**Every request has three parts: the Request Line, Headers, and Body.**

```
HTTP REQUEST STRUCTURE:
────────────────────────────────────────────────────────────

PART 1: REQUEST LINE (first line)
  POST /api/cart/items HTTP/2
  ↑    ↑               ↑
  Method  Path         Protocol

PART 2: HEADERS (key: value pairs)
  Host: shopease.in
  Content-Type: application/json
  Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiMTIzNDUi...
  Accept: application/json
  Cookie: session=abc123; cart_id=xyz789
  User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0
  Accept-Encoding: gzip, deflate, br
  (blank line separates headers from body)

PART 3: BODY (only for POST, PUT, PATCH)
  {
    "product_id": "prod-789",
    "quantity": 2
  }
```

### Important Request Headers Explained

```
HEADER              WHAT IT MEANS / EXAMPLE
────────────────────────────────────────────────────────────────────
Host                Which website you're requesting (required in HTTP/1.1)
                    Host: shopease.in
                    (One server can host many websites using this header)

Content-Type        Format of the REQUEST BODY you're sending
                    Content-Type: application/json         → sending JSON
                    Content-Type: multipart/form-data      → uploading files
                    Content-Type: application/x-www-form-urlencoded → HTML forms

Accept              What response format you can handle
                    Accept: application/json               → I want JSON back
                    Accept: text/html                      → I want HTML
                    Accept: */*                            → I accept anything

Authorization       Credentials to prove who you are
                    Authorization: Bearer eyJhbGci...      → JWT token
                    Authorization: Basic dXNlcjpwYXNz      → base64(user:pass)
                    Authorization: ApiKey shopease-abc123  → API key

Cookie              Cookies stored for this domain (browser adds automatically)
                    Cookie: session=abc123; cart_id=xyz789; _ga=GA1.2.456.789

User-Agent          Browser/client identification
                    User-Agent: Mozilla/5.0 (Mac OS X) Chrome/120.0.0.0
                    (Servers use this to detect mobile vs desktop, bot vs human)

Accept-Encoding     Compression formats you support
                    Accept-Encoding: gzip, deflate, br
                    Server compresses response → browser decompresses
                    (Reduces transfer size by 60-80%)

Referer             URL of the page that triggered this request
                    Referer: https://shopease.in/products
                    (Server knows: user was on /products, then clicked something)

Origin              The domain making the request (for CORS)
                    Origin: https://shopease.in
                    (Server uses this to decide if CORS request is allowed)

Cache-Control       Caching instructions (see section 11)
                    Cache-Control: no-cache    → always revalidate
                    Cache-Control: max-age=0   → don't use cached version

If-None-Match       For cache validation — "I have version X, do you have newer?"
                    If-None-Match: "abc123def456"  (ETag from previous response)
                    Server: 304 Not Modified → use your cached version
```

---

## 6. Anatomy of a Response

```
HTTP RESPONSE STRUCTURE:
────────────────────────────────────────────────────────────

PART 1: STATUS LINE
  HTTP/2 200 OK
  ↑      ↑   ↑
  Proto  Code Message

PART 2: RESPONSE HEADERS
  Content-Type: application/json; charset=utf-8
  Content-Length: 1247
  Cache-Control: max-age=300
  Content-Encoding: gzip
  ETag: "33a64df551425fcc55e4d42a148795d9f25f89d"
  X-Request-ID: req-abc-123
  Set-Cookie: session=xyz789; HttpOnly; Secure; SameSite=Strict; Max-Age=86400
  Access-Control-Allow-Origin: https://shopease.in
  (blank line)

PART 3: BODY
  (gzip compressed binary, browser decompresses to:)
  {
    "products": [
      { "id": "prod-789", "name": "iPhone 15", "price": 79999 },
      ...
    ],
    "total": 1247,
    "page": 1
  }
```

### Important Response Headers Explained

```
HEADER                      WHAT IT MEANS
────────────────────────────────────────────────────────────────────
Content-Type                Format of the response body
                            Content-Type: application/json
                            Content-Type: text/html; charset=utf-8
                            Content-Type: image/webp
                            Content-Type: application/octet-stream  → binary file

Content-Length              Size of response in bytes
                            Content-Length: 48291

Content-Encoding            How the body is compressed
                            Content-Encoding: gzip   → browser decompresses
                            (you never see the compression in DevTools Preview)

Cache-Control               How long browser/CDN can cache this response
                            Cache-Control: max-age=3600      → cache for 1 hour
                            Cache-Control: no-store          → never cache
                            Cache-Control: public            → CDN can cache
                            Cache-Control: private           → only browser cache
                            (see section 11 for full details)

ETag                        Version fingerprint of this resource
                            ETag: "33a64df551"
                            Browser sends this next time → server says 304 if unchanged

Set-Cookie                  Tells browser to store a cookie
                            Set-Cookie: session=xyz789; HttpOnly; Secure; Max-Age=86400
                            → stored and sent on every future request to this domain

Location                    Where to redirect (for 301/302 responses)
                            HTTP/1.1 301 Moved Permanently
                            Location: https://shopease.in/products  ← go here instead

Access-Control-Allow-Origin  CORS — who is allowed to read this response
                            Access-Control-Allow-Origin: https://shopease.in
                            Access-Control-Allow-Origin: *  (anyone)
                            (see section 9)

X-Content-Type-Options      Security: don't guess content type
                            X-Content-Type-Options: nosniff

Strict-Transport-Security   Force HTTPS for this domain
                            Strict-Transport-Security: max-age=31536000
                            (browser remembers: always use HTTPS for shopease.in)

Content-Security-Policy     What scripts/styles/sources are trusted
                            Content-Security-Policy: default-src 'self'
                            (prevents XSS attacks by blocking external scripts)
```

---

## 7. HTTP Methods

**The METHOD tells the server what action you want to perform.**

```
METHOD      PURPOSE                      HAS BODY?  SAFE?   IDEMPOTENT?
────────────────────────────────────────────────────────────────────────
GET         Read/retrieve data           No         Yes     Yes
POST        Create new resource          Yes        No      No
PUT         Replace entire resource      Yes        No      Yes
PATCH       Update part of resource      Yes        No      No (usually)
DELETE      Delete a resource            No         No      Yes
OPTIONS     Check what's allowed (CORS)  No         Yes     Yes
HEAD        Like GET but no body         No         Yes     Yes

SAFE: Won't change server state (GET, OPTIONS, HEAD)
IDEMPOTENT: Doing it multiple times = same result as doing it once
```

### ShopEase API Examples

```
GET /api/products
→ Fetch list of products
→ No body, no side effects
→ Can be cached

POST /api/products
→ Create a new product
→ Body: { name, price, category }
→ Creates new DB record every time called
→ NOT idempotent (calling twice = two products created)

PUT /api/products/789
→ Replace the entire product 789
→ Body: { name, price, category, stock } (ALL fields required)
→ Idempotent: calling same PUT 10 times → same result

PATCH /api/products/789
→ Update only some fields of product 789
→ Body: { price: 74999 }  ← only the price changes
→ Other fields (name, stock) stay the same

DELETE /api/products/789
→ Delete product 789
→ Calling DELETE again returns 404 (already deleted)
→ Idempotent: result of "product 789 doesn't exist" is same either way

GET /api/products/789
→ Returns product 789

HEAD /api/products/789
→ Returns ONLY the headers (no body)
→ Use to check: does this product exist? What's the Content-Type?
→ Faster than GET for existence checks

OPTIONS /api/products
→ "What methods are allowed on this endpoint?"
→ Response:
   Allow: GET, POST, OPTIONS
→ Also used for CORS preflight (automatic, see section 9)
```

### Common REST API URL Patterns

```
RESOURCE: Products

LIST:    GET    /api/products              → all products
CREATE:  POST   /api/products              → new product
READ:    GET    /api/products/:id          → one product
UPDATE:  PUT    /api/products/:id          → replace product
PARTIAL: PATCH  /api/products/:id          → update some fields
DELETE:  DELETE /api/products/:id          → delete product

NESTED:  GET    /api/products/:id/reviews  → reviews for one product
         POST   /api/products/:id/reviews  → add review to product

FILTER:  GET    /api/products?category=phones&min_price=10000&sort=price_asc
SEARCH:  GET    /api/search?q=iphone+15
```

---

## 8. Status Codes

**The 3-digit number that tells you what happened.**

```
STATUS CODES BY RANGE:
  1xx → Informational (rare, almost never seen in DevTools)
  2xx → Success
  3xx → Redirect
  4xx → Client Error (YOUR code/request is wrong)
  5xx → Server Error (SERVER has a problem)
```

### 2xx — Success

```
200 OK
  → Standard success. Response body has the data.
  → GET /api/products → 200 with product list

201 Created
  → Resource was created. Body usually has the new resource.
  → POST /api/products → 201 with the new product (including its new ID)

204 No Content
  → Success, but nothing to return.
  → DELETE /api/products/789 → 204 (product deleted, nothing to send back)
  → Body is empty.

206 Partial Content
  → Used for video/audio streaming, large file downloads
  → "Here's bytes 0-999 of a 50MB file"
  → Browser requests chunks, plays as they arrive
```

### 3xx — Redirects

```
301 Moved Permanently
  → Resource has permanently moved to new URL.
  → Browser remembers this forever (cached).
  → Example: http://shopease.in → 301 → https://shopease.in
  → Browser will NEVER try HTTP again for this domain.

302 Found (Temporary Redirect)
  → Resource is temporarily at a different URL.
  → Browser does NOT cache this.
  → Example: After login → 302 → /dashboard

304 Not Modified
  → "You already have the latest version, use your cache."
  → Browser sent: If-None-Match: "abc123"
  → Server checked: still "abc123" → 304, no body
  → Browser loads from cache (very fast, saves bandwidth)
  → You see this in Network tab as "from cache" with 304

307 Temporary Redirect
  → Same as 302 but preserves HTTP method
  → POST /submit → 307 → POST /new-submit (method stays POST)
  → (302 changes POST to GET, 307 keeps it POST)
```

### 4xx — Client Errors (Your Request is Wrong)

```
400 Bad Request
  → Your request is malformed or has invalid data.
  → POST /api/products with body { price: "not-a-number" }
  → Response: { "error": "price must be a number" }

401 Unauthorized
  → You're NOT logged in (or token is expired/invalid).
  → GET /api/cart → 401 (no auth token sent)
  → Not 403! 401 means "I don't know who you are."

403 Forbidden
  → You're logged in, but NOT ALLOWED to do this.
  → Regular user trying to DELETE /api/admin/users → 403
  → "I know who you are, but you can't do this."
  
  401 vs 403:
  401: "Who are you?" (authentication problem)
  403: "I know who you are, but NO." (authorization problem)

404 Not Found
  → The resource doesn't exist.
  → GET /api/products/99999999 → 404 (product doesn't exist)
  → GET /nonexistent-page → 404

405 Method Not Allowed
  → Endpoint exists, but not with this HTTP method.
  → DELETE /api/products → 405 (can't delete the whole list)
  → Response: Allow: GET, POST

408 Request Timeout
  → Server waited too long for your complete request.

409 Conflict
  → Resource already exists, or conflicting state.
  → POST /api/users with email that already exists → 409

410 Gone
  → Like 404, but explicitly deleted (won't come back).

422 Unprocessable Entity
  → Request is well-formed but fails validation.
  → POST /api/checkout with stock = 0 → 422 { "error": "item out of stock" }

429 Too Many Requests
  → Rate limited. You're sending too many requests.
  → Response headers:
     Retry-After: 60   (try again in 60 seconds)
     X-RateLimit-Limit: 100
     X-RateLimit-Remaining: 0
```

### 5xx — Server Errors (Server's Problem)

```
500 Internal Server Error
  → Generic "something broke on the server."
  → Usually means an unhandled exception in server code.
  → Check server logs for the actual error.

502 Bad Gateway
  → Your server got an invalid response from ANOTHER server.
  → Load balancer couldn't connect to the app server.
  → Often means the app server crashed.

503 Service Unavailable
  → Server is temporarily unavailable.
  → Maintenance, overloaded, or starting up.
  → Often includes: Retry-After: 120

504 Gateway Timeout
  → Server was waiting for another server, which timed out.
  → Load balancer → App server → DB query taking too long → 504

DEBUGGING 5xx:
  These are ALWAYS the server's fault.
  Check: CloudWatch logs, X-Ray traces, server error logs.
  User shouldn't see these in production.
```

---

## 9. CORS

**The most confusing error for new developers. Let's make it completely clear with multiple real examples.**

---

### The Bank Attack — Explained Step by Step

**This is the exact attack that made browser engineers create CORS.**

**Setup:**
```
You are logged into: https://hdfc.com (your bank)
Your browser holds: Cookie: session=USER_SESSION_TOKEN_abc123

You visit (by mistake or a link): https://evil-money-thief.com
```

**What evil-money-thief.com's JavaScript does:**

```javascript
// This code is on evil-money-thief.com
// You can't see it — it runs invisibly in the background

// ATTACK ATTEMPT:
fetch('https://hdfc.com/api/transfer', {
    method: 'POST',
    body: JSON.stringify({
        from_account: 'YOUR_ACCOUNT',
        to_account:   'HACKER_ACCOUNT_9876',
        amount:       50000
    })
    // No need to set Cookie header — browser does it AUTOMATICALLY
    // because you're already logged into hdfc.com
})
```

**Without any protection — what would happen:**

```
BROWSER SENDS:
  POST https://hdfc.com/api/transfer
  Cookie: session=USER_SESSION_TOKEN_abc123  ← browser adds this automatically!
  Content-Type: application/json
  
  { "from": "YOUR_ACCOUNT", "to": "HACKER_9876", "amount": 50000 }

HDFC SERVER sees a valid session cookie → thinks YOU made this request
→ Transfers ₹50,000 to hacker ❌
→ Returns: { "success": true, "transaction_id": "TXN123" }

HACKER'S CODE reads the response:
  const result = await response.json()
  console.log(result.transaction_id)  // confirms transfer succeeded
```

**Why CORS (Same-Origin Policy) stops this attack:**

```
BROWSER'S RULE:
  evil-money-thief.com is trying to read a response from hdfc.com
  These are DIFFERENT origins → not allowed unless hdfc.com explicitly permits it

WHAT ACTUALLY HAPPENS:

STEP 1: Browser sends the request (yes, it DOES send the request)
  POST https://hdfc.com/api/transfer
  Cookie: session=USER_SESSION_TOKEN_abc123
  Origin: https://evil-money-thief.com   ← browser adds this header
  { "from": "YOUR", "to": "HACKER", "amount": 50000 }

STEP 2: HDFC server responds
  HTTP/1.1 200 OK
  (no Access-Control-Allow-Origin header)
  { "success": true, "transaction_id": "TXN123" }

STEP 3: Browser checks the response
  "Does this response have Access-Control-Allow-Origin: evil-money-thief.com?"
  → NO
  
  Browser THROWS AWAY the response. JavaScript never gets to read it.
  Error in browser console: "CORS policy blocked"

HACKER'S CODE:
  try {
      const result = await response.json()  // ← THROWS ERROR, never executes
  } catch(e) {
      // hacker gets nothing, attack fails ✅
  }

IMPORTANT NUANCE:
  ⚠️  The request DID reach HDFC's server
  ⚠️  The transfer MIGHT have happened (if HDFC doesn't have other protections)
  ✅  But the HACKER CAN'T READ the response to confirm or chain more attacks
  
  This is why banks also use CSRF tokens — a separate protection
  (CORS alone doesn't prevent state-changing requests, it just blocks reading responses)
```

**The key insight about what CORS actually controls:**

```
CORS CONTROLS: Can JavaScript on origin A READ the response from origin B?

It does NOT control: Whether the REQUEST is sent at all.

For simple requests (GET, basic POST):
  Request IS sent → Server processes it → Response IS received by browser
  → Browser decides: can JS read this? If no CORS header → NO
  → JS gets a blocked error, not the response

For preflight requests (DELETE, custom headers):
  OPTIONS request sent first → if rejected, actual request NEVER sent
  → Safer for dangerous operations

WHAT THIS MEANS:
  ✅ CORS protects against: Hackers READING your private data
  ✅ CORS protects against: Chaining attacks using response data
  ⚠️  CORS alone does NOT protect against: A POST that changes server state
  
  That's why banks also need: CSRF tokens, SameSite cookies, re-authentication
```

---

### Visual: What "Same Origin" Actually Means

```
URL                              ORIGIN                    Same as shopease.in?
───────────────────────────────────────────────────────────────────────────────
https://shopease.in/products     https://shopease.in       ✅ SAME
https://shopease.in/api/cart     https://shopease.in       ✅ SAME (path doesn't matter)
https://shopease.in:443/login    https://shopease.in       ✅ SAME (443 is default)
http://shopease.in/products      http://shopease.in        ❌ DIFFERENT (http vs https)
https://api.shopease.in/products https://api.shopease.in   ❌ DIFFERENT (subdomain)
https://shopease.com/products    https://shopease.com      ❌ DIFFERENT (TLD)
https://shopease.in:3000/api     https://shopease.in:3000  ❌ DIFFERENT (port)
http://localhost:3000            http://localhost:3000     ✅ SAME
http://localhost:8080            http://localhost:8080     ✅ SAME
http://localhost:3000 vs :8080   ← these two                ❌ DIFFERENT (port!)

ORIGIN = PROTOCOL + DOMAIN + PORT
Change ANY one of these → different origin → CORS kicks in
```

---

### Example 1 — The Most Common Developer Scenario (localhost)

**You're building ShopEase. Frontend on port 3000, backend on port 8080.**

```
YOUR SETUP:
  React app:    http://localhost:3000   (npm start)
  Node.js API:  http://localhost:8080   (node server.js)
  
  Different ports = DIFFERENT ORIGINS = CORS required
```

**What you write in React:**

```javascript
// React component — ShopEase product list
function ProductList() {
    const [products, setProducts] = useState([]);

    useEffect(() => {
        fetch('http://localhost:8080/api/products')   // different port!
            .then(res => res.json())
            .then(data => setProducts(data))
            .catch(err => console.error(err));
    }, []);
    
    return <div>{products.map(p => <ProductCard key={p.id} {...p} />)}</div>;
}
```

**What you see in the browser (before CORS is configured):**

```
CHROME CONSOLE ERROR:
  Access to fetch at 'http://localhost:8080/api/products' 
  from origin 'http://localhost:3000' has been blocked by CORS policy: 
  No 'Access-Control-Allow-Origin' header is present on the requested resource.

NETWORK TAB:
  /api/products    Status: (failed)    Type: fetch
  Click on it → Response says: (blocked:mixed-content) or CORS error

YOUR BACKEND RECEIVED THE REQUEST but browser blocked the response from JS
```

**The fix — your Node.js server:**

```javascript
// server.js (Node.js + Express)
const express = require('express');
const cors = require('cors');
const app = express();

// OPTION A: Allow your React dev server only
app.use(cors({
    origin: 'http://localhost:3000'
}));

// OPTION B: Different origins per environment
const allowedOrigins = {
    development: ['http://localhost:3000', 'http://localhost:3001'],
    production:  ['https://shopease.in', 'https://www.shopease.in']
};

app.use(cors({
    origin: (requestOrigin, callback) => {
        const env = process.env.NODE_ENV || 'development';
        const list = allowedOrigins[env];
        
        if (!requestOrigin || list.includes(requestOrigin)) {
            callback(null, true);   // allow
        } else {
            callback(new Error(`CORS: ${requestOrigin} not allowed`));
        }
    },
    credentials: true
}));

app.get('/api/products', (req, res) => {
    res.json([{ id: 1, name: 'iPhone 15', price: 79999 }]);
});

app.listen(8080);
```

**After the fix — what goes over the wire:**

```
REQUEST (from React on :3000 to Express on :8080):
  GET /api/products HTTP/1.1
  Host: localhost:8080
  Origin: http://localhost:3000      ← browser adds this automatically
  Accept: application/json

RESPONSE (Express replies):
  HTTP/1.1 200 OK
  Access-Control-Allow-Origin: http://localhost:3000   ← your fix added this
  Content-Type: application/json
  
  [{"id":1,"name":"iPhone 15","price":79999}]

BROWSER CHECKS:
  "Response has Access-Control-Allow-Origin: http://localhost:3000"
  "I am http://localhost:3000"
  "Match! JS can read this response." ✅

React gets the data, renders the product list.
```

---

### Example 2 — ShopEase Mobile App (Different Subdomain)

**ShopEase web and mobile share one API.**

```
SETUP:
  Web frontend:    https://shopease.in           (React)
  Mobile frontend: https://m.shopease.in         (React Native Web)
  Seller portal:   https://seller.shopease.in
  Shared API:      https://api.shopease.in       (Node.js)
  
  ALL are different origins → ALL need CORS from api.shopease.in
```

**The API server handles all three:**

```javascript
// api.shopease.in — Express server

app.use(cors({
    origin: [
        'https://shopease.in',
        'https://www.shopease.in',
        'https://m.shopease.in',
        'https://seller.shopease.in',
        'http://localhost:3000',    // developer machines
        'http://localhost:3001',    // another dev
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
    credentials: true,              // allow cookies (session)
    maxAge: 86400                   // cache preflight for 24 hours
}));
```

**What the CORS response headers look like for each caller:**

```
Web app (shopease.in) requests /api/cart:
  Request:  Origin: https://shopease.in
  Response: Access-Control-Allow-Origin: https://shopease.in       ✅

Mobile app (m.shopease.in) requests /api/cart:
  Request:  Origin: https://m.shopease.in
  Response: Access-Control-Allow-Origin: https://m.shopease.in     ✅

Evil site requests /api/cart:
  Request:  Origin: https://evil-thief.com
  Response: (no Access-Control-Allow-Origin header)                ❌
```

---

### Example 3 — The Preflight in Slow Motion (DELETE with auth token)

**Let's trace every single HTTP message for a product delete in the seller portal.**

```javascript
// Seller portal (seller.shopease.in) deletes a product
async function deleteProduct(productId) {
    const response = await fetch(`https://api.shopease.in/products/${productId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': 'Bearer eyJhbGci...'   // JWT token
        }
    });
    return response.json();
}
```

**Message 1 — Preflight (browser sends this automatically, your code doesn't):**

```
→ OPTIONS https://api.shopease.in/products/789
  Origin:                          https://seller.shopease.in
  Access-Control-Request-Method:   DELETE
  Access-Control-Request-Headers:  Authorization
  
  Browser asking: "Can seller.shopease.in do DELETE with Authorization header?"
```

**Message 2 — Preflight Response (server must reply correctly):**

```
← HTTP/1.1 204 No Content
  Access-Control-Allow-Origin:   https://seller.shopease.in
  Access-Control-Allow-Methods:  GET, POST, PUT, DELETE, PATCH
  Access-Control-Allow-Headers:  Authorization, Content-Type
  Access-Control-Max-Age:        86400
  
  Server saying: "Yes, seller.shopease.in is allowed to do all that."
```

**Message 3 — Actual DELETE request (only sent after preflight passes):**

```
→ DELETE https://api.shopease.in/products/789
  Origin:        https://seller.shopease.in
  Authorization: Bearer eyJhbGci...
```

**Message 4 — Actual Response:**

```
← HTTP/1.1 200 OK
  Access-Control-Allow-Origin: https://seller.shopease.in
  Content-Type: application/json
  
  { "success": true, "message": "Product 789 deleted" }
```

**What DevTools shows (you see 2 rows for 1 delete call):**

```
METHOD   NAME                STATUS   TYPE     INITIATOR
OPTIONS  api.shopease.in/products/789  204  preflight  deleteProduct.js:3
DELETE   api.shopease.in/products/789  200  fetch      deleteProduct.js:3

The OPTIONS row → click it → Response Headers shows the CORS permissions
The DELETE row  → click it → Response Headers shows the actual result

IMPORTANT: If OPTIONS returns anything other than 2xx:
  → The DELETE is NEVER sent (you only see the OPTIONS row)
  → Fix the preflight response on your server first
```

**If the preflight fails — what you see:**

```
DevTools Network tab:
  OPTIONS  /api/products/789   (failed)   preflight

DevTools Console:
  Access to fetch at 'https://api.shopease.in/products/789' 
  from origin 'https://seller.shopease.in' has been blocked by CORS policy:
  Response to preflight request doesn't pass access control check: 
  It does not have HTTP ok status.

COMMON CAUSES:
  1. Server returns 404 for OPTIONS (route not configured for OPTIONS method)
  2. Server returns 403 (auth middleware runs BEFORE CORS middleware)
  3. Missing Access-Control-Allow-Headers (forgot to allow 'Authorization')
  4. Origin not in the allowed list

COMMON MISTAKE — Auth middleware before CORS:
  ❌ WRONG ORDER:
  app.use(authMiddleware)   // rejects OPTIONS requests with 401
  app.use(cors(...))        // never reached for OPTIONS

  ✅ CORRECT ORDER:
  app.use(cors(...))        // handle CORS first (allows OPTIONS through)
  app.use(authMiddleware)   // then check auth (on real requests)
```

---

### Example 4 — Third-Party API Integration (Razorpay, Google Maps)

**ShopEase integrates external APIs. Some work fine, some have CORS issues.**

```
SCENARIO: ShopEase wants to call Razorpay's API directly from the browser
```

```javascript
// ❌ TRYING THIS FROM BROWSER FRONTEND:
const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
        'Authorization': 'Basic ' + btoa('rzp_live_key:rzp_secret'),
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ amount: 79999, currency: 'INR' })
});

// RESULT:
// CORS ERROR — Razorpay blocks browser requests
// AND your secret key is exposed in browser JS! ← massive security hole
```

**The correct pattern — proxy through your backend:**

```
WRONG (browser → Razorpay directly):
  Browser ──X──→ https://api.razorpay.com
  CORS blocks it + secret key exposed

CORRECT (browser → your server → Razorpay):
  Browser ──────→ https://api.shopease.in/api/create-order
                              │
                              └──→ https://api.razorpay.com  (server-to-server, no CORS)
```

```javascript
// BACKEND (api.shopease.in) — acts as proxy:
app.post('/api/create-order', authMiddleware, async (req, res) => {
    const { amount, currency } = req.body;
    
    // Server calls Razorpay — no CORS, no secret key exposed to browser
    const razorpayOrder = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + Buffer.from(
                `${process.env.RAZORPAY_KEY}:${process.env.RAZORPAY_SECRET}`
            ).toString('base64'),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ amount, currency })
    });
    
    const order = await razorpayOrder.json();
    res.json({ order_id: order.id });  // send back to browser
});

// BROWSER code:
const { order_id } = await fetch('/api/create-order', {  // ← calls YOUR server
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ amount: 79999, currency: 'INR' })
}).then(r => r.json());
// No CORS issue — same origin (or allowed origin)
// No secret key in browser
```

**When third-party APIs DO allow browser calls:**

```
APIs designed for browser use (they set Access-Control-Allow-Origin: *):
  ✅ Google Maps JS API
  ✅ Firebase (Firestore, Auth)
  ✅ Stripe.js (payment form — uses their JS SDK)
  ✅ Cloudinary (image upload)
  ✅ OpenWeatherMap (public weather data)

These APIs use:
  API keys (not secrets) — safe to expose in browser
  Access-Control-Allow-Origin: *  — allows all origins

You call them directly from JS:
  const weather = await fetch(
      'https://api.openweathermap.org/data/2.5/weather?q=Mumbai&appid=YOUR_PUBLIC_KEY'
  )
```

---

### Example 5 — What CORS Error Looks Like in Every Browser

```
CHROME:
  Console: Access to fetch at 'https://api.shopease.in/products' from 
           origin 'https://shopease.in' has been blocked by CORS policy: 
           No 'Access-Control-Allow-Origin' header is present on the 
           requested resource.

FIREFOX:
  Console: Cross-Origin Request Blocked: The Same Origin Policy disallows 
           reading the remote resource at https://api.shopease.in/products. 
           (Reason: CORS header 'Access-Control-Allow-Origin' missing).

SAFARI:
  Console: Origin https://shopease.in is not allowed by 
           Access-Control-Allow-Origin. Status code: 200

NOTE: Status code 200 in Safari error — the SERVER returned 200 OK
But the BROWSER still blocked JS from reading it. This confuses people.
The request succeeded. The response was blocked from JS. These are different things.

IN NETWORK TAB:
  The request shows (failed) or has a red X
  Status might show 200 (server responded fine) or CORS
  Click → Headers tab → look for missing Access-Control-Allow-Origin in Response Headers
```

---

### CORS Misconceptions — What People Get Wrong

```
MISCONCEPTION 1: "CORS is a server problem"
  
  REALITY: CORS is enforced by the BROWSER, not the server.
  
  curl http://api.shopease.in/products  ← works fine (no browser = no CORS)
  Postman: http://api.shopease.in/products  ← works fine (not a browser)
  Python requests: requests.get(...)  ← works fine (not a browser)
  
  Only BROWSERS enforce CORS. Server-to-server calls are never blocked by CORS.
  
  "But it works in Postman!" — YES, because Postman is not a browser.
  That doesn't mean your browser will work. You still need CORS headers.

────────────────────────────────────────────────────────────────────

MISCONCEPTION 2: "Setting CORS to * fixes everything"

  REALITY: * breaks when you need credentials (cookies):
  
  ❌ This combination NEVER works:
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Credentials: true
  
  Browser rejects this. Security rule: wildcard + credentials = forbidden.
  
  ✅ For credentials, must use exact origin:
  Access-Control-Allow-Origin: https://shopease.in
  Access-Control-Allow-Credentials: true

────────────────────────────────────────────────────────────────────

MISCONCEPTION 3: "CORS prevents the request from reaching the server"

  REALITY: For simple requests, the request DOES reach the server.
  CORS only blocks JavaScript from READING the response.
  
  If your POST creates a record in the DB:
    → DB record IS created (request reached server)
    → JS can't read the response (CORS blocked)
    
  This is why preflight exists for DELETE/PUT — 
  to check permission BEFORE the destructive action happens.

────────────────────────────────────────────────────────────────────

MISCONCEPTION 4: "My frontend and backend are on the same domain, no CORS needed"

  REALITY: Port counts as part of the origin.
  
  Frontend: http://localhost:3000
  Backend:  http://localhost:8080
  
  These ARE different origins even though domain is "localhost".
  You DO need CORS configured on :8080 to allow :3000.

────────────────────────────────────────────────────────────────────

MISCONCEPTION 5: "I can disable CORS with a Chrome extension"

  REALITY: Extensions like "CORS Unblock" turn off CORS in your browser.
  This is fine for development ONLY. Never ship code relying on this.
  Real users won't have this extension → your app breaks for them.
```

---

### The Full CORS Decision Flowchart

```
JS makes a fetch() call to a different origin
                    │
                    ▼
     Is it a "simple" request?
     (GET/POST + no custom headers + simple Content-Type)
                    │
          ┌─────────┴──────────┐
         YES                   NO
          │                    │
          ▼                    ▼
   Request sent           OPTIONS preflight sent first
   immediately                 │
          │              ┌─────┴─────┐
          │          200-299?      Error/403?
          │              │             │
          │        Actual request   REQUEST BLOCKED
          │        is sent          (JS gets CORS error)
          │              │
          └──────────────┘
                    │
                    ▼
         Server responds (any status)
                    │
                    ▼
    Does response have correct
    Access-Control-Allow-Origin?
                    │
          ┌─────────┴──────────┐
         YES                   NO
          │                    │
          ▼                    ▼
   JS gets the data      RESPONSE BLOCKED
   ✅ Success            (JS gets CORS error)
                         Even if status was 200
```

---

### When Do You Need CORS? Quick Decision Guide

```
SITUATION                                      NEED CORS?
────────────────────────────────────────────────────────────────────
Frontend & backend on same domain + port       ❌ No
Frontend :3000, Backend :8080 (localhost)      ✅ Yes (port differs)
Frontend shopease.in, Backend api.shopease.in  ✅ Yes (subdomain differs)
Server calling another server (Node→Node)      ❌ No (no browser involved)
curl / Postman call                            ❌ No (no browser involved)
Mobile app (native iOS/Android) calling API    ❌ No (browser rules don't apply)
React Native WebView calling API               ✅ Sometimes (depends on setup)
Chrome Extension calling external API          Special rules (complex)
```

---

### Fixing CORS on the Server

```javascript
// Express.js backend:
const cors = require('cors');

// Option 1: Allow specific origin
app.use(cors({
    origin: 'https://shopease.in',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true  // allow cookies to be sent
}));

// Option 2: Allow multiple origins
app.use(cors({
    origin: ['https://shopease.in', 'https://mobile.shopease.in', 'http://localhost:3000'],
    credentials: true
}));

// Option 3: Dynamic origin check
app.use(cors({
    origin: (origin, callback) => {
        const whitelist = ['https://shopease.in', 'https://m.shopease.in'];
        if (!origin || whitelist.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

// Option 4: Allow all origins (development only, never production)
app.use(cors({ origin: '*' }));
// WARNING: * doesn't work with credentials: true

// CORRECT MIDDLEWARE ORDER (CRITICAL):
app.use(cors(...))          // ← FIRST: CORS must run before auth
app.use(express.json())     // body parser
app.use(authMiddleware)     // ← AFTER: auth runs after CORS
```

### CORS with Credentials (Cookies)

```javascript
// When you need cookies sent cross-origin:

// FRONTEND:
fetch('https://api.shopease.in/cart', {
    credentials: 'include'  // ← MUST add this for cookies to be sent
})

// BACKEND must respond with:
// Access-Control-Allow-Origin: https://shopease.in  (exact, NOT *)
// Access-Control-Allow-Credentials: true

// WITHOUT credentials: 'include' → cookies are NOT sent
// DEFAULT: credentials: 'same-origin' → cookies only on same origin

// THREE credentials values:
// 'omit'         → never send cookies (even same origin)
// 'same-origin'  → send cookies only if same origin (DEFAULT)
// 'include'      → always send cookies (cross-origin needs server permission)
```

---

## 10. Browser Storage

**Four ways to store data in the browser. Each with different rules.**

### Cookies

```
WHAT: Small text data sent with EVERY request to the server.
SIZE: 4KB max per cookie
EXPIRES: Can be session (deleted when browser closes) or persistent (specific date)

HOW COOKIES ARE SET:
  Server sets cookie via response header:
  Set-Cookie: session=xyz789abc; HttpOnly; Secure; SameSite=Strict; Max-Age=86400
  
  Browser stores it.
  Browser sends it on EVERY request to that domain:
  Cookie: session=xyz789abc

COOKIE ATTRIBUTES:
  HttpOnly    → JavaScript CANNOT access this cookie (document.cookie)
               Only browser sends it. Prevents XSS cookie theft.
               USE THIS on session cookies always.
  
  Secure      → Cookie only sent over HTTPS (never HTTP)
               Prevents interception on unsecured networks.
               USE THIS on session cookies always.
  
  SameSite    → When to send cookie on cross-site requests
    Strict:   Never send on cross-site requests (most secure)
    Lax:      Send on GET cross-site (navigation), not POST
    None:     Always send (requires Secure attribute too)
  
  Max-Age     → How many seconds until cookie expires
    Max-Age=86400  → expires in 1 day (86400 seconds)
    Max-Age=0      → delete the cookie now
  
  Domain      → Which domains receive this cookie
    Domain=shopease.in → sent to shopease.in AND all subdomains
  
  Path        → Which paths get this cookie
    Path=/api → only sent on requests to /api/* paths

WHEN TO USE COOKIES:
  ✅ Authentication session tokens (use HttpOnly Secure)
  ✅ When server needs to READ the data from every request
  ✅ Persistent login ("remember me")
  ❌ Large data (4KB limit)
  ❌ Client-only data (use localStorage)
```

---

### First-Party vs Third-Party Cookies — The Complete Story

This is where cookies go from a technical concept to something that affects your real life every single day.

**The simplest definition:**

```
FIRST-PARTY COOKIE:
  Set by the website you are currently visiting.
  You visit nike.com → nike.com sets a cookie.
  That cookie is a FIRST-PARTY cookie.

THIRD-PARTY COOKIE:
  Set by a DIFFERENT website whose code is running ON the page you're visiting.
  You visit nike.com → Facebook's code runs on that page → Facebook sets a cookie.
  That Facebook cookie is a THIRD-PARTY cookie (you didn't visit Facebook).

KEY QUESTION: Who set the cookie?
  Same domain as address bar → first party
  Different domain           → third party
```

---

### The Shoe Ad Story — Exactly How It Happens

**This is the real story of how you look at Nike shoes and then see Nike ads on Instagram 20 minutes later.**

**The Characters:**
```
YOU:            Arjun, sitting at home, browsing on Chrome
NIKE.COM:       The shoe website you're visiting
META PIXEL:     A tiny tracking script from Facebook/Meta, embedded in nike.com
FACEBOOK:       Runs the ad network + owns Instagram
INSTAGRAM:      Where you see the shoe ad later
```

---

**PHASE 1 — Nike adds Facebook's tracker to their website**

Nike wants to show their ads to people who already showed interest in their shoes. So they sign up for Facebook's ad platform and paste this code into their website:

```html
<!-- This is inside nike.com's HTML — you can see it in DevTools Sources tab -->
<head>
  <script>
    // This is the Meta Pixel (Facebook tracking code)
    // Nike added this to their website to track visitors
    !function(f,b,e,v,n,t,s){
      // ... minified Facebook tracking code ...
    }(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
    
    fbq('init', '1234567890');   // Nike's unique Facebook advertiser ID
    fbq('track', 'PageView');    // "Someone viewed a page"
  </script>
</head>
```

This is a completely normal, legal business arrangement. Nike pays Facebook for ads, and this tracking code is how Facebook knows which users to target.

---

**PHASE 2 — You visit nike.com/shoes/air-max**

```
YOU type in browser: nike.com/shoes/air-max

YOUR BROWSER:
  Connects to nike.com → Downloads the HTML page

WHILE PARSING THAT HTML, browser finds:
  <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
  ↑ This is Facebook's script being loaded FROM Facebook's servers
  ↑ Your browser now makes a request TO Facebook

YOUR BROWSER → FACEBOOK'S SERVER:
  GET https://connect.facebook.net/en_US/fbevents.js
  Cookie: (any existing facebook.com cookies you have)
```

---

**PHASE 3 — Facebook's script runs on nike.com**

```
Facebook's fbevents.js script is now running inside nike.com.
It does several things:

1. READS your existing Facebook cookie (if you have one):
   document.cookie  →  "fbp=fb.1.1234567890.987654321"
                        ↑ your unique Facebook tracking ID

2. CALLS FACEBOOK with your data:
   GET https://www.facebook.com/tr/?
       id=1234567890          ← Nike's advertiser ID
       &ev=PageView           ← Event: you viewed a page
       &dl=https://nike.com/shoes/air-max  ← The exact URL you're on
       &rl=https://google.com ← Where you came from (referrer)
       &if=false
       &ts=1706432891234      ← Timestamp
       &fbp=fb.1.123.987      ← YOUR unique tracking ID
   
   This tiny GET request is called a "pixel" or "beacon"
   It's invisible — just 1x1 transparent image or empty response

3. IF YOU'VE NEVER BEEN TRACKED BEFORE:
   Facebook's response sets a new cookie:
   Set-Cookie: fbp=fb.1.1706432891.123456789; 
               Domain=.facebook.com; 
               Max-Age=7776000;   ← 90 days
               SameSite=None; 
               Secure
   
   This cookie is set on FACEBOOK.COM
   (even though you're on NIKE.COM)
   → This is a THIRD-PARTY COOKIE
```

---

**PHASE 4 — You browse more Nike products**

```
You click on several Nike shoes:
  nike.com/shoes/air-max-270    → Facebook gets notified: "ViewContent: Air Max 270"
  nike.com/shoes/air-force-1    → Facebook gets notified: "ViewContent: Air Force 1"
  nike.com/cart                 → Facebook: "AddToCart: Air Max 270, ₹8,499"
  nike.com/checkout             → Facebook: "InitiateCheckout"
  
You close the tab without buying. (Abandoned cart!)

FACEBOOK'S DATABASE NOW KNOWS (linked to YOUR tracking ID):
  User fbp=fb.1.123.987654:
    14:23 - Visited nike.com (India)
    14:24 - Viewed Air Max 270 (₹8,499)
    14:25 - Viewed Air Force 1 (₹7,999)
    14:26 - Added Air Max 270 to cart
    14:27 - Started checkout
    14:27 - LEFT without buying ← ABANDONED CART
    
  Profile: Interested in Nike shoes, budget ₹8,000-9,000,
           HIGH PURCHASE INTENT (added to cart!)
           TARGET WITH RETARGETING ADS
```

---

**PHASE 5 — 20 minutes later you open Instagram**

```
You open Instagram app on your phone.
Instagram loads your feed.

INSTAGRAM'S AD SERVER:
  "Show ads to Arjun. What do we know about him?"
  → Checks Facebook's user database
  → Finds: fbp=fb.1.123.987654 = Arjun's account
  → Sees: Visited nike.com, viewed Air Max 270, ADDED TO CART, didn't buy
  → Checks: Nike is an advertiser running retargeting campaigns
  → Decision: Show Nike Air Max 270 ad to Arjun with "Still interested?" copy

YOUR INSTAGRAM FEED:
  [Nike Ad]
  🏃 Nike Air Max 270
  "Left something behind?"
  ₹8,499 → Shop Now
  [Exact same shoe you looked at]

YOU: "How did Instagram know I was looking at this?? 😱"
```

---

**The complete flow in one diagram:**

```
YOU (Arjun's Browser)          NIKE.COM           FACEBOOK/META
        │                          │                     │
        │── GET nike.com/shoes ───►│                     │
        │◄── HTML with FB pixel ───│                     │
        │                          │                     │
        │── GET fbevents.js ───────────────────────────►│
        │◄── JS file + cookie ─────────────────────────│
        │   Set-Cookie: fbp=fb.1.123.987  ←────────────│
        │   (THIRD-PARTY cookie from facebook.com)      │
        │                                               │
        │── GET /tr/?id=Nike&ev=ViewContent ───────────►│
        │   (invisible 1px tracking pixel)              │
        │   (carries your fbp ID + what you viewed)     │
        │◄── 200 OK (empty) ───────────────────────────│
        │                                               │
        │   [You browse 3 more shoes]                   │
        │   [You add to cart]                           │
        │   [Each action sends pixel to Facebook]       │
        │                                               │
        │   [20 min later — you open Instagram]         │
        │                                               │
        │── GET instagram.com/feed ─────────────────────────────────┐
        │                                                           │
        │   Instagram's ad server:                                  │
        │   "User has fbp cookie: fb.1.123.987"                    │
        │   "Nike targeting: anyone who viewed Air Max"             │
        │   → Show Nike ad ────────────────────────────────────────┘
        │
        │◄── Feed with Nike Air Max ad
        │
      "HOW DID THEY KNOW??" 🤯
```

---

### How the Connection Is Made Across Devices

You might wonder: "I visited Nike on my laptop, but I saw the ad on my phone's Instagram app. How?"

```
METHOD 1 — Facebook Account (most common):
  You're logged into Facebook/Instagram on BOTH devices.
  Facebook links your laptop browser cookie → your Facebook account.
  Facebook links your phone app → same Facebook account.
  
  Laptop fbp cookie ──→ Facebook account (arjun@gmail.com)
  Phone Instagram app ──→ same Facebook account
  
  → Nike ad shows on phone even though you browsed on laptop ✅

METHOD 2 — Email Hashing:
  You signed up for Nike's newsletter (arjun@gmail.com).
  Nike uploads their email list to Facebook (hashed, not plain text).
  
  Nike says: "Show ads to these email addresses"
  Facebook matches: "We have arjun@gmail.com in our system → show them Nike ads"
  
  No cookie needed — email is the link.

METHOD 3 — Device Fingerprinting (no cookies needed):
  Your browser has unique characteristics:
  - Screen size: 1920×1080
  - Fonts installed: [list of 47 fonts]
  - GPU renderer: Intel Iris Graphics
  - Timezone: Asia/Kolkata
  - Browser plugins: [list]
  - Canvas fingerprint: [unique hash]
  
  Combined: creates a fingerprint that's 99.9% unique to YOU.
  Works across browsers, incognito mode, even after clearing cookies.
```

---

### Every Website You Visit Has Multiple Trackers

When you visit one shoe website, you're actually talking to 10-20 different companies:

```
YOU VISIT: myntra.com

ACTUALLY RUNNING ON THAT PAGE:
┌─────────────────────────────────────────────────────────────┐
│                        myntra.com                           │
│                                                             │
│  Third-party scripts loaded:                                │
│                                                             │
│  • connect.facebook.net    → Meta Pixel (Facebook/Instagram)│
│  • google-analytics.com    → Google Analytics (GA4)         │
│  • googletagmanager.com    → Google Tag Manager             │
│  • googlesyndication.com   → Google Ads tracking            │
│  • doubleclick.net         → Google's ad network            │
│  • amazon-adsystem.com     → Amazon ad network              │
│  • hotjar.com              → Session recording (watches you)│
│  • clevertap.com           → Push notification tracking     │
│  • branch.io               → Mobile deep linking tracking   │
│  • sentry.io               → Error tracking (dev tool)      │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Each one of these:
  → Downloads their JS onto your browser
  → Sets their own third-party cookie
  → Sends data back to their own servers
  → Knows you visited myntra.com

You can see ALL of these in DevTools → Network tab (filter by domain)
```

**See it yourself:**
```
1. Open Chrome DevTools (F12)
2. Go to Network tab
3. Visit myntra.com or flipkart.com
4. In the filter box, type "facebook" → see all requests to Facebook
5. Type "google" → see all Google tracking requests
6. Click on any request → Headers → see the cookies being set
```

---

### First-Party Cookies — Legitimate Website Functions

Not all cookies are tracking. Most cookies serve essential purposes for the website itself:

```
YOU VISIT: shopease.in

FIRST-PARTY COOKIES SET BY shopease.in:
───────────────────────────────────────────────────────────────────

1. SESSION COOKIE (login):
   Name:     session_id
   Value:    xyz789abc123
   Domain:   .shopease.in
   HttpOnly: YES (JS can't read it)
   Secure:   YES (HTTPS only)
   MaxAge:   86400 (1 day)
   
   PURPOSE: Keeps you logged in.
   When you refresh the page, server reads this cookie
   → knows who you are → shows your name, cart, orders.
   
   WITHOUT THIS: You'd have to log in on every single page load. 😤

2. CART COOKIE:
   Name:  cart_session
   Value: cart_uuid_abc123
   Domain: .shopease.in
   MaxAge: 604800 (7 days)
   
   PURPOSE: Your cart survives browser close.
   Even if you're not logged in, your cart is saved.

3. PREFERENCE COOKIE:
   Name:  user_prefs
   Value: currency=INR&lang=en&theme=dark
   Domain: .shopease.in
   MaxAge: 31536000 (1 year)
   
   PURPOSE: Remember your settings across visits.
   Dark mode stays on. INR prices stay selected.

4. CSRF TOKEN:
   Name:  csrf_token
   Value: random_unguessable_string_xyz
   Domain: .shopease.in
   SameSite: Strict
   
   PURPOSE: Security. Prevents cross-site form submission attacks.
   Server verifies this token on every POST request.
   If token missing → reject request.

5. A/B TEST COOKIE:
   Name:  experiment_group
   Value: variant_B
   Domain: .shopease.in
   MaxAge: 86400
   
   PURPOSE: You're in "Group B" of a test.
   They're testing if blue buttons get more clicks than orange.
   Cookie ensures you always see the same version (consistency).
```

---

### Third-Party Cookies — Tracking Across Websites

```
YOU VISIT: shopease.in
(shopease.in has Facebook Pixel, Google Analytics, and Google Ads)

THIRD-PARTY COOKIES SET BY OTHER COMPANIES:
───────────────────────────────────────────────────────────────────

From FACEBOOK (facebook.com):
  Name:   _fbp
  Value:  fb.1.1706432891234.987654321
  Domain: .facebook.com      ← facebook's domain, NOT shopease.in
  MaxAge: 7776000 (90 days)
  
  This is stored as a THIRD-PARTY cookie because Domain=.facebook.com
  but it was set while you were on shopease.in.

From GOOGLE ANALYTICS (google.com):
  Name:   _ga
  Value:  GA1.2.123456789.1706432891
  Domain: .google.com
  MaxAge: 63072000 (2 years)
  
  Name:   _gid
  Value:  GA1.2.987654321.1706432891
  Domain: .google.com
  MaxAge: 86400 (1 day — daily session identifier)

From GOOGLE ADS (doubleclick.net):
  Name:   IDE
  Value:  AHWqTUm_random_string
  Domain: .doubleclick.net
  MaxAge: 63072000 (2 years)
  
  This is what lets Google show you ads on YouTube and other sites.

HOW THEY LINK ACROSS WEBSITES:
  shopease.in → your _fbp cookie = fb.1.123.987654321
  amazon.in   → your _fbp cookie = fb.1.123.987654321  ← SAME!
  myntra.com  → your _fbp cookie = fb.1.123.987654321  ← SAME!
  
  Facebook reads the SAME cookie on every website that has Meta Pixel.
  This is how they build a complete profile of everywhere you've been.
```

---

### The Retargeting Pixel — What It Looks Like in DevTools

When you visit a website with tracking, here's what you actually see in the Network tab:

```
YOU VISIT: nike.com/shoes/air-max-270

NETWORK TAB shows:
Name                              Type    Size   Initiator
──────────────────────────────────────────────────────────
air-max-270                       document  45KB  (navigation)
styles.css                        stylesheet 12KB  parser
main.js                           script   89KB  parser
air-max-270-hero.jpg              image   840KB  parser

← THESE ARE THIRD-PARTY TRACKING REQUESTS:

tr/?id=12345&ev=PageView&...      image    0B    main.js:247
                                  ↑ Facebook pixel (1x1 transparent image)
                                    Carries: your fbp ID, page URL, event type

collect?v=2&tid=G-ABC123&...      fetch    0B    gtag.js:89
                                  ↑ Google Analytics beacon
                                    Carries: your _ga ID, page, referrer

bat.bing.com/bat.js               script    2KB  main.js:312
                                  ↑ Microsoft Bing Ads pixel

ct.pinterest.com/v3/?tid=...      image    0B    main.js:456
                                  ↑ Pinterest tracking pixel

CLICK ON THE FACEBOOK PIXEL REQUEST (tr/?...):
  URL: https://www.facebook.com/tr/
  Method: GET
  Query parameters:
    id=12345678901234     ← Nike's FB advertiser account ID
    ev=PageView           ← Event name
    dl=https%3A%2F%2Fnike.com%2Fshoes%2Fair-max-270  ← Page URL (encoded)
    rl=https%3A%2F%2Fgoogle.com  ← Where you came from
    ts=1706432891234      ← Timestamp
    fbp=fb.1.170.987654   ← YOUR unique tracking ID
    
  Response Headers:
    Set-Cookie: _fbp=fb.1.1706432891234.987654321; 
                Domain=.facebook.com; MaxAge=7776000
    
  → Facebook has now logged this visit against your ID.
```

---

### Remarketing vs Retargeting — Two Types of Ads You See

```
SCENARIO: You searched "Nike Air Max" on Google, visited nike.com,
          added to cart, left without buying.

TYPE 1 — RETARGETING (most common):
  What: Show ads to people who visited your website
  How:  Meta/Google Pixel tracks visitors → creates "Custom Audience"
  
  Ads you see:
    Instagram: "You forgot something!" [shoe image] → Buy Now
    YouTube ad: Nike Air Max video (before YouTube videos)
    Google Display: Nike banner on news websites
  
  Time window: Typically 7-30 days after your visit
  Budget: Nike pays Facebook/Google per click or per impression

TYPE 2 — LOOKALIKE AUDIENCE:
  What: Show ads to people SIMILAR to your existing customers
  How:  Facebook takes your buyer list → finds 1 million people with similar behavior
  
  Example:
    Nike uploads: "Our last 100,000 buyers" (email list, hashed)
    Facebook: "These people are 25-35 male, gym-goers, urban India"
    Facebook: "Find 1 million more people like this" → shows them Nike ads
  
  Result: You see Nike ads even though you've NEVER visited nike.com
  → "How did Facebook know I might like Nike?" (you fit the pattern)

TYPE 3 — INTEREST-BASED:
  What: Target people who are "interested in running shoes"
  How:  Facebook analyzes ALL your behavior across Facebook/Instagram
        + every website with Meta Pixel
  
  Facebook knows you're interested in:
    - Fitness (you liked gym posts)
    - Running (you follow running pages)
    - Nike specifically (you visited nike.com)
  
  → Nike buys ads targeting "Running shoes interest" segment
  → Your profile matches → you see the ad
```

---

### The Cookie Consent Banner — Why It Exists

You've seen these on every website:

```
┌─────────────────────────────────────────────────────────────┐
│  🍪 We use cookies                                          │
│                                                             │
│  We and our partners use cookies to personalize your        │
│  experience, serve ads, and analyze our traffic.            │
│                                                             │
│  [Accept All]  [Manage Preferences]  [Reject All]           │
└─────────────────────────────────────────────────────────────┘
```

**Why this exists:**

```
GDPR (Europe, 2018):
  EU law requires explicit consent before setting non-essential cookies.
  Non-essential = tracking, advertising, analytics cookies.
  Essential = session cookies for login, cart → no consent needed.
  
  Penalty for violation: Up to 4% of global annual revenue.
  → Google fined €150 million in France.
  → Meta fined €1.2 billion in Ireland.

SIMILAR LAWS:
  India: DPDP Act (2023) — similar consent requirements
  California: CCPA — "Do Not Sell My Personal Information"
  Brazil: LGPD

WHAT HAPPENS WHEN YOU CLICK:
  "Accept All":
    → All third-party cookies allowed
    → Facebook/Google/etc. can track you
    → Website loads all tracking scripts
    → You get targeted ads

  "Reject All":
    → Only essential cookies set (session, cart)
    → No Facebook Pixel fires
    → No retargeting ads
    → Analytics still works (anonymized)
    → Website still works fully

  "Manage Preferences":
    → Choose which categories:
      ✅ Necessary (required, can't reject)
      ⬜ Analytics (Google Analytics)
      ⬜ Marketing (Facebook Pixel, Google Ads)
      ⬜ Personalization (Remember preferences)
```

**The dark pattern (what many websites do):**

```
BAD UI (designed to trick you into accepting):
  [Accept All]  ← big, green, prominent button
  
  [Manage Settings] ← small, grey, hard to find
                       clicking this opens confusing menu with 150 toggles
                       all pre-checked ← you have to un-check each one

HONEST UI (rare):
  [Accept All]  [Reject All]  ← equal prominence
  
  Or just no banner if they don't use tracking cookies.
```

---

### The Death of Third-Party Cookies

**Third-party cookies are being killed off by all major browsers.**

```
TIMELINE:
  Safari (Apple):    Blocked third-party cookies since 2017 (ITP)
  Firefox (Mozilla): Blocked third-party cookies since 2019
  Chrome (Google):   Announced death in 2020... delayed to 2024... then backed off.
                     As of 2025: Chrome still allows them but plans to phase out.
                     (Google makes most of its money from ads — conflict of interest)

WHY THEY'RE BEING KILLED:
  Privacy: Users don't know they're being tracked across websites
  Security: Third-party cookies can be used in CSRF attacks
  User control: People can't meaningfully opt out

WHAT ADVERTISERS ARE DOING INSTEAD:
  1. FIRST-PARTY DATA STRATEGY:
     "We'll collect data directly from our own users"
     Nike: "Sign up for Nike+ membership" → get direct user data
     → You voluntarily share data → no tracking cookie needed

  2. SERVER-SIDE TRACKING:
     Move tracking from browser to server.
     Instead of Facebook Pixel in browser:
     → Nike's server calls Facebook Conversion API directly
     → Harder for browsers to block
     → Less visible to users

  3. GOOGLE'S PRIVACY SANDBOX (Topics API):
     Browser itself categorizes your interests.
     Google calls these "Topics": "Fitness", "Footwear", "Running"
     Advertisers ask browser: "What topics is this user interested in?"
     Browser shares only broad categories, not your browsing history.
     → Less precise than cookie tracking, more privacy-preserving.

  4. ID GRAPHS:
     Match users across devices using email addresses (hashed).
     When you log into Nike with email → Nike links your identity.
     No cookie needed.

  5. CONTEXTUAL ADVERTISING:
     Show shoe ads on running blogs → not based on YOU, based on context.
     Pre-cookie era approach. Privacy-friendly. Less targeted.
```

---

### How to See and Delete Your Tracking Cookies

**In Chrome DevTools:**

```
Application tab → Cookies → select a domain

You'll see:
Name          Value                          Domain          Expires
_fbp          fb.1.1706432891234.987654321   .facebook.com   Mar 2025
_ga           GA1.2.123456789.1706432891     .google.com     2026
IDE           AHWqTUmRandomString            .doubleclick.net 2026
session_id    xyz789abc123                   .shopease.in    Tomorrow  ← first-party

Right-click → Delete → cookie removed.
Next visit to Facebook: they assign you a new _fbp ID.
Your old profile is still there. You just get a fresh ID.
```

**In Chrome Settings:**
```
Settings → Privacy and security → Cookies and other site data
  → See all cookies: lists every domain and their cookies
  → Delete all cookies: clears everything (logs you out of all sites)
  → Block third-party cookies: stops tracking (may break some embeds)

Settings → Privacy and security → Ad privacy
  → See your Topics (what Google thinks you're interested in)
  → Manage what categories are shared with advertisers
```

**Incognito Mode — What It Actually Does (and Doesn't Do):**

```
INCOGNITO DOES:
  ✅ Start fresh — no existing cookies carried over
  ✅ Not save NEW cookies after window closes
  ✅ Not save browsing history
  ✅ Not save form data

INCOGNITO DOES NOT:
  ❌ Hide your IP address from websites
  ❌ Stop websites from fingerprinting you
  ❌ Prevent your ISP from seeing sites you visit
  ❌ Make you anonymous to Facebook/Google during the session
     (Tracking pixels still fire, IP still visible)

So if you browse Nike in incognito:
  → Nike still sees your IP (knows roughly where you are)
  → Facebook Pixel still fires with your IP
  → You get a fresh _fbp ID (not linked to your old profile)
  → After closing incognito → cookies gone
  → Next regular session: fresh start, but they'll build a new profile
  
  "Incognito" = private from other people using your computer
  NOT private from websites and ad networks
```

---

### Cookie Attributes — Full Reference

```
ATTRIBUTE    VALUES              WHAT IT DOES
────────────────────────────────────────────────────────────────────
Name         any string          The cookie's identifier
             session_id          Key in the key-value pair

Value        any string          The data stored
             xyz789abc           Value in the key-value pair

Domain       .shopease.in        Which domain(s) receive this cookie
             shopease.in         .shopease.in = shopease.in + all subdomains
                                 shopease.in  = shopease.in only

Path         /                   Which URL paths send this cookie
             /api                /  = all paths
                                 /api = only requests to /api/*

Max-Age      seconds (number)    When cookie expires (counted from now)
             86400               86400 = 24 hours
             0                   0 = delete immediately
             (not set)           Session cookie — deleted when browser closes

Expires      date string         Alternative to Max-Age
             Thu, 01 Jan 2026    Absolute date (less reliable — uses client clock)

Secure       (flag, no value)    Only sent over HTTPS connections
                                 Prevents interception on public WiFi

HttpOnly     (flag, no value)    JavaScript cannot access via document.cookie
                                 Prevents XSS theft of session cookies

SameSite     Strict              Controls cross-site sending:
             Lax                 Strict = never sent cross-site
             None                Lax = sent on top-level navigation GET
                                 None = always sent (needs Secure too)
                                 (None = required for third-party cookies)

Priority     High                Chrome-specific hint
             Medium              How important to keep when storage is low
             Low
```

**SameSite explained simply:**

```
SAMESITE=STRICT:
  You're on facebook.com.
  You click a link to shopease.in.
  
  Browser does NOT send shopease.in cookies on that first navigation.
  Once you're ON shopease.in → cookies are sent normally.
  
  Use: High-security apps, banking. Breaks some OAuth flows.

SAMESITE=LAX (Chrome default since 2020):
  You're on facebook.com.
  You click a link to shopease.in.
  
  Browser DOES send shopease.in cookies on that GET navigation.
  But NOT on cross-site POST requests (iframe forms, etc.)
  
  Use: Most websites. Good balance of security and usability.

SAMESITE=NONE (required for third-party cookies):
  Cookie is sent on ALL cross-site requests.
  MUST also have Secure attribute.
  
  Use: Third-party services (payment widgets, embedded maps, tracking pixels)
  If your embedding widget stops working after Chrome update:
  → You probably need to add SameSite=None; Secure to your cookie.
```

---

### WHEN TO USE COOKIES:

```
USE COOKIES FOR:
  ✅ Session tokens (login) — set HttpOnly Secure SameSite=Lax
  ✅ "Remember me" — long Max-Age, HttpOnly Secure
  ✅ CSRF protection tokens — SameSite=Strict
  ✅ Language/currency preference that server needs to know
  ✅ A/B test assignments (server-side tests)
  ❌ Large amounts of data (4KB limit — use localStorage)
  ❌ Client-only UI state (use localStorage — faster, no network overhead)
  ❌ Sensitive data you don't want JS to read (use HttpOnly)
```

### localStorage

```
WHAT: Permanent storage in the browser. Survives page closes and restarts.
SIZE: 5-10MB per origin
EXPIRES: Never (until manually cleared or user clears browser data)
SCOPE: Same origin only (different site can't read it)
SERVER: Never sent to server automatically (unlike cookies)

// JavaScript API:
localStorage.setItem('theme', 'dark')
localStorage.setItem('user', JSON.stringify({ id: 12345, name: 'Arjun' }))

const theme = localStorage.getItem('theme')  // 'dark'
const user = JSON.parse(localStorage.getItem('user'))  // { id: 12345, name: 'Arjun' }

localStorage.removeItem('theme')
localStorage.clear()  // remove everything

WHEN TO USE localStorage:
  ✅ User preferences (dark mode, language, font size)
  ✅ Cached API responses (product data for quick display)
  ✅ Feature flags
  ✅ Shopping cart (if not using server-side cart)
  ❌ Sensitive data like auth tokens (readable by JS = XSS risk)
  ❌ Data that should sync to server (it's client-only)

SHOPEASE uses localStorage for:
  'theme': 'dark'
  'recent_searches': '["iphone", "samsung", "laptop"]'
  'currency_preference': 'INR'
```

### sessionStorage

```
WHAT: Same as localStorage but deleted when the TAB closes.
SIZE: 5-10MB
EXPIRES: When the browser tab/window closes
SCOPE: Same origin AND same tab (different tab = different storage)

// API is identical to localStorage:
sessionStorage.setItem('checkout_step', '2')
sessionStorage.setItem('form_data', JSON.stringify(formValues))

const step = sessionStorage.getItem('checkout_step')

WHEN TO USE sessionStorage:
  ✅ Form data in multi-step forms (don't lose if user refreshes)
  ✅ Temporary UI state for current session
  ✅ Data that should NOT persist after tab closes
  ✅ Shopping session data (cart items user was browsing)

SHOPEASE uses sessionStorage for:
  'checkout_step': '2'        → resume checkout on refresh
  'payment_intent': 'pi_abc'  → current payment session
  'scroll_position': '1234'   → restore scroll on back button
```

### Comparison Table

```
FEATURE          COOKIES              localStorage         sessionStorage
────────────────────────────────────────────────────────────────────────
Size limit       4KB                  5-10MB               5-10MB
Expires          Can be set           Never                Tab closes
Sent to server   YES (automatically)  No                   No
JS accessible    If NOT HttpOnly      Yes                  Yes
Scope            Domain + Path        Origin               Origin + Tab
Security risk    CSRF                 XSS                  XSS
Use for          Auth sessions        Preferences, cache   Temp UI state
```

### IndexedDB

```
WHAT: A full database inside the browser. Stores structured data.
SIZE: Hundreds of MB to GBs
EXPIRES: Never (persistent like localStorage)
SCOPE: Same origin

// Used for:
  ✅ Offline-capable web apps (service workers)
  ✅ Storing large amounts of structured data
  ✅ Caching entire API responses for offline use

// API is complex (callback-based), use a library like Dexie.js:
const db = new Dexie('shopease');
db.version(1).stores({ products: '++id, name, category, price' });

await db.products.add({ name: 'iPhone 15', category: 'phones', price: 79999 });
const phones = await db.products.where('category').equals('phones').toArray();
```

---

## 11. Caching

**Why the second visit is always faster — and how browsers decide what to store.**

### The Cache Flow

```
FIRST VISIT to shopease.in/products:
  Browser: "Do I have a cached copy?" → No
  → Makes network request → downloads response
  → Stores in cache with Cache-Control rules
  → Shows page (240ms total)

SECOND VISIT (next minute):
  Browser: "Do I have a cached copy?" → Yes!
  → Is it still valid? (check Cache-Control max-age) → Yes!
  → Serve from cache INSTANTLY → 0ms
  → Shows page (< 5ms total)

SECOND VISIT (next day):
  Browser: "Do I have a cached copy?" → Yes
  → Is it still valid? → No, max-age expired
  → Send request WITH ETag: "If-None-Match: abc123"
  → Server: "Nothing changed" → 304 Not Modified (no body)
  → Browser serves from cache (just validated it's fresh)
  → Shows page (50ms, only headers downloaded)
```

### Cache-Control Header — The Rules

```
max-age=N
  Cache this for N seconds from now.
  max-age=0       → Don't use cache (always revalidate)
  max-age=60      → Cache for 1 minute
  max-age=3600    → Cache for 1 hour
  max-age=86400   → Cache for 1 day
  max-age=31536000 → Cache for 1 year (use for versioned files)

no-cache
  "Cache it, but ALWAYS ask the server if it's still valid before using."
  Not "don't cache" — name is misleading!
  Browser sends If-None-Match → server says 304 → use cache → fast
  (vs no-store which really means don't cache)

no-store
  "Never cache this anywhere, ever."
  Used for: banking pages, checkout pages, sensitive data
  Every request downloads fresh from server.

public
  "CDNs and proxy caches can cache this too (not just the browser)."
  Use for: images, CSS, JS, anything the same for all users

private
  "Only the user's browser can cache this, not CDNs."
  Use for: personalized pages, user-specific API responses
  Cache-Control: private, max-age=600  → browser caches, CDN doesn't

must-revalidate
  "When the cache expires, MUST check with server (don't serve stale)."
  Even if server is slow/down — don't serve expired cache.

stale-while-revalidate=N
  "Serve stale content while fetching a fresh version in background."
  User sees instant response (from cache), fresh version ready next visit.
  stale-while-revalidate=60 → serve cache for 60 extra seconds while updating
```

### ShopEase Caching Strategy

```
RESOURCE                CACHE-CONTROL                       WHY
────────────────────────────────────────────────────────────────────────────
main.js (v2.1.0)        max-age=31536000, immutable         Filename has version,
                                                             safe to cache forever

styles.css (hash)       max-age=31536000, immutable         Same, hash in filename

product images          max-age=604800 (7 days), public     Images rarely change
                                                             CDN can cache

hero-banner.jpg         max-age=86400 (1 day), public       Changed weekly

/api/products?featured  max-age=60, public                  Featured products
                        stale-while-revalidate=30            change hourly

/api/cart               no-store                            Always fresh (cart changes)

/api/orders             no-cache, private                   User-specific, revalidate

/checkout               no-store                            Never cache payment pages

/admin/*                no-store                            Never cache admin
```

### ETag — Version Fingerprint

```
SERVER RESPONSE (first request):
  HTTP/1.1 200 OK
  ETag: "33a64df551425fcc55e4d42a148795d9f25f89d"  ← MD5/hash of content
  Cache-Control: max-age=300
  [product list body]

BROWSER STORES: {url: '/api/products', etag: '33a64...', body: [...]}

NEXT REQUEST (after 300s expire):
  GET /api/products
  If-None-Match: "33a64df551425fcc55e4d42a148795d9f25f89d"

SERVER:
  IF product list unchanged → 304 Not Modified (no body, fast)
  IF product list changed → 200 OK with new ETag and new body

RESULT:
  Unchanged: Only headers downloaded → fast, saves bandwidth
  Changed: Full response → user gets fresh data
```

---

## 12. WebSockets

**For real-time communication where the server needs to push data to the browser.**

```
HTTP (normal):
  Browser → Server:  "GET /price"
  Server  → Browser: "₹79,999"
  Connection closed.
  
  Browser → Server:  "GET /price"  (every 2 seconds to check updates)
  Server  → Browser: "₹79,999"
  → POLLING: Inefficient, wasteful, adds server load

WEBSOCKET:
  Browser → Server:  "Let's open a WebSocket connection"
  [Connection stays open — PERSISTENT]
  Server  → Browser: "₹79,999"  (whenever price changes)
  Server  → Browser: "₹78,500"  (price dropped)
  Server  → Browser: "₹80,000"  (price went up)
  Browser → Server:  "Subscribe to iPhone 15 price alerts"
  [Connection stays open indefinitely]
  
  → REAL-TIME: Server pushes instantly when data changes
```

### WebSocket Code

```javascript
// BROWSER (client):
const ws = new WebSocket('wss://shopease.in/ws');  // wss = WebSocket Secure (HTTPS equivalent)

ws.onopen = () => {
    console.log('Connected!');
    // Subscribe to specific products
    ws.send(JSON.stringify({ type: 'subscribe', products: ['prod-789', 'prod-234'] }));
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'price_update') {
        updatePrice(data.product_id, data.new_price);
        // "iPhone 15 dropped to ₹78,500!"
    }
    
    if (data.type === 'stock_update') {
        updateStock(data.product_id, data.quantity);
        // "Only 3 left!"
    }
};

ws.onerror = (error) => console.error('WebSocket error:', error);
ws.onclose = () => {
    console.log('Disconnected. Reconnecting in 3s...');
    setTimeout(() => reconnect(), 3000);
};

// IN DEVTOOLS NETWORK TAB:
// WebSocket shows as one entry with status 101 (Switching Protocols)
// Click it → "Messages" tab shows all data sent/received in real-time
```

### WebSocket in DevTools

```
IN NETWORK TAB:
  Name: ws (or the URL)
  Type: websocket
  Status: 101 Switching Protocols

CLICK ON IT → "Messages" tab:
  ↑ means SENT (browser → server)
  ↓ means RECEIVED (server → browser)
  
  ↑ {"type":"subscribe","products":["prod-789"]}
  ↓ {"type":"price_update","product_id":"prod-789","new_price":78500}
  ↓ {"type":"stock_update","product_id":"prod-789","quantity":3}
  ↑ {"type":"ping"}
  ↓ {"type":"pong"}
```

### WebSocket vs HTTP Polling vs Server-Sent Events

```
TECHNIQUE           HOW IT WORKS                USE WHEN
────────────────────────────────────────────────────────────────────
Short Polling       JS calls fetch() every N sec Low-frequency updates
                    even if no new data           OK for non-critical
                    Wasteful, adds server load    e.g., check order status

Long Polling        Browser sends request,        Medium frequency
                    server holds it open          Browser-to-server needed
                    until data is available,      Simpler than WS
                    then browser sends new one    

Server-Sent Events  One-way: server → browser    Server pushes only
(SSE)               Browser stays subscribed      Dashboard, live feeds,
                    HTTP/1.1, auto-reconnects     notifications

WebSocket           Two-way: full duplex          Real-time chat, gaming,
                    Both sides can send anytime   live collaboration,
                    Custom protocol over HTTP     trading, live sport scores
```

---

## 13. Performance Timing

**The numbers that tell you how fast (or slow) your site is.**

### Timing Breakdown (from Timing tab in DevTools)

```
TOTAL REQUEST TIME BREAKDOWN:
────────────────────────────────────────────────────────────────────
Queueing          10ms   Browser couldn't start this request yet
                         Reasons: waiting for higher-priority requests,
                         or HTTP/1.1 limit of 6 connections per origin

Stalled           2ms    Waiting for connection to be available

DNS Lookup        0ms    Usually 0ms after first request (cached)
                         First request: 20-120ms

Initial           45ms   TCP 3-way handshake
connection               Determined by physical distance to server

SSL               38ms   TLS negotiation (HTTPS only)
                         Only on new connections (reused on HTTP/2)

Request sent      0.5ms  Tiny — just sending HTTP request headers

Waiting (TTFB)    180ms  ← THIS IS YOUR SERVER SPEED
                         Time from request sent to FIRST byte of response
                         Includes: server processing, DB queries, etc.
                         Good: < 200ms | Bad: > 600ms

Content download  45ms   Downloading the response body
                         Determined by: file size + network speed
────────────────────────────────────────────────────────────────────
TOTAL:            ~320ms

DIAGNOSIS:
  Slow DNS?        → Use a faster DNS provider (Cloudflare 1.1.1.1)
  Slow connection? → Server is far from user → use CDN
  Slow SSL?        → Normal for first connection, HTTP/2 reuses it
  Slow TTFB?       → Server is slow → optimize DB queries, add caching
  Slow download?   → Response is large → gzip compression, paginate data
```

### Page Load Events

```
LOADING TIMELINE:
────────────────────────────────────────────────────────────────────
0ms          Navigation starts (user clicks link or types URL)

~240ms       HTML downloaded (Document request complete)
             Browser starts parsing HTML

~250ms       Browser finds <link rel="stylesheet" href="styles.css">
             → Starts downloading CSS (render-blocking!)

~280ms       Browser finds <script src="main.js">
             → Stops parsing HTML → downloads JS → executes → resumes

~400ms       DOMContentLoaded event fires
             → HTML is fully parsed, DOM is built
             → CSS and synchronous JS are done
             → document.addEventListener('DOMContentLoaded', ...)
             → Page structure exists but images/fonts may not be loaded

~600ms       load event fires
             → EVERYTHING is loaded (images, fonts, all resources)
             → window.addEventListener('load', ...)

~800ms       FCP — First Contentful Paint
             → User SEES first text or image on screen
             → "Something is happening!"

~1,200ms     LCP — Largest Contentful Paint
             → Largest image or text block is visible
             → Measured by Google for Core Web Vitals
             → Good: < 2.5s

~1,400ms     TTI — Time to Interactive
             → Page is fully interactive (JS loaded, event listeners attached)
             → User can click buttons and they work
             → Good: < 3.8s
```

### Core Web Vitals (What Google Measures)

```
METRIC          MEASURES                        GOOD        BAD
────────────────────────────────────────────────────────────────────
LCP             Loading performance              < 2.5s      > 4.0s
(Largest        When main content loads
 Contentful     (hero image, heading)
 Paint)

FID             Interactivity                   < 100ms     > 300ms
(First Input    Delay from first click to
 Delay)         browser responding
                (Replaced by INP in 2024)

INP             Overall responsiveness          < 200ms     > 500ms
(Interaction    Worst-case interaction
 to Next Paint) latency throughout session

CLS             Visual stability                < 0.1       > 0.25
(Cumulative     How much content shifts
 Layout Shift)  unexpectedly (images loading
                without dimensions cause this)

WHY THESE MATTER:
  Google uses Core Web Vitals as a ranking factor.
  Poor LCP → lower Google ranking → less traffic → less revenue.
  ShopEase: every 100ms improvement in LCP = ~1% more conversions.
```

### Performance API (Measure in JavaScript)

```javascript
// See timing data from JavaScript:
const perf = performance.getEntriesByType('navigation')[0];

console.log({
    dns:          perf.domainLookupEnd - perf.domainLookupStart,
    tcp:          perf.connectEnd - perf.connectStart,
    ttfb:         perf.responseStart - perf.requestStart,
    domParsed:    perf.domContentLoadedEventEnd - perf.navigationStart,
    fullLoad:     perf.loadEventEnd - perf.navigationStart
});

// See timing for a specific fetch:
const entries = performance.getEntriesByName('https://shopease.in/api/products');
console.log(entries[0].duration);  // how long the fetch took

// Measure your own code:
performance.mark('cart-render-start');
renderCart(cartData);
performance.mark('cart-render-end');
performance.measure('cart-render', 'cart-render-start', 'cart-render-end');
const [measure] = performance.getEntriesByName('cart-render');
console.log(`Cart render took: ${measure.duration}ms`);
```

---

## 14. HTTP Versions

**The protocol underneath every request — newer versions are dramatically faster.**

### HTTP/1.1 (1997)

```
PROBLEMS:
  Head-of-line blocking: requests queue up — one slow request blocks all others
  One request at a time per connection
  Browsers open 6 connections per domain to work around this (hacky)

HTTP/1.1 LOADING 10 FILES:
  Connection 1: file1.js ──────── file7.css ─────
  Connection 2: file2.js ──── file8.png ─────────
  Connection 3: file3.css ───── file9.jpg ───────
  Connection 4: file4.png ──── file10.woff ──────
  Connection 5: file5.jpg ─────
  Connection 6: file6.woff ────
  
  Max 6 things at once. Files 7-10 wait in queue.
```

### HTTP/2 (2015)

```
IMPROVEMENTS:
  Multiplexing: Multiple requests over ONE connection simultaneously
  Header compression (HPACK): Headers sent in binary, compressed
  Server push: Server can proactively send resources
  Binary protocol: Faster to parse than text

HTTP/2 LOADING 10 FILES (one connection):
  Connection 1: file1.js ═══ file2.js ═══ file3.css ═══ file4.png ... (all at once)
  
  All 10 files download simultaneously over 1 connection.
  No queue. No 6-connection limit hack.

IN DEVTOOLS:
  Protocol column shows "h2" for HTTP/2
  All requests use same connection → waterfall shows parallel loading

SHOPEASE impact: Page load improved 40% by switching from HTTP/1.1 to HTTP/2
```

### HTTP/3 (2022)

```
IMPROVEMENTS OVER HTTP/2:
  Uses QUIC (UDP-based) instead of TCP
  No head-of-line blocking even at transport layer
  0-RTT connection resumption (no handshake on returning visits)
  Better performance on lossy networks (mobile, bad WiFi)

IN DEVTOOLS:
  Protocol shows "h3" for HTTP/3

HTTP/3 IN PRACTICE:
  Mobile users on 4G with packet loss → HTTP/3 is noticeably faster
  Stable desktop connections → improvement is smaller

ShopEase uses CloudFront which automatically uses HTTP/3 where supported.
```

---

## 15. Full DevTools Walkthrough

**Open shopease.in in Chrome. Here's what you're actually seeing.**

### Network Tab Tour

```
TOOLBAR:
  🔴 Record button (red = recording, click to stop)
  🚫 Clear button
  📷 Screenshot on each request (for visual debugging)
  Filter bar: "Fetch/XHR" selected → shows only API calls
  Search box: type "products" → filters to product requests
  ⚙️ Settings: throttle network speed (simulate 3G)

NETWORK CONDITIONS:
  Right-click → "Network conditions"
  → Simulate Slow 3G (upload: 750kb/s, download: 750kb/s, latency: 300ms)
  → See how ShopEase behaves on a slow mobile network
  → Find bottlenecks affecting real users

PRESERVE LOG:
  Check this to keep logs across page navigations
  Without it: logs clear on every page reload

DISABLE CACHE:
  Check this to ignore cached resources
  Every request hits the server fresh
  Use when testing "first time user" experience
```

### Simulating Specific Scenarios

```
SCENARIO 1: Find the slowest API call
  Filter: Fetch/XHR
  Sort by: Time column (click header)
  → API calls sorted by slowness → fix the top offenders

SCENARIO 2: Find what's making the page large
  Filter: All
  Sort by: Size column
  → Find largest resources → compress images, code-split JS

SCENARIO 3: Debug CORS error
  Filter: All
  Look for: Red requests with "CORS" in DevTools console
  Click the OPTIONS request → Headers tab
  Check: Is Access-Control-Allow-Origin in response headers?
  If missing: Fix server CORS config

SCENARIO 4: Why is my session lost?
  Open: Application tab (not Network) → Cookies
  Check: Is session cookie there?
  Check: HttpOnly? Secure? Domain? Path?
  If missing after login: backend isn't setting Set-Cookie correctly

SCENARIO 5: Test API without frontend
  Right-click any request → "Copy as cURL"
  Paste in terminal → modify → run
  Great for testing API changes without rebuilding frontend

SCENARIO 6: See what JS is doing
  Filter: Fetch/XHR  
  Initiator column → shows which JS file and line number made this call
  Click the filename:line → jumps to exact code in Sources tab

SCENARIO 7: Measure real-world performance
  DevTools → Performance tab → Record while loading page
  → See flame graph of everything: HTML parse, JS execute, paint
  → Find exactly what's causing jank or slow load
```

### The Request Lifecycle — Complete Visual

```
USER TYPES: https://shopease.in/products/iphone-15

1. BROWSER CACHE CHECK
   Is iphone-15 page cached and fresh? → No → proceed

2. DNS
   shopease.in → 52.66.47.89 (10ms, from cache)

3. TCP + TLS
   Connect to 52.66.47.89:443 → handshake (45ms, reused connection → 0ms)

4. DOCUMENT REQUEST
   GET /products/iphone-15 HTTP/2
   Host: shopease.in
   Cookie: session=xyz; cart_id=abc
   ↓
   Server: 200 OK  (HTML page, 48KB, gzip → 12KB on wire)

5. HTML PARSING STARTS
   Browser reads HTML top to bottom:
   <head>
     <link href="styles.css?v=abc">        → QUEUE CSS (render-blocking)
     <link rel="preload" href="hero.jpg">  → QUEUE image (priority fetch)
   </head>

6. PARALLEL RESOURCE FETCHING
   CSS:    GET /styles.css → 200 (95KB gzip → 28KB)    → 85ms
   JS:     GET /main.js   → 200 (312KB gzip → 89KB)   → 145ms
   Image:  GET /hero.jpg  → 200 (840KB webp)           → 320ms
   Font:   GET /inter.woff2 → 200 (28KB)               → 95ms

7. CSS PARSED → CSSOM BUILT (styles computed)

8. JS EXECUTED → JS makes API calls:
   fetch('/api/products/iphone-15')        → JSON response 180ms
   fetch('/api/cart')                      → JSON response 95ms
   fetch('/api/recommendations')           → JSON response 220ms

9. DOM + CSSOM → RENDER TREE → LAYOUT → PAINT
   User sees the page

10. JS UPDATES DOM WITH API DATA
    React/Vue renders product details, cart count, recommendations

WHAT YOU SEE IN NETWORK TAB:
Document    /products/iphone-15     200   12KB    240ms
Stylesheet  styles.css              200   28KB    85ms
Script      main.js                 200   89KB    145ms
Image       hero.jpg                200   840KB   320ms
Font        inter.woff2             200   28KB    95ms
Fetch       /api/products/iphone-15 200   8KB     180ms
Fetch       /api/cart               200   2KB     95ms
Fetch       /api/recommendations    200   15KB    220ms

Total: 8 requests | 1.1MB transferred | 1.2s load time
```

---

## Quick Reference — All Browser Network Terms

| Term | One Line |
|------|---------|
| **Document request** | Fetching an HTML page (causes full page reload) |
| **Fetch / XHR** | JS API call in the background (no page reload) |
| **Script** | Downloading a .js file |
| **Stylesheet** | Downloading a .css file (render-blocking) |
| **Preflight (OPTIONS)** | Browser's automatic permission check before CORS request |
| **WebSocket** | Persistent two-way connection for real-time data |
| **SSE** | Server-sent events — one-way server push |
| **TTFB** | Time to First Byte — how fast the server starts responding |
| **DOMContentLoaded** | HTML parsed, DOM built (not all resources loaded yet) |
| **load event** | Everything loaded (images, fonts, scripts) |
| **LCP** | Largest Contentful Paint — when main content is visible |
| **CLS** | Cumulative Layout Shift — how much content jumps around |
| **CORS** | Browser security — cross-origin requests need server permission |
| **Preflight** | Auto OPTIONS request before complex CORS calls |
| **Cache-Control** | Header that tells browser/CDN how long to cache |
| **ETag** | Version fingerprint for cache validation |
| **304 Not Modified** | Server says "use your cached version, nothing changed" |
| **Cookies** | Small data sent with every request, set by server |
| **localStorage** | Client-only permanent storage (never sent to server) |
| **sessionStorage** | Client-only temporary storage (cleared on tab close) |
| **HTTP/2** | Modern HTTP: multiple requests over one connection (multiplexing) |
| **HTTP/3** | Newest HTTP: uses UDP (QUIC), better on bad networks |
| **Content-Type** | What format the request/response body is in |
| **Authorization** | Credentials header (Bearer token, Basic auth) |
| **Origin** | Protocol + Domain + Port of the page making the request |
| **Referer** | URL of the page that triggered the request |
| **User-Agent** | Browser identification string |
| **Gzip/Brotli** | Response compression (reduces size 60-80%) |
| **AbortController** | Cancel an in-progress fetch request |
| **credentials: include** | Needed to send cookies on cross-origin fetch requests |

---

*Open DevTools → Network tab on any website and everything in this guide will be visible in real-time.*
