'use strict';
/**
 * THE 45-MINUTE DRILL TIMER. No dependencies.
 *
 *   node drill.js                      a 45-minute session, random problem
 *   node drill.js "design Uber"        a 45-minute session, your problem
 *   node drill.js --list               show the problem bank
 *   node drill.js --speed 60           run 60x fast, to see the whole shape (~45s)
 *   node drill.js --silent             no beat announcements, just the timer
 *
 * ⭐ WHY THIS EXISTS: the roadmap's Phase 11 lab is "record yourself doing a
 *    45-minute design out loud, alone." The hardest part of doing that is not
 *    the design -- it is KEEPING TO THE BEATS. Almost everyone spends 20 minutes
 *    on architecture and then discovers they never did capacity, never named a
 *    shard key, and never got to failure modes.
 *
 * ⭐ So this calls the beats at you, out loud on the terminal, with the time
 *    remaining. Run it beside your recording. After a handful of sessions the
 *    pacing becomes internal and you can stop using it -- ⭐ which is the point.
 */

const BEATS = [
  { min: 0,  len: 7,  name: 'REQUIREMENTS & SCOPE',
    prompts: [
      '3-5 CORE features. Say them.',
      '⭐ EXPLICITLY DEFER the rest -- "I\'ll leave X out of scope unless you\'d like it"',
      'Scale: DAU/MAU, QPS, read:write ratio, data size, growth',
      'Non-functional: latency target, availability target, consistency, durability',
      'Constraints: mobile? global? regulatory? existing stack?',
      '⭐ WRITE THE AGREED SCOPE IN A CORNER OF THE BOARD. Refer back to it.',
    ] },
  { min: 7,  len: 4,  name: 'CAPACITY ESTIMATION',
    prompts: [
      'QPS average AND peak (peak is usually 2-10x)',
      'Storage per year. Bandwidth. Memory for cache.',
      '⭐ ROUND AGGRESSIVELY and state assumptions out loud',
      '⭐ You must USE these numbers later -- an estimate you never reference was theatre',
    ] },
  { min: 11, len: 4,  name: 'API DESIGN',
    prompts: [
      '3-5 core endpoints or events, with signatures',
      'Pagination? Idempotency key on writes?',
      '⭐ This often exposes a requirement gap -- if it does, go back and say so',
    ] },
  { min: 15, len: 5,  name: 'DATA MODEL',
    prompts: [
      'Entities and relationships',
      '⭐ DATASTORE CHOICE, WITH A REASON ("Cassandra BECAUSE write-heavy, time-series, tolerates eventual consistency")',
      '⭐ SHARD KEY, WITH A REASON. Say what gets hot if you choose wrong.',
      'Key access patterns -- and check they match the shard key',
      '⭐ SENIORS ARE JUDGED HARD HERE. Do not rush it.',
    ] },
  { min: 20, len: 10, name: 'HIGH-LEVEL ARCHITECTURE',
    prompts: [
      'Client -> edge/CDN -> LB -> services -> cache -> DB -> workers -> stream',
      'Draw left to right. Leave room. Keep it legible.',
      '⭐ NOW WALK ONE WRITE PATH END TO END, out loud',
      '⭐ THEN ONE READ PATH END TO END',
      'Numbers on the diagram: QPS on arrows, size on datastores',
    ] },
  { min: 30, len: 8,  name: 'DEEP DIVE',
    prompts: [
      '⭐ OFFER a candidate: "The interesting problem here is X -- shall I go deep there?"',
      '⭐ Offering a GOOD candidate is itself a strong signal',
      'Go to actual mechanism: the algorithm, the data structure, the failure case',
      'Cite a number you measured in an earlier phase if one fits',
    ] },
  { min: 38, len: 5,  name: 'BOTTLENECKS, FAILURES & SCALE-UP',
    prompts: [
      '⭐ VOLUNTEER THIS. Do not wait to be asked. This is THE senior differentiator.',
      'For every box: what happens when it DIES? when it is SLOW? when it is OVERLOADED?',
      'Single points of failure. Hot spots. What breaks FIRST at 10x?',
      'Monitoring and alerting. ⭐ COST and operational burden.',
      '⭐ Auth story if you have not given one yet (Phase 10)',
    ] },
  { min: 43, len: 2,  name: 'WRAP',
    prompts: [
      'Recap the design in 30 seconds',
      '⭐ NAME THE TOP 2 TRADEOFFS YOU MADE',
      '⭐ What you would revisit with more time',
    ] },
];

