'use strict';
/**
 * WHY YOU DO NOT HASH PASSWORDS WITH SHA-256 — measured.
 *
 *   node password-hashing/run.js
 *
 * ⭐ "Use bcrypt, not SHA" is repeated everywhere and almost never quantified.
 *    The whole argument is an ECONOMIC one, and it collapses into one number:
 *
 *        ⭐ HOW MANY GUESSES PER SECOND CAN AN ATTACKER MAKE?
 *
 *    A general-purpose hash is designed to be FAST. That is a virtue for
 *    checksums and a catastrophe for passwords, because the attacker gets the
 *    same speed you do -- and they have your entire user table.
 *
 * Node ships scrypt and pbkdf2 built in, so this needs no dependencies.
 * (bcrypt and argon2 are the other two you should name; same idea, and argon2id
 *  is the current recommendation.)
 */

const crypto = require('crypto');

const hr  = (t) => { console.log('\n' + '='.repeat(74)); console.log('  ' + t); console.log('='.repeat(74)); };
const ok  = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const PASSWORD = 'correct-horse-battery-staple';
const salt = crypto.randomBytes(16);

/** Time a function by running it until at least `minMs` has elapsed. */
function bench(fn, minMs = 700) {
  // warm up
  for (let i = 0; i < 3; i++) fn(i);
  let n = 0;
  const t0 = process.hrtime.bigint();
  while (Number(process.hrtime.bigint() - t0) / 1e6 < minMs) { fn(n); n++; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { perSec: n / (ms / 1000), msEach: ms / n };
}

const human = (n) => {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toFixed(1);
};

const duration = (sec) => {
  if (sec < 0.001) return `${(sec * 1e6).toFixed(0)} MICROseconds`;
  if (sec < 1) return `${(sec * 1000).toFixed(1)} MILLIseconds`;
  if (sec < 60) return `${sec.toFixed(1)} seconds`;
  if (sec < 3600) return `${(sec / 60).toFixed(1)} minutes`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)} hours`;
  if (sec < 86400 * 365) return `${(sec / 86400).toFixed(1)} days`;
  const y = sec / (86400 * 365);
  if (y > 1e9) return `${(y / 1e9).toExponential(1)} billion years`;
  if (y > 1e6) return `${(y / 1e6).toFixed(0)} million years`;
  return `${y.toFixed(0)} years`;
};

// ===========================================================================
(function main() {

  hr('HOW FAST CAN ONE LAPTOP CORE HASH A PASSWORD?');
  console.log(dim(`
  Same password, same machine. The ONLY difference is the algorithm and how
  hard it has been deliberately made to compute.
