# Phase 10 Lab

> ⭐ **The roadmap specifies NO lab for Phase 10.** This one exists because the repo's own rule is *"never
> learn a topic without building or breaking something"* — and three of these topics are unusually
> demonstrable. **The other topics in this phase genuinely are reading.**

⭐ **No Docker. No dependencies.** Node's built-in `crypto` is enough for all three.

```bash
node jwt/run.js               # ~1s
node password-hashing/run.js  # ~15s  (it is deliberately slow -- that's the point)
node crypto-shredding/run.js  # ~1s
```

---

# A · JWTs, built and broken

⭐ **The point of writing the verifier yourself is that the famous vulnerabilities stop being trivia.** You
watch each one work against a plausible-looking implementation, then watch the fix stop it.

### 1 · A JWT is signed, not encrypted

⭐ **Anyone can decode the payload — no key required.** The signature stops *tampering*, not *reading*.
⚠️ **So never put a secret in a JWT.**

### ⭐ 2 · The `alg: none` forgery

```
attacker sends {"alg":"none"} with role=admin, and no signature:

  naive verifier  (trusts the token's alg)     ⛔ ACCEPTED   {"role":"admin"…}
  strict verifier (server pins the alg)        ✅ REJECTED   (alg mismatch: got none, expected HS256)
```

### ⭐ 3 · HS256 / RS256 confusion

The RSA **public** key is public by design. The attacker HMAC-signs a token using it as the shared secret:

```
  confusable verifier (accepts either alg)     ⛔ ACCEPTED   {"role":"admin"…}
  strict verifier     (pinned to RS256)        ✅ REJECTED   (alg mismatch: got HS256, expected RS256)
```

> ⭐ **Same root cause both times: the token was allowed to choose the algorithm.**
> ⭐ **The fix is one line — the SERVER decides.** Any library that lets you `verify()` without naming the
> expected algorithm is handing that decision to the attacker.
>
> ⭐ **And note the asymmetry that justifies RS256: with HS256, every service that VERIFIES tokens holds the
> key that can also MINT them.**

### 4 · A valid signature is not a valid token

All correctly signed by us; all must still be rejected — expired, `nbf` in the future, wrong `aud`,
wrong `iss`. ⭐ **The `aud` check is the one people skip**, and without it a token minted for a low-value
internal service is accepted by your payments API.

### ⭐⭐ 5 · The revocation problem

```
1. user logs in                  -> token issued, exp in 15 min
2. user clicks "log out"         -> the client deletes its copy
3. server-side session destroyed -> (there is no server-side session)
4. attacker replays the token:      ⛔ ACCEPTED
```

> ⭐ **IT STILL WORKS.** And so does a token belonging to a user you just banned, or whose role you just
> downgraded, or whose password was just reset after a compromise.
>
> ⭐ **THE STATELESSNESS THAT MAKES JWTs FAST IS THE SAME PROPERTY THAT MAKES THEM UNREVOCABLE.**

**The fixes:** short expiry + refresh tokens · ⭐ **refresh rotation with reuse detection** (an old token
presented again ⇒ it was stolen ⇒ revoke the family) · a TTL'd denylist · a per-user "valid after T" epoch.

⭐ **And the question underneath: if you need instant revocation, per-request lookups and server-side state
anyway — you have rebuilt sessions, but worse.**

---

# ⭐ B · Why not SHA-256 for passwords — measured

**One laptop core:**

| Algorithm | Hashes/sec | Time each |
|---|---|---|
| MD5 | ⚠️ 1.7M/s | 0.6 µs |
| SHA-1 | ⚠️ 1.9M/s | 0.5 µs |
| ⚠️ **SHA-256** | ⚠️ **1.8M/s** | 0.5 µs |
| ⚠️ **SHA-256 + salt** | ⚠️ **1.7M/s** | ⭐ **identical — salting is not about speed** |
| PBKDF2-SHA256 10k | 1.1k/s | 0.9 ms |
| PBKDF2-SHA256 600k | 19.1/s | 52.4 ms |
| scrypt N=16384 (~16 MB) | 51.5/s | 19.4 ms |
| ⭐ **scrypt N=65536 (~64 MB)** | ⭐ **12.0/s** | 84 ms |

**Time to exhaust each candidate set:**

| Candidate set | SHA-256 | scrypt 64 MB |
|---|---|---|
| ⭐ **the top 10,000 common passwords** | ⭐ **5.6 MILLIseconds** | ⭐ **14.0 minutes** |
| a 6-char lowercase password | ⚠️ 2.8 minutes | 298 days |
| a leaked 1-billion-password list | ⚠️ 9.1 minutes | 3 years |
| an 8-char lower+digit password | 17.9 days | 7,456 years |

> ⭐ **READ THE FIRST ROW AGAIN.** Against the 10,000 most common passwords — where real attackers start,
> because real users pick them — **SHA-256 gets through the entire list in five milliseconds.**
> ⭐ **NO PASSWORD POLICY SAVES YOU THERE.**
>
> ⭐ **The ratio is the argument: 150,400× fewer guesses per second, for 84 ms on your login endpoint.**

