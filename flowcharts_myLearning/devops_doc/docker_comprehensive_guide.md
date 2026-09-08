# Docker — Complete Guide with Real Examples
## How Docker Works, Every Term Explained Simply

> The best way to understand Docker is to build something with it.
> This guide walks you through a **Todo App** (Node.js + PostgreSQL) from scratch.
> Every Docker term is introduced exactly when you need it — no memorization required.

---

## The Problem Docker Solves

Before Docker, this was the most common frustration in software development:

```
Developer A: "It works on my machine!"
Developer B: "Well it doesn't work on mine."
Tester:      "And it definitely doesn't work in production."

WHY?
  Developer A's machine:  Node.js v18,  PostgreSQL 13,  macOS
  Developer B's machine:  Node.js v16,  PostgreSQL 11,  Windows
  Production server:      Node.js v14,  PostgreSQL 10,  Ubuntu

Same code, 3 different environments = 3 different behaviors.
```

**Docker's solution:** Package your app AND its entire environment together.
Now everyone runs the exact same thing, everywhere.

```
WITHOUT DOCKER:                    WITH DOCKER:

Your Code                          Your Code
    +                           +------------------+
Your laptop's Node v18             | Node v18        |
    +                             | PostgreSQL 13   |
Your laptop's Postgres 13          | Your Code       |
= Works on YOUR machine            | Linux (Alpine)  |
                                   +------------------+
                                   = Same container runs
Other dev's Node v16               EVERYWHERE
= Might break                      - Dev laptop
                                   - Test server
                                   - Production
```

---

## The Big Picture — 5 Core Concepts