const PROBLEMS = [
  'Design a URL shortener',
  'Design Pastebin',
  'Design a rate limiter as a service',
  'Design a web crawler',
  'Design Twitter / a social feed',
  'Design WhatsApp / a chat system',
  'Design Instagram',
  'Design Dropbox / Google Drive',
  'Design YouTube / Netflix',
  'Design Uber / Lyft',
  'Design Google Maps',
  'Design a notification system',
  'Design a distributed job scheduler',
  'Design a payment system',
  'Design Ticketmaster (flash sale, no overselling)',
  'Design a search autocomplete service',
  'Design a distributed key-value store',
  'Design a stock exchange / order book',
  'Design a food delivery system',
  'Design an ad click aggregator',
  'Design a collaborative document editor',
  'Design a metrics/monitoring system',
  'Design a hotel booking system',
  'Design a leaderboard',
  'Design an S3-like object store',
];

// --------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : (argv[i + 1] ?? true); };
const has  = (n) => argv.includes(n);

const SPEED  = Number(flag('--speed', 1));
const SILENT = has('--silent');
const problemArg = argv.filter((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--speed')[0];

const ok  = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const cy  = (s) => `\x1b[36m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold= (s) => `\x1b[1m${s}\x1b[0m`;

if (has('--list')) {
  console.log('\n  THE PROBLEM BANK\n');
  PROBLEMS.forEach((p, i) => console.log(`   ${String(i + 1).padStart(2)}. ${p}`));
  console.log(dim('\n  (Phase 12 is the real practice phase -- these are here so you never\n   lose 5 minutes choosing a problem.)\n'));
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms / SPEED));
const mmss  = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// A deterministic-ish pick that still varies run to run.
const problem = problemArg || PROBLEMS[Math.floor((Date.now() / 1000) % PROBLEMS.length)];

(async function main() {
  console.log('\n' + '='.repeat(72));
  console.log(bold(`  ${problem.toUpperCase()}`));
  console.log('='.repeat(72));
  console.log(`
  ${bold('45 minutes. Out loud. Recording on. Nothing looked up.')}

  ${dim('The beats, and what each is worth:')}
`);
  for (const b of BEATS) {
    console.log(`   ${dim(mmss(b.min * 60).padEnd(7))}${b.name.padEnd(36)}${dim(`${b.len} min`)}`);
  }
  if (SPEED !== 1) console.log(bad(`\n  ⚡ running at ${SPEED}x speed -- this is a dry run, not a real session`));
  console.log(dim(`
  ⭐ The single most common failure is jumping to architecture before
     requirements. The second is running out of time before failure modes.
     This timer exists to stop both.
`));

  console.log(dim('  starting in 5...\n'));
  await sleep(5000);

  const t0 = Date.now();
  const elapsed = () => ((Date.now() - t0) / 1000) * SPEED;

  for (let i = 0; i < BEATS.length; i++) {
    const b = BEATS[i];
    const endAt = (b.min + b.len) * 60;

    console.log('\n' + cy('─'.repeat(72)));
    console.log(cy(bold(`  ▶ ${b.name}`)) + dim(`   ${b.len} min   (ends ${mmss(endAt)})`));
    console.log(cy('─'.repeat(72)));
    if (!SILENT) for (const p of b.prompts) console.log(`     · ${p}`);
    console.log();

    // Tick until this beat ends, warning near the end.
    let warned = false;
    while (elapsed() < endAt) {
      const left = endAt - elapsed();
      if (!warned && left <= 60 && b.len > 2) {
        console.log(bad(`     ⏰ 1 minute left in ${b.name} -- start closing it out`));
        warned = true;
      }
      // ⚠️ Only draw the live ticker on a real terminal -- a \r-updated line
      //    piped to a file becomes thousands of lines of noise.
      if (process.stdout.isTTY) {
        process.stdout.write(`\r     ${dim(`elapsed ${mmss(elapsed())}   ·   ${mmss(left)} left in this beat`)}   `);
      }
      await sleep(1000);
    }
    if (process.stdout.isTTY) process.stdout.write('\r' + ' '.repeat(70) + '\r');
    console.log(ok(`     ✔ ${b.name} done at ${mmss(elapsed())}`));
  }

  console.log('\n' + '='.repeat(72));
  console.log(bold('  TIME. Stop talking.'));
  console.log('='.repeat(72));
  console.log(`
  ${bold('Now, before you watch the recording, answer these from memory:')}

   1. Did you write the scope down and refer back to it?
   2. Did you USE your capacity numbers later, or were they theatre?
   3. Did you name a shard key AND a reason?
   4. Did you walk a write path and a read path OUT LOUD?
   5. Did you VOLUNTEER failure modes, or wait?
   6. Did you give a "because" for every technology you named?
   7. Did you go silent at any point? When?
   8. Did you commit to a recommendation, or hedge?

  ${bold('Then watch it back with')} ${cy('./SELF-REVIEW.md')} ${bold('open, and score it.')}

  ${dim('It will be unpleasant. The roadmap: "the fastest improvement you will get')}
  ${dim('from any single hour in this roadmap." Repeat every two weeks.')}
`);
})();
