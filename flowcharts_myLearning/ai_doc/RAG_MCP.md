# RAG and MCP

**RAG = Retrieval-Augmented Generation.**

RAG means: before an AI answers your question, it **searches your own
data/documents** for relevant information and then uses that information to
generate the answer.

## RAG in Action

You ask: *"How many leaves can I carry forward?"*

```text
          ↓
       RAG system
          ↓
Search company documents
          ↓
Find relevant section:
"Employees can carry forward up to 5 unused leaves."
          ↓
       AI receives this
          ↓
AI answers:
"You can carry forward up to 5 unused leaves."
```

## RAG Basically Has 2 Major Steps

```text
        YOUR QUESTION
             ↓
       🔍 RETRIEVAL
             ↓
Find relevant information
from your documents/database
             ↓
       🤖 GENERATION
             ↓
AI uses that information
to formulate the answer
             ↓
          ANSWER
```

## A Real-World Architecture

```text
             Company Documents
             ┌───────────────┐
             │ PDFs          │
             │ FAQs          │
             │ Wiki          │
             │ Policies      │
             └───────┬───────┘
                     ↓
              Split into chunks
                     ↓
               Embeddings
                     ↓
             Vector Database
                     │
                     │
User Question ───────┤
                     ↓
              Similarity Search
                     ↓
           Relevant 3-5 chunks
                     ↓
              LLM / GPT / Gemma
                     ↓
              Final Answer
```

## Why Do We Need RAG?

The biggest benefit is that **you don't have to train the AI model every time
your information changes.**

With RAG, you can update the document/vector database.
You don't need to retrain the LLM.

### One Very Simple Analogy

Think of Gemma/GPT as a smart employee.

- **Without RAG:** You ask the employee a question and expect them to remember
  everything.
- **With RAG:** You ask the employee a question → they search your company wiki →
  find the relevant document → read it → give you the answer.

## RAG vs MCP

**MCP = how Claude connects to/accesses external tools and data.**

### Classic RAG

```text
Documents
   ↓
Chunking
   ↓
Embeddings
   ↓
Vector DB
   ↓
Similarity Search
   ↓
Relevant chunks
   ↓
LLM
```

### MCP Database Approach

```text
Company DB
   ↓
SQL / API / MCP Tool
   ↓
Query database
   ↓
Relevant records
   ↓
Claude
```

## One Diagram

```text
                    Claude
                       │
                 MCP Server
                 /         \
                /           \
        Database Tool     RAG Tool
             ↓                ↓
       Company DB         Vector DB
             ↓                ↓
       Structured data   Documents/FAQs
                \           /
                 \         /
                   Claude
                      ↓
                   Answer
```
