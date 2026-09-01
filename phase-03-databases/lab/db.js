'use strict';
const { Pool, Client } = require('pg');

const config = {
  host: process.env.PGHOST ?? 'postgres',
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'lab',
  password: process.env.PGPASSWORD ?? 'lab',
  database: process.env.PGDATABASE ?? 'lab',
};

const pool = new Pool({ ...config, max: 10 });

/** A dedicated connection — needed for Lab B, where each "session" must be its own backend. */
function newClient() {
  return new Client(config);
}

async function waitForDb(attempts = 30) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

module.exports = { pool, newClient, waitForDb, config };
