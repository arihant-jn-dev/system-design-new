# 🌐 Complete Domain Mapping Guide
## GoDaddy (Domain) + Cloudflare (CDN) + AWS (Servers)

---

## 📋 TABLE OF CONTENTS

1. [Overview: How Everything Connects](#overview)
2. [Complete Mapping Chain](#mapping-chain)
3. [Step-by-Step Setup Guide](#setup-guide)
4. [Load Balancer Deep Dive](#load-balancer)
5. [Real-World Example](#real-world-example)
6. [Troubleshooting](#troubleshooting)

---

## <a id="overview"></a>🎯 OVERVIEW: How Everything Connects

### Your Tech Stack:
- **GoDaddy**: Domain registrar (you own "example.com" here)
- **Cloudflare**: CDN + Security + DNS hosting
- **AWS**: Your actual servers/infrastructure

### The Flow:
```
User types URL
    ↓
GoDaddy (Domain ownership only)
    ↓
Cloudflare Nameservers (DNS resolution + CDN)
    ↓
Cloudflare Edge Servers (Cache + Security)
    ↓
AWS Load Balancer (Has its own IP address)
    ↓
EC2 Instances / Kubernetes Pods (Your servers)
```

### Key Concept:
**Each layer has its own IP addresses and mappings!**

---

## <a id="mapping-chain"></a>🔗 COMPLETE MAPPING CHAIN

### LAYER 1: Domain Ownership (GoDaddy)
**What it does:** Proves you own "example.com"  
**IP Address:** None (just ownership record)  
**Configuration:** Nameserver settings only

```
Domain: example.com
Nameservers: 
  - ns1.cloudflare.com
  - ns2.cloudflare.com
```

**Important:** GoDaddy only stores who owns the domain and which nameservers to use. It does NOT store the actual IP address of your website!

---

### LAYER 2: DNS Resolution (Cloudflare DNS)
**What it does:** Converts domain name to IP address  
**IP Address:** Cloudflare's edge server IPs (e.g., 104.26.11.23)  
**Configuration:** DNS records in Cloudflare dashboard

```
DNS Query: "What is the IP of example.com?"
Cloudflare DNS Answer: "104.26.11.23" (Cloudflare's IP, NOT your AWS IP)
```

**Cloudflare Dashboard Configuration:**
```
Type: A
Name: @ (or www)
Content: 52.45.67.89  ← YOUR AWS Load Balancer IP (origin)
Proxy Status: ✅ Proxied (Orange Cloud)
TTL: Auto
```

**What happens:**
- User's browser asks: "What's the IP of example.com?"
- Cloudflare DNS returns: "104.26.11.23" (Cloudflare's edge server)
- Browser connects to Cloudflare, NOT directly to your AWS server
- Cloudflare internally knows your origin: 52.45.67.89

---

### LAYER 3: CDN Edge Server (Cloudflare)
**What it does:** Caches content, blocks attacks, SSL termination  
**IP Address:** Multiple IPs across 300+ locations worldwide  
**Example IPs:** 104.26.11.23, 172.67.150.45, 104.21.32.10

```
User in India → Connects to Cloudflare Mumbai (104.26.11.23)
User in USA → Connects to Cloudflare New York (172.67.150.45)
User in UK → Connects to Cloudflare London (104.21.32.10)
```

**Cloudflare checks:**
1. ✅ Is this IP blacklisted? (DDoS protection)
2. ✅ Is content cached? If yes → Serve immediately (cache hit)
3. ✅ If not cached → Forward to origin server (your AWS Load Balancer)

**Cloudflare Origin Configuration:**
```
SSL/TLS → Overview → Full (strict)
DNS → example.com → Points to: 52.45.67.89 (AWS Load Balancer)
Firewall → Rules → Block countries, rate limiting
Page Rules → Cache everything
```

---

### LAYER 4: AWS Load Balancer
**What it does:** Distributes traffic across multiple servers  
**IP Address:** YES! Load Balancer has its own IP  
**Example:** 52.45.67.89 (This is what you put in Cloudflare DNS)

#### 🔴 IMPORTANT: Load Balancer IPs

**AWS Application Load Balancer (ALB):**
- **DNS Name:** my-app-lb-1234567890.us-east-1.elb.amazonaws.com
- **IP Addresses:** 52.45.67.89, 54.23.11.12 (can have multiple)
- **How to find:**
  1. Go to AWS Console → EC2 → Load Balancers
  2. Click on your Load Balancer
  3. Note the DNS name
  4. Run: `nslookup my-app-lb-1234567890.us-east-1.elb.amazonaws.com`
  5. You'll see the IP(s): 52.45.67.89

**Target Group Configuration:**
```
Load Balancer: my-app-lb
Listeners: 
  - HTTP (Port 80) → Redirect to HTTPS
  - HTTPS (Port 443) → Forward to target group "web-servers"

Target Group: web-servers
Targets (your actual servers):
  - Instance ID: i-0123456789abcdef0 → Private IP: 10.0.1.50
  - Instance ID: i-abcdef0123456789a → Private IP: 10.0.1.51
  - Instance ID: i-456789abcdef01234 → Private IP: 10.0.2.52
```

**Load Balancer Mapping:**
```
Public IP: 52.45.67.89 (Internet-facing)
    ↓
Internal routing to private IPs:
    - 10.0.1.50:8080 (Server 1 in Availability Zone A)
    - 10.0.1.51:8080 (Server 2 in Availability Zone A)
    - 10.0.2.52:8080 (Server 3 in Availability Zone B)
```

---

### LAYER 5: EC2 Instances / Servers
**What it does:** Runs your actual application code  
**IP Addresses:** Private IPs (not accessible from internet)  
**Example:** 10.0.1.50, 10.0.1.51, 10.0.2.52

```
EC2 Instance 1:
  - Instance ID: i-0123456789abcdef0
  - Private IP: 10.0.1.50
  - Public IP: None (behind Load Balancer)
  - Security Group: Allow port 8080 from Load Balancer only
  - Application runs on: http://10.0.1.50:8080
```

**Security Group Configuration:**
```
Inbound Rules:
  - Port 8080 → Source: Load Balancer Security Group (sg-1234567890abcdef)
  - Port 22 → Source: Your office IP (for SSH access)

Outbound Rules:
  - All traffic → 0.0.0.0/0 (to access databases, APIs, etc.)
```

---

## <a id="setup-guide"></a>⚙️ STEP-BY-STEP SETUP GUIDE

### 🏁 STEP 1: Purchase Domain on GoDaddy

1. Go to GoDaddy.com
2. Search for your domain: "myawesomeapp.com"
3. Purchase domain ($10-15/year)
4. **DO NOT configure DNS on GoDaddy** (we'll use Cloudflare)

---

### ☁️ STEP 2: Setup Cloudflare Account

1. **Go to cloudflare.com → Sign up**
2. **Add your domain:**
   - Enter: myawesomeapp.com
   - Click "Add site"
   - Select Free plan (sufficient for most needs)

3. **Cloudflare will scan existing DNS records**
   - It may find GoDaddy's default records
   - Delete all default records (we'll add new ones)

4. **Cloudflare provides nameservers:**
   ```
   ns1.cloudflare.com
   ns2.cloudflare.com
   ```
   - **COPY THESE** - you'll need them for GoDaddy

---

### 🔄 STEP 3: Point GoDaddy to Cloudflare

1. **Go to GoDaddy → My Products → Domains**
2. **Click on your domain → Manage DNS**
3. **Scroll down to "Nameservers"**
4. **Click "Change Nameservers"**
5. **Select "I'll use my own nameservers"**
6. **Enter Cloudflare's nameservers:**
   ```
   ns1.cloudflare.com
   ns2.cloudflare.com
   ```
7. **Save**

**⏰ Wait Time:** 2-48 hours for nameserver propagation (usually 10-30 minutes)

**How to check if it's working:**
```bash
# Mac/Linux Terminal:
nslookup -type=ns myawesomeapp.com

# You should see:
nameserver = ns1.cloudflare.com
nameserver = ns2.cloudflare.com
```

---

### 🖥️ STEP 4: Setup AWS Infrastructure

#### A. Launch EC2 Instances (Your Servers)

1. **AWS Console → EC2 → Launch Instance**

2. **Configuration:**
   ```
   Name: web-server-1
   AMI: Amazon Linux 2023
   Instance Type: t3.medium
   VPC: Select your VPC (or default)
   Subnet: Private subnet (10.0.1.0/24)
   Auto-assign Public IP: NO (will use Load Balancer)
   Security Group: web-servers-sg
   ```

3. **Create Security Group "web-servers-sg":**
   ```
   Inbound:
     - Custom TCP, Port 8080, Source: 0.0.0.0/0 (we'll restrict this to LB later)
     - SSH, Port 22, Source: Your IP
   ```

4. **Launch 3 instances** (for redundancy):
   - web-server-1 → Private IP: 10.0.1.50
   - web-server-2 → Private IP: 10.0.1.51
   - web-server-3 → Private IP: 10.0.2.52

#### B. Create Application Load Balancer

1. **EC2 → Load Balancers → Create Load Balancer**

2. **Choose Application Load Balancer (ALB)**

3. **Basic Configuration:**
   ```
   Name: my-app-lb
   Scheme: Internet-facing (to receive traffic from internet)
   IP address type: IPv4
   ```

4. **Network Mapping:**
   ```
   VPC: Your VPC
   Availability Zones:
     ✅ us-east-1a (subnet: 10.0.1.0/24)
     ✅ us-east-1b (subnet: 10.0.2.0/24)
   ```

5. **Security Groups:**
   ```
   Create new: alb-sg
   Inbound:
     - HTTP (80) from 0.0.0.0/0
     - HTTPS (443) from 0.0.0.0/0
   ```

6. **Listeners and Routing:**
   ```
   Listener 1: HTTP (Port 80)
     → Default action: Redirect to HTTPS
   
   Listener 2: HTTPS (Port 443)
     → Default action: Forward to target group
   ```

7. **Create Target Group:**
   ```
   Name: web-servers-tg
   Target type: Instances
   Protocol: HTTP
   Port: 8080
   VPC: Your VPC
   Health check path: /health
   ```

8. **Register Targets:**
   ```
   Select instances:
     ✅ web-server-1 (10.0.1.50)
     ✅ web-server-2 (10.0.1.51)
     ✅ web-server-3 (10.0.2.52)
   Port: 8080
   ```

9. **Create Load Balancer**

10. **🔴 IMPORTANT: Note the Load Balancer DNS:**
    ```
    DNS name: my-app-lb-1234567890.us-east-1.elb.amazonaws.com
    ```

11. **Get Load Balancer IP:**
    ```bash
    # Terminal command:
    nslookup my-app-lb-1234567890.us-east-1.elb.amazonaws.com
    
    # Output:
    Address: 52.45.67.89
    Address: 54.23.11.12
    ```
    - **Copy the first IP: 52.45.67.89** (you'll need this for Cloudflare)

---

### 🔗 STEP 5: Link Cloudflare to AWS Load Balancer

1. **Go to Cloudflare Dashboard**
2. **Select your domain: myawesomeapp.com**
3. **Go to DNS → Records**
4. **Add DNS A Record for root domain:**
   ```
   Type: A
   Name: @ (represents myawesomeapp.com)
   IPv4 address: 52.45.67.89  ← AWS Load Balancer IP
   Proxy status: ✅ Proxied (Orange cloud icon)
   TTL: Auto
   ```

5. **Add DNS A Record for www subdomain:**
   ```
   Type: A
   Name: www
   IPv4 address: 52.45.67.89  ← AWS Load Balancer IP
   Proxy status: ✅ Proxied (Orange cloud)
   TTL: Auto
   ```

6. **Optional: Add CNAME for API subdomain:**
   ```
   Type: CNAME
   Name: api
   Target: myawesomeapp.com
   Proxy status: ✅ Proxied
   TTL: Auto
   ```

---

### 🔒 STEP 6: SSL/TLS Configuration

#### Option A: Cloudflare SSL (Easier)

1. **Cloudflare Dashboard → SSL/TLS → Overview**
2. **Select: "Full (strict)"**
   - Encrypts traffic between user and Cloudflare
   - Encrypts traffic between Cloudflare and your origin

3. **SSL/TLS → Edge Certificates:**
   - ✅ Always Use HTTPS: ON
   - ✅ Automatic HTTPS Rewrites: ON
   - ✅ Minimum TLS Version: 1.2

#### Option B: AWS Certificate Manager (More Control)

1. **AWS Console → Certificate Manager**
2. **Request Certificate:**
   ```
   Domain names:
     - myawesomeapp.com
     - *.myawesomeapp.com (wildcard for all subdomains)
   Validation: DNS validation
   ```

3. **Add CNAME records to Cloudflare for validation:**
   - AWS will provide CNAME records
   - Add them to Cloudflare DNS (with Proxy OFF/Gray cloud)

4. **Attach certificate to Load Balancer:**
   - EC2 → Load Balancers → my-app-lb
   - Listeners → HTTPS:443 → Edit
   - Default SSL certificate → Select your ACM certificate

---

### 🔐 STEP 7: Secure EC2 Instances (Restrict Access)

Now that Load Balancer is working, restrict EC2 access:

1. **EC2 → Security Groups → web-servers-sg**
2. **Edit Inbound Rules:**
   ```
   DELETE: 0.0.0.0/0
   
   ADD:
   Custom TCP, Port 8080, Source: alb-sg (Load Balancer security group)
   SSH, Port 22, Source: Your office IP
   ```

**This ensures:**
- Only Load Balancer can access your servers
- No direct internet access to EC2 instances
- Servers are protected behind Load Balancer

---

## <a id="load-balancer"></a>⚖️ LOAD BALANCER DEEP DIVE

### What is a Load Balancer?

A Load Balancer is like a **traffic controller** that:
1. Has its own **public IP address** (accessible from internet)
2. Receives all incoming requests
3. Distributes them across multiple servers
4. Monitors server health
5. Automatically removes unhealthy servers

---

### Load Balancer IP Addresses

#### AWS Application Load Balancer (ALB):
```
Public IP(s): 52.45.67.89, 54.23.11.12 (can have multiple)
  ↓
Internal Network (Private IPs):
  - 10.0.1.50:8080 (Server 1)
  - 10.0.1.51:8080 (Server 2)
  - 10.0.2.52:8080 (Server 3)
```

**How to find Load Balancer IP:**

**Method 1: Using nslookup**
```bash
nslookup my-app-lb-1234567890.us-east-1.elb.amazonaws.com

# Result:
Address: 52.45.67.89
Address: 54.23.11.12
```

**Method 2: Using dig**
```bash
dig my-app-lb-1234567890.us-east-1.elb.amazonaws.com +short

# Result:
52.45.67.89
54.23.11.12
```

**Method 3: AWS Console**
1. EC2 → Load Balancers
2. Select your Load Balancer
3. Copy DNS name
4. Use nslookup on DNS name

---

### How to Link Load Balancer to Cloudflare

**In Cloudflare DNS, you enter the Load Balancer's IP:**

```
Type: A
Name: @
Content: 52.45.67.89  ← Load Balancer IP (not EC2 instance IP!)
Proxy: ✅ ON
```

**Complete Flow:**
```
1. User types: myawesomeapp.com
2. DNS query goes to Cloudflare nameservers (ns1.cloudflare.com)
3. Cloudflare DNS knows:
   - Public answer: 104.26.11.23 (Cloudflare's IP)
   - Internal origin: 52.45.67.89 (AWS Load Balancer IP)
4. Request hits Cloudflare edge server: 104.26.11.23
5. Cloudflare forwards to: 52.45.67.89 (Load Balancer)
6. Load Balancer distributes to:
   - 10.0.1.50 (Server 1) ← Request 1
   - 10.0.1.51 (Server 2) ← Request 2
   - 10.0.2.52 (Server 3) ← Request 3
```

---

### Load Balancer Algorithms

**Round Robin (Default):**
```
Request 1 → Server 1
Request 2 → Server 2
Request 3 → Server 3
Request 4 → Server 1 (cycles back)
```

**Least Connections:**
```
Server 1: 5 active connections
Server 2: 2 active connections  ← New request goes here
Server 3: 8 active connections
```

**Sticky Sessions:**
```
User A (Session ID: abc123) → Always to Server 1
User B (Session ID: xyz789) → Always to Server 2
```

---

### Health Checks

Load Balancer constantly pings servers:

```
Every 30 seconds:
  GET http://10.0.1.50:8080/health
  GET http://10.0.1.51:8080/health
  GET http://10.0.2.52:8080/health

Expected Response: HTTP 200 OK

If Server 2 returns 500 error or doesn't respond:
  - Mark as unhealthy
  - Stop sending traffic
  - Retry health check every 30s
  - When healthy again → Resume traffic
```

**Health Check Configuration:**
```
Health check path: /health
Interval: 30 seconds
Timeout: 5 seconds
Healthy threshold: 2 (2 consecutive successes = healthy)
Unhealthy threshold: 3 (3 consecutive failures = unhealthy)
```

---

## <a id="real-world-example"></a>🌍 REAL-WORLD EXAMPLE

### Scenario: E-commerce Website "ShopNow.com"

**Stack:**
- Domain: GoDaddy
- CDN: Cloudflare
- Servers: AWS (3 EC2 instances)
- Database: AWS RDS (PostgreSQL)

---

### Complete Setup:

#### 1. Domain Configuration (GoDaddy)
```
Domain: shopnow.com
Purchased: $12.99/year
Nameservers: 
  - ns1.cloudflare.com
  - ns2.cloudflare.com
```

#### 2. Cloudflare Configuration
```
DNS Records:
  @ (shopnow.com)          → A → 52.45.67.89 (Proxied ✅)
  www                      → A → 52.45.67.89 (Proxied ✅)
  api.shopnow.com          → A → 52.45.67.89 (Proxied ✅)
  cdn.shopnow.com          → CNAME → shopnow.com (Proxied ✅)

SSL/TLS: Full (strict)
Firewall Rules:
  - Block countries: China, Russia (if not your market)
  - Rate limiting: 100 requests/minute per IP
  - Challenge bad bots

Page Rules:
  - *.jpg, *.png, *.css, *.js → Cache Everything (TTL: 1 day)
  - /api/* → Cache: Bypass
```

#### 3. AWS Load Balancer
```
Name: shopnow-lb
DNS: shopnow-lb-1234567890.us-east-1.elb.amazonaws.com
Public IPs: 52.45.67.89, 54.23.11.12

Listeners:
  HTTP (80) → Redirect to HTTPS
  HTTPS (443) → Forward to shopnow-web-tg

Target Group: shopnow-web-tg
  - web-server-1: 10.0.1.50:8080 (Healthy)
  - web-server-2: 10.0.1.51:8080 (Healthy)
  - web-server-3: 10.0.2.52:8080 (Healthy)
```

#### 4. EC2 Instances (Servers)
```
Server 1:
  Instance: i-abc123
  Private IP: 10.0.1.50
  App: Node.js running on port 8080
  
Server 2:
  Instance: i-def456
  Private IP: 10.0.1.51
  App: Node.js running on port 8080

Server 3:
  Instance: i-ghi789
  Private IP: 10.0.2.52
  App: Node.js running on port 8080
```

#### 5. Database
```
AWS RDS PostgreSQL:
  Endpoint: shopnow-db.abc123.us-east-1.rds.amazonaws.com
  Private IP: 10.0.3.100:5432
  Accessible only from web servers (security group restricted)
```

---

### Request Flow Example:

**User visits: https://shopnow.com/products**

```
STEP 1: DNS Resolution
  User's computer → Cloudflare DNS (ns1.cloudflare.com)
  Query: "What's the IP of shopnow.com?"
  Cloudflare returns: 104.26.11.23 (Cloudflare's Mumbai edge server)

STEP 2: TLS/SSL Handshake
  Browser → 104.26.11.23 (Cloudflare)
  SSL certificate: Cloudflare's certificate
  Encrypted connection established

STEP 3: Cloudflare Processing
  Cloudflare checks:
    ✅ IP not blacklisted
    ✅ Request rate OK
    ✅ Check cache for /products
    ❌ Cache MISS (dynamic page)
  
  Decision: Forward to origin server

STEP 4: Cloudflare → AWS Load Balancer
  Cloudflare → 52.45.67.89 (AWS Load Balancer public IP)
  New TLS connection (Cloudflare → AWS)

STEP 5: Load Balancer Distribution
  Load Balancer checks:
    - Server 1: 45 active connections
    - Server 2: 38 active connections ← CHOSEN (least connections)
    - Server 3: 52 active connections
  
  Routes to: 10.0.1.51:8080 (Server 2)

STEP 6: Application Processing
  Node.js app on Server 2:
    1. Receives GET /products
    2. Validates user session (checks Redis cache)
    3. Queries database:
       SELECT * FROM products WHERE active=true LIMIT 50
    4. Database (10.0.3.100:5432) returns 50 products
    5. Formats JSON response

STEP 7: Response Journey Back
  Server 2 (10.0.1.51) → Load Balancer (52.45.67.89)
  Load Balancer → Cloudflare (104.26.11.23)
  Cloudflare → User's browser
  
  Cloudflare caches response for 5 minutes (for next user)

STEP 8: Browser Renders
  User sees product listing in 250ms
```

---

### Performance Metrics:

```
First Visitor (Cache Miss):
  DNS Resolution: 15ms (cached in browser)
  SSL Handshake: 80ms
  Cloudflare Processing: 10ms
  AWS Load Balancer: 5ms
  Application Processing: 120ms
  Database Query: 45ms
  Response Transfer: 30ms
  ────────────────────────────
  TOTAL: ~305ms

Subsequent Visitors (Cache Hit):
  DNS Resolution: 2ms (cached)
  Cloudflare Cache Hit: 25ms
  ────────────────────────────
  TOTAL: ~27ms (11x faster!)
```

---

## <a id="troubleshooting"></a>🔧 TROUBLESHOOTING

### Issue 1: "Site Not Reachable"

**Check:**
```bash
# 1. Verify nameservers
nslookup -type=ns shopnow.com
# Should show: ns1.cloudflare.com, ns2.cloudflare.com

# 2. Verify DNS resolution
nslookup shopnow.com
# Should show Cloudflare IP (104.x.x.x)

# 3. Check if Load Balancer is accessible
curl -v http://52.45.67.89
# Should return response from your app
```

**Common Causes:**
- ❌ Nameservers not updated (wait 24-48 hours)
- ❌ Wrong IP in Cloudflare DNS
- ❌ Load Balancer security group blocking port 80/443
- ❌ All EC2 instances unhealthy

---

### Issue 2: "502 Bad Gateway"

**Meaning:** Load Balancer can't reach your servers

**Check:**
```bash
# AWS Console → EC2 → Target Groups → shopnow-web-tg
# Check health status of targets

# All servers showing "Unhealthy"?
```

**Common Causes:**
- ❌ Application not running on port 8080
- ❌ Security group blocking Load Balancer
- ❌ Health check path wrong (/health endpoint doesn't exist)
- ❌ Application crashed

**Fix:**
```bash
# SSH to EC2 instance
ssh ec2-user@10.0.1.50

# Check if app is running
ps aux | grep node

# Check if port 8080 is listening
netstat -tuln | grep 8080

# Check application logs
tail -f /var/log/app.log

# Restart application
pm2 restart app
```

---

### Issue 3: "SSL Certificate Error"

**Common Causes:**
- ❌ Cloudflare SSL mode wrong (use "Full (strict)")
- ❌ Load Balancer doesn't have valid SSL certificate
- ❌ Mixed content (loading HTTP resources on HTTPS page)

**Fix:**
1. Cloudflare → SSL/TLS → Full (strict)
2. AWS Certificate Manager → Request certificate
3. Attach certificate to Load Balancer HTTPS listener

---

### Issue 4: "Slow Website"

**Diagnosis:**
```bash
# Check DNS time
time nslookup shopnow.com

# Check full page load
curl -w "@curl-format.txt" -o /dev/null -s https://shopnow.com

# curl-format.txt:
time_namelookup: %{time_namelookup}s
time_connect: %{time_connect}s
time_appconnect: %{time_appconnect}s
time_pretransfer: %{time_pretransfer}s
time_starttransfer: %{time_starttransfer}s
time_total: %{time_total}s
```

**Optimize:**
- ✅ Enable Cloudflare caching for static assets
- ✅ Add Redis cache for database queries
- ✅ Enable gzip compression
- ✅ Optimize database queries (add indexes)
- ✅ Use CDN for images (S3 + CloudFront)

---

### Issue 5: "High AWS Costs"

**Check:**
```
EC2 instances: 3 × t3.medium = $0.0416/hr × 3 × 730hr = ~$91/month
Load Balancer: $16/month + $0.008/LCU-hour
Data transfer: $0.09/GB (first 10TB)
```

**Optimize:**
- ✅ Use Reserved Instances (save 30-60%)
- ✅ Enable Cloudflare (reduces bandwidth costs)
- ✅ Use Auto Scaling (scale down during low traffic)
- ✅ Use spot instances for non-critical workloads

---

## 📊 COMPLETE IP/DNS MAPPING TABLE

| Layer | Component | Type | Value | Where to Configure |
|-------|-----------|------|-------|-------------------|
| 1 | Domain | Domain | shopnow.com | GoDaddy |
| 2 | Nameservers | NS Records | ns1.cloudflare.com | GoDaddy → Nameservers |
| 3 | DNS A Record | IP Address | 52.45.67.89 | Cloudflare DNS Dashboard |
| 4 | Cloudflare Edge | Public IP | 104.26.11.23 | Auto (Cloudflare's IP) |
| 5 | Load Balancer | Public IP | 52.45.67.89 | AWS Console → EC2 → LB |
| 6 | EC2 Server 1 | Private IP | 10.0.1.50 | AWS Console → EC2 |
| 7 | EC2 Server 2 | Private IP | 10.0.1.51 | AWS Console → EC2 |
| 8 | EC2 Server 3 | Private IP | 10.0.2.52 | AWS Console → EC2 |
| 9 | Database | Private IP | 10.0.3.100 | AWS Console → RDS |

---

## ✅ QUICK VALIDATION CHECKLIST

After setup, verify each layer:

```bash
# ✅ 1. Nameservers pointing to Cloudflare
nslookup -type=ns shopnow.com
# Expected: ns1.cloudflare.com

# ✅ 2. DNS resolving to Cloudflare IP
nslookup shopnow.com
# Expected: 104.x.x.x (Cloudflare IP range)

# ✅ 3. Cloudflare can reach Load Balancer
# Cloudflare Dashboard → Overview → Check orange cloud status

# ✅ 4. Load Balancer has healthy targets
# AWS Console → Target Groups → Check health status

# ✅ 5. Website loads
curl -I https://shopnow.com
# Expected: HTTP/2 200 OK

# ✅ 6. SSL certificate valid
echo | openssl s_client -connect shopnow.com:443 2>/dev/null | openssl x509 -noout -dates
# Expected: Valid dates

# ✅ 7. All servers responding
# AWS Console → Target Groups → See all 3 servers "Healthy"
```

---

## 🎯 KEY TAKEAWAYS

1. **GoDaddy = Domain ownership** (not DNS hosting)
2. **Cloudflare = DNS + CDN** (returns its own IP, not your server's)
3. **Load Balancer = Has its own public IP** (this is what you put in Cloudflare)
4. **EC2 Instances = Private IPs only** (not accessible from internet directly)

**The Magic:**
```
User sees Cloudflare IP (104.x.x.x)
Cloudflare knows Load Balancer IP (52.45.67.89)
Load Balancer knows Server IPs (10.0.1.50, 10.0.1.51, 10.0.2.52)

Each layer only knows about the next layer!
```

---

## 📚 Additional Resources

- [Cloudflare DNS Setup](https://support.cloudflare.com/hc/en-us/articles/205195708)
- [AWS Load Balancer Guide](https://docs.aws.amazon.com/elasticloadbalancing/)
- [SSL/TLS Best Practices](https://www.cloudflare.com/learning/ssl/what-is-ssl/)

---

**Need help? Common questions:**
- "Where do I put my server IP?" → In Cloudflare DNS (A record)
- "What IP goes in Cloudflare?" → Load Balancer's public IP (found via nslookup)
- "Why is my site showing Cloudflare IP?" → That's correct! Users connect to Cloudflare first
- "Can I skip Load Balancer?" → Yes, but not recommended for production (no auto-scaling, health checks)

🎉 **You now understand complete domain mapping with GoDaddy + Cloudflare + AWS!**
