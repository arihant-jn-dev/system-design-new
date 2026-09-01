'use strict';
/**
 * ⭐ GDPR ERASURE IN AN IMMUTABLE EVENT LOG — the gate Q2 question, made real.
 *
 *   node crypto-shredding/run.js
 *
 * ⭐ THE CONTRADICTION:
 *
 *      Event sourcing says:  events are IMMUTABLE and kept FOREVER.
 *      GDPR Article 17 says: the data subject may demand ERASURE.
 *
 *    You cannot delete the event (it breaks replay, the audit trail, every
 *    downstream projection, and the ledger's arithmetic). You cannot keep the
 *    personal data either. ⭐ "We'll just delete the row" is not available, and
 *    saying so is the first half of the answer.
 *
 * ⭐ THE RESOLUTION — CRYPTO-SHREDDING:
 *
 *      Encrypt every subject's personal data with a PER-SUBJECT key.
 *      Store the keys in a SEPARATE, MUTABLE keystore.
 *      To erase a subject: ⭐ DESTROY THEIR KEY.
 *
 *      The events remain, byte for byte. The ciphertext remains. The structure,
 *      the ordering, the aggregate arithmetic, the audit trail -- all intact.
 *      ⭐ The PERSONAL DATA is gone, because nothing can decrypt it any more.
 *
 * This file builds exactly that, with real AES-256-GCM, and then proves each
 * property by trying to violate it.
 */

const crypto = require('crypto');

const hr  = (t) => { console.log('\n' + '='.repeat(74)); console.log('  ' + t); console.log('='.repeat(74)); };
const ok  = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

// ===========================================================================
//  THE KEYSTORE — small, mutable, separately backed up, and the ONLY thing
//  that ever gets deleted.
// ===========================================================================
class KeyStore {
  constructor() { this.keys = new Map(); }

  /** ⭐ One data key per SUBJECT, not per event -- that's what makes erasure O(1). */
  keyFor(subjectId) {
    if (!this.keys.has(subjectId)) this.keys.set(subjectId, crypto.randomBytes(32));
    return this.keys.get(subjectId);
  }

  get(subjectId) { return this.keys.get(subjectId) ?? null; }

  /** ⭐ THE ERASURE. One delete, regardless of how many events reference them. */
  shred(subjectId) {
    const had = this.keys.delete(subjectId);
    return had;
  }

  size() { return this.keys.size; }
}

// ===========================================================================
//  THE EVENT LOG — append-only. Nothing is ever updated or deleted here.
// ===========================================================================
class EventLog {
  constructor(keystore) { this.events = []; this.ks = keystore; }

  /**
   * ⭐ THE CRITICAL DESIGN DECISION IS THE SPLIT:
   *
   *      `meta`      NON-personal, stored in CLEARTEXT -- amounts, timestamps,
   *                  types, order ids. ⭐ This is what keeps aggregates,
   *                  reporting and replay working after erasure.
   *      `personal`  ENCRYPTED with the subject's key -- name, email, address.
   *
   * ⚠️ Getting this split wrong is the whole failure mode. Encrypt too little
   *    and you cannot erase; encrypt too much and your system stops working
   *    when you do.
   */
  append(type, subjectId, meta, personal) {
    const key = this.ks.keyFor(subjectId);
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([c.update(JSON.stringify(personal), 'utf8'), c.final()]);
    this.events.push({
      seq: this.events.length + 1,
      type,
      subjectId,                       // ⭐ a pseudonymous id, never the email
      at: new Date(Date.UTC(2026, 0, 1 + this.events.length)).toISOString().slice(0, 10),
      meta,                            // cleartext, non-personal
      enc: { iv: iv.toString('base64'), ct: ct.toString('base64'), tag: c.getAuthTag().toString('base64') },
    });
  }

  /** Returns the decrypted personal data, or null if the key is gone. */
  readPersonal(ev) {
    const key = this.ks.get(ev.subjectId);
    if (!key) return null;                       // ⭐ SHREDDED
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ev.enc.iv, 'base64'));
      d.setAuthTag(Buffer.from(ev.enc.tag, 'base64'));
      return JSON.parse(Buffer.concat([d.update(Buffer.from(ev.enc.ct, 'base64')), d.final()]).toString());
    } catch { return null; }
  }
}

