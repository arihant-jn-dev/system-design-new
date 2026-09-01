#!/bin/sh
# Part A — what a SLOW dependency does to you, and what stops it.
#
#   ./part-a-resilience/run.sh      (run from lab/, on the HOST)
#
# This is gate Q4, measured: "what happens when a downstream dependency slows
# to 5s p99 -- and what stops it from taking you down?"

set -e

APP="http://localhost:3007"
DEP="http://localhost:4001"

hr() { printf '\n%s\n  %s\n%s\n' "======================================================================" "$1" "======================================================================"; }

mode()  { curl -s -XPOST $APP/admin/mode -H 'content-type: application/json' -d "{\"mode\":\"$1\"}" >/dev/null; }
reset() { curl -s -XPOST $APP/admin/reset >/dev/null; curl -s -XPOST $DEP/admin/reset >/dev/null; }
healthy(){ curl -s -XPOST $DEP/admin/config -H 'content-type: application/json' \
           -d '{"baseMs":20,"p99Ms":50,"slowProbability":0.01,"errorProbability":0}' >/dev/null; }
degrade(){ curl -s -XPOST $DEP/admin/config -H 'content-type: application/json' \
           -d '{"baseMs":5000,"p99Ms":0,"slowProbability":0,"errorProbability":0}' >/dev/null; }

k6run() { docker compose run --rm -T k6 run -e RPS="$1" -e DURATION="$2" /scripts/load.js >/tmp/p7k6.txt 2>&1 || true; }
k6sum() { grep -E "http_req_duration|http_req_failed|checks_succeeded" /tmp/p7k6.txt | sed 's/^/      /'; }
appstats(){ curl -s $APP/stats | tr ',' '\n' | grep -E '"(ok|failed|fallback|depCalls|timeouts|retries|rejectedByBulkhead|breakerState)"' | sed 's/[{}"]//g' | sed 's/^/      /'; }

run_case() { # mode label
  mode "$1"; healthy; reset
  sleep 1
  hr "$2"
  echo "
  Dependency healthy for the first 8s, then it slows to a 5-SECOND response.
  200 req/s throughout.
"
  ( sleep 8; degrade; echo "      >>> dependency degraded to 5s at t=8s" ) &
  k6run 200 28s
  echo "  k6:"; k6sum
  echo "  app:"; appstats
  healthy
}

hr "SETUP"
curl -s $APP/health >/dev/null && echo "    app reachable"
curl -s $DEP/health >/dev/null && echo "    dependency reachable"
echo "
  app: MAX_CONCURRENCY=50, TIMEOUT_MS=150, MAX_ATTEMPTS=3
       breaker: 10 consecutive failures -> open for 3s -> half-open probes
"

# ============================================================== 1. none
run_case none "1 · NO PROTECTION — no timeout, no retry, no breaker"
cat <<'EOF'

  ❌ THE CASCADE, and this is gate Q4's answer:

     Your service waits the full 5 seconds on every call. By Little's Law,
     concurrency = throughput x latency = 200 x 5 = 1000 in-flight requests
     needed just to keep up. You have capacity for 50.

     So: the pool fills, everything queues, and requests that DO get through
     take seconds. The dependency's slowness has become YOUR outage --
     and note the dependency never returned a single error.

     ⭐ "Slow is worse than down." A down dependency fails fast and you shed
        the load. A SLOW one consumes your capacity while you wait.
EOF

# ============================================================== 2. timeout
run_case timeout "2 · TIMEOUT ONLY (150ms)"
cat <<'EOF'

  Better: you now fail FAST instead of hanging. Capacity is no longer
  consumed by waiting, so the service stays responsive.

  But every request still FAILS -- you have converted a hang into an error.
  That is real progress (you can now shed load and stay alive) and it is
  not yet a good user experience.

  ⭐ How to pick the value: from the dependency's p99, plus headroom.
     Not from a guess, and never longer than your own caller's timeout.
EOF

# ============================================================== 3. retry
run_case retry "3 · TIMEOUT + RETRY with full jitter"
cat <<'EOF'

  ⚠️ LOOK AT depCalls VERSUS ok.

     Retrying a dependency that is SLOW FOR EVERYONE does not help -- the
     next attempt is just as slow. You have multiplied load on a struggling
     dependency by up to 3x, at exactly the moment it can least afford it.

     ⭐ THIS IS THE RETRY STORM. Retries are for TRANSIENT, INDEPENDENT
        failures. They are actively harmful during a systemic one.

     Full jitter still matters -- it stops all callers retrying in lockstep --
     but jitter spreads the load, it does not reduce it.
EOF

# ============================================================== 4. breaker
run_case breaker "4 · TIMEOUT + RETRY + CIRCUIT BREAKER + fallback"
cat <<'EOF'

  ✅ Compare depCalls with case 3, and look at the `fallback` count.

     After 10 consecutive failures the breaker OPENS. From then on the app
     stops calling the dependency entirely and serves a fallback instead:

       · the user gets a DEGRADED but successful response, not an error
       · the dependency gets BREATHING ROOM to recover
       · your capacity is not consumed waiting on something known to be broken

     After the cooldown the breaker goes HALF-OPEN and lets a few probes
     through. Recovery is automatic; a single failure re-opens it.

  ⭐ THE FULL GATE Q4 ANSWER:
     timeout   -> bounds the damage (fail fast instead of hanging)
     bulkhead  -> caps how much of your capacity one dependency can consume
     breaker   -> stops calling something you know is broken
     fallback  -> the user still gets an answer
     And retries WITHOUT a breaker make a systemic failure worse.
EOF

hr "SUMMARY"
cat <<'EOF'

  mode      what it fixes                          what it does not
  ---------------------------------------------------------------------------
  none      nothing                                everything
  timeout   hanging, capacity exhaustion           requests still fail
  retry     transient blips                        ⚠️ AMPLIFIES systemic failure
  breaker   systemic failure, recovery time        needs a fallback to be useful

  ⭐ Ship them together. A timeout without a breaker still hammers a dead
     dependency; a breaker without a fallback still returns errors.
EOF
