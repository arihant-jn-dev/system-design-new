/**
 * XVerify Email Validation — Benchmarking Script
 * Hits 500 requests with diverse email/domain combos
 * Measures: latency, p50/p95/p99, success rate, per-domain breakdown
 */

const https = require('https');
const { URL } = require('url');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const API_KEY  = 'YOUR_XVERIFY_API_KEY_HERE';  // Replace with your actual API key
const DOMAIN   = 'freesamplesprousa.com';
const BASE_URL = 'https://usapi.xverify.com/v2/ev/';
const CONCURRENCY = 10;   // parallel requests at a time
const TOTAL       = 500;  // total requests

// ─── EMAIL LIST GENERATION ────────────────────────────────────────────────────
const domains = [
  // Major ISPs (should be VALID deliverable)
  { d: 'gmail.com',     category: 'major_isp',   expect: 'valid'   },
  { d: 'yahoo.com',     category: 'major_isp',   expect: 'valid'   },
  { d: 'outlook.com',   category: 'major_isp',   expect: 'valid'   },
  { d: 'hotmail.com',   category: 'major_isp',   expect: 'valid'   },
  { d: 'icloud.com',    category: 'major_isp',   expect: 'valid'   },
  { d: 'aol.com',       category: 'major_isp',   expect: 'valid'   },
  { d: 'protonmail.com',category: 'major_isp',   expect: 'valid'   },
  { d: 'live.com',      category: 'major_isp',   expect: 'valid'   },
  // Disposable / throwaway (should be INVALID/risky)
  { d: 'mailinator.com',category: 'disposable',  expect: 'invalid' },
  { d: 'guerrillamail.com',category:'disposable', expect: 'invalid' },
  { d: 'tempmail.com',  category: 'disposable',  expect: 'invalid' },
  { d: 'throwam.com',   category: 'disposable',  expect: 'invalid' },
  { d: 'yopmail.com',   category: 'disposable',  expect: 'invalid' },
  // Fake/non-existent domains
  { d: 'fakexyz99999.com',  category: 'fake_domain', expect: 'invalid' },
  { d: 'notarealdomain.io', category: 'fake_domain', expect: 'invalid' },
  { d: 'xyzabc12345.net',   category: 'fake_domain', expect: 'invalid' },
  // Business / corporate
  { d: 'amazon.com',    category: 'corporate',   expect: 'valid'   },
  { d: 'microsoft.com', category: 'corporate',   expect: 'valid'   },
  { d: 'apple.com',     category: 'corporate',   expect: 'valid'   },
];

const localParts = [
  // Common valid-looking usernames
  'john.doe', 'jane.smith', 'user123', 'test.user', 'arihant.j',
  'priya.sharma', 'rahul2024', 'contact', 'info', 'support',
  // Unusual but syntactically valid
  'a', 'very.long.email.address.here', 'user+tag', '123456',
  // Invalid format (no @ in final URL — will be caught before sending)
  // We keep all syntactically valid for the API test
];

function generateEmails(count) {
  const emails = [];
  let i = 0;
  while (emails.length < count) {
    const domain    = domains[i % domains.length];
    const localPart = localParts[Math.floor(i / domains.length) % localParts.length];
    emails.push({
      email:    `${localPart}@${domain.d}`,
      domain:   domain.d,
      category: domain.category,
      expect:   domain.expect,
    });
    i++;
  }
  return emails;
}

// ─── HTTP REQUEST (with timing) ───────────────────────────────────────────────
function makeRequest(emailObj) {
  return new Promise((resolve) => {
    const url = new URL(BASE_URL);
    url.searchParams.set('email',   emailObj.email);
    url.searchParams.set('type',    'json');
    url.searchParams.set('api_key', API_KEY);
    url.searchParams.set('domain',  DOMAIN);

    const startTime = Date.now();
    let timedOut = false;

    const req = https.get(url.toString(), (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const latency = Date.now() - startTime;
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (_) {}
        resolve({
          email:      emailObj.email,
          domain:     emailObj.domain,
          category:   emailObj.category,
          expect:     emailObj.expect,
          statusCode: res.statusCode,
          latency,
          status:     parsed?.status     || null,
          code:       parsed?.code       || null,
          error:      null,
          timedOut:   false,
          raw:        parsed,
        });
      });
    });

    req.setTimeout(15000, () => {
      timedOut = true;
      req.destroy();
      resolve({
        email:    emailObj.email,
        domain:   emailObj.domain,
        category: emailObj.category,
        expect:   emailObj.expect,
        latency:  Date.now() - startTime,
        error:    'TIMEOUT',
        timedOut: true,
        status:   null,
        code:     null,
      });
    });

    req.on('error', (err) => {
      if (timedOut) return;
      resolve({
        email:    emailObj.email,
        domain:   emailObj.domain,
        category: emailObj.category,
        expect:   emailObj.expect,
        latency:  Date.now() - startTime,
        error:    err.message,
        timedOut: false,
        status:   null,
        code:     null,
      });
    });
  });
}