Before diving in, here are the 5 things you need to understand.
(Don't worry — each one will make complete sense after the example below.)

```
1. DOCKERFILE  → A recipe: "Here's how to set up the environment for my app"
2. IMAGE       → The prepared meal (sealed, ready-to-use snapshot of your app)
3. CONTAINER   → The meal being eaten (the image is running, serving users)
4. REGISTRY    → A restaurant menu/warehouse (store and share images)
5. DOCKER COMPOSE → A meal plan (run multiple containers together)

FLOW:
  You write a Dockerfile
       ↓
  Docker reads it and builds an Image
       ↓
  You run the Image → it becomes a Container (your app is alive!)
       ↓
  You push the Image to a Registry (so others can use it)
       ↓
  In production: pull the image → run it → same app, same behavior
```

---

## Building a Todo App — Step by Step

We'll build a simple Todo app:
- **Backend**: Node.js API (add/list/delete todos)
- **Database**: PostgreSQL (stores todos)

Let's go through the process exactly as you would in real life.

---

## Step 1 — You Write the App Code

```
todo-app/
├── server.js          ← Node.js API
├── package.json       ← dependencies list
└── .env               ← config (DB credentials etc.)
```

```javascript
// server.js — simple Todo API
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const db = new Pool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'secret',
    database: process.env.DB_NAME || 'todos',
    port: 5432
});

// Get all todos
app.get('/todos', async (req, res) => {
    const result = await db.query('SELECT * FROM todos ORDER BY created_at DESC');
    res.json(result.rows);
});

// Add a todo
app.post('/todos', async (req, res) => {
    const { text } = req.body;
    const result = await db.query(
        'INSERT INTO todos (text) VALUES ($1) RETURNING *', [text]
    );
    res.json(result.rows[0]);
});

app.listen(3000, () => console.log('Todo API running on port 3000'));
```

Right now, to run this you'd need:
- Node.js installed
- PostgreSQL installed and running
- Correct version of everything

**With Docker, you don't need any of that installed. Docker handles it all.**

---

## Step 2 — The Dockerfile

### What is a Dockerfile?

A **Dockerfile** is a plain text file containing instructions that tell Docker:
"Here is how to set up the environment my app needs."

Think of it as a **recipe card**:
- A recipe tells you: get these ingredients, do these steps, in this order.
- A Dockerfile tells Docker: get this OS, install these tools, copy this code, run this command.

```
RECIPE CARD                DOCKERFILE
─────────────────────────────────────────────────────
1. Start with flour        FROM node:18-alpine   (start with Node.js + Linux)
2. Add eggs               COPY package.json ./   (add your dependencies list)
3. Mix 5 minutes          RUN npm install        (install them)
4. Bake at 180°C          COPY . .               (add your actual code)
5. Serve hot              CMD ["npm", "start"]   (run the app)
```

### Our Todo App Dockerfile

```dockerfile
# ──────────────────────────────────────────────────
# Dockerfile for the Todo API (Node.js)
# ──────────────────────────────────────────────────

# FROM: "Start with this base"
# node:18-alpine = Node.js version 18 installed on Alpine Linux (tiny OS, ~5MB)
# Why Alpine? Smaller image = faster to download and deploy
FROM node:18-alpine

# WORKDIR: "Work inside this folder inside the container"
# Like running: cd /app   (creates it if it doesn't exist)
WORKDIR /app

# COPY: "Copy files from my computer INTO the container"
# First copy ONLY package.json (not the whole code yet — explained in caching section)
COPY package*.json ./

# RUN: "Execute this command while building the image"
# This installs all Node.js dependencies (express, pg, etc.)
RUN npm install

# COPY: Now copy the rest of the app code
COPY . .

# EXPOSE: "This app will listen on port 3000"
# This is documentation — doesn't actually open the port (docker run -p does that)
EXPOSE 3000

# CMD: "This is the command to start the app when a container runs"
# Only ONE CMD per Dockerfile — it's the default startup command
CMD ["node", "server.js"]
```

### Every Dockerfile Instruction Explained

```
INSTRUCTION    WHAT IT DOES                              WHEN IT RUNS
──────────────────────────────────────────────────────────────────────
FROM           Sets the starting point (base image)      Build time
WORKDIR        Sets the working directory inside image   Build time
COPY           Copies files from host to image           Build time
ADD            Like COPY but can unzip files/download    Build time
RUN            Runs a shell command                      Build time
ENV            Sets environment variables                Build + Run time
EXPOSE         Documents which port the app uses         Documentation only
ARG            Build-time variables (like env for build) Build time only
USER           Switch to a different user                Build + Run time
HEALTHCHECK    Define how to check if container is alive Run time
ENTRYPOINT     Command that always runs (like CMD)        Run time
CMD            Default command to run the container      Run time

KEY DISTINCTION:
  RUN    = Executes during BUILD (creates a new layer in the image)
  CMD    = Executes when a CONTAINER STARTS (not during build)
  
  Example:
    RUN npm install        ← happens once, when building the image
    CMD ["node", "server"] ← happens every time a container starts
```

---

## Step 3 — Building the Docker Image

### What is a Docker Image?

A **Docker Image** is the result of running your Dockerfile.
It's a **frozen, complete snapshot** of your app and its entire environment.

Think of it like this:
- Dockerfile = recipe
- Image = the prepared dish, sealed and ready to serve
- You can make 100 copies of the dish from the same image

```
Docker reads your Dockerfile top to bottom.
Each instruction creates a LAYER:

+─────────────────────────────────────+  ← Layer 4: Your code (COPY . .)
+─────────────────────────────────────+  ← Layer 3: npm dependencies (RUN npm install)
+─────────────────────────────────────+  ← Layer 2: package.json copied (COPY package.json)
+─────────────────────────────────────+  ← Layer 1: Node.js + Alpine Linux (FROM node:18-alpine)

The final stacked result = your Docker Image.
```

### Why Layers Matter — Caching

Docker remembers each layer. If nothing changed, it reuses the cached layer (super fast).

```
First build:
  Layer 1 (FROM): Download Alpine + Node.js    [2 minutes] 
  Layer 2 (COPY package.json): Copy file       [instant]
  Layer 3 (RUN npm install): Install packages  [1 minute]
  Layer 4 (COPY . .): Copy your code           [instant]
  Total: ~3 minutes

Second build (you changed server.js):
  Layer 1 (FROM):          [CACHED - skip]
  Layer 2 (COPY package.json): [CACHED - skip]
  Layer 3 (RUN npm install):   [CACHED - skip]  ← package.json didn't change!
  Layer 4 (COPY . .):          [REBUILD - server.js changed]
  Total: ~2 seconds!

WHY COPY package.json BEFORE COPY . .?
  If you did COPY . . first:
    Any code change → all layers from that point rebuild (including npm install!)
  By copying package.json first, npm install is only re-run when packages change.
  This is the most important Dockerfile optimization trick.
```

### Building the Image

```bash
# Command: docker build -t <name>:<tag> <context>
# -t          = tag (name:version for your image)
# .           = build context (folder where Dockerfile lives)

$ docker build -t todo-api:v1.0 .

# What you see:
Step 1/6 : FROM node:18-alpine
 ---> Pulling from library/node    # downloading Node.js + Alpine
Step 2/6 : WORKDIR /app
 ---> Running in container abc123
Step 3/6 : COPY package*.json ./
 ---> Copied package.json
Step 4/6 : RUN npm install
 ---> Installing express, pg...
Step 5/6 : COPY . .
 ---> Copied server.js and other files
Step 6/6 : CMD ["node", "server.js"]
 ---> Setting default command
Successfully built 4f8a2c91e3d7
Successfully tagged todo-api:v1.0

# See your image:
$ docker images
REPOSITORY   TAG     IMAGE ID       CREATED          SIZE
todo-api     v1.0    4f8a2c91e3d7   10 seconds ago   180MB
node         18      d9baadf0ce87   2 weeks ago      130MB
```

---

## Step 4 — Running a Container

### What is a Docker Container?

A **Container** is a running instance of an image.
The image is the blueprint. The container is the actual, living, running thing.

```
IMAGE (blueprint, static)          CONTAINER (running, alive)
──────────────────────────────────────────────────────────────
todo-api:v1.0  →  docker run  →  running process (node server.js)
                                  listening on port 3000
                                  can accept API requests

Same image can run as MULTIPLE containers simultaneously:
  todo-api:v1.0  →  container-1  (port 3001, for user region A)
  todo-api:v1.0  →  container-2  (port 3002, for user region B)
  todo-api:v1.0  →  container-3  (port 3003, for backup)

Like a class vs object:
  Image     = class definition (blueprint)
  Container = object instance  (actually running)
```

### Running the Todo API Container

```bash
# Command: docker run [options] <image>
$ docker run -d -p 3000:3000 --name todo-backend todo-api:v1.0

# Breaking down the flags:
#   -d              = detached mode (run in background, don't block terminal)
#   -p 3000:3000    = port mapping: host:container
#                     Your laptop's port 3000 → container's port 3000
#   --name          = give the container a readable name (instead of random ID)
#   todo-api:v1.0   = which image to run

# Now test it:
$ curl http://localhost:3000/todos
[]                    ← empty todos list (works!)

$ curl -X POST http://localhost:3000/todos \
  -H "Content-Type: application/json" \
  -d '{"text": "Learn Docker"}'
{"id": 1, "text": "Learn Docker"}

# See running containers:
$ docker ps
CONTAINER ID   IMAGE          COMMAND              STATUS        PORTS                    NAMES
a1b2c3d4e5f6   todo-api:v1.0  "node server.js"     Up 2 minutes  0.0.0.0:3000->3000/tcp   todo-backend
```

### Port Mapping Explained

This is one of the most confusing things when starting with Docker — let's clear it up.

```
YOUR LAPTOP                    CONTAINER
──────────────────────────────────────────────────────────
                               The app inside the container
                               runs on PORT 3000 (its internal world)

                               +──────────────────+
http://localhost:3000  ──────► | port 3000 inside |
         ↑                     | container        |
   YOUR port 3000              +──────────────────+
   (external)

Flag: -p 3000:3000
       ↑     ↑
  host port  container port

-p 8080:3000   → Your browser hits localhost:8080,
                  Docker forwards it to port 3000 INSIDE the container
                  
-p 5000:3000   → Your browser hits localhost:5000,
                  Docker forwards it to port 3000 inside container

WHY: The container is isolated. It has its own network.
     Port mapping creates a "hole" from your machine into the container.
```

### Container vs VM — The Key Difference

People often ask "isn't this just a virtual machine?" No — it's much lighter.

```
VIRTUAL MACHINE                    DOCKER CONTAINER
──────────────────────────────────────────────────────────────
+──────────────────────+            +─────────────────────+
│  Full OS (10GB+)     │            │  Your App           │
│  Kernel              │            │  Dependencies       │
│  System Libraries    │            +─────────────────────+
│  Your App            │            │  Shared Host OS     │
│  Dependencies        │            │  Kernel (no copy)   │
+──────────────────────+            +─────────────────────+

Boot time: 30 seconds - 2 minutes   Boot time: milliseconds
Size: GBs                            Size: MBs
Isolation: Complete OS               Isolation: Process-level

Containers are faster because they SHARE the host OS kernel.
They don't boot a whole operating system — they just run a process.
```

---

## Step 5 — Running Multiple Containers Together (Docker Compose)

Our Todo app needs BOTH the Node.js API AND PostgreSQL running.
You could run them separately, but Docker Compose makes this much easier.

### What is Docker Compose?

**Docker Compose** is a tool to define and run **multi-container applications**.
You write ONE file (`docker-compose.yml`) that describes all your services.
One command (`docker compose up`) starts everything.

```
Without Docker Compose:
  Terminal 1: docker run -d postgres:13 ...
  Terminal 2: docker run -d todo-api:v1.0 ...
  You have to remember the right flags, the right order, networking setup...

With Docker Compose:
  One file describes everything.
  docker compose up → starts everything correctly.
  docker compose down → stops everything.
```

### The docker-compose.yml File

```yaml
# docker-compose.yml for the Todo App

version: '3.8'

services:

  # ─── Service 1: Our Node.js API ───────────────────────
  api:
    build: .                        # Build image from Dockerfile in current folder
    ports:
      - "3000:3000"                 # Map host port 3000 to container port 3000
    environment:                    # Environment variables passed into the container
      - DB_HOST=database            # "database" = the service name below (DNS magic!)
      - DB_USER=postgres
      - DB_PASS=secret
      - DB_NAME=todos
    depends_on:
      - database                    # Start 'database' service first, then start 'api'

  # ─── Service 2: PostgreSQL Database ──────────────────
  database:
    image: postgres:13              # Use official PostgreSQL image (no Dockerfile needed)
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=secret
      - POSTGRES_DB=todos
    volumes:
      - todo_db_data:/var/lib/postgresql/data  # Named volume — data persists!
    ports:
      - "5432:5432"                 # Optional: expose to host for DB tools like TablePlus

# ─── Named Volumes ────────────────────────────────────
volumes:
  todo_db_data:                     # Docker manages this storage location
```

### Running Everything

```bash
# Start all services
$ docker compose up -d
[+] Building 12.3s (8/8) FINISHED
[+] Running 3/3
 ✔ Network todo-app_default    Created
 ✔ Container todo-app-database-1  Started
 ✔ Container todo-app-api-1       Started

# Check what's running:
$ docker compose ps
NAME                    IMAGE          STATUS         PORTS
todo-app-api-1          todo-api       Up 5 seconds   0.0.0.0:3000->3000/tcp
todo-app-database-1     postgres:13    Up 6 seconds   0.0.0.0:5432->5432/tcp

# Test the app:
$ curl -X POST http://localhost:3000/todos \
  -H "Content-Type: application/json" \
  -d '{"text": "Buy groceries"}'
{"id": 1, "text": "Buy groceries", "created_at": "2024-01-15T10:30:00Z"}

$ curl http://localhost:3000/todos
[{"id": 1, "text": "Buy groceries", "created_at": "2024-01-15T10:30:00Z"}]

# View logs:
$ docker compose logs api
$ docker compose logs -f api          # -f = follow (real-time)

# Stop everything:
$ docker compose down
$ docker compose down -v              # also delete volumes (careful — deletes DB data!)
```

---

## Step 6 — Volumes and Data Persistence

### The Problem: Containers Are Temporary

```
Container A runs PostgreSQL.
You add 1000 todos.
You run: docker rm todo-app-database-1

ALL YOUR DATA IS GONE.

Why? Container's filesystem is temporary — it exists only while the container lives.
```

### What is a Volume?

A **Volume** is a way to store data OUTSIDE the container, so it survives container restarts and deletions.

```
WITHOUT VOLUME:                    WITH VOLUME:

Container                          Container
+──────────────────+               +──────────────────+
│  PostgreSQL      │               │  PostgreSQL      │
│  /var/lib/pg/data│               │  /var/lib/pg/data│──────────┐
│  (your DB data)  │               +──────────────────+          │
+──────────────────+                                             │
        │                          Volume (outside container)    │
   Container deleted                +──────────────────+         │
        │                          │  /var/lib/docker/ │◄────────┘
        ▼                          │  volumes/todo_db/ │
   DATA LOST ✗                     │  (your DB data)   │
                                   +──────────────────+
                                   
                                   Container deleted → volume STAYS ✓
                                   New container → same volume → data back ✓
```

### Three Types of Volumes

```
TYPE 1: NAMED VOLUME (Most Common for Databases)
─────────────────────────────────────────────────
Docker manages where the data is stored on your machine.
You just give it a name and use it.

  volumes:
    - todo_db_data:/var/lib/postgresql/data

  Named volume: todo_db_data
  Maps to: /var/lib/postgresql/data inside container

  Great for: databases, persistent app data
  Data location: Docker manages it (/var/lib/docker/volumes/)

─────────────────────────────────────────────────
TYPE 2: BIND MOUNT (Development / Live Reload)
─────────────────────────────────────────────────
You specify EXACTLY which folder on your machine to mount.

  volumes:
    - ./my-code:/app    # your local ./my-code folder → /app inside container

  Great for: development — you edit code on your laptop,
             changes immediately appear inside the container.
             No need to rebuild the image every time!

  Example in action:
    - Edit server.js on your laptop
    - Container sees the change INSTANTLY (no rebuild!)
    - App auto-reloads (if using nodemon)

─────────────────────────────────────────────────
TYPE 3: TMPFS (Temporary, In-Memory)
─────────────────────────────────────────────────
Stored in RAM. Deleted when container stops.

  tmpfs:
    - /tmp

  Great for: sensitive temp files (secrets, session tokens)
             that you never want written to disk
```

### Development Setup with Bind Mounts

For development, you want live code reloading — no rebuilding on every change:

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - .:/app                      # Bind mount: your local folder → /app in container
      - /app/node_modules           # Exception: don't overwrite node_modules from host
    environment:
      - DB_HOST=database
      - DB_USER=postgres
      - DB_PASS=secret
      - DB_NAME=todos
    command: npx nodemon server.js  # Override CMD to use nodemon (auto-restart on change)
    depends_on:
      - database

  database:
    image: postgres:13
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=secret
      - POSTGRES_DB=todos
    volumes:
      - todo_db_data:/var/lib/postgresql/data

volumes:
  todo_db_data:
```

```bash
# Start dev environment
$ docker compose -f docker-compose.dev.yml up

# Now edit server.js on your laptop
# nodemon detects the change → restarts server automatically
# No need to rebuild the image!
```

---

## Step 7 — Networking: How Containers Talk to Each Other

### The Problem

When two containers run (our API and PostgreSQL), they're isolated by default.
The API container needs to reach the database container.

### How Docker Networking Works

When you use Docker Compose, all services are automatically placed on a **shared network**.
They can reach each other using the **service name** as the hostname.

```
docker-compose.yml services:
  api:       → hostname inside network: "api"
  database:  → hostname inside network: "database"

From inside the api container:
  ping database       ← works! resolves to database container's IP
  curl database:5432  ← works! connects to PostgreSQL

This is why in server.js we use:
  host: process.env.DB_HOST || 'database'   ← NOT 'localhost'!

'localhost' inside the api container = api container itself
'database'  inside the api container = the database container
```

### Network Types

```
BRIDGE NETWORK (Default)
  All containers get their own IP (e.g., 172.17.0.2, 172.17.0.3)
  They can talk to each other by IP.
  Containers in the same Docker Compose network can talk by service name.
  
  Best for: most applications (this is what Docker Compose sets up by default)

HOST NETWORK
  Container uses the host machine's network directly.
  No isolation — port 3000 in container = port 3000 on your laptop.
  
  Best for: performance-critical apps, debugging
  Caution: less isolation

NONE NETWORK
  Container has NO network at all.
  
  Best for: batch jobs that don't need network access

CUSTOM NETWORK
  You define your own networks and control which containers can talk to each other.
  Useful for security: frontend can talk to backend but NOT directly to database.
```

### Custom Network for Security

```yaml
version: '3.8'

services:
  frontend:
    image: nginx:alpine
    ports:
      - "80:80"
    networks:
      - public-net        # Only on public network

  api:
    build: .
    networks:
      - public-net        # Can talk to frontend
      - private-net       # Can talk to database

  database:
    image: postgres:13
    networks:
      - private-net       # ONLY on private network — frontend can't reach it!

networks:
  public-net:
    driver: bridge
  private-net:
    driver: bridge
    internal: true        # No external internet access at all

# Result:
# Frontend  ←→  API  ←→  Database
# Frontend       ✗        Database  (can't talk directly — SECURE!)
```

---

## Step 8 — Docker Registry: Sharing Images

### What is a Registry?

A **Docker Registry** is a place to store and share Docker images.
Think of it like GitHub, but for Docker images instead of code.

```
YOUR MACHINE                    REGISTRY (Docker Hub)
──────────────────────────────────────────────────────────
                                +──────────────────────────+
todo-api:v1.0 ─── push ──────► │ yourusername/todo-api    │
                                │   :v1.0    (latest)      │
                                │   :v1.1    (previous)    │
                                │   :latest  (alias)       │
                                +──────────────────────────+
                                
Production Server:                           │
  docker pull yourusername/todo-api:v1.0 ◄──┘
  docker run yourusername/todo-api:v1.0
  → EXACT same image, exact same behavior
```

### Pushing Your Image

```bash
# Step 1: Log in to Docker Hub
$ docker login
Username: yourusername
Password: ********
Login Succeeded

# Step 2: Tag your image with your username
$ docker tag todo-api:v1.0 yourusername/todo-api:v1.0

# Step 3: Push to registry
$ docker push yourusername/todo-api:v1.0
v1.0: Pushing layers...
Pushed successfully!

# On ANOTHER machine (colleague's laptop, production server):
$ docker pull yourusername/todo-api:v1.0
$ docker run -d -p 3000:3000 yourusername/todo-api:v1.0
# Same app, running identically!
```

### Types of Registries

```
PUBLIC REGISTRIES (images visible to everyone):
  Docker Hub      → hub.docker.com      (most popular, where official images live)
                    docker pull nginx     ← pulls from Docker Hub automatically
  GitHub Packages → ghcr.io
  Quay.io         → quay.io

PRIVATE REGISTRIES (images only visible to your team):
  Docker Hub private repo  → yourusername/private-app (paid)
  AWS ECR                  → 123456789.dkr.ecr.us-east-1.amazonaws.com/todo-api
  Google GCR               → gcr.io/my-project/todo-api
  Self-hosted Harbor       → registry.yourcompany.com/todo-api

OFFICIAL IMAGES (Docker Hub maintained images):
  postgres, redis, nginx, node, python, mysql, mongo, alpine, ubuntu...
  docker pull postgres:13   ← downloads the official PostgreSQL image
  These are pre-built so you don't need to write Dockerfiles for databases!
```

---

## The Complete Todo App — Everything Together

Here is the full setup for a production-ready Todo App with all concepts combined:

```
todo-app/
├── Dockerfile
├── Dockerfile.dev
├── docker-compose.yml
├── docker-compose.dev.yml
├── package.json
├── server.js
└── .dockerignore
```

### .dockerignore — What NOT to Copy

```
# .dockerignore (like .gitignore but for Docker)
node_modules          # Don't copy — container installs its own
.git                  # Not needed in image
*.log                 # Logs don't belong in image
.env                  # Never copy secrets into image!
.DS_Store             # macOS junk files
Dockerfile*           # No need to include Dockerfile inside image
docker-compose*.yml   # Same
```

### Production Dockerfile

```dockerfile
# ──────────────────────────────────────────────────────────
# MULTI-STAGE BUILD: Separate build step from final image
# Result: smaller final image (no dev tools in production)
# ──────────────────────────────────────────────────────────

# STAGE 1: Install dependencies
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production     # ci = clean install, faster and reproducible

# STAGE 2: Production image (only what's needed to run)
FROM node:18-alpine AS production

# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy only what we need from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Switch to non-root user (security best practice)
USER appuser

EXPOSE 3000

# Health check: Docker will call this to see if container is healthy
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "server.js"]
```

### Production docker-compose.yml

```yaml
version: '3.8'

