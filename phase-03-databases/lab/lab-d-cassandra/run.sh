#!/bin/sh
# Lab D — 3-node Cassandra: query-first modelling + tunable consistency.
#
#   ./lab-d-cassandra/run.sh          (run from the lab/ directory, on the HOST)
#
# Everything goes through `docker exec ... cqlsh`, so there is no driver to
# install. The point of the lab is the CLUSTER's behaviour, not the client's.

set -e

CQL="docker exec p3f-cass1 cqlsh"
hr() { printf '\n%s\n  %s\n%s\n' "==========================================================================" "$1" "=========================================================================="; }
sub() { printf '\n  -- %s %s\n' "$1" "--------------------------------------------------" ; }

# cqlsh with an explicit consistency level, reporting success/failure clearly.
try_cql() {
  _cl="$1"; _stmt="$2"; _label="$3"
  if docker exec p3f-cass1 cqlsh -e "CONSISTENCY $_cl; $_stmt" >/tmp/cql.out 2>&1; then
    printf '    %-34s CL=%-8s  ✅ SUCCESS\n' "$_label" "$_cl"
    return 0
  else
    printf '    %-34s CL=%-8s  ❌ FAILED: %s\n' "$_label" "$_cl" \
      "$(grep -oE 'Cannot achieve consistency level [A-Z_]+|NoHostAvailable|Unavailable|[0-9]+ replica[s]? (are )?required but only [0-9]+' /tmp/cql.out | head -1)"
    return 1
  fi
}

hr "D0 — the cluster"
$CQL -e "SELECT peer, data_center, rack FROM system.peers;" 2>/dev/null | head -8
echo ""
docker exec p3f-cass1 nodetool status | tail -6

# ---------------------------------------------------------------- D1
hr "D1 — QUERY-FIRST MODELLING"
cat <<'EOF'

  Relational: model the DATA, then query it however you like.
  Cassandra:  model the QUERIES, and the data layout follows.

  Our queries:
     Q1  "messages in a conversation, newest first"
     Q2  "messages sent by a user, newest first"

  Two queries -> TWO TABLES. The same data, stored twice, on purpose.
  There is no join and no efficient way to query by a non-key column.
EOF

$CQL -e "DROP KEYSPACE IF EXISTS chat;" 2>/dev/null || true
# RF=3 -> one replica on each of the three nodes.
$CQL -e "CREATE KEYSPACE chat WITH replication = {'class':'NetworkTopologyStrategy','dc1':3};" 2>/dev/null

$CQL -e "CREATE TABLE chat.messages_by_conversation (
  conversation_id text,
  sent_at         timestamp,
  message_id      uuid,
  sender_id       text,
  body            text,
  PRIMARY KEY ((conversation_id), sent_at, message_id)
) WITH CLUSTERING ORDER BY (sent_at DESC, message_id DESC);

CREATE TABLE chat.messages_by_sender (
  sender_id       text,
  sent_at         timestamp,
  message_id      uuid,
  conversation_id text,
  body            text,
  PRIMARY KEY ((sender_id), sent_at, message_id)
) WITH CLUSTERING ORDER BY (sent_at DESC, message_id DESC);" 2>/dev/null

echo "
  Created. Note the key shape:   PRIMARY KEY ((partition), clustering...)
    partition key  -> hash -> WHICH NODE holds it
    clustering key -> SORT ORDER within that partition
"

sub "the application writes BOTH tables (there is no join to save you)"
$CQL -e "INSERT INTO chat.messages_by_conversation (conversation_id, sent_at, message_id, sender_id, body)
  VALUES ('conv-1', '2024-01-01 10:00:00', 11111111-1111-1111-1111-111111111111, 'ari', 'hello');
INSERT INTO chat.messages_by_sender (sender_id, sent_at, message_id, conversation_id, body)
  VALUES ('ari', '2024-01-01 10:00:00', 11111111-1111-1111-1111-111111111111, 'conv-1', 'hello');
INSERT INTO chat.messages_by_conversation (conversation_id, sent_at, message_id, sender_id, body)
  VALUES ('conv-1', '2024-01-01 10:05:00', 22222222-2222-2222-2222-222222222222, 'sam', 'hi there');
INSERT INTO chat.messages_by_sender (sender_id, sent_at, message_id, conversation_id, body)
  VALUES ('sam', '2024-01-01 10:05:00', 22222222-2222-2222-2222-222222222222, 'conv-1', 'hi there');" 2>/dev/null
echo "    ✅ 2 messages written to 2 tables = 4 writes"

sub "Q1: by conversation"
$CQL -e "SELECT sent_at, sender_id, body FROM chat.messages_by_conversation WHERE conversation_id='conv-1';" 2>/dev/null | head -8

sub "Q2: by sender"
$CQL -e "SELECT sent_at, conversation_id, body FROM chat.messages_by_sender WHERE sender_id='ari';" 2>/dev/null | head -8

sub "and the query Cassandra REFUSES"
echo "    SELECT * FROM messages_by_conversation WHERE sender_id='ari';"
docker exec p3f-cass1 cqlsh -e "SELECT * FROM chat.messages_by_conversation WHERE sender_id='ari';" 2>&1 \
  | grep -oE "InvalidRequest.*" | head -2 | sed 's/^/    /'
cat <<'EOF'

    ⭐ THAT ERROR IS THE WHOLE POINT. Cassandra will not silently run a query
       that requires scanning every node. It tells you to add ALLOW FILTERING,
       which you should read as "this query does not fit your data model".
