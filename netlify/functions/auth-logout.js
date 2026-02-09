const { clearCookie, jsonResponse } = require("./lib/auth-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  return jsonResponse(
    200,
    { ok: true },
    { "Set-Cookie": clearCookie(event) }
  );
};
