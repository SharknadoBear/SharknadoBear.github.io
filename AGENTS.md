# Bear's Den maintenance

Read README.md, HANDOFF.md, and DEPLOYMENT.md before editing.

- Preserve the supplied handwritten scrapbook design, bear portrait, biography, three project pages, and existing external links unless the user requests changes.
- Keep the editable Eleventy/Markdown/Nunjucks source and pnpm-lock.yaml. Use Node >=22 and pnpm 11.25.0.
- The confirmed target is SharknadoBear/SharknadoBear.github.io; build with SITE_PATH_PREFIX=/.
- Before publishing, run pnpm install --frozen-lockfile, pnpm check, and pnpm build; inspect affected pages at the intended prefix on desktop and mobile.
- Public repository files are public even when draft:true. Keep unapproved drafts and draft assets in ignored .drafts/ or another private local folder until publication is requested. Never commit them merely to preview.
- Only add download links when their reviewed files exist. Never invent journal posts, map entries, plushy records, or implemented robot capabilities.
- A push to main publishes through GitHub Actions. Publish changes only when requested, then verify the exact remote commit, CI, and live pages/assets/links.
- Do not create credentials, expand persistent access, or modify unrelated accounts without the required authorization.
