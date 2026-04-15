const textEncoder = new TextEncoder();

const json = (status, body, origin = "*") =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization"
    }
  });

const nowIso = () => new Date().toISOString();
const submissionKey = (id) => `sub:${id}`;
const randomId = () => crypto.randomUUID();
const sanitizeFilename = (name) => (name || "upload.ipsw").replace(/[^A-Za-z0-9._-]/g, "_");
const isIpswFile = (name) => String(name || "").toLowerCase().endsWith(".ipsw");

const parseJson = async (request) => {
  try {
    return await request.json();
  } catch {
    throw new Error("Invalid JSON body");
  }
};

const base64Url = (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const decodeBase64UrlToString = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(normalized + padding);
};

const sha256Hex = async (data) => {
  const hash = await crypto.subtle.digest("SHA-256", typeof data === "string" ? textEncoder.encode(data) : data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const hmacSha256 = async (keyBytes, message) => {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, textEncoder.encode(message));
};

const hmacHex = async (keyBytes, message) => {
  const sig = await hmacSha256(keyBytes, message);
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const createSignedAdminToken = async (env) => {
  const payload = JSON.stringify({
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + 60 * 20
  });
  const payloadEncoded = base64Url(textEncoder.encode(payload));
  const signature = await hmacSha256(textEncoder.encode(env.ADMIN_TOKEN_SECRET), payloadEncoded);
  return `${payloadEncoded}.${base64Url(signature)}`;
};

const verifyAdminToken = async (env, authHeader) => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length);
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payloadEncoded, signatureEncoded] = parts;
  const expected = await hmacSha256(textEncoder.encode(env.ADMIN_TOKEN_SECRET), payloadEncoded);
  if (base64Url(expected) !== signatureEncoded) return false;

  const payload = JSON.parse(decodeBase64UrlToString(payloadEncoded));
  return payload.exp > Math.floor(Date.now() / 1000) && payload.role === "admin";
};

