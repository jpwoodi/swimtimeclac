(function () {
  const LOGIN_PATH = "/login.html";
  const STORAGE_KEY = "woodnott_site_auth";
  const EXPECTED_PASSWORD = "Woodnott2026";

  function isAuthenticated() {
    return sessionStorage.getItem(STORAGE_KEY) === "ok";
  }

  function getRedirectTarget() {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("redirect");
    if (target && target.startsWith("/")) {
      return target;
    }
    return "/index.html";
  }

  window.WOODNOTT_AUTH = {
    login(password) {
      if (password === EXPECTED_PASSWORD) {
        sessionStorage.setItem(STORAGE_KEY, "ok");
        return true;
      }
      return false;
    },
    logout() {
      sessionStorage.removeItem(STORAGE_KEY);
      window.location.replace(LOGIN_PATH);
    },
    isAuthenticated
  };

  const path = window.location.pathname;
  const isLoginPage = path === "/login.html" || path.endsWith("/login.html");

  if (!isLoginPage && !isAuthenticated()) {
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(`${LOGIN_PATH}?redirect=${encodeURIComponent(current)}`);
    return;
  }

  if (isLoginPage && isAuthenticated()) {
    window.location.replace(getRedirectTarget());
  }
})();
