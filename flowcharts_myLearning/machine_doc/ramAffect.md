# What Affects RAM on My Mac

## Where the 18 GB Goes

```text
                 MacBook M3 Pro
                18 GB Unified RAM
                       │
       ┌───────────────┼────────────────┐
       │               │                │
       ▼               ▼                ▼
     macOS          Applications       GPU
       │               │
       │       ┌───────┼────────┐
       │       │       │        │
       │     Chrome   VS Code   Docker
       │                       │
       │                ┌──────┼──────┐
       │                ▼      ▼      ▼
       │              MySQL   Redis  Node
       │
       └─────────────────────────────────
```

## When Does Docker Consume RAM?

```text
docker pull mysql
       ↓
SSD storage
       ↓
Very little RAM impact
```

But when you run:

```bash
docker run mysql
```

→ Docker starts a container. Now the **processes inside that container** need RAM.

Suppose you have:

| Service | RAM |
|---|---|
| MySQL | 1.5 GB |
| Redis | 200 MB |
| Node | 800 MB |
| ClickHouse | 2 GB |

Then Docker could be consuming roughly:

```text
1.5 + 0.2 + 0.8 + 2
= 4.5 GB RAM
```

**That's a big deal on an 18 GB machine.**

### If Docker Desktop is Quit / Not Running

```text
SSD
│
├── mysql image
├── redis image
├── node image
└── clickhouse image

RAM
│
└── ❌ Docker containers aren't running
```

So those images aren't sitting in RAM consuming their image size.

### When Does RAM Get Consumed?

When you start Docker Desktop and run containers:

```text
Docker image
     ↓
docker run / docker compose up
     ↓
Container starts
     ↓
Processes execute
     ↓
RAM consumed
```

### Check Running Containers

| Command | What it shows |
|---|---|
| `docker ps` | Only currently running containers |
| `docker ps -a` | Running + stopped containers |
| `docker images` | Image size = **disk** usage, not RAM usage. |

> A stopped container generally isn't consuming RAM, although it still takes some
> disk space.

## What Happens When You Have Many Projects Open?

```text
Project A
├── Next.js
├── NestJS
└── MySQL

Project B
├── Laravel
├── Redis
└── Node

Project C
├── Docker
├── ClickHouse
└── Minikube
```

| Project | RAM |
|---|---|
| Project A | 2 GB |
| Project B | 1.5 GB |
| Project C | 3 GB |

**That's potentially 6.5 GB just for development workloads.**

Opening the folders in VS Code isn't necessarily the big problem.
The problem is **processes running behind them**:

```text
VS Code
   │
   ├── TypeScript server
   ├── ESLint
   ├── language server
   ├── extensions
   └── terminal processes
```

And your terminal might have:

```bash
npm run dev
npm run start
next dev
nest start
php artisan serve
```

## Chrome Tabs Absolutely Affect RAM

```text
Chrome
├── Tab 1       200 MB
├── Tab 2       300 MB
├── Tab 3       500 MB
├── Tab 4       150 MB
├── Extension   200 MB
├── GPU         500 MB
└── ...
```

## What Happened to Your Mac Earlier?

```text
18 GB physical RAM
       ↓
Almost completely occupied
       ↓
macOS needs more memory
       ↓
Moves inactive memory to SSD
       ↓
Swap
       ↓
~13 GB swap used
```

So you ended up with:

```text
RAM
██████████████████  ~full

SSD
█████████████       ~13 GB swap
```
