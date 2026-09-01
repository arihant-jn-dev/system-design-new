'use strict';
/**
 * Consistent hashing, from scratch. ~50 lines of actual algorithm.
 *
 *   node hashing.js
 *
 * No dependencies, no Docker. Just run it.
 *
 * It answers the question the roadmap asks: when you add a node, how many keys
 * MOVE? Modulo hashing moves almost all of them (which is why adding a cache
 * node can take down your database). Consistent hashing moves ~1/N.
 */

// ---------------------------------------------------------------- hash fn
//
// MurmurHash3 (32-bit). Fast, non-cryptographic, and — critically — it has
// good AVALANCHE: flipping one input bit changes ~half the output bits.
//
// That property is not optional here. Our ring keys are `nodeA#0`, `nodeA#1`,
// ... `nodeA#149` — near-identical strings differing only in the last chars.
// A hash with weak avalanche maps them to CLUSTERED positions, so the vnodes
// pile up in one region of the ring instead of spreading around it, and you
// get bad distribution no matter how many vnodes you add.
//
// Measured on this exact workload (5 nodes × 150 vnodes, arc ownership spread):
//     FNV-1a     74.7%      <- clusters; too weak for ring positions
//     MurmurHash3 22.5%     <- matches the theoretical 1/sqrt(V) prediction
//
// Do NOT use a language's built-in hashCode — often poorly distributed, and in
// some runtimes randomised per process, which gives a DIFFERENT RING on every
// machine. That is a genuinely nasty bug: each server routes the same key
// somewhere else.
function murmur3(key, seed = 0) {
  let h = seed >>> 0;
  const len = key.length;
  const nblocks = len & ~3;
  let i = 0;

  for (; i < nblocks; i += 4) {
    let k =
      (key.charCodeAt(i) & 0xff) |
      ((key.charCodeAt(i + 1) & 0xff) << 8) |
      ((key.charCodeAt(i + 2) & 0xff) << 16) |
      ((key.charCodeAt(i + 3) & 0xff) << 24);
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }

  let k1 = 0;
  switch (len & 3) {
    case 3:
      k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
    // falls through
    case 2:
      k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
    // falls through
    case 1:
      k1 ^= key.charCodeAt(i) & 0xff;
      k1 = Math.imul(k1, 0xcc9e2d51);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, 0x1b873593);
      h ^= k1;
  }

  // finalisation mix — this is where the avalanche comes from
  h ^= len;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const hash32 = murmur3;

// ------------------------------------------------------- consistent hashing

class ConsistentHash {
  constructor(nodes = [], vnodes = 150) {
    this.vnodes = vnodes;
    this.ring = []; // sorted array of { hash, node }
    for (const n of nodes) this.addNode(n);
  }

  addNode(node) {
    for (let i = 0; i < this.vnodes; i++) {
      this.ring.push({ hash: hash32(`${node}#${i}`), node });
    }
    this.ring.sort((a, b) => a.hash - b.hash);
  }

  removeNode(node) {
    this.ring = this.ring.filter((e) => e.node !== node);
  }

  /** First node clockwise from hash(key), wrapping around the circle. */
  getNode(key) {
    if (this.ring.length === 0) return null;
    const h = hash32(key);

    // Past the last entry? Wrap to the first -- that's what makes it a ring.
    if (h > this.ring[this.ring.length - 1].hash) return this.ring[0].node;

    // Binary search for the first entry with hash >= h.
    let lo = 0;
    let hi = this.ring.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.ring[mid].hash < h) lo = mid + 1;
      else hi = mid;
    }
    return this.ring[lo].node;
  }

  /**
   * R replicas: walk clockwise collecting DISTINCT PHYSICAL nodes.
   * "Distinct physical" matters -- with vnodes the next few ring entries may
   * all belong to the same machine, which would put every replica on one box.
   */
  getNodes(key, r) {
    if (this.ring.length === 0) return [];
    const h = hash32(key);
    let idx = this.ring.findIndex((e) => e.hash >= h);
    if (idx === -1) idx = 0;

    const out = [];
    for (let i = 0; i < this.ring.length && out.length < r; i++) {
      const node = this.ring[(idx + i) % this.ring.length].node;
      if (!out.includes(node)) out.push(node);
    }
    return out;
  }
}