// ─── CONCURRENCY POOL ─────────────────────────────────────────────────────────
async function runBatch(emails, concurrency) {
  const results = [];
  let idx = 0;
  let done = 0;

  async function worker() {
    while (idx < emails.length) {
      const i = idx++;
      const result = await makeRequest(emails[i]);
      results.push(result);
      done++;
      if (done % 50 === 0) {
        process.stdout.write(`  Progress: ${done}/${emails.length} requests done...\n`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, worker);
  await Promise.all(workers);
  return results;
}

// ─── STATISTICS ───────────────────────────────────────────────────────────────
function percentile(sortedArr, p) {
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, idx)];
}

function analyze(results) {
  const total     = results.length;
  const errors    = results.filter(r => r.error);
  const timeouts  = results.filter(r => r.timedOut);
  const successes = results.filter(r => !r.error);

  const latencies = successes.map(r => r.latency).sort((a, b) => a - b);
  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length)
    : 0;

  // Per-domain breakdown
  const byDomain = {};
  for (const r of results) {
    if (!byDomain[r.domain]) byDomain[r.domain] = { latencies: [], statuses: {}, category: r.category, errors: 0 };
    if (r.error) { byDomain[r.domain].errors++; continue; }
    byDomain[r.domain].latencies.push(r.latency);
    const s = r.status || 'unknown';
    byDomain[r.domain].statuses[s] = (byDomain[r.domain].statuses[s] || 0) + 1;
  }

  // Per-category breakdown
  const byCategory = {};
  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = { latencies: [], statuses: {}, errors: 0 };
    if (r.error) { byCategory[r.category].errors++; continue; }
    byCategory[r.category].latencies.push(r.latency);
    const s = r.status || 'unknown';
    byCategory[r.category].statuses[s] = (byCategory[r.category].statuses[s] || 0) + 1;
  }

  // Status code distribution
  const statusDist = {};
  for (const r of successes) {
    const s = r.status || 'null';
    statusDist[s] = (statusDist[s] || 0) + 1;
  }

  return {
    total, errors: errors.length, timeouts: timeouts.length,
    successCount: successes.length,
    successRate: ((successes.length / total) * 100).toFixed(2),
    latency: {
      min:  latencies[0] || 0,
      max:  latencies[latencies.length - 1] || 0,
      avg:  avgLatency,
      p50:  percentile(latencies, 50),
      p75:  percentile(latencies, 75),
      p90:  percentile(latencies, 90),
      p95:  percentile(latencies, 95),
      p99:  percentile(latencies, 99),
    },
    statusDist,
    byDomain,
    byCategory,
    sampleResults: successes.slice(0, 5).map(r => ({
      email: r.email, latency: r.latency, status: r.status, code: r.code
    })),
  };
}

