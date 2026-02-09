(function () {
  const LOGIN_PATH = "/login.html";
  const INDEX_PATH = "/index.html";
  const STATUS_URL = "/.netlify/functions/auth-status";
  const LOGIN_URL = "/.netlify/functions/auth-login";
  const LOGOUT_URL = "/.netlify/functions/auth-logout";

  function isSafeRedirect(target) {
    return typeof target === "string" && target.startsWith("/");
  }

  function getRedirectTarget() {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("redirect");
    return isSafeRedirect(target) ? target : INDEX_PATH;
  }

  async function getAuthStatus() {
    try {
      const response = await fetch(STATUS_URL, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return false;
      const data = await response.json();
      return !!data.authenticated;
    } catch {
      return false;
    }
  }

  async function login(password) {
    const response = await fetch(LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ password }),
    });
    return response.ok;
  }

  async function logout() {
    try {
      await fetch(LOGOUT_URL, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      window.location.replace(LOGIN_PATH);
    }
  }

  window.WOODNOTT_AUTH = {
    login,
    logout,
    status: getAuthStatus,
    getRedirectTarget,
  };

  const path = window.location.pathname;
  const isLoginPage = path === LOGIN_PATH || path.endsWith("/login.html");

  window.WOODNOTT_AUTH.ready = (async () => {
    const authenticated = await getAuthStatus();
    if (!isLoginPage && !authenticated) {
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(`${LOGIN_PATH}?redirect=${encodeURIComponent(current)}`);
      return;
    }
    if (isLoginPage && authenticated) {
      window.location.replace(getRedirectTarget());
    }
  })();
})();
