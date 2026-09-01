#!/bin/sh
# Part A — the cold-cache outage, and the fix.
#
#   ./part-a-cache/run.sh        (run from lab/, on the HOST)
#
# A1  warm cache: high hit rate, the DB barely works
# A2  FLUSHALL under load, NO coalescing  -> the database melts
# A3  FLUSHALL under load, WITH coalescing -> it survives

set -e

APP="http://localhost:3005"
hr() { printf '\n%s\n  %s\n%s\n' "======================================================================" "$1" "======================================================================"; }

stats()  { curl -s $APP/stats; }
reset()  { curl -s -XPOST $APP/admin/reset-stats >/dev/null; }
coal()   { curl -s -XPOST $APP/admin/coalesce -H 'content-type: application/json' -d "{\"on\":$1}" >/dev/null; }
flush()  { docker exec p5-redis redis-cli FLUSHALL >/dev/null; }
show()   { stats | tr ',' '\n' | grep -E '"(hits|misses|dbQueries|coalesced|errors|hitRate)"' | sed 's/[{}"]//g' | sed 's/^/      /'; }

# Sample live DB QPS while a load test runs in the background.
watch_db_qps() { # duration_seconds label
  _end=$(( $(date +%s) + $1 ))
  _max=0
  printf '      %-8s %s\n' "t" "DB queries/sec"
  _t=0
  while [ "$(date +%s)" -lt "$_end" ]; do
    _q=$(stats | grep -oE '"dbQpsNow":[0-9]+' | cut -d: -f2)
    [ -z "$_q" ] && _q=0
    [ "$_q" -gt "$_max" ] && _max=$_q
    printf '      %-8s %s\n' "${_t}s" "$_q"
    _t=$((_t+2)); sleep 2
  done
  echo "      ---- peak DB QPS: $_max ----"
}

run_load() { # rps duration
  docker compose run --rm -T k6 run -e RPS="$1" -e DURATION="$2" -e HOT_KEYS=10 /scripts/load.js >/tmp/p5k6.txt 2>&1
}

k6_summary() {
  grep -E "http_req_duration|http_req_failed|checks_succeeded" /tmp/p5k6.txt | sed 's/^/      /'
}

# ============================================================== A1
hr "A1 — warm cache: what 'working' looks like"
flush; coal false; reset
echo "
  800 req/s for 25s, Zipfian: 80% of traffic on just 10 hot keys.
  The first request for each key misses; after that it hits.
"
run_load 800 25s
echo "  k6:"; k6_summary
echo "  app:"; show
HIT_WARM=$(stats | grep -oE '"hitRate":[0-9.]+' | cut -d: -f2)
DBQ_WARM=$(stats | grep -oE '"dbQueries":[0-9]+' | cut -d: -f2)
echo "
  ⭐ ~$DBQ_WARM database queries served ~7500 requests. The cache is absorbing
     almost everything, and the database is nearly idle. This is the state
     your capacity planning is silently based on."

# ============================================================== A2
hr "A2 — FLUSHALL under load, NO request coalescing"
coal false; reset
echo "
  Same load. 8 seconds in, we FLUSHALL Redis -- simulating a cache restart,
  a failover, an eviction storm, or someone running 'redis-cli FLUSHALL'.
"
( sleep 8; flush; echo "      >>> FLUSHALL at t=8s" ) &
run_load 800 30s &
LOADPID=$!
sleep 6
watch_db_qps 18
wait $LOADPID
echo ""
echo "  k6:"; k6_summary
echo "  app:"; show
DBQ_COLD=$(stats | grep -oE '"dbQueries":[0-9]+' | cut -d: -f2)
ERR_COLD=$(stats | grep -oE '"errors":[0-9]+' | cut -d: -f2)

cat <<EOF

  ❌ THE COLD-CACHE OUTAGE
     database queries: $DBQ_COLD   (warm run: $DBQ_WARM)
     app errors:       $ERR_COLD

     Every request missed at the same instant, so ALL of them went to a
     database sized for ~5% of that traffic. Latency exploded; some requests
     failed outright (connection pool exhausted, or query timeouts).

     ⭐ Nothing about the CACHE was broken -- it was empty, which is its
        normal state after a restart. Losing a PERFORMANCE component caused
        an AVAILABILITY failure. That is the failure mode nobody plans for.
EOF

# ============================================================== A3
hr "A3 — same failure, WITH request coalescing"
coal true; reset
echo "
  Identical scenario. The only change: concurrent misses for the SAME key
  share one in-flight database query (singleflight / request collapsing).
"
( sleep 8; flush; echo "      >>> FLUSHALL at t=8s" ) &
run_load 800 30s &
LOADPID=$!
sleep 6
watch_db_qps 18
wait $LOADPID
echo ""
echo "  k6:"; k6_summary
echo "  app:"; show
DBQ_FIX=$(stats | grep -oE '"dbQueries":[0-9]+' | cut -d: -f2)
COAL=$(stats | grep -oE '"coalesced":[0-9]+' | cut -d: -f2)
ERR_FIX=$(stats | grep -oE '"errors":[0-9]+' | cut -d: -f2)

cat <<EOF

  ✅ WITH COALESCING
     database queries: $DBQ_FIX    (without coalescing: $DBQ_COLD)
     coalesced misses: $COAL       <- requests that rode along on someone else's query
     app errors:       $ERR_FIX

     ⭐ READ THE ERROR COUNT FIRST. That is the headline: the outage is gone.

     But be honest about the DB query numbers -- the reduction is MODEST,
     not dramatic. Coalescing only merges CONCURRENT misses for the SAME
     key. Our 10 hot keys coalesce heavily; the long-tail keys each miss
     exactly once and have nothing to merge with.

     So coalescing did not "reduce database load by 10x". It removed the
     CONCENTRATED bursts on hot keys -- which is precisely what was
     exhausting the connection pool and producing the errors.
EOF

hr "WHAT THIS DOES AND DOES NOT FIX"
cat <<'EOF'

  Coalescing fixes the STAMPEDE (many requests, same key, at once).
  It does NOT fix a cold cache in general: 10,000 DISTINCT keys still means
  10,000 queries, just not 500,000. For that you also need:

    · TTL JITTER            so keys don't all expire together (avalanche)
    · PROBABILISTIC EARLY EXPIRY  refresh a key slightly before it expires,
                            in one request, while others still get a hit
    · CACHE WARMING         populate before taking traffic; never cold-start
                            straight into production load
    · A SECOND CACHE TIER   local/near cache in front of Redis
    · CAPACITY HEADROOM     size the DB for a plausible cache-loss scenario,
                            or accept that losing the cache is an outage --
                            but decide that DELIBERATELY

  ⭐ And the distributed caveat: this coalescing is IN-PROCESS. With 50 app
     instances you get 50 queries per key, not 1. Across a fleet you need a
     distributed lock or probabilistic early expiry.
EOF
