# Phase 10 — Gate

> **Rules:** Out loud. From memory. No notes.
> ⭐ **Q1 is a 3-MINUTE DRILL, and you must VOLUNTEER it — the roadmap's point is that the OMISSION is what's
> noticed.**

---

## Q1 · Add a complete auth story to any design, in 3 minutes

**Pick a design you've drawn in an earlier phase. ⭐ Do this for FIVE different designs. Timer on.**

**All six parts, every time:**

- [ ] ⭐ **1. WHO authenticates** — end users? services? third-party apps? admin staff? (⭐ *naming all four is the differentiator*)
- [ ] ⭐ **2. HOW** — OIDC via an IdP for users · mTLS/workload identity between services · API keys + scopes for partners
- [ ] ⭐ **3. WHERE the credential lives** — ⭐ **httpOnly + Secure + SameSite cookie**, or an access token in memory only
- [ ] ⭐ **4. HOW IT'S REVOKED** — short-lived access tokens + **rotating refresh tokens with reuse detection**; a per-user "valid after T" epoch
- [ ] ⭐ **5. HOW SERVICES TRUST EACH OTHER** — mTLS from the mesh, **plus propagated user context with an `aud`**, because mTLS says which *service*, not which *user*
- [ ] ⭐ **6. HOW AUTHORIZATION IS DECIDED AND ENFORCED** — the model, a central enforcement point, **deny by default**, ⭐ **and pushed into the query (RLS) where possible**

**And the marks that separate a strong answer:**

- [ ] ⭐ **You volunteered it** without being asked
- [ ] ⭐ **AuthN vs AuthZ kept distinct**, with `401` vs `403` (and that the naming is wrong)
- [ ] ⭐ **"Broken access control is OWASP #1 because authentication is bought and authorization is hand-written"**
- [ ] ⭐ **`404` not `403` for resources whose existence is sensitive**
- [ ] ⭐ **"Internal network is not authentication"** — zero trust
- [ ] You named the tenant-isolation boundary if the system is multi-tenant

**Self-score:** ___ / 12 · **Slowest of five: ____**

---

## Q2 · How do you honour a GDPR deletion request in an event-sourced system?

- [ ] ⭐ **State the contradiction first**: events are immutable and forever; Article 17 says erase
- [ ] ⭐ **Why "delete the row" isn't available**: it breaks replay, the audit trail, every projection, and the ledger's arithmetic
- [ ] ⭐ **CRYPTO-SHREDDING**: per-subject key, personal fields encrypted, keys in a **separate mutable keystore**
- [ ] ⭐ **To erase: destroy the key.** Events touched: 0
- [ ] ⭐ **THE CLEARTEXT/ENCRYPTED SPLIT** — amounts, timestamps, order ids and a **pseudonymous subject id** stay in cleartext
- [ ] ⭐ **…which is what keeps aggregates working.** Cite it: **revenue £275.49 → £275.49, log 7 events → 7 events**
- [ ] ⭐ **Under-encrypt and you can't comply; over-encrypt and the system breaks — and the split is permanent**
- [ ] ⭐ **It's idempotent and PROVABLE** — "is Alice erased?" is answerable because the key is absent
- [ ] Other subjects unaffected — blast radius 1

**The five hard parts — ⭐ naming these is what makes the answer senior:**

- [ ] ⭐ **The keystore becomes your most critical system — and its backups must be RETENTION-LIMITED, or you've backed up your ability to un-erase**
- [ ] ⭐ **Anything decrypted downstream escapes the scheme** — projections, search indexes, warehouses, logs → **keep derived stores rebuildable and rebuild after a shred**
- [ ] **Key rotation** → ⭐ **envelope encryption with a KMS master key**, so rotation never rewrites the log
- [ ] ⭐ **Backups of the LOG are fine** — ciphertext with no key. ⭐ **Compare with row deletion, where a restore silently un-deletes the user**
- [ ] ⭐ **Erasure isn't absolute** — legal-obligation exceptions exist

- [ ] ⭐ **AND THE POINT THAT SCORES: tax law requires keeping transaction records for years, GDPR permits retention for a legal obligation — so this isn't a workaround, it's the design that satisfies BOTH**

**Self-score:** ___ / 15

---

## Extra checks

