'use strict';
/**
 * Part B — three rate limiters in Redis, and why the algorithm matters.
 *
 *   docker compose run --rm lab node part-b-rate-limiters/run.js
 *
 *   B1  FIXED WINDOW      — simplest, and provably lets 2x through at a boundary
 *   B2  SLIDING WINDOW    — a sorted set. Exact. Costs memory.
 *   B3  TOKEN BUCKET      — Lua, atomic, O(1) memory, allows controlled bursts
 */

const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST ?? 'redis', port: 6379 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hr = (t) => {
  console.log('\n' + '='.repeat(72));
  console.log('  ' + t);
  console.log('='.repeat(72));
};

// ===================================================== B1 · FIXED WINDOW
//
// One counter per (user, time-window). INCR, and compare to the limit.
// Cheap and simple -- and it has a well-known flaw.
async function fixedWindow(key, limit, windowSec) {
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const k = `fw:${key}:${bucket}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, windowSec * 2);
  return n <= limit;
}

// ============================================== B2 · SLIDING WINDOW (ZSET)
//
// A sorted set of request timestamps. Drop anything older than the window,
// count what remains, add the new one -- all in one MULTI so it's atomic.
//
// Exact. The cost is MEMORY: one sorted-set member per request in the window.
async function slidingWindow(key, limit, windowMs) {
  const now = Date.now();
  const k = `sw:${key}`;
  const results = await redis
    .multi()
    .zremrangebyscore(k, 0, now - windowMs)  // evict expired
    .zcard(k)                                 // how many remain
    .zadd(k, now, `${now}-${Math.random()}`)  // record this one
    .pexpire(k, windowMs * 2)
    .exec();
  const countBefore = results[1][1];
  if (countBefore >= limit) {
    await redis.zremrangebyscore(k, now, now); // undo our own add
    return false;
  }
  return true;
}

// ================================================= B3 · TOKEN BUCKET (Lua)
//
// ⭐ Lua is how you get ATOMIC read-modify-write in Redis. The whole script
//    runs as one operation -- no other client can interleave. Without it you
//    would have a classic check-then-act race (Phase 3B note 05).
//
// O(1) memory per key regardless of rate, and it permits a controlled BURST
// up to the bucket capacity, which is usually what you actually want.
const TOKEN_BUCKET_LUA = `
local key      = KEYS[1]
local rate     = tonumber(ARGV[1])   -- tokens per second
local capacity = tonumber(ARGV[2])   -- max burst
local now      = tonumber(ARGV[3])   -- ms
local cost     = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(bucket[1])
local ts     = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  ts = now
end

-- refill based on elapsed time
local elapsed = math.max(0, now - ts) / 1000
tokens = math.min(capacity, tokens + elapsed * rate)

local allowed = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
end

redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, math.ceil(capacity / rate * 1000 * 2))
return {allowed, tostring(tokens)}
`;

let tokenBucketSha;
async function tokenBucket(key, ratePerSec, capacity) {
  if (!tokenBucketSha) tokenBucketSha = await redis.script('LOAD', TOKEN_BUCKET_LUA);
  const [allowed] = await redis.evalsha(tokenBucketSha, 1, `tb:${key}`, ratePerSec, capacity, Date.now(), 1);
  return allowed === 1;
}

// ============================================================= experiments
(async () => {
  await redis.flushall();

  // ---------------------------------------------------------------- B1
  hr('B1 — FIXED WINDOW: the boundary problem');
  console.log(`
  Limit: 10 requests per 2-second window.
  We send 10 at the END of one window and 10 at the START of the next.
