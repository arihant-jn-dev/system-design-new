# 09·16 · Payments Primitives

> **Why this exists:** the roadmap says these ⭐ ***"recur constantly"*** — and they do, well beyond payments.
> The double-entry ledger, reconciliation and webhook handling are the reusable parts. ⭐ **And this is the
> one domain where "eventually consistent, approximately right" is a bug, not a trade-off.**

---

## Reference

### ⭐ The double-entry ledger

> ⭐ **Never store a balance you can mutate. Store IMMUTABLE ENTRIES; the balance is their SUM.**

**Every transaction writes at least two entries — debits and credits that must sum to zero:**

```
transfer £50, alice -> bob

  txn_id  account          amount   
  t-991   alice:cash       -5000     ⭐ minor units (pence), integers
  t-991   bob:cash         +5000
                           ------
                              0      ⭐ THE INVARIANT: every txn sums to zero
```

| Why | |
|---|---|
| ⭐ **The invariant is checkable** | `SELECT sum(amount) FROM entries` over the whole system must be 0 — ⭐ **run it continuously; a non-zero total means you have a bug RIGHT NOW** |
| ⭐ **Money is never created or destroyed**, only moved between accounts | |
| ⭐ **Append-only ⇒ a complete audit trail** | you can always answer *"why is this balance what it is?"* |
| **Corrections are reversing entries**, never edits or deletes | |
| **Balance at any past instant** = sum entries up to that time | |

⚠️ **`UPDATE accounts SET balance = balance - 50` is the anti-pattern.** It destroys history, it's a hot-row
contention point ([05](05-counters-at-scale.md)), and ⭐ **when it's wrong you cannot tell why.**

⚠️ **Performance:** summing millions of entries per read is slow. ⭐ **Keep a materialised balance as a
CACHE, rebuildable from the entries, and verify it against the sum on a schedule.** ⭐ **The entries stay
the source of truth — that ordering is the point.**

### ⭐ Money representation

| ⭐ Do | ⚠️ Never |
|---|---|
| ⭐ **Integer MINOR UNITS** (`5000` = £50.00) | ⭐ **FLOATS. `0.1 + 0.2 != 0.3`** — this is a real, shipped class of bug |
| Or a fixed-point `DECIMAL(19,4)` | |
| ⭐ **Always store the CURRENCY with the amount** | a bare number is meaningless |
| ⭐ **Store the FX rate used, and when** | a converted amount you can't reproduce is unauditable |

⚠️ **Not every currency has 2 decimal places** — JPY has 0, KWD has 3. ⭐ **Store the exponent or look it up;
hardcoding 2 breaks internationally.** ⚠️ **And never sum across currencies.**

### ⭐ Authorize / capture

```
AUTHORIZE  -> funds held on the card, not taken     (expires in ~7 days)
CAPTURE    -> actually taken                        (at fulfilment)
VOID       -> release the hold                      (before capture)
REFUND     -> return money                          (after capture)
```

⭐ **The separation exists because you shouldn't take money for something you haven't shipped.** Authorize at
checkout, capture on dispatch. ⭐ **And partial capture is normal** — the customer ordered 3 items, you ship
2.

⚠️ **Auths expire.** A long fulfilment window means re-authorising, and ⭐ **that can fail** — which is a
business process (contact the customer), not an error to swallow.

### ⭐ Idempotency — the canonical case

⭐ **A payment is the operation where duplicate execution is unambiguously catastrophic**, so this is where
the full [idempotency store](14-idempotency-and-dedupe.md) is mandatory, not optional:

- ⭐ **A client-generated key per payment attempt, reused across every retry**
- ⭐ **Stored in the SAME transaction as the ledger entries**
- **The stored response is returned on replay** — never re-executed
- ⭐ **24-hour TTL minimum** (Stripe's default)

### ⭐ Webhooks — receiving them, and sending them

**Receiving** (from Stripe/PayPal/a bank):

| | |
|---|---|
| ⭐ **VERIFY THE SIGNATURE** | ⚠️ **an unauthenticated webhook endpoint is "anyone can mark any order as paid."** ⭐ **This is a real, exploited vulnerability class** |
| ⭐ **Respond `200` FAST, process asynchronously** | providers time out and retry, so slow processing *creates* duplicates |
| ⭐ **Idempotent by event ID** | providers retry aggressively and openly say delivery is at-least-once |
| ⭐ **Out-of-order delivery is normal** | ⭐ **`captured` can arrive before `authorized`. Use the event timestamp/version and ignore stale transitions** — don't assume ordering |
| ⭐ **Never trust the amount in the webhook alone** | ⭐ **re-fetch from the provider's API** before crediting anything |
| **Replay tooling** | you *will* need to reprocess a day of missed events |

**Sending** (to your own customers): sign the payload (HMAC + timestamp to prevent replay) · retry with
exponential backoff · a DLQ and a visible delivery log · ⭐ **let customers replay** — you're now someone
else's unreliable dependency.

### ⭐ Reconciliation — the part that separates real systems

> ⭐ **Your ledger and the provider's ledger WILL disagree. Reconciliation is not an error path — it is a
> scheduled, permanent, staffed process.**

**Daily: fetch the provider's settlement file, match to your entries, and classify every discrepancy:**

| | |
|---|---|
| **In yours, not theirs** | a payment you think succeeded but didn't |
| **In theirs, not yours** | ⭐ **a webhook you missed** — the most common case |
| **Amount mismatch** | fees, FX, partial capture |
| **Timing** | it settles tomorrow; not an error |

⭐ **Every discrepancy needs an owner, an ageing report and an escalation path.** ⚠️ **A payments system
without reconciliation is one that hasn't discovered its bugs yet** — and "we'd reconcile daily against the
provider's settlement file" is one of the highest-signal sentences you can say in a payments design.

### Also worth naming

⭐ **Never store raw card numbers** — tokenise via the provider; ⭐ **PCI scope reduction is itself an
architectural goal** ([Phase 8 note 14](../../phase-08-architecture/notes/14-build-vs-buy.md): *never build
payments*) · **3DS/SCA** adds an interactive step to the flow · **chargebacks and disputes** arrive months
later and need the audit trail · **the saga for order+payment+inventory** ([Phase 8 note 07](../../phase-08-architecture/notes/07-sagas-as-architecture.md))
— ⭐ **and note that "refund" is the compensating action, which is visible to the customer, not a rollback**.

---

## In your own words

**⭐ State the double-entry rule and the invariant you can check continuously.**

>

**⭐ Why is `UPDATE balance` an anti-pattern — three reasons?**

>

**How do you make balance reads fast without losing the ledger's authority?**

>

**⭐ How is money represented, and what breaks internationally?**

>

**Why does authorize/capture exist, and what can go wrong between them?**

>

**⭐ Why is a payment the canonical idempotency case? Where must the key be stored?**

>

**⭐ Five rules for receiving a webhook. Which one is a vulnerability class?**

>

**⭐ Why must you re-fetch from the provider rather than trust the webhook body?**

>

**⭐ What is reconciliation, why is it permanent, and what are the four discrepancy types?**

>

**Why should you never build payments yourself?**

>

---

## Links

- ⭐ The idempotency store → [14-idempotency-and-dedupe.md](14-idempotency-and-dedupe.md)
- Sagas, compensation ≠ rollback → [Phase 8 note 07](../../phase-08-architecture/notes/07-sagas-as-architecture.md)
- Event sourcing — a ledger *is* one → [Phase 8 note 06](../../phase-08-architecture/notes/06-event-sourcing.md)
- Balances are invariants, not counters → [05-counters-at-scale.md](05-counters-at-scale.md)
- Outbox/inbox, at-least-once → [Phase 6](../../phase-06-messaging/notes/)
- Transactions and isolation → [Phase 3B](../../phase-03-databases/notes/)
- Build vs buy → [Phase 8 note 14](../../phase-08-architecture/notes/14-build-vs-buy.md)
