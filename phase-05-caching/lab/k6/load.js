import http from 'k6/http';
import { check } from 'k6';

/**
 * Open-model load against the cached endpoint.
 *
 * ZIPFIAN key selection, not uniform -- because real traffic is skewed
 * (Phase 0 note 10) and that skew is exactly what makes caching work. With
 * uniform keys over 10k products a small cache would be useless; with Zipf,
 * a few hundred keys carry most of the traffic.
 */

const RPS = Number(__ENV.RPS || 300);
const DURATION = __ENV.DURATION || '40s';
const HOT_KEYS = Number(__ENV.HOT_KEYS || 10);

export const options = {
  scenarios: {
    open: {
      executor: 'constant-arrival-rate',
      rate: RPS,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 200,
      maxVUs: 2000,
    },
  },
  summaryTrendStats: ['min', 'med', 'avg', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: {},
};

function zipfKey() {
  // ~80% of requests hit the hot set, 20% spread over the long tail.
  if (Math.random() < 0.8) return 1 + Math.floor(Math.random() * HOT_KEYS);
  return 1 + Math.floor(Math.random() * 10000);
}

export default function () {
  const res = http.get(`http://app:3000/api/product/${zipfKey()}`);
  check(res, { 'status 200': (r) => r.status === 200 });
}
