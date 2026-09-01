'use strict';
/**
 * A BLOOM FILTER, from scratch. No dependencies.
 *
 *   node bloom-filter/run.js
 *
 * A bloom filter answers ONE question: "have I probably seen this?"
 *
 *   ⭐ "no"  is ALWAYS correct   (no false negatives)
 *   ⚠️ "yes" is PROBABLY correct (false positives, at a rate you choose)
 *
 * That asymmetry is the whole design. You use it as a CHEAP PRE-FILTER in front
 * of something expensive: if the filter says no, you can skip the expensive
 * lookup with total confidence.
 *
 * This file builds one, then MEASURES the false-positive rate against theory,
 * and then shows what happens when you undersize it.
 */

const crypto = require('crypto');

const hr = (t) => { console.log('\n' + '='.repeat(74)); console.log('  ' + t); console.log('='.repeat(74)); };
const ok  = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

// ===========================================================================
//  THE IMPLEMENTATION  (~40 lines -- this is the whole data structure)
// ===========================================================================
class BloomFilter {
  /**
   * @param n  expected number of items
   * @param p  desired false-positive probability (e.g. 0.01 = 1%)
   *
   * ⭐ THE TWO FORMULAS. Memorise these -- they are the entire interview answer.
   *
   *      m = -(n * ln p) / (ln 2)^2        bits needed
   *      k = (m / n) * ln 2                optimal number of hash functions
   *
   * The intuition for k: too few hashes and different items collide too easily;
   * too many and you set so many bits that the filter saturates. ln 2 ~ 0.693
   * falls out of minimising the FP rate -- it's the point where the filter is
   * exactly HALF FULL of 1 bits, which is the maximum-entropy state.
   */
  constructor(n, p) {
    this.n = n;
    this.p = p;
    this.m = Math.ceil(-(n * Math.log(p)) / (Math.LN2 ** 2));
    this.k = Math.max(1, Math.round((this.m / n) * Math.LN2));
    this.bits = new Uint8Array(Math.ceil(this.m / 8));   // m bits, packed
    this.added = 0;
  }

  /**
   * ⭐ KIRSCH-MITZENMACHER: you do NOT need k independent hash functions.
   *    Two are enough:  g_i(x) = h1(x) + i * h2(x)  (mod m)
   *    Provably as good asymptotically, and k hashes cost you k additions
   *    instead of k hash computations. This is what real implementations do.
   */
  _indexes(key) {
    const d = crypto.createHash('sha1').update(key).digest();
    const h1 = d.readUInt32BE(0);
    const h2 = d.readUInt32BE(4) | 1;              // odd, so it can't be degenerate
    const out = new Array(this.k);
    for (let i = 0; i < this.k; i++) {
      out[i] = ((h1 + i * h2) >>> 0) % this.m;
    }
    return out;
  }

  add(key) {
    for (const idx of this._indexes(key)) {
      this.bits[idx >> 3] |= 1 << (idx & 7);       // idx>>3 = byte, idx&7 = bit
    }
    this.added++;
  }

  /** ⭐ Returns false = DEFINITELY absent. Returns true = PROBABLY present. */
  has(key) {
    for (const idx of this._indexes(key)) {
      if ((this.bits[idx >> 3] & (1 << (idx & 7))) === 0) return false;
    }
    return true;
  }

  /** ⚠️ There is NO delete(). Clearing a bit would break every OTHER key that
   *     also set it -- and that would create FALSE NEGATIVES, which destroys the
   *     only guarantee the structure offers. (Counting bloom filters use a small
   *     counter per slot instead of a bit; that's 4x the memory.) */

  /** Fraction of bits set -- ⭐ the health metric. Past ~50% you're saturating. */
  fill() {
    let set = 0;
    for (const byte of this.bits) set += popcount(byte);
    return set / this.m;
  }

  /** ⭐ The ACTUAL FP rate given how many items are really in there:
   *      p = (1 - e^(-k*n/m))^k                                        */
  expectedFP(nActual = this.added) {
    return (1 - Math.exp((-this.k * nActual) / this.m)) ** this.k;
  }
}

