# Docker Guide for These Labs

Every lab in this repo runs on Docker Compose. This page explains the concepts **once**, so the comments
inside each `docker-compose.yml` can stay focused on what *that* lab is doing.

**You do not need to know Docker to use these labs.** Read this once, then follow the run order at the top
of each compose file.

---

## 1 · The 30-second mental model

**Docker Compose starts several containers that can talk to each other on a private network.**

```
┌─────────────── the compose network (private) ────────────────┐
│                                                              │
│   ┌─────────┐        ┌──────────────┐      ┌────────────┐   │
│   │   app   │───────▶│  dependency  │      │  postgres  │   │
│   └─────────┘        └──────────────┘      └────────────┘   │
│        │                                                     │
└────────┼─────────────────────────────────────────────────────┘
         │  ports:  "3007:3000"
         ▼
   your laptop (localhost:3007)
```

**Two rules that explain most confusion:**

1. ⭐ **Inside the network, containers reach each other by SERVICE NAME** — `http://app:3000`,
   `postgres:5432`. The service name *is* the hostname.
2. ⭐ **From your laptop, you can only reach what's published in `ports:`** — and you use the **left-hand**
   number.

```yaml
ports:
  - "5437:5432"
#    ^^^^ ^^^^
#    │    └── the port INSIDE the container (always the standard one: 5432 for Postgres)
#    └─────── the port on YOUR LAPTOP -- what you type in psql/curl
```

So `psql -p 5437` from your laptop, but `PGHOST=postgres PGPORT=5432` from another container.

---

## 2 · The keys you'll see, explained

```yaml
services:                       # each entry is one container
  app:                          # ⭐ this name is also the HOSTNAME on the network
    image: node:24-alpine       # a prebuilt image from Docker Hub
    build: .                    # ...OR build from a Dockerfile in this directory
    container_name: p7-app      # a fixed name, so `docker logs p7-app` works
    working_dir: /srv           # the directory commands run in, inside the container
    command: node server.js     # what to run (overrides the image's default)

    environment:                # env vars the process sees -- how we configure the labs
      MODE: none

    volumes:
      - ./app:/srv:ro           # ⭐ host path : container path : read-only
                                #    edits on your laptop appear inside instantly

    ports:
      - "3007:3000"             # laptop port : container port

    depends_on:                 # start ordering
      dependency:
        condition: service_healthy   # ⭐ WAIT until it's actually ready, not just started

    healthcheck:                # how Docker decides "healthy"
      test: ["CMD", "..."]
      interval: 5s              # how often to check
      retries: 10               # how many failures before "unhealthy"
      start_period: 20s         # grace period at boot (slow starters like Kafka/Cassandra)

    profiles: ["tools"]         # ⚠️ see the big gotcha below
```

---

## 3 · ⚠️ The three gotchas that cost me time building these

### ⭐ Gotcha 1 — `profiles: ["tools"]` services are SKIPPED by `up`

Services marked with a profile **do not start with `docker compose up`**, and are **not rebuilt by
`up --build`**. That's intentional — they're one-shot tools (a load generator, a benchmark script), not
long-running servers.

```bash
docker compose up -d --build      # ⚠️ does NOT build or start `lab`/`k6`
docker compose build lab          # ✅ build it explicitly
docker compose run --rm lab node script.js   # ✅ run it once, then delete the container
```

**If you get `Cannot find module 'xyz'` after adding a dependency — this is why.** Run
`docker compose build <service>`.

### ⭐ Gotcha 2 — mounting a directory over the app hides `node_modules`

```yaml
volumes:
  - ./part-b-migration:/srv:ro     # ❌ replaces ALL of /srv, including /srv/node_modules
  - ./part-b-migration/run.js:/srv/run.js:ro   # ✅ mount only the file
```

The image installed `node_modules` at `/srv/node_modules`; mounting a host directory over `/srv` hides it.

### ⭐ Gotcha 3 — editing a bind-mounted config file can break the container's view

Tools that **replace** a file (`sed -i`, many editors) create a new file and rename it, which changes the
inode. A container bind-mounting that *single file* may keep pointing at the old one.

```bash
# after editing a mounted config file:
docker compose up -d --force-recreate nginx    # ✅ re-establishes the mount
```

---

## 4 · The commands you'll actually use

