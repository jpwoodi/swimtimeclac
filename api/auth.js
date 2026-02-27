const {
  buildCookie,
  clearCookie,
  createSessionToken,
  getAuthCookie,
  verifySessionToken,
} = require("./lib/auth-utils");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true });
  }

  const action = req.query.action;

  if (action === "status") {
    return handleStatus(req, res);
  } else if (action === "login") {
    return handleLogin(req, res);
  } else if (action === "logout") {
    return handleLogout(req, res);
  }

  return res.status(400).json({ error: "Invalid action. Use ?action=status|login|logout" });
};

async function handleStatus(req, res) {
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
}

async function handleLogin(req, res) {
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
}

async function handleLogout(req, res) {
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
}
