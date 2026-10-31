import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  rateLimit,
  generalRateLimit,
  explainRateLimit,
  createRateLimiter,
  getClientIp,
  GENERAL_LIMIT,
  EXPLAIN_LIMIT,
} from './rateLimit.js';

function createMockReqRes({ ip = '127.0.0.1', url = '/api/issues', originalUrl } = {}) {
  const actualOriginalUrl = originalUrl || url;
  const req = {
    ip,
    url,
    originalUrl: actualOriginalUrl,
    path: url.replace(/^\/api/, ''),
    headers: {},
  };
  const headers = {};
  let statusCode = 200;
  let jsonBody = null;

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    setHeader(name, value) {
      headers[name.toLowerCase()] = String(value);
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    json(body) {
      jsonBody = body;
      return res;
    },
  };

  return { req, res, getStatus: () => statusCode, getBody: () => jsonBody, headers };
}

beforeEach(() => {
  rateLimit.reset();
  generalRateLimit.reset();
  explainRateLimit.reset();
});

test('getClientIp identifies IP from headers or fallback', () => {
  assert.equal(getClientIp({ ip: '10.0.0.1' }), '10.0.0.1');
  assert.equal(getClientIp({ headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' } }), '203.0.113.195');
  assert.equal(getClientIp({ socket: { remoteAddress: '192.168.1.1' } }), '192.168.1.1');
  assert.equal(getClientIp({}), '127.0.0.1');
});

test('general rate limiter allows requests up to GENERAL_LIMIT', () => {
  const ip = '192.168.0.1';
  let nextCalled = 0;
  const next = () => {
    nextCalled++;
  };

  for (let i = 0; i < GENERAL_LIMIT; i++) {
    const { req, res } = createMockReqRes({ ip, url: '/api/issues' });
    rateLimit(req, res, next);
  }

  assert.equal(nextCalled, GENERAL_LIMIT, 'all requests within limit should call next()');

  // The next request must be blocked with 429
  const { req, res, getStatus, getBody } = createMockReqRes({ ip, url: '/api/issues' });
  rateLimit(req, res, next);

  assert.equal(getStatus(), 429);
  assert.equal(nextCalled, GENERAL_LIMIT, 'next() should NOT be called once rate limit is reached');
  assert.ok(res.getHeader('Retry-After'), 'Retry-After header must be set');
  assert.ok(Number(res.getHeader('Retry-After')) > 0, 'Retry-After must be > 0 seconds');
  assert.match(getBody().error, /Too many requests/i);
});

test('explain endpoint has a stricter limit (EXPLAIN_LIMIT)', () => {
  const ip = '192.168.0.2';
  let nextCalled = 0;
  const next = () => {
    nextCalled++;
  };

  // Up to EXPLAIN_LIMIT requests should succeed
  for (let i = 0; i < EXPLAIN_LIMIT; i++) {
    const { req, res } = createMockReqRes({ ip, url: '/api/explain', originalUrl: '/api/explain' });
    rateLimit(req, res, next);
  }

  assert.equal(nextCalled, EXPLAIN_LIMIT, 'explain requests up to limit should call next()');

  // Next explain request must be blocked with 429 and Retry-After
  const { req, res, getStatus, getBody } = createMockReqRes({
    ip,
    url: '/api/explain',
    originalUrl: '/api/explain',
  });
  rateLimit(req, res, next);

  assert.equal(getStatus(), 429);
  assert.equal(nextCalled, EXPLAIN_LIMIT);
  assert.ok(res.getHeader('Retry-After'));
  assert.match(getBody().error, /explanation/i);

  // But general requests from the same IP are NOT blocked because general limit has not been reached
  let generalNextCalled = false;
  const general = createMockReqRes({ ip, url: '/api/issues', originalUrl: '/api/issues' });
  rateLimit(general.req, general.res, () => {
    generalNextCalled = true;
  });

  assert.ok(generalNextCalled, 'general requests should still be allowed when only explain is limited');
  assert.equal(general.getStatus(), 200);
});

test('requests are tracked independently per IP', () => {
  const next = () => {};

  // Exhaust limit for IP 1
  for (let i = 0; i < EXPLAIN_LIMIT; i++) {
    const { req, res } = createMockReqRes({ ip: '1.1.1.1', url: '/api/explain' });
    rateLimit(req, res, next);
  }
  const blocked = createMockReqRes({ ip: '1.1.1.1', url: '/api/explain' });
  rateLimit(blocked.req, blocked.res, next);
  assert.equal(blocked.getStatus(), 429);

  // IP 2 is fresh and should not be blocked
  let ip2Allowed = false;
  const ip2 = createMockReqRes({ ip: '2.2.2.2', url: '/api/explain' });
  rateLimit(ip2.req, ip2.res, () => {
    ip2Allowed = true;
  });
  assert.ok(ip2Allowed);
  assert.equal(ip2.getStatus(), 200);
});

test('old entries expire and are pruned from the store', () => {
  const shortWindowLimiter = createRateLimiter({
    windowMs: 50, // 50ms window
    max: 2,
  });

  let nextCalled = 0;
  const next = () => {
    nextCalled++;
  };

  const ip = '10.0.0.99';
  const r1 = createMockReqRes({ ip });
  shortWindowLimiter(r1.req, r1.res, next);
  const r2 = createMockReqRes({ ip });
  shortWindowLimiter(r2.req, r2.res, next);

  // 3rd is blocked
  const r3 = createMockReqRes({ ip });
  shortWindowLimiter(r3.req, r3.res, next);
  assert.equal(r3.getStatus(), 429);

  // Wait 60ms for window to expire
  return new Promise((resolve) => {
    setTimeout(() => {
      let unblocked = false;
      const r4 = createMockReqRes({ ip });
      shortWindowLimiter(r4.req, r4.res, () => {
        unblocked = true;
      });
      assert.ok(unblocked, 'request after window expiry should be allowed');
      assert.equal(r4.getStatus(), 200);
      shortWindowLimiter.cleanup();
      resolve();
    }, 60);
  });
});

test('does not double count when rateLimit and explainRateLimit both run on the same request', () => {
  const ip = '10.0.0.50';
  let nextCount = 0;
  const next = () => {
    nextCount++;
  };

  // Run both middlewares on each request, simulating the chain in Express
  for (let i = 0; i < EXPLAIN_LIMIT; i++) {
    const { req, res } = createMockReqRes({ ip, url: '/api/explain', originalUrl: '/api/explain' });
    rateLimit(req, res, () => {
      explainRateLimit(req, res, next);
    });
  }

  // Exactly EXPLAIN_LIMIT should have passed through
  assert.equal(nextCount, EXPLAIN_LIMIT);

  // The next request must be blocked
  const blocked = createMockReqRes({ ip, url: '/api/explain', originalUrl: '/api/explain' });
  rateLimit(blocked.req, blocked.res, () => {
    explainRateLimit(blocked.req, blocked.res, next);
  });
  assert.equal(blocked.getStatus(), 429);
});
