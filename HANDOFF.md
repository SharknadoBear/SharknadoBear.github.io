# Dot handoff

Bear’s Den is a static personal site. Give Dot `deliverables/bears-den-source.zip` to continue working on it. Dot manages the source and publishing workflow; GitHub Pages serves the built site. This handoff does not create a repository or deploy anything.

## Give this to Dot

Attach the source zip, then paste:

```text
Please take over Bear’s Den using the attached bears-den-source.zip. Read README.md and HANDOFF.md, preserve the existing design and content, and prepare it for GitHub Pages. Use Node.js 22 or newer and pnpm 11.25.0; run pnpm install --frozen-lockfile, pnpm check, and pnpm build.

Use the GitHub account and repository I specify. If I have not specified them, ask for the target before making external changes. For a project URL https://OWNER.github.io/REPOSITORY/, set SITE_PATH_PREFIX=/REPOSITORY/ before building. For a user site https://OWNER.github.io/, use /. Review the site at its intended prefix and prepare a GitHub Actions workflow that builds Eleventy and publishes the complete dist/ output. The supplied bear portrait is src/assets/images/bear-avatar.png, with avatarTemporary:false.

Prepare and validate first; do not deploy publicly until I ask you to publish. When publication is authorized, deploy the entire new dist/ artifact so removed pages do not remain online, verify the five initial pages and their links, and give me the public URL and repository link. Continue managing content from Markdown and rebuild for each update. GitHub Pages will serve the static site; no running Node.js server is needed.
```

## GitHub Pages setup

Choose the destination before building:

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
- Check Bear’s PNNL and LinkedIn profile links, and confirm that [Yewei’s corner](https://yeweihuang.github.io/) points to `https://yeweihuang.github.io/`.
- Review the build using the intended hosting prefix. Confirm that its styles, images, and internal links resolve under that prefix.
- Include only real, reviewed downloadable files. Adding `idCard` or `petPackage` to a plushy profile creates an expectation that a usable file exists at that path.

The introduction uses only Bear’s supplied biography. The avatar uses the newly supplied bear portrait; the `avatarTemporary: false` setting identifies it as the selected portrait rather than the earlier stand-in.

Bear 5 describes a planned Raspberry Pi 5 conversation phase followed by sensing; Gemma 4 is a candidate for later evaluation, not a claim of implemented or verified hardware compatibility.

There are no hosting credentials, public deployment, automated messages to Dot, real pet packages, ID cards, or robot software included in this release.
