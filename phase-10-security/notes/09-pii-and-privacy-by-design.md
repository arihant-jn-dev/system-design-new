# 10·09 · PII & Privacy by Design

> **Why this exists:** ⭐ **gate Q2** — *"explain how you'd honour a GDPR deletion request in an
> event-sourced system."* ⭐ **You built the answer**: an immutable log, a per-subject key, and one delete.

---

## Reference

### Data classification — the prerequisite

⭐ **You cannot protect, minimise, or delete data you haven't classified.**

| Class | Examples | Treatment |
|---|---|---|
| **Public** | marketing pages | none |
| **Internal** | metrics, non-personal logs | access control |
| ⭐ **PII** | name, email, address, phone, ⭐ **IP address, device id** | encrypt, minimise, retain limited, erasable |
| ⭐ **Sensitive PII** ("special category") | health, biometrics, ethnicity, sexuality, religion, political views | ⭐ **explicit consent, stricter everything** |
| **Regulated** | card data (PCI), health records (HIPAA) | ⭐ **scope reduction — tokenize/outsource** |

⚠️ **An IP address IS personal data under GDPR.** So is a device id. ⭐ **So are your access logs** — this is
the classification people get wrong, and it means your logging pipeline is in scope.

### ⭐ The principles that are actually design constraints

| | |
|---|---|
| ⭐ **Minimisation** | ⭐ **collect only what you need — and the cheapest way to protect data is to not have it.** *"Why do we store date of birth?"* is a legitimate design question |
| ⭐ **Purpose limitation** | data collected for X may not be silently used for Y |
| ⭐ **Retention limits** | ⭐ **a deletion schedule, enforced by a job — not a policy document.** "We keep everything forever" is a liability, not an asset |
| **Consent** | freely given, specific, revocable, ⭐ **and recorded — you must be able to prove it** |
| **Right of access / portability** | export a user's data on request |
| ⭐ **Right to erasure** | the hard one — see below |
| ⭐ **Data residency** | ⭐ *"EU data stays in the EU"* — an **architectural** constraint that forces regional deployments/sharding, and it usually arrives as a **sales** requirement |
| **Pseudonymisation** | ⭐ **use a `subject_id`, never an email, as the key everywhere** |

⭐ **Privacy by design means these are decided when you draw the diagram, not retrofitted** — retrofitting
erasure into a system that spread emails across 12 stores is a multi-quarter project.

### ⭐⭐ Erasure in an immutable log — gate Q2

**The contradiction:**

> **Event sourcing says events are immutable and kept forever. GDPR Article 17 says the subject may demand
> erasure.**

⭐ **You cannot delete the event** — it breaks replay, the audit trail, every downstream projection, and the
ledger's arithmetic. ⭐ **You cannot keep the personal data either.** *"Just delete the row"* is not
available, and **saying that is the first half of the answer.**

### ⭐ The resolution: crypto-shredding

> ⭐ **Encrypt each subject's personal fields with a PER-SUBJECT key. Keep the keys in a separate MUTABLE
> keystore. To erase a subject, DESTROY THEIR KEY.**

⭐ **What you proved in the lab:**

| Property | Result |
|---|---|
| ⭐ **Personal data gone** | `readPersonal()` → `null`; 2,000 random-key attempts all failed the GCM auth tag |
| ⭐ **Log unchanged** | 7 events before and after, sequence numbers intact — ⭐ **replay, ordering and causality all still work** |
| ⭐ **Business data intact** | ⭐ **revenue £275.49 → £275.49**, order count unchanged |
| **Other subjects unaffected** | per-subject keys ⇒ blast radius = 1 |
| ⭐ **Idempotent and provable** | shredding twice is a no-op, and ⭐ **"is Alice erased?" is answerable — the key is absent** |

⭐ **Events touched: 0. Projections rebuilt: 0. Backups rewritten: 0.**

### ⭐ The critical design decision: the cleartext/encrypted split

