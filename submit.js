const form = document.getElementById("submit-form");
const statusEl = document.getElementById("submit-status");
const turnstileContainer = document.getElementById("turnstile-container");
const config = window.NANO_CONFIG || {};
const apiBase = (config.API_BASE_URL || "").replace(/\/+$/, "");

let turnstileWidgetId = null;

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.className = isError ? "status error" : "status";
};

const requireApiBase = () => {
  if (!apiBase) throw new Error("Missing API base URL. Set window.NANO_CONFIG.API_BASE_URL in config.js");
};

const renderTurnstile = () => {
  if (!window.turnstile || !config.TURNSTILE_SITE_KEY) return;
  turnstileWidgetId = window.turnstile.render("#turnstile-container", {
    sitekey: config.TURNSTILE_SITE_KEY,
    theme: "dark"
  });
};

const getTurnstileToken = () => {
  if (!window.turnstile || !turnstileWidgetId) return "";
  return window.turnstile.getResponse(turnstileWidgetId);
};

const resetTurnstile = () => {
  if (window.turnstile && turnstileWidgetId) window.turnstile.reset(turnstileWidgetId);
};

const uploadFile = (url, file) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      const pct = Math.round((event.loaded / event.total) * 100);
      setStatus(`Uploading file... ${pct}%`);
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed due to network error"));
    xhr.send(file);
  });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    requireApiBase();
    const formData = new FormData(form);
    const file = formData.get("ipswFile");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".ipsw")) {
      setStatus("Please upload a valid .ipsw file.", true);
      return;
    }

    const turnstileToken = getTurnstileToken();
    if (config.TURNSTILE_SITE_KEY && !turnstileToken) {
      setStatus("Complete the human verification challenge.", true);
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
      fileSize: file.size,
      fileType: file.type || "application/octet-stream",
      turnstileToken
    };

    setStatus("Creating secure upload session...");
    const createResponse = await fetch(`${apiBase}/api/submissions/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const createData = await createResponse.json();
    if (!createResponse.ok) throw new Error(createData.error || "Could not create upload session");

    await uploadFile(createData.uploadUrl, file);

    setStatus("Finalizing submission...");
    const finalizeResponse = await fetch(`${apiBase}/api/submissions/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId: createData.submissionId })
    });
    const finalizeData = await finalizeResponse.json();
    if (!finalizeResponse.ok) throw new Error(finalizeData.error || "Could not finalize submission");

    form.reset();
    resetTurnstile();
    setStatus("Upload received. Your submission is now pending moderation.");
  } catch (error) {
    setStatus(error.message || "Submission failed.", true);
    resetTurnstile();
  }
});

window.addEventListener("load", renderTurnstile);
