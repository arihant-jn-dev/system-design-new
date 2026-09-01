#!/bin/bash
# Runs once, during the primary's first startup (docker-entrypoint-initdb.d).
#
# Two things are needed before a remote replica can attach:
#   1. a role WITH REPLICATION
#   2. a pg_hba.conf line permitting `replication` connections from the network
#
# initdb's default pg_hba only allows replication from localhost, which is why
# this step is easy to miss.
set -e

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replicator';
EOSQL

# Note: initdb's default pg_hba allows `replication` only from localhost, and
# the `all` in a database column does NOT cover replication connections -- they
# need their own line. Normal connections are handled by
# POSTGRES_HOST_AUTH_METHOD=trust in docker-compose.
cat >> "$PGDATA/pg_hba.conf" <<-EOF

# --- added by the Phase 3C lab: allow replication from the compose network ---
host    replication     all             all                     trust
EOF

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT pg_reload_conf();"

echo "[init-primary] replication role created and pg_hba configured"
