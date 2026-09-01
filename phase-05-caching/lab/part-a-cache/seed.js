'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST ?? 'postgres',
  user: process.env.PGUSER ?? 'lab',
  password: process.env.PGPASSWORD ?? 'lab',
  database: process.env.PGDATABASE ?? 'lab',
});

(async () => {
  console.log('  seeding...');
  await pool.query('DROP TABLE IF EXISTS reviews, products');
  await pool.query(`
    CREATE TABLE products (
      id serial PRIMARY KEY,
      name text NOT NULL,
      description text NOT NULL,
      price_cents int NOT NULL,
      category text NOT NULL
    )`);
  await pool.query(`
    INSERT INTO products (name, description, price_cents, category)
    SELECT 'Product ' || g, repeat('desc ', 20), (random()*100000)::int,
           (ARRAY['electronics','books','home','toys'])[1+(random()*3)::int]
    FROM generate_series(1, 10000) g`);

  // A join target so a cache MISS is genuinely more expensive than a hit.
  await pool.query(`
    CREATE TABLE reviews (
      id serial PRIMARY KEY,
      product_id int NOT NULL REFERENCES products(id),
      stars int NOT NULL
    )`);
  await pool.query(`
    INSERT INTO reviews (product_id, stars)
    SELECT (random()*9999)::int + 1, (random()*4)::int + 1
    FROM generate_series(1, 2000000)`);
  // NOTE: deliberately NO index on reviews.product_id -- the correlated
  // subquery is meant to be expensive. That is what makes a cache miss cost
  // something, which is the whole point of the experiment.
  await pool.query('ANALYZE products');
  await pool.query('ANALYZE reviews');

  const { rows } = await pool.query('SELECT count(*)::int c FROM products');
  console.log(`  ${rows[0].c} products, 2M reviews (reviews.product_id intentionally UNINDEXED)`);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
