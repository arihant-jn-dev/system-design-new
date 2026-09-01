# 07 · Consistency (Informal)

> **Why this exists:** you need working intuition *now* so you can say sensible things in Phases 1–3.
> The formal treatment (linearizability, CAP stated correctly, PACELC, causal consistency) is **Phase 4**.
> Deliberately keep this shallow — the goal is to stop saying "eventually consistent" as a magic phrase.

---

## Reference

### The core problem

Data is copied to more than one place (replicas, caches, shards, a CDN, a client). Copies take time to agree.
**Consistency is the set of rules about what a reader is allowed to see while they disagree.**

If you only ever had one copy of the data, consistency would not be a topic. It's the price of replication —
and you replicate for availability, latency, and throughput. **So consistency is what you trade away to get
those.** That framing is the whole point.

### Two different meanings of the word — don't mix them up

| | The **C in ACID** | Consistency in **distributed systems** |
|---|---|---|
| Means | Database invariants hold (FK constraints, `balance >= 0`) | All replicas agree on the value |
| Enforced by | The application + DB constraints | Replication protocol |
| Context | Transactions (Phase 3B) | Replication/CAP (Phase 3C, Phase 4) |

They are unrelated concepts that share a word. Interviewers do notice when you conflate them.

### The spectrum (informal for now)

| Model | Guarantee | Cost | Typical use |
|---|---|---|---|
| **Strong / linearizable** | Every read sees the latest committed write. The system behaves as if there's one copy. | Coordination on every write → higher latency; unavailable during partitions | Balances, inventory, locks, unique usernames |
| **Read-your-own-writes** | *You* always see *your* writes; others may lag | Cheap — route your reads to the primary briefly, or pin to a session | Profile edit, post a comment |
| **Monotonic reads** | You never see time go backwards (read new, then old) | Cheap — pin a user to one replica | Any paginated/refreshing list |
| **Consistent prefix** | You see writes in causal order (no reply before its question) | Moderate | Chat, comment threads |
| **Eventual** | If writes stop, replicas converge. No promise *when*. | Cheapest; highest availability | Like counts, view counts, feeds, DNS |

Strongest at the top, weakest at the bottom. **Every step down buys availability and latency.**

### Eventual consistency is not "inconsistent"

It's a real, bounded guarantee: *if writes stop, all replicas converge to the same value.* The lag is usually
milliseconds. It's the right default for most data.

The honest statement of its cost is behavioural, not theoretical:

> User posts a comment → the write goes to the primary → the user's refresh hits a replica that hasn't
> received it → **their own comment has vanished.** They post it again.

That's not a theoretical anomaly, it's a support ticket. And the fix is not "use strong consistency
everywhere" — it's **read-your-own-writes for that one path**: for a few seconds after a user's write, route
that user's reads to the primary (or to a replica known to have caught up).

> **The senior move is per-data-type, not global.** In one design:
> - Account balance → **strong**
> - "Was my post published?" → **read-your-own-writes**
> - Like count → **eventual** (nobody can tell 1,402 from 1,404)
>
> Saying "I'll use eventual consistency for the feed and strong consistency for the payment ledger, because
> the cost of being wrong is completely different" is exactly the sentence interviewers are listening for.

### The intuition to carry into Phase 4

Consistency costs **coordination**, and coordination costs **time** and **availability**:

- To guarantee a read sees the newest write, replicas must *talk* before answering.
- Talking takes at least one network round trip (0.5 ms in-DC, **150 ms cross-region** — note 02).
- **If they can't talk (network partition), they must choose:** answer possibly-stale data (stay available)
  or refuse to answer (stay consistent). There is no third option.

That last sentence is CAP, informally. Phase 4 states it properly, including why "CP vs AP" is an incomplete
description of a database and why PACELC is the better framing. **Don't try to memorise CAP now** — build the
intuition that *coordination = latency + fragility*, and the theory will land easily later.

### Vocabulary to use correctly starting today

- **Replication lag** — how far behind a replica is. Measure it in *seconds* and in *bytes/LSN*. It is not constant; it spikes under write load, which is exactly when it hurts.
- **Stale read** — a read that returned an older value than the latest committed write.
- **Anomaly** — a specific, named way things can look wrong. Learn the names in Phase 3B (write skew, lost update, phantom read); they are how you prove you understand isolation.
- **Convergence** — replicas ending up agreeing.
- **Quorum** — requiring a majority to respond, so read and write sets overlap. R + W > N (Phase 3C).

---

## In your own words

**Why does consistency only become a problem once data is replicated?**

>

**Distinguish the C in ACID from consistency in the distributed-systems sense.**

>

**A user posts a comment and it disappears on refresh. Name the problem and the targeted fix.**

>

**Pick a product you know. List 3 pieces of its data and the consistency level each actually needs — with the reason.**

> | Data | Level | Why |
> |---|---|---|
> |  |  |  |
> |  |  |  |
> |  |  |  |

**Why does stronger consistency cost availability during a network partition? Answer in your own words, no jargon.**

>

---

## Links

- Formal models, CAP stated correctly, PACELC, linearizability → **Phase 4**
- Isolation levels and anomalies → Phase 3B
- Replication lag, read-your-own-writes techniques, quorums → Phase 3C
- Cache invalidation is this same problem in a different costume → Phase 5