// ─── REPORT PRINTER ───────────────────────────────────────────────────────────
function printReport(stats, durationMs) {
  const sep = '─'.repeat(72);

  console.log('\n' + '═'.repeat(72));
  console.log('  XVERIFY EMAIL VALIDATION — BENCHMARK REPORT');
  console.log('  Total Requests: ' + stats.total + ' | Concurrency: ' + CONCURRENCY);
  console.log('  Duration: ' + (durationMs / 1000).toFixed(2) + 's  |  RPS: ' + (stats.total / (durationMs / 1000)).toFixed(1));
  console.log('═'.repeat(72));

  console.log('\n── OVERALL RESULTS ──────────────────────────────────────────────────');
  console.log(`  Total:        ${stats.total}`);
  console.log(`  Successes:    ${stats.successCount}   (${stats.successRate}%)`);
  console.log(`  Errors:       ${stats.errors}`);
  console.log(`  Timeouts:     ${stats.timeouts}`);

  console.log('\n── LATENCY (milliseconds) ───────────────────────────────────────────');
  console.log(`  Min:    ${stats.latency.min} ms`);
  console.log(`  Avg:    ${stats.latency.avg} ms`);
  console.log(`  p50:    ${stats.latency.p50} ms   ← half of requests faster than this`);
  console.log(`  p75:    ${stats.latency.p75} ms`);
  console.log(`  p90:    ${stats.latency.p90} ms`);
  console.log(`  p95:    ${stats.latency.p95} ms   ← 95% of requests faster than this`);
  console.log(`  p99:    ${stats.latency.p99} ms   ← 99% of requests faster than this`);
  console.log(`  Max:    ${stats.latency.max} ms`);

  console.log('\n── API STATUS DISTRIBUTION ──────────────────────────────────────────');
  for (const [status, count] of Object.entries(stats.statusDist).sort((a,b) => b[1]-a[1])) {
    const pct = ((count / stats.successCount) * 100).toFixed(1);
    console.log(`  ${String(status).padEnd(20)} ${String(count).padStart(4)} requests  (${pct}%)`);
  }

  console.log('\n── PER-DOMAIN BREAKDOWN ─────────────────────────────────────────────');
  console.log(`  ${'Domain'.padEnd(25)} ${'Category'.padEnd(15)} ${'Avg(ms)'.padStart(8)} ${'p95(ms)'.padStart(8)} ${'Statuses'}`);
  console.log('  ' + sep);
  for (const [domain, d] of Object.entries(stats.byDomain)) {
    const lats = d.latencies.sort((a,b) => a-b);
    const avg  = lats.length ? Math.round(lats.reduce((s,v)=>s+v,0)/lats.length) : 'ERR';
    const p95  = lats.length ? percentile(lats, 95) : 'ERR';
    const statusStr = Object.entries(d.statuses).map(([s,c])=>`${s}:${c}`).join(' ');
    console.log(`  ${domain.padEnd(25)} ${d.category.padEnd(15)} ${String(avg).padStart(8)} ${String(p95).padStart(8)}   ${statusStr}`);
  }

  console.log('\n── PER-CATEGORY SUMMARY ─────────────────────────────────────────────');
  for (const [cat, d] of Object.entries(stats.byCategory)) {
    const lats = d.latencies.sort((a,b) => a-b);
    const avg  = lats.length ? Math.round(lats.reduce((s,v)=>s+v,0)/lats.length) : 'N/A';
    const p95  = lats.length ? percentile(lats, 95) : 'N/A';
    const statusStr = Object.entries(d.statuses).map(([s,c])=>`${s}:${c}`).join(', ');
    console.log(`\n  ${cat.toUpperCase()}`);
    console.log(`    Avg: ${avg}ms  |  p95: ${p95}ms  |  Errors: ${d.errors}`);
    console.log(`    Statuses: ${statusStr || 'all errors'}`);
  }

  console.log('\n── SAMPLE RESPONSES ─────────────────────────────────────────────────');
  for (const r of stats.sampleResults) {
    console.log(`  ${r.email.padEnd(35)} ${String(r.latency).padStart(5)}ms  status=${r.status}  code=${r.code}`);
  }

  console.log('\n' + '═'.repeat(72));
  return stats;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\nGenerating ${TOTAL} test emails across ${domains.length} domains...`);
  const emails = generateEmails(TOTAL);
  console.log(`Starting benchmark: ${TOTAL} requests, concurrency=${CONCURRENCY}\n`);

  const start = Date.now();
  const results = await runBatch(emails, CONCURRENCY);
  const duration = Date.now() - start;

  const stats = analyze(results);
  printReport(stats, duration);

  // Write raw results to JSON for doc generation
  const fs = require('fs');
  fs.writeFileSync(
    '/Users/arihant.ja/Desktop/copilot/flowcharts/xverify_raw_results.json',
    JSON.stringify({ stats, duration, timestamp: new Date().toISOString() }, null, 2)
  );
  console.log('\n  Raw results saved to xverify_raw_results.json\n');
})();
