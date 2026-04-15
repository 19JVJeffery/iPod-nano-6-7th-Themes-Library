const statusEl = document.getElementById("admin-status");
const panel = document.getElementById("moderation-panel");
const refreshButton = document.getElementById("refresh-submissions");
const loginForm = document.getElementById("admin-login-form");
const passwordInput = document.getElementById("admin-password");
const config = window.NANO_CONFIG || {};
const apiBase = (config.API_BASE_URL || "").replace(/\/+$/, "");
const tokenKey = "nano_admin_token";

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.className = isError ? "status error" : "status";
};

const tokenStore = {
  get: () => sessionStorage.getItem(tokenKey) || "",
  set: (value) => sessionStorage.setItem(tokenKey, value),
  clear: () => sessionStorage.removeItem(tokenKey)
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const api = async (path, options = {}) => {
  if (!apiBase) throw new Error("Missing API config. Set window.NANO_CONFIG.API_BASE_URL in config.js");
  const headers = { ...(options.headers || {}) };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${apiBase}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
};

const renderSubmissions = (items) => {
  if (!items.length) {
    panel.innerHTML = `<section class="panel panel--wide"><h2>No pending submissions</h2><p class="panel-copy">Queue is clear.</p></section>`;
    return;
  }

  panel.innerHTML = items
    .map(
      (item) => `
      <article class="submission-card">
        <h3>#${escapeHtml(item.pullNumber)} ${escapeHtml(item.title)}</h3>
        <p><strong>Author:</strong> ${escapeHtml(item.authorName || "Unknown")} • <strong>Device:</strong> ${escapeHtml(item.device || "Unknown")}</p>
        <p><strong>File:</strong> ${escapeHtml(item.fileName || "unknown")}</p>
        <p>${escapeHtml(item.description || "No description")}</p>
        <div class="submission-actions">
          <button class="button button--primary" data-action="approve" data-pr="${escapeHtml(item.pullNumber)}">Approve</button>
          <button class="button button--ghost" data-action="reject" data-pr="${escapeHtml(item.pullNumber)}">Reject</button>
          <a class="button button--ghost" target="_blank" rel="noopener noreferrer" href="${escapeHtml(item.pullUrl)}">Open PR</a>
        </div>
      </article>
    `
    )
    .join("");
};

const loadPending = async () => {
  const data = await api("/api/admin/submissions");
  renderSubmissions(data.items || []);
  setStatus(`Loaded ${(data.items || []).length} pending submission(s).`);
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await api("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordInput.value })
    });
    tokenStore.set(data.token);
    passwordInput.value = "";
    setStatus("Signed in.");
    await loadPending();
  } catch (error) {
    tokenStore.clear();
    setStatus(error.message, true);
  }
});

refreshButton.addEventListener("click", () => {
  loadPending().catch((error) => setStatus(error.message, true));
});

panel.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action][data-pr]");
  if (!button) return;
  const action = button.dataset.action;
  const pullNumber = Number(button.dataset.pr);
  if (!Number.isFinite(pullNumber)) return;
  try {
    button.disabled = true;
    await api("/api/admin/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, pullNumber })
    });
    await loadPending();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
});

if (tokenStore.get()) {
  loadPending().catch((error) => setStatus(error.message, true));
}