services:

  api:
    build:
      context: .
      dockerfile: Dockerfile
    image: todo-api:v1.0          # also tag it after build
    ports:
      - "3000:3000"
    environment:
      - DB_HOST=database
      - DB_USER=postgres
      - DB_PASS=${DB_PASSWORD}    # Read from .env file on host — never hardcode!
      - DB_NAME=todos
      - NODE_ENV=production
    depends_on:
      database:
        condition: service_healthy  # Wait until DB is actually ready (not just started)
    networks:
      - app-network
    restart: unless-stopped       # Auto-restart if it crashes
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'

  database:
    image: postgres:13
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=todos
    volumes:
      - todo_db_data:/var/lib/postgresql/data
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:                  # How to tell if Postgres is ready
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

networks:
  app-network:
    driver: bridge

volumes:
  todo_db_data:
```

### Development docker-compose.dev.yml

```yaml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile.dev  # Use simpler Dockerfile for dev
    ports:
      - "3000:3000"
      - "9229:9229"               # Node.js debug port (for attaching debugger)
    environment:
      - DB_HOST=database
      - DB_USER=postgres
      - DB_PASS=secret
      - DB_NAME=todos
      - NODE_ENV=development
    volumes:
      - .:/app                    # Bind mount for live code reload
      - /app/node_modules         # Don't overwrite container's node_modules
    command: npx nodemon --inspect=0.0.0.0 server.js
    depends_on:
      - database

  database:
    image: postgres:13
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=secret
      - POSTGRES_DB=todos
    volumes:
      - todo_db_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"               # Expose so you can use TablePlus, DBeaver, etc.

