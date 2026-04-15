const statusEl = document.getElementById("admin-status");
const panel = document.getElementById("moderation-panel");
const refreshButton = document.getElementById("refresh-submissions");
const owner = "19JVJeffery";
const repo = "iPod-nano-6-7th-Themes-Library";

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

const parseField = (body, field) => {
  const regex = new RegExp(`-\\s+${field}:\\s*(.+)`, "i");
  const match = (body || "").match(regex);
  return match ? match[1].trim() : "";
};

const shellEscape = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

const createImportCommand = (issue, parsed) =>
  `node scripts/import-approved.js --issue ${issue.number} --theme-name ${shellEscape(parsed.themeName)} --author-name ${shellEscape(
    parsed.authorName
  )} --device ${shellEscape(parsed.device)} --release ${shellEscape(parsed.release || "Unknown")} --description ${shellEscape(
    parsed.description || "Community submission"
  )} --preview-image ${shellEscape(parsed.previewImage)} --tags ${shellEscape(parsed.tags || "")} --ipsw-url ${shellEscape(parsed.ipswUrl)}`;

const parseIssue = (issue) => ({
  themeName: parseField(issue.body, "Theme Name"),
  authorName: parseField(issue.body, "Author Name"),
  device: parseField(issue.body, "Device"),
  release: parseField(issue.body, "Release"),
  previewImage: parseField(issue.body, "Preview Image URL"),
  tags: parseField(issue.body, "Tags"),
  ipswUrl: parseField(issue.body, "IPSW URL"),
  description: (issue.body || "").split("### Description")[1]?.trim() || "",
  createdAt: issue.created_at
});

const copyText = async (text) => {
  await navigator.clipboard.writeText(text);
};

const renderSubmissions = (issues) => {
  if (!issues.length) {
    panel.innerHTML = `<section class="panel panel--wide"><h2>No pending submissions</h2><p class="panel-copy">Queue is clear.</p></section>`;
    return;
  }

  panel.innerHTML = issues
    .map((issue) => {
      const parsed = parseIssue(issue);
      const importCommand = createImportCommand(issue, parsed);
      const created = new Date(parsed.createdAt).toLocaleString();
      return `
      <article class="submission-card">
        <h3>#${issue.number}: ${escapeHtml(parsed.themeName || issue.title)}</h3>
        <p><strong>Submitted:</strong> ${escapeHtml(created)}</p>
        <p><strong>Author:</strong> ${escapeHtml(parsed.authorName || "Unknown")} • <strong>Device:</strong> ${escapeHtml(parsed.device || "Unknown")}</p>
        <p><strong>Release:</strong> ${escapeHtml(parsed.release || "Unknown")}</p>
        <p><strong>IPSW URL:</strong> <a href="${escapeHtml(parsed.ipswUrl)}" target="_blank" rel="noopener noreferrer">Open source file</a></p>
        <p>${escapeHtml(parsed.description || "No description provided.")}</p>
        <textarea readonly>${importCommand}</textarea>
        <div class="submission-actions">
          <button class="button button--primary" data-copy="${escapeHtml(importCommand)}">Copy import command</button>
          <a class="button button--ghost" href="${issue.html_url}" target="_blank" rel="noopener noreferrer">Open issue</a>
        </div>
      </article>
    `;
    })
    .join("");
};

const loadPending = async () => {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&labels=theme-submission,pending-review&per_page=100`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to load pending submissions from GitHub API");
  const issues = await response.json();
  const submissions = issues.filter((issue) => !issue.pull_request);
  renderSubmissions(submissions);
  setStatus(`Loaded ${submissions.length} pending submission(s).`);
};

panel.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-copy]");
  if (!button) return;
  try {
    await copyText(button.dataset.copy);
    setStatus("Import command copied.");
  } catch (error) {
    setStatus(error.message || "Could not copy command", true);
  }
});

refreshButton.addEventListener("click", () => {
  loadPending().catch((error) => setStatus(error.message, true));
});

loadPending().catch((error) => setStatus(error.message, true));
