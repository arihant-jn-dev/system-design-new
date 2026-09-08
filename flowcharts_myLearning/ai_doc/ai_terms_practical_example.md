# AI Terms — 2025-2026 Real World Examples
## Every Concept Through Two Live Scenarios You Actually Use

> **Scenario A** — NexaMind: Your AI Daily Life Assistant (trip planning, shopping, decisions)
> **Scenario B** — VibeCoder: AI Coding Assistant (exactly like Cursor + GitHub Copilot)
>
> Every concept follows: **What it is → Without it → With it → Real numbers**

---

## How to Read This

```
Each concept shows:
  1. WHAT IT IS      → one-line definition
  2. WITHOUT IT      → what breaks / what goes wrong
  3. WITH IT         → what works correctly
  4. REAL NUMBERS    → measurable difference
  5. 2025-26 EXAMPLE → what real products use today
```

---

# SCENARIO A — NexaMind: Your AI Daily Life Assistant

**The user**: Arihant, 24, software engineer.
He opens NexaMind and says:
> *"Plan me a 7-day Japan trip in April under ₹1.5 lakh. I love street food and anime culture."*

We'll build this system step by step. Every concept enters exactly when it's needed.

---

## 1. Tokens — The Fuel That Powers Every AI Request

**What it is**: LLMs don't read words — they split text into tokens (1 token ≈ ¾ of an English word). Every API call costs money based on tokens consumed.

**Without token awareness:**
```
Developer loads EVERYTHING into the prompt:
  → All of Arihant's past 200 trips (history)
  → All 50,000 Japan tourism articles (knowledge base)
  → Full Wikipedia article for every city mentioned

Result:
  → 200,000 tokens per request
  → Cost: ~$0.50 per query (using GPT-4o at $2.50/1M tokens)
  → 10,000 daily users × $0.50 = $5,000/day = $1.5 lakh/month
  → Startup bankrupt before launch
```

**With smart token management:**
```
Developer sends only what's NEEDED:
  System prompt (who NexaMind is)          →    400 tokens
  Arihant's profile (age, budget, style)   →    200 tokens
  Top 5 relevant Japan articles (RAG)      →  3,000 tokens
  Last 5 conversation turns                →  1,000 tokens
  Current question                         →     50 tokens
  ─────────────────────────────────────────────────────
  TOTAL                                    →  4,650 tokens

Cost per query: 4,650 × $2.50/1M = $0.0116 → less than 1 rupee!
Same 10,000 users → $116/day instead of $5,000/day → 43x cheaper
```

**Token pricing (March 2026):**
```
MODEL                  INPUT/1M tokens    OUTPUT/1M tokens    BEST FOR
────────────────────────────────────────────────────────────────────────────
GPT-4o                 $2.50              $10.00              General purpose
GPT-4.5                $75.00             $150.00             Most capable tasks
o3                     $15.00             $60.00              Hard reasoning
o3-mini                $1.10              $4.40               Cheap reasoning
Claude 3.7 Sonnet      $3.00              $15.00              Long context tasks
Gemini 2.0 Flash       $0.075             $0.30               High volume, cheap
DeepSeek R1            $0.55              $2.19               Cheap reasoning!
Llama 3.3 70B          Free (self-host)   Free                Privacy-sensitive
────────────────────────────────────────────────────────────────────────────

RULE: Use cheapest model good enough for the task.
  Classify intent → Gemini Flash ($0.075)
  Generate trip plan → GPT-4o ($2.50)
  Complex budget math → o3-mini ($1.10)
  Never use GPT-4.5 unless you have a specific reason.
```

---

## 2. Context Window — The AI's Working Memory

**What it is**: Maximum text the LLM reads in one request — its "RAM." When full, oldest content is forgotten or truncated.

**Without context window management:**
```
Arihant chats with NexaMind for 45 minutes.
At message #60, he says: "Book the ryokan you suggested earlier."

NexaMind: "I'm sorry, which ryokan are you referring to?"

The ryokan suggestion was in message #12 — now outside the context window.
The AI literally cannot see that conversation anymore.
Arihant gets frustrated: "I told you 20 minutes ago!"
```

**With proper context management:**
```
CONTEXT WINDOW ALLOCATION FOR NEXAMIND:

  Model: Claude 3.7 Sonnet  → 200,000 token context window
  (that's ~300 pages of text in one shot)

  ┌────────────────────────────────────────────────────┐
  │  System prompt + persona         →    500 tokens   │
  │  Arihant's saved profile         →    300 tokens   │
  │  Current trip plan (structured)  →  1,500 tokens   │
  │  Retrieved context (RAG)         →  3,000 tokens   │
  │  Full conversation so far        → 12,000 tokens   │
  │  Current message                 →    100 tokens   │
  │  ──────────────────────────────────────────────── │
  │  Total used                      → 17,400 tokens   │
  │  Buffer remaining                → 182,600 tokens  │
  └────────────────────────────────────────────────────┘

Strategy for when window DOES fill up:
  1. Summarize old conversation: "User decided on Tokyo+Kyoto+Osaka route,
     budget ₹1.5L, loves street food, avoids luxury hotels."
  2. Store full transcript in DB.
  3. Keep only summary in context window.
  → AI never forgets important decisions.
```

**Context window comparison (2026):**
```
GPT-4o:            128,000 tokens  (~190 pages)
GPT-4.5:           128,000 tokens
Claude 3.7:        200,000 tokens  (~300 pages)   ← best for long docs
Gemini 2.0 Flash:1,048,576 tokens  (~1,500 pages) ← entire codebase fits
o3:                200,000 tokens
DeepSeek R1:       128,000 tokens

REAL EXAMPLE — Gemini 2.5 Pro's 1M context:
  Arihant uploads ALL 50 Japan travel blog posts (200 pages) directly.
  No RAG needed — everything fits in context.
  Trade-off: costs more per call vs only retrieving the 5 relevant ones.
```

