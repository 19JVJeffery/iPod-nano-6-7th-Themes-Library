# Nano Theme Library

GitHub Pages frontend + GitHub LFS storage, with a lightweight backend that calls GitHub LFS batch API to support direct browser uploads.

## Architecture

- **Frontend (GitHub Pages):** `index.html`, `submit.html`, `admin.html`
- **Storage:** GitHub repo `ipsw/` tracked by Git LFS
- **Backend (no external file storage):** Cloudflare Worker in `lfs-worker/`
  - requests LFS upload instructions from GitHub
  - finalizes uploads into moderated pull requests
  - supports admin approve/reject actions

## Why this backend is required

A static site cannot safely upload directly to your GitHub LFS without exposing credentials.  
The Worker keeps credentials server-side and only returns short-lived upload instructions.

## Setup

1. **GitHub Pages**
   - Enable Pages from `main` branch root.

2. **Git LFS**
   ```bash
   git lfs install
   ```

3. **Create GitHub App** (recommended security)
   - Permissions:
     - Contents: Read/Write
     - Pull requests: Read/Write
     - Issues: Read/Write
     - Metadata: Read
   - Install app on this repo.
   - Collect:
     - App ID
     - Installation ID
     - Private key PEM

4. **Deploy Worker backend**
   - Copy `lfs-worker/wrangler.toml.example` → `lfs-worker/wrangler.toml`
   - Set vars (`ALLOWED_ORIGIN`, owner/repo/base branch)
   - Set secrets:
     ```bash
     cd lfs-worker
     wrangler secret put ADMIN_PASSWORD
     wrangler secret put ADMIN_TOKEN_SECRET
     wrangler secret put STATE_TOKEN_SECRET
     wrangler secret put GITHUB_APP_ID
     wrangler secret put GITHUB_APP_INSTALLATION_ID
     wrangler secret put GITHUB_APP_PRIVATE_KEY
     wrangler deploy --config wrangler.toml
     ```

5. **Frontend config**
   - Edit root `config.js`:
     ```js
     window.NANO_CONFIG = {
       API_BASE_URL: "https://<your-worker>.workers.dev"
     };
     ```
   - Commit/push.

## User flow

1. User selects `.ipsw` file in `submit.html`.
2. Browser hashes file and calls backend `/api/lfs/start`.
3. Backend requests GitHub LFS batch upload instructions.
4. Browser uploads file directly to LFS upload URL.
5. Browser calls `/api/lfs/complete`.
6. Backend creates a moderation PR containing:
   - LFS pointer file under `ipsw/community/...`
   - updated `themes.json` entry

## Admin moderation flow

1. Admin signs in on `admin.html`.
2. Backend lists pending submission PRs.
3. Approve → backend merges PR.
4. Reject → backend closes PR.

## Local checks

```bash
npm run check
```