function popcount(b) { let c = 0; while (b) { b &= b - 1; c++; } return c; }
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

// ===========================================================================
(function main() {

  // -------------------------------------------------------------- SIZED RIGHT
  hr('A BLOOM FILTER SIZED CORRECTLY');

  const N = 1_000_000;
  const P = 0.01;
  const bf = new BloomFilter(N, P);

  console.log(dim(`
  Target: ${N.toLocaleString()} items at a ${(P * 100).toFixed(0)}% false-positive rate.
`));
  console.log(`      m (bits)          ${bf.m.toLocaleString()}`);
  console.log(`      k (hashes)        ${bf.k}`);
  console.log(`      memory            ${ok(kb(bf.bits.length))}`);
  console.log(`      ⭐ bits per item   ${ok((bf.m / N).toFixed(1))}`);

  // The comparison that makes the case:
  const setBytes = N * (16 + 48);   // a 16-char key + JS object/Set overhead, conservatively
  console.log(dim(`
  Compare: a Set of ${N.toLocaleString()} 16-char keys is roughly ${kb(setBytes)} (~${(setBytes / 1024 / 1024).toFixed(0)} MB).
`));
  console.log(`  ⭐ ${ok(`${(setBytes / bf.bits.length).toFixed(0)}x less memory`)}, and it does NOT grow with key LENGTH --`);
  console.log(`     a 2 KB URL costs the same ${(bf.m / N).toFixed(1)} bits as a 3-byte key.`);

  console.log('\n  inserting...');
  let t = Date.now();
  for (let i = 0; i < N; i++) bf.add(`user:${i}`);
  const insertMs = Date.now() - t;
  console.log(`      ${N.toLocaleString()} inserts in ${insertMs} ms  (${Math.round(N / (insertMs / 1000)).toLocaleString()}/s)`);
  console.log(`      bits set: ${ok((bf.fill() * 100).toFixed(1) + '%')} ${dim('<- optimal k targets ~50%')}`);

  // ------------------------------------------------------- NO FALSE NEGATIVES
  hr('PROPERTY 1 — NO FALSE NEGATIVES, EVER');

  let missing = 0;
  for (let i = 0; i < N; i += 97) if (!bf.has(`user:${i}`)) missing++;
  console.log(`
  Checked ${Math.ceil(N / 97).toLocaleString()} keys we definitely inserted.`);
  console.log(`      reported ABSENT: ${missing === 0 ? ok('0') : bad(missing)}`);
  console.log(ok(`
  ⭐ This is a GUARANTEE, not a probability. A "no" can be trusted absolutely,
     which is exactly what makes the structure useful as a pre-filter.`));

  // -------------------------------------------------------- MEASURE THE FP RATE
  hr('PROPERTY 2 — FALSE POSITIVES, MEASURED vs THEORY');

  const PROBES = 500_000;
  let fp = 0;
  for (let i = 0; i < PROBES; i++) if (bf.has(`absent:${i}`)) fp++;
  const measured = fp / PROBES;

  console.log(`
  Probed ${PROBES.toLocaleString()} keys that were NEVER inserted.
`);
  console.log(`      target (design)     ${(P * 100).toFixed(2)}%`);
  console.log(`      theory  (formula)   ${(bf.expectedFP() * 100).toFixed(2)}%`);
  console.log(`      ⭐ MEASURED          ${ok((measured * 100).toFixed(2) + '%')}   (${fp.toLocaleString()} of ${PROBES.toLocaleString()})`);
  console.log(dim(`
      Theory and measurement agree. That matters: it means you can SIZE a bloom
      filter on paper and trust the number in a design discussion.`));

  // --------------------------------------------------------- OVERFILL IT
  hr('⚠️ WHAT HAPPENS WHEN YOU UNDERSIZE IT');

  console.log(dim(`
  A bloom filter sized for n items and given 4n items does not "fill up" and
  start rejecting. It quietly degrades -- and it degrades FAST, because the FP
  rate is exponential in the load factor.
`));
  console.log(`  ${'items inserted'.padEnd(20)} ${'fill'.padEnd(9)} ${'FP rate'.padEnd(10)} `);
  console.log(dim('  ' + '-'.repeat(46)));

  const small = new BloomFilter(100_000, 0.01);
  let inserted = 0;
  for (const target of [50_000, 100_000, 200_000, 400_000, 800_000]) {
    for (; inserted < target; inserted++) small.add(`k:${inserted}`);
    let f = 0;
    for (let i = 0; i < 100_000; i++) if (small.has(`nope:${i}`)) f++;
    const rate = f / 100_000;
    const label = target === 100_000 ? '  <- designed for this' : '';
    const colour = rate > 0.05 ? bad : ok;
    console.log(`  ${(target.toLocaleString() + (target > 100_000 ? ` (${target / 100_000}x)` : '')).padEnd(20)} ` +
                `${(small.fill() * 100).toFixed(0) + '%'} `.padEnd(10) +
                `${colour((rate * 100).toFixed(1) + '%').padEnd(19)}${dim(label)}`);
  }

  console.log(bad(`
  ⭐ 8x overfilled and the filter says "yes" to almost everything -- it has
     become a very expensive function that returns true.

     ⚠️ AND NOTHING ERRORS. No exception, no metric, no alert. It just silently
        stops saving you any work, and your "cheap pre-filter" is now pure
        overhead on top of the expensive lookup it was meant to avoid.

     ⭐ SO: monitor the FILL RATIO, alert past ~50%, and have a plan for growth
        (rebuild bigger, or a SCALABLE bloom filter: a chain of filters with
        geometrically tightening error rates, adding a new one when the current
        one saturates).`));

  // ------------------------------------------------------------ THE POINT
  hr('WHAT IT IS ACTUALLY FOR');

  console.log(`
  ⭐ THE PATTERN: a cheap in-memory "no" in front of an expensive "maybe".

      cache/DB lookup     "is this key even in the DB?" -- skip the disk read.
                          ⭐ This is what stops CACHE PENETRATION: a flood of
                          requests for keys that DON'T EXIST sails straight
                          through your cache to the database. A bloom filter of
                          existing keys absorbs them. (Phase 5.)

      LSM-tree SSTables   ⭐ every real LSM engine (RocksDB, Cassandra, HBase)
                          keeps a bloom filter per SSTable so a point lookup
                          skips files that cannot contain the key. This is why
                          LSM reads aren't O(number of files). (Phase 3.)

      crawlers / dedupe   "have I seen this URL?" over billions of URLs

      CDN / proxy         "is this worth caching?" -- cache on second request,
                          the bloom filter remembers the first

      safe browsing       Chrome ships a bloom filter of malicious URLs: a "no"
                          is free and private; a "yes" triggers a server check

  ⭐ AND THE RULE FOR EVERY USE: a false positive must cost you WORK, never
     CORRECTNESS. "Do the expensive lookup unnecessarily" is fine.
     "Skip a required check" is a security bug.
`);

  console.log(dim(`  Variants worth naming:
    · counting bloom   -- 4-bit counters instead of bits, so DELETE works. 4x memory.
    · cuckoo filter    -- supports delete, better FP rate at high load, harder to size
    · scalable bloom   -- a chain of filters, grows without a rebuild
    · quotient filter  -- cache-friendlier, mergeable
`));

  hr('YOUR RESULTS — copy these into ../README.md');
  console.log(`
      memory for 1M @ 1%      ${kb(bf.bits.length)}   (${(bf.m / N).toFixed(1)} bits/item, k=${bf.k})
      false negatives          ${missing}
      measured FP rate         ${(measured * 100).toFixed(2)}%   (theory ${(bf.expectedFP() * 100).toFixed(2)}%)
      insert throughput        ${Math.round(N / (insertMs / 1000)).toLocaleString()}/s
`);
})();