---

## 3. Temperature — Creativity Dial

**What it is**: A number (0 to 2) controlling how random/creative or deterministic/factual the AI's output is.

**Wrong temperature:**
```
TEMPERATURE 1.5 for flight booking:

User: "Book me a flight from Mumbai to Tokyo on April 5th."

AI: "The wind carries you eastward, past clouds that whisper sakura dreams.
     Perhaps ANA or JAL — both dance on the wings of possibility.
     Your journey begins not at the terminal, but in the heart's desire..."

❌ Poetic. Useless. Nobody is booking a flight from this response.
```

**Right temperature per task:**
```
TEMPERATURE GUIDE FOR NEXAMIND (2026):
────────────────────────────────────────────────────────────────────
Task                              Temperature    Why
────────────────────────────────────────────────────────────────────
"What's the visa fee for Japan?"      0.0       One correct answer
"Calculate budget breakdown"          0.0       Math must be exact
"Best time of day to visit Fushimi?"  0.3       Facts + slight flexibility
"Write a 7-day itinerary"             0.6       Creative but structured
"Write a travel journal entry"        0.9       Fully creative writing
"Suggest unusual anime spots"         1.0       Creative discovery wanted
────────────────────────────────────────────────────────────────────

SAME PROMPT, DIFFERENT TEMPERATURES:
"What should I eat in Osaka?"

Temp 0.0: "Osaka's must-try dishes: Takoyaki (octopus balls), Okonomiyaki
           (savoury pancake), Kushikatsu (fried skewers), Ramen."

Temp 0.7: "Osaka is Japan's food capital for a reason. Beyond the famous
           Takoyaki, try to find a small family-run kushikatsu shop in
           Shinsekai — the contrast with tourist spots is worth it."

Temp 1.5: "Osaka's street food odyssey begins where logic ends! Let
           your tongue write poetry in octopus ink and flour dreams..." ← no
```

---

## 4. Prompt Engineering — How You Talk to the AI Determines What You Get

**What it is**: The art of crafting inputs to get the best outputs from an LLM. Same model, different prompt = wildly different results.

**Bad prompt:**
```
User sends to API:
  "plan japan trip"

Response: A generic 3-line paragraph about Tokyo.
Useless.
```

**Engineered prompt (Chain of Thought + Role + Constraints):**
```
SYSTEM PROMPT (what NexaMind sends to the LLM):

"You are NexaMind, an expert travel planner specializing in budget travel
in Asia. You think step-by-step before giving recommendations. Always:
 - Break complex decisions into clear steps
 - Give specific prices (in ₹ and ¥)
 - Flag any assumption you're making
 - Ask for clarification if critical info is missing"

USER MESSAGE (enriched by NexaMind before sending to LLM):

"Plan a 7-day Japan trip for:
 - Traveller: 24-year-old software engineer from Mumbai
 - Budget: ₹1,50,000 total (flights + hotel + food + activities)
 - Dates: April 5–12, 2026 (cherry blossom season)
 - Interests: street food, anime culture, photography
 - Dislikes: overly touristy spots, luxury hotels
 - Previous trips: Thailand, Bali (budget traveller style)

Step 1: Analyze budget feasibility
Step 2: Suggest city combination
Step 3: Day-by-day itinerary
Step 4: Money-saving tips specific to this profile"

RESULT: A detailed, personalized, structured plan with exact prices.
```

**Prompt Engineering techniques in 2025-2026:**
```
TECHNIQUE 1: CHAIN OF THOUGHT (CoT)
  Add "Think step by step" → forces AI to reason before answering.
  Improves accuracy on math and logic by ~40%.

TECHNIQUE 2: FEW-SHOT EXAMPLES
  Show 2-3 examples of good input→output before your actual question.
  "Here's how I answered for a Thailand trip: [example].
   Now do the same for Japan."

TECHNIQUE 3: ROLE ASSIGNMENT
  "You are a Michelin-star chef who also knows Japanese street food."
  Role gives the model a persona to maintain throughout.

TECHNIQUE 4: STRUCTURED OUTPUT REQUEST
  "Return your answer as a JSON object with keys:
   day, location, morning, afternoon, evening, estimated_cost_INR"
  Forces consistent parseable output your code can use.

TECHNIQUE 5: SELF-CONSISTENCY
  Ask the same question 3 times at temp=0.7, take majority answer.
  Used when accuracy is critical and you can afford 3x cost.
```

---

## 5. Embeddings + Vector Database — Semantic Memory

**What it is**: Converting text into numbers that capture *meaning*, not just keywords. Similar meaning = similar numbers. Stored in a vector DB for fast search.

**Without embeddings (keyword search):**
```
Arihant asks: "cheap local food spots not in tourist guides"

SQL query: WHERE content LIKE '%cheap%' OR content LIKE '%local%'

Finds:
  ✅ "Cheap flights from India to Japan" (has "cheap" — WRONG)
  ✅ "Local Japanese fashion brands" (has "local" — WRONG)
  ❌ MISSES: "Hidden ramen stalls favoured by Tokyo salarymen" ← PERFECT answer
  ❌ MISSES: "Budget-friendly Osaka food from locals' perspective" ← PERFECT

Relevance: ~28%
```

**With embeddings:**
```
Arihant's query → embedding model → vector [0.3, -0.1, 0.8, 0.2, ...] (1536 numbers)

Vector DB finds documents with SIMILAR vectors:
  "Hidden ramen stalls favoured by Tokyo salarymen"   similarity: 0.96 ✅
  "Budget-friendly Osaka food, locals' perspective"   similarity: 0.94 ✅
  "Avoid tourist traps, eat where Japanese eat"       similarity: 0.91 ✅
  "Cheap flights from India to Japan"                 similarity: 0.12 ❌ (filtered out)

Relevance: ~91%   |   Search time: 0.06 seconds for 500,000 documents

EMBEDDING MODELS (2026):
  text-embedding-3-large (OpenAI): 3072 dimensions, best accuracy
  text-embedding-3-small (OpenAI): 1536 dimensions, 5× cheaper
  embed-english-v3 (Cohere):       most accurate for retrieval tasks
  nomic-embed (open source):       free, run locally, good quality
```

