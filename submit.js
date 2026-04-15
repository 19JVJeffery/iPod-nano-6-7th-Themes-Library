const form = document.getElementById("submit-form");
const statusEl = document.getElementById("submit-status");
const config = window.NANO_CONFIG || {};
const apiBase = (config.API_BASE_URL || "").replace(/\/+$/, "");

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.className = isError ? "status error" : "status";
};

const toHex = (arrayBuffer) => [...new Uint8Array(arrayBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

const sha256 = async (file) => {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return toHex(digest);
};

const uploadToLfs = async (uploadAction, file) => {
  const headers = { ...(uploadAction.header || {}) };
  headers["Content-Type"] = file.type || "application/octet-stream";
  const response = await fetch(uploadAction.href, { method: "PUT", headers, body: file });
  if (!response.ok) throw new Error(`LFS upload failed (${response.status})`);
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!apiBase) {
    setStatus("Missing API config. Set window.NANO_CONFIG.API_BASE_URL in config.js", true);
    return;
  }

  const formData = new FormData(form);
  const file = formData.get("ipswFile");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".ipsw")) {
    setStatus("Select a valid .ipsw file.", true);
    return;
  }

  const payload = {
    themeName: String(formData.get("themeName") || "").trim(),
    authorName: String(formData.get("authorName") || "").trim(),
    device: String(formData.get("device") || "").trim(),
    release: String(formData.get("release") || "").trim() || "Unknown",
    previewImage: String(formData.get("previewImage") || "").trim(),
    tags: String(formData.get("tags") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    fileName: file.name,
    fileSize: file.size
  };

  try {
    setStatus("Hashing file...");
    payload.oid = await sha256(file);

    setStatus("Requesting LFS upload instructions...");
    const startResponse = await fetch(`${apiBase}/api/lfs/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const startData = await startResponse.json();
    if (!startResponse.ok) throw new Error(startData.error || "Could not start upload");

    setStatus("Uploading to GitHub LFS...");
    await uploadToLfs(startData.uploadAction, file);

    setStatus("Finalizing and opening moderation PR...");
    const completeResponse = await fetch(`${apiBase}/api/lfs/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stateToken: startData.stateToken })
    });
    const completeData = await completeResponse.json();
    if (!completeResponse.ok) throw new Error(completeData.error || "Could not finalize submission");

    form.reset();
    setStatus(`Submission created: PR #${completeData.pullNumber}`);
    window.open(completeData.pullUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
    setStatus(error.message || "Upload failed", true);
  }
});
