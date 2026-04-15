const encoder = new TextEncoder();

const json = (status, body, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "content-type,authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS"
    }
  });

const nowSeconds = () => Math.floor(Date.now() / 1000);
const b64UrlEncode = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
const b64UrlDecodeText = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(normalized + pad);
};

const sanitize = (value, max = 256) => String(value || "").trim().slice(0, max);
const sanitizeFileName = (value) => sanitize(value, 160).replace(/[^A-Za-z0-9._-]/g, "_");

const parseJson = async (request) => {
  try {
    return await request.json();
  } catch {
    throw new Error("Invalid JSON body");
  }
};

const importHmacKey = async (secret) =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

const hmacSign = async (secret, message) => {
  const key = await importHmacKey(secret);
  return crypto.subtle.sign("HMAC", key, encoder.encode(message));
};

const createSignedToken = async (secret, payload) => {
  const payloadEncoded = b64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = b64UrlEncode(await hmacSign(secret, payloadEncoded));
  return `${payloadEncoded}.${signature}`;
};

const verifySignedToken = async (secret, token) => {
  if (!token || !token.includes(".")) return null;
  const [payloadEncoded, signatureEncoded] = token.split(".");
  const expected = b64UrlEncode(await hmacSign(secret, payloadEncoded));
  if (expected !== signatureEncoded) return null;
  const payload = JSON.parse(b64UrlDecodeText(payloadEncoded));
  if (!payload.exp || payload.exp < nowSeconds()) return null;
  return payload;
};

const pemToArrayBuffer = (pem) => {
  const cleaned = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const importGithubPrivateKey = async (privateKeyPem) =>
  crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

const createGithubAppJwt = async (env) => {
  const now = nowSeconds();
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 30,
    exp: now + 540,
    iss: env.GITHUB_APP_ID
  };
  const headerPart = b64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadPart = b64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerPart}.${payloadPart}`;
  const privateKey = await importGithubPrivateKey(env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, encoder.encode(signingInput));
  return `${signingInput}.${b64UrlEncode(signature)}`;
};

const githubApi = async (env, path, { method = "GET", body, token, headers = {} } = {}) => {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "nano-theme-library-backend",
      "Content-Type": "application/json",
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${text.slice(0, 300)}`);
  }
  return response.status === 204 ? null : response.json();
};

