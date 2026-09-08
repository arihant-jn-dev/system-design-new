# AI Terminologies Guide — 2025/2026 Edition

> A beginner-friendly, comprehensive guide to understanding modern AI — from the basics to what's happening right now.

---

## Table of Contents

1. [The Big Picture — AI Family Tree](#1-the-big-picture--ai-family-tree)
2. [Large Language Models (LLMs)](#2-large-language-models-llms)
3. [How LLMs Actually Work — Tokens, Context & Temperature](#3-how-llms-actually-work--tokens-context--temperature)
4. [Transformer Architecture & Attention](#4-transformer-architecture--attention)
5. [Generative AI](#5-generative-ai)
6. [The AI Model Landscape 2025/2026](#6-the-ai-model-landscape-20252026)
7. [Reasoning Models — A New Kind of AI](#7-reasoning-models--a-new-kind-of-ai)
8. [AI Agents](#8-ai-agents)
9. [Multi-Agent Systems](#9-multi-agent-systems)
10. [Model Context Protocol (MCP)](#10-model-context-protocol-mcp)
11. [Prompt Engineering](#11-prompt-engineering)
12. [RAG — Retrieval Augmented Generation](#12-rag--retrieval-augmented-generation)
13. [Embeddings](#13-embeddings)
14. [Vector Databases](#14-vector-databases)
15. [Fine-tuning](#15-fine-tuning)
16. [Function Calling / Tool Use](#16-function-calling--tool-use)
17. [Hallucination & Guardrails](#17-hallucination--guardrails)
18. [Training vs Inference](#18-training-vs-inference)
19. [Quantization & Local LLMs](#19-quantization--local-llms)
20. [Mixture of Experts (MoE)](#20-mixture-of-experts-moe)
21. [AI Safety & Alignment](#21-ai-safety--alignment)
22. [Real-World AI in Production](#22-real-world-ai-in-production)
23. [How Everything Fits Together](#23-how-everything-fits-together)

---

## 1. The Big Picture — AI Family Tree

Before anything, understand that all these terms exist inside one another like nested circles:

```
┌─────────────────────────────────────────────────────────────────┐
│                  ARTIFICIAL INTELLIGENCE (AI)                   │
│            (Any machine that simulates human thinking)          │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              MACHINE LEARNING (ML)                      │   │
│   │     (Learns patterns from data, not hardcoded rules)    │   │
│   │                                                         │   │
│   │   ┌─────────────────────────────────────────────────┐   │   │
│   │   │              DEEP LEARNING (DL)                 │   │   │
│   │   │     (Uses many-layered Neural Networks)         │   │   │
│   │   │                                                 │   │   │
│   │   │   ┌─────────────────────────────────────────┐   │   │   │
│   │   │   │    LARGE LANGUAGE MODELS (LLMs)         │   │   │   │
│   │   │   │  (Transformers trained on text at scale) │   │   │   │
│   │   │   │                                         │   │   │   │
│   │   │   │   ┌─────────────────────────────────┐   │   │   │   │
│   │   │   │   │     GENERATIVE AI               │   │   │   │   │
│   │   │   │   │  (Creates: text, images, code)  │   │   │   │   │
│   │   │   │   └─────────────────────────────────┘   │   │   │   │
│   │   │   └─────────────────────────────────────────┘   │   │   │
│   │   └─────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│   Also includes: Rule-based systems, Expert Systems, Robotics   │
└─────────────────────────────────────────────────────────────────┘
```

**Simple analogy:**
- **AI** = The idea of making smart machines
- **ML** = Teaching machines by showing them examples
- **Deep Learning** = ML using brain-inspired layered networks
- **LLMs** = Deep learning specifically for understanding & generating language
- **Generative AI** = LLMs (and other models) that *create* new content

**Quick Comparison:**

| | Traditional AI | Machine Learning | Deep Learning / LLMs |
|--|----------------|-----------------|----------------------|
| How it works | Hardcoded rules | Learns from data | Learns complex patterns from massive data |
| Example | Chess rules | Spam filter | ChatGPT, Gemini |
| Who writes the logic | Human programmer | Algorithm | Emerges from training |

---

## 2. Large Language Models (LLMs)

### What Is an LLM?

An LLM is an AI model trained on **massive amounts of text** (books, websites, code, Wikipedia, research papers) to understand and generate human-like language.

The "large" means:
- Billions of **parameters** (the numbers the model learns during training)
- Trained on **trillions of words**
- Requires massive computing power to build

### What Can LLMs Do?

LLMs are surprisingly versatile — trained on text for language, they turned out to be good at almost everything:

```
ONE MODEL → MANY TASKS

Text in → Text out:
┌──────────────────────────────────────────┐
│  Write code        │  Translate languages │
│  Answer questions  │  Summarize documents │
│  Debug errors      │  Write emails        │
│  Explain concepts  │  Analyze data        │
│  Generate images*  │  Reason step-by-step │
└──────────────────────────────────────────┘
* With multimodal extensions
```

### How an LLM Responds

At its core, an LLM **predicts the next word** (technically, next token), one at a time:

```
Input:   "The capital of France is"
Model:   → "Paris"   (probability: 94%)
         → "Lyon"    (probability: 3%)
         → "Nice"    (probability: 2%)
         → others    (probability: 1%)

Model picks "Paris" → now predicts what comes after "Paris"
Repeats until response is complete
```

This simple mechanism, scaled up enormously, produces remarkably intelligent-seeming responses.

---

## 3. How LLMs Actually Work — Tokens, Context & Temperature

### Tokens — The Building Blocks

LLMs don't read words — they read **tokens**. A token is roughly 3-4 characters, or about 0.75 words.

```
"Hello, world!" = 4 tokens: ["Hello", ",", " world", "!"]

"Unbelievable" = 3 tokens: ["Un", "believ", "able"]

"API" = 1 token: ["API"]
```

**Why tokens matter:**
- Every API call is priced per token (input + output)
- Models have a maximum number of tokens they can process at once (context window)
- Knowing this helps you understand LLM costs and limits

**Token pricing example (approximate 2025 rates):**
```
GPT-4o:        $2.50 per million input tokens  / $10 per million output
Claude 3.5:    $3.00 per million input tokens  / $15 per million output
Gemini 1.5 Pro: $1.25 per million input tokens / $5 per million output
GPT-4o-mini:   $0.15 per million input tokens  / $0.60 per million output
```

---

### Context Window — The Model's Working Memory

The **context window** is how much text an LLM can "see" and work with at once — its short-term memory.

```
CONTEXT WINDOW = Everything the model can read RIGHT NOW

┌──────────────────────────────────────────────────────┐
│                   CONTEXT WINDOW                     │
│                                                      │
│  [System Prompt] [Conversation History] [Your Query] │
│                                                      │
│  Everything here is read simultaneously by the model │
└──────────────────────────────────────────────────────┘

Once the window fills up → older messages get "forgotten"
```

**Context window sizes (2025):**

| Model | Context Window | What fits inside |
|-------|---------------|-----------------|
| GPT-4o | 128,000 tokens | ~200 pages of text |
| Claude 3.5 Sonnet | 200,000 tokens | ~300 pages |
| Gemini 1.5 Pro | 1,000,000 tokens | ~1,500 pages (entire codebase) |
| Gemini 2.0 Flash | 1,000,000 tokens | Full book + conversation |
| Llama 3.1 405B | 128,000 tokens | ~200 pages |

**Why context window matters:**
- Small window → AI forgets earlier parts of a long conversation
- Large window → AI can analyze entire codebases, books, legal contracts at once
- Larger windows cost more to process

---

### Temperature — How Creative or Predictable the AI Is

**Temperature** is a number (0.0 to 2.0) that controls how random the AI's responses are:

```
Temperature = 0.0  →  PREDICTABLE (always picks the most likely word)
              ↓         Best for: Code, math, factual Q&A
              
Temperature = 0.7  →  BALANCED (some creativity, still coherent)
              ↓         Best for: General chat, writing assistance
              
Temperature = 1.5  →  CREATIVE/RANDOM (surprising, less predictable)
                       Best for: Brainstorming, creative writing, poetry

SAME PROMPT, DIFFERENT TEMPERATURES:
Input: "Complete the sentence: The sky is..."

Temp 0.0 → "The sky is blue."
Temp 0.7 → "The sky is a canvas of shifting indigo and gold."
Temp 1.5 → "The sky is the universe's eyelid, blinking between realities."
```

**Other sampling parameters:**
- **Top-P (nucleus sampling)**: Limits choices to top X% probability tokens — similar effect to temperature
- **Max tokens**: Limits response length
- **Stop sequences**: Words/phrases that stop generation (e.g., `"\n\n"`)

---

## 4. Transformer Architecture & Attention

### What Is a Transformer?

The Transformer is the neural network architecture that powers ALL modern LLMs. It was introduced in a famous 2017 paper: **"Attention Is All You Need"** by Google researchers.

Before Transformers, AI read text like a human reading left-to-right, word by word (RNNs/LSTMs). This was slow and forgot context easily.

Transformers read **everything simultaneously** and figure out which parts relate to each other.

### The Attention Mechanism — The Key Innovation

**Attention** lets the model figure out which words in the input are most important for understanding each other word:

```
Input: "The animal didn't cross the road because it was too tired"

What does "it" refer to? → The ANIMAL (not the road)

Attention scores for "it":
  "The"     → 0.02
  "animal"  → 0.89  ← HIGH — "it" = animal
  "didn't"  → 0.01
  "cross"   → 0.02
  "road"    → 0.04
  "because" → 0.01
  "was"     → 0.01

The model learns these relationships from billions of examples
```

**Multi-Head Attention** runs this process many times in parallel (e.g., 96 attention "heads" in GPT-4), each capturing different types of relationships (grammar, meaning, coreference, etc.).

### Simplified Transformer Flow

```
INPUT TEXT
    ↓
TOKENIZATION  →  "Hello world" → [15339, 1917]
    ↓
EMBEDDINGS    →  Convert token IDs to vectors (numbers that capture meaning)
    ↓
POSITIONAL ENCODING  →  Add position info (word 1, word 2, etc.)
    ↓
ATTENTION LAYERS (×N)  →  Figure out relationships between all tokens
    ↓
FEED-FORWARD LAYERS  →  Process and transform the information
    ↓
OUTPUT PROBABILITIES  →  Probability for each possible next token
    ↓
SAMPLING  →  Pick next token based on temperature
    ↓
REPEAT until complete
```

### Why Transformers Won

| | Old (RNN/LSTM) | Transformer |
|--|----------------|-------------|
| Reading style | Sequential (word by word) | Parallel (all at once) |
| Long text memory | Degrades quickly | Strong across entire context |
| Training speed | Slow (can't parallelize) | Fast (GPUs thrive on parallel ops) |
| Scalability | Hits ceiling at ~100M params | Scales to 100B+ params |

---

## 5. Generative AI

### What Makes AI "Generative"?

Generative AI **creates** new content rather than just classifying or predicting:

```
CLASSIFICATION AI:
  Input: [image of a cat] → Output: "cat" (picks from fixed categories)

GENERATIVE AI:
  Input: "paint a cat in Van Gogh's style" → Output: [creates new image]
  Input: "write a poem about Monday" → Output: [writes original poem]
  Input: "fix this bug in my code" → Output: [generates corrected code]
```

### What Generative AI Can Create

```
TEXT          → ChatGPT, Claude, Gemini  (articles, code, emails, analysis)
IMAGES        → DALL-E 3, Midjourney, Stable Diffusion, Flux
VIDEO         → Sora (OpenAI), Veo 2 (Google), Runway, Kling
AUDIO/MUSIC   → ElevenLabs (voice), Suno, Udio (music)
CODE          → GitHub Copilot, Cursor, Claude Code
3D / DESIGN   → Point-E, Shap-E, Adobe Firefly
```

### Generative vs Traditional AI

| Aspect | Traditional AI | Generative AI |
|--------|---------------|---------------|
| Output | Fixed label / number | Open-ended content |
| Example | "Is this email spam? Yes/No" | "Write a reply to this email" |
| Training | Labeled datasets | Self-supervised on internet-scale data |
| Flexibility | One task | Many tasks with one model |

---

## 6. The AI Model Landscape 2025/2026

The AI world moves fast. Here are the key players as of 2025-2026:

### Closed-Source (Commercial) Models

```
OPENAI
├── GPT-4o          → Multimodal flagship (text + images + voice)
├── GPT-4o mini     → Cheap, fast, surprisingly capable
├── o1              → Reasoning model (thinks before answering)
├── o3              → More powerful reasoning model
└── o4-mini         → Fast reasoning for everyday tasks

ANTHROPIC
├── Claude 3.5 Sonnet  → Top model for coding & writing (2024)
├── Claude 3.7 Sonnet  → Latest (2025), excellent at agentic tasks
├── Claude 3.5 Haiku   → Fast and cheap
└── Claude 3 Opus      → Older heavyweight

GOOGLE
├── Gemini 2.0 Flash       → Very fast, 1M token context, free tier
├── Gemini 1.5 Pro         → 1M+ context, strong multimodal
├── Gemini Ultra           → Google's most powerful
└── NotebookLM             → AI for research/documents (Gemini-powered)

XAI (Elon Musk)
└── Grok 3             → Real-time web access, strong coding
```

### Open-Source Models (Free to Download & Run)

```
META
├── Llama 3.1 405B     → Competitive with GPT-4, Apache 2.0 license
├── Llama 3.2 90B      → Multimodal (vision) version
└── Llama 3.3 70B      → Efficient, strong performance

DEEPSEEK (China, Open Source)
├── DeepSeek V3        → Rivals GPT-4 quality, trained at fraction of cost
└── DeepSeek R1        → Reasoning model, rivals o1, fully open weights

MISTRAL AI (Europe)
├── Mistral Large      → Strong general purpose
├── Mixtral 8x7B       → Mixture of Experts architecture (see section 20)
└── Mistral 7B         → Tiny but capable

MICROSOFT
├── Phi-4              → Small but powerful (3.8B params)
└── Phi-3.5 Mini       → Runs on phones

GOOGLE (Open)
└── Gemma 2            → 2B, 9B, 27B variants, Apache license

ALIBABA
└── Qwen 2.5           → Strong multilingual + coding model
```

### How to Choose a Model

```
USE CASE                    → BEST CHOICE (2025)
─────────────────────────────────────────────────
Complex coding tasks         → Claude 3.7 Sonnet
Reasoning / math / logic     → o3 or DeepSeek R1
Fast cheap API calls         → GPT-4o mini or Gemini Flash
Long document analysis       → Gemini 1.5 Pro (1M tokens)
Image/video understanding    → GPT-4o or Gemini 1.5 Pro
Privacy (run locally)        → Llama 3.1 70B (via Ollama)
Free and good enough         → Gemini 2.0 Flash (free tier)
Open source + powerful       → DeepSeek V3 or Llama 3.1 405B
```

---

## 7. Reasoning Models — A New Kind of AI

### What Are Reasoning Models?

Standard LLMs answer immediately — they don't "think before responding." **Reasoning models** spend time generating a hidden chain of thought before producing a final answer. This makes them much better at complex problems.

Introduced by OpenAI's **o1** (late 2024), then followed by DeepSeek R1, o3, etc.

```
STANDARD LLM:
  Question → [instant generation] → Answer
  
REASONING MODEL:
  Question → [thinks... thinks... thinks...] → Answer
                  ↑
         Internal "thinking" tokens
         (like scratch paper)
         Not shown to user, but uses context window
```

### How Thinking Works

```
User: "If there are 3 cars in the parking lot when you arrive,
       and 5 more come and 2 leave, how many cars are there?"

Standard GPT-4o (fast):
→ "There are 6 cars."  (sometimes gets this wrong)

o1 (thinking):
→ [hidden thinking: "Started with 3. 5 came = 8. 2 left = 6.
   Wait, let me re-read... yes 3+5-2 = 6. Confident."]
→ "There are 6 cars."  (much more reliable)
```

### When to Use Reasoning Models vs Standard

| Task | Standard LLM | Reasoning Model |
|------|-------------|-----------------|
| Write a blog post | ✅ Fast & great | ❌ Overkill, slow |
| Translate text | ✅ Use this | ❌ Overkill |
| Solve complex math | ❌ Often errors | ✅ Much more reliable |
| Debug tricky code | ❌ May miss it | ✅ Finds subtle bugs |
| Multi-step logic puzzles | ❌ Makes mistakes | ✅ This is its strength |
| Everyday Q&A | ✅ Use this | ❌ Too slow/expensive |

### Key Reasoning Models (2025)

| Model | Company | Notes |
|-------|---------|-------|
| o1 | OpenAI | First popular reasoning model |
| o3 | OpenAI | More powerful than o1 |
| o4-mini | OpenAI | Cheaper, faster reasoning |
| DeepSeek R1 | DeepSeek | Open source, rivals o1 |
| Claude 3.7 Sonnet | Anthropic | Hybrid (can toggle thinking) |
| Gemini 2.0 Flash Thinking | Google | Fast reasoning variant |

---

## 8. AI Agents

### What Is an AI Agent?

An **AI Agent** is an LLM that doesn't just answer questions — it takes **actions** to accomplish a goal. It can use tools, browse the web, write and run code, and interact with software.

```
BASIC LLM:
  You ask → It answers → Done

AI AGENT:
  You give a goal → It plans steps → Executes actions → Reports results
  
  Example goal: "Research the top 5 AI companies and make a summary doc"
  
  Agent does:
  1. Search Google for "top AI companies 2025"
  2. Open each website, read content
  3. Take notes on each company
  4. Create a structured document
  5. Save it → Done
```

### Agent Architecture — The Loop

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT LOOP                               │
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  THINK   │───►│   ACT    │───►│ OBSERVE  │              │
│  │ (LLM)    │    │ (Tools)  │    │ (Result) │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│       ▲                                  │                  │
│       └──────────────────────────────────┘                  │
│              Repeat until goal achieved                     │
└─────────────────────────────────────────────────────────────┘

THINK: LLM decides what to do next
ACT: Calls a tool (web search, code runner, API, file system)
OBSERVE: Reads the result, feeds it back to LLM
REPEAT until task is complete
```

### Tools an Agent Can Use

```
WEB TOOLS          → Search Google, browse URLs, scrape pages
CODE TOOLS         → Write Python, execute it, see output
FILE TOOLS         → Read/write files, create folders
API TOOLS          → Call Stripe, Slack, Gmail, databases
COMPUTER TOOLS     → Click buttons, type, take screenshots
MEMORY TOOLS       → Store facts for later retrieval
```

### Real Agent Examples (2025)

**Cursor (AI Code Editor)**
- You describe what you want to build
- Agent reads your codebase, writes code, runs tests, fixes errors
- Acts like a senior developer working alongside you

**Claude Computer Use**
- Anthropic's agent can control a computer like a human
- Opens browsers, fills forms, navigates UIs
- Used for automating repetitive computer tasks

**Devin (Cognition AI)**
- Full software engineer agent
- Given a task, it opens IDE, writes code, runs tests, debugs, submits PRs

**OpenAI Operator**
- Browses the web on your behalf
- Books restaurants, fills shopping carts, completes forms

### Agent Frameworks (Tools Developers Use)

```
LangChain     → Most popular, many integrations, Python/JS
LangGraph     → Graph-based agent flows (from LangChain team)
CrewAI        → Multi-agent orchestration (agents work as a team)
AutoGen       → Microsoft's multi-agent framework
Pydantic AI   → Type-safe agent building in Python
Mastra        → TypeScript-native agent framework
```

---

## 9. Multi-Agent Systems

### What Is a Multi-Agent System?

Instead of one AI agent doing everything, you have **multiple specialized agents** working together — like a team of experts.

```
SINGLE AGENT (does everything):
  User Goal → [One Agent] → Result

MULTI-AGENT (specialized team):
  User Goal
      ↓
  [Orchestrator Agent]  ← coordinates the team
      │
      ├──► [Research Agent]  → searches web, gathers info
      │
      ├──► [Writer Agent]    → writes content
      │
      ├──► [Reviewer Agent]  → checks quality
      │
      └──► [Publisher Agent] → formats and saves output
      ↓
  Final Result
```

### Why Use Multiple Agents?

- **Specialization**: Each agent is optimized for one job
- **Parallelism**: Multiple agents work simultaneously (faster)
- **Reliability**: One agent can verify another's work
- **Scale**: Break large tasks into parallel subtasks

### Real Example — Software Development Team

```
User: "Build me a REST API for a todo app"

ORCHESTRATOR: Breaks this into tasks
    │
    ├─► ARCHITECT AGENT: "Design the API schema and database"
    │       Output: API spec, DB schema
    │
    ├─► BACKEND AGENT: "Implement the API endpoints"  
    │       (reads architect's output)
    │       Output: working code
    │
    ├─► TEST AGENT: "Write and run tests for the API"
    │       Output: test results, bug reports
    │
    └─► DEVOPS AGENT: "Deploy to production"
            Output: live URL

Total time: 10 minutes (vs hours of human work)
```

---

## 10. Model Context Protocol (MCP)

### What Is MCP?

**MCP (Model Context Protocol)** is an open standard created by Anthropic (late 2024) that defines HOW AI models connect to external tools, data sources, and services in a standardized way.

Think of it like USB — before USB, every device had its own connector. MCP is the "USB standard" for AI tools.

```
WITHOUT MCP (each tool built differently):
  Claude + Notion    → custom integration code
  Claude + GitHub    → different custom code
  Claude + Postgres  → yet another custom code

WITH MCP (one standard):
  Claude <──MCP──> [Notion MCP Server]
  Claude <──MCP──> [GitHub MCP Server]  
  Claude <──MCP──> [Postgres MCP Server]
  
  Any MCP-compatible AI works with any MCP-compatible tool
```

### How MCP Works

```
┌─────────────────────────────────────────────────┐
│                   MCP ARCHITECTURE              │
│                                                 │
│  ┌─────────┐    MCP Protocol    ┌─────────────┐ │
│  │  AI     │◄──────────────────►│  MCP Server │ │
│  │  Model  │                    │             │ │
│  │(Claude, │   1. AI asks:      │  - File     │ │
│  │ GPT,    │   "List my files"  │    system   │ │
│  │ Cursor) │                    │  - GitHub   │ │
│  │         │   2. Server does   │  - Postgres │ │
│  │         │   3. Returns result│  - Slack    │ │
│  └─────────┘                    │  - Notion   │ │
│                                 └─────────────┘ │
└─────────────────────────────────────────────────┘
```

### Popular MCP Servers (2025)

```
DEVELOPER TOOLS
├── GitHub MCP      → Read repos, create PRs, manage issues
├── File System MCP → Read/write local files
├── Postgres MCP    → Query databases
└── Puppeteer MCP   → Control a web browser

PRODUCTIVITY
├── Slack MCP       → Send messages, read channels
├── Notion MCP      → Read/write pages and databases
├── Google Drive    → Access docs, sheets
└── Jira MCP        → Create/update tickets

DATA & APIs
├── Brave Search    → Web search
├── Weather MCP     → Real-time weather data
└── Stripe MCP      → Payment operations
```

### MCP in Practice (Cursor + GitHub)

```
Developer in Cursor:
"Fix the bug reported in GitHub issue #42 and create a PR"

Cursor (with MCP):
1. [GitHub MCP] Read issue #42 → "Login form crashes on empty email"
2. [File System MCP] Find login form code
3. [AI] Identify the bug, generate fix
4. [File System MCP] Apply the fix
5. [GitHub MCP] Create branch, commit, open PR
6. Reports: "PR #87 opened with the fix"
```

---

## 11. Prompt Engineering

### What Is Prompt Engineering?

**Prompt engineering** is the skill of writing instructions to an AI that get you the best results. The same AI model gives wildly different quality responses based on how you phrase the request.

### Core Techniques

**1. Be Specific**
```
Bad:  "Write about Python"
Good: "Write a 300-word beginner explanation of Python decorators
       with one real-world example. Assume the reader knows basic Python."
```

**2. Give It a Role (System Prompt)**
```
System: "You are a senior TypeScript developer. You write clean,
         type-safe code with proper error handling. You prefer
         functional patterns over classes."

User: "Write a function to fetch user data from an API"

Result: Much better code than without the role
```

**3. Few-Shot Examples (Show, Don't Just Tell)**
```
"Format customer reviews like this:

Input: 'Great product, loved it!'
Output: {sentiment: 'positive', score: 9, summary: 'Very satisfied'}

Input: 'Terrible quality, broke in a week'
Output: {sentiment: 'negative', score: 2, summary: 'Poor durability'}

Now format this:
Input: 'Decent product but overpriced for what you get'"
```

**4. Chain-of-Thought (Make It Think Step by Step)**
```
Bad:  "What is 15% of 840?"
Good: "What is 15% of 840? Think step by step."

Without CoT: Model might just guess
With CoT:    "15% = 15/100. 840 × 15 = 12600. 12600 / 100 = 126. Answer: 126"
```

**5. Structured Output**
```
"Extract the key info from this job posting and return ONLY valid JSON:
{
  'title': '...',
  'company': '...',
  'salary_range': '...',
  'required_skills': [...],
  'remote': true/false
}"
```

### Prompt Structure (The Template)

```
┌──────────────────────────────────────────┐
│            SYSTEM PROMPT                 │
│  Who the AI is, its personality, rules   │
│  "You are a... You always... Never..."   │
├──────────────────────────────────────────┤
│           CONTEXT / BACKGROUND           │
│  Relevant info the AI needs to know      │
│  Documents, data, constraints            │
├──────────────────────────────────────────┤
│              THE TASK                    │
│  What you want it to do                  │
│  Specific, actionable, clear             │
├──────────────────────────────────────────┤
│         OUTPUT FORMAT                    │
│  How you want the response               │
│  JSON / bullet points / table / length   │
└──────────────────────────────────────────┘
```

### Advanced: Meta-Prompting

Ask the AI to improve its own prompt:
```
"Here's a prompt I'm using: [your prompt]
 How would you rewrite this prompt to get better results from you?"
```

---

## 12. RAG — Retrieval Augmented Generation

### The Problem RAG Solves

LLMs have a training cutoff — they don't know about events after their training ended. They also don't know about YOUR private data (company docs, internal wikis, personal notes).

```
User: "What's in our Q3 sales report?"
Basic LLM: "I don't have access to your sales reports." ❌

User: "What's in our Q3 sales report?"
RAG System: [searches your internal docs] → "Q3 revenue was $4.2M,
             up 23% from Q2. Top regions: APAC (+40%), EU (+15%)..." ✅
```

### How RAG Works

```
SETUP PHASE (done once):
─────────────────────────
1. Take your documents (PDFs, wikis, reports, emails)
2. Split into chunks (~500 words each)
3. Convert each chunk to an embedding (a vector of numbers)
4. Store all embeddings in a Vector Database

QUERY PHASE (every question):
──────────────────────────────
User Question
     ↓
Convert question to embedding
     ↓
Search vector DB for similar chunks (cosine similarity)
     ↓
Retrieve top 3-5 most relevant chunks
     ↓
Send to LLM: "Here's context: [chunks]. Answer this: [question]"
     ↓
LLM generates answer grounded in your actual documents
```

### Visual Flow

```
          YOUR DOCUMENTS
               │
               ▼
    ┌─────────────────────┐
    │  Embedding Model    │  ← Converts text to numbers
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │   Vector Database   │  ← Stores searchable vectors
    └──────────┬──────────┘
               │
    ┌──────────┘◄──── User Question (also converted to vector)
    │
    ▼
SIMILARITY SEARCH → Find most relevant document chunks
    │
    ▼
┌───────────────────────────────────────────┐
│  LLM PROMPT:                              │
│  Context: [chunk1] [chunk2] [chunk3]      │
│  Question: [user's question]              │
│  Answer based on the context above:       │
└───────────────────────────────────────────┘
    │
    ▼
GROUNDED ANSWER with source citations
```

### RAG vs Fine-tuning vs Basic LLM

| Approach | When to Use | Cost | Data Freshness |
|----------|------------|------|---------------|
| Basic LLM | General knowledge questions | Low | Training cutoff |
| RAG | Large, changing knowledge bases | Medium | Real-time |
| Fine-tuning | Specific style / behavior changes | High | Training cutoff |
| RAG + Fine-tuning | Enterprise-grade specialized AI | Highest | Real-time |

### Real Examples (2025)

- **Perplexity AI**: RAG over live web search — gives sourced answers
- **NotebookLM (Google)**: Upload PDFs, ask questions about your documents
- **Cursor**: RAG over your codebase — AI knows your entire project
- **ChatGPT with file upload**: Temporary RAG over your uploaded files
- **Notion AI**: RAG over your Notion workspace

---

## 13. Embeddings

### What Is an Embedding?

An **embedding** converts any piece of text (word, sentence, paragraph) into a list of numbers (a vector) that captures its **meaning**.

The magic: similar meanings → similar numbers → similar position in space.

```
TEXT → EMBEDDING (numbers that capture meaning)

"cat"   → [0.2, -0.1, 0.8, 0.3, -0.5, ...] (1536 numbers)
"kitten"→ [0.21, -0.09, 0.79, 0.28, -0.51,...] (very similar!)
"dog"   → [0.19, -0.08, 0.6, 0.4, -0.3, ...]  (somewhat similar)
"car"   → [-0.8, 0.7, -0.2, 0.1, 0.9, ...]    (very different)
```

### Semantic Similarity

Because similar meanings → similar vectors, you can measure "how similar" two pieces of text are:

```
"I love pizza" ←──── very similar ────► "Pizza is my favorite food"
                        (0.95 cosine similarity)

"I love pizza" ←──── very different ──► "The stock market crashed"
                        (0.12 cosine similarity)
```

### What Embeddings Enable

```
SEARCH:
  User searches "cheap flight to Paris"
  Traditional search: exact keyword match
  Embedding search: also finds "affordable airfare to France" ✅

RECOMMENDATIONS:
  Vector of article you're reading → find articles with similar vectors
  → "You might also like..." (Netflix, Spotify, YouTube all use this)

CLUSTERING:
  Group thousands of customer support tickets by topic
  → automatically clusters "billing", "technical", "shipping"

ANOMALY DETECTION:
  Transaction embeddings → unusual patterns stick out in vector space
```

### Popular Embedding Models (2025)

| Model | Provider | Dimensions | Use Case |
|-------|---------|-----------|---------|
| text-embedding-3-large | OpenAI | 3072 | Best general purpose |
| text-embedding-3-small | OpenAI | 1536 | Cheaper, still good |
| embed-english-v3.0 | Cohere | 1024 | Strong for English |
| nomic-embed-text | Nomic (open) | 768 | Free, local use |
| mxbai-embed-large | MixedBread | 1024 | Strong open source |

---

## 14. Vector Databases

### What Is a Vector Database?

A regular database stores rows and columns and looks up exact matches. A **vector database** stores embeddings (vectors) and answers the question: "What stored vectors are most similar to this query vector?"

```
REGULAR DB QUERY:
  SELECT * FROM products WHERE name = 'laptop'
  → Exact match only

VECTOR DB QUERY:
  Find products whose embedding is most similar to "portable computer for work"
  → Returns: MacBook Pro, Dell XPS, ThinkPad (by semantic similarity)
  → Even if none of them contain the words "portable computer for work"
```

### How Vector Search Works

```
1. You store 1M product descriptions as vectors

2. User searches: "comfortable chair for bad backs"

3. Convert query to vector: [0.3, -0.1, 0.7, ...]

4. Vector DB runs Approximate Nearest Neighbor (ANN) search:
   → Finds 5 closest vectors in milliseconds
   → Even across millions of vectors

5. Returns: ergonomic chairs, lumbar support seats, orthopedic office chairs
   (even if none contain "comfortable" or "bad backs" exactly)
```

### Popular Vector Databases (2025)

| Database | Type | Best For |
|----------|------|---------|
| Pinecone | Managed cloud | Production, no infra management |
| Weaviate | Open source / cloud | Full-featured, GraphQL API |
| Chroma | Open source | Local dev, getting started |
| Qdrant | Open source / cloud | High performance, filtering |
| pgvector | PostgreSQL extension | Already using Postgres? Add vectors |
| Milvus | Open source | Billion-scale deployments |

**Pro tip for 2025**: If you already use PostgreSQL, just add the `pgvector` extension — no separate database needed for most use cases.

---

## 15. Fine-tuning

### What Is Fine-tuning?

A pre-trained LLM is good at everything in general. **Fine-tuning** takes that model and trains it further on your specific data to make it excellent at your specific task.

```
PRE-TRAINED MODEL (GPT-4o)
  → Knows everything, generally good
  → Like a smart new employee with broad knowledge

FINE-TUNED MODEL (GPT-4o fine-tuned on your medical data)
  → Still knows everything
  → PLUS expert in medical terminology, your company's style
  → Like that same employee after 6 months in your hospital
```

### When to Fine-tune vs RAG

```
USE RAG WHEN:
  ✅ Your data changes frequently (news, support tickets)
  ✅ You need source citations / grounding
  ✅ Large, searchable knowledge base
  ✅ You want to avoid training costs

USE FINE-TUNING WHEN:
  ✅ You want to change HOW the model writes (tone, style, format)
  ✅ You want the model to learn domain-specific jargon
  ✅ You need very fast inference (fine-tuned small model > RAG large model)
  ✅ Your use case is narrow and well-defined
  ✅ Privacy: you don't want docs going to LLM at inference time
```

### Types of Fine-tuning

**1. Full Fine-tuning**
- Update ALL model parameters
- Most expensive (requires same hardware as training)
- Not common for LLMs due to cost

**2. LoRA (Low-Rank Adaptation)** — Most Popular
```
Instead of updating 70 billion parameters:
  → Add small "adapter" layers (millions of parameters)
  → Only train the adapters
  → 10-100x cheaper, almost same performance

Like: adding a thin lens to glasses (adapts) vs making new glasses (full)
```

**3. RLHF (Reinforcement Learning from Human Feedback)**
```
How ChatGPT was made "helpful and safe":
  1. Pre-train the base model (raw text prediction)
  2. Fine-tune with demonstrations (humans show good examples)
  3. Train a reward model (humans rank responses: which is better?)
  4. Use RL to optimize for high reward scores

Result: Model learns to be helpful, harmless, and honest
```

**4. DPO (Direct Preference Optimization)**
- Newer, simpler version of RLHF — no reward model needed
- Give pairs of responses labeled (good, bad) → model learns preference
- Used in many 2024-2025 models

---

## 16. Function Calling / Tool Use

### What Is Function Calling?

**Function calling** (also called Tool Use) is the ability of an LLM to decide when to call an external function/API instead of answering from memory.

Instead of just generating text, the model generates structured instructions to call your code.

```
WITHOUT FUNCTION CALLING:
  User: "What's the weather in Mumbai?"
  LLM: "I don't have real-time weather data." ❌

WITH FUNCTION CALLING:
  User: "What's the weather in Mumbai?"
  LLM: [decides to call weather API]
       → Generates: {"function": "get_weather", "city": "Mumbai"}
  Your code: calls weather API → returns {"temp": 32, "humidity": 85}
  LLM: "It's currently 32°C and humid in Mumbai." ✅
```

### How It Works

```
1. You tell the LLM: "You have access to these tools:
   - get_weather(city): returns current weather
   - search_web(query): returns search results
   - send_email(to, subject, body): sends an email"

2. User asks: "Is it raining in Delhi? If yes, send me an email."

3. LLM decides:
   Step 1: call get_weather("Delhi")
   → Result: {"rain": true, "temp": 28}
   
   Step 2: call send_email(user@email.com, "Delhi Rain Alert", "It's raining!")
   → Result: "email sent"
   
   Step 3: "Done! It's raining in Delhi. I've sent you an email."
```

### Real-World Function Calling Uses

```
CUSTOMER SERVICE BOT:
  check_order_status(order_id)
  process_refund(order_id, reason)
  escalate_to_human(ticket_id)

CODING ASSISTANT:
  run_code(language, code)
  search_documentation(query)
  read_file(path)

FINANCIAL AI:
  get_stock_price(ticker)
  get_portfolio(user_id)
  place_trade(ticker, quantity, type)
```

---

## 17. Hallucination & Guardrails

### What Is Hallucination?

**Hallucination** is when an AI confidently states something that is false. The model generates text that sounds plausible but is factually wrong — because it's completing patterns, not looking up facts.

```
EXAMPLES OF HALLUCINATION:

Fake citations:
  User: "Cite papers on neural scaling laws"
  AI: "See Smith et al. (2023) in Nature, DOI: 10.1234/xyz"
  Reality: That paper and DOI don't exist ❌

Wrong facts (said confidently):
  User: "When was the Eiffel Tower built?"
  AI: "The Eiffel Tower was built in 1892 for the World Fair"
  Reality: It was completed in 1889 ❌

Fake code APIs:
  User: "How do I use pandas to merge on multiple keys?"
  AI: pd.merge_multiple(df1, df2, keys=['a','b'])  ← doesn't exist ❌
```

### Why Does Hallucination Happen?

```
LLMs learn: "what text usually comes after what other text"
They do NOT learn: "what is true vs false"

If training data said "The Eiffel Tower was built in 1889" 1000 times
and "1892" 10 times (mistakes) → model usually gets it right BUT
sometimes generates the wrong pattern

The model has NO concept of "I don't know" — it will always generate
the most statistically likely continuation, even if wrong
```

### How to Reduce Hallucination

```
TECHNIQUE 1 — Grounding with RAG:
  Give the model actual source documents
  "Answer ONLY from the context below. Say 'I don't know' if not in context."

TECHNIQUE 2 — Ask for confidence:
  "Answer this and rate your confidence 1-10. If below 7, say you're uncertain."

TECHNIQUE 3 — Use temperature=0 for facts:
  Lower temperature → more predictable → fewer fabrications

TECHNIQUE 4 — Cross-verify:
  For critical info, have a second model check the first model's answer

TECHNIQUE 5 — Citation requirement:
  "Cite your source for every claim. If you can't cite it, don't say it."
```

### Guardrails — Safety Mechanisms

**Guardrails** are systems that prevent AI from producing harmful, inappropriate, or off-topic content.

```
INPUT GUARDRAILS (check before sending to LLM):
  → PII detection: remove names, phone numbers, SSNs
  → Prompt injection detection: catch attempts to override system prompt
  → Topic restriction: block questions outside allowed scope

OUTPUT GUARDRAILS (check LLM response before showing user):
  → Toxicity filter: block hate speech, violence
  → Fact checking: verify claims against known sources
  → Format validation: ensure JSON is valid, code compiles
  → Brand safety: ensure responses match company guidelines

TOOLS FOR GUARDRAILS:
  - Guardrails AI (open source framework)
  - NeMo Guardrails (NVIDIA)
  - LlamaGuard (Meta, open source classifier)
  - Azure Content Safety API
  - Anthropic Constitutional AI (built into Claude)
```

---

## 18. Training vs Inference

### Training — Teaching the Model

**Training** is the process of building the model — feeding it data and adjusting billions of internal numbers until it learns patterns.

```
TRAINING PROCESS:
─────────────────

DATA (trillions of tokens from the internet, books, code)
  ↓
TOKENIZE → convert to numbers
  ↓
FORWARD PASS → run through the network, make prediction
  ↓
COMPARE → how wrong was the prediction? (loss function)
  ↓
BACKWARD PASS → adjust billions of weights to reduce error
  ↓
REPEAT ~1 trillion times
  ↓
DONE → trained model (weights saved as a file)
```

**Training costs (approximate 2025):**

| Model | Training Cost | GPUs Used | Duration |
|-------|-------------|----------|---------|
| GPT-4 | ~$63M-100M | 25,000+ A100s | 3-6 months |
| LLaMA 3 405B | ~$10M-20M | Thousands | Weeks |
| DeepSeek V3 | ~$5.5M | 2048 H800s | ~55 days |
| Phi-4 (3.8B) | ~$100K | Hundreds | Days |

**DeepSeek's breakthrough**: They trained a GPT-4 level model for $5.5M (vs $100M+ for OpenAI). This showed that efficient training techniques can massively reduce costs.

### Inference — Using the Model

**Inference** is what happens every time you send a message to an AI. The trained model (frozen weights) processes your input and generates a response.

```
INFERENCE PROCESS:
──────────────────

Your message: "Explain black holes"
  ↓
TOKENIZE → [1043, 287, 4004, 10421]
  ↓
FORWARD PASS ONCE per token generated
  ↓
Generate: "Black" → "holes" → "are" → "regions" → ...
  ↓
DETOKENIZE → "Black holes are regions..."
  ↓
Stream to your screen
```

**Inference optimization techniques:**

```
BATCHING: Process multiple users' requests simultaneously
           → 10x efficiency vs one-at-a-time

KV CACHE: Cache the attention computations for the context
           → Avoid recomputing what we've already seen

SPECULATIVE DECODING: Small model guesses multiple tokens ahead,
                       big model verifies in batch → 2-3x faster

QUANTIZATION: Use 4-bit instead of 16-bit numbers for weights
               → 4x smaller, runs on consumer hardware, small accuracy loss

FLASH ATTENTION: Optimized attention algorithm, less memory, faster
```

### Training vs Inference Summary

| | Training | Inference |
|--|---------|----------|
| When | Once (to build model) | Every user request |
| Duration | Weeks to months | Milliseconds to seconds |
| Cost | Millions of dollars | Fractions of a cent |
| GPU memory | 1000s of GB | 4-80 GB |
| Who does it | AI companies | Cloud providers / your server |
| What changes | Model weights | Nothing (weights are frozen) |

---

## 19. Quantization & Local LLMs

### What Is Quantization?

AI models store their weights (the learned numbers) in floating point format. **Quantization** reduces the precision of these numbers to make models smaller and faster.

```
WEIGHT PRECISION vs SIZE vs QUALITY:
─────────────────────────────────────

FP32 (full precision):  32 bits per weight → 140 GB for 70B model  (best quality)
FP16 (half precision):  16 bits per weight → 70 GB for 70B model   (nearly same)
INT8 (8-bit):           8 bits per weight  → 35 GB for 70B model   (slight quality drop)
INT4 (4-bit):           4 bits per weight  → 17 GB for 70B model   (noticeable but OK)
INT2 (2-bit, extreme):  2 bits per weight  → 9 GB for 70B model    (quality suffers)

Most practical sweet spot: 4-bit quantization
```

### Local LLMs — Running AI on Your Own Machine

You can run LLMs on your own computer — no internet, no API costs, complete privacy.

**Why run locally?**
- No per-request cost (pay once for hardware)
- Complete privacy (data never leaves your machine)
- Works offline
- No rate limits

**Requirements (rough guide):**

```
MODEL SIZE    RAM NEEDED    RUNS ON
─────────────────────────────────────────────────────────
7B  (4-bit)   8 GB VRAM    Most gaming GPUs (RTX 3070+)
13B (4-bit)   10 GB VRAM   RTX 3080, RTX 4070
34B (4-bit)   24 GB VRAM   RTX 4090, Mac M2 Ultra
70B (4-bit)   40+ GB VRAM  A100, H100, or 2× RTX 4090
405B (4-bit)  200+ GB      Multi-GPU server
```

**Apple Silicon (M1/M2/M3/M4 Macs)** are excellent for local AI — unified memory means the GPU has access to all RAM (e.g., M2 Max with 96GB RAM can run 70B models well).

### Tools for Local LLMs

```
OLLAMA (easiest):
  brew install ollama
  ollama run llama3.1      ← downloads and runs instantly
  ollama run deepseek-r1   ← reasoning model locally
  
  Has API: curl http://localhost:11434/api/generate
  
LM STUDIO:
  Desktop app with GUI
  Download models from HuggingFace
  OpenAI-compatible API

JAN:
  Open-source desktop app
  Works offline, OpenAI-compatible

llama.cpp:
  The engine behind most local tools
  Extremely optimized C++ implementation
```

### Good Local Models (2025)

```
GENERAL CHAT:
  Llama 3.1 8B      → Fast, good for everyday tasks
  Llama 3.3 70B     → Near GPT-4 quality, needs ~40GB RAM
  Qwen2.5 14B       → Surprisingly good for the size

CODING:
  Qwen2.5-Coder 32B → Best coding model for local use
  DeepSeek-Coder    → Excellent code generation

REASONING:
  DeepSeek R1       → Full reasoning model, open weights
  QwQ 32B           → Strong reasoning, open source

TINY (runs on anything):
  Phi-4 3.8B        → Microsoft's efficient model
  Gemma 2 2B        → Google's tiny but capable
```

---

## 20. Mixture of Experts (MoE)

### What Is MoE?

A standard LLM activates ALL its parameters for every token. **Mixture of Experts (MoE)** has many specialized sub-networks ("experts") but only activates a few for each token — like calling the right specialist.

```
STANDARD MODEL (Dense):
  [Input Token] → All 70B parameters → [Output]
  Every word goes through ALL neurons
  Expensive, but simple

MoE MODEL:
  [Input Token] → ROUTER → selects 2 of 8 "experts"
                              ↓
                    [Expert 3] [Expert 7]
                              ↓
                         [Output]
  
  Most parameters are "sleeping" — only 2 out of 8 experts activate
  Total parameters: 8 × 7B = 56B
  Active parameters: 2 × 7B = 14B (per token)
  → Same quality, much faster/cheaper inference
```

### Real MoE Models

```
GPT-4:           ~1.8 trillion total params, 16 experts, ~220B active
Mixtral 8×7B:    56B total params, 2 of 8 experts active (14B each token)
Mixtral 8×22B:   141B total params, 2 of 8 active (39B each token)
DeepSeek V3:     671B total, 37B active per token (256 experts, top-8 routing)
Qwen1.5-MoE:     2.7B active / 14.3B total
```

**Why this matters for DeepSeek's cost breakthrough**: DeepSeek V3 has 671B parameters but only uses 37B per token. Training and running it is ~18x cheaper than a dense 671B model — which is why they could train it for $5.5M.

### MoE Trade-offs

| | Dense Model | MoE Model |
|--|-------------|----------|
| Parameters | All active | Subset active |
| Memory to load | Proportional | Must load ALL experts |
| Inference compute | High | Low (only active experts) |
| Training | Simpler | More complex |
| Quality | Good | Equal or better |

---

## 21. AI Safety & Alignment

### The Core Problem

An AI that is very powerful but not aligned with human values could be dangerous. AI safety research works on ensuring AI systems do what humans actually want.

### Key Concepts

**Alignment**: Making sure the AI's goals and values match human intentions.

```
MISALIGNMENT EXAMPLE (silly but illustrative):
  Goal given: "Maximize user engagement"
  Misaligned behavior: Show outrage-inducing content (it works but is harmful)
  
  Goal given: "Keep users on platform as long as possible"
  Misaligned: Remove sleep mode, make notifications addictive

  Well-aligned: "Maximize genuine user value and wellbeing"
```

**Constitutional AI (Anthropic's approach)**:
Claude was trained with a "constitution" — a list of principles like:
- "Choose the response that is least likely to contain false information"
- "Choose the response that is most helpful while being least harmful"

Claude critiques its own responses against these principles and rewrites them if needed.

**RLHF (Reinforcement Learning from Human Feedback)**:
Used by OpenAI for ChatGPT — humans rate responses, model learns to give human-preferred responses.

### AI Safety Categories

```
SHORT-TERM CONCERNS (happening now):
  - Misinformation / deepfakes
  - Job displacement
  - Privacy violations
  - Bias in AI decisions (loan approvals, hiring)
  - AI-generated harmful content

MEDIUM-TERM CONCERNS:
  - Over-reliance on AI (deskilling)
  - Concentration of AI power in few companies
  - AI in warfare and weapons
  - Regulatory gaps

LONG-TERM CONCERNS (theoretical):
  - Superintelligent AI that pursues misaligned goals
  - Loss of human control over critical systems
```

### Responsible AI Practices

```
TRANSPARENCY:  Tell users they're talking to an AI
EXPLAINABILITY: Be able to explain AI decisions (especially in healthcare, law)
FAIRNESS:       Test for bias across demographic groups
PRIVACY:        Don't train on private user data without consent
HUMAN OVERSIGHT: Keep humans in the loop for high-stakes decisions
ROBUSTNESS:     Test for adversarial inputs and edge cases
```

---

## 22. Real-World AI in Production

### Example 1: GitHub Copilot (AI Coding Assistant)

```
Architecture:
──────────────
Code in Editor
    │
    ▼
[Context Window]
← Last 2000 lines of code
← Current file
← Related files
    │
    ▼
[LLM: GPT-4 / Claude]
    │
    ▼
[Suggestions streamed inline as you type]

Stats (2025):
  - 1.8M paid subscribers
  - Used in 50,000+ organizations
  - Developers report 55% faster coding
  - Accepts ~30% of suggestions on average
```

### Example 2: Perplexity AI (AI Search Engine)

```
Flow:
──────
User query: "Latest developments in fusion energy 2025"
    │
    ▼
[Query classified: needs real-time info]
    │
    ▼
[Web Search: Google/Bing API — fetch 10 results]
    │
    ▼
[Read each result page — extract key content]
    │
    ▼
[RAG: Combine all content into context]
    │
    ▼
[LLM: Generate comprehensive answer with citations]
    │
    ▼
User sees: Summarized answer + numbered sources

Stats:
  - 10M+ daily queries
  - Responses in ~3 seconds
  - Sources cited for every claim
```

### Example 3: Netflix Recommendations

```
When you finish a show, Netflix AI:
1. Creates an embedding of your viewing history
2. Finds users with similar embeddings (collaborative filtering)
3. Recommends shows those similar users loved
4. Real-time: Updates after each episode watched

+ Content embeddings:
1. Each show's plot, genre, mood, pacing → embedding
2. Your history → embedding
3. Find shows with similar embeddings to what you loved

Result: 80% of Netflix viewing comes from recommendations
```

### Example 4: Cursor (AI Code Editor)

```
Cursor uses multiple AI capabilities together:

AUTOCOMPLETE:
  Type code → LLM predicts next tokens → ghost text appears

CHAT (Ctrl+K):
  "Refactor this function to use async/await"
  → Agent reads your file, writes new version, shows diff

CODEBASE UNDERSTANDING:
  @codebase: "Where is user authentication handled?"
  → RAG over your entire codebase → finds the exact files

AGENT MODE:
  "Add a dark mode toggle to this React app"
  → Reads all relevant files → modifies CSS, components,
  → Creates new toggle component → links everything

Models used: Claude 3.7 Sonnet, GPT-4o, Gemini Flash
```

---

## 23. How Everything Fits Together

### The Modern AI Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                    MODERN AI APPLICATION                        │
│                                                                 │
│  USER INPUT (text, voice, image, file)                          │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  GUARDRAILS (input check)               │    │
│  │   PII removal · Topic filter · Injection detection      │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │                                   │
│       ┌─────────────────────┼──────────────────────┐           │
│       │                     │                      │           │
│       ▼                     ▼                      ▼           │
│  ┌──────────┐        ┌──────────────┐      ┌──────────────┐    │
│  │ RAG      │        │ FUNCTION     │      │   AGENT      │    │
│  │ Search   │        │ CALLING      │      │   TOOLS      │    │
│  │ (vector  │        │ (APIs,       │      │  (browse,    │    │
│  │  DB)     │        │  database)   │      │   run code)  │    │
│  └──────────┘        └──────────────┘      └──────────────┘    │
│       │                     │                      │           │
│       └─────────────────────┼──────────────────────┘           │
│                             │                                   │
│                             ▼                                   │
│                    ┌─────────────────┐                          │
│                    │   LLM / AGENT   │                          │
│                    │ (GPT-4o, Claude,│                          │
│                    │  Llama, Gemini) │                          │
│                    └────────┬────────┘                          │
│                             │                                   │
│       ┌─────────────────────┼──────────────────────┐           │
│       │                     │                      │           │
│       ▼                     ▼                      ▼           │
│  ┌──────────┐        ┌──────────────┐      ┌──────────────┐    │
│  │ Store in │        │  GUARDRAILS  │      │   CACHE      │    │
│  │ Vector   │        │ (output check│      │  (save cost  │    │
│  │ DB       │        │  toxicity,   │      │   on repeat  │    │
│  │          │        │  facts)      │      │   queries)   │    │
│  └──────────┘        └──────────────┘      └──────────────┘    │
│                             │                                   │
│                             ▼                                   │
│                       USER RESPONSE                             │
└─────────────────────────────────────────────────────────────────┘
```

### Full Example: AI Customer Support System

User says: "My order #12345 hasn't arrived. It's been 2 weeks."

```
STEP 1 — Input Guardrails:
  ✅ No PII issues beyond order number
  ✅ Topic is allowed (customer support)

STEP 2 — RAG Search:
  → Search knowledge base: "late delivery policy", "2 week delay"
  → Retrieves: company's refund policy, shipping FAQ

STEP 3 — Function Calling:
  → get_order_status(order_id="12345")
  → Returns: {status: "lost in transit", carrier: "FedEx", date: "Jan 15"}

STEP 4 — LLM (GPT-4o):
  Context: policy docs + order status
  Generates: personalized apology + what happens next + refund offer

STEP 5 — Agent (if needed):
  → If customer accepts refund: process_refund("12345", amount=49.99)
  → create_replacement_order("12345")

STEP 6 — Output Guardrails:
  ✅ Response is helpful, not harmful
  ✅ Refund amount is correct
  ✅ No false promises made

Response: "I'm sorry to hear this! I can see order #12345 was lost in 
transit on Jan 15. I've processed a full refund of $49.99 and sent a 
replacement order — it'll arrive in 3-5 days. Tracking: [link]"
```

---

## Quick Reference — All Terms at a Glance

| Term | One Line |
|------|---------|
| **AI** | Making machines simulate human intelligence |
| **ML** | Teaching machines by showing examples, not coding rules |
| **Deep Learning** | ML with many-layered neural networks |
| **LLM** | Giant language model trained on internet-scale text |
| **Token** | ~¾ of a word; how LLMs measure text length |
| **Context Window** | How much text the LLM can see at once |
| **Temperature** | 0 = predictable, 1+ = creative/random |
| **Transformer** | Neural network architecture with attention mechanism |
| **Attention** | How the model figures out which words relate to which |
| **Generative AI** | AI that creates new content (text, images, code, video) |
| **Reasoning Model** | LLM that thinks step-by-step before answering (o1, R1) |
| **AI Agent** | LLM + tools + ability to take real-world actions |
| **Multi-Agent** | Multiple AI agents working as a team |
| **MCP** | Standard protocol for connecting AI to external tools |
| **Prompt Engineering** | Skill of writing better instructions for AI |
| **RAG** | Give AI access to your own documents at query time |
| **Embedding** | Converting text to numbers that capture meaning |
| **Vector Database** | Database for storing and searching embeddings |
| **Fine-tuning** | Further training a model on your specific data |
| **LoRA** | Cheap fine-tuning by adding small adapter layers |
| **RLHF** | Training AI to be helpful using human preference ratings |
| **Function Calling** | LLM deciding to call your code/APIs instead of guessing |
| **Hallucination** | AI confidently stating false information |
| **Guardrails** | Safety checks on AI inputs and outputs |
| **Training** | Building the model (expensive, done once) |
| **Inference** | Using the model (cheap, done millions of times daily) |
| **Quantization** | Reducing model precision to run on smaller hardware |
| **Local LLM** | Running AI models on your own machine (via Ollama, etc.) |
| **MoE** | Architecture where only some "experts" activate per token |
| **AI Alignment** | Ensuring AI goals match what humans actually want |
| **Parameters** | The learned numbers inside a model (70B, 405B, etc.) |
| **Embedding Model** | Model that converts text/images to vectors |
| **System Prompt** | Background instructions given to AI before user talks |

---

*Last updated: March 2026 — The AI field moves fast. Models listed were state-of-the-art at time of writing.*
