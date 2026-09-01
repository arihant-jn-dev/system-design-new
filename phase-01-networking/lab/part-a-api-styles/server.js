'use strict';
/**
 * ONE logical operation ("fetch a product", "watch its price change"),
 * served three ways so you can compare them directly:
 *
 *   REST / JSON   GET  http://:3000/rest/products/1
 *   SSE           GET  http://:3000/sse/products/1/price?count=100
 *   gRPC          ProductService.GetProduct / WatchPrice  on :50051
 *
 * Every response reports the exact number of bytes it serialised, so the
 * payload comparison is measured rather than asserted.
 */

const http = require('node:http');
const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// ---------------------------------------------------------------- the data

function makeProduct(id) {
  return {
    id: Number(id),
    name: 'Aeron Ergonomic Office Chair',
    description:
      'Breathable mesh back, adjustable lumbar support, 12-year warranty. ' +
      'Ships flat-packed. Assembly required.',
    price_cents: 129900,
    currency: 'INR',
    stock: 42,
    active: true,
    category: 'furniture/office/seating',
    rating: 4.6,
    review_count: 1873,
    updated_at: '2024-01-15T09:30:00Z',
  };
}

// ------------------------------------------------------------ proto loading

const packageDefinition = protoLoader.loadSync(path.join(__dirname, 'product.proto'), {
  keepCase: true, // keep snake_case field names so JSON and protobuf carry identical data
  longs: Number,
  defaults: true,
  oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDefinition).productlab;

// proto-loader attaches a serializer to every method. Borrowing GetProduct's
// response serializer lets us encode a Product to protobuf bytes outside of an
// RPC call — which is how the REST handler below can report both encodings'
// sizes for the exact same object.
const productSerialize = proto.ProductService.service.GetProduct.responseSerialize;

// --------------------------------------------------------------- HTTP server

function json(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') return json(res, 200, { ok: true });

  // ---- REST / JSON -------------------------------------------------------
  const restMatch = url.pathname.match(/^\/rest\/products\/(\d+)$/);
  if (restMatch) {
    const product = makeProduct(restMatch[1]);
    const jsonBytes = Buffer.byteLength(JSON.stringify(product));
    const protoBytes = productSerialize(product).length;
    return json(res, 200, product, {
      'x-json-bytes': String(jsonBytes),
      'x-protobuf-bytes': String(protoBytes),
    });
  }

  // ---- SSE ---------------------------------------------------------------
  // One long-lived HTTP response. Note what we get for free: the browser's
  // EventSource reconnects automatically and replays from `id:` via the
  // Last-Event-ID header. With WebSockets you would build both yourself.
  const sseMatch = url.pathname.match(/^\/sse\/products\/(\d+)\/price$/);
  if (sseMatch) {
    const id = Number(sseMatch[1]);
    const count = Math.min(1000, Math.max(1, Number(url.searchParams.get('count') ?? 100)));
    const intervalMs = Math.max(0, Number(url.searchParams.get('interval') ?? 0));

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no', // stop nginx-style proxies buffering the stream
    });

    let seq = Number(req.headers['last-event-id'] ?? 0);
    const sent = seq;
    let bytes = 0;

    const push = () => {
      seq += 1;
      const data = JSON.stringify({ id, price_cents: 129900 + seq, seq });
      const frame = `id: ${seq}\nevent: price\ndata: ${data}\n\n`;
      bytes += Buffer.byteLength(frame);
      res.write(frame);

      if (seq - sent >= count) {
        res.write(`event: done\ndata: ${JSON.stringify({ events: count, bytes })}\n\n`);
        return res.end();
      }
      if (intervalMs > 0) setTimeout(push, intervalMs);
      else setImmediate(push);
    };
    push();

    req.on('close', () => res.end());
    return;
  }

  return json(res, 404, { error: 'not found' });
});

// --------------------------------------------------------------- gRPC server

function getProduct(call, callback) {
  callback(null, makeProduct(call.request.id));
}

function watchPrice(call) {
  const { id, count } = call.request;
  const total = Math.min(1000, Math.max(1, count || 100));
  for (let seq = 1; seq <= total; seq++) {
    call.write({ id, price_cents: 129900 + seq, seq });
  }
  call.end();
}

const grpcServer = new grpc.Server();
grpcServer.addService(proto.ProductService.service, {
  GetProduct: getProduct,
  WatchPrice: watchPrice,
});

// ------------------------------------------------------------------- start

const HTTP_PORT = Number(process.env.HTTP_PORT ?? 3000);
const GRPC_PORT = Number(process.env.GRPC_PORT ?? 50051);

httpServer.listen(HTTP_PORT, () => {
  console.log(`[api-styles] REST + SSE on :${HTTP_PORT}`);
});

grpcServer.bindAsync(
  `0.0.0.0:${GRPC_PORT}`,
  grpc.ServerCredentials.createInsecure(),
  (err, port) => {
    if (err) {
      console.error('[api-styles] gRPC bind failed:', err);
      process.exit(1);
    }
    console.log(`[api-styles] gRPC on :${port}`);
  },
);
