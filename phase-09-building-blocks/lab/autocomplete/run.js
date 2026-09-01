'use strict';
/**
 * TOP-K-PER-PREFIX AUTOCOMPLETE, from scratch. No dependencies.
 *
 *   node autocomplete/run.js
 *
 * ⭐ THE PROBLEM: a user types "res" and you must return the 5 best completions
 *    in UNDER ~50 ms, at every keystroke, for millions of users.
 *
 * The naive approach -- walk to the prefix node, collect every completion below
 * it, sort by score, take 5 -- is correct and FAR too slow, because a 1-character
 * prefix has a subtree containing a large fraction of your entire corpus.
 *
 * ⭐ THE FIX: PRECOMPUTE the top-K at EVERY node, at build time. A query then
 *    becomes "walk P characters, return a stored array" -- O(prefix length),
 *    completely independent of corpus size.
 *
 * ⭐ THAT TRADE -- pay at write time so reads are trivial -- is the single most
 *    reused idea in this phase. It is Phase 8's CQRS, it is fan-out-on-write,
 *    it is a materialised view. Same instinct, three names.
 *
 * This file builds both and MEASURES the difference.
 */

const hr  = (t) => { console.log('\n' + '='.repeat(74)); console.log('  ' + t); console.log('='.repeat(74)); };
const ok  = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const K = 5;