EOF

# ---------------------------------------------------------------- D2
hr "D2 — TUNABLE CONSISTENCY, all 3 nodes UP"
echo "
  RF=3. Consistency is set PER QUERY, not per database.
"
try_cql ONE      "INSERT INTO chat.messages_by_conversation (conversation_id, sent_at, message_id, sender_id, body) VALUES ('conv-2','2024-01-01 11:00:00',33333333-3333-3333-3333-333333333333,'ari','cl test');" "write" || true
try_cql QUORUM   "INSERT INTO chat.messages_by_conversation (conversation_id, sent_at, message_id, sender_id, body) VALUES ('conv-2','2024-01-01 11:01:00',44444444-4444-4444-4444-444444444444,'ari','cl test');" "write" || true
try_cql ALL      "INSERT INTO chat.messages_by_conversation (conversation_id, sent_at, message_id, sender_id, body) VALUES ('conv-2','2024-01-01 11:02:00',55555555-5555-5555-5555-555555555555,'ari','cl test');" "write" || true
echo ""
try_cql ONE      "SELECT count(*) FROM chat.messages_by_conversation WHERE conversation_id='conv-2';" "read" || true
try_cql QUORUM   "SELECT count(*) FROM chat.messages_by_conversation WHERE conversation_id='conv-2';" "read" || true
try_cql ALL      "SELECT count(*) FROM chat.messages_by_conversation WHERE conversation_id='conv-2';" "read" || true

# ---------------------------------------------------------------- D3
hr "D3 — KILL A NODE, then repeat"
echo "
  Stopping cass3. RF=3, so every partition now has one replica missing.
"
docker stop p3f-cass3 >/dev/null
sleep 25
docker exec p3f-cass1 nodetool status | tail -5
echo "
  (DN = Down/Normal. Cassandra keeps serving -- there is no leader to lose
   and no failover to perform. That is the leaderless model's whole pitch.)
"

sub "writes with one node down"
try_cql ONE    "INSERT INTO chat.messages_by_conversation (conversation_id, sent_at, message_id, sender_id, body) VALUES ('conv-3','2024-01-01 12:00:00',66666666-6666-6666-6666-666666666666,'ari','node down');" "write" || true
try_cql QUORUM "INSERT INTO chat.messages_by_conversation (conversation_id, sent_at, message_id, sender_id, body) VALUES ('conv-3','2024-01-01 12:01:00',77777777-7777-7777-7777-777777777777,'ari','node down');" "write" || true
try_cql ALL    "INSERT INTO chat.messages_by_conversation (conversation_id, sent_at, message_id, sender_id, body) VALUES ('conv-3','2024-01-01 12:02:00',88888888-8888-8888-8888-888888888888,'ari','node down');" "write" || true

sub "reads with one node down"
try_cql ONE    "SELECT count(*) FROM chat.messages_by_conversation WHERE conversation_id='conv-3';" "read" || true
try_cql QUORUM "SELECT count(*) FROM chat.messages_by_conversation WHERE conversation_id='conv-3';" "read" || true
try_cql ALL    "SELECT count(*) FROM chat.messages_by_conversation WHERE conversation_id='conv-3';" "read" || true

cat <<'EOF'

  ⭐ THE RESULT:
     ONE and QUORUM keep working.  ALL fails.

     RF=3, QUORUM = floor(3/2)+1 = 2 -> tolerates exactly ONE node down.
     ALL = 3 -> tolerates ZERO. This is why ALL is almost never used:
     it makes every node a single point of failure.

     R + W > N is what buys you the guarantee:
        write QUORUM(2) + read QUORUM(2) = 4 > 3   -> read sees the latest ✅
        write ONE(1)    + read ONE(1)    = 2 <= 3  -> may read stale ⚠️
EOF

# ---------------------------------------------------------------- D4
hr "D4 — HINTED HANDOFF: the node comes back"
echo "
  While cass3 was down, its coordinator peers stored HINTS for it.
  Restarting it -- the hints should be replayed automatically.
"
docker start p3f-cass3 >/dev/null
echo "  waiting for cass3 to rejoin..."
for i in $(seq 1 40); do
  if docker exec p3f-cass3 nodetool netstats 2>/dev/null | grep -q 'Mode: NORMAL'; then break; fi
  sleep 5
done
sleep 20
docker exec p3f-cass1 nodetool status | tail -5

sub "read at ALL again -- only possible if cass3 has the data"
try_cql ALL "SELECT count(*) FROM chat.messages_by_conversation WHERE conversation_id='conv-3';" "read" || true

cat <<'EOF'

  If that succeeded, hinted handoff worked: writes accepted while cass3 was
  down were replayed to it on recovery. That is the availability mechanism
  from note 3c-06 -- and note it is a DURABILITY aid, not a consistency
  guarantee: with a SLOPPY quorum the hint may live on a node outside the
  key's replica set entirely.
EOF

hr "SUMMARY"
cat <<'EOF'

  1. QUERY-FIRST: two queries -> two tables -> data stored twice, written
     twice, and kept in sync BY YOUR APPLICATION. No joins means writes are
     the expensive, thoughtful part.

  2. Cassandra REFUSES queries that don't fit the key. That is a feature.

  3. Consistency is a PER-QUERY dial, not a database property.

  4. RF=3 + QUORUM survives one node down. ALL survives none.

  5. R + W > N is the formula, and you just watched it hold.

  -> record these in ../RESULTS.md
EOF
