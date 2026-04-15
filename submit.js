const form = document.getElementById("submit-form");
const statusEl = document.getElementById("submit-status");
const owner = "19JVJeffery";
const repo = "iPod-nano-6-7th-Themes-Library";

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.className = isError ? "status error" : "status";
};

const line = (label, value) => `- ${label}: ${value}`;

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(form);

  const themeName = String(formData.get("themeName") || "").trim();
  const authorName = String(formData.get("authorName") || "").trim();
  const device = String(formData.get("device") || "").trim();
  const release = String(formData.get("release") || "").trim() || "Unknown";
  const previewImage = String(formData.get("previewImage") || "").trim();
  const tags = String(formData.get("tags") || "").trim() || "none";
  const description = String(formData.get("description") || "").trim();
  const ipswUrl = String(formData.get("ipswUrl") || "").trim();

  if (!ipswUrl || !ipswUrl.toLowerCase().includes(".ipsw")) {
    setStatus("Provide a direct URL to a .ipsw file.", true);
    return;
  }

  const issueTitle = `[Theme Submission] ${themeName} (${device})`;
  const issueBody = [
    "## Theme Submission",
    "",
    "> Auto-filled from the Nano Theme Library submission form.",
    "",
    line("Theme Name", themeName),
    line("Author Name", authorName),
    line("Device", device),
    line("Release", release),
    line("Preview Image URL", previewImage),
    line("Tags", tags),
    line("IPSW URL", ipswUrl),
    "",
    "### Description",
    description,
    "",
    "> Moderation status: pending-review"
  ].join("\n");

  const issueUrl =
    `https://github.com/${owner}/${repo}/issues/new?labels=${encodeURIComponent("theme-submission,pending-review")}` +
    `&title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;

  setStatus("Opening submission issue...");
  window.open(issueUrl, "_blank", "noopener,noreferrer");
});
