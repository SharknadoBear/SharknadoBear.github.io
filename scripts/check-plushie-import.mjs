import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { importPlushieIds } from "./import-plushie-ids.mjs";
import { readJson, sha256, verifyPlushieGallery } from "./verify-plushie-gallery.mjs";

// Real, decoded 1x1 lossless WebPs; small fixtures keep isolated CI checks fast.
const images = [
  "UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAdQs840s/+BiOh/AAA=",
  "UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQqmZ2pv+BiOh/AAA=",
].map((value) => Buffer.from(value, "base64"));
function pdfFixture(label) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 60] /Resources << >> >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 60] /Resources << >> >>",
  ];
  let pdf = "%PDF-1.4\n% Fixture " + label + "\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  return Buffer.from(pdf + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
const imagePath = "02_id_photos_and_pdfs/web/front.webp";
const pdfPath = "02_id_photos_and_pdfs/print/front-back.pdf";

export async function verifyPlushieImport(scratch) {
  const source = path.join(scratch, "id-import-source");
  const updateSource = path.join(scratch, "id-update-source");
  const siteInput = path.join(scratch, "id-import-site");
  const dataFile = path.join(siteInput, "_data", "plushieIds.json");
  async function fixture(root, slug, name, version = 0) {
    const directory = path.join(root, slug);
    const identityDir = path.join(directory, "01_identity");
    await mkdir(identityDir, { recursive: true });
    await writeFile(path.join(identityDir, "identity.json"), JSON.stringify({ name }));
    const output_hashes = {};
    for (const [relative, bytes] of [[imagePath, images[version % 2]], [pdfPath, pdfFixture(slug + "-" + version)]]) {
      const file = path.join(directory, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
      output_hashes[relative] = sha256(bytes);
    }
    await writeFile(path.join(identityDir, "manifest.json"), JSON.stringify({ output_hashes, web_pixels: [1, 1] }));
    await mkdir(path.join(directory, "history"), { recursive: true });
    await writeFile(path.join(directory, "history", "old-front.webp"), "Private historical revision");
    await writeFile(path.join(directory, "private-notes.txt"), "Must never be copied");
    return directory;
  }
  async function snapshot(directory = siteInput) {
    const result = {};
    async function visit(folder) {
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        const file = path.join(folder, entry.name);
        if (entry.isDirectory()) await visit(file);
        else result[path.relative(directory, file).replaceAll("\\", "/")] = sha256(await readFile(file));
      }
    }
    await visit(directory);
    return result;
  }
  const names = ["Al Ode", "Bear 5", "Bear 5.5", "Bear 27", "Patrick", "Shark 3", "Shark 4", "Snakey", "Wolfie"];
  const slugs = ["al-ode", "bear-5", "bear-5-5", "bear-27", "patrick", "shark-3", "shark-4", "snakey", "wolfie"];
  for (let index = names.length - 1; index >= 0; index -= 1) await fixture(source, slugs[index], names[index]);
  assert.deepEqual(await importPlushieIds({ source, siteInput }), { imported: 9, total: 9 });
  const first = await readJson(dataFile);
  assert.deepEqual(first.map((row) => row.name), names, "All nine names use natural order");
  assert(first.every((row) => row.petPackage === null), "New residents have explicit null packages");
  const firstFiles = Object.keys(await snapshot());
  assert.equal(firstFiles.length, 19, "Only gallery data and the 18 selected exports are copied");
  assert(firstFiles.every((file) => file === "_data/plushieIds.json" || /^assets\/plushie-ids\/[^/]+\/(front.webp|id-card.pdf)$/.test(file)));
  assert.deepEqual(await verifyPlushieGallery({ inputRoot: siteInput }), { residents: 9, assets: 18 });

  const petPath = "/assets/qa-pet.zip";
  await writeFile(path.join(siteInput, petPath.slice(1)), Buffer.from("504b0506000000000000000000000000000000000000", "hex"));
  first.find((row) => row.slug === "bear-5").petPackage = petPath;
  first.find((row) => row.slug === "bear-5-5").petPackage = null;
  first.find((row) => row.slug === "wolfie").note = "Retain an absent resident unchanged";
  await writeFile(dataFile, JSON.stringify(first));
  const absentWolfie = structuredClone(first.find((row) => row.slug === "wolfie"));
  await fixture(updateSource, "bear-5", "Bear 5", 1);
  await fixture(updateSource, "bear-5-5", "Bear 5.5", 1);
  // Both arrivals sort between the original Bears and Patrick globally. They
  // must instead follow the complete existing nine-resident sequence.
  await fixture(updateSource, "cookie-monster", "Cookie Monster", 1);
  await fixture(updateSource, "captain-bug", "Captain Bug", 1);
  assert.deepEqual(await importPlushieIds({ source: updateSource, siteInput }), { imported: 4, total: 11 });
  const refreshed = await readJson(dataFile);
  assert.deepEqual(refreshed.map((row) => row.name), [...names, "Captain Bug", "Cookie Monster"],
    "Existing order stays intact and new arrivals append in natural order");
  assert.deepEqual(await verifyPlushieGallery({ inputRoot: siteInput }), { residents: 11, assets: 22 },
    "Build validation accepts the intentional saved order");
  assert.equal(refreshed.find((row) => row.slug === "bear-5").petPackage, petPath, "Existing real package path survives");
  assert.equal(refreshed.find((row) => row.slug === "bear-5-5").petPackage, null, "Explicit null survives refresh");
  assert.deepEqual(refreshed.find((row) => row.slug === "wolfie"), absentWolfie, "Absent resident is retained unchanged");
  assert.deepEqual(await readFile(path.join(siteInput, "assets/plushie-ids/bear-5/front.webp")), images[1]);
  const stable = await snapshot();
  await importPlushieIds({ source: updateSource, siteInput });
  assert.deepEqual(await snapshot(), stable, "Repeated import is byte-stable");

  async function rejectsUnchanged(pattern) {
    const before = await snapshot();
    await assert.rejects(importPlushieIds({ source: updateSource, siteInput }), pattern);
    assert.deepEqual(await snapshot(), before, "Rejected import must not change any destination file");
  }
  for (const relative of [imagePath, pdfPath]) {
    const file = path.join(updateSource, "bear-5", relative);
    const original = await readFile(file);
    await writeFile(file, "Unrecorded edit");
    await rejectsUnchanged(/does not match the current manifest/);
    await writeFile(file, original);
  }
  const stableData = await readFile(dataFile);
  await writeFile(dataFile, JSON.stringify([...refreshed, refreshed[0]]));
  await rejectsUnchanged(/duplicate gallery resident slug/);
  await writeFile(dataFile, stableData);
  for (const invalid of ["/assets/missing.zip", "/assets/../outside.zip", "/assets/%2e%2e/outside.zip", "/assets\\outside.zip", "https://example.com/pet.zip", false]) {
    const rows = structuredClone(refreshed);
    rows.find((row) => row.slug === "bear-5").petPackage = invalid;
    await writeFile(dataFile, JSON.stringify(rows));
    await rejectsUnchanged(/missing asset|safe local file/);
  }
  await writeFile(dataFile, stableData);
  const manifestFile = path.join(updateSource, "bear-5/01_identity/manifest.json");
  const goodManifest = await readFile(manifestFile);
  const badDimensions = JSON.parse(goodManifest);
  badDimensions.web_pixels = [2, 1];
  await writeFile(manifestFile, JSON.stringify(badDimensions));
  await rejectsUnchanged(/dimensions disagree/);
  await writeFile(manifestFile, goodManifest);
  const badPDF = Buffer.from("This has a matching hash but is not a PDF");
  const sourcePDF = path.join(updateSource, "bear-5", pdfPath);
  const goodPDF = await readFile(sourcePDF);
  const signatureManifest = JSON.parse(goodManifest);
  signatureManifest.output_hashes[pdfPath] = sha256(badPDF);
  await writeFile(sourcePDF, badPDF);
  await writeFile(manifestFile, JSON.stringify(signatureManifest));
  await rejectsUnchanged(/complete PDF export/);
  await writeFile(sourcePDF, goodPDF);
  await writeFile(manifestFile, goodManifest);

  // A destination junction must never redirect public writes outside siteInput.
  const linkedInput = path.join(scratch, "id-linked-site");
  const outside = path.join(scratch, "id-outside");
  await mkdir(linkedInput, { recursive: true });
  await mkdir(outside, { recursive: true });
  await symlink(outside, path.join(linkedInput, "assets"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(importPlushieIds({ source: updateSource, siteInput: linkedInput }), /symbolic links/);
  assert.deepEqual(await readdir(outside), [], "Linked destination remains untouched");

  const broken = await readJson(dataFile);
  broken[0].imageSha256 = "0".repeat(64);
  await writeFile(dataFile, JSON.stringify(broken));
  await assert.rejects(verifyPlushieGallery({ inputRoot: siteInput }), /SHA-256 hash/);
  await writeFile(dataFile, stableData);
  const explicitSource = path.join(scratch, "id-explicit-order-source");
  await fixture(explicitSource, "alpha-arrival", "Alpha Arrival");
  await fixture(explicitSource, "beta-arrival", "Beta Arrival");
  await fixture(explicitSource, "gamma-arrival", "Gamma Arrival");
  await fixture(explicitSource, "bear-5", "Z Bear", 1);
  await writeFile(path.join(explicitSource, "order.json"), JSON.stringify(["beta-arrival", "bear-5", "alpha-arrival"]));
  assert.deepEqual(await importPlushieIds({ source: explicitSource, siteInput }), { imported: 4, total: 14 });
  const explicit = await readJson(dataFile);
  assert.deepEqual(explicit.map((row) => row.slug), [...refreshed.map((row) => row.slug), "beta-arrival", "alpha-arrival", "gamma-arrival"],
    "Explicit source order affects additions only; unlisted additions follow naturally");
  assert.equal(explicit[1].name, "Z Bear", "Renaming does not move an existing resident");
  assert.equal(explicit[1].petPackage, petPath, "Renaming preserves the real package path");
  assert.equal(explicit[2].petPackage, null, "Explicit ordering preserves null package state");
  const orderedSnapshot = await snapshot();
  await importPlushieIds({ source: explicitSource, siteInput });
  assert.deepEqual(await snapshot(), orderedSnapshot, "Explicit import is repeatable without reordering");
  for (const order of [["unknown-resident"], ["beta-arrival", "beta-arrival"], "beta-arrival"]) {
    await writeFile(path.join(explicitSource, "order.json"), JSON.stringify(order));
    await assert.rejects(importPlushieIds({ source: explicitSource, siteInput }), /unique, known resident slugs/);
    assert.deepEqual(await snapshot(), orderedSnapshot, "Invalid source order cannot change published files");
  }
  console.log("PASS: gallery preserves saved resident order, appends natural or explicitly ordered newcomers, retains absent residents and package/null values, repeats byte-stably, and rejects invalid hashes/types/dimensions/paths/order without destination writes.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const scratch = await mkdtemp(path.join(tmpdir(), "bears-plushie-import-"));
  try { await verifyPlushieImport(scratch); }
  finally {
    const resolved = path.resolve(scratch);
    assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
    assert(path.basename(resolved).startsWith("bears-plushie-import-"));
    await rm(resolved, { recursive: true, force: true });
  }
}
