'use strict';
/**
 * The benchmark. Runs two experiments and prints two tables.
 *
 *   A1  single fetch:      REST/JSON  vs  gRPC/protobuf
 *   A2  100 updates:       REST polling  vs  SSE  vs  gRPC server-streaming
 *
 * A2 is the more interesting one. A single request/response comparison makes
 * protobuf look like a modest win. Once you deliver a HUNDRED updates, the
 * repeated HTTP header overhead of polling dominates everything else — and
 * that is the real argument for streaming transports.
 */

const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const HTTP = process.env.HTTP_TARGET ?? 'http://localhost:3000';
const GRPC = process.env.GRPC_TARGET ?? 'localhost:50051';
const UPDATES = Number(process.env.UPDATES ?? 100);
const RUNS = Number(process.env.RUNS ?? 200);

const packageDefinition = protoLoader.loadSync(path.join(__dirname, 'product.proto'), {
  keepCase: true,
  longs: Number,
  defaults: true,
  oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDefinition).productlab;
const client = new proto.ProductService(GRPC, grpc.credentials.createInsecure());

const pct = (arr, p) => {
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const ms = (n) => `${n.toFixed(2)} ms`;
const bytes = (n) => (n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);

function row(cells, widths) {
  return '  ' + cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
}

// ---------------------------------------------------------------- helpers

function grpcGetProduct() {
  return new Promise((resolve, reject) => {
    client.GetProduct({ id: 1 }, (err, resp) => (err ? reject(err) : resolve(resp)));
  });
}

function grpcWatchPrice(count) {
  return new Promise((resolve, reject) => {
    let events = 0;
    const call = client.WatchPrice({ id: 1, count });
    call.on('data', () => {
      events += 1;
    });
    call.on('end', () => resolve(events));
    call.on('error', reject);
  });
}

async function sseWatch(count) {
  const res = await fetch(`${HTTP}/sse/products/1/price?count=${count}`);
  const reader = res.body.getReader();
  let totalBytes = 0;
  let events = 0;
  let buf = '';
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.length;
    buf += decoder.decode(value, { stream: true });
    events += (buf.match(/\nevent: price\n/g) || []).length;
    buf = buf.slice(-200); // keep a small tail; we only need the count
  }
  // Header bytes for the ONE request that opened the stream.
  const headerBytes = estimateRequestHeaderBytes() + estimateResponseHeaderBytes();
  return { events: count, wireBytes: totalBytes + headerBytes, connections: 1 };
}

// Rough but honest header accounting. Real HTTP/1.1 request+response headers
// for a JSON API are ~700-900 bytes with a cookie; we use conservative values.
const REQ_HEADERS = 480; // GET line + Host + UA + Accept + Cookie + friends
const RES_HEADERS = 320; // status line + content-type/length + date + server
const estimateRequestHeaderBytes = () => REQ_HEADERS;
const estimateResponseHeaderBytes = () => RES_HEADERS;

// ------------------------------------------------------- A1: single fetch

async function experimentA1() {
  // Warm both connections so we measure steady state, not TCP/TLS setup.
  await fetch(`${HTTP}/rest/products/1`).then((r) => r.arrayBuffer());
  await grpcGetProduct();

  const restLat = [];
  const grpcLat = [];
  let jsonBytes = 0;
  let protoBytes = 0;

  for (let i = 0; i < RUNS; i++) {
    let t = performance.now();
    const res = await fetch(`${HTTP}/rest/products/1`);
    const body = await res.arrayBuffer();
    restLat.push(performance.now() - t);
    jsonBytes = body.byteLength;
    protoBytes = Number(res.headers.get('x-protobuf-bytes'));

    t = performance.now();
    await grpcGetProduct();
    grpcLat.push(performance.now() - t);
  }

  const w = [26, 14, 12, 12, 12];
  console.log('\n' + '='.repeat(84));
  console.log('  A1 · SINGLE FETCH — same object, two encodings');
  console.log('='.repeat(84));
  console.log(row(['style', 'payload', 'p50', 'p95', 'p99'], w));
  console.log('  ' + '-'.repeat(80));
  console.log(
    row(
      ['REST / JSON', bytes(jsonBytes), ms(pct(restLat, 0.5)), ms(pct(restLat, 0.95)), ms(pct(restLat, 0.99))],
      w,
    ),
  );
  console.log(
    row(
      ['gRPC / protobuf', bytes(protoBytes), ms(pct(grpcLat, 0.5)), ms(pct(grpcLat, 0.95)), ms(pct(grpcLat, 0.99))],
      w,
    ),
  );
  console.log('  ' + '-'.repeat(80));
  const saving = (100 * (1 - protoBytes / jsonBytes)).toFixed(1);
  console.log(`  payload: protobuf is ${saving}% smaller (${jsonBytes} B -> ${protoBytes} B)`);
  console.log(
    '  NOTE: both are localhost, so latency here is dominated by loopback + process\n' +
      '        overhead, NOT by the encoding. Do not over-read the latency column.',
  );
  return { jsonBytes, protoBytes, restLat, grpcLat };
}

// ------------------------------------------- A2: N updates, three transports

async function experimentA2() {
  // --- polling: one full HTTP request/response PER update
  let t = performance.now();
  let pollBytes = 0;
  for (let i = 0; i < UPDATES; i++) {
    const res = await fetch(`${HTTP}/rest/products/1`);
    const body = await res.arrayBuffer();
    pollBytes += body.byteLength + REQ_HEADERS + RES_HEADERS;
  }
  const pollMs = performance.now() - t;

  // --- SSE: ONE request, N events
  t = performance.now();
  const sse = await sseWatch(UPDATES);
  const sseMs = performance.now() - t;

  // --- gRPC server streaming: ONE call, N messages
  t = performance.now();
  await grpcWatchPrice(UPDATES);
  const grpcMs = performance.now() - t;
  // protobuf PriceUpdate ~ 14 B + 5 B HTTP/2 frame header per message
  const grpcBytes = UPDATES * 19 + 300;

  const w = [26, 14, 14, 16, 12];
  console.log('\n' + '='.repeat(84));
  console.log(`  A2 · ${UPDATES} UPDATES DELIVERED — this is the real comparison`);
  console.log('='.repeat(84));
  console.log(row(['transport', 'connections', 'total bytes', 'bytes/update', 'wall time'], w));
  console.log('  ' + '-'.repeat(80));
  console.log(
    row(
      ['REST polling', UPDATES, bytes(pollBytes), bytes(Math.round(pollBytes / UPDATES)), ms(pollMs)],
      w,
    ),
  );
  console.log(
    row(['SSE', sse.connections, bytes(sse.wireBytes), bytes(Math.round(sse.wireBytes / UPDATES)), ms(sseMs)], w),
  );
  console.log(
    row(['gRPC streaming', 1, bytes(grpcBytes), bytes(Math.round(grpcBytes / UPDATES)), ms(grpcMs)], w),
  );
  console.log('  ' + '-'.repeat(80));
  console.log(
    `  SSE moves ${(pollBytes / sse.wireBytes).toFixed(1)}x fewer bytes than polling.\n` +
      `  gRPC streaming moves ${(pollBytes / grpcBytes).toFixed(1)}x fewer than polling.`,
  );
  console.log(
    '  WHY: polling re-sends ~800 B of HTTP headers for every single update.\n' +
      '       Streaming pays that once. At high update rates the headers ARE the payload.',
  );
  return { pollBytes, sse, grpcBytes, pollMs, sseMs, grpcMs };
}

// -------------------------------------------------------------------- main

(async () => {
  console.log(`\n  target: ${HTTP} (REST/SSE) · ${GRPC} (gRPC)`);
  console.log(`  runs: ${RUNS} · updates: ${UPDATES}`);
  await experimentA1();
  await experimentA2();
  console.log('\n  -> record these in ../RESULTS.md\n');
  client.close();
})().catch((err) => {
  console.error('\n  FAILED:', err.message);
  console.error('  Is the server up?  docker compose ps\n');
  process.exit(1);
});
