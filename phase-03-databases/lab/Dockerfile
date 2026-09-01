# =============================================================================
#  Shared image for the Phase 3 labs (3A indexing, 3B write skew, 3C replication)
# =============================================================================
#
#  ONE image, used by the `lab` service in ALL THREE compose files. It just
#  needs the `pg` driver so the scripts can talk to Postgres.
#
#  Build it:
#      docker compose build lab                                    # for 3A/3B
#      docker compose -f docker-compose.replication.yml build lab  # for 3C
#
#  ⚠️ `docker compose up --build` will NOT build this -- the `lab` service is
#     behind the "tools" profile. If you add a dependency to package.json and
#     get "Cannot find module", that's why. See DOCKER-GUIDE.md Gotcha 1.
#
#  Run a script with it:
#      docker compose run --rm lab node lab-a-indexing/bench.js
#                          ^^^^ delete the container afterwards
# =============================================================================

FROM node:24-alpine

WORKDIR /srv

# Dependencies BEFORE source, so editing a script doesn't re-run npm install.
# (Docker caches each layer; changing an input invalidates that layer and every
#  layer after it. package.json rarely changes; scripts change constantly.)
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# ⭐ No meaningful default: this image has no single "main" script -- you choose
#    one per run, and `docker compose run` overrides CMD anyway. Printing the
#    Node version makes an accidental bare run harmless and obvious.
CMD ["node", "--version"]
