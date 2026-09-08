# What are Nameservers?

Think of it like a **phone directory receptionist**.

When someone asks *"where is myapp.com?"* — the internet needs to ask someone who
knows the answer. That someone is a **Nameserver**.

> **Nameserver** = "The authority who answers DNS questions for your domain"

## Before the Change — GoDaddy's Default NS

```text
ns1.domaincontrol.com
ns2.domaincontrol.com
```

→ GoDaddy answers all questions about `myapp.com`

## After Switching to Cloudflare NS

```text
aida.ns.cloudflare.com
boyd.ns.cloudflare.com
```

→ Cloudflare answers all questions about `myapp.com`

## What You're Really Saying

You're essentially saying:

> "Don't ask GoDaddy anymore. Ask Cloudflare."

**GoDaddy still owns the domain. But Cloudflare is now the answering authority.**