**Vector DBs used in production today:**
```
VECTOR DATABASE    BEST FOR                  USED BY
─────────────────────────────────────────────────────────
Pinecone           Managed, zero ops         Most startups
Qdrant             Open source, fast         Self-hosted apps
Weaviate           Hybrid search             Enterprise
pgvector           Already using Postgres    Adding search to existing DB
Chroma             Local dev, prototyping    Developers testing locally
Redis (VSS)        Already using Redis       Low-latency search
```

---

## 6. RAG — Giving AI Knowledge It Wasn't Trained On

**What it is**: Retrieval-Augmented Generation. Before answering, the AI searches a knowledge base and injects relevant docs into the prompt. Solves hallucination + stale knowledge.

**Without RAG:**
```
Arihant: "What's the current Japan tourist visa fee for Indians in 2026?"

LLM (training data cutoff: mid-2024):
"The Japan tourist visa for Indian citizens typically costs around ¥3,000
 and processing takes 5-7 business days..."

PROBLEM: Japan changed visa policies in 2025. The LLM has no idea.
It confidently gives outdated information. This is HALLUCINATION via stale data.
Arihant shows up with wrong amount. Nightmare.
```

**With RAG:**
```
STEP 1: Arihant asks about Japan visa fee.

STEP 2: NexaMind converts question to embedding.

STEP 3: Vector DB searches knowledge base:
  Finds: "Japan Ministry of Foreign Affairs – April 2026 visa update"
  Score: 0.97 (highly relevant)

STEP 4: NexaMind builds prompt:
  "Using ONLY the following document, answer the question:
   [Document: Japan MoFA April 2026 visa update — Indian citizens...]
   Question: What is current Japan tourist visa fee for Indians?"

STEP 5: LLM answers using the fresh document, not its old training data.

Result: Accurate, current, sourced answer.
AI also says: "Source: Japan Ministry of Foreign Affairs, April 2026."

RAG FLOW DIAGRAM:
  User Question
      │
      ▼
  Embed Question → vector
      │
      ▼
  Vector DB Search → Top 5 relevant docs
      │
      ▼
  Build Prompt: [System] + [User Profile] + [Retrieved Docs] + [Question]
      │
      ▼
  LLM generates answer grounded in retrieved docs
      │
      ▼
  Answer + Sources shown to user
```

**RAG vs Fine-tuning — when to use which:**
```
USE RAG WHEN:                         USE FINE-TUNING WHEN:
────────────────────────────────────────────────────────────────────
Your knowledge changes frequently     Behaviour/style/tone needs to change
(visa fees, prices, news)             ("always respond like a friendly guide")

You need to cite sources              You have thousands of examples of
                                      ideal Q&A pairs to train on

You want to add knowledge without     The task is very specific and different
retraining the model                  from what base model does well

Knowledge base is large (millions of  Latency is critical (fine-tuned model
documents)                            responds slightly faster, no RAG retrieval step)
────────────────────────────────────────────────────────────────────
BEST APPROACH IN 2026: RAG + Light Fine-tuning together.
  Fine-tune for tone/style/format.
  RAG for fresh, factual knowledge.
```

---

## 7. Function Calling / Tool Use — AI That Takes Actions

**What it is**: The LLM can call external functions (APIs, databases, code) mid-conversation, get results, and incorporate them into its answer. AI goes from *talking* to *doing*.

**Without function calling:**
```
Arihant: "What are current flight prices from Mumbai to Tokyo for April 5th?"

LLM: "Flights from Mumbai to Tokyo typically range from ₹35,000 to ₹70,000
      for economy class, depending on the airline and booking time..."

PROBLEM: These are guesses. No real prices. Training data has no live prices.
The AI sounds confident but is making up numbers.
```

**With function calling:**
```javascript
// Step 1: Developer defines tools the LLM can call
const tools = [
  {
    name: "search_flights",
    description: "Search for real-time flight prices",
    parameters: {
      origin: "string",       // "BOM"
      destination: "string",  // "TYO"
      date: "string",         // "2026-04-05"
      passengers: "number"
    }
  },
  {
    name: "search_hotels",
    description: "Search hotel availability and prices",
    parameters: {
      city: "string",
      check_in: "string",
      check_out: "string",
      budget_per_night_inr: "number"
    }
  },
  {
    name: "get_current_exchange_rate",
    description: "Get live INR to JPY exchange rate",
    parameters: { from: "string", to: "string" }
  },
  {
    name: "check_visa_requirements",
    description: "Get current visa requirements for a nationality",
    parameters: { nationality: "string", destination: "string" }
  }
]

// Step 2: User asks, LLM decides which tool to call
User: "Find me cheapest flights BOM→TYO on April 5th"

// LLM responds with a tool call (not text):
{
  "tool": "search_flights",
  "args": { "origin": "BOM", "destination": "TYO",
            "date": "2026-04-05", "passengers": 1 }
}

// Step 3: Your code executes the real API call (Skyscanner/Amadeus API)
real_result = skyscanner_api.search(...)
// Returns: [{ airline: "ANA", price: 52300, stops: 1 }, ...]

// Step 4: Real data is fed back to LLM
// Step 5: LLM now gives grounded answer with REAL prices

NexaMind: "Cheapest flights on April 5th:
  ANA via Delhi: ₹52,300 (1 stop, 11h 40m)
  Air India direct: ₹61,800 (9h 20m)
  IndiGo + JAL: ₹47,900 (2 stops, 16h) ← cheapest but long

  Within your ₹1.5L budget, the ANA option leaves ₹97,700 for hotel+food+activities."
```

