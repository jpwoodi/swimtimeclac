// Vercel Edge Middleware: enforce the site password gate on HTML pages.
//
// The API routes already verify the session cookie server-side; before this
// middleware, static HTML relied on a client-side redirect in auth.js, so
// page content was fetchable without a session. This verifies the same
// HMAC-signed cookie issued by /api/auth (see lib/auth-utils.js) using Web
// Crypto, and redirects unauthenticated page requests to /login.html.

const COOKIE_NAME = "__Host-woodnott_auth";
const LOGIN_PATH = "/login.html";

function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    if (pair.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(pair.slice(idx + 1));
      } catch {
        return "";
      }
    }
  }
  return "";
}

function base64UrlToUint8(input) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let raw = "";
  for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqualString(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function verifySessionToken(token, secret) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payloadBase64, providedSig] = parts;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadBase64)
  );
  const expectedSig = bufferToBase64Url(signature);
  if (!timingSafeEqualString(providedSig, expectedSig)) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToUint8(payloadBase64)));
    if (!payload || typeof payload.exp !== "number") return false;
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

function isGatedPage(pathname) {
  if (pathname === LOGIN_PATH) return false;
  return pathname === "/" || pathname.endsWith("/") || pathname.endsWith(".html");
}

export default async function middleware(request) {
  const url = new URL(request.url);

  if (!isGatedPage(url.pathname)) {
    return; // static assets and /api/* pass through (APIs do their own auth)
  }

  if (process.env.AUTH_ENABLED === "false") {
    return;
  }

  const sessionSecret = process.env.AUTH_SESSION_SECRET;
  if (!sessionSecret) {
    // Misconfigured deploy: keep today's behavior (client-side gate) rather
    // than locking every page behind a login that cannot succeed.
    return;
  }

  const token = getCookie(request, COOKIE_NAME);
  if (await verifySessionToken(token, sessionSecret)) {
    return;
  }

  const redirectTarget = `${url.pathname}${url.search}`;
  const loginUrl = new URL(
    `${LOGIN_PATH}?redirect=${encodeURIComponent(redirectTarget)}`,
    url.origin
  );
  return Response.redirect(loginUrl, 302);
}
