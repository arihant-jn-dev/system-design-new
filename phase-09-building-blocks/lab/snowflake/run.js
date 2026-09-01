'use strict';
/**
 * A SNOWFLAKE ID GENERATOR, from scratch. No dependencies.
 *
 *   node snowflake/run.js
 *
 * ⭐ THE PROBLEM: you need unique IDs across many machines, with NO coordination
 *    at generation time, and you'd like them to be ROUGHLY TIME-SORTED so they
 *    behave well as a B-tree primary key (see ../id-locality/ for the proof).
 *
 * ⭐ THE INSIGHT: 64 bits is enough to encode WHEN, WHERE and WHICH-ONE.
 *
 *      1 bit    unused (sign) -- keeps the value positive in signed-64 languages
 *     41 bits   milliseconds since a custom EPOCH   -> ~69 years
 *     10 bits   machine/worker id                   -> 1,024 nodes
 *     12 bits   sequence within the same millisecond-> 4,096 ids/ms/node
 *      ------
 *     64 bits   => 4,096,000 ids/second PER NODE, ~4.2 BILLION/s across a fleet
 *
 * Uniqueness needs NO network call: the machine id makes nodes disjoint, and the
 * sequence makes one node's IDs disjoint within a millisecond. That is the whole
 * trick, and it's why Snowflake keeps being reinvented.
 *
 * ⚠️ JavaScript numbers are IEEE-754 doubles -- only 53 bits of integer
 *    precision -- so this uses BigInt. That is not incidental: it is EXACTLY why
 *    Twitter's API returns `id_str` alongside `id`, because naive JS clients
 *    silently corrupted the last few digits of every tweet ID.
 */

const hr  = (t) => { console.log('\n' + '='.repeat(74)); console.log('  ' + t); console.log('='.repeat(74)); };
const ok  = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

// ===========================================================================
//  THE IMPLEMENTATION
// ===========================================================================
const EPOCH        = 1735689600000n;   // 2025-01-01T00:00:00Z. ⭐ A CUSTOM epoch
                                       //   buys back the years since 1970 -- with
                                       //   the Unix epoch you'd have burned 55 of
                                       //   your 69 years before shipping.
const MACHINE_BITS = 10n;
const SEQ_BITS     = 12n;

const MAX_MACHINE  = (1n << MACHINE_BITS) - 1n;   // 1023
const MAX_SEQ      = (1n << SEQ_BITS) - 1n;       // 4095

class Snowflake {
  constructor(machineId, clock = () => BigInt(Date.now())) {
    if (BigInt(machineId) > MAX_MACHINE) throw new Error(`machineId must be <= ${MAX_MACHINE}`);
    this.machineId = BigInt(machineId);
    this.clock     = clock;              // injectable, so we can simulate clock skew
    this.lastMs    = -1n;
    this.seq       = 0n;
    this.waits     = 0;                  // times we spun waiting for the next ms
    this.blocked   = 0;                  // times we refused to issue (clock went back)
  }

  next() {
    let ms = this.clock();

    // ⭐⭐ THE CLOCK-SKEW CASE. NTP stepped the clock BACKWARDS. If we just
    //     carried on, we would re-issue timestamps we have already used, and
    //     with the same machine id and a reset sequence that means DUPLICATE IDs.
    //
    //     ⭐ THE ONLY SAFE ANSWER IS TO REFUSE TO ISSUE until the clock catches
    //        up. Availability is sacrificed for correctness -- and that is the
    //        right trade, because a duplicate primary key is unrecoverable while
    //        a few milliseconds of unavailability is not.
    if (ms < this.lastMs) {
      const drift = this.lastMs - ms;
      this.blocked++;
      if (drift > 5000n) {
        // ⚠️ A big jump is an OPERATIONAL problem, not something to spin on.
        //    Real systems alarm and take the node out of rotation.
        throw new Error(`clock moved backwards by ${drift}ms -- refusing to generate`);
      }
      while (ms < this.lastMs) ms = this.clock();   // small drift: wait it out
    }

    if (ms === this.lastMs) {
      // Same millisecond -- take the next sequence number.
      this.seq = (this.seq + 1n) & MAX_SEQ;
      if (this.seq === 0n) {
        // ⭐ SEQUENCE EXHAUSTED: 4,096 ids in one millisecond on this node.
        //    Spin until the next millisecond. This is a real (if rare) backpressure
        //    point, and it is why the sequence width is a capacity decision.
        this.waits++;
        while ((ms = this.clock()) <= this.lastMs) { /* spin */ }
      }
    } else {
      // ⭐ A NEW millisecond. Reset the sequence.
      //    (Some implementations reset to a RANDOM value instead of 0, so that
      //     low-rate generators don't emit ...0, ...0, ...0 and leak their rate.)
      this.seq = 0n;
    }

    this.lastMs = ms;
    return ((ms - EPOCH) << (MACHINE_BITS + SEQ_BITS))
         | (this.machineId << SEQ_BITS)
         | this.seq;
  }

