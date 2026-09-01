# 10·08 · Password Storage

> **Why this exists:** *"bcrypt, not SHA"* is repeated everywhere and almost never quantified. ⭐ **You
> measured it: 150,400× fewer guesses per second.** The argument is economic, and having the number makes it
> unanswerable.

---

## Reference

### ⭐ The one question

> ⭐ **HOW MANY GUESSES PER SECOND CAN AN ATTACKER MAKE?**

**A general-purpose hash is designed to be FAST.** That's a virtue for checksums and a catastrophe for
passwords — ⭐ **because the attacker gets the same speed you do, and they have your whole user table.**

### ⭐ What you measured (one laptop core)

| Algorithm | Hashes/sec | Time each |
|---|---|---|
| MD5 | ⚠️ **1.7M/s** | 0.6 µs |
| SHA-1 | ⚠️ 1.9M/s | 0.5 µs |
| ⚠️ **SHA-256** | ⚠️ **1.8M/s** | 0.5 µs |
| ⚠️ **SHA-256 + salt** | ⚠️ **1.7M/s** | ⭐ **0.6 µs — essentially identical** |
| PBKDF2-SHA256 10k | 1.1k/s | 0.9 ms |
| PBKDF2-SHA256 600k | 19.1/s | 52.4 ms |
| scrypt N=16384 (~16 MB) | 51.5/s | 19.4 ms |
| ⭐ **scrypt N=65536 (~64 MB)** | ⭐ **12.0/s** | 84 ms |

### ⭐ The attacker economics

**Time to exhaust each candidate set, on this one laptop core:**

| Candidate set | SHA-256 | scrypt 64 MB |
|---|---|---|
| ⭐ **the top 10,000 common passwords** | ⭐ **5.6 MILLIseconds** | ⭐ **14.0 minutes** |
| a 6-char lowercase password | ⚠️ 2.8 minutes | 298 days |
| a leaked 1-billion-password list | ⚠️ 9.1 minutes | 3 years |
| an 8-char lower+digit password | 17.9 days | 7,456 years |

> ⭐ **READ THE FIRST ROW AGAIN.** Against the 10,000 most common passwords — **where real attackers start,
> because real users pick them** — SHA-256 gets through the entire list in **five milliseconds**.
>
> ⭐ **NO PASSWORD POLICY SAVES YOU THERE.** The defence is making each *guess* expensive, and that is the
> only thing a password hash is for.

⚠️ **And this is one laptop core.** A modern GPU does ~10¹⁰–10¹¹ SHA-256/sec; a rig of 8 is ~1000× this.
⭐ **Treat the SHA numbers as wildly optimistic for the defender.**

⭐ **The ratio is the argument: 150,400× fewer guesses per second, for 84 ms on your login endpoint.** You
pay milliseconds once per login; the attacker pays it for every guess.

### ⭐ What the salt is actually for (it is not speed)

⭐ **You measured SHA-256 vs SHA-256+salt as identical.** A salt doesn't slow a single guess at all. What it
does:

| | |
|---|---|
| ⭐ **Rainbow tables become useless** | a precomputed table is per-salt |
| ⭐ **One dictionary run no longer cracks EVERY user** | the attacker must repeat the whole effort **per user** |
| **Identical passwords stop being visible in the dump** | ⚠️ unsalted, two users with `password123` have identical hashes |

> ⭐ **THE SALT DEFEATS AMORTISATION. THE WORK FACTOR DEFEATS SPEED. You need both — they fix different
> things**, and being able to state that distinction is the point of this note.

**Also: a *pepper*** — a secret value, the same for all users, stored *outside* the database (in a KMS/HSM).
⭐ **A database-only breach then yields nothing**, because the attacker lacks the pepper. Cheap defence in
depth.

### Choosing

