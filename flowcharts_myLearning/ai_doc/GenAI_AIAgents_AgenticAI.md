# GenAI vs AI Agents vs Agentic AI

## 1. GenAI (Generative AI)

AI that creates new content (text, images, code, audio) based on patterns
learned from training data. It only **generates a response** — it does not
take any action.

**Example:**

You ask Claude Desktop: *"Write a Python function to reverse a string"*

```text
          ↓
       Claude (model)
          ↓
Generates code as text in the chat
```

It never runs the code or touches your files. **Just text in, text out.**

## 2. AI Agents

A GenAI model wrapped with the ability to take **ONE action** using a tool
(API, database, filesystem, Slack, etc.) instead of just replying with text.
Reasons about the request, picks a tool, calls it, then answers.

**Example:**

You ask Claude Desktop (with Slack MCP connector on):
*"Check my #eng channel for the latest deploy status"*

```text
          ↓
    Claude decides: I need the Slack tool
          ↓
     Calls Slack MCP tool
          ↓
    Fetches the message
          ↓
       Answers you
```

**One decision → one tool call → response.**

## 3. Agentic AI

Multiple steps, chained autonomously, with planning + self-correction,
looping (**act → observe → re-plan**) until the goal is done. Minimal human
input needed in between steps.

**Example:**

This is literally what Claude Code does.

You say: *"Fix the bug where LinkoutOfferSectionComplete isn't firing"*

```text
          ↓
   Searches codebase for where the event is defined
          ↓
   Traces how/where it's triggered
          ↓
   Edits the relevant file(s)
          ↓
   Runs tests / checks output
          ↓
   Fixes errors if any, re-checks
          ↓
   Reports back only once actually done
```

No step-by-step hand-holding required — it **plans, acts, checks, and repeats**
on its own.

## Simple Analogy

| | |
|---|---|
| **GenAI** | a chef who can cook any dish you describe |
| **AI Agent** | that chef who can also go to the fridge, grab ingredients, and use the stove themselves (one action) |
| **Agentic AI** | a whole kitchen staff (chef + sous chefs + waiter) that plans the menu, cooks, plates, and serves a full meal from just "make dinner" as input |

## Mapped to Tools You Actually Use

| What you do | What it is |
|---|---|
| Claude replying in chat | GenAI |
| Claude Desktop calling one MCP tool for you | AI Agent |
| Claude Code working end-to-end on a codebase | Agentic AI |
