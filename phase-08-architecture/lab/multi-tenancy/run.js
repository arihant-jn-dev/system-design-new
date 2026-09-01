'use strict';
/**
 * Multi-tenancy isolation, demonstrated.
 *
 *   docker compose run --rm lab node multi-tenancy/run.js
 *
 * Gate Q3: "design multi-tenant isolation for a B2B SaaS product at three
 * different scales."
 *
 * The three models, in order of increasing isolation and cost:
 *   1. SHARED SCHEMA  + tenant_id column        cheapest, ⚠️ one bug leaks data
 *   2. SHARED SCHEMA  + tenant_id + ROW-LEVEL SECURITY   the DB enforces it
 *   3. SCHEMA PER TENANT                        isolation by construction
 *  (4. DATABASE PER TENANT -- same idea as 3, more so. Discussed, not run.)
 */

const { Pool } = require('pg');

const admin = new Pool({
  host: process.env.PGHOST ?? 'postgres',
  user: 'lab', password: 'lab', database: 'lab', max: 5,
});

const hr = (t) => {
  console.log('\n' + '='.repeat(74));
  console.log('  ' + t);
  console.log('='.repeat(74));
};
const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

// ============================================================== MODEL 1 & 2
async function sharedSchema() {
  await admin.query('DROP TABLE IF EXISTS invoices CASCADE');
  await admin.query(`
    CREATE TABLE invoices (
      id serial PRIMARY KEY,
      tenant_id text NOT NULL,
      customer  text NOT NULL,
      amount    int  NOT NULL
    )`);
  await admin.query(`
    INSERT INTO invoices (tenant_id, customer, amount) VALUES
      ('acme',    'Acme customer A',    100),
      ('acme',    'Acme customer B',    200),
      ('globex',  'Globex customer X',  999),
      ('globex',  'Globex SECRET deal', 50000),
      ('initech', 'Initech customer Z', 300)`);

  hr('MODEL 1 — SHARED SCHEMA with a tenant_id column');
  console.log(dim(`
  One table, every tenant's rows together. The cheapest model by far, and how
  most B2B SaaS starts. Isolation depends ENTIRELY on every query remembering
  WHERE tenant_id = ...
`));

  console.log('  ✅ the CORRECT query (acme, filtered):');
  let r = await admin.query(`SELECT customer, amount FROM invoices WHERE tenant_id = 'acme'`);
  r.rows.forEach((x) => console.log(`      ${x.customer.padEnd(22)} ${x.amount}`));

  console.log('\n  ❌ now a developer FORGETS the filter -- one missing WHERE clause:');
  console.log(dim('      SELECT customer, amount FROM invoices;      -- no tenant_id!'));
  r = await admin.query(`SELECT tenant_id, customer, amount FROM invoices`);
  r.rows.forEach((x) => console.log(`      ${bad(x.tenant_id.padEnd(9))} ${x.customer.padEnd(22)} ${x.amount}`));
  console.log(bad(`
      ⭐ ACME JUST SAW GLOBEX'S 50,000 SECRET DEAL.

      This is THE multi-tenancy failure mode, and it is one line of code. Not
      an exotic attack -- a forgotten WHERE clause in a new endpoint, a JOIN
      that lost the predicate, an admin script, a report someone added.

      "We'll be careful" is not a security model.`));

  // ---------------------------------------------------------------- RLS
  hr('MODEL 2 — SHARED SCHEMA + ROW-LEVEL SECURITY');
  console.log(dim(`
  Same table. But now POSTGRES enforces the boundary, not your code:

    ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON invoices
      USING (tenant_id = current_setting('app.tenant_id', true));

  Every query is silently rewritten to include the policy predicate.
`));

  await admin.query('ALTER TABLE invoices ENABLE ROW LEVEL SECURITY');
  await admin.query(`
    CREATE POLICY tenant_isolation ON invoices
      USING (tenant_id = current_setting('app.tenant_id', true))`);

  // ⚠️ RLS does NOT apply to the table owner or superusers unless forced.
  //    Forgetting this is why people think RLS "doesn't work".
  await admin.query('ALTER TABLE invoices FORCE ROW LEVEL SECURITY');

  // An app role that connects per-request and sets the tenant.
  await admin.query(`DROP ROLE IF EXISTS app_user`).catch(() => {});
  await admin.query(`CREATE ROLE app_user LOGIN PASSWORD 'app'`).catch(() => {});
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO app_user`);
  await admin.query(`GRANT USAGE, SELECT ON SEQUENCE invoices_id_seq TO app_user`);

  const appPool = new Pool({
    host: process.env.PGHOST ?? 'postgres',
    user: 'app_user', password: 'app', database: 'lab', max: 5,
  });

  for (const tenant of ['acme', 'globex']) {
    const c = await appPool.connect();
    try {
      // ⭐ Set once per request/transaction, from the authenticated session --
      //    NEVER from user input.
      await c.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenant]);

      // The SAME unfiltered query that leaked everything above:
      const res = await c.query('SELECT tenant_id, customer, amount FROM invoices');
      console.log(`\n  as tenant "${tenant}" -- running the UNFILTERED query:`);
      console.log(dim('      SELECT tenant_id, customer, amount FROM invoices;'));
      res.rows.forEach((x) => console.log(`      ${ok(x.tenant_id.padEnd(9))} ${x.customer.padEnd(22)} ${x.amount}`));
      console.log(`      -> ${res.rowCount} rows`);
    } finally {
      c.release();
    }
  }

  console.log(ok(`
  ⭐ THE SAME BUGGY QUERY IS NOW SAFE. The forgotten WHERE clause cannot leak
     data, because the database adds the predicate itself.

     That is the difference between a CONVENTION your team must follow
     perfectly forever, and a CONSTRAINT the system enforces.`));

  console.log(dim(`
  What RLS still does NOT fix:
    · noisy neighbours -- one tenant's load still hits shared resources
    · blast radius     -- one bad migration still affects everyone
    · "delete tenant X"  is still a DELETE, not a DROP
    · a compromised app role can still SET a different tenant_id
      (mitigate: derive it from the connection/JWT, never from a request body)`));

  await appPool.end();
}

// ================================================================ MODEL 3
async function schemaPerTenant() {
  hr('MODEL 3 — SCHEMA PER TENANT');
  console.log(dim(`
  Each tenant gets its own Postgres SCHEMA (a namespace), same database.
  Isolation is structural: acme's connection sets search_path=acme and
  literally cannot name globex's tables.
`));

  for (const t of ['acme', 'globex', 'initech']) {
    await admin.query(`DROP SCHEMA IF EXISTS tenant_${t} CASCADE`);
    await admin.query(`CREATE SCHEMA tenant_${t}`);
    await admin.query(`
      CREATE TABLE tenant_${t}.invoices (
        id serial PRIMARY KEY, customer text NOT NULL, amount int NOT NULL)`);
  }
  await admin.query(`INSERT INTO tenant_acme.invoices (customer, amount)
                     VALUES ('Acme customer A', 100), ('Acme customer B', 200)`);
  await admin.query(`INSERT INTO tenant_globex.invoices (customer, amount)
                     VALUES ('Globex SECRET deal', 50000)`);

  const c = await admin.connect();
  try {
    await c.query(`SET search_path TO tenant_acme`);
    const res = await c.query('SELECT customer, amount FROM invoices');   // no tenant_id anywhere
    console.log('\n  connection with search_path=tenant_acme, unfiltered query:');
    console.log(dim('      SELECT customer, amount FROM invoices;'));
    res.rows.forEach((x) => console.log(`      ${ok(x.customer.padEnd(22))} ${x.amount}`));
    console.log(`      -> ${res.rowCount} rows. ${ok('Globex is not merely filtered -- it is UNREACHABLE.')}`);
  } finally {
    c.release();
  }

  // The cost.
  const { rows: n } = await admin.query(`
    SELECT count(*)::int c FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'`);
  console.log(bad(`
  ⭐ AND NOW THE COST. A schema change must run ${n[0].c} times:`));
  const t0 = Date.now();
  for (const t of ['acme', 'globex', 'initech']) {
    await admin.query(`ALTER TABLE tenant_${t}.invoices ADD COLUMN currency text DEFAULT 'USD'`);
  }
  console.log(`      ALTER TABLE ... x${n[0].c} -> ${Date.now() - t0}ms`);
  console.log(dim(`
      With 3 tenants that is trivial. With 5,000 tenants it is a migration
      ORCHESTRATION PROBLEM: it takes hours, it can fail halfway, and you now
      have tenants on two different schema versions simultaneously -- so your
      code must support BOTH during the rollout (Phase 7's expand-contract,
      multiplied by N).

      Also: thousands of schemas x tables each = a very large system catalog,
      which slows connection setup and query planning for EVERYONE.`));
}