- [ ] ⭐ **`401` vs `403` — and what's wrong with the naming?**
- [ ] Write the IDOR bug and its fix. ⭐ **What's the strongest structural fix?**
- [ ] ⭐ **What does "deny by default" mean for a new endpoint?**
- [ ] What is mass assignment?
- [ ] ⭐ **Sessions vs JWTs — state the fundamental trade in one sentence**
- [ ] ⭐ **`alg: none` and HS/RS confusion — same root cause, same one-line fix. Say both**
- [ ] ⭐ **Why is the `aud` check the one people skip, and what does skipping it allow?**
- [ ] ⭐ **Demonstrate the revocation problem. Four mitigations — what does refresh-reuse detection give you?**
- [ ] ⭐ **Why not localStorage — and why is "just prevent XSS" not an answer?**
- [ ] ⭐ **OAuth vs OIDC. What's the vulnerability in confusing them?**
- [ ] Walk code+PKCE. ⭐ **Why does the code exchange exist? What does PKCE solve?**
- [ ] Which OAuth flows are deprecated, and why?
- [ ] ⭐ **The three tokens — audience and purpose. What must you never do?**
- [ ] ⭐ **The `email_verified` account-takeover trap**
- [ ] ⭐ **What does mTLS NOT tell you? Explain the confused deputy**
- [ ] ⭐ **Why is forwarding the user's token downstream a bad default?**
- [ ] Three rules for HMAC-signed webhooks. What does the timestamp prevent?
- [ ] ⭐ **RBAC / ABAC / ReBAC. Why does RBAC explode, and what can't it express?**
- [ ] ⭐ **The new-enemy problem and zookies**
- [ ] ⭐ **Why is caching an authorization decision dangerous, and which way do you fail?**
- [ ] ⭐ **Why hash API keys — and why is SHA-256 fine there but not for passwords?**
- [ ] ⭐ **Why prefix API keys? Why must an account have multiple active keys?**
- [ ] ⭐ **Quota vs rate limit — which needs accuracy?**
- [ ] ⭐ **What does "encryption at rest" actually defend against — and what not?**
- [ ] ⭐ **Draw envelope encryption. Why does it make rotation cheap?**
- [ ] Why must keys be versioned? ⭐ **What's the Tuesday test?**
- [ ] Field-level encryption's cost; tokenization's real benefit
- [ ] ⭐ **Why authenticated encryption — and what did the GCM auth tag do in your lab?**
- [ ] ⭐ **Cite the password numbers: SHA-256 vs scrypt, and the top-10k row**
- [ ] ⭐ **What is the salt for, and what is it NOT for? Say the amortisation/speed sentence**
- [ ] ⭐ **Why is "memory-hard" the key property?**
- [ ] ⭐ **How do you migrate 10M users to a stronger hash?**
- [ ] What is a pepper?
- [ ] ⭐ **Explain SSRF. Why allowlist rather than denylist?**
- [ ] ⭐ **Cookies vs Authorization header — which fixes XSS exfiltration, which fixes CSRF?**
- [ ] Why did `SameSite=Lax` as a default matter so much?
- [ ] ⭐ **Which OWASP category is the most common real cause, and why is that ironic?**
- [ ] ⭐ **How do you raise OWASP in a design discussion without reciting the list?**
- [ ] ⭐ **State the cost-of-attack asymmetry. Three places it's inverted in a typical design**
- [ ] ⭐ **L3/L4 vs L7 — which do you buy, which do you design for?**
- [ ] How does an attacker bypass your CDN?
- [ ] ⭐ **How does credential stuffing evade per-account limits? Why is a shadow ban better than a block?**
- [ ] ⭐ **What must you design alongside every abuse control?**
- [ ] ⭐ **Rank the secrets hierarchy. What's the direction of travel?**
- [ ] ⭐ **Four reasons env vars are weaker than they look**
- [ ] Write the leak-response runbook. ⭐ **What step do people skip?**
- [ ] ⭐ **Five places tenant context gets lost. Why is a cache key without a tenant id dangerous?**
- [ ] ⭐ **How do you PROVE tenant isolation?**
- [ ] ⭐ **How do you design staff access to customer data safely?**
- [ ] ⭐ **Which four compliance requirements actually change architecture?**
- [ ] ⭐ **Why can't data residency be retrofitted? What's the PCI design goal?**
- [ ] ⭐ **What do you say when you don't know the legal answer?**

---

## Scoring

| Result | Do this |
|---|---|
| Q1 under 3 min on all five + Q2 passed | ✅ Advance to **Phase 11 — Interview Craft** |
| Q1 over time, or missing part 4 or 5 | ⛔ Re-drill Q1 on five more designs |
| Q2 missed the cleartext split or the hard parts | ⛔ Redo [notes/09](notes/09-pii-and-privacy-by-design.md) + re-run the shredding lab |

| Fumbled | Redo |
|---|---|
| Q1 | [notes/01](notes/01-authn-vs-authz.md)–[05](notes/05-authorization-models.md) — then drill on five designs |
| Q2 | [notes/09](notes/09-pii-and-privacy-by-design.md) + [07](notes/07-encryption-and-key-management.md) |

---

## Before Phase 11

- [ ] ⭐ **Go back through every design you have drawn and add the auth story.** That is the phase's whole
      deliverable — the knowledge is worthless if it doesn't come out unprompted.
- [ ] ⭐ **PRACTICE PROBLEMS.** You are at Week 14 of 16. The roadmap wanted 13–15 designs; this has been
      flagged at every gate since Phase 5. ⭐ **Phase 11 is interview craft — it is largely about DELIVERING
      designs, so it will be far more useful if you have actually done some.**
- [ ] ⭐ **Phase 11 is the highest-leverage phase left.** Do not skip it, and do not let it get compressed —
      the roadmap says recording a 45-minute design is *"the fastest improvement you will get from any
      single hour."*

---

## Gate log

| Attempt | Date | Q1 (slowest of 5) | Q2 | Notes |
|---|---|---|---|---|
| 1 |  | /12 ( ) | /15 |  |
| 2 |  | /12 ( ) | /15 |  |
