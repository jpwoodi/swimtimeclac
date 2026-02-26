const {
  getAuthCookie,
  verifySessionToken,
} = require("./lib/auth-utils");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authEnabled = process.env.AUTH_ENABLED !== "false";
  if (!authEnabled) {
    return res.status(200).json({ authenticated: true, authEnabled: false });
  }

  const sessionSecret = process.env.AUTH_SESSION_SECRET;
  if (!sessionSecret) {
    return res.status(500).json({ error: "Auth is not configured", authenticated: false, authEnabled: true });
  }

  const token = getAuthCookie(req.headers);
  const authenticated = verifySessionToken(token, sessionSecret);

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ authenticated, authEnabled: true });
};
