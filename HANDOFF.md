# Dot handoff

Bear’s Den is a static personal site at https://sharknadobear.github.io/. Continue work in the authoritative repository https://github.com/SharknadoBear/SharknadoBear.github.io, renamed from `bears-den` with its Git history preserved. The original `bears-den-source.zip` remains an import archive. GitHub Actions publishes the built site from `main`; see [DEPLOYMENT.md](DEPLOYMENT.md) for current publication settings and private draft handling.

## Give this to Dot

For future updates, use this prompt:

```text
Please continue Bear’s Den in SharknadoBear/SharknadoBear.github.io. Read README.md, HANDOFF.md, and DEPLOYMENT.md, and preserve the existing design and content. Use Node.js 22 or newer and pnpm 11.25.0; run pnpm install --frozen-lockfile, pnpm check, and pnpm build.

The confirmed repository is SharknadoBear/SharknadoBear.github.io, and the live URL is https://sharknadobear.github.io/. Build with SITE_PATH_PREFIX=/ and review at the root path. Use the committed GitHub Actions workflow to build Eleventy and publish the complete dist/ output. The supplied bear portrait is src/assets/images/bear-avatar.png, with avatarTemporary:false.

Prepare and validate first; do not deploy publicly until I ask you to publish. When publication is authorized, deploy the entire new dist/ artifact so removed pages do not remain online, verify the five initial pages and their links, and give me the public URL and repository link. Continue managing content from Markdown and rebuild for each update. GitHub Pages will serve the static site; no running Node.js server is needed.
```

## GitHub Pages setup

The current deployment is the root user site: repository `SharknadoBear.github.io`, URL `https://sharknadobear.github.io/`, and build prefix `/`. The table and subdirectory commands below are reference examples for a future hosting change:

| Site | Repository | Build prefix |
| --- | --- | --- |
| `https://OWNER.github.io/` | `OWNER.github.io` | `/` |
| `https://OWNER.github.io/REPOSITORY/` | Any project repository, for example `bears-den` | `/REPOSITORY/`, matching its exact name |

GitHub Pages supports generated static files, so Eleventy’s output fits this hosting model. The deployed artifact must contain `index.html` at its top level. [GitHub: creating a Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

For this Eleventy site, use a GitHub Actions workflow. In the chosen repository, open **Settings → Pages → Build and deployment → Source → GitHub Actions**. Keep source files and the lockfile in the repository; the workflow installs dependencies, checks, builds, and uploads only `dist/`. [GitHub: configuring the publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

The workflow should check out the source, set up Node and the pinned pnpm version, configure Pages, run the commands below with the intended prefix, upload `dist/` using `actions/upload-pages-artifact`, and deploy it using `actions/deploy-pages`. A separate deployment job needs the build job as a dependency, the `github-pages` environment, and `pages: write` plus `id-token: write` permissions. [GitHub: custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## Build and publish

Use Node.js 22 or newer and pnpm 11.25.0. From the project directory:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

For a domain root, leave `SITE_PATH_PREFIX` unset (the default is `/`). Publish the contents of `dist/` at the site root. The host must serve directory `index.html` files; the site needs no application server.

For a subdirectory such as `https://example.org/bears-den/`, set the prefix before building. In PowerShell:

```powershell
$env:SITE_PATH_PREFIX = "/bears-den/"
pnpm build
```

Publish the contents of `dist/` at `/bears-den/`. Eleventy’s HTML base plugin applies the prefix to local links and assets. Keep source URLs rooted at `/`; do not manually add the prefix to every article.

To return to the default root build in that PowerShell session:

```powershell
Remove-Item Env:SITE_PATH_PREFIX
pnpm build
```

On a POSIX shell, the equivalent one-off subdirectory build is:

```sh
SITE_PATH_PREFIX=/bears-den/ pnpm build
```

Build again whenever content or the hosting prefix changes. Deploy the full new `dist/` tree using the host’s normal replacement or synchronization process so removed and newly drafted pages do not linger online. Do not publish the source directory, `node_modules/`, or authoring templates.

## Edit and preview

- Global identity, occupation, introduction, and avatar settings live in `src/_data/site.json`.
- Homepage editorial text lives in `src/index.njk`; project introduction text lives in `src/projects/`. These content pages use the shared layouts.
- Markdown content lives in `src/content/journal/`, `src/content/maps/`, and `src/content/plushies/`. Copy the relevant starter from `templates/`; the README explains metadata and URLs.
- Shared presentation lives in `src/_includes/`; assets live in `src/assets/`.
- Run `pnpm dev` and open its printed address to preview changes. Run `pnpm check` and `pnpm build` before delivery.

Draft pages are excluded from output and listings, including local preview. Set an entry to `draft: false` to review its rendered page locally before publication. Changing a published entry back to a draft also requires replacing or synchronizing the deployed build to remove its old URL. Content sorting uses the entry date, not the file modification time.

## Review before public launch

- Inspect the supplied portrait at `src/assets/images/bear-avatar.png` and its desktop/mobile crop. Confirm `avatarTemporary: false` and descriptive alternative text in `src/_data/site.json`.
- Verify the homepage, all three project pages, and the journal on desktop and mobile. The first release should show exactly three projects and no invented posts or plushy records.
- Follow navigation and article links, inspect every image, and tab through interactive elements. Reading and navigation should work with JavaScript disabled.
- Check the footer’s Working profile and LinkedIn links, and confirm that Bear wife’s site points to https://yeweihuang.github.io/.
- Review the build using the intended hosting prefix. Confirm that its styles, images, and internal links resolve under that prefix.
- Include only real, reviewed downloadable files. Adding `idCard` or `petPackage` to a plushy profile creates an expectation that a usable file exists at that path.

Bear requested removal of the homepage biography section; do not restore it while making unrelated updates. The original supplied portrait remains the initial image and fallback, with avatarTemporary:false retained. The daily wardrobe changes only the photo and alternative text inside the existing frame; see README.md for its calendar, paired manifest, and asset maintenance rules.

Bear 5 describes a planned Raspberry Pi 5 conversation phase followed by sensing; Gemma 4 is a candidate for later evaluation, not a claim of implemented or verified hardware compatibility.

The source contains no hosting credentials, automated messages to Dot, real pet packages, ID cards, or robot software. The committed GitHub Actions workflow manages the public deployment described in DEPLOYMENT.md.

## Wardrobe release checks

Run pnpm test:wardrobe as well as the site checks. Verify ordinary weekdays, weekends, actual and observed federal holidays, January 16, Seattle midnight and daylight-saving transitions, same-day refresh stability, and failed-image fallback. Confirm that all 144 hash-bound portraits are deployed, while the browser requests only its selected daily portrait. Keep the 72-item order and epoch unchanged. Do not publish original ZIPs, garment references, generation prompts, or private review files.
