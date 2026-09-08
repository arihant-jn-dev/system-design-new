# Zero Trust

> **ZeroTrust:** "Never trust anyone automatically. Always verify every access request."

## Traditional Security (Castle Model)

```text
               Internet
                   |
             Castle Gate (VPN)
                   |
     --------------------------------
     | MySQL | Redis | Jenkins | API |
     --------------------------------
```

**Once inside:**

- ✅ You can often discover many internal servers.
- Even if you don't have permission to use them, you may still know they exist.
- This creates risk.

## Zero Trust Model

```text
              Internet
                  |
             Identity Check
                  |
      -----------------------------
      | API | MySQL | Redis | SSH |
      -----------------------------
```

Each room has its own permission check.
You don't get access to the whole office.
**You only get access to the rooms you're authorized to enter.**

## What Happens When You Access Something?

```text
Your App
     │
     ▼
Twingate Client
     │
     ▼
Who is requesting?
↓
Arihant
↓
Is Arihant allowed?
↓
YES
↓
Create secure tunnel
↓
MySQL
```

## How Does SSO Fit Into This?

```text
You
↓
Google Workspace / Okta / Entra ID
↓
Identity Verified
↓
Twingate receives identity
↓
Checks policies
↓
Allows only approved resources
```

So:

- **SSO answers:** "Who are you?"
- **Twingate answers:** "What are you allowed to access?"

## What Does Cloudflare Zero Trust Do?

Cloudflare Zero Trust is excellent for ✅ **Websites**

Suppose your company has a web application: `dashboard.company.com`

Instead of exposing it directly, Cloudflare sits in front of it.

```text
Browser
   |
Cloudflare
   |
Dashboard
```

**Cloudflare asks:**

- Who are you?
- Are you logged in with Google/Okta?
- Are you in the Engineering group?
- Is your device compliant?

If everything is okay:

- ✅ You reach the application.

Otherwise:

- ❌ Access denied.

This is called **application-level access**.

## What Does Twingate Do?

Twingate is excellent for **anything using TCP/IP**.

Now suppose your NestJS backend needs to connect to: `mysql.internal`

These are not web applications. They are **private network services**.

Twingate allows:

```text
Laptop
   |
Twingate
   |
MySQL
```

So Twingate provides **network access to private resources**.

## Why Use Both?

```text
                Employee
                   |
      -----------------------------
      |                           |
Cloudflare                  Twingate
      |                           |
Web Apps               Internal Network

Dashboard              MySQL

Grafana                Redis

Admin Panel            SSH

Kibana                 Kubernetes

                       Redshift
```

| Cloudflare — Web Apps | Twingate — Internal Network |
|---|---|
| Dashboard | MySQL |
| Grafana | Redis |
| Admin Panel | SSH |
| Kibana | Kubernetes |
| | Redshift |

**One protects browser-based applications. The other securely exposes private
network services.**
