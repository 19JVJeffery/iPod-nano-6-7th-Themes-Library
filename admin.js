const statusEl = document.getElementById("admin-status");
const panel = document.getElementById("moderation-panel");
const loginForm = document.getElementById("admin-login-form");
const passwordInput = document.getElementById("admin-password");
const refreshButton = document.getElementById("refresh-submissions");
const config = window.NANO_CONFIG || {};
const apiBase = (config.API_BASE_URL || "").replace(/\/+$/, "");
const tokenKey = "nano_admin_token";

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.className = isError ? "status error" : "status";
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const token = {
  get() {
    return sessionStorage.getItem(tokenKey) || "";
  },
  set(value) {
    sessionStorage.setItem(tokenKey, value);
  },
  clear() {
    sessionStorage.removeItem(tokenKey);
  }
};

const api = async (path, options = {}) => {
  if (!apiBase) throw new Error("Missing API base URL. Set window.NANO_CONFIG.API_BASE_URL in config.js");
  const headers = { ...(options.headers || {}) };
  const authToken = token.get();
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const response = await fetch(`${apiBase}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
};

const renderSubmissions = (submissions) => {
  if (!submissions.length) {
    panel.innerHTML = `<section class="panel panel--wide"><h2>No pending submissions</h2><p class="panel-copy">Queue is clear.</p></section>`;
    return;
  }

  panel.innerHTML = submissions
    .map((item) => {
      const sizeMb = (Number(item.fileSize || 0) / 1024 / 1024).toFixed(1);
      return `
      <article class="submission-card">
        <h3>${escapeHtml(item.themeName)}</h3>
        <p><strong>Submission ID:</strong> ${escapeHtml(item.id)}</p>
        <p><strong>Author:</strong> ${escapeHtml(item.authorName)} • <strong>Device:</strong> ${escapeHtml(item.device)}</p>
        <p><strong>File:</strong> ${escapeHtml(item.fileName)} (${escapeHtml(sizeMb)} MB)</p>
        <p><strong>Submitted:</strong> ${escapeHtml(new Date(item.createdAt).toLocaleString())}</p>
        <p>${escapeHtml(item.description || "No description provided.")}</p>
        <div class="submission-actions">
          <button class="button button--primary" data-action="approve" data-id="${escapeHtml(item.id)}">Approve</button>
          <button class="button button--ghost" data-action="reject" data-id="${escapeHtml(item.id)}">Reject</button>
        </div>
      </article>
    `;
    })
    .join("");
};

const loadPending = async () => {
  const data = await api("/api/admin/submissions?status=pending_review");
  renderSubmissions(data.submissions || []);
  setStatus(`Loaded ${(data.submissions || []).length} pending submission(s).`);
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const password = passwordInput.value;
    const data = await api("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    token.set(data.token);
    passwordInput.value = "";
    setStatus("Signed in.");
    await loadPending();
  } catch (error) {
    token.clear();
    setStatus(error.message, true);
  }
});

refreshButton.addEventListener("click", () => {
  loadPending().catch((error) => setStatus(error.message, true));
});

panel.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action][data-id]");
  if (!button) return;
  const { action, id } = button.dataset;
  try {
    button.disabled = true;
    await api("/api/admin/moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId: id, action })
    });
    await loadPending();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
});

if (token.get()) {
  loadPending().catch((error) => setStatus(error.message, true));
}