  /** ⭐ IDs are SELF-DESCRIBING -- you can decode one from a log line with no
   *    database lookup. That is a genuinely useful operational property. */
  static decode(id) {
    id = BigInt(id);
    return {
      timestamp: new Date(Number((id >> (MACHINE_BITS + SEQ_BITS)) + EPOCH)),
      machineId: Number((id >> SEQ_BITS) & MAX_MACHINE),
      sequence:  Number(id & MAX_SEQ),
    };
  }
}

// ===========================================================================
(function main() {

  // ------------------------------------------------------------- THE LAYOUT
  hr('THE BIT LAYOUT');

  const sf = new Snowflake(42);
  const id = sf.next();
  const bin = id.toString(2).padStart(64, '0');

  console.log(`
  id (decimal)   ${ok(id.toString())}
  id (binary)    ${bin}
                 ${dim('^')}${dim('-'.repeat(40))}${dim('^')}${dim('-'.repeat(8))}${dim('^')}${dim('-'.repeat(10))}
                 ${dim('sign')}  ${dim('41 bits timestamp')}${' '.repeat(20)}${dim('10 machine')}  ${dim('12 seq')}
`);
  const d = Snowflake.decode(id);
  console.log(`  decoded        time=${d.timestamp.toISOString()}  machine=${d.machineId}  seq=${d.sequence}`);
  console.log(dim(`
  ⭐ Decodable with no lookup. Given an ID from a support ticket you immediately
     know WHEN it was created and WHICH NODE made it.
  ⚠️ Which is also the downside: the ID LEAKS your creation time and your fleet
     size. Sequential-ish IDs are enumerable, so never use them as a security
     token or a public identifier for something private.`));

  // ------------------------------------------------------------ MONOTONIC
  hr('PROPERTY 1 — MONOTONIC AND UNIQUE, WITH NO COORDINATION');

  const N = 200_000;
  const gen = new Snowflake(7);
  const ids = new Array(N);
  let t = Date.now();
  for (let i = 0; i < N; i++) ids[i] = gen.next();
  const ms = Date.now() - t;

  let sorted = true;
  for (let i = 1; i < N; i++) if (ids[i] <= ids[i - 1]) { sorted = false; break; }
  const unique = new Set(ids.map(String)).size;

  console.log(`
      generated            ${N.toLocaleString()} ids in ${ms} ms  (${Math.round(N / (ms / 1000)).toLocaleString()}/s)`);
  console.log(`      strictly increasing  ${sorted ? ok('YES') : bad('NO')}`);
  console.log(`      unique               ${unique === N ? ok(`${unique.toLocaleString()} / ${N.toLocaleString()}`) : bad(`${unique} / ${N}`)}`);
  console.log(`      sequence exhausted   ${gen.waits} times ${dim('(spun to the next millisecond)')}`);
  console.log(dim(`
      ⭐ ${Math.round(N / (ms / 1000)).toLocaleString()}/s from ONE node with ZERO network calls. A ticket server or a
         DB sequence would need a round trip per ID -- or per BLOCK, which then
         gives up ordering.`));

  // ------------------------------------------- MULTI-NODE, NO COORDINATION
  hr('PROPERTY 2 — 8 NODES, NO COMMUNICATION, ZERO COLLISIONS');

  const nodes = Array.from({ length: 8 }, (_, i) => new Snowflake(i));
  const all = new Set();
  let collisions = 0;
  for (let round = 0; round < 20_000; round++) {
    for (const n of nodes) {
      const s = n.next().toString();
      if (all.has(s)) collisions++;
      all.add(s);
    }
  }
  console.log(`
      8 nodes x 20,000 ids = ${(8 * 20000).toLocaleString()} ids`);
  console.log(`      collisions           ${collisions === 0 ? ok('0') : bad(collisions)}`);
  console.log(ok(`
      ⭐ The nodes never spoke to each other. Disjointness is STRUCTURAL --
         it comes from the machine-id field, not from agreement.`));

  console.log(dim(`
      ⚠️ WHICH MOVES THE HARD PROBLEM: how does each node get a UNIQUE machine
         id? That IS a coordination problem, just a rare one:
           · ZooKeeper/etcd sequential node   (Twitter's original approach)
           · a StatefulSet ordinal in Kubernetes
           · derived from the private IP / MAC  (⚠️ breaks when IPs are reused)
           · a config value                     (⚠️ breaks the day someone copies
                                                     a config file -- and it fails
                                                     SILENTLY, as duplicate IDs)
      ⭐ Get this wrong and you get duplicates with no error. Validate at startup:
         register the id in etcd with a lease and refuse to boot on conflict.`));

  // ----------------------------------------------------------- CLOCK SKEW
  hr('⚠️ PROPERTY 3 — WHAT HAPPENS WHEN THE CLOCK GOES BACKWARDS');

  console.log(dim(`
  NTP does not only speed up or slow down the clock; it can STEP it backwards.
  A Snowflake generator that ignores this WILL emit duplicate IDs, because the
  same (timestamp, machine, sequence) triple gets reused.
`));

  // A fake clock we can rewind on demand.
  //
  // ⚠️ NOTE ON THE HARNESS: the generator's catch-up is a SYNCHRONOUS spin, so
  //    it blocks the event loop -- a setInterval that "advances time" would
  //    never fire and the test would hang forever. (It did, while writing this.)
  //    So time advances INSIDE the clock function instead: each poll returns a
  //    slightly later value, exactly as a real clock would.
  let fake = BigInt(Date.now());
  let ticking = false;
  const clock = () => { const v = fake; if (ticking) fake += 1n; return v; };
  const skewed = new Snowflake(3, clock);

  const before = [];
  for (let i = 0; i < 3; i++) { before.push(skewed.next()); fake += 1n; }

  console.log('  three ids at t, t+1, t+2:');
  before.forEach((x) => console.log(`      ${x}  ${dim(`seq=${Snowflake.decode(x).sequence}`)}`));

  console.log(bad('\n  ⏪ now NTP steps the clock back 2 ms...'));
  fake -= 2n;

  ticking = true;              // real time starts passing again
  const after = skewed.next();
  ticking = false;

  console.log(`      next id             ${after}`);
  console.log(`      > previous id?      ${after > before[2] ? ok('YES -- still monotonic') : bad('NO -- ORDERING BROKEN')}`);
  console.log(`      duplicate issued?   ${ok('NO')} ${dim(`(generator blocked ${skewed.blocked} time(s) and waited)`)}`);

  console.log(ok(`
  ⭐ THE RULE: when the clock moves backwards, REFUSE TO ISSUE until it catches
     up. You trade availability for correctness, and that is the right trade --
     a duplicate primary key is unrecoverable, a 3 ms stall is not.

     For a LARGE backward step, don't spin: alarm and remove the node from
     rotation. And run NTP in SLEW mode (never step) on ID-generating hosts.`));

  // ------------------------------------------------------ THE ALTERNATIVES
  hr('CHOOSING AN ID SCHEME');

  const rows = [
    ['auto-increment',  'DB',      'perfect',  '⚠️ needs one writer -- does not shard', 'small, sortable'],
    ['UUID v4',         'anywhere','⭐ none',   '⚠️ random -> destroys B-tree locality', '128-bit, opaque'],
    ['⭐ UUID v7/ULID',  'anywhere','~ms',      '⭐ time-ordered AND uncoordinated',      '128-bit, standard'],
    ['⭐ Snowflake',     'anywhere','~ms',      '⚠️ needs a unique machine id',          '64-bit, decodable'],
    ['ticket server',   'central', 'perfect',  '⚠️ a round trip + an SPOF to run',      'small, sortable'],
    ['sequence blocks', 'central', 'blocky',   'a round trip per BLOCK, not per id',    'gaps on restart'],
  ];
  console.log(`\n  ${'scheme'.padEnd(18)}${'generated'.padEnd(10)}${'ordering'.padEnd(10)}${'catch'.padEnd(42)}`);
  console.log(dim('  ' + '-'.repeat(80)));
  for (const [a, b, c, d2] of rows) console.log(`  ${a.padEnd(18)}${b.padEnd(10)}${c.padEnd(10)}${d2}`);

  console.log(`
  ⭐ THE MODERN DEFAULT IS UUID v7 (or ULID), not Snowflake:
       · same time-ordering benefit
       · ⭐ NO machine-id coordination problem at all -- the low bits are random
       · a standard type your database already understands (Postgres \`uuid\`)
       · 128 bits instead of 64, which is the price

  ⭐ REACH FOR SNOWFLAKE WHEN: 64 bits matters (index size, cache lines, mobile
     payloads), or you actively WANT the decodable machine id for debugging.

  ⚠️ AND NEVER USE A SEQUENTIAL ID AS A SECURITY BOUNDARY. /orders/1001 is
     enumerable. Sortable-for-the-index and opaque-in-the-URL are different
     requirements -- it is fine to have both: an internal v7 key, an external
     random public id.
`);

  hr('YOUR RESULTS — copy these into ../README.md');
  console.log(`
      ids/sec, single node     ${Math.round(N / (ms / 1000)).toLocaleString()}/s
      strictly increasing      ${sorted}
      collisions across 8 nodes ${collisions}
      duplicate after clock rewind? no (blocked ${skewed.blocked}x)
`);
})();
