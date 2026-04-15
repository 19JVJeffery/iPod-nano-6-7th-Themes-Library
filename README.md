# iPod nano 6/7th Themes Library

GitHub Pages-hosted site for iPod nano themes with:

- Static catalog (`themes.json`)
- Community submission form (`submit.html`) that opens GitHub issue submissions
- Moderation dashboard (`admin.html`) for pending review items
- Approved IPSWs stored in-repo under `/ipsw` and tracked by Git LFS

This keeps everything on GitHub while still allowing moderation.

## Pages

- `index.html`: main library
- `submit.html`: user submission launcher
- `admin.html`: moderation helper dashboard

## GitHub Pages setup

1. In repo **Settings → Pages**, deploy from `main` branch root.
2. Ensure `.nojekyll` stays committed.

## Git LFS setup for IPSW files

1. Install Git LFS locally:
   ```bash
   git lfs install
   ```
2. `.gitattributes` already tracks `*.ipsw`.

## Submission and moderation flow

1. User opens `submit.html` and fills metadata + a direct IPSW link.
2. The form opens a prefilled GitHub issue with labels `theme-submission` and `pending-review`.
3. Admin checks pending items in `admin.html` (or directly on GitHub Issues).
4. After approval, run:
   ```bash
   node scripts/import-approved.js --issue <number> --theme-name "<name>" --author-name "<author>" --device "iPod nano 7G" --release "<release>" --description "<desc>" --preview-image "<preview-url>" --tags "<comma,tags>" --ipsw-url "<direct-ipsw-url>"
   ```
5. Commit and push updated `themes.json` + new file in `/ipsw`.

The import script downloads the IPSW into `/ipsw` and appends a catalog entry to `themes.json`.

## Local development

1. Validate scripts:
   ```bash
   npm run check
   ```
2. Serve locally with any static server:
   ```bash
   python3 -m http.server
   ```
