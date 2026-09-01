# 04·10 · CRDTs & Collaborative State

> **Why this exists:** CRDTs are the principled answer to "two replicas both accepted a write — now what?"
> They're also how Figma, Linear and Notion work, so they come up in any collaborative-editing or
> offline-first design.

---

## Reference

### The idea

**A Conflict-free Replicated Data Type is a data structure whose merge operation is:**

| Property | Meaning |
|---|---|
| **Commutative** | `merge(a,b) = merge(b,a)` — order of arrival doesn't matter |
| **Associative** | `merge(merge(a,b),c) = merge(a,merge(b,c))` — grouping doesn't matter |
| **Idempotent** | `merge(a,a) = a` — duplicate delivery is harmless |

**Consequence: replicas that have seen the same set of updates converge to the same state, regardless of the
order or number of times they received them.**

> ⭐ **That's why there is no "conflict": the conflict is resolved by the data structure's algebra, not by a
> policy you had to invent.** Contrast with LWW ([3c-05](../../phase-03-databases/notes/3c-05-multi-leader.md)),
> which is a *policy* — and a lossy one.

**And notice what those three properties give you for free: idempotent + commutative merge means
at-least-once, out-of-order delivery is fine.** CRDTs and unreliable networks are a natural fit.

### The two flavours

| | **State-based (CvRDT)** | **Operation-based (CmRDT)** |
|---|---|---|
| Ships | The whole state (or a delta) | The individual operations |
| Requires | Nothing — merge is idempotent | **Exactly-once, causally-ordered delivery** |
| Bandwidth | Higher (delta-CRDTs fix this) | Lower |
| Simpler to reason about | ✅ | ➖ |

**State-based is more robust** (duplicates and reordering are harmless); op-based is more efficient but pushes
requirements onto your transport.

### The catalogue

| Type | Merge rule | Use |
|---|---|---|
| **G-Counter** (grow-only) | Per-node counts; merge = **max per node**, value = sum | Likes, views, page counts |
| **PN-Counter** | Two G-Counters (increments, decrements) | Any counter that can decrease |
| **G-Set** | Union | Append-only tags |
| **2P-Set** | Add-set ∪ tombstone-set | Remove supported — **but once removed, never re-addable** |
| **LWW-Register** | Highest timestamp wins | Single values. ⚠️ Inherits all of LWW's problems ([04](04-time-and-clocks.md)). |
| **MV-Register** | Keep **all** concurrent values | Honest — surfaces the conflict to the app |
| ⭐ **OR-Set** (observed-remove) | Each add gets a unique tag; remove only removes **tags you observed** | **The practical set.** Add wins over a concurrent remove. |
| **RGA / Yjs / Automerge** | Sequence CRDTs | **Collaborative text editing** |

**Why the G-Counter works — the mechanism worth understanding:**
```
Node A: {A:3, B:2}      Node B: {A:1, B:5}
merge   = {A:max(3,1), B:max(2,5)} = {A:3, B:5}
value   = 3 + 5 = 8
```
**Each node only ever increments its *own* entry, so no update can be lost** — and taking the max per entry
is idempotent and commutative. That's the whole trick, and every other CRDT is a variation on it.

**Why OR-Set exists:** with a naive set, "A adds x" concurrent with "B removes x" is ambiguous. OR-Set tags
each add uniquely (`x#a1`), and a remove deletes only the tags it *saw* — so a concurrent add survives.
**"Add wins" is a deliberate, defensible choice.**

### The costs — be honest about these

| Cost | Detail |
|---|---|
| **Metadata growth** | Tombstones and per-node vectors accumulate. **Garbage collection is the genuinely hard part** — you can't drop a tombstone until you're sure everyone has seen the removal. |
| **Not every operation is expressible** | "Move this item to position 3" or a global invariant like "balance ≥ 0" has no CRDT |
| ⚠️ **Convergence ≠ correctness** | All replicas agreeing on a state that violates your business rule is still wrong. **CRDTs guarantee agreement, not validity.** |
| Larger payloads | Metadata rides with the data |

**That third row is the one to say out loud.** A CRDT will happily converge a bank balance to −£50. It
guarantees everyone *agrees* on −£50.

### OT vs CRDT for collaborative editing

| | **Operational Transformation** | **CRDT** |
|---|---|---|
| How | Transform each operation against concurrent ones (index 5 becomes index 6 after an insert at 2) | Give every character a unique, ordered identity |
| Needs a central server | ⚠️ **Usually yes** — to order operations | ❌ No — works peer-to-peer |
| Correctness | **Notoriously hard**; several published algorithms were later found buggy | Provable convergence |
| Metadata | Small | Larger (per-character IDs) |
| Used by | **Google Docs**, older Etherpad | **Figma, Linear, Automerge, Yjs**, newer systems |

> **The summary: OT is efficient but hard to get right and usually needs a central server; CRDTs cost
> metadata but converge provably and work offline.** The industry has been drifting toward CRDTs, largely
> because offline-first is now expected.

### Where CRDTs are the right answer

| Good fit | Poor fit |
|---|---|
| **Offline-first apps** (mobile, notes, calendars) | Anything with a **global invariant** (balance ≥ 0, seat count) |
| **Collaborative editing** | Strict ordering requirements |
| Multi-region counters, likes | Where you need a single authoritative decision → **consensus** |
| Shopping carts (Dynamo's original use) | Small data where a leader is simply easier |
| Presence, cursors | |

> **The interview framing:** *"CRDTs let every replica accept writes and converge without coordination —
> which makes them the right tool when availability and offline support matter more than a global invariant.
> They can't express constraints like 'never oversell inventory', because convergence isn't validity. For
> that I'd need consensus or a single owner for the value."*

---

## In your own words

**State the three algebraic properties, and derive why "no conflict" follows.**

>

**Why do those properties make CRDTs tolerant of at-least-once, out-of-order delivery?**

>

**Explain the G-Counter merge. Why can no increment be lost?**

>

**Why does OR-Set exist? What ambiguity does it resolve, and which side wins?**

>

**"Convergence is not correctness." Give a concrete example.**

>

**OT vs CRDT — the trade, and why the industry has drifted toward CRDTs.**

>

---

## Links

- Conflict resolution in multi-leader replication → [3c-05](../../phase-03-databases/notes/3c-05-multi-leader.md)
- Vector clocks and causality → [04-time-and-clocks.md](04-time-and-clocks.md)
- Causal consistency → [03-consistency-models.md](03-consistency-models.md)
- When you need consensus instead → [05-quorums-and-consensus.md](05-quorums-and-consensus.md)
- Google Docs / collaborative editing → **Phase 12 problem 28**
- Shapiro et al., *A Comprehensive Study of CRDTs* (2011) · **crdt.tech**