`);
  const wsec = 2;
  // Wait until we are near the end of a window.
  const msIntoWindow = Date.now() % (wsec * 1000);
  await sleep(Math.max(0, wsec * 1000 - msIntoWindow - 300));

  let allowed1 = 0;
  for (let i = 0; i < 10; i++) if (await fixedWindow('u1', 10, wsec)) allowed1++;
  console.log(`    end of window A:   ${allowed1}/10 allowed`);

  await sleep(400); // cross the boundary
  let allowed2 = 0;
  for (let i = 0; i < 10; i++) if (await fixedWindow('u1', 10, wsec)) allowed2++;
  console.log(`    start of window B: ${allowed2}/10 allowed`);
  console.log(`
    ❌ ${allowed1 + allowed2} requests allowed in well under one window.
       The configured limit is 10 per 2s. A client that times its traffic to
       the boundary gets ${allowed1 + allowed2} -- effectively 2x the limit, and it is not
       cheating, it is just how a fixed window works.`);

  // ---------------------------------------------------------------- B2
  hr('B2 — SLIDING WINDOW (sorted set): exact');
  await redis.flushall();
  console.log(`
  Same test: limit 10 per 2000ms, straddling the same boundary.
`);
  let sAllowed1 = 0;
  for (let i = 0; i < 10; i++) if (await slidingWindow('u2', 10, 2000)) sAllowed1++;
  console.log(`    first burst:  ${sAllowed1}/10 allowed`);
  await sleep(400);
  let sAllowed2 = 0;
  for (let i = 0; i < 10; i++) if (await slidingWindow('u2', 10, 2000)) sAllowed2++;
  console.log(`    400ms later:  ${sAllowed2}/10 allowed`);
  console.log(`
    ✅ ${sAllowed1 + sAllowed2} total. The window MOVES with the clock, so the earlier
       requests still count. No boundary to exploit.`);

  const card = await redis.zcard('sw:u2');
  console.log(`
    The cost: the sorted set holds ${card} members -- one per request in the
    window. At 10,000 req/s per key that is 10,000 members per key. Sliding
    window log is EXACT and MEMORY-HUNGRY; that is the trade.`);

  // ---------------------------------------------------------------- B3
  hr('B3 — TOKEN BUCKET (Lua): O(1) memory, controlled bursts');
  await redis.flushall();
  console.log(`
  rate = 5 tokens/sec, capacity = 10 (so a burst of 10 is allowed).
`);
  let burst = 0;
  for (let i = 0; i < 15; i++) if (await tokenBucket('u3', 5, 10)) burst++;
  console.log(`    immediate burst of 15: ${burst} allowed  (bucket capacity = 10)`);

  await sleep(1000);
  let after = 0;
  for (let i = 0; i < 10; i++) if (await tokenBucket('u3', 5, 10)) after++;
  console.log(`    after waiting 1s:      ${after} allowed  (refilled ~5 tokens)`);

  console.log(`
    ✅ Bursts are ALLOWED up to capacity, then the rate takes over. That is
       usually what you want -- a user clicking 10 things quickly is normal;
       sustaining 10/s forever is not.

    ⭐ Why Lua: refill-then-consume is a READ-MODIFY-WRITE. Without a script
       two concurrent clients both read "8 tokens", both decrement, and you
       have handed out 2 tokens for the price of 1. The Lua script executes
       atomically, so that race cannot happen.`);

  // ---------------------------------------------------------------- compare
  hr('COMPARISON');
  console.log(`
  algorithm            accuracy      memory/key        bursts     cost
  ---------------------------------------------------------------------------
  fixed window         ❌ 2x at edge  O(1)              at edges   1 INCR
  sliding window log   ✅ exact       O(requests)       none       ZSET ops
  sliding window ctr   ~ approximate  O(1)              smoothed   2 counters
  token bucket         ✅ good        O(1)              ⭐ tunable  1 Lua call
  leaky bucket         ✅ good        O(1)              none       queue

  ⭐ Token bucket is the usual production answer: O(1) memory, one round trip,
     and burst behaviour you can actually tune. Sliding window log when you
     need exactness and the key count is small.

  And all of this is PER REDIS NODE. Distributed rate limiting across many
  limiter instances is a further accuracy-vs-latency trade -- centralised
  counters are exact but add a round trip; local counters with periodic sync
  are fast but approximate. -> Phase 7
`);

  await redis.quit();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