⚠️ **And this is one laptop core.** A modern GPU does ~10¹⁰–10¹¹ SHA-256/sec — treat these as wildly
optimistic for the defender.

### What the salt is for (measured: not speed)

Two different users, the same password `password123`:

```
unsalted, user A   ef92b778bafe771e89245b89ecbc08a4…
unsalted, user B   ef92b778bafe771e89245b89ecbc08a4…   ⚠️ IDENTICAL
salted,   user A   3f1a…                                ✅ different
salted,   user B   9c07…                                ✅ different
```

> ⭐ **THE SALT DEFEATS AMORTISATION. THE WORK FACTOR DEFEATS SPEED. You need both — they fix different
> things.**

---

# ⭐ C · GDPR erasure in an immutable event log (gate Q2)

**The contradiction:** event sourcing says events are immutable and forever; GDPR Article 17 says the
subject may demand erasure. ⭐ **You can't delete the event, and you can't keep the data.**

**The resolution:** encrypt each subject's personal fields with a **per-subject key** (AES-256-GCM), keep
keys in a separate mutable keystore, and ⭐ **to erase a subject, destroy their key.**

```
BEFORE                                          AFTER  keystore.shred('cust-001')
seq type                subject  meta            personal        personal
1   CustomerRegistered  cust-001 plan=pro        Alice Smith  →  ⛔ UNRECOVERABLE
2   OrderPlaced         cust-001 o-1 £49.99      1 High St    →  ⛔ UNRECOVERABLE
3   CustomerRegistered  cust-002 plan=free       Bob Jones    →  Bob Jones
4   OrderPlaced         cust-001 o-2 £120.50     1 High St    →  ⛔ UNRECOVERABLE
5   OrderPlaced         cust-002 o-3 £30.00      2 Low Rd     →  2 Low Rd
```

**Proved, by trying to violate each property:**

| | |
|---|---|
| ⭐ Personal data gone | `readPersonal()` → `null`; **2,000 random-key attempts all failed the GCM auth tag** |
| ⭐ Log unchanged | **7 events before and after**, sequence numbers intact — replay, ordering, causality all work |
| ⭐ **Business data intact** | ⭐ **revenue £275.49 → £275.49**, order count unchanged |
| Other subjects unaffected | per-subject keys ⇒ blast radius = 1 |
| ⭐ Idempotent and provable | shredding twice is a no-op, and *"is Alice erased?"* is answerable |

⭐ **Events touched: 0. Projections rebuilt: 0. Backups rewritten: 0.**

### ⭐ The critical decision: the cleartext/encrypted split

**Cleartext:** amounts, timestamps, order ids, event types, a pseudonymous subject id — ⭐ **this is what
keeps aggregates and replay working after erasure.**
**Encrypted:** name, email, address.

⚠️ **Under-encrypt and you can't comply; over-encrypt and your system stops working when you do — and the
decision is permanent.**

⭐ **And it's a legal point too: tax law requires keeping transaction records for years, and GDPR permits
retention for a legal obligation. Crypto-shredding satisfies both at once.**

### ⚠️ The five hard parts

1. ⭐ **The keystore becomes your most critical system** — and its backups must be **retention-limited**, or
   you've backed up your ability to un-erase. **That tension is the real difficulty.**
2. ⭐ **Anything decrypted downstream escapes the scheme** — projections, search indexes, warehouses, logs.
   Keep derived stores **rebuildable**, and rebuild after a shred.
3. **Key rotation** rewrites the log → ⭐ **use envelope encryption with a KMS master key.**
4. ⭐ **Backups of the log are fine** — ciphertext whose key no longer exists. ⭐ **Compare with row deletion,
   where restoring a backup silently un-deletes the user.**
5. **Erasure isn't absolute** — legal-obligation exceptions exist. ⭐ **A constraint that's legal, not
   technical.**

---

## RESULTS — record your own

| Measurement | ⭐ Your result |
|---|---|
| JWT: did the naive verifier accept `alg:none`? | |
| JWT: did the token still work after "logout"? | |
| Hashing: SHA-256 hashes/sec | |
| Hashing: scrypt 64 MB hashes/sec | |
| ⭐ Hashing: the ratio | |
| ⭐ Hashing: top-10k list, SHA-256 vs scrypt | |
| Shredding: revenue before / after | |
| Shredding: events before / after | |

**⭐ Which of the three was most surprising?**

>

**⭐ Pick a system you've worked on. Which of these three is it currently getting wrong?**

>

---

## Files

| | |
|---|---|
| [`jwt/run.js`](jwt/run.js) | Part A — structure, two forgeries, claim checks, revocation |
| [`password-hashing/run.js`](password-hashing/run.js) | Part B — throughput, attacker economics, salt |
| [`crypto-shredding/run.js`](crypto-shredding/run.js) | Part C — gate Q2, with proofs |
