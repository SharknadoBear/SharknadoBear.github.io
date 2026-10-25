import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyPlushieImport } from "./check-plushie-import.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("../cmd.cjs", import.meta.resolve("@11ty/eleventy")));
const scratch = await mkdtemp(path.join(tmpdir(), "bears-den-check-"));
const input = path.join(scratch, "src");
const expectedPages = [
  "index.html",
  "journal/index.html",
  "projects/nice-maps-and-wiggling-lines/index.html",
  "projects/home-plushy-demographic/index.html",
  "projects/bear-5/index.html",
];
const draftMarker = "QA_DRAFT_MUST_NEVER_BE_PUBLISHED_984731";
const origin = "https://bears-den.invalid";

async function filesIn(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    result.push(...(entry.isDirectory() ? await filesIn(file) : [file]));
  }
  return result;
}

function build(output, prefix) {
  const result = spawnSync(process.execPath, [cli, "--quiet", `--config=${path.join(root, "eleventy.config.js")}`], {
    // Relative input preserves Eleventy's directory-data cascade on Windows.
    cwd: scratch,
    encoding: "utf8",
    env: { ...process.env, SITE_INPUT: "src", SITE_OUTPUT: output, SITE_PATH_PREFIX: prefix, TZ: "America/Los_Angeles" },
  });
  assert.equal(result.status, 0, `Eleventy failed:\n${result.stdout}\n${result.stderr}`);
}

const relative = (base, file) => path.relative(base, file).replaceAll("\\", "/");
const unescapeAttribute = (value) => value.replaceAll("&amp;", "&").replaceAll("&#39;", "'").replaceAll("&quot;", '"');
const escapeExpression = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function verifyReference(reference, sourceFile, output, prefix, pageUrl) {
  if (!reference || /^(data:|mailto:|tel:)/i.test(reference)) return;
  const url = new URL(unescapeAttribute(reference), pageUrl);
  if (url.origin !== origin) return;
  assert(url.pathname.startsWith(prefix), `URL escaped ${prefix}: ${reference} in ${sourceFile}`);
  const localPath = decodeURIComponent(url.pathname.slice(prefix.length));
  let target = path.resolve(output, localPath || ".");
  assert(target === output || target.startsWith(output + path.sep), `URL escaped output: ${reference}`);
  let info;
  try {
    info = await stat(target);
    if (info.isDirectory()) target = path.join(target, "index.html");
    await stat(target);
  } catch {
    assert.fail(`Broken local reference ${reference} in ${relative(output, sourceFile)}`);
  }
  if (url.hash && target.endsWith(".html")) {
    const targetHtml = await readFile(target, "utf8");
    const id = escapeExpression(decodeURIComponent(url.hash.slice(1)));
    assert(new RegExp(`\\bid\\s*=\\s*["']${id}["']`).test(targetHtml),
      `Missing anchor ${url.hash} in ${relative(output, target)}`);
  }
}