**Real products using function calling in 2026:**
```
ChatGPT (with plugins/tools): searches web, runs code, reads files
Cursor AI:                    reads files, runs terminal commands, searches docs
Perplexity AI:                searches web in real time for every query
Google Gemini (Advanced):     accesses Gmail, Calendar, Drive, Maps
Claude (with MCP):            connects to ANY tool via Model Context Protocol
GitHub Copilot Workspace:     reads entire repo, runs tests, creates PRs
```

---

## 8. Reasoning Models — AI That Thinks Before Answering

**What it is**: A new class of LLMs (o1, o3, DeepSeek R1, Claude 3.7 with extended thinking) that spend extra "thinking time" before giving an answer. Like asking someone to think carefully instead of blurting out the first thing.

**Regular LLM on a hard problem:**
```
Arihant: "I have ₹1,50,000 for Japan. Flights cost ₹55,000.
          Hotel ₹3,500/night for 7 nights. Daily food budget ₹1,500.
          Train passes ₹8,000. How much left for activities and souvenirs?
          Is this realistic? What would you cut first if I'm over budget?"

GPT-4o (fast, no reasoning):
"You'll have about ₹40,000-50,000 left for activities."

Reality: ₹55,000 + (₹3,500×7) + (₹1,500×7) + ₹8,000 = ₹55,000 + ₹24,500 + ₹10,500 + ₹8,000 = ₹98,000
Remaining: ₹1,50,000 - ₹98,000 = ₹52,000

The answer was roughly right but the reasoning was sloppy and unsourced.
```

**Reasoning model (o3-mini) on same problem:**
```
INTERNAL THINKING (visible in API, not shown to user):
  <thinking>
  Let me calculate precisely:
  Fixed costs:
    Flights: ₹55,000
    Hotel: ₹3,500 × 7 nights = ₹24,500
    JR Pass: ₹8,000
    Subtotal fixed: ₹87,500

  Variable costs:
    Food: ₹1,500 × 7 days = ₹10,500
    Subtotal variable: ₹10,500

  Total committed: ₹87,500 + ₹10,500 = ₹98,000
  Budget: ₹1,50,000
  Remaining: ₹1,50,000 - ₹98,000 = ₹52,000

  Is this realistic? Let me check typical costs:
  - Entrance fees (temples, etc.): ₹500-1,000/day × 7 = ₹5,000
  - City transport (subway): ₹300/day × 7 = ₹2,100
  - Souvenirs: typically ₹5,000-15,000 for a trip like this
  - Contingency: ₹3,000-5,000

  Conservative activities estimate: ₹5,000+₹2,100+₹10,000+₹4,000 = ₹21,100
  Remaining after activities: ₹52,000 - ₹21,100 = ₹30,900 buffer

  Conclusion: Realistic! Actually has a healthy buffer.
  What to cut if over: Hotel has most flexibility (hostel = ₹1,200/night vs ₹3,500)
  </thinking>

FINAL ANSWER TO USER:
"Your exact breakdown:
  Flights:        ₹55,000
  Hotel (7n):     ₹24,500
  JR Pass:        ₹8,000
  Food (7d):      ₹10,500
  ─────────────────────────
  Committed:      ₹98,000
  Remaining:      ₹52,000

  After typical activities (₹21,000): ~₹31,000 buffer. You're fine!

  If over budget: Switch to capsule hotel/hostel (₹1,200/night instead of ₹3,500)
  → saves ₹16,100 immediately. That's your biggest lever."
```

**When to use reasoning models:**
```
USE REASONING MODEL (o3, DeepSeek R1, Claude extended thinking) WHEN:
  ✓ Multi-step math or logic
  ✓ Complex planning with many constraints
  ✓ Debugging hard code problems (why does this crash?)
  ✓ Legal / medical analysis (must be thorough)
  ✓ Competitive programming problems

DON'T USE REASONING MODEL WHEN:
  ✗ Simple factual questions (wasteful — 5× more expensive)
  ✗ Creative writing (reasoning doesn't help creativity)
  ✗ Real-time chat (thinking takes 5–30 seconds vs 1 second)

COST COMPARISON:
  Gemini 2.0 Flash: $0.075/1M → fast answer to "What's capital of Japan?"
  o3:               $15/1M    → 200× more expensive
  DeepSeek R1:      $0.55/1M  → cheap reasoning (7× cheaper than o3, open source!)
```

---

## 9. AI Agents — AI That Plans and Executes Multi-Step Tasks

**What it is**: An LLM given a goal, tools to use, and the ability to decide its own next steps until the goal is complete. Unlike function calling (one action), an agent can do 10–50 actions in sequence.

**Without an agent (one-shot):**
```
User: "Book me a complete Japan trip for April 5-12 under ₹1.5L"

Regular LLM: Generates a text plan.
User: Has to manually search flights, book hotel, check visa, convert currency.
Time taken: 3-4 hours of back-and-forth.
```

