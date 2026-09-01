# 10·14 · Compliance Vocabulary

> **Why this exists:** the roadmap's phrasing is exact — ⭐ ***"enough to know when a design constraint is
> LEGAL rather than technical."*** You are not being asked to be a compliance officer. ⭐ **You are being
> asked to recognise the moment when the answer is "because the contract says so," and to stop optimising.**

---

## Reference

### ⭐ The framework you actually need

> ⭐ **Some requirements cannot be traded away by a better design. Recognising one and saying so is the
> skill.**

⚠️ **"We could just cache it at the edge" is a great answer until the data may not leave the EU.**
⭐ **"We'd use one shared cluster" is efficient until the contract says dedicated infrastructure.**

⭐ **The tell in an interview: when you propose an optimisation and the constraint is legal, say so
explicitly** — *"that would be the efficient design, but if we're in PCI scope I'd tokenize instead, because
the audit cost of keeping card data outweighs it."* ⭐ **That sentence reads as seniority more reliably than
any amount of technical depth.**

### The vocabulary

| | What it is | ⭐ What it does to your design |
|---|---|---|
| ⭐ **SOC 2** | An *audit report* (not a certification) on controls: security, availability, confidentiality, processing integrity, privacy. **Type I** = design at a point in time; ⭐ **Type II** = operating effectively over 3–12 months | ⭐ **Access control, audit logging, change management, encryption, on-call and incident process must all be DEMONSTRABLE with evidence.** ⭐ **Very often a B2B SALES blocker — enterprises won't sign without it** |
| ⭐ **PCI-DSS** | The card-industry standard for handling card data | ⭐ **SCOPE IS EVERYTHING.** Every system that touches card data is in scope and must be audited. ⭐ **So the design goal is SCOPE REDUCTION: tokenize, use a hosted payment page/iframe, never let a PAN reach your servers** ([07](07-encryption-and-key-management.md)) |
| **HIPAA** | US health information (PHI) | BAAs with every vendor, encryption, audit trails, minimum-necessary access, breach notification |
| ⭐ **GDPR** | EU personal data | ⭐ **Lawful basis, minimisation, retention limits, right of access/erasure/portability, DPAs with processors, 72-hour breach notification, and residency pressure** ([09](09-pii-and-privacy-by-design.md)) |
| **CCPA/CPRA** | California | similar shape; opt-out of "sale" rather than opt-in consent |
| **ISO 27001** | An information-security management system | ⭐ Process-heavy; often the international counterpart to SOC 2 |
| **FedRAMP** | US government cloud | very heavy; changes your whole deployment model |

### ⭐ The four that actually change architecture

Most compliance is process. ⭐ **These four are the ones that show up as boxes on your diagram:**

| | |
|---|---|
| ⭐ **1. Data residency** | *"EU data stays in the EU."* ⭐ **Regional deployments, a directory mapping tenant → region, and regional pipelines. You CANNOT retrofit this cheaply** — it touches every store, cache, queue, log and backup ([13](13-tenant-isolation-as-security.md)) |
| ⭐ **2. PCI scope** | ⭐ **Tokenization moves the compliance boundary**, which is an architectural decision made for a legal reason |
| ⭐ **3. Right to erasure** | ⭐ **Forces crypto-shredding or equivalent into an immutable/event-sourced design** ([09](09-pii-and-privacy-by-design.md)) |
| ⭐ **4. Retention requirements** | ⭐ **Note they run BOTH WAYS and can conflict**: tax law says keep transaction records for 7 years; GDPR says delete on request. ⭐ **Crypto-shredding resolves exactly this** — keep the record, destroy the personal data |

⭐ **Recognising that conflict, and naming the design that satisfies both, is the strongest compliance point
you can make in a design discussion.**

### Terms you should recognise

⭐ **Data controller vs processor** (⭐ *you're usually the controller for your users and a processor for your
B2B customers' data — it determines who is liable*) · **DPA** (data processing agreement, required with
every sub-processor) · **BAA** (the HIPAA equivalent) · **DPIA** (an impact assessment for risky
processing) · ⭐ **sub-processor list** (⭐ *customers must be told which vendors touch their data — which
means adding an AI vendor is a compliance event, not just a procurement one*) · **breach notification
windows** (GDPR 72 hours) · **right to be informed / lawful basis** (consent is only one of six).

### ⭐ How to bring it up without overclaiming

⭐ **Do:** flag when a constraint is legal · ask *"is there a residency or scope requirement?"* early, because
it's expensive later · ⭐ **name the architectural consequence** ("that means regional deployments and a
tenant→region directory") · ⭐ **say "I'd confirm with legal"** — that is the correct and expected answer.

⚠️ **Don't:** claim to know whether something is *compliant* (you don't, and it's fact-specific) · quote
regulation numbers you're unsure of · ⭐ **treat compliance as a checkbox at the end** — residency and PCI
scope are load-bearing structural decisions, and retrofitting them is a multi-quarter project.

---

## In your own words

**⭐ State the framework: what is the actual skill this note is for?**

>

**⭐ Give an example of an optimisation that a legal constraint invalidates, and how you'd say it out loud.**

>

**SOC 2 — what is it actually, Type I vs II, and why does it usually appear?**

>

**⭐ What is the design goal for PCI, and why?**

>

**⭐ Which four requirements actually change your architecture?**

>

**⭐ Why can't data residency be retrofitted cheaply?**

>

**⭐ Describe the retention conflict, and the design that resolves it.**

>

**Controller vs processor — why does the distinction matter?**

>

**⭐ What's the correct thing to say when you don't know the legal answer?**

>

---

## Links

- ⭐ GDPR erasure, in practice → [09-pii-and-privacy-by-design.md](09-pii-and-privacy-by-design.md)
- Residency and physical isolation → [13-tenant-isolation-as-security.md](13-tenant-isolation-as-security.md)
- Tokenization and scope reduction → [07-encryption-and-key-management.md](07-encryption-and-key-management.md)
- Never build payments → [Phase 9 note 16](../../phase-09-building-blocks/notes/16-payments-primitives.md)
- ⭐ Buy vs build, and where legal cost dominates → [Phase 8 note 14](../../phase-08-architecture/notes/14-build-vs-buy.md)
- Audit logging and change management → [Phase 7 note 11](../../phase-07-reliability/notes/11-deployment-safety.md)
