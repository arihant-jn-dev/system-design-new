# Twingate

## The Problem — Exposed Company Servers

```text
Internet
     |
     |
Company Servers
------------------------
Dashboard API
MySQL
Redis
Grafana
Redshift
Kibana
Internal Git
```

Without protection, anyone on the internet could try attacking them.

Instead, companies **hide these servers completely**. Only authenticated employees
can reach them. **Twingate is the gatekeeper.**

## Authentication Flow

On Twingate, when you switch **ON**: `Interest Media`

```text
1. Twingate Client
↓
2. Login using Google / Okta / Azure AD / Cloudflare
↓
3. Identity verified
↓
4. Twingate receives your identity
↓
5. Twingate checks
   Who are you?
   ↓
   What groups are you in?
   ↓
   Which resources can you access?
↓
6. Secure tunnel created
```

> Exactly like the SSO discussion we had earlier.

## Why is it Better than VPN?

### Traditional VPN — Network-based security

```text
Your Laptop
      │
      ▼
VPN Tunnel
      │
      ▼
Entire Company Network
```

Your laptop essentially becomes part of the office network.
If someone's laptop is compromised, an attacker may gain **broad network access**.

### Twingate — Identity-based security (Zero Trust)

```text
Your Laptop
      │
      ▼
Twingate
      │
      ▼
Identity Check
      │
      ▼
Only allowed resources
```

Even if you know another server's IP address, you can't access it unless you've
been granted permission.

## Side by Side

| | Traditional VPN | Twingate |
|---|---|---|
| Security model | Network-based | Identity-based (Zero Trust) |
| What you reach | Entire company network | Only allowed resources |
| Compromised laptop | Attacker may gain broad network access | Access limited to granted permissions |
| Knowing an IP | Often enough to reach the server | Not enough — permission still required |