**With an AI Agent:**
```
User: "Book me a complete Japan trip for April 5-12 under ₹1.5L"

AGENT EXECUTION (NexaMind runs this automatically):

STEP 1: [PLAN]
  Agent breaks goal into tasks:
  - Check Japan visa for Indian passport
  - Search flights BOM→TYO April 5, TYO→BOM April 12
  - Search hotels in Tokyo (2n), Kyoto (3n), Osaka (2n) < ₹3,000/night
  - Check JR Pass price
  - Calculate total and verify within ₹1.5L
  - Create itinerary document

STEP 2: [EXECUTE] check_visa_requirements(nationality="Indian", dest="Japan")
  Result: "e-Visa available, ₹1,200 fee, 3-day processing"

STEP 3: [EXECUTE] search_flights(BOM→TYO, April 5)
  Result: ANA ₹52,300, Air India ₹61,800, IndiGo+JAL ₹47,900

STEP 4: [THINK] ANA at ₹52,300 is best balance of price and duration (11h 40m).

STEP 5: [EXECUTE] search_flights(TYO→BOM, April 12)
  Result: ₹49,100 best available

STEP 6: [EXECUTE] search_hotels(Tokyo, April 5-7, budget ₹3000/night)
  Result: Dormy Inn Tokyo ₹2,800/night ✓

STEP 7: [EXECUTE] search_hotels(Kyoto, April 7-10, budget ₹3000/night)
  Result: Hotel Kintetsu Kyoto ₹2,650/night ✓

STEP 8: [EXECUTE] search_hotels(Osaka, April 10-12, budget ₹3000/night)
  Result: Dormy Inn Osaka ₹2,400/night ✓

STEP 9: [CALCULATE] Total:
  Flights in+out: ₹52,300 + ₹49,100 = ₹1,01,400
  Hotels: (₹2,800×2) + (₹2,650×3) + (₹2,400×2) = ₹18,350
  JR Pass: ₹8,200
  Visa: ₹1,200
  Total committed: ₹1,29,150 ✓ (within ₹1.5L)

STEP 10: [CREATE] generate_itinerary_document(all above data)

STEP 11: [DELIVER] "Here's your complete trip plan for ₹1,29,150.
                    Click here to confirm bookings. Shall I proceed?"

Total agent run time: ~45 seconds. Without agent: 3-4 hours.
```

---

## 10. Multi-Agent Systems — Specialists Working Together

**What it is**: Multiple AI agents, each a specialist, collaborating on a complex task. Like hiring a team — don't have one person do everything.

**Without multi-agent (one agent does everything):**
```
One NexaMind agent tries to:
  - Understand travel preferences (needs customer service skill)
  - Search flights (needs travel API knowledge)
  - Analyse visa laws (needs legal knowledge)
  - Negotiate prices (different skill)
  - Generate day-by-day timeline (planning skill)
  - Write a beautiful travel journal style itinerary (creative writing)

Result: Average at everything. Great at nothing.
Like asking your accountant to also write your marketing copy.
```

**With multi-agent system:**
```
NexaMind ORCHESTRATOR AGENT (CEO)
  Receives: "Plan Japan trip under ₹1.5L"
  Delegates to specialists:
  │
  ├──▶ RESEARCH AGENT
  │      Tool: web search, visa database
  │      Task: "Find visa requirements, best April weather spots,
  │             current prices, travel advisories"
  │      Returns: structured research brief
  │
  ├──▶ BUDGET AGENT
  │      Tool: flight/hotel APIs, calculator
  │      Task: "Find best price combination for given budget"
  │      Returns: optimal booking combination with prices
  │
  ├──▶ ITINERARY AGENT
  │      Tool: maps, local knowledge base
  │      Task: "Create day-by-day plan matching interests (anime, street food)"
  │      Returns: structured day-by-day itinerary
  │
  └──▶ WRITING AGENT
         Task: "Take all above data, write it as a beautiful,
                personal travel guide for Arihant"
         Returns: Final polished trip plan

ORCHESTRATOR combines all outputs → delivers to user.

WHY BETTER?
  Each agent is optimized for its task (different system prompts, temperatures).
  Research Agent: temp=0.1 (factual)
  Itinerary Agent: temp=0.5 (structured but varied)
  Writing Agent: temp=0.8 (creative, engaging prose)

REAL PRODUCTS USING MULTI-AGENT (2026):
  Devin (Cognition AI)    → software engineer agent (research + code + test + debug)
  AutoGen (Microsoft)     → framework for multi-agent coding workflows
  CrewAI                  → popular framework for agent teams
  LangGraph               → LangChain's graph-based multi-agent system
  OpenAI Swarm            → lightweight multi-agent orchestration
```

---

## 11. MCP — Model Context Protocol (The USB-C of AI)

**What it is**: A standard protocol (created by Anthropic, now industry standard) that lets any AI connect to any tool/data source with zero custom integration. Before MCP: every tool needed custom code. After MCP: plug and play.

**Without MCP (before 2025):**
```
NexaMind team wants to add 5 data sources:
  - Google Calendar (check Arihant's schedule conflicts)
  - Skyscanner API (flight prices)
  - Booking.com API (hotel prices)
  - Google Maps API (local info)
  - Currency API (exchange rates)

Developer writes CUSTOM integration code for each:
  - CalendarTool class → 200 lines
  - FlightTool class → 350 lines
  - HotelTool class → 280 lines
  - MapsTool class → 190 lines
  - CurrencyTool class → 120 lines

Total: 1,140 lines of custom plumbing code.
Each tool has different auth, different data format, different error handling.
Adding one more tool = another 200 lines + debugging.
```

**With MCP (2026 standard):**
```
TOOL DEVELOPER (Skyscanner, Google, Booking.com):
  Builds once: a standard MCP server exposing their data.
  Published in MCP registry.

AI DEVELOPER (NexaMind):
  In Claude/Cursor/any MCP-compatible AI:

  // mcp_config.json
  {
    "servers": [
      { "name": "google-calendar", "url": "mcp://google-calendar-server" },
      { "name": "skyscanner",      "url": "mcp://skyscanner-mcp" },
      { "name": "booking-com",     "url": "mcp://booking-mcp" },
      { "name": "google-maps",     "url": "mcp://googlemaps-mcp" },
      { "name": "currency-api",    "url": "mcp://currency-mcp" }
    ]
  }

That's it. 10 lines. The AI now has access to all 5 tools.
No custom code. Standard protocol handles everything.

YOU use MCP every day in CURSOR:
  Cursor's AI can:
  - Read your files (filesystem MCP server)
  - Run terminal commands (shell MCP server)
  - Search documentation (docs MCP server)
  - Query your database (database MCP server)
  All through MCP — that's why Cursor feels like it "understands your project."
```