volumes:
  todo_db_data:
```

---

## All Docker Commands — With Context

### Building and Images

```bash
# Build image from Dockerfile in current directory
$ docker build -t todo-api:v1.0 .

# Build with a different Dockerfile name
$ docker build -f Dockerfile.dev -t todo-api:dev .

# List images on your machine
$ docker images
REPOSITORY   TAG    IMAGE ID      CREATED         SIZE
todo-api     v1.0   4f8a2c91e3d7  5 minutes ago   220MB
postgres     13     d23fd2b6d3b7  2 weeks ago      314MB

# Remove an image
$ docker rmi todo-api:v1.0

# Remove ALL unused images (careful!)
$ docker image prune -a

# Pull image from registry
$ docker pull postgres:13

# Push image to registry
$ docker push yourusername/todo-api:v1.0

# Tag an image (create an alias/new name for existing image)
$ docker tag todo-api:v1.0 yourusername/todo-api:v1.0

# See all layers in an image (what happened during build)
$ docker history todo-api:v1.0

# See full image details (environment, ports, etc.)
$ docker inspect todo-api:v1.0
```

### Running and Managing Containers

```bash
# Basic run (but blocks terminal)
$ docker run todo-api:v1.0

# Run in background (-d = detached)
$ docker run -d todo-api:v1.0

