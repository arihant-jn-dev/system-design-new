# =============================================================================
#  Image for the Phase 6 lab scripts (Kafka + Postgres experiments)
# =============================================================================
#
#  Installs two drivers:
#      kafkajs  -- Kafka client (producer, consumer, admin)
#      pg       -- Postgres client (the dedupe table and the outbox)
#
#  There is no long-running server here. You invoke one script per run:
#      docker compose run --rm lab node part-a-partitions/run.js
#      docker compose run --rm lab node part-b-duplicates/run.js
#      docker compose run --rm lab node part-c-outbox/run.js
#
#  Build it:
#      docker compose build lab
#
#  ⚠️ `docker compose up --build` will NOT build this -- the `lab` service is
#     behind the "tools" profile. Skipping it gives "Cannot find module
#     'kafkajs'". See DOCKER-GUIDE.md Gotcha 1.
# =============================================================================

FROM node:24-alpine

WORKDIR /srv

# Dependencies before source, so editing a script doesn't re-run npm install.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# No meaningful default -- you choose a script per run, and `docker compose run`
# overrides CMD anyway. Printing the version makes a bare run harmless.
CMD ["node", "--version"]
