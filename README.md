# Nano Theme Library

Public frontend + GitHub LFS storage. Private moderation/backend now lives in:
`19JVJeffery/AUTH-iPod-nano-6-7th-Themes-Library`

## Architecture

- **Frontend (GitHub Pages):** `index.html`, `submit.html`
- **Storage:** GitHub repo `ipsw/` tracked by Git LFS
- **Private admin/backend:** AUTH repo (dashboard + worker)

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

3. **Frontend config**
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

Admin dashboard is private and handled in AUTH repo.

## Local checks

```bash
npm run check
```
