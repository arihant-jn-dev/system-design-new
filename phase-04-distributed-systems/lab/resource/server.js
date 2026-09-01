'use strict';
/**
 * The RESOURCE a distributed lock is supposed to protect.
 *
 * This is the piece people leave out of their mental model, and it is the
 * entire reason fencing works:
 *
 *   ⭐ THE RESOURCE ENFORCES THE TOKEN. NOT THE LOCK SERVICE, NOT THE CLIENT.
 *
 * A client that *believes* it still holds the lock can do no damage if the
 * thing it writes to refuses stale tokens.
 *
 *   POST /write  {token, value, clientId}
 *   GET  /state
 *   POST /mode   {fencing: true|false}
 *   POST /reset
 */

const http = require('node:http');

let state = {
  value: null,
  lastToken: 0, // highest token ever accepted
  fencing: true,
  log: [],
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req) {
  let raw = '';
  req.setEncoding('utf8');
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/state') return json(res, 200, state);

  if (url.pathname === '/reset' && req.method === 'POST') {
    const body = await readBody(req).catch(() => ({}));
    state = { value: null, lastToken: 0, fencing: body.fencing !== false, log: [] };
    return json(res, 200, state);
  }

  if (url.pathname === '/mode' && req.method === 'POST') {
    const body = await readBody(req).catch(() => ({}));
    state.fencing = body.fencing !== false;
    return json(res, 200, { fencing: state.fencing });
  }

  if (url.pathname === '/write' && req.method === 'POST') {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return json(res, 400, { error: 'invalid JSON' });
    }
    const token = Number(body.token ?? 0);
    const { value, clientId } = body;

    // ---- THE FENCING CHECK -------------------------------------------
    // Monotonic tokens: anything at or below what we have already accepted
    // came from a client whose leadership has since been superseded.
    if (state.fencing && token <= state.lastToken) {
      state.log.push({ clientId, token, value, accepted: false, reason: 'fenced' });
      return json(res, 409, {
        accepted: false,
        reason: 'FENCED',
        message: `token ${token} <= lastToken ${state.lastToken}`,
        lastToken: state.lastToken,
      });
    }

    state.value = value;
    if (token > state.lastToken) state.lastToken = token;
    state.log.push({ clientId, token, value, accepted: true });
    return json(res, 200, { accepted: true, value: state.value, lastToken: state.lastToken });
  }

  return json(res, 404, { error: 'not found' });
});

server.listen(Number(process.env.PORT ?? 7000), () =>
  console.log(`[resource] listening on :${process.env.PORT ?? 7000} (fencing=${state.fencing})`),
);