# Run with port mapping
$ docker run -d -p 3000:3000 todo-api:v1.0

# Run with name, port, environment variable
$ docker run -d \
  --name my-todo-api \
  -p 3000:3000 \
  -e DB_HOST=database \
  -e DB_PASS=secret \
  todo-api:v1.0

# Run with volume
$ docker run -d \
  -v todo_db_data:/var/lib/postgresql/data \
  postgres:13

# Run interactively (get a shell inside) — great for debugging
$ docker run -it todo-api:v1.0 sh    # -it = interactive + tty, sh = shell
$ docker run -it node:18-alpine sh   # jump into a fresh Node.js container

# See running containers
$ docker ps

# See ALL containers (including stopped)
$ docker ps -a

# Stop a container (sends SIGTERM, waits 10s, then SIGKILL)
$ docker stop my-todo-api

# Start a stopped container
$ docker start my-todo-api

# Restart
$ docker restart my-todo-api

# Remove a container (must be stopped first)
$ docker rm my-todo-api

# Force remove running container
$ docker rm -f my-todo-api
```

### Inspecting and Debugging

```bash
# See container logs
$ docker logs my-todo-api

# Follow logs in real-time (like tail -f)
$ docker logs -f my-todo-api

# See last 50 lines of logs
$ docker logs --tail 50 my-todo-api