// ================================================== NOISY NEIGHBOUR
async function noisyNeighbour() {
  hr('THE NOISY NEIGHBOUR — why isolation is about PERFORMANCE too');
  console.log(dim(`
  Back to the shared-schema model. One tenant has 500k invoices; the others
  have a handful. All in the same table, same index, same buffer cache.
`));

  await admin.query('DROP TABLE IF EXISTS shared_invoices');
  await admin.query(`
    CREATE TABLE shared_invoices (
      id serial PRIMARY KEY, tenant_id text NOT NULL, customer text, amount int)`);
  await admin.query(`
    INSERT INTO shared_invoices (tenant_id, customer, amount)
    SELECT 'whale', 'c'||g, g FROM generate_series(1,500000) g`);
  await admin.query(`
    INSERT INTO shared_invoices (tenant_id, customer, amount)
    SELECT 'minnow', 'c'||g, g FROM generate_series(1,50) g`);
  await admin.query('ANALYZE shared_invoices');

  async function timeIt(label, sql, params) {
    const runs = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      await admin.query(sql, params);
      runs.push(performance.now() - t);
    }
    runs.sort((a, b) => a - b);
    const med = runs[2];
    console.log(`      ${label.padEnd(46)} ${med.toFixed(1)} ms`);
    return med;
  }

  console.log('\n  WITHOUT an index on tenant_id:');
  const noIdxMinnow = await timeIt("minnow's 50 invoices (scans all 500k)",
    `SELECT count(*) FROM shared_invoices WHERE tenant_id='minnow'`);

  await admin.query('CREATE INDEX ON shared_invoices (tenant_id, id)');
  await admin.query('ANALYZE shared_invoices');
  console.log('\n  WITH an index on (tenant_id, id):');
  const idxMinnow = await timeIt("minnow's 50 invoices", `SELECT count(*) FROM shared_invoices WHERE tenant_id='minnow'`);
  await timeIt("whale's 500k invoices", `SELECT count(*) FROM shared_invoices WHERE tenant_id='whale'`);

  console.log(`
  ⭐ ${(noIdxMinnow / idxMinnow).toFixed(0)}x difference for the SMALL tenant, purely because of
     the BIG tenant's data.

     ⭐ THE RULE: in a shared-schema model, tenant_id must be the LEADING
        COLUMN of essentially every index. It is your shard key in miniature
        (Phase 3D) -- without it, every small tenant pays for the largest one.

     And note what an index does NOT fix: the whale's queries still evict the
     minnow's pages from the shared buffer cache, still consume connections,
     still generate WAL. Performance isolation needs QUOTAS or SEPARATION,
     not just indexing.`);
}

