# Bear’s Den

A small, warm journal for Bear’s science, maps, plushy inhabitants, projects, and occasional memes. Built with Eleventy, Markdown, Nunjucks, and plain CSS. Dot can maintain and publish the site; a static host such as GitHub Pages serves it to visitors.

## Run locally

Use Node.js 22 or newer and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local address printed by Eleventy. To produce and check the site:

```sh
pnpm build
pnpm check
```

The production files are written to `dist/`. No Node.js server is needed to serve those files.

In this Codex Windows workspace, Node is available but pnpm may not be on `PATH`. After the included dependencies are installed, the equivalent direct commands are `node scripts/dev.mjs`, `node scripts/build.mjs`, and `node scripts/check.mjs`. For a fresh install using Codex’s bundled pnpm:

```powershell
node "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\pnpm\bin\pnpm.cjs" install --frozen-lockfile
```

## Add something to the den

Copy an authoring template from `templates/` to the appropriate content folder. Give the file a short, lowercase, hyphenated name; that filename becomes its URL slug.

| Template | Destination | Resulting URL |
| --- | --- | --- |
| `journal-post.md` or `meme.md` | `src/content/journal/` | `/journal/<filename>/` |
| `map-entry.md` | `src/content/maps/` | `/projects/nice-maps-and-wiggling-lines/<filename>/` |
| `plushy-profile.md` | `src/content/plushies/` | `/projects/home-plushy-demographic/<filename>/` |

Replace the instructions in the copied template with your content. Every entry has a title, ISO date (`YYYY-MM-DD`), summary, kind, and draft flag. Optional `project` associates a journal entry with one of these project IDs:

- `nice-maps-and-wiggling-lines`
- `home-plushy-demographic`
- `bear-5`

Keep `draft: true` while writing. Drafts produce no page and appear in no listings, including during local preview. Set `draft: false` when you want to inspect the rendered entry locally, then review it before publishing the build. Templates stay outside `src/` and are never published.

Put images and downloadable files in `src/assets/`. Reference them with site-root paths such as `/assets/maps/example.png`; the build applies the configured hosting prefix. Supply useful `imageAlt` text for every content image. For a map, include the source, units, and any important context in the article. Add plushy ID-card and pet-package links only after the real files are present.

## Bear portrait and daily wardrobe

The original portrait remains at `src/assets/images/bear-avatar.png` as the initial image and the fallback when JavaScript, manifest loading, or today's image fails. Keep its dimensions, crop, polaroid frame, and surrounding layout unchanged.

The wardrobe contains 72 shirt/colorway pairs (144 WebP portraits) under `src/assets/images/wardrobe/`. Ordinary portraits retain clear glasses. Special portraits use sunglasses and the Santos de Cartier necklace. The public `manifest.json` contains only the stable product IDs, descriptive alternative text, file locations, dimensions, sizes, and SHA-256 hashes needed to verify and select these images. Source references, generation records, archives, and private review material stay outside the public repository.

`src/assets/js/wardrobe/` selects one portrait per Seattle calendar day (`America/Los_Angeles`). Weekends, January 16, and the 11 recurring nationwide US federal holidays, including standard observed dates, use the special pool. Other days use the ordinary pool. Each pool cycles independently through all 72 entries; refreshing does not advance it. Preserve the January 1, 2026 epoch and manifest order after launch. Open pages recheck at Seattle midnight and when returning to a visible tab.

Only today's selected portrait is preloaded. The original stays visible until that image loads successfully. The script changes only the image source and descriptive alternative text. Selection uses the visitor's clock and has no cookies, tracking, or remote runtime service.

Before replacing a wardrobe asset, review the actual image, preserve a master outside this public repository, and update its exact hash, byte size, dimensions, and alternative text in the paired manifest. Use a new filename when changing published image bytes. Builds reject incomplete pools, missing files, or changed bytes. Run `pnpm test:wardrobe`, `pnpm check`, and `pnpm build`; inspect the actual ordinary and special portraits in the existing frame before publishing.

## Current presentation

Navigation uses The Den, Rabbit Holes, and Mud Pond. The project cards and matching pages are Another wandering day, Family member demographic, and Bear 5; their original URL paths remain stable. Bear requested removal of the homepage biography section. Professional and family links remain in the footer.

## Hosting

The live site is [Bear’s Den](https://sharknadobear.github.io/). Its authoritative source is [SharknadoBear/SharknadoBear.github.io](https://github.com/SharknadoBear/SharknadoBear.github.io), renamed from `bears-den` with its history preserved. Continue updates from this repository; the original `bears-den-source.zip` is the import archive.

Build with `SITE_PATH_PREFIX=/` for this root user site. The default build prefix is also `/`; clear any old `/bears-den/` setting in your shell. The workflow on `main` installs, checks, builds, and publishes the complete `dist/` output through GitHub Actions. See [DEPLOYMENT.md](DEPLOYMENT.md) for publishing and private draft handling, and [HANDOFF.md](HANDOFF.md) for authoring and review guidance.

The first release contains three project introductions and an empty journal. Real map entries, plushy records, ID cards, Codex pet packages, and the Bear 5 robot are future work. There is no browser editor, account system, database, or runtime API.
