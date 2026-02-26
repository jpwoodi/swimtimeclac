const {
  buildCookie,
  createSessionToken,
} = require("./lib/auth-utils");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authEnabled = process.env.AUTH_ENABLED !== "false";
  if (!authEnabled) {
    return res.status(200).json({ ok: true, authEnabled: false, bypassed: true });
  }

  const expectedPassword = process.env.SITE_PASSWORD;
  const sessionSecret = process.env.AUTH_SESSION_SECRET;
  if (!expectedPassword || !sessionSecret) {
    return res.status(500).json({ error: "Auth is not configured", authEnabled: true });
  }

  const body = req.body || {};
  const password = typeof body.password === "string" ? body.password : "";

  if (!password || password !== expectedPassword) {
    return res.status(401).json({ error: "Invalid password", authEnabled: true });
  }

  const token = createSessionToken(sessionSecret);
  res.setHeader("Set-Cookie", buildCookie(token, req.headers));
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ ok: true, authEnabled: true });
};