| | |
|---|---|
| ⭐ **Argon2id** | ⭐ **the current OWASP recommendation.** Memory-hard *and* side-channel resistant |
| **scrypt** | also memory-hard; built into Node; a fine choice |
| **bcrypt** | battle-tested and everywhere; ⚠️ **caps input at 72 bytes**, not memory-hard |
| **PBKDF2** | ⚠️ weakest of the four (not memory-hard) — ⭐ **but FIPS-approved, which sometimes decides it** |
| ⛔ **SHA / MD5** | ⭐ **never, at any iteration count you'd apply by hand** |

> ⭐ **WHY "MEMORY-HARD" IS THE KEY WORD:** a GPU has thousands of cores but limited memory per core. Forcing
> each guess to touch 64 MB means a GPU runs a *handful* of guesses in parallel instead of thousands.
> ⭐ **Memory-hardness is what removes the attacker's hardware advantage — iteration count alone does not.**

### ⭐ Tuning and upgrading

⭐ **Tune to YOUR hardware, not a blog post: pick the cost that takes ~100–250 ms on your login server, and
raise it every couple of years.**

⭐ **The encoded hash stores its own parameters** (`$argon2id$v=19$m=65536,t=3,p=4$salt$hash`), so you can
upgrade transparently: **on a successful login, if the stored work factor is below current, re-hash the
now-known-correct plaintext and store the new hash.** ⭐ **That's the answer to "how do you migrate 10 million
users to a stronger hash?"** — and for users who never log in, you can also wrap the old hash in the new
algorithm (`argon2(bcrypt(pw))`) and unwrap on next login.

### ⚠️ The things around it, which matter as much

⭐ **Rate-limit the login endpoint** — online guessing is the attack you can actually *see* and the cheapest
to stop ([Phase 9 note 03](../../phase-09-building-blocks/notes/03-rate-limiter-as-a-component.md)) ·
⭐ **a slow hash is a DoS surface** — an unauthenticated endpoint burning 84 ms of CPU per request needs its
own bulkhead and limits · **constant-time comparison** · ⭐ **check signups against known-breached password
lists** (Have I Been Pwned's k-anonymity API) · ⚠️ **never log, email, or store a password recoverably** ·
⭐ **prefer not to have passwords at all — passkeys/WebAuthn, or magic links** ·
⭐ **MFA beats every one of these: password hashing limits the damage of a breach; MFA prevents the account
takeover.**

⚠️ **And design the reset flow carefully** — it's a full authentication bypass if it's weak: single-use,
short-lived, hashed tokens; ⭐ **don't reveal whether an email is registered**; invalidate all sessions on
reset.

---

## In your own words

**⭐ State the one question that the whole argument reduces to.**

>

**⭐ Cite your numbers: SHA-256 vs scrypt, and the top-10k row specifically.**

>

**⭐ Why does no password policy save you against the common-password list?**

>

**⭐ What is the salt for — three things — and what is it NOT for?**

>

**⭐ Say the sentence about amortisation vs speed.**

>

**What is a pepper, and what breach does it defend against?**

>

**⭐ Why is "memory-hard" the key property?**

>

**⭐ How do you migrate 10 million users to a stronger hash?**

>

**Name four things around password storage that matter as much as the hash.**

>

**⭐ What beats all of it?**

>

---

## Links

- ⭐ **You measured all of this** → [`../lab/password-hashing/run.js`](../lab/password-hashing/run.js)
- Rate-limit the login endpoint → [Phase 9 note 03](../../phase-09-building-blocks/notes/03-rate-limiter-as-a-component.md)
- A slow hash needs a bulkhead → [Phase 7 note 04](../../phase-07-reliability/notes/04-bulkheads-and-isolation.md)
- Hashing ≠ encryption → [07-encryption-and-key-management.md](07-encryption-and-key-management.md)
- Sessions after login → [02-sessions-and-tokens.md](02-sessions-and-tokens.md)
- Credential stuffing and abuse → [11-ddos-and-abuse.md](11-ddos-and-abuse.md)
