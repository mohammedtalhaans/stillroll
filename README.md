# Share Stillroll with GitHub Pages

Stillroll is a static website. Visitors open a link, choose a template, add photos,
and export images. No account, API key, database, or paid image processing is required.

## Easiest route — use the prepared website

1. Extract `Stillroll-GitHub-Pages.zip` into a folder.
2. Put **the contents** in a new GitHub repository, for example `stillroll`.
   `index.html` must be at the repository's top level, not inside another folder.
   GitHub Desktop is convenient for adding the whole folder, including hidden files.
3. Push the files to the repository's `main` branch.
4. In the repository, open **Settings → Pages**.
5. Choose **Deploy from a branch**, then **main** and **/(root)**. Save.
6. Wait for GitHub to display the site address. Share that HTTPS address.

The address normally looks like `https://YOUR-USERNAME.github.io/stillroll/`.
All app assets use relative URLs, so a different repository name also works.
Keep `.nojekyll` in the repository. Upload the extracted files, not the ZIP itself.
GitHub's browser upload has batch-size limits; use GitHub Desktop for the complete folder.

## Alternative — deploy the editable source with Actions

The source project contains `.github/workflows/pages.yml`. Push the source project
with its `public/` assets to a repository, then select **GitHub Actions** as the
Pages source in Settings. The workflow installs dependencies, checks/builds/tests,
and deploys `dist/` on pushes to `main`. It does not need a personal access token.

Do not upload `node_modules/`, `.venv/`, `.git/`, old research exports, or backups.
The prepared website package already excludes those files and unused catalog assets.

## Before sharing

- Open the live URL on your phone. Choose a template, insert your photos, and export.
- Use Safari or Chrome if the Instagram/TikTok in-app browser limits saving.
- Local drafts belong to that browser and site address. Localhost drafts do not
  automatically move to the GitHub site. Use an editable `.stillroll` backup to transfer.
- The site contains the 20 Concept Atelier, 20 Panorama Atelier and 20 Parallax Field
  Editions templates. Retired templates and research media are excluded.
- Original template and font terms are included in the third-party notices.

GitHub setup reference: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
