# =============================================================================
#  Image for the Phase 1 Part A lab (REST + SSE + gRPC server, and its client)
# =============================================================================
#
#  A Dockerfile is a RECIPE for building an image. Each line creates a LAYER,
#  and Docker caches layers -- so the ORDER of these lines matters a lot for
#  rebuild speed.
#
#  Why this lab needs a Dockerfile at all (Phase 0's didn't):
#      gRPC needs real npm packages (@grpc/grpc-js, @grpc/proto-loader).
#      Phase 0's code had zero dependencies, so it could just be mounted into
#      the stock node image.
#
#  Build it:   docker compose build api-styles
#              (or `docker compose up -d --build`, which builds non-profiled
#               services -- see DOCKER-GUIDE.md Gotcha 1)
# =============================================================================

# The base image. `alpine` is a minimal Linux (~50MB vs ~350MB for the default).
FROM node:24-alpine

# Every following command runs here, and this is where the app lives.
WORKDIR /srv

# ⭐ THE IMPORTANT BIT: copy package.json FIRST, install, and only THEN copy
#    the source.
#
#    Docker caches each layer and reuses it if its inputs haven't changed.
#    Because `npm install` is slow and your source changes constantly:
#
#      package.json unchanged  ->  the npm install layer is REUSED (instant)
#      server.js changed       ->  only the final COPY re-runs
#
#    If you did `COPY . .` before `npm install`, every source edit would
#    invalidate the install layer and re-download every package.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
#              │            │          └── skip the funding message
#              │            └── skip the vulnerability scan (noise in a lab)
#              └── skip devDependencies -- we don't run tests in the image

# Now the source: server.js, client.js, product.proto
COPY . .

# Documentation only -- EXPOSE does NOT publish anything to your laptop.
# Publishing is done by `ports:` in docker-compose.yml.
EXPOSE 3000 50051

# The default process if none is given. docker-compose.yml overrides this for
# the `bench` service (`command: node client.js`), which is why one image can
# serve as both the server and the benchmark client.
CMD ["node", "server.js"]
