export const GENERAL_LIMIT = 60; // 60 requests per minute for general API
export const EXPLAIN_LIMIT = 10;  // 10 requests per minute for expensive AI explanations
export const WINDOW_MS = 60 * 1000; // 1 minute in milliseconds

//Extracts client IP from request headers or socket.
export function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Creates an in-memory rate limiter middleware with sliding-window tracking.
 *
 * @param {object} options
 * @param {number} [options.windowMs] - Window size in ms (default 60,000ms)
 * @param {number|Function} [options.max] - Max requests allowed in window (default 60)
 * @param {string|Function} [options.message] - Error message on 429
 * @param {string} [options.keyPrefix] - Prefix for keys in Map
 * @param {string} [options.limiterId] - ID to avoid double-counting in middleware chain
 */
export function createRateLimiter({
  windowMs = WINDOW_MS,
  max = GENERAL_LIMIT,
  message = 'Too many requests. Please try again later.',
  keyPrefix = '',
  limiterId = '',
} = {}) {
  const store = new Map();

  // Periodic cleanup to prune expired entries for inactive IPs
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of store.entries()) {
      const valid = timestamps.filter((t) => t > now - windowMs);
      if (valid.length === 0) {
        store.delete(key);
      } else {
        store.set(key, valid);
      }
    }
  }, Math.max(10000, windowMs));

  if (timer.unref) {
    timer.unref();
  }

  function limiter(req, res, next) {
    // Avoid double counting if the same limiter executes twice in a single request chain
    if (limiterId) {
      req._rateLimited = req._rateLimited || {};
      if (req._rateLimited[limiterId]) {
        return next();
      }
      req._rateLimited[limiterId] = true;
    }

    const ip = getClientIp(req);
    const key = `${keyPrefix}${ip}`;
    const now = Date.now();

    const existing = store.get(key) || [];
    const valid = existing.filter((t) => t > now - windowMs);

    const limit = typeof max === 'function' ? max(req) : max;

    if (valid.length >= limit) {
      const oldest = valid[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));

      const msg =
        typeof message === 'function'
          ? message(req, retryAfterSeconds)
          : message;

      return res.status(429).json({
        error: msg,
        retryAfter: retryAfterSeconds,
      });
    }

    valid.push(now);
    store.set(key, valid);
    next();
  }

  limiter.store = store;
  limiter.reset = () => store.clear();
  limiter.cleanup = () => {
    if (timer) clearInterval(timer);
    store.clear();
  };

  return limiter;
}

export const generalRateLimit = createRateLimiter({
  windowMs: WINDOW_MS,
  max: GENERAL_LIMIT,
  message: (_req, retryAfter) =>
    `Too many requests. Please try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`,
  keyPrefix: 'general:',
  limiterId: 'general',
});

export const explainRateLimit = createRateLimiter({
  windowMs: WINDOW_MS,
  max: EXPLAIN_LIMIT,
  message: (_req, retryAfter) =>
    `Too many explanation requests. Please try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`,
  keyPrefix: 'explain:',
  limiterId: 'explain',
});

/**
 * Default API rate limiter middleware.
 * Dispatches to stricter explainRateLimit for /explain endpoints,
 * and generalRateLimit for all other API endpoints.
 */
export function rateLimit(req, res, next) {
  const url = req.originalUrl || (req.baseUrl ? req.baseUrl + req.path : req.url) || '';
  if (url.includes('/explain')) {
    return explainRateLimit(req, res, (err) => {
      if (err) return next(err);
      generalRateLimit(req, res, next);
    });
  }
  return generalRateLimit(req, res, next);
}

rateLimit.reset = () => {
  generalRateLimit.reset();
  explainRateLimit.reset();
};
rateLimit.store = generalRateLimit.store;
rateLimit.explainStore = explainRateLimit.store;
