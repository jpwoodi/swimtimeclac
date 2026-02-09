const crypto = require("crypto");

const COOKIE_NAME = "__Host-woodnott_auth";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function getHeader(headers, name) {
  if (!headers) return "";
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      return headers[key] || "";
    }
  }
  return "";
}

function parseCookies(headers) {
  const cookieHeader = getHeader(headers, "cookie");
  const pairs = cookieHeader.split(";").map(v => v.trim()).filter(Boolean);
  const cookies = {};
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx);
    const value = pair.slice(idx + 1);
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function sign(payloadBase64, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(payloadBase64)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function createSessionToken(secret) {
  const payloadObj = {
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
    nonce: crypto.randomBytes(16).toString("hex"),
  };
  const payloadBase64 = base64UrlEncode(JSON.stringify(payloadObj));
  const signature = sign(payloadBase64, secret);
  return `${payloadBase64}.${signature}`;
}

function verifySessionToken(token, secret) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payloadBase64, providedSig] = parts;
  const expectedSig = sign(payloadBase64, secret);
  if (!safeEqual(providedSig, expectedSig)) return false;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadBase64));
    if (!payload || typeof payload.exp !== "number") return false;
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

function isSecureRequest(event) {
  const proto = getHeader(event.headers, "x-forwarded-proto");
  const host = getHeader(event.headers, "host");
  if (proto.toLowerCase() === "https") return true;
  return !/localhost|127\.0\.0\.1/i.test(host);
}

function buildCookie(token, event) {
  const secure = isSecureRequest(event) ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

function clearCookie(event) {
  const secure = isSecureRequest(event) ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function jsonResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function getAuthCookie(headers) {
  const cookies = parseCookies(headers);
  return cookies[COOKIE_NAME] || "";
}

module.exports = {
  buildCookie,
  clearCookie,
  createSessionToken,
  getAuthCookie,
  jsonResponse,
  verifySessionToken,
};