# Run a command inside a running container
$ docker exec -it my-todo-api sh        # open a shell
$ docker exec my-todo-api ls /app        # list files in /app
$ docker exec my-todo-api node --version # check node version inside

# See CPU/memory usage of all containers
$ docker stats

# See CPU/memory of one container
$ docker stats my-todo-api

# See processes running inside container
$ docker top my-todo-api

# Full details of a container
$ docker inspect my-todo-api

# Copy a file FROM container to your machine
$ docker cp my-todo-api:/app/server.js ./server-backup.js

# Copy a file TO container from your machine
$ docker cp ./config.json my-todo-api:/app/config.json
```

### Docker Compose Commands

```bash
# Start all services (reads docker-compose.yml in current dir)
$ docker compose up

# Start in background
$ docker compose up -d

# Start with a specific file
$ docker compose -f docker-compose.dev.yml up -d

# See status
$ docker compose ps

# See logs of all services
$ docker compose logs

# See logs of specific service, follow in real-time
$ docker compose logs -f api

# Stop all services (keeps containers and volumes)
$ docker compose stop

# Stop and REMOVE containers (keeps volumes)
$ docker compose down

# Stop, remove containers AND volumes (deletes DB data!)
$ docker compose down -v

# Rebuild images and restart
$ docker compose up -d --build

