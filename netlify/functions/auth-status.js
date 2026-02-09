const {
  getAuthCookie,
  jsonResponse,
  verifySessionToken,
} = require("./lib/auth-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const sessionSecret = process.env.AUTH_SESSION_SECRET;
  if (!sessionSecret) {
    return jsonResponse(500, { error: "Auth is not configured" });
  }

  const token = getAuthCookie(event.headers);
  const authenticated = verifySessionToken(token, sessionSecret);
  return jsonResponse(200, { authenticated });
};