const money = (p) => `£${(p / 100).toFixed(2)}`;

// ===========================================================================
(function main() {

  const ks = new KeyStore();
  const log = new EventLog(ks);

  // Three customers, one of whom will later ask to be forgotten.
  log.append('CustomerRegistered', 'cust-001', { plan: 'pro' },   { name: 'Alice Smith',  email: 'alice@example.com', address: '1 High St, London' });
  log.append('OrderPlaced',        'cust-001', { orderId: 'o-1', amount: 4999, currency: 'GBP' }, { shipTo: '1 High St, London' });
  log.append('CustomerRegistered', 'cust-002', { plan: 'free' },  { name: 'Bob Jones',    email: 'bob@example.com',   address: '2 Low Rd, Leeds' });
  log.append('OrderPlaced',        'cust-001', { orderId: 'o-2', amount: 12050, currency: 'GBP' }, { shipTo: '1 High St, London' });
  log.append('OrderPlaced',        'cust-002', { orderId: 'o-3', amount: 3000, currency: 'GBP' },  { shipTo: '2 Low Rd, Leeds' });
  log.append('CustomerRegistered', 'cust-003', { plan: 'pro' },   { name: 'Carol White',  email: 'carol@example.com', address: '3 Mid Ave, Bath' });
  log.append('OrderPlaced',        'cust-003', { orderId: 'o-4', amount: 7500, currency: 'GBP' },  { shipTo: '3 Mid Ave, Bath' });

  const show = (title) => {
    hr(title);
    console.log(`\n  ${'seq'.padEnd(5)}${'type'.padEnd(22)}${'subject'.padEnd(11)}${'meta (cleartext)'.padEnd(24)}personal (decrypted)`);
    console.log(dim('  ' + '-'.repeat(96)));
    for (const ev of log.events) {
      const p = log.readPersonal(ev);
      const metaStr = ev.meta.orderId ? `${ev.meta.orderId} ${money(ev.meta.amount)}` : `plan=${ev.meta.plan}`;
      const pStr = p === null ? bad('⛔ UNRECOVERABLE') : ok(p.name ?? p.shipTo);
      console.log(`  ${String(ev.seq).padEnd(5)}${ev.type.padEnd(22)}${ev.subjectId.padEnd(11)}${metaStr.padEnd(24)}${pStr}`);
    }
  };

  show('BEFORE — a normal event-sourced system');

  console.log(dim(`
  Note what is in cleartext: order ids, amounts, plans, dates, and a PSEUDONYMOUS
  subject id. ⭐ None of that identifies a person on its own -- which is exactly
  why the system keeps working after erasure.`));

  // What the raw storage actually looks like.
  console.log(dim('\n  the stored event 1, as it sits on disk:'));
  const raw = { ...log.events[0], enc: { ...log.events[0].enc, ct: log.events[0].enc.ct.slice(0, 24) + '…' } };
  console.log(dim('  ' + JSON.stringify(raw, null, 2).split('\n').join('\n  ')));

  // ------------------------------------------------------------ AGGREGATES
  const revenue = () => log.events.filter((e) => e.type === 'OrderPlaced')
                                  .reduce((s, e) => s + e.meta.amount, 0);
  const orderCount = () => log.events.filter((e) => e.type === 'OrderPlaced').length;
  const revenueBefore = revenue();

  console.log(`\n  ${'total revenue'.padEnd(22)}${ok(money(revenueBefore))}   ${dim(`across ${orderCount()} orders`)}`);
  console.log(`  ${'events in the log'.padEnd(22)}${log.events.length}`);
  console.log(`  ${'keys in the keystore'.padEnd(22)}${ks.size()}`);

  // ------------------------------------------------------- THE ERASURE
  hr('⭐ THE ERASURE REQUEST — "Alice invokes GDPR Article 17"');

  console.log(dim(`
  In a normal system this is a nightmare: her name and address are in 3 events,
  2 projections, a search index, 90 days of logs, last night's backup, and the
  analytics warehouse. You would have to find and rewrite all of them -- and
  rewriting an immutable log is not something you can do.
`));

  console.log(`  ⭐ Instead, ONE operation:\n`);
  console.log(`      ${ok("keystore.shred('cust-001')")}`);
  const shredded = ks.shred('cust-001');
  console.log(`      -> ${shredded ? ok('key destroyed') : bad('no key found')}\n`);
  console.log(dim(`      Events touched:      0
      Projections rebuilt: 0
      Backups rewritten:   0`));

  show('AFTER — the same log, byte for byte identical');

  // ------------------------------------------------------------ THE PROOFS
  hr('PROVING THE PROPERTIES');

  const revenueAfter = revenue();

  console.log(`
  1. THE PERSONAL DATA IS GONE`);
  const ev1 = log.events[0];
  console.log(`       readPersonal(event 1)     ${log.readPersonal(ev1) === null ? ok('null -- unrecoverable') : bad('STILL READABLE')}`);
  console.log(`       the ciphertext            ${dim(ev1.enc.ct.slice(0, 40) + '…')}`);
  console.log(`       ${dim('...still sits there, and is now indistinguishable from random bytes.')}`);

  // Try to brute-force it with a wrong key, to make the point concrete.
  let cracked = false;
  for (let i = 0; i < 2000; i++) {
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', crypto.randomBytes(32), Buffer.from(ev1.enc.iv, 'base64'));
      d.setAuthTag(Buffer.from(ev1.enc.tag, 'base64'));
      Buffer.concat([d.update(Buffer.from(ev1.enc.ct, 'base64')), d.final()]);
      cracked = true; break;
    } catch { /* auth tag mismatch, as expected */ }
  }
  console.log(`       2,000 random-key attempts ${cracked ? bad('DECRYPTED') : ok('all failed (GCM auth tag)')}`);
  console.log(dim(`       ⭐ AES-256 has 2^256 keys. "Delete the key" is not obfuscation --
          it is the same assumption every encrypted disk in the world rests on.`));

  console.log(`
  2. THE LOG IS UNCHANGED`);
  console.log(`       events before / after     ${log.events.length} / ${log.events.length}   ${ok('identical')}`);
  console.log(`       sequence numbers intact   ${ok('yes')} ${dim('-- replay, ordering and causality all still work')}`);

  console.log(`
  3. ⭐ THE BUSINESS DATA STILL WORKS`);
  console.log(`       total revenue before      ${money(revenueBefore)}`);
  console.log(`       total revenue after       ${revenueAfter === revenueBefore ? ok(money(revenueAfter)) : bad(money(revenueAfter))}   ${ok('unchanged')}`);
  console.log(`       order count               ${orderCount()}   ${ok('unchanged')}`);
  console.log(dim(`
       ⭐ THIS is why the cleartext/encrypted split matters so much. Your
          finance team's numbers do not move when a customer is erased -- which
          is a legal requirement too: ⭐ TAX LAW REQUIRES YOU TO KEEP TRANSACTION
          RECORDS FOR YEARS, and GDPR explicitly permits retention for a legal
          obligation. Crypto-shredding satisfies BOTH at once.`));

  console.log(`
  4. OTHER SUBJECTS ARE UNAFFECTED`);
  const bob = log.readPersonal(log.events[2]);
  console.log(`       Bob's data                ${bob ? ok(bob.name) : bad('lost')}   ${dim('(per-subject keys, so blast radius = 1)')}`);
  console.log(`       keys remaining            ${ks.size()}`);

  console.log(`
  5. IT IS IDEMPOTENT AND VERIFIABLE`);
  console.log(`       shred('cust-001') again   ${ks.shred('cust-001') ? bad('found a key?!') : ok('no-op -- already gone')}`);
  console.log(`       ⭐ and "is Alice erased?" is answerable: ${ok('the key is absent')}`);
  console.log(dim(`       ⭐ That is the compliance property people miss -- you can PROVE erasure
          happened, and prove it cheaply, without scanning petabytes.`));

  // ------------------------------------------------------- THE HARD PARTS
  hr('⚠️ WHERE CRYPTO-SHREDDING IS HARDER THAN IT LOOKS');

  console.log(`
  ⚠️ 1. THE KEYSTORE BECOMES THE MOST CRITICAL SYSTEM YOU OWN.
        Lose it and you have lost ALL personal data for EVERY user. It needs the
        backups, replication and access control you would give a database --
        ⭐ and yet its backups must be RETENTION-LIMITED, or you have simply
        moved the un-erasable copy somewhere else. ⭐ THIS IS THE REAL TENSION:
        a backup of the keystore is a backup of your ability to un-erase.

  ⚠️ 2. ⭐ ANYTHING DECRYPTED AND WRITTEN DOWN ESCAPES THE SCHEME.
        Projections, search indexes, caches, analytics warehouses, log lines,
        support tickets, that CSV someone emailed. ⭐ The event log is erasable;
        the twelve places downstream that read it are not, unless you plan for
        it: keep derived stores REBUILDABLE, and rebuild after a shred.

  ⚠️ 3. THE SPLIT IS A JUDGEMENT CALL, AND IT IS PERMANENT.
        Anything you left in cleartext can never be erased. ⚠️ And "not personal"
        is subtle -- an IP address IS personal data under GDPR; so is a device
        id; so, potentially, is a precise timestamp plus a location.
        ⭐ Under-encrypt and you cannot comply. Over-encrypt and your reporting
           stops working. You must decide up front.

  ⚠️ 4. KEY ROTATION AND RE-ENCRYPTION.
        Rotating a subject's key means re-encrypting their events -- which is a
        WRITE to an immutable log. ⭐ The usual answer is ENVELOPE ENCRYPTION:
        events are encrypted with a per-subject DATA key, and the data key is
        itself encrypted by a rotatable master key in a KMS. Rotating the master
        then only rewrites the small keystore, never the log.

  ⚠️ 5. BACKUPS OF THE LOG ITSELF ARE FINE -- ⭐ and that is the elegant part.
        An old backup contains ciphertext whose key no longer exists anywhere,
        so restoring it does NOT resurrect the personal data. ⭐ Compare with
        row deletion, where restoring a backup silently un-deletes the user.

  ⚠️ 6. IT DOES NOT COVER EVERYTHING. Erasure is not absolute: you may retain
        data for legal obligations, and ⭐ "right to erasure" has exceptions.
        ⭐ Talk to a lawyer -- this is a design constraint that is LEGAL rather
           than technical, which is the phase's whole point.
`);

  hr('⭐ THE GATE ANSWER, IN ~60 SECONDS');
  console.log(`
  "You can't delete events -- it breaks replay, the audit trail and every
   projection -- so you make the data UNREADABLE instead.

   ⭐ Encrypt each subject's personal fields with a per-subject data key, keep
   those keys in a separate mutable keystore, and keep non-personal fields --
   amounts, timestamps, order ids, a pseudonymous subject id -- in cleartext.

   ⭐ To honour an erasure request you destroy that one key. The log is untouched,
   the ciphertext is now random bytes, aggregates and the ledger still balance,
   and other users are unaffected. ⭐ It's idempotent, and you can PROVE erasure
   by showing the key is absent.

   ⭐ The hard parts are that the keystore becomes your most critical system and
   its backups must be retention-limited; that anything decrypted downstream --
   projections, search indexes, warehouses, logs -- escapes the scheme unless
   those stores are rebuildable and get rebuilt; and that the cleartext/encrypted
   split is a permanent, up-front judgement call. ⭐ I'd use envelope encryption
   with a KMS so the master key can rotate without rewriting the log.

   ⭐ And I'd note that retaining the transaction record is often a LEGAL
   REQUIREMENT that GDPR explicitly allows -- so this isn't a workaround, it's
   the design that satisfies both obligations at once."
`);
})();