| ⭐ **Cleartext** | ⭐ **Encrypted** |
|---|---|
| amounts, timestamps, order ids, event types, **a pseudonymous subject id** | name, email, address, phone |
| ⭐ **This is what keeps aggregates, reporting and replay working after erasure** | |

⚠️ **Getting this split wrong is the whole failure mode. Under-encrypt and you cannot comply; over-encrypt
and your system stops working when you do — and the decision is permanent**, because anything left in
cleartext can never be erased.

⭐ **And it's a legal point too: tax law requires you to keep transaction records for years, and GDPR
explicitly permits retention for a legal obligation.** ⭐ **Crypto-shredding satisfies both at once — it isn't
a workaround, it's the design that reconciles them.**

### ⚠️ Where crypto-shredding is harder than it looks

| | |
|---|---|
| ⭐ **1. The keystore becomes your most critical system** | Lose it and you've lost all personal data for every user. ⭐ **Yet its backups must be RETENTION-LIMITED — a backup of the keystore is a backup of your ability to un-erase.** That tension is the real difficulty |
| ⭐ **2. Anything decrypted downstream escapes the scheme** | Projections, search indexes, caches, warehouses, log lines, support tickets, that CSV someone emailed. ⭐ **Keep derived stores REBUILDABLE and rebuild after a shred** ([Phase 8 CQRS](../../phase-08-architecture/notes/05-cqrs.md)) |
| **3. Key rotation** | Rotating a subject key means rewriting the log. ⭐ **Envelope encryption fixes it** — a rotatable KMS master key wraps the per-subject data keys, so rotation only touches the keystore ([07](07-encryption-and-key-management.md)) |
| ⭐ **4. Backups of the LOG are fine — and that's the elegant part** | An old backup holds ciphertext whose key no longer exists, so restoring it does **not** resurrect the data. ⭐ **Compare with row deletion, where restoring a backup silently un-deletes the user** |
| **5. Erasure isn't absolute** | You may retain for legal obligations; Article 17 has exceptions. ⭐ **This is a constraint that's LEGAL rather than technical — the phase's whole point** |

### Audit logs

⭐ **Access to personal data should itself be logged** — who read what, when, why. ⚠️ **And the audit log must
be tamper-evident** (append-only, hash-chained, or shipped to a separate account) — ⭐ **an audit log an
attacker can edit is worse than none, because you'll trust it.**

⚠️ **The recursion to notice: audit logs contain personal data too**, so they need their own retention and
erasure story.

---

## In your own words

**⭐ Name two things that are PII but people forget. What does that imply about your logging pipeline?**

>

**⭐ Why is minimisation the cheapest protection?**

>

**Why is a retention schedule a job and not a document?**

>

**⭐ State the event-sourcing / GDPR contradiction, and why "delete the row" isn't available.**

>

**⭐ Explain crypto-shredding in three sentences.**

>

**⭐ Cite what you proved in the lab — four properties.**

>

**⭐ Describe the cleartext/encrypted split and why getting it wrong fails both ways.**

>

**⭐ Why does this satisfy tax law AND GDPR at once?**

>

**⭐ Name the five hard parts. Which is the real tension?**

>

**⭐ Why are backups of the log fine, and how does that compare with row deletion?**

>

**⭐ Now give the whole gate Q2 answer in 60 seconds.**

>

---

## Links

- ⭐ **You built and proved it** → [`../lab/crypto-shredding/run.js`](../lab/crypto-shredding/run.js)
- ⭐ **Gate Q2** → [`../GATE.md`](../GATE.md)
- Envelope encryption and rotation → [07-encryption-and-key-management.md](07-encryption-and-key-management.md)
- ⭐ Event sourcing and its costs → [Phase 8 note 06](../../phase-08-architecture/notes/06-event-sourcing.md)
- Rebuildable projections → [Phase 8 note 05](../../phase-08-architecture/notes/05-cqrs.md)
- Data residency and tenant isolation → [13-tenant-isolation-as-security.md](13-tenant-isolation-as-security.md)
- Compliance vocabulary → [14-compliance-vocabulary.md](14-compliance-vocabulary.md)
