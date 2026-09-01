#!/bin/sh
# Experiment B — why a distributed lock WITHOUT fencing is unsafe.
#
#   ./fencing.sh
#
# This is gate Q3, demonstrated rather than described. We run the SAME failure
# sequence twice: once with the resource ignoring tokens, once enforcing them.

set -e

R="http://localhost:7000"
hr() { printf '\n%s\n  %s\n%s\n' "======================================================================" "$1" "======================================================================"; }
sub() { printf '\n  -- %s ------------------------------------------\n' "$1"; }

etcd() { docker exec p4-etcd1 etcdctl "$@"; }
post() { curl -s -XPOST "$R$1" -H 'content-type: application/json' -d "$2"; }

# A client "writes to the database", presenting whatever token it believes in.
write_as() { # clientId token value
  printf '    %-10s token=%-4s value=%-22s -> ' "$1" "$2" "$3"
  post /write "{\"clientId\":\"$1\",\"token\":$2,\"value\":\"$3\"}" \
    | sed -E 's/.*"accepted":true.*/✅ ACCEPTED/; s/.*"reason":"FENCED".*/❌ REJECTED (fenced)/'
  echo ""
}

run_scenario() { # fencing=true|false
  post /reset "{\"fencing\":$1}" >/dev/null

  sub "1. Client A acquires the lock"
  # A lease is a lock WITH A TTL: if the holder stops renewing it, it expires.
  # That is what makes locks safe against a client that dies -- and also what
  # creates the dangerous window this experiment is about.
  LEASE_A=$(etcd lease grant 3 2>/dev/null | grep -oE '[0-9a-f]{16}' | head -1)
  etcd put /lock/resource "client-A" --lease="$LEASE_A" >/dev/null
  # ⭐ THE TOKEN: etcd's revision is a cluster-wide monotonically increasing
  #    counter. Every write bumps it. It is a fencing token, for free.
  TOKEN_A=$(etcd get /lock/resource -w fields 2>/dev/null | grep '"Revision"' | grep -oE '[0-9]+' | head -1)
  echo "    lease=$LEASE_A  ttl=3s  fencing token (etcd revision) = $TOKEN_A"

  sub "2. Client A does some work, then writes"
  write_as "client-A" "$TOKEN_A" "written-by-A"

  sub "3. Client A STALLS (GC pause / long syscall / network hiccup)"
  echo "    A is frozen. It does NOT know it is frozen."
  echo "    Its lease is NOT being renewed..."
  sleep 5
  echo "    ...lease has now EXPIRED. The lock is free, but A does not know that."
  REMAINING=$(etcd lease list 2>/dev/null | grep -c "$LEASE_A" || true)
  echo "    lock key still present? $(etcd get /lock/resource --print-value-only 2>/dev/null | head -1 | sed 's/^$/NO — expired/')"

  sub "4. Client B acquires the now-free lock"
  LEASE_B=$(etcd lease grant 30 2>/dev/null | grep -oE '[0-9a-f]{16}' | head -1)
  etcd put /lock/resource "client-B" --lease="$LEASE_B" >/dev/null
  TOKEN_B=$(etcd get /lock/resource -w fields 2>/dev/null | grep '"Revision"' | grep -oE '[0-9]+' | head -1)
  echo "    lease=$LEASE_B  fencing token = $TOKEN_B    (HIGHER than A's $TOKEN_A)"

  sub "5. Client B writes"
  write_as "client-B" "$TOKEN_B" "written-by-B"

  sub "6. ⚠️  Client A WAKES UP — still believing it holds the lock"
  echo "    A has no way to know time passed. It resumes exactly where it was."
  write_as "client-A" "$TOKEN_A" "written-by-A-LATE"

  echo "    final stored value: $(curl -s $R/state | grep -oE '"value":"[^"]*"' | head -1 | cut -d'"' -f4)"
}

hr "SETUP"
etcd put /demo/ping ok >/dev/null && echo "    etcd reachable"
curl -s $R/state >/dev/null && echo "    resource reachable"
echo "
  The scenario, run twice:
     A takes the lock -> A stalls -> A's lease expires -> B takes the lock
     -> B writes -> A WAKES UP and writes with its stale token.
"

hr "SCENARIO 1 — resource does NOT check tokens (no fencing)"
run_scenario false
cat <<'EOF'

  ❌ A's LATE WRITE WAS ACCEPTED.

     B held the lock. B wrote. Then A -- which had lost the lock seconds
     earlier -- overwrote B's data. Both clients did exactly what a correct
     lock client is supposed to do. The LOCK SERVICE was never wrong.

     Mutual exclusion was violated anyway, because a lock can only tell you
     what was true AT THE MOMENT YOU ASKED.
EOF

hr "SCENARIO 2 — resource ENFORCES fencing tokens"
run_scenario true
cat <<'EOF'

  ✅ A's LATE WRITE WAS REJECTED.

     Identical sequence. The only difference: the RESOURCE remembers the
     highest token it has accepted and refuses anything at or below it.

  ⭐ THE KEY INSIGHT (this is the gate answer):
     The token is enforced by the RESOURCE, not by the lock service and not
     by the client. A client that wrongly believes it holds the lock can do
     no damage, because the thing it writes to will not listen to it.

     You cannot fix this with a better lock service. No lock service can
     prevent a client from stalling after acquiring and before writing --
     that window always exists. You can only make the stale write HARMLESS.

  Where the token comes from in practice:
     etcd        -> the key's mod_revision / a lease-scoped revision
     ZooKeeper   -> the znode's zxid or version
     Raft        -> the term number
     Postgres    -> a monotonic sequence, or an optimistic-concurrency version
     Redis       -> ⚠️ nothing native. This is the heart of the Redlock critique.
EOF

hr "THE FULL WRITE LOG (scenario 2)"
curl -s $R/state | tr ',' '\n' | grep -E 'clientId|token|accepted|reason' | sed 's/^/    /' | head -24

hr "TRY THIS"
cat <<'EOF'

  · Give A a lease long enough to survive the stall (lease grant 30) and it
    keeps the lock -- correct behaviour, and the reason lease TTLs are a
    LIVENESS/SAFETY trade: short TTL = fast recovery but more false expiry;
    long TTL = safer but a dead holder blocks everyone for longer.

  · Watch a lease keepalive:   docker exec p4-etcd1 etcdctl lease keep-alive <id>

  · etcd has a real lock command that does all this properly:
        docker exec p4-etcd1 etcdctl lock mylock -- echo "I hold the lock"
EOF