const getInstallationToken = async (env) => {
  const jwt = await createGithubAppJwt(env);
  const response = await fetch(
    `https://api.github.com/app/installations/${env.GITHUB_APP_INSTALLATION_ID}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "User-Agent": "nano-theme-library-backend"
      }
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not create installation token: ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  return data.token;
};

const lfsBatch = async (env, token, oid, size) => {
  const basic = btoa(`x-access-token:${token}`);
  const response = await fetch(`https://github.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}.git/info/lfs/objects/batch`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/vnd.git-lfs+json",
      "Content-Type": "application/vnd.git-lfs+json"
    },
    body: JSON.stringify({
      operation: "upload",
      transfers: ["basic"],
      objects: [{ oid, size }]
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LFS batch failed: ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  const object = data.objects?.[0];
  if (!object?.actions?.upload) throw new Error("LFS upload action missing");
  return object.actions;
};

const toBase64 = (text) => btoa(unescape(encodeURIComponent(text)));

const lfsPointer = (oid, size) => `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${size}\n`;

const slug = (value) =>
  sanitize(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const parseThemeFromPrBody = (body) => {
  const read = (label) => {
    const match = String(body || "").match(new RegExp(`-\\s+${label}:\\s*(.+)`, "i"));
    return match ? match[1].trim() : "";
  };
  return {
    authorName: read("Author Name"),
    device: read("Device"),
    release: read("Release"),
    description: (String(body || "").split("### Description")[1] || "").trim(),
    fileName: read("File Name")
  };
};

const createSubmissionPr = async (env, token, payload) => {
  const baseBranch = env.GITHUB_BASE_BRANCH || "main";
  const ref = await githubApi(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/ref/heads/${baseBranch}`, { token });
  const baseSha = ref.object.sha;

  const branchName = `submission-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  await githubApi(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/refs`, {
    method: "POST",
    token,
    body: { ref: `refs/heads/${branchName}`, sha: baseSha }
  });

  const fileBaseName = `${slug(payload.themeName)}-${slug(payload.device)}-${Date.now().toString(36) || "submission"}`;
  const ipswPath = `ipsw/community/${fileBaseName}.ipsw`;

  await githubApi(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodeURIComponent(ipswPath)}`, {
    method: "PUT",
    token,
    body: {
      message: `Add pending IPSW pointer for ${payload.themeName}`,
      content: toBase64(lfsPointer(payload.oid, payload.fileSize)),
      branch: branchName
    }
  });

  const themesFile = await githubApi(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/themes.json?ref=${baseBranch}`, {
    token
  });
  const themes = JSON.parse(decodeURIComponent(escape(atob(themesFile.content.replace(/\n/g, "")))));
  themes.unshift({
    name: payload.themeName,
    author: { name: payload.authorName },
    device: payload.device,
    release: payload.release,
    description: payload.description,
    tags: payload.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    previewImage: payload.previewImage,
    ipswPath
  });

  await githubApi(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/themes.json`, {
    method: "PUT",
    token,
    body: {
      message: `Add pending theme metadata for ${payload.themeName}`,
      content: toBase64(`${JSON.stringify(themes, null, 2)}\n`),
      sha: themesFile.sha,
      branch: branchName
    }
  });

  const prBody = [
    "## Theme Submission",
    "",
    `- Theme Name: ${payload.themeName}`,
    `- Author Name: ${payload.authorName}`,
    `- Device: ${payload.device}`,
    `- Release: ${payload.release}`,
    `- Preview Image URL: ${payload.previewImage}`,
    `- Tags: ${payload.tags || "none"}`,
    `- File Name: ${payload.fileName}`,
    "",
    "### Description",
    payload.description || "No description",
    "",
    "> Moderation status: pending-review"
  ].join("\n");

  const pr = await githubApi(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/pulls`, {
    method: "POST",
    token,
    body: {
      title: `[Theme Submission] ${payload.themeName} (${payload.device})`,
      head: branchName,
      base: baseBranch,
      body: prBody
    }
  });

  await githubApi(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${pr.number}/labels`, {
    method: "POST",
    token,
    body: { labels: ["theme-submission", "pending-review"] }
  });

  return { pullNumber: pr.number, pullUrl: pr.html_url };
};

const allowedOrigin = (request, env) => {
  const origin = request.headers.get("origin") || "";
  return origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN;
};

const requireAdmin = async (request, env) => {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const payload = await verifySignedToken(env.ADMIN_TOKEN_SECRET, token);
  return payload?.role === "admin";
};

const listPending = async (env, token) => {
  const result = await githubApi(
    env,
    `/search/issues?q=${encodeURIComponent(`repo:${env.GITHUB_OWNER}/${env.GITHUB_REPO} is:pr is:open label:theme-submission label:pending-review`)}`,
    { token }
  );
  return (result.items || []).map((item) => {
    const parsed = parseThemeFromPrBody(item.body || "");
    return {
      pullNumber: item.number,
      pullUrl: item.html_url,
      title: item.title,
      ...parsed
    };
  });
};

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (request.method === "OPTIONS") return json(204, {}, origin);

    try {
      const url = new URL(request.url);

      if (request.method === "POST" && url.pathname === "/api/lfs/start") {
        const body = await parseJson(request);
        const required = ["themeName", "authorName", "device", "description", "previewImage", "fileName", "fileSize", "oid"];
        for (const key of required) {
          if (!body[key]) return json(400, { error: `Missing ${key}` }, origin);
        }
        const fileName = sanitizeFileName(body.fileName);
        if (!fileName.toLowerCase().endsWith(".ipsw")) return json(400, { error: "Only .ipsw files are allowed" }, origin);
        const size = Number(body.fileSize);
        if (!Number.isFinite(size) || size <= 0) return json(400, { error: "Invalid fileSize" }, origin);
        if (!/^[a-f0-9]{64}$/i.test(body.oid)) return json(400, { error: "Invalid SHA-256 oid" }, origin);

        const token = await getInstallationToken(env);
        const actions = await lfsBatch(env, token, body.oid, size);
        const statePayload = {
          exp: nowSeconds() + 15 * 60,
          data: {
            themeName: sanitize(body.themeName, 120),
            authorName: sanitize(body.authorName, 80),
            device: sanitize(body.device, 40),
            release: sanitize(body.release || "Unknown", 80),
            previewImage: sanitize(body.previewImage, 500),
            tags: sanitize(body.tags || "", 250),
            description: sanitize(body.description, 2000),
            fileName,
            fileSize: size,
            oid: body.oid.toLowerCase(),
            uploadAction: actions.upload,
            verifyAction: actions.verify || null
          }
        };
        const stateToken = await createSignedToken(env.STATE_TOKEN_SECRET, statePayload);
        return json(200, { uploadAction: actions.upload, stateToken }, origin);
      }

      if (request.method === "POST" && url.pathname === "/api/lfs/complete") {
        const body = await parseJson(request);
        const state = await verifySignedToken(env.STATE_TOKEN_SECRET, body.stateToken || "");
        if (!state) return json(401, { error: "Invalid or expired upload state" }, origin);
        const payload = state.data;
        if (payload.verifyAction?.href) {
          const response = await fetch(payload.verifyAction.href, {
            method: "POST",
            headers: payload.verifyAction.header || { "Content-Type": "application/json" },
            body: JSON.stringify({ oid: payload.oid, size: payload.fileSize })
          });
          if (!response.ok) return json(400, { error: "LFS verify failed" }, origin);
        }
        const token = await getInstallationToken(env);
        const pr = await createSubmissionPr(env, token, payload);
        return json(200, pr, origin);
      }

      if (request.method === "POST" && url.pathname === "/api/admin/login") {
        const body = await parseJson(request);
        if (!body.password || body.password !== env.ADMIN_PASSWORD) return json(401, { error: "Invalid credentials" }, origin);
        const token = await createSignedToken(env.ADMIN_TOKEN_SECRET, { role: "admin", exp: nowSeconds() + 60 * 60 });
        return json(200, { token }, origin);
      }

      if (request.method === "GET" && url.pathname === "/api/admin/submissions") {
        if (!(await requireAdmin(request, env))) return json(401, { error: "Unauthorized" }, origin);
        const token = await getInstallationToken(env);
        const items = await listPending(env, token);
        return json(200, { items }, origin);
      }

      if (request.method === "POST" && url.pathname === "/api/admin/decision") {
        if (!(await requireAdmin(request, env))) return json(401, { error: "Unauthorized" }, origin);
        const body = await parseJson(request);
        const pullNumber = Number(body.pullNumber);
        if (!Number.isFinite(pullNumber)) return json(400, { error: "Invalid pullNumber" }, origin);
        if (!["approve", "reject"].includes(body.action)) return json(400, { error: "Invalid action" }, origin);
        const token = await getInstallationToken(env);
        if (body.action === "approve") {
          await githubApi(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/pulls/${pullNumber}/merge`, {
            method: "PUT",
            token,
            body: { merge_method: "squash" }
          });
          await githubApi(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${pullNumber}/labels`, {
            method: "POST",
            token,
            body: { labels: ["approved", "imported"] }
          });
          return json(200, { ok: true, status: "approved" }, origin);
        }
        await githubApi(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/pulls/${pullNumber}`, {
          method: "PATCH",
          token,
          body: { state: "closed" }
        });
        await githubApi(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${pullNumber}/labels`, {
          method: "POST",
          token,
          body: { labels: ["rejected"] }
        });
        return json(200, { ok: true, status: "rejected" }, origin);
      }

      return json(404, { error: "Not found" }, origin);
    } catch (error) {
      return json(500, { error: error.message || "Internal error" }, origin);
    }
  }
};
