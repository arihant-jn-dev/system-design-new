# 10·12 · Secrets Management

> **Why this exists:** the roadmap's phrasing is the whole note — ⭐ ***"rotation, no secrets in
> code/env-in-git."*** It's unglamorous and it's how a very large share of real breaches begin.

---

## Reference

### ⭐ The hierarchy, worst to best

| | | |
|---|---|---|
| ⛔ | **Hardcoded in source** | ⭐ **Permanently compromised the moment it's pushed. Rewriting git history does NOT help** — assume it's harvested |
| ⛔ | **A `.env` file committed to git** | same thing with extra steps |
| ⚠️ | **Env vars from a CI variable** | better; ⚠️ **but visible in logs, crash dumps, `/proc`, child processes, and to anyone with deploy access** |
| ⚠️ | **A mounted secret file** | fine-ish; still static and long-lived |
| ✅ | **A secrets manager** (Vault, AWS/GCP Secrets Manager) | central, audited, rotatable |
| ⭐ | **Dynamic short-lived credentials** | ⭐ **Vault issues a DB user valid for 1 hour. A leak expires itself** |
| ⭐⭐ | **No secret at all — workload identity** | ⭐ **IAM roles / IRSA / mTLS. Nothing to leak, nothing to rotate** ([04](04-service-to-service-auth.md)) |

> ⭐ **The direction of travel is toward NOT HAVING A SECRET.** Every rung up the ladder removes something
> that can be stolen — and ⭐ **"the best secret is no secret" is the sentence to say.**

### Why env vars are weaker than people think

⚠️ They appear in **crash dumps and error reports** · are **inherited by every child process** (⭐ *including
that shell-out to `curl`*) · are visible in `/proc/<pid>/environ` to anyone on the box · get **printed by
debug endpoints and logging middleware** · and are **readable by anyone with deploy or console access**.

⭐ **They're acceptable as the *delivery mechanism* from a secrets manager to a process at boot. They're not
acceptable as the *system of record*.**

### ⭐ Rotation

⭐ **A secret you cannot rotate calmly on a Tuesday is one you cannot rotate during a breach — which is
exactly when you'll need to.**

**What makes rotation possible:**

| | |
|---|---|
| ⭐ **Support TWO valid secrets at once** | ⭐ **otherwise rotation requires downtime, so nobody does it** ([06](06-api-keys-scopes-quotas.md)) |
| **Version secrets**, don't overwrite | rollback stays possible |
| ⭐ **Automate it** | a manual runbook is a runbook nobody runs |
| **Track `last_rotated`** and alert on staleness | |
| ⭐ **Practise it** | ⭐ **rotation is a fire drill — the first time must not be during an incident** |

### Detection

⭐ **Assume a leak will happen and optimise for finding it fast:** **secret scanning in pre-commit hooks and
CI** · **repo-host scanning** (⭐ *GitHub notifies major providers automatically — which is why prefixed key
formats matter*, [06](06-api-keys-scopes-quotas.md)) · ⭐ **canary tokens** — a fake credential that alerts
when anyone tries to use it · **anomaly detection on credential use**.

⭐ **And have the runbook written before you need it:** revoke → rotate → assess what the credential could
reach → check logs for use → notify. ⚠️ **Rotating without assessing blast radius is half a response.**

### ⚠️ The places secrets escape

⭐ **Application logs** (⭐ *logging the whole request object is the classic*) · **error trackers** ·
**CI/CD logs** (mask them, and ⚠️ *`set -x` defeats masking*) · **Docker image layers** (⚠️ *a deleted file
in an earlier layer is still in the image*) · **Kubernetes ConfigMaps** (⭐ *and note plain k8s Secrets are
only base64-encoded — enable encryption at rest and RBAC*) · **Terraform state** (⚠️ *contains plaintext
secrets — encrypt and lock the backend*) · **backups** · **screenshots and shared Postman collections** ·
⭐ **an LLM prompt or a pasted stack trace.**

### The related discipline: least privilege

⭐ **A leaked credential's damage is bounded by what it can do**, so scope matters as much as storage:
**per-service credentials, never one shared "app" user** · **read-only where possible** · **scoped to
specific resources** · ⭐ **separate prod from non-prod completely** (⚠️ *a staging credential that works in
prod is a prod credential*) · **time-bound and IP-bound where you can** · ⭐ **and break-glass access that is
short-lived, alerting, and audited.**

---

## In your own words

**⭐ Rank the hierarchy. What's the direction of travel, and the sentence that captures it?**

>

**⭐ Why is committing a secret unrecoverable even after a history rewrite?**

>

**⭐ Give four reasons env vars are weaker than they look. When are they acceptable?**

>

**⭐ State the Tuesday test for rotation.**

>

**Why must a system support two valid secrets at once?**

>

**Name three detection mechanisms. What's a canary token?**

>

**⭐ Write the leak-response runbook. What's the step people skip?**

>

**Name five places secrets escape that aren't obvious.**

>

**⭐ Why does least privilege matter as much as storage? What's wrong with a staging credential that works in prod?**

>

---

## Links

- ⭐ No-secret alternatives → [04-service-to-service-auth.md](04-service-to-service-auth.md)
- Key management is a related but distinct problem → [07-encryption-and-key-management.md](07-encryption-and-key-management.md)
- Key prefixes make scanning work → [06-api-keys-scopes-quotas.md](06-api-keys-scopes-quotas.md)
- ⚠️ Don't log secrets or PII → [09-pii-and-privacy-by-design.md](09-pii-and-privacy-by-design.md)
- Deploy pipelines as an attack surface → [10-owasp-top-10.md](10-owasp-top-10.md)
- Config pushes are the least safe change → [Phase 7 note 11](../../phase-07-reliability/notes/11-deployment-safety.md)
