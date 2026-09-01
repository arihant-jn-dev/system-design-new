import http from 'k6/http';
import { check } from 'k6';

/**
 * Open-model load generator.
 *
 * `constant-arrival-rate` sends RPS requests per second REGARDLESS of whether
 * previous ones have come back. That matters enormously:
 *
 *   closed model (fixed VUs waiting for responses)
 *       -> if the system slows down, the generator sends FEWER requests.
 *          Load self-throttles. Overload is hidden. Your graphs look fine.
 *          This is "coordinated omission" and it is why most load tests lie.
 *
 *   open model (constant arrival rate)   <- what we use
 *       -> if the system slows down, requests keep arriving and pile up.
 *          Queueing shows up in the numbers, exactly like real users.
 *
 * Configure with env vars, e.g.
 *   docker compose run --rm k6 run -e TARGET=/api/fanout?n=100 -e RPS=5 /scripts/load.js
 */

const TARGET = __ENV.TARGET || '/api/simple';
const RPS = Number(__ENV.RPS || 200);
const DURATION = __ENV.DURATION || '30s';

export const options = {
  scenarios: {
    open_model: {
      executor: 'constant-arrival-rate',
      rate: RPS,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Number(__ENV.VUS || 200),
      maxVUs: Number(__ENV.MAX_VUS || 2000),
    },
  },
  // The whole point of the lab: never look at avg alone.
  summaryTrendStats: ['min', 'med', 'avg', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const URL = `http://app:3000${TARGET}`;

export function setup() {
  console.log(`\n>>> ${URL}  @ ${RPS} req/s for ${DURATION}\n`);
}

export default function () {
  const res = http.get(URL);
  check(res, { 'status is 200': (r) => r.status === 200 });
}
