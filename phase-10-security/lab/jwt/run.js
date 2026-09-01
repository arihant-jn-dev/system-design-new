'use strict';
/**
 * JWTs, BUILT AND BROKEN BY HAND. No dependencies (node's crypto is enough).
 *
 *   node jwt/run.js
 *
 * ⭐ The point of writing a JWT verifier yourself is that the FAMOUS VULNERABILITIES
 *    stop being trivia. You watch each one work against a plausible-looking
 *    implementation, then watch the fix stop it.
 *
 *   1. structure           header.payload.signature -- ⭐ the payload is NOT secret
 *   2. ⚠️ alg:none         a forged token a naive verifier ACCEPTS
 *   3. ⚠️ HS/RS confusion  sign with the PUBLIC key, verify as HMAC
 *   4. expiry              the only revocation a plain JWT actually has
 *   5. ⭐ THE REVOCATION PROBLEM -- logout does not log you out
 */

const crypto = require('crypto');

const hr  = (t) => { console.log('\n' + '='.repeat(74)); console.log('  ' + t); console.log('='.repeat(74)); };
const ok  = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const b64u  = (buf) => Buffer.from(buf).toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url').toString();
const json  = (o) => JSON.stringify(o);

const HS_SECRET = 'super-secret-signing-key-do-not-share';
const { publicKey: RS_PUB, privateKey: RS_PRIV } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

// ===========================================================================
//  SIGNING
// ===========================================================================
function signHS256(payload, secret = HS_SECRET) {
  const h = b64u(json({ alg: 'HS256', typ: 'JWT' }));
  const p = b64u(json(payload));
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

function signRS256(payload) {
  const h = b64u(json({ alg: 'RS256', typ: 'JWT' }));
  const p = b64u(json(payload));
  const sig = crypto.createSign('RSA-SHA256').update(`${h}.${p}`).sign(RS_PRIV, 'base64url');
  return `${h}.${p}.${sig}`;
}

// ===========================================================================
//  ⚠️ THE NAIVE VERIFIER -- it looks reasonable. It is not.
//
//  Its sin: it TRUSTS THE `alg` FIELD IN THE TOKEN, which is supplied by
//  whoever sent the token -- i.e. potentially the attacker.
// ===========================================================================
function verifyNaive(token) {
  const [h, p, sig] = token.split('.');
  const header = JSON.parse(unb64(h));

  if (header.alg === 'none') return JSON.parse(unb64(p));   // ⚠️⚠️ see below

  if (header.alg === 'HS256') {
    const expect = crypto.createHmac('sha256', HS_SECRET).update(`${h}.${p}`).digest('base64url');
    if (expect !== sig) throw new Error('bad signature');
    return JSON.parse(unb64(p));
  }
  if (header.alg === 'RS256') {
    const good = crypto.createVerify('RSA-SHA256').update(`${h}.${p}`).verify(RS_PUB, sig, 'base64url');
    if (!good) throw new Error('bad signature');
    return JSON.parse(unb64(p));
  }
  throw new Error('unknown alg');
}

// ===========================================================================
//  ⭐ THE CORRECT VERIFIER
// ===========================================================================
function verifyStrict(token, { expectedAlg = 'HS256', aud, iss } = {}) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed');
  const [h, p, sig] = parts;
  const header = JSON.parse(unb64(h));

  // ⭐ RULE 1: the SERVER decides the algorithm. The token does not get a vote.
  if (header.alg !== expectedAlg) throw new Error(`alg mismatch: got ${header.alg}, expected ${expectedAlg}`);

  let good;
  if (expectedAlg === 'HS256') {
    const expect = crypto.createHmac('sha256', HS_SECRET).update(`${h}.${p}`).digest('base64url');
    // ⭐ RULE 2: CONSTANT-TIME comparison. `a === b` on a string leaks timing.
    const a = Buffer.from(expect), b = Buffer.from(sig);
    good = a.length === b.length && crypto.timingSafeEqual(a, b);
  } else {
    good = crypto.createVerify('RSA-SHA256').update(`${h}.${p}`).verify(RS_PUB, sig, 'base64url');
  }
  if (!good) throw new Error('bad signature');

  const claims = JSON.parse(unb64(p));
  const now = Math.floor(Date.now() / 1000);

  // ⭐ RULE 3: VALIDATE THE CLAIMS. A valid signature only proves you issued it --
  //    not that it is still valid, or that it was meant for THIS service.
  if (claims.exp !== undefined && now >= claims.exp) throw new Error('expired');
  if (claims.nbf !== undefined && now <  claims.nbf) throw new Error('not yet valid');
  if (aud && claims.aud !== aud) throw new Error(`wrong audience: ${claims.aud}`);
  if (iss && claims.iss !== iss) throw new Error(`wrong issuer: ${claims.iss}`);

  return claims;
}

