const { clearCookie } = require("./lib/auth-utils");

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

  res.setHeader("Set-Cookie", clearCookie(req.headers));
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ ok: true, authEnabled: true });
};