const verifyTurnstile = async (env, token, ip) => {
  if (!env.TURNSTILE_SECRET) throw new Error("TURNSTILE_SECRET not configured");
  const form = new URLSearchParams();
  form.set("secret", env.TURNSTILE_SECRET);
  form.set("response", token || "");
  if (ip) form.set("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  const result = await response.json();
  return Boolean(result.success);
};

const getOrigin = (request, env) => {
  const requestOrigin = request.headers.get("origin") || "";
  return requestOrigin === env.ALLOWED_ORIGIN ? requestOrigin : env.ALLOWED_ORIGIN || "*";
};

const keyMaterial = async (env, dateStamp) => {
  const kDate = await hmacSha256(textEncoder.encode(`AWS4${env.R2_SECRET_ACCESS_KEY}`), dateStamp);
  const kRegion = await hmacSha256(kDate, "auto");
  const kService = await hmacSha256(kRegion, "s3");
  return hmacSha256(kService, "aws4_request");
};

const createPresignedR2Url = async (env, method, objectKey, expiresSeconds = 900) => {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const canonicalUri = `/${env.R2_BUCKET}/${encodeURI(objectKey).replace(/#/g, "%23")}`;

  const query = new URLSearchParams({
    "X-Amz-Algorithm": algorithm,
    "X-Amz-Credential": `${env.R2_ACCESS_KEY_ID}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": "host"
  });
  const canonicalQuery = query.toString();
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\nhost\nUNSIGNED-PAYLOAD`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;
  const signingKey = await keyMaterial(env, dateStamp);
  const signature = await hmacHex(signingKey, stringToSign);
  query.set("X-Amz-Signature", signature);
  return `https://${host}${canonicalUri}?${query.toString()}`;
};

const listSubmissionsByStatus = async (env, status) => {
  const listed = await env.SUBMISSIONS_KV.list({ prefix: "sub:" });
  const results = [];
  for (const key of listed.keys) {
    const submission = await env.SUBMISSIONS_KV.get(key.name, "json");
    if (submission?.status === status) results.push(submission);
  }
  results.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  return results;
};

const handleCreateSubmission = async (request, env, origin) => {
  const body = await parseJson(request);
  const required = ["themeName", "authorName", "device", "description", "previewImage", "fileName", "fileSize", "turnstileToken"];
  for (const key of required) {
    if (!body[key]) return json(400, { error: `Missing ${key}` }, origin);
  }

  const turnstileOk = await verifyTurnstile(env, body.turnstileToken, request.headers.get("CF-Connecting-IP"));
  if (!turnstileOk) return json(403, { error: "Human verification failed" }, origin);

  if (!isIpswFile(body.fileName)) return json(400, { error: "Only .ipsw files are allowed" }, origin);
  const maxBytes = Number(env.MAX_UPLOAD_MB || "512") * 1024 * 1024;
  if (Number(body.fileSize) > maxBytes) return json(400, { error: `File too large. Max ${env.MAX_UPLOAD_MB || 512} MB` }, origin);

  const id = randomId();
  const objectKey = `uploads/${id}/${sanitizeFilename(body.fileName)}`;
  const uploadUrl = await createPresignedR2Url(env, "PUT", objectKey, 900);
  const submission = {
    id,
    status: "upload_url_issued",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    themeName: body.themeName,
    authorName: body.authorName,
    device: body.device,
    release: body.release || "Unknown",
    previewImage: body.previewImage,
    tags: body.tags || "",
    description: body.description,
    fileName: sanitizeFilename(body.fileName),
    fileSize: Number(body.fileSize),
    fileType: body.fileType || "application/octet-stream",
    objectKey
  };
  await env.SUBMISSIONS_KV.put(submissionKey(id), JSON.stringify(submission));
  return json(200, { submissionId: id, uploadUrl }, origin);
};

const handleCompleteSubmission = async (request, env, origin) => {
  const body = await parseJson(request);
  if (!body.submissionId) return json(400, { error: "Missing submissionId" }, origin);

  const key = submissionKey(body.submissionId);
  const submission = await env.SUBMISSIONS_KV.get(key, "json");
  if (!submission) return json(404, { error: "Submission not found" }, origin);
  if (submission.status !== "upload_url_issued") return json(400, { error: "Submission not ready for completion" }, origin);

  const headUrl = await createPresignedR2Url(env, "HEAD", submission.objectKey, 120);
  const headResponse = await fetch(headUrl, { method: "HEAD" });
  if (!headResponse.ok) return json(400, { error: "Uploaded file could not be verified" }, origin);

  submission.status = "pending_review";
  submission.updatedAt = nowIso();
  await env.SUBMISSIONS_KV.put(key, JSON.stringify(submission));
  return json(200, { ok: true, status: submission.status }, origin);
};

const handleAdminLogin = async (request, env, origin) => {
  const body = await parseJson(request);
  if (!body.password) return json(400, { error: "Missing password" }, origin);
  if (!env.ADMIN_PASSWORD || !env.ADMIN_TOKEN_SECRET) return json(500, { error: "Admin auth not configured" }, origin);
  if (body.password !== env.ADMIN_PASSWORD) return json(401, { error: "Invalid credentials" }, origin);
  const token = await createSignedAdminToken(env);
  return json(200, { token }, origin);
};

const requireAdmin = async (request, env, origin) => {
  const ok = await verifyAdminToken(env, request.headers.get("authorization"));
  if (!ok) return json(401, { error: "Unauthorized" }, origin);
  return null;
};

const handleAdminSubmissions = async (request, env, origin) => {
  const blocked = await requireAdmin(request, env, origin);
  if (blocked) return blocked;
  const status = new URL(request.url).searchParams.get("status") || "pending_review";
  const submissions = await listSubmissionsByStatus(env, status);
  return json(200, { submissions }, origin);
};

const handleAdminModerate = async (request, env, origin) => {
  const blocked = await requireAdmin(request, env, origin);
  if (blocked) return blocked;
  const body = await parseJson(request);
  if (!body.submissionId) return json(400, { error: "Missing submissionId" }, origin);
  if (!["approve", "reject"].includes(body.action)) return json(400, { error: "Invalid action" }, origin);

  const key = submissionKey(body.submissionId);
  const submission = await env.SUBMISSIONS_KV.get(key, "json");
  if (!submission) return json(404, { error: "Submission not found" }, origin);
  if (submission.status !== "pending_review") return json(400, { error: "Submission is not pending review" }, origin);

  submission.status = body.action === "approve" ? "approved" : "rejected";
  submission.updatedAt = nowIso();
  if (submission.status === "approved") {
    if (!env.R2_PUBLIC_BASE_URL) return json(500, { error: "Missing R2_PUBLIC_BASE_URL" }, origin);
    submission.downloadUrl = `${env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${submission.objectKey}`;
  }
  await env.SUBMISSIONS_KV.put(key, JSON.stringify(submission));
  return json(200, { ok: true, status: submission.status }, origin);
};

const handleThemes = async (env, origin) => {
  const themesSource =
    env.THEMES_SOURCE_URL ||
    "https://raw.githubusercontent.com/19JVJeffery/iPod-nano-6-7th-Themes-Library/main/themes.json";
  const staticThemes = await (await fetch(themesSource, { cf: { cacheTtl: 120 } })).json();
  const approved = await listSubmissionsByStatus(env, "approved");
  const approvedThemes = approved.map((item) => ({
    name: item.themeName,
    author: { name: item.authorName },
    device: item.device,
    release: item.release,
    description: item.description,
    tags: String(item.tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    previewImage: item.previewImage || "assets/banner.png",
    downloadUrl: item.downloadUrl
  }));
  return json(200, [...approvedThemes, ...staticThemes], origin);
};

export default {
  async fetch(request, env) {
    const origin = getOrigin(request, env);
    if (request.method === "OPTIONS") return json(204, {}, origin);

    const path = new URL(request.url).pathname;
    try {
      if (request.method === "POST" && path === "/api/submissions/create") return handleCreateSubmission(request, env, origin);
      if (request.method === "POST" && path === "/api/submissions/complete") return handleCompleteSubmission(request, env, origin);
      if (request.method === "POST" && path === "/api/admin/login") return handleAdminLogin(request, env, origin);
      if (request.method === "GET" && path === "/api/admin/submissions") return handleAdminSubmissions(request, env, origin);
      if (request.method === "POST" && path === "/api/admin/moderate") return handleAdminModerate(request, env, origin);
      if (request.method === "GET" && path === "/api/themes") return handleThemes(env, origin);
      return json(404, { error: "Not found" }, origin);
    } catch (error) {
      return json(500, { error: error.message || "Internal error" }, origin);
    }
  }
};