// A seeded PRNG so every run of this lab produces the same numbers.
let _s = 12345;
const rnd = () => (_s = (_s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// ===========================================================================
//  THE TRIE
// ===========================================================================
class Node {
  constructor() {
    this.children = new Map();   // char -> Node
    this.score = 0;              // >0 means a complete term ends here
    this.top = null;             // ⭐ the precomputed top-K for this prefix
  }
}

class Autocomplete {
  constructor() { this.root = new Node(); this.nodes = 1; this.terms = 0; }

  /** Insert a term with a popularity score (search frequency, CTR, whatever). */
  insert(term, score) {
    let n = this.root;
    for (const ch of term) {
      let next = n.children.get(ch);
      if (!next) { next = new Node(); n.children.set(ch, next); this.nodes++; }
      n = next;
    }
    n.score = score;
    this.terms++;
  }

  _walk(prefix) {
    let n = this.root;
    for (const ch of prefix) {
      n = n.children.get(ch);
      if (!n) return null;
    }
    return n;
  }

  /**
   * ⚠️ THE NAIVE QUERY: walk to the prefix, then DFS the ENTIRE subtree,
   *    collect every term, sort, slice. Correct. Unusably slow for short
   *    prefixes -- and short prefixes are the common case, because the user
   *    types them FIRST and on EVERY search.
   */
  queryNaive(prefix) {
    const start = this._walk(prefix);
    if (!start) return [];
    const found = [];
    (function dfs(n, suffix) {
      if (n.score > 0) found.push([prefix + suffix, n.score]);
      for (const [ch, child] of n.children) dfs(child, suffix + ch);
    })(start, '');
    found.sort((a, b) => b[1] - a[1]);
    return found.slice(0, K);
  }

  /**
   * ⭐ THE PRECOMPUTE. One post-order pass: each node's top-K is the merge of
   *    its own term (if any) with its children's already-computed top-Ks.
   *
   *    ⭐ Because each child contributes AT MOST K entries, the merge at a node
   *       is O(children * K), NOT O(subtree). The whole build is therefore
   *       O(nodes * K) -- linear -- even though it answers a query that would
   *       otherwise scan a subtree.
   */
  build() {
    const visit = (n, path) => {
      const cand = [];
      if (n.score > 0) cand.push([path, n.score]);
      for (const [ch, child] of n.children) {
        visit(child, path + ch);
        for (const entry of child.top) cand.push(entry);
      }
      cand.sort((a, b) => b[1] - a[1]);
      n.top = cand.slice(0, K);          // ⭐ K entries per node, and no more
    };
    visit(this.root, '');
  }

  /** ⭐ O(prefix length). Corpus size does not appear in the cost. */
  queryFast(prefix) {
    const n = this._walk(prefix);
    return n ? n.top : [];
  }

  /** Rough memory accounting for the precomputed arrays. */
  topKEntries() {
    let total = 0;
    (function count(n) { total += n.top ? n.top.length : 0; for (const c of n.children.values()) count(c); })(this.root);
    return total;
  }
}

// ===========================================================================
//  A CORPUS with a realistic (Zipf-ish) popularity distribution
// ===========================================================================
function buildCorpus(size) {
  const a = ['re', 'sea', 'best', 'how', 'cheap', 'new', 'old', 'top', 'buy', 'free', 'the', 'my', 'is', 'can', 'we'];
  const b = ['staurant', 'rch', 'sult', 'view', 'cipe', 'pair', 'nt', 'turn', 'mote', 'gister', 'port', 'quest', 'set', 'lease'];
  const c = ['', ' near me', ' online', ' 2026', ' reviews', ' cheap', ' delivery', ' open now', ' uk', ' app', ' login', ' price'];

  const terms = new Map();
  let i = 0;
  while (terms.size < size) {
    const t = a[Math.floor(rnd() * a.length)] + b[Math.floor(rnd() * b.length)] +
              c[Math.floor(rnd() * c.length)] + (i % 7 === 0 ? '' : ` ${i.toString(36)}`);
    // ⭐ Zipf: a few terms are enormously more popular than the rest. Real query
    //    logs look like this, and it's WHY top-K is small and stable.
    if (!terms.has(t)) terms.set(t, Math.floor(1e6 / (terms.size + 1)) + Math.floor(rnd() * 100));
    i++;
  }
  return terms;
}

const pct = (arr, p) => arr.slice().sort((x, y) => x - y)[Math.floor(arr.length * p)];

// ===========================================================================
(function main() {

  hr('BUILDING THE TRIE');

  const SIZE = 200_000;
  const corpus = buildCorpus(SIZE);
  const ac = new Autocomplete();

  let t = Date.now();
  for (const [term, score] of corpus) ac.insert(term, score);
  const insertMs = Date.now() - t;

  console.log(`
      terms                 ${ac.terms.toLocaleString()}`);
  console.log(`      trie nodes            ${ac.nodes.toLocaleString()}   ${dim(`(${(ac.nodes / ac.terms).toFixed(1)} per term -- shared prefixes are the compression)`)}`);
  console.log(`      insert time           ${insertMs} ms`);

  t = Date.now();
  ac.build();
  const buildMs = Date.now() - t;
  console.log(`      ⭐ precompute top-${K}   ${buildMs} ms  ${dim(`(${ac.topKEntries().toLocaleString()} stored entries)`)}`);

  // ------------------------------------------------------------- CORRECTNESS
  hr('CORRECTNESS — the fast path returns exactly what the slow path does');

  const checks = ['r', 're', 'res', 'sea', 'best', 'how', 'buy', 'chea', 'zzz'];
  let mismatches = 0;
  for (const p of checks) {
    const slow = JSON.stringify(ac.queryNaive(p));
    const fast = JSON.stringify(ac.queryFast(p));
    if (slow !== fast) { mismatches++; console.log(bad(`      MISMATCH on "${p}"`)); }
  }
  console.log(`\n      ${checks.length} prefixes checked, mismatches: ${mismatches === 0 ? ok('0') : bad(mismatches)}`);

  console.log(dim(`\n      what "res" returns:`));
  for (const [term, score] of ac.queryFast('res')) {
    console.log(`         ${term.padEnd(34)} ${dim(score.toLocaleString())}`);
  }

  // --------------------------------------------------------------- THE SPEED
  hr('⭐ THE MEASUREMENT — naive vs precomputed');

  const prefixes = [];
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  for (const ch of alphabet) prefixes.push(ch);
  for (let i = 0; i < 200; i++) {
    const term = [...corpus.keys()][Math.floor(rnd() * SIZE)];
    prefixes.push(term.slice(0, 1 + Math.floor(rnd() * 4)));
  }

  const naiveTimes = [], fastTimes = [];
  for (const p of prefixes) {
    let s = process.hrtime.bigint(); ac.queryNaive(p); naiveTimes.push(Number(process.hrtime.bigint() - s) / 1e6);
    s = process.hrtime.bigint();     ac.queryFast(p);  fastTimes.push(Number(process.hrtime.bigint() - s) / 1e6);
  }

  const nP50 = pct(naiveTimes, 0.5), nP99 = pct(naiveTimes, 0.99);
  const fP50 = pct(fastTimes, 0.5),  fP99 = pct(fastTimes, 0.99);

  console.log(`
      ${''.padEnd(16)}${'p50'.padEnd(14)}${'p99'.padEnd(14)}`);
  console.log(dim('      ' + '-'.repeat(44)));
  console.log(`      ${'naive DFS'.padEnd(16)}${bad(nP50.toFixed(3) + ' ms').padEnd(23)}${bad(nP99.toFixed(3) + ' ms')}`);
  console.log(`      ${'precomputed'.padEnd(16)}${ok(fP50.toFixed(4) + ' ms').padEnd(23)}${ok(fP99.toFixed(4) + ' ms')}`);
  console.log(`\n      ⭐ ${ok(`${(nP99 / fP99).toFixed(0)}x faster at p99`)}, and ${ok(`${(nP50 / fP50).toFixed(0)}x at p50`)}`);

  // The worst case, isolated -- this is the one that matters.
  const single = ac.queryNaive.bind(ac);
  let s = process.hrtime.bigint(); single('r'); const naiveOne = Number(process.hrtime.bigint() - s) / 1e6;
  s = process.hrtime.bigint(); ac.queryFast('r'); const fastOne = Number(process.hrtime.bigint() - s) / 1e6;

  console.log(bad(`
      ⭐ AND THE WORST CASE IS THE COMMON CASE. A single-character prefix "r":

           naive        ${naiveOne.toFixed(3)} ms   (walks a huge subtree)
           precomputed  ${fastOne.toFixed(4)} ms   (${(naiveOne / fastOne).toFixed(0)}x)

         The user types "r" FIRST, on EVERY search. The naive structure is
         slowest exactly when it is hit most.`));

  console.log(dim(`
      ⚠️ Note the naive cost SCALES WITH THE CORPUS and the precomputed cost
         does not. At 2M terms the gap is ten times wider. That is the real
         argument -- not the constant factor, but the different complexity
         class: O(subtree) vs O(prefix length).`));

  // ---------------------------------------------------------- WHAT IT COSTS
  hr('WHAT THE PRECOMPUTATION COSTS');

  console.log(`
      stored top-K entries   ${ac.topKEntries().toLocaleString()}   ${dim(`(<= ${K} per node x ${ac.nodes.toLocaleString()} nodes)`)}`);
  console.log(`      build time             ${buildMs} ms for ${ac.terms.toLocaleString()} terms`);
  console.log(bad(`
      ⚠️ AND THE REAL COST IS NOT MEMORY -- IT IS UPDATES.

         Changing ONE term's score can change the stored top-K of EVERY node on
         its root path. A trending query has to propagate upward, and a term
         that falls out of the top-5 somewhere is not detectable locally.

      ⭐ SO NOBODY UPDATES IN PLACE. In production you REBUILD PERIODICALLY:

           · rebuild the whole trie from the query log every N minutes/hours
           · ship it as an immutable artifact and swap it atomically
             (⭐ exactly the alias-swap trick a search index uses -- see the
              search note -- and the same shape as a rebuildable projection)
           · serve fresh-but-not-live results, which for autocomplete is FINE

      ⭐ THAT IS THE ANSWER TO "how do you handle a newly trending query?":
         you don't patch the trie -- you shorten the rebuild interval, and you
         merge a small, live, in-memory "recent/trending" list at query time.`));

  // ------------------------------------------------------------ AT SCALE
  hr('THE REST OF THE DESIGN — what an interviewer will push on');

  console.log(`
  ⭐ SHARDING           the trie doesn't fit on one box at web scale.
                        ⚠️ Shard BY PREFIX (all of "re*" on one node), not by
                        hash -- a hash shard would require querying every node
                        for every keystroke. Prefix sharding keeps one keystroke
                        = one node. ⚠️ Watch the hot shard ("a*" vs "z*").

  ⭐ CACHING            the head of a Zipf distribution is tiny. Cache the top
                        few thousand prefixes at the EDGE/CDN and most keystrokes
                        never reach your service at all.

  ⭐ DEBOUNCING         ~50-150 ms client-side. ⭐ This is the cheapest scaling
                        lever you have -- it deletes most of the traffic before
                        it exists, and users cannot tell.

     PERSONALISATION    merge a small per-user history list with the global
                        top-K at query time. ⚠️ Don't build a trie per user.

     TYPOS              a trie gives you PREFIX matching only. Fuzzy needs
                        edit-distance walking (bounded Levenshtein over the
                        trie), an n-gram index, or a spell-corrector in front.

     RANKING            frequency is the baseline. Real systems blend recency,
                        CTR, session context, and location.

     FRESHNESS          rebuild cadence, plus the live trending merge above.

  ⚠️ SAFETY             an autocomplete surfaces whatever people type. You need
                        a blocklist and a policy layer -- this has caused real
                        public incidents for every major search engine.
`);

  console.log(dim(`  Alternatives worth naming:
    · a plain sorted list + binary search on prefix range -- simpler, great up
      to surprisingly large corpora, and it's what most teams should start with
    · Elasticsearch completion suggester (an FST -- more compact than a trie)
    · Redis sorted set per prefix (ZRANGEBYLEX) -- easy, cheap, distributed
    · a DAWG/FST, which shares SUFFIXES too, not just prefixes
`));

  hr('YOUR RESULTS — copy these into ../README.md');
  console.log(`
      terms / trie nodes       ${ac.terms.toLocaleString()} / ${ac.nodes.toLocaleString()}
      precompute time          ${buildMs} ms
      naive      p50 / p99     ${nP50.toFixed(3)} ms / ${nP99.toFixed(3)} ms
      precomputed p50 / p99    ${fP50.toFixed(4)} ms / ${fP99.toFixed(4)} ms
      ⭐ speed-up at p99        ${(nP99 / fP99).toFixed(0)}x
      single-char prefix "r"   ${naiveOne.toFixed(3)} ms -> ${fastOne.toFixed(4)} ms  (${(naiveOne / fastOne).toFixed(0)}x)
`);
})();
