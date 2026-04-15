# iPod nano 6/7th Themes Library

GitHub Pages frontend with secure upload/moderation backend.

- Static catalog (`themes.json`)
- Secure user IPSW uploads via Cloudflare R2 presigned URLs
- Admin moderation dashboard with signed short-lived auth tokens
- Optional sync of approved files into `/ipsw` (Git LFS tracked)

## Pages

- `index.html`: main library
- `submit.html`: secure upload form
- `admin.html`: secure moderation dashboard
- `config.js`: frontend runtime config (`API_BASE_URL`, `TURNSTILE_SITE_KEY`)

## Secure backend setup (Cloudflare Worker + R2 + KV)

Backend source is in `cloudflare-worker/src/worker.mjs`.

1. Create:
   - an R2 bucket (upload storage),
   - a KV namespace (submission metadata),
   - a Turnstile site + secret key.
2. Copy `cloudflare-worker/wrangler.toml.example` to `cloudflare-worker/wrangler.toml` and fill values.
3. Set secrets:
   ```bash
   cd cloudflare-worker
   wrangler secret put ADMIN_PASSWORD
   wrangler secret put ADMIN_TOKEN_SECRET
   wrangler secret put TURNSTILE_SECRET
   wrangler secret put R2_ACCOUNT_ID
   wrangler secret put R2_BUCKET
   wrangler secret put R2_ACCESS_KEY_ID
   wrangler secret put R2_SECRET_ACCESS_KEY
   wrangler secret put R2_PUBLIC_BASE_URL
   ```
4. Deploy:
   ```bash
   wrangler deploy
   ```
5. Update root `config.js`:
   - `API_BASE_URL`: deployed Worker URL
   - `TURNSTILE_SITE_KEY`: Turnstile site key
6. In Worker vars, set `ALLOWED_ORIGIN` to your GitHub Pages origin exactly.

## Security controls included

- Turnstile challenge required for upload session creation
- Strict CORS allowlist (`ALLOWED_ORIGIN`)
- Presigned upload URLs with short expiry
- Server-side upload verification before entering moderation queue
- Admin-only moderation actions with HMAC-signed short-lived tokens
- Explicit status transitions (`upload_url_issued -> pending_review -> approved/rejected`)

## Submission and moderation flow

1. User uploads `.ipsw` + metadata on `submit.html`.
2. File uploads directly to R2 via presigned URL.
3. Submission is finalized into `pending_review`.
4. Admin signs in on `admin.html` and approves/rejects.
5. Approved submissions appear from `/api/themes` on the homepage.

## Optional: import approved R2 files into Git LFS

To keep a local copy in `/ipsw` and track with LFS:

1. Install Git LFS locally:
   ```bash
   git lfs install
   ```
2. Use the existing import script with approved R2 file URLs:
   ```bash
   node scripts/import-approved.js --issue <number> --theme-name "<name>" --author-name "<author>" --device "iPod nano 7G" --release "<release>" --description "<desc>" --preview-image "<preview-url>" --tags "<comma,tags>" --ipsw-url "<direct-ipsw-url>"
   ```
3. Commit and push updated `themes.json` + `/ipsw` file.

## Local development

1. Validate scripts:
   ```bash
   npm run check
   ```
2. Serve locally with any static server:
   ```bash
   python3 -m http.server
   ```
