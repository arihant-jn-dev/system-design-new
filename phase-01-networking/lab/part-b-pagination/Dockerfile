# =============================================================================
#  Image for the Phase 1 Part B lab (pagination scripts)
# =============================================================================
#
#  Unlike Part A's image, this one has NO long-running process. It exists so
#  you can run one-off scripts that need the `pg` driver:
#
#      docker compose run --rm pagination node seed.js
#      docker compose run --rm pagination node bench.js
#      docker compose run --rm pagination node correctness.js
#                          ^^^^ remove the container when the script exits
#
#  Build it:   docker compose build pagination
#              (⚠️ `up --build` will NOT build this -- it's behind the "tools"
#               profile. See DOCKER-GUIDE.md Gotcha 1.)
# =============================================================================

FROM node:24-alpine

WORKDIR /srv

# Same layer-caching trick as Part A: dependencies first, source second, so
# editing a script doesn't trigger a reinstall. See that Dockerfile for the
# full explanation.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# There's no single "main" script here -- you pick one per run -- so the
# default just runs the benchmark. `docker compose run` overrides it anyway.
CMD ["node", "bench.js"]
