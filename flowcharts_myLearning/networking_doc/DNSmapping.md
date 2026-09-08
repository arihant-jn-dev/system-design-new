# DNS Mapping — GoDaddy → Cloudflare → AWS

**Your Domain:** `myapp.com` (bought on GoDaddy)

## Step 1 — Point GoDaddy to Cloudflare (The Key Move)

When you buy a domain on GoDaddy, GoDaddy is your **registrar** (they own the
record of who owns `myapp.com`).

But you can tell the internet *"go ask Cloudflare for DNS answers"* by changing
the **Nameservers**.

In the GoDaddy dashboard:

```text
My Domains → myapp.com → DNS → Nameservers → Change → Custom

NS 1:  aida.ns.cloudflare.com
NS 2:  boyd.ns.cloudflare.com
```

Cloudflare gives you these 2 nameservers when you add your site to CF.

### What This Means

**GoDaddy's job after this:**

- ✅ "I own the myapp.com registration"
- ❌ "I no longer answer DNS questions about myapp.com"

**Cloudflare's job after this:**

- ✅ "Ask ME where myapp.com points"
- ✅ "I handle all DNS records, CDN, WAF, SSL"

> GoDaddy becomes just a domain registrar (billing/ownership).
> Cloudflare takes over everything else.

## Step 2 — How DNS Resolution Works Now

```text
User types: myapp.com
                │
                ▼
    Recursive Resolver (8.8.8.8 or ISP)
    "Who handles myapp.com?"
                │
                ▼
    Root + .com TLD servers
    "Check GoDaddy's registry"
                │
                ▼
    GoDaddy Registry responds:
    "Nameservers are aida.ns.cloudflare.com"
                │
                ▼
    Resolver asks Cloudflare NS:
    "What's the IP for myapp.com?"
                │
                ▼
    Cloudflare responds:
    "104.21.x.x" ← This is a Cloudflare Anycast IP
                       (NOT your real server IP)
                │
                ▼
    User connects to Cloudflare Edge PoP
    (nearest city — Mumbai, Singapore, NYC etc.)
```

**GoDaddy is never involved in traffic. Only Cloudflare is.**

## Step 3 — DNS Records You Set Inside Cloudflare

This is where you configure where your actual server/LB lives.

`Cloudflare Dashboard → myapp.com → DNS Records`

| Type | Name | Value | Proxy Status |
|---|---|---|---|
| A | `@` | `54.192.10.20` ← your AWS ALB IP | 🟠 Proxied |
| CNAME | `www` | `myapp.com` | 🟠 Proxied |
| CNAME | `api` | `api-alb.us-east-1.elb.aws.com` | 🟠 Proxied |

## Step 4 — Your Question: Does LB Connect to CF or GoDaddy?

**Internet flow:**

```text
User Browser
    │
    │  HTTPS request to myapp.com
    ▼
Cloudflare Edge  (handles SSL, WAF, CDN, DDoS)
    │
    │  Forwards clean traffic to your origin
    │  Host: myapp.com
    │  CF-Connecting-IP: <real user IP>
    ▼
AWS ALB  (your Load Balancer)  ← THIS is your "origin"
    │
    ▼
Your Pods / Servers
```

> GoDaddy: just sitting there collecting $12/yr 😄

## Step 5 — How Cloudflare Knows Your ALB Address

In Cloudflare DNS, your A record or CNAME points to your ALB:

```text
# If ALB has static IP (via Global Accelerator):
A record:  @  →  54.192.10.20

# If ALB has a DNS hostname (most common):
CNAME:  @  →  myapp-alb-1234567890.us-east-1.elb.amazonaws.com
```

So the full chain is:

```text
myapp.com
   │  (Cloudflare DNS resolves this to CF Anycast IP)
   ▼
Cloudflare Edge  104.21.x.x
   │  (CF internally knows: origin = myapp-alb-123.elb.amazonaws.com)
   ▼
AWS ALB  (your real server, hidden from public)
```

**Your ALB's real IP/hostname is hidden. Users never see it. Only Cloudflare knows it.**

## Step 6 — Lock Down Your ALB (Critical Security Step)

Since CF is your gatekeeper, you should **only allow Cloudflare IPs** to hit your ALB.

Otherwise anyone who finds your ALB URL can bypass Cloudflare (bypass WAF, DDoS
protection etc.).
