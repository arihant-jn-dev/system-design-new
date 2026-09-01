#!/bin/sh
# Experiment A — Raft leader election, and the failure that matters.
#
#   ./leader-election.sh
#
# The roadmap is specific: kill -STOP the leader, PAUSE it, don't kill it.
# A killed process is the EASY failure -- connections refuse, everyone knows.
# A PAUSED process is the interesting one: it is alive, holds no opinion that
# it has lost anything, and when it resumes it has NO IDEA time has passed.
# That is a GC pause, and it is how split brain actually happens.

set -e

hr() { printf '\n%s\n  %s\n%s\n' "======================================================================" "$1" "======================================================================"; }

status() { docker exec p4-etcd1 etcdctl endpoint status --cluster -w table 2>/dev/null | grep -E "etcd[0-9]|ENDPOINT" ; }

# NOTE: `etcdctl endpoint status -w fields` has NO "IsLeader" field. It reports
# "Leader" (the current leader's member ID) and "MemberID" (this node's). A node
# is the leader iff those two are equal.
field() { echo "$2" | grep "\"$1\"" | grep -oE '[0-9]+' | head -1; }

is_leader() {
  _out=$(docker exec "$1" etcdctl endpoint status -w fields 2>/dev/null || true)
  _mid=$(field MemberID "$_out"); _lid=$(field Leader "$_out")
  [ -n "$_mid" ] && [ "$_mid" = "$_lid" ]
}

who_leads() {
  for n in 1 2 3; do
    _out=$(docker exec "p4-etcd$n" etcdctl endpoint status -w fields 2>/dev/null || true)
    if [ -z "$_out" ]; then printf '    etcd%s  (unreachable)\n' "$n"; continue; fi
    _mid=$(field MemberID "$_out"); _lid=$(field Leader "$_out"); _t=$(field RaftTerm "$_out")
    _isl=false; [ "$_mid" = "$_lid" ] && _isl=true
    printf '    etcd%s  leader=%-5s term=%s\n' "$n" "$_isl" "${_t:-?}"
  done
}

hr "A1 — the cluster"
status
echo ""
who_leads
cat <<'EOF'

  3 nodes because Raft needs a MAJORITY (2 of 3).
  ⭐ An even count is wasteful: 4 nodes needs 3 for a majority, so it still
     tolerates only ONE failure -- same as 3, for more hardware and more
     network traffic. Always use an odd number.
EOF

hr "A2 — writes work; find the leader"
docker exec p4-etcd1 etcdctl put /demo/key "value-before" >/dev/null
echo "    wrote /demo/key = $(docker exec p4-etcd1 etcdctl get /demo/key --print-value-only)"

LEADER=""
for n in 1 2 3; do
  if is_leader "p4-etcd$n"; then LEADER="p4-etcd$n"; fi
done
echo "    current leader: $LEADER"
TERM_BEFORE=$(field RaftTerm "$(docker exec p4-etcd1 etcdctl endpoint status -w fields 2>/dev/null)")
echo "    current term:   $TERM_BEFORE"

hr "A3 — kill -STOP the leader (a GC pause, not a crash)"
echo "
  SIGSTOP freezes the process. It does not close its sockets, it does not
  tell anyone it is going away, and it does not know how long it was out.
"
# `docker pause` uses the cgroup freezer, which is exactly SIGSTOP semantics
# for every process in the container. (The etcd image is distroless, so there
# is no shell inside to run `kill -STOP` with.)
docker pause "$LEADER" >/dev/null
echo "    >>> $LEADER PAUSED"
echo "    waiting for the followers to notice (election timeout = 1000ms)..."
sleep 5

echo ""
for n in 1 2 3; do
  c="p4-etcd$n"
  [ "$c" = "$LEADER" ] && { printf '    %s  (paused -- cannot answer)\n' "$c"; continue; }
  out=$(docker exec "$c" etcdctl endpoint status -w fields 2>/dev/null || true)
  mid=$(field MemberID "$out"); lid=$(field Leader "$out"); term=$(field RaftTerm "$out")
  isl=false; [ -n "$mid" ] && [ "$mid" = "$lid" ] && isl=true
  printf '    %s  leader=%-5s term=%s\n' "$c" "$isl" "${term:-?}"
done

cat <<'EOF'

  ⭐ WHAT JUST HAPPENED (this is gate Q2):
     1. Followers stopped receiving heartbeats from the leader
     2. One of them hit its ELECTION TIMEOUT first (they are RANDOMISED,
        precisely so two followers rarely time out together)
     3. It incremented the TERM, became a CANDIDATE, and requested votes
     4. It got a MAJORITY (2 of 3 -- the paused node could not vote)
     5. It became leader FOR THE NEW TERM

     The term number is a LOGICAL CLOCK. It only ever increases, and it is
     what makes the old leader's authority expire.
EOF

hr "A4 — the cluster still serves writes with 2 of 3"
NEWLEADER=""
for n in 1 2 3; do
  c="p4-etcd$n"
  [ "$c" = "$LEADER" ] && continue
  if is_leader "$c"; then NEWLEADER="$c"; fi
done
echo "    new leader: $NEWLEADER"
SURVIVOR=$([ "$LEADER" = "p4-etcd1" ] && echo p4-etcd2 || echo p4-etcd1)
docker exec "$SURVIVOR" etcdctl put /demo/key "value-after-election" >/dev/null
echo "    wrote /demo/key = $(docker exec "$SURVIVOR" etcdctl get /demo/key --print-value-only)"
echo "
    2 of 3 is a majority, so the cluster is fully available. If we paused a
    SECOND node, the remaining one could not form a majority and would refuse
    ALL writes -- choosing consistency over availability. That is CP behaviour,
    and you can try it below."

hr "A5 — resume the old leader: what does it think?"
docker unpause "$LEADER" >/dev/null
echo "    >>> $LEADER RESUMED"
sleep 4
who_leads
echo "    /demo/key on the resumed node = $(docker exec "$LEADER" etcdctl get /demo/key --print-value-only 2>/dev/null)"

cat <<'EOF'

  ⭐ THE POINT:
     The old leader woke up believing it was still leader. It learned otherwise
     only when it saw a HIGHER TERM from another node -- at which point Raft
     requires it to step down immediately.

     But notice the window: between resuming and hearing that higher term, it
     genuinely believed it was leader. If it had been holding a LOCK and had
     gone straight to writing to a database, nothing in Raft would have stopped
     it. Raft protects ITS OWN log. It does not protect YOUR resource.

     THAT is why fencing tokens exist -> run ./fencing.sh
EOF

hr "TRY THIS"
cat <<'EOF'

  Lose the majority (pause TWO nodes) and watch writes fail entirely:

      docker pause p4-etcd2 p4-etcd3
      docker exec p4-etcd1 etcdctl put /demo/x y     # hangs, then fails
      docker unpause p4-etcd2 p4-etcd3

  etcd is CP: with no majority it refuses to serve rather than risk
  divergence. Cassandra at CL=ONE would have kept accepting writes.
  Same partition, opposite choice -- that is CAP, and it is a per-operation
  decision rather than a database's personality.
EOF