async function verifyOutput(output, prefix, initial) {
  await stat(path.join(output, ".nojekyll"));
  const files = await filesIn(output);
  const htmlFiles = files.filter((file) => file.endsWith(".html"));
  const relativeHtml = htmlFiles.map((file) => relative(output, file));
  for (const page of expectedPages) assert(relativeHtml.includes(page), `Missing page ${page}`);
  if (initial && !(await filesIn(path.join(input, "content"))).some((file) => file.endsWith(".md"))) {
    assert.equal(htmlFiles.length, 5, "The initial release must have exactly five pages.");
  }

  for (const file of htmlFiles) {
    const html = await readFile(file, "utf8");
    assert(!html.includes(draftMarker), `A draft leaked into ${relative(output, file)}`);
    if (!relative(output, file).startsWith("__check__/")) {
      assert(/<html\b[^>]*lang=["']en["']/.test(html), `Missing document language in ${file}`);
      assert(/<title>[^<]+<\/title>/.test(html), `Missing page title in ${file}`);
      assert.equal((html.match(/<main\b/g) || []).length, 1, `Expected one main landmark in ${file}`);
      assert.equal((html.match(/<h1\b/g) || []).length, 1, `Expected one primary heading in ${file}`);
      for (const image of html.matchAll(/<img\b[^>]*>/g)) {
        assert(/\balt\s*=/.test(image[0]), `An image has no alt attribute in ${file}`);
      }
    }
    const pagePath = relative(output, file).replace(/index\.html$/, "");
    const pageUrl = `${origin}${prefix}${pagePath}`;
    for (const attribute of html.matchAll(/\b(?:href|src|poster)\s*=\s*["']([^"']*)["']/g)) {
      await verifyReference(attribute[1], file, output, prefix, pageUrl);
    }
  }
  for (const file of files.filter((file) => file.endsWith(".css"))) {
    const css = await readFile(file, "utf8");
    for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^'"\s)]+))\s*\)/g)) {
      await verifyReference(match[1] ?? match[2] ?? match[3], file, output, prefix, `${origin}${prefix}${relative(output, file)}`);
    }
  }
  const homepage = await readFile(path.join(output, "index.html"), "utf8");
  assert(homepage.includes('href="https://yeweihuang.github.io/"'), "The wife's site link is missing or changed.");
  for (const page of expectedPages.slice(2)) {
    assert(homepage.includes(`${prefix}${page.replace(/index\.html$/, "")}`), `Homepage lacks project ${page}`);
  }
}

async function writeFixture(section, slug, metadata, body) {
  const content = [
    "---",
    ...Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    "---",
    body || "A temporary fixture with **bold check**.",
    "",
  ].join("\n");
  await writeFile(path.join(input, "content", section, `${slug}.md`), content);
}

async function verifyGallery(output, prefix) {
  const residents = JSON.parse(await readFile(path.join(input, "_data", "plushieIds.json"), "utf8"));
  const html = await readFile(path.join(output, "projects", "home-plushy-demographic", "index.html"), "utf8");
  assert.equal((html.match(/class="resident-card"/g) || []).length, residents.length);
  const ids = [...html.matchAll(/<h3 id="resident-([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, residents.map((resident) => resident.slug), "Rendered residents preserve the approved data order");
  assert(html.includes(`class="resident-count">${residents.length} residents in the den.</p>`), "The gallery displays its data-driven count");
  assert.equal((html.match(/class="resident-pet-pending"/g) || []).length, residents.filter((resident) => !resident.petPackage).length);
  assert.equal((html.match(/class="resident-pet-download"/g) || []).length, residents.filter((resident) => resident.petPackage).length);
  for (const resident of residents) {
    const image = `${prefix}${resident.image.slice(1)}`;
    assert(html.includes(`href="${image}" target="_blank" rel="noopener"`), "Full-size front link");
    assert(html.includes(`src="${image}"`), "Gallery image respects hosting prefix");
    assert(html.includes(`href="${prefix}${resident.idCard.slice(1)}" download="${resident.slug}-id-card.pdf"`), "Real PDF download respects hosting prefix");
    if (resident.petPackage) assert(html.includes(`href="${prefix}${resident.petPackage.slice(1)}" download`));
  }
  assert(!html.includes('<a class="resident-pet-pending"'), "Pending packages must not be fake links.");
}

async function verifyGalleryPetDownloads() {
  const dataFile = path.join(input, "_data", "plushieIds.json");
  const original = await readFile(dataFile, "utf8");
  const residents = JSON.parse(original);
  try {
    residents[0].petPackage = "/assets/qa-pet-package.zip";
    await writeFile(dataFile, JSON.stringify(residents));
    for (const [label, prefix] of [["root", "/"], ["subdirectory", "/bears-den-check/"]]) {
      const output = path.join(scratch, `pet-gallery-${label}`);
      build(output, prefix);
      await verifyGallery(output, prefix);
    }
    residents[0].petPackage = "/assets/qa-missing-pet.zip";
    await writeFile(dataFile, JSON.stringify(residents));
    const result = spawnSync(process.execPath, [cli, "--quiet", `--config=${path.join(root, "eleventy.config.js")}`], {
      cwd: scratch, encoding: "utf8",
      env: { ...process.env, SITE_INPUT: "src", SITE_OUTPUT: path.join(scratch, "invalid-gallery"), SITE_PATH_PREFIX: "/" },
    });
    assert.notEqual(result.status, 0, "A missing gallery package must stop the build.");
    assert(`${result.stdout}${result.stderr}`.includes("petPackage points to a missing asset"));
  } finally { await writeFile(dataFile, original); }
  console.log("PASS: gallery pet downloads activate only with existing files, including subdirectory URLs.");
}

async function addFixtures() {
  await mkdir(path.join(input, "assets"), { recursive: true });
  await writeFile(path.join(input, "assets", "qa-fixture.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="green"/></svg>');
  await writeFile(path.join(input, "assets", "qa-id-card.txt"), "Temporary download validation fixture.");
  await writeFile(path.join(input, "assets", "qa-pet-package.zip"), "Temporary download validation fixture; not a pet package.");
  const journalEntries = [
    ["qa-older-post", "QA older field note", "2024-03-10", "post", "bear-5"],
    ["qa-date-only-post", "QA middle field note", "2024-03-11", "post", "nice-maps-and-wiggling-lines"],
    ["qa-newer-meme", "QA newest meme", "2024-03-12", "meme", "bear-5"],
  ];
  for (const [slug, title, date, kind, project] of journalEntries) {
    await writeFixture("journal", slug, { title, date, kind, project, summary: "Temporary validation content.", draft: false },
      "A temporary fixture with **bold check**.\n\n![A green square for a temporary image check.](/assets/qa-fixture.svg)");
  }
  await writeFixture("maps", "qa-map", {
    title: "QA map", date: "2024-03-13", summary: "Temporary map.", draft: false,
    image: "/assets/qa-fixture.svg", imageAlt: "A green square for a temporary map check.",
    caption: "A temporary map caption.", sourceLabel: "Test source", sourceUrl: "https://example.com/",
  });
  await writeFixture("plushies", "qa-plushy", {
    title: "QA plushy", date: "2024-03-14", summary: "Temporary plushy.", draft: false,
    idCard: "/assets/qa-id-card.txt", petPackage: "/assets/qa-pet-package.zip",
  });
  for (const section of ["journal", "maps", "plushies"]) {
    await writeFixture(section, "qa-draft", {
      title: draftMarker, date: "2099-01-01", summary: draftMarker, draft: true, project: "bear-5",
    }, draftMarker);
  }
  await writeFile(path.join(input, "qa-probe.njk"), `---
layout: false
permalink: /__check__/index.html
eleventyExcludeFromCollections: true
---
<script id="check-collections" type="application/json">{
"journal": [{% for entry in collections.journal %}{"title":{{ entry.data.title | dump | safe }},"kind":{{ entry.data.kind | dump | safe }},"date":"{{ entry.date | dateISO }}","project":{{ (entry.data.project or "") | dump | safe }}}{% if not loop.last %},{% endif %}{% endfor %}],
"maps": [{% for entry in collections.maps %}{{ entry.data.title | dump | safe }}{% if not loop.last %},{% endif %}{% endfor %}],
"plushies": [{% for entry in collections.plushies %}{{ entry.data.title | dump | safe }}{% if not loop.last %},{% endif %}{% endfor %}],
"bearFive": [{% for entry in collections.journal | projectEntries("bear-5") %}{{ entry.data.title | dump | safe }}{% if not loop.last %},{% endif %}{% endfor %}],
"dateOnly": "{{ '2024-03-10' | readableDate }}"
}</script>`);
}

async function verifyFixtures(output, prefix) {
  const probe = await readFile(path.join(output, "__check__", "index.html"), "utf8");
  const data = JSON.parse(probe.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);
  const journal = data.journal.filter((entry) => entry.title.startsWith("QA "));
  assert.deepEqual(journal.map((entry) => entry.title), ["QA newest meme", "QA middle field note", "QA older field note"]);
  assert.equal(journal[0].kind, "meme", "Memes must be journal entries.");
  assert.equal(journal[2].date, "2024-03-10", "Date-only values must retain their UTC calendar day.");
  assert.equal(data.dateOnly, "March 10, 2024", "Readable dates must be independent of local timezone.");
  assert(data.maps.includes("QA map"), "Map entries are missing from their collection.");
  assert(data.plushies.includes("QA plushy"), "Plushy entries are missing from their collection.");
  assert.deepEqual(data.bearFive.filter((title) => title.startsWith("QA ")), ["QA newest meme", "QA older field note"]);

  const files = await filesIn(output);
  assert(!files.some((file) => relative(output, file).includes("qa-draft")), "Drafts must not create any output files.");
  const post = await readFile(path.join(output, "journal", "qa-older-post", "index.html"), "utf8");
  assert(post.includes("<strong>bold check</strong>"), "Post Markdown did not render.");
  assert(post.includes(`src="${prefix}assets/qa-fixture.svg"`), "Markdown image URL did not respect the hosting prefix.");
  assert(post.includes(`${prefix}projects/bear-5/`), "Project association did not render on the post.");
  const project = await readFile(path.join(output, "projects", "bear-5", "index.html"), "utf8");
  assert(project.includes("QA older field note") && project.includes("QA newest meme"), "Project updates did not render.");
  assert(!project.includes("QA middle field note"), "An unrelated project's update leaked into Bear 5.");
  const map = await readFile(path.join(output, "projects", "nice-maps-and-wiggling-lines", "qa-map", "index.html"), "utf8");
  assert(map.includes("A temporary map caption.") && map.includes('href="https://example.com/"'), "Map caption and source must render.");
  const plushy = await readFile(path.join(output, "projects", "home-plushy-demographic", "qa-plushy", "index.html"), "utf8");
  assert(plushy.includes(`href="${prefix}assets/qa-id-card.txt"`), "Available ID card download did not render.");
  assert(plushy.includes(`href="${prefix}assets/qa-pet-package.zip"`), "Available pet package download did not render.");
}

async function verifyCleanBuild() {
  const output = path.join(scratch, "dist");
  await cp(path.join(scratch, "fixtures-root"), output, { recursive: true });
  const formerPost = path.join(output, "journal", "qa-older-post", "index.html");
  await stat(formerPost);
  await writeFile(path.join(output, "stale.html"), "This removed page must disappear on the next build.");
  const source = path.join(input, "content", "journal", "qa-older-post.md");
  await writeFile(source, (await readFile(source, "utf8")).replace("draft: false", "draft: true"));

  // Load the actual config and build wrapper from a separate working directory.
  // Their source imports still resolve against the installed project dependencies.
  const configUrl = pathToFileURL(path.join(root, "eleventy.config.js")).href;
  await writeFile(path.join(scratch, "eleventy.config.mjs"), `export { default } from ${JSON.stringify(configUrl)};\n`);
  const environment = { ...process.env, SITE_PATH_PREFIX: "/" };
  delete environment.SITE_INPUT;
  delete environment.SITE_OUTPUT;
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "build.mjs")], {
    cwd: scratch, encoding: "utf8", env: environment,
  });
  assert.equal(result.status, 0, `Clean build failed:\n${result.stdout}\n${result.stderr}`);
  const files = await filesIn(output);
  assert(!files.includes(formerPost), "A formerly published post changed to draft survived a clean build.");
  assert(!files.includes(path.join(output, "stale.html")), "A removed page survived a clean build.");
  await verifyOutput(output, "/", false);
  const journal = await readFile(path.join(output, "journal", "index.html"), "utf8");
  assert(!journal.includes("QA older field note"), "A newly drafted post remained in the journal listing.");
  console.log("PASS: clean publishing removes deleted pages and formerly published drafts.");
}

async function verifyMissingDownloadRejected() {
  await writeFixture("plushies", "qa-broken-download", {
    title: "QA invalid download", date: "2024-03-14", summary: "A broken download must stop the build.",
    draft: false, petPackage: "/assets/this-file-does-not-exist.zip",
  });
  const result = spawnSync(process.execPath, [cli, "--quiet", `--config=${path.join(root, "eleventy.config.js")}`], {
    cwd: scratch, encoding: "utf8",
    env: { ...process.env, SITE_INPUT: "src", SITE_OUTPUT: path.join(scratch, "invalid-output"), SITE_PATH_PREFIX: "/" },
  });
  assert.notEqual(result.status, 0, "A missing pet download must fail before publishing.");
  assert(`${result.stdout}${result.stderr}`.includes("petPackage points to a missing asset"), "Missing downloads need an actionable error.");
  console.log("PASS: missing download assets produce an authoring error.");
}

async function verifyLivePreview() {
  const output = path.join(scratch, "preview");
  await mkdir(path.join(output, "obsolete"), { recursive: true });
  await writeFile(path.join(output, "obsolete", "index.html"), "An old preview page.");
  await writeFile(path.join(input, "assets", "qa-standalone.html"), "A passthrough HTML asset must remain.");
  for (const slug of ["qa-preview-draft", "qa-preview-delete"]) {
    await writeFixture("journal", slug, { title: slug, date: "2024-03-15", summary: "Live preview fixture.", draft: false });
  }
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  reservation.close();
  await once(reservation, "close");
  const preview = spawn(process.execPath, [path.join(root, "scripts", "dev.mjs")], {
    cwd: scratch, windowsHide: true,
    env: { ...process.env, SITE_INPUT: "src", SITE_OUTPUT: output, SITE_PATH_PREFIX: "/", SITE_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  preview.stdout.on("data", (chunk) => { logs = (logs + chunk).slice(-20000); });
  preview.stderr.on("data", (chunk) => { logs = (logs + chunk).slice(-20000); });
  const exists = async (file) => { try { await stat(file); return true; } catch { return false; } };
  const status = async (url) => {
    try { return (await fetch(`http://localhost:${port}${url}`, { signal: AbortSignal.timeout(1500) })).status; }
    catch { return 0; }
  };
  async function waitUntil(predicate, message) {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      assert(preview.exitCode === null, `Preview exited unexpectedly:\n${logs}`);
      if (await predicate()) return;
      await delay(100);
    }
    assert.fail(`${message}\n${logs}`);
  }
  try {
    await waitUntil(async () => logs.includes("Watching") && await status("/journal/qa-preview-draft/") === 200,
      "Live preview did not become ready.");
    assert(!await exists(path.join(output, "obsolete", "index.html")), "Preview startup retained obsolete HTML.");
    const draftedSource = path.join(input, "content", "journal", "qa-preview-draft.md");
    await writeFile(draftedSource, (await readFile(draftedSource, "utf8")).replace("draft: false", "draft: true"));
    await waitUntil(async () => !await exists(path.join(output, "journal", "qa-preview-draft", "index.html")),
      "A post made draft remained on disk during preview.");
    assert.equal(await status("/journal/qa-preview-draft/"), 404, "A newly drafted preview URL must return 404.");
    await rm(path.join(input, "content", "journal", "qa-preview-delete.md"));
    await waitUntil(async () => !await exists(path.join(output, "journal", "qa-preview-delete", "index.html")),
      "A deleted post remained on disk during preview.");
    assert.equal(await status("/journal/qa-preview-delete/"), 404, "A deleted preview URL must return 404.");
    const journal = await readFile(path.join(output, "journal", "index.html"), "utf8");
    assert(!journal.includes("qa-preview-draft") && !journal.includes("qa-preview-delete"), "Preview listings retained removed entries.");
    assert.equal(await readFile(path.join(output, "assets", "qa-standalone.html"), "utf8"),
      "A passthrough HTML asset must remain.", "Preview pruning must preserve HTML assets.");
    console.log("PASS: live preview removes newly drafted/deleted pages, returns 404, and preserves HTML assets.");
  } finally {
    if (preview.exitCode === null) {
      preview.kill();
      await once(preview, "exit");
    }
  }
}

try {
  await verifyPlushieImport(scratch);
  await cp(path.join(root, "src"), input, { recursive: true });
  for (const [label, prefix] of [["root", "/"], ["subdirectory", "/bears-den-check/"]]) {
    const output = path.join(scratch, `initial-${label}`);
    build(output, prefix);
    await verifyOutput(output, prefix, true);
    await verifyGallery(output, prefix);
    console.log(`PASS: current site pages, links, assets, anchors, and structure at ${prefix}`);
  }
  await addFixtures();
  await verifyGalleryPetDownloads();
  for (const [label, prefix] of [["root", "/"], ["subdirectory", "/bears-den-check/"]]) {
    const output = path.join(scratch, `fixtures-${label}`);
    build(output, prefix);
    await verifyOutput(output, prefix, false);
    await verifyFixtures(output, prefix);
    console.log(`PASS: posts, memes, date order, project associations, maps, plushies, and draft exclusion at ${prefix}`);
  }
  await verifyCleanBuild();
  await verifyLivePreview();
  await verifyMissingDownloadRejected();
  console.log("All checks passed. Temporary content was never added to src/ or dist/.");
} finally {
  // Delete only the unique, explicitly verified temporary directory created above.
  const resolved = path.resolve(scratch);
  assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
  assert(path.basename(resolved).startsWith("bears-den-check-"));
  await rm(resolved, { recursive: true, force: true });
}
