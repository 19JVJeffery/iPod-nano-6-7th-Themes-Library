const themeGrid = document.getElementById("theme-grid");
const searchInput = document.getElementById("search");
const deviceInput = document.getElementById("device");
const sortInput = document.getElementById("sort");
const statTotal = document.getElementById("stat-total");
const stat6G = document.getElementById("stat-6g");
const stat7G = document.getElementById("stat-7g");
const statReady = document.getElementById("stat-ready");
const config = window.NANO_CONFIG || {};
const apiBase = (config.API_BASE_URL || "").replace(/\/+$/, "");

let themes = [];

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const toPath = (path) => encodeURI(path || "");

const authorMarkup = (author) => {
  if (!author) return "Unknown";
  if (typeof author === "string") return escapeHtml(author);
  if (author.url) {
    return `<a href="${escapeHtml(author.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(author.name)}</a>`;
  }
  return escapeHtml(author.name || "Unknown");
};

const inferReleaseYear = (release) => {
  const match = String(release || "").match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : 0;
};

const sortThemes = (list) => {
  const mode = sortInput?.value || "name-asc";
  const sorted = [...list];
  if (mode === "name-asc") sorted.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  if (mode === "name-desc") sorted.sort((a, b) => String(b.name || "").localeCompare(String(a.name || "")));
  if (mode === "release-desc") sorted.sort((a, b) => inferReleaseYear(b.release) - inferReleaseYear(a.release));
  if (mode === "release-asc") sorted.sort((a, b) => inferReleaseYear(a.release) - inferReleaseYear(b.release));
  return sorted;
};

const setStats = () => {
  const total = themes.length;
  const count6 = themes.filter((item) => item.device === "iPod nano 6G").length;
  const count7 = themes.filter((item) => item.device === "iPod nano 7G").length;
  const ready = themes.filter((item) => item.ipswPath || item.downloadUrl).length;

  if (statTotal) statTotal.textContent = String(total);
  if (stat6G) stat6G.textContent = String(count6);
  if (stat7G) stat7G.textContent = String(count7);
  if (statReady) statReady.textContent = String(ready);
};

const render = () => {
  const query = searchInput.value.trim().toLowerCase();
  const selectedDevice = deviceInput.value;

  const filtered = themes.filter((theme) => {
    const haystack = [theme.name, theme.description, theme.device, ...(theme.tags || []), theme.author?.name]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (!query || haystack.includes(query)) && (!selectedDevice || theme.device === selectedDevice);
  });

  const finalThemes = sortThemes(filtered);

  if (!finalThemes.length) {
    themeGrid.innerHTML = `
      <article class="panel panel--wide">
        <h2>No themes found</h2>
        <p class="panel-copy">Try clearing filters or searching with broader terms.</p>
      </article>
    `;
    return;
  }

  themeGrid.innerHTML = finalThemes
    .map((theme) => {
      const hasLocalIPSW = Boolean(theme.ipswPath);
      const tags = (theme.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
      return `
        <article class="theme-card">
          <img src="${escapeHtml(theme.previewImage || "assets/banner.png")}" alt="${escapeHtml(theme.name)} preview" loading="lazy">
          <div class="theme-card__body">
            <div class="theme-card__top">
              <h2>${escapeHtml(theme.name)}</h2>
              <span class="theme-card__device">${escapeHtml(theme.device || "Unknown")}</span>
            </div>
            <dl class="meta-grid">
              <dt>Author</dt>
              <dd>${authorMarkup(theme.author)}</dd>
              <dt>Release</dt>
              <dd>${escapeHtml(theme.release || "Unknown")}</dd>
            </dl>
            <p>${escapeHtml(theme.description || "No description provided.")}</p>
            <div class="tags">${tags}</div>
            <div class="actions">
              ${
                hasLocalIPSW
                  ? `<a class="button button--primary" href="${toPath(theme.ipswPath)}" download>Download IPSW</a>`
                  : `<span class="button disabled">No local IPSW yet</span>`
              }
              ${
                theme.downloadUrl
                  ? `<a class="button button--ghost" href="${escapeHtml(theme.downloadUrl)}" target="_blank" rel="noopener noreferrer">External source</a>`
                  : ""
              }
            </div>
          </div>
        </article>
      `;
    })
    .join("");
};

const load = async () => {
  let response = null;
  if (apiBase) {
    response = await fetch(`${apiBase}/api/themes`, { cache: "no-store" });
  }
  if (!response || !response.ok) {
    response = await fetch("themes.json", { cache: "no-store" });
    if (!response.ok) {
      themeGrid.innerHTML = "<p>Failed to load theme data.</p>";
      return;
    }
  }
  themes = await response.json();
  setStats();
  render();
};

searchInput.addEventListener("input", render);
deviceInput.addEventListener("change", render);
sortInput?.addEventListener("change", render);

load();