```bash
# ---- lifecycle ----------------------------------------------------------
docker compose up -d                 # start everything (detached / in the background)
docker compose up -d --build         # rebuild images first
docker compose ps                    # what's running, and is it healthy?
docker compose logs -f app           # follow one service's logs
docker compose down                  # stop and remove containers
docker compose down -v               # ⭐ ...and DELETE THE DATA VOLUMES (a clean slate)

# ---- one-off tasks ------------------------------------------------------
docker compose run --rm lab node seed.js     # run a script in a new container, then remove it
docker compose build lab                     # build a profile'd service explicitly

# ---- poking at a running container --------------------------------------
docker exec p3-postgres psql -U lab -d lab -c "SELECT 1"
docker exec -it p5-redis redis-cli
docker logs p6-kafka | tail -50

# ---- failure injection (several labs use these) -------------------------
docker stop p3c-replica       # graceful stop  -- severs connections
docker kill p3c-primary       # SIGKILL        -- abrupt crash
docker pause p4-etcd1         # ⭐ FREEZE the process (like a GC pause) -- the interesting failure
docker unpause p4-etcd1
```

> ⭐ **`docker pause` vs `docker stop` is a real lesson, not trivia.** `pause` freezes the *processes*, but
> the kernel keeps accepting data into TCP socket buffers — so a paused replica still *receives* data and
> drains it on unpause. The Phase 3C lab needed `stop` (which actually severs the connection) to demonstrate
> replication data loss at all. **A failure injection that shows no problem often means the injection didn't
> work.**

---

## 5 · Port map — every lab, so nothing collides

Ports are deliberately unique per phase so you can run labs side by side, and so they avoid anything already
on your machine.

| Phase | Service | Host port | Reach it with |
|---|---|---|---|
| 0 | app | 3000 | `curl localhost:3000/api/simple` |
| 0 | dependency | 4000 | `curl localhost:4000/admin/config` |
| 1 | REST/SSE | 3000 | `curl localhost:3000/rest/products/1` |
| 1 | gRPC | 50051 | grpcurl |
| 1 | Postgres | **5433** | `psql postgresql://lab:lab@localhost:5433/lab` |
| 2 | nginx | 8080 | `curl localhost:8080/api/work` |
| 2 | app1/2/3 | 8081/8082/8083 | direct, for failure injection |
| 3A/3B | Postgres | **5434** | `psql postgresql://lab:lab@localhost:5434/lab` |
| 3C | primary / replica | **5435 / 5436** | |
| 3F | Cassandra | 9042 | `docker exec p3f-cass1 cqlsh` |
| 4 | etcd 1/2/3 | 2379/2380/2381 | `docker exec p4-etcd1 etcdctl ...` |
| 4 | resource | 7000 | `curl localhost:7000/state` |
| 5 | app | **3005** | `curl localhost:3005/stats` |
| 5 | Postgres / Redis | **5437 / 6380** | |
| 6 | Kafka | **29092** | |
| 6 | Postgres | **5438** | |
| 7 | app / dependency | **3007 / 4001** | |
| 7 | Postgres | **5439** | |
| 8 | Postgres | **5440** | `psql postgresql://lab:lab@localhost:5440/lab` — then `SELECT * FROM pg_policies;` |
| 9 | Postgres | **5441** | `psql postgresql://lab:lab@localhost:5441/lab` — then `\di+` for the index sizes |

> ⚠️ **Port 5432 is deliberately never used** — you already have a `pgvector-db` container on it. Every lab
> Postgres uses 5433–5441 instead.
>
> ⭐ **Phase 9's parts A–C need no Docker at all** — they're dependency-free algorithms. `node <file>`.

---

## 6 · If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| `port is already allocated` | Something else is on that port | `lsof -nP -iTCP:5432 \| grep LISTEN`, then change the left-hand port |
| `Cannot find module 'x'` | A profile'd service wasn't rebuilt | `docker compose build <service>` |
| `Cannot connect to the Docker daemon` | Docker Desktop isn't running | `open -a Docker`, wait ~30 s |
| A container is `(health: starting)` forever | Slow starter, or a broken healthcheck | `docker compose logs <service>` |
| Stale data from a previous run | Volumes persisted | `docker compose down -v` |
| A container exits immediately | Config error | `docker logs <container>` — read the **last** 20 lines |
| Everything is slow / OOM | Docker memory limit | Docker Desktop → Settings → Resources (labs assume ≥ 6 GB) |

**Always start with the logs.** `docker compose logs <service> | tail -30` answers most questions.

---

## 7 · Cleaning up

```bash
docker compose down -v              # this lab: containers + volumes
docker ps -a                        # anything still running?
docker system df                    # how much disk are images using?
docker system prune -a --volumes    # ⚠️ removes ALL unused images/volumes on your machine
```

⚠️ **`docker system prune -a` is machine-wide** — it will remove images for other projects too. Prefer
`docker compose down -v` inside a lab directory.