// --------------------------------------------------------- modulo (control)

class ModuloHash {
  constructor(nodes = []) {
    this.nodes = [...nodes];
  }
  addNode(node) {
    this.nodes.push(node);
  }
  removeNode(node) {
    this.nodes = this.nodes.filter((n) => n !== node);
  }
  getNode(key) {
    if (this.nodes.length === 0) return null;
    return this.nodes[hash32(key) % this.nodes.length];
  }
}

// ------------------------------------------------------------------ harness

const KEYS = Array.from({ length: 100_000 }, (_, i) => `user:${i}`);
const pct = (n) => `${(n * 100).toFixed(1)}%`;
const bar = (frac, width = 40) => '█'.repeat(Math.round(frac * width)).padEnd(width, '·');

function assign(ring) {
  const m = new Map();
  for (const k of KEYS) m.set(k, ring.getNode(k));
  return m;
}

function moved(before, after) {
  let n = 0;
  for (const [k, v] of before) if (after.get(k) !== v) n++;
  return n / before.size;
}

function distribution(assignment, nodes) {
  const counts = Object.fromEntries(nodes.map((n) => [n, 0]));
  for (const v of assignment.values()) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

function printDistribution(title, counts, total) {
  console.log(`\n  ${title}`);
  const values = Object.values(counts);
  const ideal = total / values.length;
  for (const [node, c] of Object.entries(counts)) {
    const dev = ((c - ideal) / ideal) * 100;
    console.log(
      `    ${node.padEnd(8)} ${bar(c / total)} ${String(c).padStart(7)}  ${pct(c / total).padStart(6)}  ` +
        `(${dev >= 0 ? '+' : ''}${dev.toFixed(1)}% vs ideal)`,
    );
  }
  const spread = (Math.max(...values) - Math.min(...values)) / ideal;
  console.log(`    spread (max-min)/ideal: ${pct(spread)}`);
}

// ============================================================== EXPERIMENT 1
console.log('\n' + '='.repeat(78));
console.log('  EXPERIMENT 1 — adding a node: how many keys MOVE?');
console.log('='.repeat(78));
console.log(`  ${KEYS.length.toLocaleString()} keys, 3 nodes -> 4 nodes\n`);

{
  const nodes3 = ['nodeA', 'nodeB', 'nodeC'];

  const mod = new ModuloHash(nodes3);
  const modBefore = assign(mod);
  mod.addNode('nodeD');
  const modAfter = assign(mod);
  const modMoved = moved(modBefore, modAfter);

  const ch = new ConsistentHash(nodes3, 150);
  const chBefore = assign(ch);
  ch.addNode('nodeD');
  const chAfter = assign(ch);
  const chMoved = moved(chBefore, chAfter);

  console.log(`  modulo  hash(key) %% N     keys moved: ${bar(modMoved)} ${pct(modMoved)}`);
  console.log(`  consistent hashing        keys moved: ${bar(chMoved)} ${pct(chMoved)}`);
  console.log(`\n  theoretical minimum (1/N with N=4): ${pct(0.25)}`);
  console.log(`  modulo moved ${(modMoved / chMoved).toFixed(1)}x more keys than necessary.`);
  console.log(
    '\n  If these were CACHE keys, the modulo row is an outage: ~%s of your cache\n' +
      '  misses at once and every one of those requests hits the database.',
    pct(modMoved),
  );
}

// ============================================================== EXPERIMENT 2
console.log('\n' + '='.repeat(78));
console.log('  EXPERIMENT 2 — it gets WORSE with more nodes (modulo), not better');
console.log('='.repeat(78));
console.log('\n  nodes N -> N+1        modulo moved      consistent moved     ideal (1/(N+1))');
console.log('  ' + '-'.repeat(74));

for (const n of [3, 5, 10, 20, 50]) {
  const nodes = Array.from({ length: n }, (_, i) => `node${i}`);

  const mod = new ModuloHash(nodes);
  const mb = assign(mod);
  mod.addNode(`node${n}`);
  const modMoved = moved(mb, assign(mod));

  const ch = new ConsistentHash(nodes, 150);
  const cb = assign(ch);
  ch.addNode(`node${n}`);
  const chMoved = moved(cb, assign(ch));

  console.log(
    `  ${String(n).padStart(3)} -> ${String(n + 1).padEnd(14)}` +
      `${pct(modMoved).padStart(10)}${pct(chMoved).padStart(20)}${pct(1 / (n + 1)).padStart(20)}`,
  );
}
console.log(
  '\n  Modulo approaches 100%% as the cluster grows -- the BIGGER your cluster,\n' +
    '  the more catastrophic adding one node becomes. Consistent hashing tracks 1/N.',
);

// ============================================================== EXPERIMENT 3
console.log('\n' + '='.repeat(78));
console.log('  EXPERIMENT 3 — what virtual nodes actually do');
console.log('='.repeat(78));
console.log('\n  Distribution across 5 nodes, varying vnodes per node:');

const nodes5 = ['nodeA', 'nodeB', 'nodeC', 'nodeD', 'nodeE'];
for (const v of [1, 10, 150]) {
  const ch = new ConsistentHash(nodes5, v);
  printDistribution(`${v} vnode${v > 1 ? 's' : ''} per node`, distribution(assign(ch), nodes5), KEYS.length);
}
console.log(
  '\n  With 1 vnode the arcs are random and wildly uneven -- one node can own\n' +
    '  several times its fair share.\n' +
    '\n  But note 150 vnodes does NOT give perfect balance either: expect ~8% std\n' +
    '  dev, ~20% max-min spread. The rule is  std dev ~ 1/sqrt(V)  -- a SLOW\n' +
    '  function. 10x the vnodes buys only ~3x the evenness. If you need tighter\n' +
    '  balance than this, change algorithm (rendezvous/Maglev), not vnode count.',
);

// ============================================================== EXPERIMENT 4
console.log('\n' + '='.repeat(78));
console.log('  EXPERIMENT 4 — removing a node: where does its load GO?');
console.log('='.repeat(78));

{
  const ch = new ConsistentHash(nodes5, 150);
  const before = assign(ch);
  const beforeCounts = distribution(before, nodes5);

  ch.removeNode('nodeC');
  const after = assign(ch);
  const survivors = nodes5.filter((n) => n !== 'nodeC');
  const afterCounts = distribution(after, survivors);

  console.log(`\n  nodeC held ${beforeCounts.nodeC.toLocaleString()} keys. After removing it:\n`);
  for (const n of survivors) {
    const gained = afterCounts[n] - beforeCounts[n];
    const shareOfOrphans = gained / beforeCounts.nodeC;
    console.log(
      `    ${n.padEnd(8)} gained ${String(gained).padStart(6)} keys  ` +
        `(${pct(shareOfOrphans)} of nodeC's orphans)`,
    );
  }
  console.log(
    "\n  nodeC's keys spread ACROSS ALL survivors, roughly evenly. That is the\n" +
      '  second thing vnodes buy you: with 1 vnode per node, a single successor\n' +
      "  would inherit nodeC's ENTIRE arc and could fall over from the load spike.",
  );
  console.log(`\n  Total keys moved: ${pct(moved(before, after))} (ideal for removing 1 of 5 = ${pct(0.2)})`);
}

// ============================================================== EXPERIMENT 5
console.log('\n' + '='.repeat(78));
console.log('  EXPERIMENT 5 — replica placement (how Dynamo/Cassandra do it)');
console.log('='.repeat(78));
{
  const ch = new ConsistentHash(nodes5, 150);
  console.log('\n  Each key -> 3 distinct physical nodes, walking clockwise:\n');
  for (const key of ['user:1', 'user:42', 'user:99999', 'session:abc']) {
    console.log(`    ${key.padEnd(14)} -> ${ch.getNodes(key, 3).join(', ')}`);
  }
  console.log(
    '\n  Note they are DISTINCT PHYSICAL nodes, not just the next 3 ring entries --\n' +
      '  with 150 vnodes each, consecutive entries often belong to the same machine.\n' +
      '  Getting this wrong puts all 3 "replicas" on one box.',
  );
}

console.log('\n  -> record these in ../RESULTS.md\n');

module.exports = { ConsistentHash, ModuloHash, murmur3 };
