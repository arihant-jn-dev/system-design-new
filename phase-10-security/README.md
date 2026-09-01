# Phase 10 — Security, Privacy & Compliance

**Week 14 (first half) · ~6 hrs**

---

## Why this phase exists

The roadmap sets the bar precisely, and it is lower than people fear:

> ⭐ *"You don't need a security-engineer's depth. You **do** need to never leave auth undesigned — **the
> omission is noticed**."*

⭐ **That's the whole framing.** Nobody expects you to enumerate CVEs. They expect that when you draw a
system, **authentication, authorization and data handling are on the diagram** — and that when a constraint
is legal rather than technical, you say so.

⭐ **The two gate questions are exactly the two things that get asked:** *add a complete auth story to any
design in 3 minutes*, and *honour a GDPR deletion request in an event-sourced system.*

**This is a short phase. Don't inflate it** — read the notes, do the three labs, drill the 3-minute auth
story until it's automatic, and move to Phase 11.

---

## How to work this phase

| Step | Do this | Time |
|---|---|---|
| 1 | Read [`notes/`](notes/) 01 → 14. Reference half, once. | ~2 hrs |
| 2 | Fill in the "In your own words" halves. **The actual work.** | ~1.5 hrs |
| 3 | [`lab/`](lab/) A–C — **no Docker, no dependencies** | ~45 min |
| 4 | ⭐ **Drill the 3-minute auth story on FIVE past designs.** | ~45 min |
| 5 | [`GATE.md`](GATE.md) out loud. | ~1 hr |

> ⭐ **Step 4 is the one that pays.** The gate isn't "do you know OAuth" — it's whether an auth story comes
> out of you automatically, unprompted, for any design. **That's a rehearsal task, not a reading task.**

---

## Topics

| # | Note | The one thing it's for |
|---|---|---|
| 01 | [AuthN vs AuthZ](notes/01-authn-vs-authz.md) | ⭐ **Gate Q1** · **authorization is where systems break** · deny by default |
| 02 | [Sessions & tokens](notes/02-sessions-and-tokens.md) | ⭐ **The revocation problem, demonstrated** · httpOnly · refresh rotation |
| 03 | [OAuth & OIDC](notes/03-oauth-and-oidc.md) | ⭐ **OAuth ≠ authentication** · code+PKCE · the three tokens |
| 04 | [Service-to-service](notes/04-service-to-service-auth.md) | ⭐ **"Internal network" is not auth** · mTLS · confused deputy |
| 05 | [Authorization models](notes/05-authorization-models.md) | RBAC → ABAC → ⭐ **ReBAC/Zanzibar** · caching a security decision |
| 06 | [API keys, scopes, quotas](notes/06-api-keys-scopes-quotas.md) | Hash them · prefix them · ⭐ **quota ≠ rate limit** |
| 07 | [Encryption & KMS](notes/07-encryption-and-key-management.md) | ⭐ **Envelope encryption** · why "at rest" defends little |
| 08 | [Password storage](notes/08-password-storage.md) | ⭐ **150,400× measured** · salt ≠ speed · memory-hardness |
| 09 | [PII & privacy by design](notes/09-pii-and-privacy-by-design.md) | ⭐ **Gate Q2** · **crypto-shredding** · the cleartext split |
| 10 | [OWASP Top 10](notes/10-owasp-top-10.md) | ⭐ **SSRF** · broken access control · how to raise it in a design |
| 11 | [DDoS & abuse](notes/11-ddos-and-abuse.md) | ⭐ **Cost-of-attack asymmetry** · L3/L4 vs L7 · shadow bans |
| 12 | [Secrets management](notes/12-secrets-management.md) | ⭐ **The best secret is no secret** · the Tuesday test |
| 13 | [Tenant isolation as security](notes/13-tenant-isolation-as-security.md) | ⭐ **Where tenant context gets lost** · proving isolation |
| 14 | [Compliance vocabulary](notes/14-compliance-vocabulary.md) | ⭐ **Knowing when a constraint is LEGAL, not technical** |

---

## Lab

[`lab/`](lab/) — ⭐ **the roadmap specifies no lab for this phase; these three exist because they're
unusually demonstrable.** No Docker, no dependencies.

| | Headline |
|---|---|
| **A · JWT** | ⭐ **`alg:none` and HS/RS confusion both ACCEPTED** by a plausible verifier — and ⭐ **a "logged out" token still works** |
| **B · Password hashing** | ⭐ **SHA-256 clears the top-10,000 password list in 5.6 MILLIseconds**; scrypt takes 14 minutes. **150,400×** |
| **C · Crypto-shredding** | ⭐ **One key deleted: personal data unrecoverable, log byte-identical, revenue £275.49 → £275.49** |

> ⭐ **Part C is gate Q2 made real** — including proving the negative with 2,000 failed random-key
> decryptions.

---

## Definition of done

- [ ] All 14 notes have the "In your own words" half filled in
- [ ] `lab/README.md` RESULTS filled in with your own numbers
- [ ] ⭐ **You can deliver the 6-part auth story in under 3 minutes, unprompted, for any design**
- [ ] ⭐ **You can explain crypto-shredding and its five hard parts in 60 seconds**
- [ ] You can state why a JWT can't be revoked, and the four mitigations
- [ ] ⭐ **You can cite the password-hashing ratio from memory**
- [ ] You can explain SSRF and why allowlists beat denylists
- [ ] ⭐ **You have added an auth story to five designs you drew in earlier phases**
- [ ] [`GATE.md`](GATE.md) passed out loud
