const {
  buildCookie,
  createSessionToken,
  jsonResponse,
} = require("./lib/auth-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const expectedPassword = process.env.SITE_PASSWORD;
  const sessionSecret = process.env.AUTH_SESSION_SECRET;
  if (!expectedPassword || !sessionSecret) {
    return jsonResponse(500, { error: "Auth is not configured" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!password || password !== expectedPassword) {
    return jsonResponse(401, { error: "Invalid password" });
  }

  const token = createSessionToken(sessionSecret);
  return jsonResponse(
    200,
    { ok: true },
    { "Set-Cookie": buildCookie(token, event) }
  );
};