# Run a command in a running compose service
$ docker compose exec api sh            # open shell in api container
$ docker compose exec database psql -U postgres -d todos   # open psql

# Scale a service (run 3 instances of api)
$ docker compose up -d --scale api=3
```

### Cleanup

```bash
# Remove all stopped containers
$ docker container prune

# Remove all dangling images (unnamed/untagged)
$ docker image prune

# Remove all unused images (careful!)
$ docker image prune -a

# Remove all unused volumes
$ docker volume prune

# Remove unused networks
$ docker network prune

# Remove EVERYTHING unused (images, containers, volumes, networks)
$ docker system prune

# Remove EVERYTHING including all unused images
$ docker system prune -a

# See how much disk Docker is using
$ docker system df
```

---

## Container Lifecycle — Every State Explained

```
                 docker create
[nothing] ──────────────────────► [Created]
                                       │
                              docker start
                                       │
[nothing] ──── docker run ──────────► [Running] ◄────────────────┐
                                       │                          │
                              docker pause                 docker start
                                       │                          │
                                  [Paused]                        │
                                       │                          │
                            docker unpause                        │
                                       │                          │
                                  [Running]                       │
                                       │                          │
                              docker stop ─────────────► [Stopped]
                              docker kill                         │
                                                         docker rm│
                                                                  ▼
                                                              [Gone]

STATES:
  Created:  Container exists but never started (docker create was run)
  Running:  Container is active, processes are executing
  Paused:   Container is frozen — processes suspended (not deleted)
  Stopped:  Container stopped (processes ended), container still exists
  Gone:     Container removed, nothing left (image still exists)

KEY POINT:
  "Stopped" ≠ "Gone"
  Stopped container still exists on disk and can be restarted.
  Only docker rm removes it completely.
  The IMAGE always stays until you docker rmi it.
```

---

## Environment Variables and Secrets

Never hardcode passwords in Dockerfiles or docker-compose files. Use environment variables.

```bash
# Create a .env file (add to .gitignore and .dockerignore!)
# .env
DB_PASSWORD=my_super_secret_password
NODE_ENV=production
API_KEY=abc123xyz

# docker-compose.yml automatically reads .env
services:
  api:
    environment:
      - DB_PASS=${DB_PASSWORD}       # reads from .env file
      - NODE_ENV=${NODE_ENV}
```

```bash
# Or pass at runtime:
$ docker run -d \
  -e DB_PASSWORD=secret \
  -e NODE_ENV=production \
  todo-api:v1.0

# Or from a file:
$ docker run -d \
  --env-file .env \
  todo-api:v1.0
```

---

## Multi-Stage Builds — Smaller Production Images

A common pattern: build your app in one stage, but only ship the final result.

```
PROBLEM: Development tools (compilers, test frameworks) shouldn't be in production image.
SOLUTION: Multi-stage build — use a big image to build, then copy only the output.

WITHOUT multi-stage:
  Build tools + Source code + Final app = 900MB image

WITH multi-stage:
  Stage 1 (builder):  compile/bundle the app (using big image)
  Stage 2 (final):    copy ONLY the compiled output into tiny image = 80MB image
```

**Example — React app served with Nginx:**

```dockerfile
# STAGE 1: Build the React app
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build          # creates /app/build/ with static HTML/CSS/JS

# STAGE 2: Serve the built files with Nginx (tiny web server)
FROM nginx:alpine AS production

# Copy ONLY the built files from stage 1 — not the node_modules (1GB+!)
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# Final image size: ~25MB (vs ~900MB without multi-stage!)
```

---

## Health Checks — Is My Container Actually Working?

A container can be "running" but the app inside might have crashed or not be ready yet.
Health checks tell Docker how to verify the container is truly healthy.

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# --interval=30s    : check every 30 seconds
# --timeout=5s      : if check takes > 5s, consider it failed
# --start-period=15s: give the app 15s to start before checking
# --retries=3       : fail 3 times in a row = unhealthy

# Container statuses you'll now see:
# starting  → within start-period
# healthy   → last check passed
# unhealthy → failed retries times
```

```yaml
# In docker-compose.yml:
services:
  database:
    image: postgres:13
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    
  api:
    depends_on:
      database:
        condition: service_healthy   # Wait until DB is HEALTHY (not just started)
```

---

## Common Mistakes and How to Fix Them

