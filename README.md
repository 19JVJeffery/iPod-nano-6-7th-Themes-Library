# Nano Theme Library

GitHub Pages + GitHub LFS theme library for iPod nano 6/7.

## What this uses

- Frontend: static pages on GitHub Pages
- File storage: GitHub repository (`/ipsw`) tracked by Git LFS
- Moderation: GitHub Issues + GitHub Actions

## Important limitation

GitHub Pages cannot securely accept direct anonymous browser uploads into your repo/LFS.

So the secure GitHub-only flow is:
1. User submits metadata + direct `.ipsw` URL in `submit.html`
2. You moderate in `admin.html` / GitHub Issues
3. Add `approved-for-import` label
4. GitHub Action imports file into `/ipsw` (LFS), updates `themes.json`, and pushes to `main`

## Setup

1. Enable GitHub Pages from `main` branch root.
2. Install Git LFS locally and once per machine:
   ```bash
   git lfs install
   ```
3. Keep `.gitattributes` committed (`*.ipsw` already tracked).

## Moderation security (recommended)

1. Enable branch protection on `main` (require pull requests and approvals if you prefer stricter control).
2. Restrict who can apply labels / write to repo.
3. Use labels:
   - `theme-submission`
   - `pending-review`
   - `approved-for-import`
   - `imported`
4. Workflow `.github/workflows/import-approved-submission.yml` only imports when:
   - issue has `theme-submission`
   - `approved-for-import` label is added
   - labeling actor has `write/maintain/admin` permission

## Local commands

Validate scripts:
```bash
npm run check
```

Manual import (if needed):
```bash
node scripts/import-approved.js --issue <number> --theme-name "<name>" --author-name "<author>" --device "iPod nano 7G" --release "<release>" --description "<desc>" --preview-image "<preview-url>" --tags "<comma,tags>" --ipsw-url "<direct-ipsw-url>"
```
