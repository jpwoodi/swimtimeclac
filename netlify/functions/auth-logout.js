const { clearCookie, jsonResponse } = require("./lib/auth-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const authEnabled = process.env.AUTH_ENABLED !== "false";
  if (!authEnabled) {
    return jsonResponse(200, { ok: true, authEnabled: false, bypassed: true });
  }

  return jsonResponse(
    200,
    { ok: true, authEnabled: true },
    { "Set-Cookie": clearCookie(event) }
  );
};