`));

  const algos = [
    ['MD5',                  () => crypto.createHash('md5').update(PASSWORD).digest()],
    ['SHA-1',                () => crypto.createHash('sha1').update(PASSWORD).digest()],
    ['SHA-256',              () => crypto.createHash('sha256').update(PASSWORD).digest()],
    ['SHA-256 + salt',       () => crypto.createHash('sha256').update(salt).update(PASSWORD).digest()],
    ['PBKDF2-SHA256 10k',    () => crypto.pbkdf2Sync(PASSWORD, salt, 10_000, 32, 'sha256')],
    ['PBKDF2-SHA256 600k',   () => crypto.pbkdf2Sync(PASSWORD, salt, 600_000, 32, 'sha256')],
    ['scrypt N=16384 (~16MB)', () => crypto.scryptSync(PASSWORD, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })],
    ['scrypt N=65536 (~64MB)', () => crypto.scryptSync(PASSWORD, salt, 32, { N: 65536, r: 8, p: 1, maxmem: 256 * 1024 * 1024 })],
  ];

  const results = [];
  console.log(`  ${'algorithm'.padEnd(26)}${'hashes/sec'.padEnd(16)}${'time each'}`);
  console.log(dim('  ' + '-'.repeat(62)));
  for (const [name, fn] of algos) {
    const r = bench(fn, name.startsWith('scrypt') || name.includes('600k') ? 1200 : 700);
    results.push({ name, ...r });
    const c = r.perSec > 1e5 ? bad : r.perSec > 1e3 ? dim : ok;
    console.log(`  ${name.padEnd(26)}${c(human(r.perSec) + '/s').padEnd(25)}${r.msEach < 1 ? dim(`${(r.msEach * 1000).toFixed(1)} µs`) : `${r.msEach.toFixed(1)} ms`}`);
  }

  const sha  = results.find((r) => r.name === 'SHA-256');
  const shaS = results.find((r) => r.name === 'SHA-256 + salt');
  const pbk  = results.find((r) => r.name === 'PBKDF2-SHA256 600k');
  const scr  = results.find((r) => r.name === 'scrypt N=65536 (~64MB)');

  console.log(dim(`
  ⭐ Note SHA-256 vs SHA-256+salt: essentially IDENTICAL. Salting is NOT about
     slowing the attacker down -- see below.`));

  // ------------------------------------------------------- ATTACKER ECONOMICS
  hr('⭐ WHAT THAT MEANS FOR AN ATTACKER WHO HAS STOLEN YOUR USER TABLE');

  console.log(dim(`
  This is ONE laptop core. A real attacker rents GPUs: a modern GPU does
  ~10^10-10^11 SHA-256/sec, and a rig of 8 is ~1000x this laptop. So treat the
  SHA numbers below as WILDLY OPTIMISTIC for the defender.
`));

  const spaces = [
    ['a 6-char lowercase password',        26 ** 6],
    ['an 8-char lower+digit password',     36 ** 8],
    ['a leaked 1-billion-password list',   1e9],
    ['⭐ the top 10,000 common passwords',  1e4],
  ];

  for (const [label, space] of spaces) {
    console.log(`\n  ${label}  ${dim(`(${human(space)} candidates)`)}`);
    for (const r of [sha, pbk, scr]) {
      const sec = space / r.perSec;
      const c = sec < 3600 ? bad : sec < 86400 * 30 ? dim : ok;
      console.log(`      ${r.name.padEnd(26)} ${c(duration(sec))}`);
    }
  }

  console.log(bad(`
  ⭐ READ THE LAST BLOCK AGAIN. Against the 10,000 most common passwords -- which
     is where real attackers start, because real users pick them -- SHA-256 gets
     through the entire list in a fraction of a second.

     ⭐ NO PASSWORD POLICY SAVES YOU THERE. The defence is making each GUESS
        expensive, and that is the ONLY thing a password hash is for.`));

  console.log(ok(`
  ⭐ THE RATIO IS THE ARGUMENT: ${human(sha.perSec / scr.perSec)}x fewer guesses per second, for a
     cost of ${scr.msEach.toFixed(0)} ms on YOUR login endpoint. You pay milliseconds once per
     login; the attacker pays it ${human(1e4)} times over just the common-password list.`));

  // ---------------------------------------------------------------- SALT
  hr('WHAT THE SALT IS ACTUALLY FOR (it is not speed)');

  console.log(dim(`
  A salt is a unique random value stored ALONGSIDE each hash. It does not slow
  a single guess down at all -- we measured that above.
