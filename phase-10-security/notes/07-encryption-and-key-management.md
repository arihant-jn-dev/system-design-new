# 10·07 · Encryption & Key Management

> **Why this exists:** "encrypted at rest" is a checkbox everyone claims and few can explain. ⭐ **The
> interesting question is never the cipher — it's WHERE THE KEYS LIVE AND HOW THEY ROTATE**, and that's what
> makes [crypto-shredding](09-pii-and-privacy-by-design.md) possible.

---

## Reference

### In transit vs at rest — and the gap between them

| | |
|---|---|
| ⭐ **In transit** | **TLS 1.3** everywhere, including *internal* traffic ([04](04-service-to-service-auth.md)). HSTS, no mixed content, modern cipher suites, and ⭐ **mTLS between services** |
| **At rest** | disk/volume encryption, database TDE, encrypted backups, encrypted object storage |
| ⭐ **The gap** | ⭐ **Disk encryption only protects against someone STEALING THE DISK.** A compromised application, a SQL injection, or a `SELECT *` by an over-privileged analyst all see plaintext — the database decrypts for anyone who can query it |

> ⭐ **SAY THIS: "at rest" defends a narrow threat — physical media and decommissioned drives. It does
> nothing against the attacks that actually happen.** ⭐ **For sensitive fields you need FIELD-LEVEL
> encryption, where the application holds the key and the database never sees plaintext.**

### ⭐ Envelope encryption — the pattern to know

⭐ **Encrypt data with a Data Encryption Key (DEK); encrypt the DEK with a Key Encryption Key (KEK) held in a
KMS; store the encrypted DEK NEXT TO the data.**

```
plaintext ──DEK──▶ ciphertext          stored together
DEK       ──KEK──▶ encrypted DEK  ──┘
                    ⭐ KEK never leaves the KMS/HSM
```

| ⭐ Why this shape wins | |
|---|---|
| ⭐ **The KEK never leaves the KMS**, so it can't be exfiltrated | |
| ⭐ **You don't send your data to the KMS** — only the tiny DEK. **Bulk crypto happens locally, at full speed** | |
| ⭐ **ROTATING THE KEK ONLY RE-ENCRYPTS THE DEKs, NOT THE DATA** | ⭐ **this is the whole point — rotation becomes cheap and therefore actually happens** |
| Per-record or per-tenant DEKs give you fine-grained control | ⭐ **…and that's exactly what makes crypto-shredding work** |

⭐ **You built this shape in the lab** — a per-subject data key, destroyed to erase the subject. **Add a KMS
KEK on top and the master key rotates without touching the event log.**

### Key rotation

| | |
|---|---|
| ⭐ **Why** | limits the blast radius of an undetected compromise, and it's a compliance requirement (PCI, SOC 2) |
| ⭐ **Keys must be VERSIONED** | ⭐ **store the key id with the ciphertext**, or you can never decrypt old data |
| **Rotate the KEK** | cheap — re-encrypt DEKs only |
| **Rotate a DEK** | requires re-encrypting the data; usually done lazily on write |
| ⭐ **Rotation must be routine, not an incident** | ⭐ **If you can't rotate calmly on a Tuesday, you can't rotate during a breach — which is when you need to** |

### Field-level encryption & tokenization

| | | |
|---|---|---|
| ⭐ **Field-level encryption** | encrypt specific columns in the app | ⚠️ **you lose indexing, sorting and searching on that column** — the real cost |
| ⭐ **Tokenization** | replace the value with a meaningless token; the real value lives in a separate vault | ⭐ **The standard answer for card data — it removes those systems from PCI scope entirely** |
| **Deterministic encryption** | same plaintext → same ciphertext, so equality search works | ⚠️ **leaks equality**, and therefore frequency — a known weakness |
| ⚠️ **Searchable/homomorphic** | | ⚠️ **niche and slow; name it, don't propose it** |

⭐ **Tokenization's real value is SCOPE REDUCTION**, and that's an architectural argument, not a
cryptographic one — ⭐ **you're moving the compliance boundary, which is cheaper than securing everything
inside it.**

### ⭐ Rules that keep you out of trouble

⭐ **Never invent crypto** — use a vetted library (libsodium, the cloud KMS SDK, your platform's crypto).
⭐ **Prefer authenticated encryption (AES-GCM, ChaCha20-Poly1305)** — ⚠️ *unauthenticated ciphertext can be
tampered with*, and the auth tag is what made the lab's shredded events undecryptable rather than merely
garbled. ⭐ **Never reuse a nonce/IV with the same key** (catastrophic for GCM — it leaks the key stream).
**Generate keys from a CSPRNG.** ⚠️ **Encryption is not integrity, and it is not authentication.**

### Where keys live

| | |
|---|---|
| ⭐ **A cloud KMS** (AWS KMS, GCP KMS, Azure Key Vault) | ⭐ **the default: HSM-backed, audited, IAM-controlled, rotation built in** |
| **HashiCorp Vault** | cloud-neutral; also dynamic database credentials |
| **A dedicated HSM / CloudHSM** | when a regulator requires it |
| ⚠️ **Environment variables / config files / git** | ⭐ **not key management** ([12](12-secrets-management.md)) |

⭐ **And the question that reveals whether it's real: WHO CAN DECRYPT?** If your on-call engineer can read
every customer's data with their normal credentials, ⭐ **encryption at rest has bought you very little.**
**KMS access policies, separate roles for encrypt vs decrypt, and audit logs on key use are the controls
that matter.**

---

## In your own words

**⭐ What threat does disk-level "encryption at rest" actually defend against — and what does it NOT?**

>

**⭐ Draw envelope encryption. Name three reasons it's the right shape.**

>

**⭐ Why does the KEK/DEK split make rotation cheap, and why does that matter?**

>

**Why must keys be versioned?**

>

**⭐ Why is "if you can't rotate on a Tuesday" the test?**

>

**Field-level encryption's real cost? Tokenization's real benefit?**

>

**⭐ Why authenticated encryption — and what did you see it do in the lab?**

>

**What happens if you reuse a nonce with GCM?**

>

**⭐ What's the question that reveals whether encryption at rest is meaningful?**

>

---

## Links

- ⭐ **You built envelope-style per-subject keys** → [`../lab/crypto-shredding/run.js`](../lab/crypto-shredding/run.js)
- ⭐ Crypto-shredding and GDPR → [09-pii-and-privacy-by-design.md](09-pii-and-privacy-by-design.md)
- Passwords are hashed, not encrypted → [08-password-storage.md](08-password-storage.md)
- TLS/mTLS between services → [04-service-to-service-auth.md](04-service-to-service-auth.md)
- Secrets ≠ keys → [12-secrets-management.md](12-secrets-management.md)
- PCI scope reduction → [14-compliance-vocabulary.md](14-compliance-vocabulary.md)
