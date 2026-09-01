# =============================================================================
#  Shared image for the Phase 5 lab
# =============================================================================
#
#  ONE image used by THREE compose services:
#      app   -> runs the cached API server      (CMD below)
#      lab   -> runs one-shot scripts           (command overridden per run)
#      (both need the same two drivers: pg + ioredis)
#
#  Build it:
#      docker compose up -d --build     # builds `app`
#      docker compose build lab         # ⚠️ MUST be explicit -- `lab` is behind
#                                       #    the "tools" profile and `up --build`
#                                       #    skips it (DOCKER-GUIDE.md Gotcha 1).
#                                       #    Forgetting this produces
#                                       #    "Cannot find module 'ioredis'".
# =============================================================================

FROM node:24-alpine

WORKDIR /srv

# Dependencies first, source second -- so editing server.js doesn't re-run
# npm install. Docker caches layers, and a changed input invalidates that layer
# and everything after it.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# Default process. The `lab` service overrides this with
# `docker compose run --rm lab node <script>`.
CMD ["node", "app/server.js"]
