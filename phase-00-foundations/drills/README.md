# Drills — Estimation

The roadmap says: *"Do 10 of these until it's reflex."* Reflex is the operative word. In an interview you
have ~3 minutes for capacity estimation, while talking, while the interviewer watches. That only works if
the arithmetic is automatic.

---

## How to run these

1. **Paper. Pen. No calculator. No notes.** A timer set to 3 minutes.
2. Open [`estimation-drills.md`](estimation-drills.md). Do **one** problem.
3. **Say your assumptions out loud** as you write them. This is not optional — the talking is half the skill,
   and doing it silently trains the wrong thing.
4. Check against [`estimation-solutions.md`](estimation-solutions.md).
5. **Score yourself on order of magnitude, not on digits.** Within 2–3× is a pass. 10× off is a fail — find
   out which step caused it.
6. Log the result in the table below.

**Two per day for five days beats ten in one sitting.** Spacing is what makes it stick.

---

## The recipe (memorise this shape, not the answers)

Every one of these problems is the same five lines:

```
1. Assumptions      state DAU, actions/user/day, bytes/item, read:write ratio
2. QPS              actions per day ÷ 10^5           → then × 2–3 for peak
3. Storage          items/day × bytes → × 400 for a year → × 3 for replication
4. Bandwidth        QPS × bytes  (× 8 for bits, if quoting Gbps)
5. THE CONCLUSION   "so the hard part here is ___, which means ___"
```

**Line 5 is the one being marked.** Lines 2–4 are arithmetic anyone can do. The conclusion — *what the
numbers mean for the design* — is what separates a senior answer from a calculator.

Reference tables: [`../notes/01-napkin-math.md`](../notes/01-napkin-math.md)

---

## Score log

| # | Problem | Date | Time | Within 3×? | What I got wrong |
|---|---|---|---|---|---|
| 1 | Twitter-scale feed |  |  | ☐ |  |
| 2 | URL shortener |  |  | ☐ |  |
| 3 | Chat / WhatsApp |  |  | ☐ |  |
| 4 | Photo sharing |  |  | ☐ |  |
| 5 | Video platform |  |  | ☐ |  |
| 6 | Ride-hailing location pings |  |  | ☐ |  |
| 7 | Ad click aggregator |  |  | ☐ |  |
| 8 | Ad serving latency budget |  |  | ☐ |  |
| 9 | Cache sizing |  |  | ☐ |  |
| 10 | Metrics system cardinality |  |  | ☐ |  |

**Target: the last three take under 3 minutes each and land within 2×.**

---

## Common mistakes to watch for in your own work

| Mistake | Fix |
|---|---|
| Forgetting **peak** (only quoting average) | Always state both. Peak = 2–3× average. |
| Forgetting **replication ×3** on storage | Raw storage is never the answer |
| Forgetting the **read:write ratio** — sizing only for writes | Reads are usually the actual problem |
| Confusing **bits and bytes** in bandwidth | ×8. Networks are quoted in bits, storage in bytes. |
| Using exact numbers (86,400 not 10^5) | Round. You're burning your 3 minutes on arithmetic. |
| **Computing numbers and never using them** | End every drill with the "so the hard part is…" sentence |
| Sizing for peak-of-all-time when told 10 K users | Design for the scale you were *given* |
