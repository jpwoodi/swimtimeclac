const crypto = require('crypto');
const { getAuthCookie, verifySessionToken } = require('./auth-utils');

const loginAttempts = new Map();
const DEFAULT_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LOGIN_MAX_ATTEMPTS = 8;

function getHeader(headers, name) {
  if (!headers) return '';
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      return headers[key] || '';
    }
  }
  return '';
}

function parseOriginHost(origin) {
  if (!origin) return '';
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return '';
  }
}

function getRequestHost(headers) {
  return (
    getHeader(headers, 'x-forwarded-host') ||
    getHeader(headers, 'host') ||
    ''
  ).toLowerCase();
}

function isSameOriginRequest(headers) {
  const origin = getHeader(headers, 'origin');
  if (!origin) return false;
  return parseOriginHost(origin) === getRequestHost(headers);
}

function getClientIp(headers) {
  const forwardedFor = getHeader(headers, 'x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return getHeader(headers, 'x-real-ip') || 'unknown';
}

function secureCompareString(left, right) {
  const leftBuf = Buffer.from(String(left || ''), 'utf8');
  const rightBuf = Buffer.from(String(right || ''), 'utf8');
  if (leftBuf.length !== rightBuf.length) return false;
  return crypto.timingSafeEqual(leftBuf, rightBuf);
}

function isSiteAuthEnabled() {
  return process.env.AUTH_ENABLED !== 'false';
}

function isAuthenticatedSiteRequest(req) {
  if (!isSiteAuthEnabled()) return true;

  const sessionSecret = process.env.AUTH_SESSION_SECRET;
  if (!sessionSecret) return false;

  const token = getAuthCookie(req.headers);
  return verifySessionToken(token, sessionSecret);
}

function requireSiteAuth(req, res) {
  if (isAuthenticatedSiteRequest(req)) {
    return true;
  }
  res.status(401).json({ error: 'Authentication required' });
  return false;
}

function requireSameOriginWrite(req, res) {
  if (isSameOriginRequest(req.headers)) {
    return true;
  }
  res.status(403).json({ error: 'Cross-site write requests are not allowed' });
  return false;
}

function allowSecretBearer(req, secret) {
  if (!secret) return false;
  const provided = getHeader(req.headers, 'authorization');
  if (!provided) return false;
  return secureCompareString(provided, `Bearer ${secret}`);
}

function consumeLoginAttempt(req, options = {}) {
  const windowMs = options.windowMs || DEFAULT_LOGIN_WINDOW_MS;
  const maxAttempts = options.maxAttempts || DEFAULT_LOGIN_MAX_ATTEMPTS;
  const key = getClientIp(req.headers);
  const now = Date.now();
  const cutoff = now - windowMs;

  for (const [attemptKey, entry] of loginAttempts.entries()) {
    if (!entry || entry.lastAttempt < cutoff) {
      loginAttempts.delete(attemptKey);
    }
  }

  const entry = loginAttempts.get(key) || { count: 0, firstAttempt: now, lastAttempt: now };
  if (entry.lastAttempt < cutoff) {
    entry.count = 0;
    entry.firstAttempt = now;
  }

  entry.count += 1;
  entry.lastAttempt = now;
  loginAttempts.set(key, entry);

  if (entry.count > maxAttempts) {
    const retryAfterMs = windowMs - (now - entry.firstAttempt);
    return {
      limited: true,
      retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  return { limited: false, retryAfterSec: 0 };
}

function resetLoginAttempts(req) {
  loginAttempts.delete(getClientIp(req.headers));
}

module.exports = {
  allowSecretBearer,
  consumeLoginAttempt,
  getHeader,
  isAuthenticatedSiteRequest,
  requireSameOriginWrite,
  requireSiteAuth,
  resetLoginAttempts,
  secureCompareString,
};