---

# SCENARIO B — VibeCoder: AI Coding Assistant

**The user**: Arihant, building a real-time notification system.
He opens Cursor and types:
> *"Build me a WebSocket server in Node.js that pushes notifications to users. Add Redis pub/sub for scaling across multiple server instances."*

Every AI concept below maps to what happens inside tools like Cursor, GitHub Copilot, and Windsurf.

---

## 12. Tokens in Coding Context — Why Your Codebase Fit Matters

**What it is**: Same as before — every token costs money. But in coding, the "context" is your codebase, not a conversation.

**What Cursor sends to the LLM for your request:**
```
CURSOR'S PROMPT (what actually goes to Claude/GPT behind the scenes):

SYSTEM (Cursor's instructions to the model):
  "You are an expert software engineer. Generate production-quality code.
   Follow the coding style in the provided files. Explain your decisions.
   Always consider edge cases."     → ~300 tokens

CODEBASE CONTEXT (what Cursor automatically includes):
  src/server.js (your main file)   → ~800 tokens
  src/routes/api.js (related file) → ~600 tokens
  package.json (dependencies)      → ~200 tokens
  .env.example (config pattern)    → ~100 tokens
  README.md (project context)      → ~400 tokens

YOUR MESSAGE:
  "Build WebSocket server with Redis pub/sub..."  → ~50 tokens

TOTAL SENT: ~2,450 tokens per query
COST: 2,450 × $3/1M (Claude 3.7) = $0.00735 → less than 1 rupee per query

HOW CURSOR DECIDES WHAT CODEBASE FILES TO INCLUDE:
  It uses embeddings to find the most RELEVANT files to your question.
  Not all 200 files — just the 4-5 most related ones.
  This is RAG applied to your codebase!
```

---

## 13. Context Window in Coding — Why @codebase Works

**What it is**: When you type `@codebase` in Cursor, it uses the context window to bring your entire relevant codebase into the AI's view.

**Small project (< 10,000 lines):**
```
Arihant's project: 3,000 lines total
Cursor embeds all files → fits in Claude 3.7's 200K context window
@codebase works perfectly — AI sees everything.
```

**Large project (> 100,000 lines):**
```
Arihant joins a big company. Backend codebase: 500,000 lines.
Even Gemini's 1M token window can't fit it all.

CURSOR'S SOLUTION (RAG on codebase):
  Step 1: Index entire codebase as embeddings (done once, stored locally)
  Step 2: When you ask a question, find the 15 most relevant files
  Step 3: Include ONLY those 15 files in context window
  Step 4: AI answers with full context of relevant code

This is why Cursor can navigate massive codebases — it doesn't read everything,
it reads the RIGHT things using semantic search on your code.
```

---

## 14. Reasoning Models in Coding — Debugging Hard Problems

**What it is**: When your bug is complex, a reasoning model (o3, DeepSeek R1, Claude extended thinking) thinks through it step by step instead of guessing.

**Regular model on a hard bug:**
```
Arihant: "My WebSocket server works for 10 connections but crashes at 1000.
          Here's the error: 'EMFILE: too many open files'"

GPT-4o (fast): "Try increasing your file descriptor limit with ulimit -n 65535."

Arihant tries it. Still crashes. The answer was incomplete — surface-level advice.
```

**o3 reasoning model on same bug:**
```
INTERNAL THINKING:
<thinking>
  EMFILE = "Error: too many open files"
  This means the process hit the OS file descriptor limit.

  Each WebSocket connection uses 1 file descriptor.
  At 1000 connections: need 1000 FDs just for sockets.

  But wait — Redis pub/sub connections also use FDs.
  If each WebSocket listener subscribes to Redis: 1000 more FDs = 2000 total.
  Default Linux limit: 1024. That's exactly where it crashes.

  Solutions in order of correctness:
  1. ulimit -n 65535 (OS level) — necessary but not sufficient
  2. Connection pooling for Redis — use 1 Redis connection shared across all WebSockets
     (not 1 per WebSocket — that's the real bug)
  3. Use Redis.createClient with a connection pool, not per-connection subscriptions
  4. Monitor with: ls -l /proc/{pid}/fd | wc -l

  Root cause: Architecture issue — per-connection Redis subscription.
  Not a config problem. A code design problem.
</thinking>

ANSWER:
"The root cause is NOT just the ulimit — it's your architecture.

You're creating a new Redis subscription for every WebSocket connection.
At 1000 connections: 1000 WebSocket FDs + 1000 Redis FDs = 2000 total.
Default limit is 1024. That's exactly when it crashes.

FIX: Use ONE shared Redis subscriber, distribute to WebSocket clients in memory:

// ❌ WRONG (what you're probably doing):
wss.on('connection', (ws) => {
  const redis = new Redis();          // new connection per WebSocket
  redis.subscribe('notifications');   // 1 Redis FD per user
  redis.on('message', (ch, msg) => ws.send(msg));
});

// ✅ CORRECT (one Redis connection, many WebSocket clients):
const subscriber = new Redis();       // one connection total
const clients = new Map();

subscriber.subscribe('notifications');
subscriber.on('message', (channel, message) => {
  clients.forEach((ws) => ws.send(message));  // broadcast in memory
});

wss.on('connection', (ws) => {
  clients.set(ws, ws);               // register in memory map
  ws.on('close', () => clients.delete(ws));
});"
```

---

## 15. Hallucination + Guardrails — When AI Makes Things Up

**What it is**: Hallucination = AI confidently stating false information. Guardrails = rules that catch or prevent this.