```
MISTAKE 1: "It works on my machine but not in Docker"
─────────────────────────────────────────────────────
Usually means: you're relying on something installed globally on your machine
               that isn't in the Dockerfile.

Fix: Add it to the Dockerfile. Run the container and check what's missing.
  $ docker run -it todo-api:v1.0 sh     # get inside and investigate
  $ which node                           # is node there?
  $ ls /app                              # are your files there?

──────────────────────────────────────────────────────────────────────────

MISTAKE 2: DB connection refused — "getaddrinfo ENOTFOUND localhost"
─────────────────────────────────────────────────────────────────────
Your code says: DB_HOST=localhost
Problem: 'localhost' inside the api container = the api container itself.
         PostgreSQL isn't running INSIDE the api container.

Fix: Use the service name from docker-compose.yml as the host.
  DB_HOST=database   (where "database" is the service name)

──────────────────────────────────────────────────────────────────────────

MISTAKE 3: Port already in use
───────────────────────────────
"Error: bind: address already in use"

Fix: Something else is using that port.
  $ lsof -i :3000           # see what's using port 3000
  $ docker ps               # maybe another container is using it
  Use a different host port:  -p 3001:3000

──────────────────────────────────────────────────────────────────────────

MISTAKE 4: Changes to code not reflecting in container
───────────────────────────────────────────────────────
You edited server.js but the container still runs the old code.

Fix A (quick): Use bind mounts in development (docker-compose.dev.yml above)
Fix B (rebuild): docker compose up -d --build  (rebuilds the image)

──────────────────────────────────────────────────────────────────────────

MISTAKE 5: "Cannot connect to Docker daemon"
────────────────────────────────────────────
Docker Desktop isn't running.

Fix: Open Docker Desktop app (or start docker service on Linux).
  $ sudo systemctl start docker   # Linux
  On Mac/Windows: open Docker Desktop from Applications

──────────────────────────────────────────────────────────────────────────

MISTAKE 6: Image built but container exits immediately
────────────────────────────────────────────────────────
$ docker run todo-api:v1.0
$ docker ps       ← container not there!
$ docker ps -a    ← it's there but Exited (1)

Fix: Check the logs!
  $ docker logs <container-id>
  Usually: app crashed on startup, missing env var, wrong CMD, etc.
```

---

## Best Practices — Quick Summary

```
DOCKERFILE:
  ✓ Use specific version tags: FROM node:18.17-alpine3.18  (not node:latest)
  ✓ Copy package.json BEFORE copying code (for layer caching)
  ✓ Use .dockerignore (exclude node_modules, .git, .env)
  ✓ Use non-root user: RUN adduser app && USER app
  ✓ Use multi-stage builds for smaller production images
  ✓ Add HEALTHCHECK for production containers
  ✗ Don't install unnecessary packages
  ✗ Don't hardcode passwords or secrets in Dockerfiles

DOCKER COMPOSE:
  ✓ Use depends_on with healthcheck condition for databases
  ✓ Use named volumes for database data
  ✓ Use bind mounts only in development
  ✓ Read secrets from .env file (never commit .env)
  ✓ Set restart: unless-stopped for production services
  ✓ Set memory/CPU limits for production

SECURITY:
  ✓ Run as non-root user
  ✓ Use minimal base images (alpine, distroless)
  ✓ Never copy .env into image
  ✓ Regularly scan images: docker scout cves todo-api:v1.0
  ✓ Use read-only filesystem where possible: --read-only flag
```

---

## Quick Reference — Everything at a Glance

```
TERM            WHAT IT IS                         ANALOGY
──────────────────────────────────────────────────────────────────────
Dockerfile      Instructions to build an image      Recipe card
Image           Built snapshot of app + env         Packaged meal (sealed)
Container       Running instance of an image        Meal being served
Registry        Storage for images                  Restaurant warehouse
Docker Engine   Runtime that manages containers     Kitchen + staff
Docker Compose  Tool to run multi-container apps    Meal plan for a party
Volume          Persistent storage outside container  External hard drive
Bind Mount      Mount a host folder into container  Shared folder
Network         How containers talk to each other   Internal office phone system
.dockerignore   Files NOT to copy into image        .gitignore for Docker


COMMAND CHEAT SHEET:
  docker build -t name:tag .     ← build image from Dockerfile
  docker run -d -p h:c name:tag  ← start container (-d=bg, -p=port map)
  docker ps                      ← see running containers
  docker ps -a                   ← see all containers (including stopped)
  docker logs -f <name>          ← follow container logs
  docker exec -it <name> sh      ← get shell inside container
  docker stop <name>             ← stop container gracefully
  docker rm <name>               ← remove stopped container
  docker images                  ← list local images
  docker rmi <image>             ← remove image
  docker system prune            ← clean up unused stuff

  docker compose up -d           ← start all services
  docker compose down            ← stop + remove containers
  docker compose logs -f api     ← follow logs for 'api' service
  docker compose exec api sh     ← shell into running 'api' container
  docker compose up -d --build   ← rebuild + restart


PORT MAPPING: -p hostPort:containerPort
  -p 3000:3000  → localhost:3000 maps to container's port 3000
  -p 8080:3000  → localhost:8080 maps to container's port 3000

VOLUME TYPES:
  Named:  -v todo_data:/app/data   → Docker manages location
  Bind:   -v ./local:/app/data     → Your folder maps into container
  tmpfs:  --tmpfs /tmp             → RAM only, deleted when container stops
```

---

*Compile and run the todo app: `docker compose up -d` then visit `http://localhost:3000/todos`*
*For development with live reload: `docker compose -f docker-compose.dev.yml up`*
