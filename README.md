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

### What is already prepared in this repo

- Worker backend code (`cloudflare-worker/src/worker.mjs`)
- Wrangler config template (`cloudflare-worker/wrangler.toml.example`)
- Frontend config hook (`config.js`)
- Helper scripts:
  - `npm run cf:bootstrap`
  - `npm run cf:set-secrets`
  - `npm run cf:deploy`

### Exact setup steps

1. Install and login:
   ```bash
   npm i -g wrangler
   wrangler login
   ```
2. Bootstrap Cloudflare resources (creates R2 bucket and KV namespace, prints a ready `wrangler.toml` block):
   ```bash
   npm run cf:bootstrap
   ```
3. `cf:bootstrap` writes `cloudflare-worker/wrangler.toml` automatically.
   - If R2 is not enabled in your Cloudflare account, enable it in dashboard first, then re-run `npm run cf:bootstrap`.
   - Check `ALLOWED_ORIGIN` in `cloudflare-worker/wrangler.toml` is your exact Pages origin.
4. In Cloudflare dashboard, create Turnstile and copy:
   - Site key
   - Secret key
5. Copy secrets template and fill it:
   ```bash
   cp cloudflare-worker/.secrets.env.example cloudflare-worker/.secrets.env
   ```
6. Push secrets from file:
   ```bash
   npm run cf:set-secrets -- cloudflare-worker/.secrets.env
   ```
   (Equivalent manual commands if needed:)
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
7. Deploy Worker:
   ```bash
   npm run cf:deploy
   ```
8. Update root `config.js`:
   - `API_BASE_URL`: deployed Worker URL
   - `TURNSTILE_SITE_KEY`: Turnstile site key
9. Commit and push `config.js` (and `wrangler.toml` if you choose to keep it in repo).

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
