#!/bin/sh
# Bring up a streaming replica of `primary`.
#
# This is the real procedure from note 3c-01, step by step:
#   1. take a consistent SNAPSHOT of the leader        (pg_basebackup)
#   2. record the LOG POSITION it corresponds to       (pg_basebackup does this)
#   3. restore it here
#   4. connect and stream everything SINCE that position
#
# -R  writes standby.signal + primary_conninfo, so this instance starts as a
#     standby instead of a fresh primary.
# -S  uses a named REPLICATION SLOT so the primary retains WAL for us.
#     (Which is also how a dead replica can fill the primary's disk -- see 3a-07.)
set -e

DATA="${PGDATA:-/var/lib/postgresql/data}"

if [ ! -s "$DATA/PG_VERSION" ]; then
  echo "[replica] waiting for primary..."
  until pg_isready -h primary -U lab -q; do sleep 1; done
  # pg_isready can succeed before the init scripts have finished creating the
  # replication role, so wait for the role itself.
  until psql -h primary -U lab -d lab -tAc \
        "SELECT 1 FROM pg_roles WHERE rolname='replicator'" 2>/dev/null | grep -q 1; do
    sleep 1
  done

  echo "[replica] cloning primary with pg_basebackup..."
  rm -rf "${DATA:?}"/*
  PGPASSWORD=replicator pg_basebackup \
      -h primary -U replicator -D "$DATA" \
      -Fp -Xs -P -R \
      -S replica_slot -C
  chmod 0700 "$DATA"
  echo "[replica] clone complete; starting as standby"
fi

# hot_standby lets us read from the standby; the feedback setting is the
# trade described in note 3c-02 (replica query survival vs primary bloat).
exec postgres \
  -c hot_standby=on \
  -c hot_standby_feedback=off \
  -c max_standby_streaming_delay=30s