`));

  const shared = 'password123';
  const noSaltA = crypto.createHash('sha256').update(shared).digest('hex');
  const noSaltB = crypto.createHash('sha256').update(shared).digest('hex');
  const s1 = crypto.randomBytes(16), s2 = crypto.randomBytes(16);
  const saltedA = crypto.createHash('sha256').update(s1).update(shared).digest('hex');
  const saltedB = crypto.createHash('sha256').update(s2).update(shared).digest('hex');

  console.log(`  two DIFFERENT users, the SAME password "password123":\n`);
  console.log(`      unsalted, user A   ${noSaltA.slice(0, 40)}...`);
  console.log(`      unsalted, user B   ${noSaltB.slice(0, 40)}...`);
  console.log(`                         ${bad('⚠️ IDENTICAL -- so one crack breaks BOTH, and')}`);
  console.log(`                         ${bad('   the table itself reveals who shares a password')}\n`);
  console.log(`      salted,   user A   ${saltedA.slice(0, 40)}...`);
  console.log(`      salted,   user B   ${saltedB.slice(0, 40)}...`);
  console.log(`                         ${ok('✅ different -- every user must be attacked separately')}`);

  console.log(`
  ⭐ SO THE SALT DEFEATS *AMORTISATION*, NOT SPEED:
       · ⭐ rainbow tables become useless -- a precomputed table is per-salt
       · ⭐ ONE run of the dictionary no longer cracks EVERY user at once;
            the attacker must repeat the whole effort PER USER
       · identical passwords stop being visible in the dump

  ⭐ AND THE WORK FACTOR DEFEATS SPEED. You need BOTH. They fix different things,
     and that distinction is the thing to be able to state.

  ${dim('(bcrypt/scrypt/argon2 generate and embed the salt for you -- the encoded')}
  ${dim(' hash string contains the algorithm, work factor, salt and digest.)')}`);

  // ------------------------------------------------------------ CHOOSING
  hr('CHOOSING, AND THE REST OF THE STORY');

  console.log(`
  ⭐ ARGON2id      the current recommendation (OWASP). Memory-hard AND
                   side-channel resistant. Tune: memory, iterations, parallelism.
     scrypt        also memory-hard; built into node; a fine choice.
     bcrypt        battle-tested, everywhere, ⚠️ but caps input at 72 BYTES and
                   is not memory-hard.
     PBKDF2        ⚠️ weakest of the four (not memory-hard, so GPUs/ASICs eat it)
                   but it is FIPS-approved, which is sometimes the deciding factor.
     ⛔ SHA/MD5    ${bad('never, at any iteration count you would apply by hand')}

  ⭐ WHY "MEMORY-HARD" IS THE KEY WORD: a GPU has thousands of cores but limited
     memory per core. Forcing each guess to touch ${dim('64 MB')} means a GPU can run only
     a handful of guesses in parallel instead of thousands. ⭐ Memory-hardness is
     what removes the attacker's hardware advantage -- iteration count alone
     does not.

  ⭐ TUNE THE WORK FACTOR TO YOUR HARDWARE, NOT TO A BLOG POST: pick the cost
     that takes ~${dim('100-250 ms')} on YOUR login server, and ⭐ RAISE IT EVERY COUPLE
     OF YEARS. The encoded hash stores its own parameters, so you can upgrade
     transparently: on a successful login, if the stored work factor is below
     current, re-hash the (now known-correct) plaintext and store the new hash.

  ⚠️ AND THE THINGS AROUND IT, WHICH MATTER JUST AS MUCH:
       · ⭐ constant-time comparison of the digest
       · ⭐ RATE LIMIT the login endpoint -- online guessing is the attack you can
            actually see, and it is the cheapest one to stop (Phase 9 note 03)
       · a slow hash is a DoS surface: an unauthenticated endpoint that burns
         ${dim(`${scr.msEach.toFixed(0)} ms`)} of CPU per request needs its own bulkhead + limits
       · check credentials against known-breached password lists at signup
       · ⭐ MFA beats every one of these -- password hashing limits the damage of
            a breach; MFA prevents the account takeover in the first place
       · never log the password, never email it, never store it recoverably
`);

  hr('YOUR RESULTS — copy these into ../README.md');
  console.log();
  for (const r of results) console.log(`      ${r.name.padEnd(26)} ${human(r.perSec).padStart(8)}/s   ${r.msEach < 1 ? `${(r.msEach * 1000).toFixed(1)} µs` : `${r.msEach.toFixed(1)} ms`}`);
  console.log(`
      ⭐ SHA-256 : scrypt ratio          ${human(sha.perSec / scr.perSec)}x
      ⭐ top-10k list, SHA-256           ${duration(1e4 / sha.perSec)}
      ⭐ top-10k list, scrypt 64MB       ${duration(1e4 / scr.perSec)}
`);
})();
