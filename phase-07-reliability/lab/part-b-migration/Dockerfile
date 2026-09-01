# =============================================================================
#  Image for the Phase 7 Part B migration script
# =============================================================================
#
#  Just the `pg` driver, so run.js can perform the 8-step expand -> migrate ->
#  contract while a writer hammers the table.
#
#  Build and run:
#      docker compose build migration
#      docker compose run --rm migration node run.js
#
#  ⚠️ TWO GOTCHAS this lab actually hit:
#
#  1. `docker compose up --build` will NOT build this -- the `migration`
#     service is behind the "tools" profile. Build it explicitly.
#
#  2. ⭐ The compose file mounts only ./part-b-migration/run.js, NOT the whole
#     directory. Mounting the directory over /srv would HIDE the node_modules
#     installed below, producing "Cannot find module 'pg'".
#     See DOCKER-GUIDE.md Gotcha 2.
# =============================================================================

FROM node:24-alpine

WORKDIR /srv

# Dependencies first so editing run.js doesn't re-run npm install.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# `docker compose run --rm migration node run.js` overrides this anyway.
CMD ["node", "--version"]