// ==================================================================== main
(async () => {
  await sharedSchema();
  await schemaPerTenant();
  await noisyNeighbour();

  hr('CHOOSING — the answer to gate Q3');
  console.log(`
  model              isolation   cost/tenant  ops at scale   "delete tenant"
  ---------------------------------------------------------------------------
  shared + tenant_id   ⚠️ weak      ~0          ⭐ 1 migration   DELETE (slow, risky)
  shared + RLS         ✅ good      ~0          1 migration     DELETE
  schema per tenant    ✅ strong    low         ⚠️ N migrations  DROP SCHEMA ⭐
  database per tenant  ⭐ strongest high        ⚠️ N databases   DROP DATABASE ⭐

  ⭐ THE THREE-SCALE ANSWER:

    EARLY (10s-1000s of tenants, self-serve, low-value data)
        Shared schema + tenant_id, WITH row-level security, and tenant_id as
        the leading column of every index. One migration, one backup, and the
        database -- not your discipline -- enforces isolation.

    MID (large tenants appear, or compliance shows up)
        HYBRID: most tenants stay on the shared schema; the few large or
        regulated ones get their own schema or database. A directory/lookup
        table maps tenant -> location (Phase 3D's directory sharding).
        ⭐ This is what most real B2B SaaS actually looks like.

    LARGE (enterprise, regulated, data residency, "our data must be separate")
        Database (or cluster) per tenant, or CELLS holding a subset of tenants.
        Isolation, blast radius and per-tenant restore all become trivial;
        you pay in operational machinery.

  ⭐ AND THE POINT THAT SCORES: the driver is usually NOT technical. It is
     what you SELL. If your enterprise contract says "dedicated database",
     that is the architecture -- and it arrives as a sales requirement long
     before it arrives as a scaling one.
`);

  await admin.end();
})().catch((e) => { console.error('FAILED:', e.message, e.stack); process.exit(1); });
