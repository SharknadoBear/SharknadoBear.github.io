# Bear's Den publication

- Site: https://sharknadobear.github.io/bears-den/
- Repository: https://github.com/SharknadoBear/bears-den
- Publishing branch: `main`
- Pages source: GitHub Actions
- Build prefix: `/bears-den/`

The workflow in `.github/workflows/deploy.yml` installs the pinned dependencies, runs the existing checks, builds the entire site, and deploys only `dist/`. Pull requests validate without deployment. Actions are pinned to immutable commit IDs; update those pins deliberately.

## Future updates

Read `README.md` and `HANDOFF.md` for content templates, source paths, and design constraints. Preserve the handwritten scrapbook design, portrait, supplied biography, and external profile links unless Bear requests a change.

Keep unapproved draft content and assets in the ignored `.drafts/` folder (or another private local folder). This repository is public: even Markdown with `draft: true` is readable if committed, and every file under `src/assets/` is copied to the site. The draft flag prevents generated pages and listings; it does not make public repository files or assets private.

For each requested update, edit a working copy, preview at `/bears-den/`, and run `pnpm check` plus `pnpm build`. Add images and downloads only when their actual files exist and are approved for publication. Commit only the reviewed content and assets. Push to `main` only when publication is requested; a push deploys automatically.

After pushing, confirm the remote `main` commit equals the intended local commit and that its exact Actions run succeeds. Verify the live page URLs, navigation, images, downloads, and affected layouts on desktop and mobile. Changing a published entry to a draft requires a full deployment to remove its former page; inspect whether its assets should also be removed.

The initial release contains five pages: home, journal, and the three project introductions. The journal contains no posts. No scheduled task or background content publishing is configured.
