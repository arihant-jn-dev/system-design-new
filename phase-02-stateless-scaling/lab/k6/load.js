import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

/**
 * Open-model load generator (same rationale as the Phase 0 lab: a closed model
 * would self-throttle when the system degrades and hide the failure).
 *
 * It also counts requests PER INSTANCE via the x-instance header, so you can
 * see the load balancing distribution directly rather than inferring it.
 */

const RPS = Number(__ENV.RPS || 100);
const DURATION = __ENV.DURATION || '30s';
const TARGET = __ENV.TARGET || 'http://nginx/api/work';

export const perInstance = {
  app1: new Counter('served_app1'),
  app2: new Counter('served_app2'),
  app3: new Counter('served_app3'),
  unknown: new Counter('served_unknown'),
};

export const options = {
  scenarios: {
    open_model: {
      executor: 'constant-arrival-rate',
      rate: RPS,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Number(__ENV.VUS || 100),
      maxVUs: Number(__ENV.MAX_VUS || 1000),
    },
  },
  summaryTrendStats: ['min', 'med', 'avg', 'p(90)', 'p(95)', 'p(99)', 'max'],
  // Don't abort on failures -- failures are the experiment.
  thresholds: {},
};

export default function () {
  const res = http.get(TARGET);
  check(res, { 'status 200': (r) => r.status === 200 });

  const instance = res.headers['X-Instance'] || 'unknown';
  (perInstance[instance] || perInstance.unknown).add(1);
}
