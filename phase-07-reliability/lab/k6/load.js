import http from 'k6/http';
import { check } from 'k6';

const RPS = Number(__ENV.RPS || 200);
const DURATION = __ENV.DURATION || '30s';

export const options = {
  scenarios: {
    open: {
      executor: 'constant-arrival-rate',
      rate: RPS,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 300,
      maxVUs: 3000,
    },
  },
  summaryTrendStats: ['min', 'med', 'avg', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: {},
};

export default function () {
  const res = http.get('http://app:3000/api/thing', { timeout: '30s' });
  check(res, { 'status 200': (r) => r.status === 200 });
}
