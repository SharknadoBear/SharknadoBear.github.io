import { lstat, mkdir, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assetRelative, readContainedFile, readGalleryAsset, readJson, requireWithin, residentSlug, sha256, sortResidents, validateResidentIdentity, verifyGalleryRows } from "./verify-plushie-gallery.mjs";

// Reject redirecting links at every existing output component before writes.
async function safeDestination(root, relative) {
  const file = path.resolve(root, relative);
  requireWithin(root, file);
  let current = root;
  for (const part of path.relative(root, file).split(path.sep)) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error("Import destination must not contain symbolic links: " + current);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return file;
}

// Explicit authoring command; ordinary builds use only committed gallery files.
export async function importPlushieIds({ source = path.resolve("deliverables/plushie-ids"), siteInput = path.resolve("src") } = {}) {
  const sourceRoot = await realpath(source);
  await mkdir(siteInput, { recursive: true });
  const inputRoot = await realpath(siteInput);
  if (sourceRoot === inputRoot || sourceRoot.startsWith(inputRoot + path.sep) || inputRoot.startsWith(sourceRoot + path.sep)) {
    throw new Error("The ID source and site input must be separate directories.");
  }
  const dataFile = await safeDestination(inputRoot, "_data/plushieIds.json");
  let previous = [];
  try { previous = await readJson(dataFile); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  validateResidentIdentity(previous);
  const residents = new Map(previous.map((resident) => [resident.slug, resident]));
  const staged = new Map();
  let imported = 0;
  const exports = [
    ["02_id_photos_and_pdfs/web/front.webp", "front.webp"],
    ["02_id_photos_and_pdfs/print/front-back.pdf", "id-card.pdf"],
  ];
  // Read only current outputs. Validate the entire merged result before writes.
  for (const folder of await readdir(sourceRoot, { withFileTypes: true })) {
    if (folder.isSymbolicLink()) throw new Error("Resident sources must not be symbolic links: " + folder.name);
    if (!folder.isDirectory()) continue;
    const slug = folder.name;
    if (!residentSlug.test(slug)) throw new Error("Invalid resident folder: " + slug);
    const directory = path.join(sourceRoot, slug);
    const json = async (relative) => JSON.parse((await readContainedFile(directory, relative)).toString("utf8").replace(/^\uFEFF/, ""));
    const identity = await json("01_identity/identity.json");
    const manifest = await json("01_identity/manifest.json");
    if (typeof identity.name !== "string" || !identity.name.trim()) throw new Error(slug + ": missing identity name.");
    const hashes = [];
    const base = "/assets/plushie-ids/" + slug;
    for (const [relative, destination] of exports) {
      const bytes = await readContainedFile(directory, relative);
      const digest = sha256(bytes);
      if (digest !== manifest.output_hashes?.[relative]) {
        throw new Error(`${slug}: ${relative} does not match the current manifest. Regenerate the ID exports first.`);
      }
      const url = base + "/" + destination;
      await safeDestination(inputRoot, assetRelative(url, "Import destination"));
      staged.set(url, bytes);
      hashes.push(digest);
    }
    const [width, height] = manifest.web_pixels || [];
    residents.set(slug, {
      slug, name: identity.name.trim(), image: base + "/front.webp",
      imageAlt: `Front of ${identity.name.trim()}'s Bear's Den novelty ID card`,
      width, height, idCard: base + "/id-card.pdf",
      imageSha256: hashes[0], idCardSha256: hashes[1],
      petPackage: residents.get(slug)?.petPackage ?? null,
    });
    imported += 1;
  }
  if (!imported) throw new Error("No resident folders found in " + sourceRoot + ".");
  // JSON order is intentional: refresh in place, then append only new arrivals.
  // Optional source order.json lists slugs; it affects newcomers only. Any
  // unlisted newcomers follow in deterministic natural name order.
  let sourceOrder = [];
  try {
    sourceOrder = JSON.parse((await readContainedFile(sourceRoot, "order.json")).toString("utf8").replace(/^\uFEFF/, ""));
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!Array.isArray(sourceOrder) || sourceOrder.some((slug) => typeof slug !== "string" || !residentSlug.test(slug) || !residents.has(slug)) ||
      new Set(sourceOrder).size !== sourceOrder.length) {
    throw new Error("Source order.json must contain unique, known resident slugs.");
  }
  const existing = new Set(previous.map((row) => row.slug));
  const newcomers = sortResidents([...residents.values()].filter((row) => !existing.has(row.slug)));
  const explicitlyOrdered = sourceOrder.filter((slug) => !existing.has(slug));
  const explicitSet = new Set(explicitlyOrdered);
  const ordered = [
    ...previous.map((row) => residents.get(row.slug)),
    ...explicitlyOrdered.map((slug) => residents.get(slug)),
    ...newcomers.filter((row) => !explicitSet.has(row.slug)),
  ];
  await verifyGalleryRows(ordered, {
    inputRoot,
    readAsset: (url) => staged.has(url) ? staged.get(url) : readGalleryAsset(inputRoot, url),
  });
  for (const [url, bytes] of staged) {
    const file = await safeDestination(inputRoot, assetRelative(url, "Import destination"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  await mkdir(path.dirname(dataFile), { recursive: true });
  await writeFile(dataFile, JSON.stringify(ordered, null, 2) + "\n");
  return { imported, total: ordered.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length > 3) throw new Error("Usage: node scripts/import-plushie-ids.mjs [source-folder]");
  const result = await importPlushieIds(process.argv[2] ? { source: path.resolve(process.argv[2]) } : {});
  console.log(`Imported ${result.imported} current IDs; ${result.total} residents in the gallery. Existing pet-package settings retained.`);
}