**Hallucination in code:**
```
Arihant: "What's the latest version of the 'ws' WebSocket library for Node.js?"

LLM (training cutoff mid-2024): "The latest version of 'ws' is 8.16.0"

Reality (March 2026): ws is now at 8.18.0 or higher.

Arihant puts "ws": "^8.16.0" in package.json.
npm installs it fine but misses security patches from newer versions.

WORSE HALLUCINATION EXAMPLE:
Arihant: "How do I use the RedisJSON module to store nested objects?"

LLM: "Use client.json.set('key', '$', object) with the JSON.SET command..."
     (invents a method that doesn't exist in the library version he's using)

Arihant spends 2 hours debugging non-existent method.
```

**Guardrails in VibeCoder:**
```
LAYER 1: FACTUAL GUARDRAILS (Cursor does this)
  Before generating code that uses a library:
  → Check documentation via MCP tool call (real-time lookup)
  → Verify method signatures against actual package version
  → Add "VERIFY: I'm using the API as documented in [source], but
    please check npm for the latest version"

LAYER 2: SAFETY GUARDRAILS (things the model refuses)
  Input: "Write me a script that floods a server with requests"
  Response: "I can't help with tools that could be used to attack systems.
             If you're testing your own server's load capacity, I can help
             with proper load testing using tools like k6 or Artillery."

LAYER 3: CODE SAFETY GUARDRAILS
  Detects dangerous patterns:
  → Spots hardcoded API keys → "Move this to .env file"
  → Spots SQL injection → "Use parameterized queries instead"
  → Spots unhandled promise rejection → "Add .catch() here"

LAYER 4: UNCERTAINTY GUARDRAILS (honest about not knowing)
  Instead of hallucinating: "I'm not certain about the exact Redis Cluster
  configuration for this version. Let me search the docs."
  → calls tool: search_documentation("Redis Cluster ws Node.js 2026")
  → gives answer based on real docs

2026 GUARDRAIL APPROACHES:
  Constitutional AI (Anthropic): model trained with principles it follows
  RLHF: model fine-tuned on human feedback about good/bad outputs
  Output validators: code run in sandbox, errors fed back to model
  Semantic similarity check: answer vs source documents (catches fabrication)
```

---

## 16. Fine-tuning — Teaching the AI Your Style

**What it is**: Taking a base model and training it further on YOUR specific data so it learns your exact patterns, terminology, and style.

**Without fine-tuning:**
```
Arihant's company has very specific coding standards:
  - All functions must have JSDoc comments in specific format
  - All errors must use custom AppError class
  - All async functions must use try/catch not .catch()
  - Variable names follow specific patterns (camelCase, no abbreviations)

Every time Arihant uses Copilot/Cursor:
  → Gets standard JS code that violates these standards
  → Has to manually rewrite style every time
  → Takes 10 minutes of cleanup per feature
```

**With fine-tuning:**
```
STEP 1: Collect training data
  500 examples of:
  Input:  "Write a function to validate user email"
  Output: [exact company-style code with JSDoc, AppError, try/catch, etc.]

STEP 2: Fine-tune a base model (e.g., GPT-4o, CodeLlama)
  via OpenAI fine-tuning API or Hugging Face

STEP 3: New fine-tuned model now generates code in exact company style
  Zero cleanup needed. Every output follows standards automatically.

WHEN COMPANIES FINE-TUNE:
  → Cursor for Enterprise: teams can upload their codebase style guides
  → GitHub Copilot for Business: learns from your organization's repos
  → Custom internal coding assistants at large companies (Google, Meta)

FINE-TUNING COST (2026):
  OpenAI fine-tuning GPT-4o mini: ~$25 for 500 examples
  Training time: 10-30 minutes
  After: cheaper per call (smaller model, same task-specific quality)

WHEN NOT TO FINE-TUNE:
  Don't fine-tune for knowledge (use RAG instead).
  Fine-tune for STYLE, FORMAT, BEHAVIOUR — not for facts.
```

---

## 17. Local LLMs + Quantization — Running AI Without the Cloud

**What it is**: Running an LLM on your own machine (no internet, no API costs, full privacy). Quantization = shrinking model size so it fits on consumer hardware.

**Why a developer like Arihant wants local LLMs:**
```
SCENARIO: Arihant works at a fintech company.
  Company rule: "No code or proprietary data may be sent to external APIs."
  
  If Arihant uses Cursor with Claude/GPT: sends code to Anthropic/OpenAI servers.
  COMPLIANCE VIOLATION. Could result in termination.

  Solution: Local LLM that never leaves his laptop.
```

**Quantization explained simply:**
```
ORIGINAL MODEL: Llama 3.3 70B
  Full precision (FP16): 140 GB → needs 4× A100 GPUs → $40,000 machine
  Impossible on a laptop.

QUANTIZED MODEL: Llama 3.3 70B Q4_K_M
  4-bit quantization: 140 GB → 42 GB → fits on MacBook Pro M4 Max (48 GB)!

HOW QUANTIZATION WORKS:
  Model weights are numbers (e.g., 0.7234891...)
  FP16: each number stored as 16 bits (high precision)
  Q4:   each number stored as 4 bits (lower precision, ~87% smaller)

  Like MP3 vs WAV audio:
    WAV:  perfect quality, huge file
    MP3:  slightly lower quality, 7× smaller
    Q4:   slightly lower quality, 4× smaller model

QUALITY IMPACT:
  Full model: 100% quality (benchmark score 87.2)
  Q8 quant:   99.5% quality (benchmark score 86.8)  ← barely noticeable
  Q4 quant:   97% quality   (benchmark score 84.7)  ← acceptable for most tasks
  Q2 quant:   90% quality   (benchmark score 78.3)  ← noticeable degradation

LOCAL LLM SETUP (Arihant's MacBook Pro M4 with 48 GB RAM):
  Tool: Ollama (easiest way to run local models)

  ollama run deepseek-r1:32b     ← reasoning model, fits in 32 GB
  ollama run llama3.3:70b-q4    ← 70B quantized, fits in 42 GB
  ollama run qwen2.5-coder:32b  ← coding specialist, excellent for Cursor
  ollama run phi4:latest        ← Microsoft's small but capable model (14B)

  Set Cursor to use localhost:11434 as API endpoint.
  Now Cursor uses LOCAL model. Zero data leaves the laptop.

BEST LOCAL MODELS FOR CODING (March 2026):
  Qwen2.5-Coder 32B    → best coding quality in class
  DeepSeek-Coder V2    → excellent reasoning for debugging
  CodeLlama 34B        → Meta's coding specialist
  Phi-4 14B            → Microsoft, surprising quality for its size
```