const attempt = (label, fn) => {
  try { const r = fn(); console.log(`      ${label.padEnd(46)} ${bad('ACCEPTED')} ${dim(json(r).slice(0, 40))}`); return true; }
  catch (e) { console.log(`      ${label.padEnd(46)} ${ok('REJECTED')} ${dim(`(${e.message})`)}`); return false; }
};

// ===========================================================================
(function main() {

  const now = Math.floor(Date.now() / 1000);
  const user = { sub: 'user-1234', role: 'user', iss: 'auth.example.com', aud: 'api.example.com',
                 iat: now, exp: now + 900 };

  // ------------------------------------------------------------- STRUCTURE
  hr('1 — STRUCTURE: a JWT is SIGNED, not ENCRYPTED');

  const token = signHS256(user);
  const [h, p, s] = token.split('.');

  console.log(`
  ${dim('header   ')} ${h}
  ${dim('payload  ')} ${p}
  ${dim('signature')} ${s.slice(0, 32)}...
`);
  console.log('  ⭐ ANYONE can decode the payload -- no key required:');
  console.log(`      ${ok(unb64(p))}`);
  console.log(bad(`
  ⚠️ SO NEVER PUT A SECRET IN A JWT. Not a password, not a card number, not an
     internal flag you would not show the user. base64url is ENCODING, not
     encryption -- the signature stops TAMPERING, it does not stop READING.`));

  // ------------------------------------------------------------ ALG: NONE
  hr('2 — ⚠️ THE `alg: none` FORGERY');

  console.log(dim(`
  The spec allows alg="none" for tokens whose integrity is guaranteed by other
  means. A verifier that HONOURS the token's own alg field therefore accepts
  unsigned tokens -- and the attacker writes the token.
`));

  const forgedNone = `${b64u(json({ alg: 'none', typ: 'JWT' }))}.` +
                     `${b64u(json({ ...user, sub: 'user-1234', role: 'admin' }))}.`;

  console.log('  attacker sends a token with alg=none and role=admin:\n');
  attempt('naive verifier  (trusts the token\'s alg)', () => verifyNaive(forgedNone));
  attempt('strict verifier (server pins the alg)', () => verifyStrict(forgedNone));

  console.log(ok(`
  ⭐ THE FIX IS ONE LINE: the SERVER decides which algorithm is acceptable.
     Never branch on header.alg. Any library that lets you call verify() without
     naming the expected algorithm is handing that decision to the attacker.`));

  // ------------------------------------------------------- HS/RS CONFUSION
  hr('3 — ⚠️ THE HS256 / RS256 CONFUSION ATTACK');

  console.log(dim(`
  With RS256 the PUBLIC key is, by design, public. If the verifier accepts
  HS256 as well, an attacker can sign a token with HMAC using the PUBLIC KEY AS
  THE SHARED SECRET -- and a verifier that "looks up the key" then checks the
  token's alg will happily HMAC-verify it with that same public key.
`));

  const pubPem = RS_PUB.export({ type: 'spki', format: 'pem' });
  const evilPayload = { ...user, role: 'admin' };
  const eh = b64u(json({ alg: 'HS256', typ: 'JWT' }));
  const ep = b64u(json(evilPayload));
  const esig = crypto.createHmac('sha256', pubPem).update(`${eh}.${ep}`).digest('base64url');
  const confused = `${eh}.${ep}.${esig}`;

  // A verifier that is "RS256" but resolves its key generically and trusts alg:
  const verifyConfusable = (tok) => {
    const [a, b, c] = tok.split('.');
    const hd = JSON.parse(unb64(a));
    if (hd.alg === 'HS256') {
      const expect = crypto.createHmac('sha256', pubPem).update(`${a}.${b}`).digest('base64url');
      if (expect !== c) throw new Error('bad signature');
      return JSON.parse(unb64(b));
    }
    const good = crypto.createVerify('RSA-SHA256').update(`${a}.${b}`).verify(RS_PUB, c, 'base64url');
    if (!good) throw new Error('bad signature');
    return JSON.parse(unb64(b));
  };

  console.log('  attacker HMAC-signs with the PUBLIC key, claiming role=admin:\n');
  attempt('confusable verifier (accepts either alg)', () => verifyConfusable(confused));
  attempt('strict verifier     (pinned to RS256)', () => verifyStrict(confused, { expectedAlg: 'RS256' }));

  console.log(ok(`
  ⭐ SAME ROOT CAUSE AS #2: the token was allowed to choose the algorithm.
     ⭐ And note the asymmetry that makes RS256 worth the cost: with HS256 every
        service that VERIFIES tokens must hold the key that can also MINT them.
        With RS256 only the auth server has the private key.`));

  // ------------------------------------------------------- CLAIM CHECKING
  hr('4 — A VALID SIGNATURE IS NOT A VALID TOKEN');

  console.log(dim(`
  These are all correctly signed by us. Every one must still be rejected.
`));

  attempt('expired 1 hour ago',
    () => verifyStrict(signHS256({ ...user, exp: now - 3600 }), { aud: 'api.example.com' }));
  attempt('not valid until tomorrow',
    () => verifyStrict(signHS256({ ...user, nbf: now + 86400 })));
  attempt('issued for a DIFFERENT service (aud)',
    () => verifyStrict(signHS256({ ...user, aud: 'other-api.example.com' }), { aud: 'api.example.com' }));
  attempt('issued by a DIFFERENT issuer',
    () => verifyStrict(signHS256({ ...user, iss: 'evil.example.com' }), { iss: 'auth.example.com' }));
  attempt('⭐ a genuinely valid token',
    () => verifyStrict(token, { aud: 'api.example.com', iss: 'auth.example.com' }));

  console.log(dim(`
  ⭐ The AUDIENCE check is the one people skip, and it matters: without it, a
     token minted for a low-value internal service is accepted by your payments
     API. Same signature, same issuer -- completely different trust.`));

  // ------------------------------------------------- ⭐ THE REVOCATION PROBLEM
  hr('5 — ⭐⭐ THE REVOCATION PROBLEM: "LOG OUT" DOES NOT LOG YOU OUT');

  console.log(dim(`
  A JWT is SELF-CONTAINED: the server validates it WITHOUT a lookup. That is the
  entire performance argument for using one -- and it is exactly why you cannot
  take it back.
`));

  const sessionToken = signHS256({ ...user, exp: now + 900 });
  console.log(`  1. user logs in                  -> token issued, exp in 15 min`);
  console.log(`  2. user clicks "log out"         -> the client deletes its copy`);
  console.log(`  3. server-side session destroyed -> ${dim('(there is no server-side session)')}`);
  console.log(`  4. attacker replays the token they captured in step 1:\n`);
  attempt('     stolen token, after "logout"', () => verifyStrict(sessionToken, { aud: 'api.example.com' }));

  console.log(bad(`
  ⭐ IT STILL WORKS. And so does a token belonging to a user you just BANNED, or
     whose role you just DOWNGRADED, or whose password was just reset after a
     compromise. Nothing you do on the server can stop it.

     ⭐ THE STATELESSNESS THAT MAKES JWTs FAST IS THE SAME PROPERTY THAT MAKES
        THEM UNREVOCABLE. You cannot have one without the other.`));

  console.log(`
  ⭐ THE FIXES, and each gives back some of what you paid for:

     a) ⭐ SHORT EXPIRY + REFRESH TOKENS         ${ok('the standard answer')}
        access token 5-15 min (stateless, fast), refresh token days (stateful,
        stored, revocable). ⭐ The blast radius of a stolen access token becomes
        "minutes", and the refresh token IS checked against a database.

     b) ⭐ REFRESH TOKEN ROTATION + REUSE DETECTION
        each refresh issues a NEW refresh token and invalidates the old one.
        ⭐ If an OLD one is ever presented again, that means it was stolen --
        so revoke the entire family and force re-auth. This is what turns a
        stolen refresh token from permanent access into a detectable event.

     c) A DENYLIST of revoked jti/sub in Redis, checked per request
        ⚠️ ...which reintroduces the lookup you used a JWT to avoid. Honest
        answer: the list is small and TTL'd to the token lifetime, so it is far
        cheaper than a full session store -- but say the trade out loud.

     d) A "tokens issued before T are invalid" timestamp per user
        cheap (one field, cacheable) and handles password-reset and ban well.

  ⭐ AND THE QUESTION UNDERNEATH ALL OF THIS:

     ⚠️ If you need instant revocation, per-request user lookups, and server-side
        state anyway -- ${bad('you have rebuilt sessions, but worse.')}
     ⭐ SESSIONS ARE NOT LEGACY. For a single first-party web app, a signed
        session cookie backed by Redis is simpler, instantly revocable, and
        smaller over the wire. ⭐ JWTs earn their cost when you have MANY services
        that must validate WITHOUT calling the auth service, or a third party who
        cannot share your session store.`);

  // --------------------------------------------------------------- STORAGE
  hr('6 — WHERE THE TOKEN LIVES (and why not localStorage)');

  console.log(`
  ${'store'.padEnd(26)}${'XSS'.padEnd(22)}${'CSRF'}`);
  console.log(dim('  ' + '-'.repeat(66)));
  console.log(`  ${'localStorage'.padEnd(26)}${bad('⚠️ readable by any JS').padEnd(31)}${ok('immune')}`);
  console.log(`  ${'JS-readable cookie'.padEnd(26)}${bad('⚠️ readable by any JS').padEnd(31)}${bad('vulnerable')}`);
  console.log(`  ${'⭐ httpOnly cookie'.padEnd(26)}${ok('not readable by JS').padEnd(31)}${'vulnerable -> ' + ok('SameSite')}`);
  console.log(`  ${'in memory only'.padEnd(26)}${'lost on reload'.padEnd(22)}${ok('immune')}`);

  console.log(`
  ⭐ THE ANSWER: ${ok('httpOnly + Secure + SameSite=Lax|Strict cookie')}, with CSRF
     protection for state-changing requests.

     ⚠️ "localStorage is fine, just prevent XSS" misses the point: ⭐ with XSS the
        attacker does not need to STEAL the token -- they can simply make
        requests as the user. But a token in localStorage is EXFILTRATED, so it
        keeps working after the XSS is patched and the user closes the tab.
        ⭐ httpOnly turns "permanent stolen credential" into "temporary
           same-origin abuse". That is a real, meaningful reduction.

     ⭐ A common good pattern: refresh token in an httpOnly cookie, access token
        in MEMORY only (never persisted), re-obtained on page load.
`);

  hr('SUMMARY — the seven rules');
  console.log(`
   1. ⭐ The server pins the algorithm. Never trust header.alg.
   2. Constant-time signature comparison.
   3. ⭐ Validate exp, nbf, aud, iss -- a valid signature is not a valid token.
   4. Never put secrets in the payload; it is readable by anyone.
   5. ⭐ Short-lived access tokens + rotating refresh tokens with reuse detection.
   6. ⭐ httpOnly + Secure + SameSite cookies, not localStorage.
   7. ⭐ Ask whether you need a JWT at all. Sessions are simpler and revocable.
`);
})();