---

## 18. Vibe Coding — The 2025-2026 Way to Build Software

**What it is**: Describe what you want in plain English, let the AI write the code, you review/guide. The developer shifts from *writing* code to *directing* and *reviewing* code. Coined by Andrej Karpathy in February 2025.

**Traditional coding (before 2025):**
```
Arihant wants to add a rate limiter to his WebSocket server.

Steps:
  1. Google "Node.js WebSocket rate limiter"
  2. Read 5 Stack Overflow answers
  3. Read express-rate-limit docs
  4. Understand the Redis sliding window algorithm
  5. Write code: 80 lines
  6. Debug for 45 minutes
  7. Write tests: 40 lines

Time: 3-4 hours
```

**Vibe Coding with Cursor (2026):**
```
Arihant types in Cursor:

"Add rate limiting to the WebSocket server. Requirements:
 - Max 100 connections per IP per minute
 - Use Redis sliding window algorithm
 - Return error code 429 with retry-after header when exceeded
 - Don't disconnect existing connections, just refuse new ones
 - Add unit tests"

Cursor (using Claude 3.7):
  [Reads existing server code via context]
  [Generates complete rate limiter implementation]
  [Generates test file]
  [Explains each decision]

Time: 45 seconds for generation.
Arihant reviews: 10 minutes.
Requests changes: "Also log the blocked IPs to a separate Redis key for monitoring."
Cursor updates: 15 seconds.

Total time: 11 minutes vs 3-4 hours. 20× faster.

VIBE CODING TOOLS IN 2026:
  Cursor         → most popular, IDE with AI built in
  GitHub Copilot → integrated in VS Code, JetBrains
  Windsurf       → Codeium's IDE, strong competitor to Cursor
  Devin          → fully autonomous software engineer agent
  Bolt.new       → full-stack web apps from description
  v0 (Vercel)    → UI components from description
  Lovable        → full app from description ("create a Twitter clone")

THE DEVELOPER'S NEW ROLE IN VIBE CODING:
  OLD: Write every line of code
  NEW: Define requirements clearly → review AI output → guide direction
       → catch errors → integrate pieces → make architecture decisions

  Skills that matter MORE in 2026:
  → System design (knowing what to build)
  → Code review (catching AI mistakes)
  → Prompt engineering (getting AI to do the right thing)
  → Testing (verifying AI output is correct)

  Skills that matter LESS:
  → Memorizing syntax
  → Boilerplate code writing
  → Looking up basic API docs
```

---

## PART — Model Selection Guide 2026

```
TASK                              BEST MODEL           WHY
──────────────────────────────────────────────────────────────────────────────
General chat, simple tasks        Gemini 2.0 Flash     Fastest, cheapest
Long document analysis            Claude 3.7 Sonnet    200K context window
Complex reasoning, math           o3 or DeepSeek R1    Built-in reasoning
Everyday coding                   Claude 3.7 Sonnet    Best code quality
Privacy-sensitive code            Llama 3.3 local      No data leaves machine
Cheap high-volume tasks           Gemini 2.0 Flash     $0.075/1M tokens
Image + text together             GPT-4o               Best multimodal
Video understanding               Gemini 2.5 Pro       Handles video natively
Most capable overall              GPT-4.5 or Claude 3.7 Trade-off: expensive
Budget reasoning                  DeepSeek R1          Open source, cheap
──────────────────────────────────────────────────────────────────────────────
```

---

## PART — Quick Reference: All Concepts in One Table

```
CONCEPT           WHAT IT DOES                 2025-26 EXAMPLE
──────────────────────────────────────────────────────────────────────────────
Tokens            Unit of cost + context        GPT-4o: $2.50/1M | Flash: $0.075/1M
Context Window    AI's working memory           Claude 3.7: 200K | Gemini: 1M tokens
Temperature       Creative vs. precise          0.0 for facts, 0.7 for writing
Embeddings        Text → meaning numbers        text-embedding-3-large (OpenAI)
Vector DB         Fast semantic search          Pinecone, Qdrant, pgvector
RAG               Fresh knowledge injection     Cursor reading your codebase docs
Prompt Eng.       How you talk to AI            Chain-of-thought, role, few-shot
Function Calling  AI takes real actions         Cursor running terminal commands
Reasoning Models  AI thinks step by step        o3, DeepSeek R1, Claude thinking
AI Agents         AI plans + executes autonomy  Devin, GitHub Copilot Workspace
Multi-Agent       Team of specialist AIs        CrewAI, LangGraph, AutoGen
MCP               Plug-and-play tool protocol   Cursor's filesystem + terminal access
Hallucination     AI making things up           Wrong library versions, fake APIs
Guardrails        Safety rules for AI output    Constitutional AI, code validators
Fine-tuning       Teaching AI your style        Company coding standards, brand voice
Local LLMs        Run AI on your own machine    Ollama + Qwen2.5-Coder on MacBook
Quantization      Shrink model to fit hardware  70B → 42 GB with Q4 quantization
Vibe Coding       Describe → AI builds          Cursor, Bolt.new, v0, Lovable
──────────────────────────────────────────────────────────────────────────────
```
