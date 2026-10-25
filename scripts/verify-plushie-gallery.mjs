import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readWebPDimensions } from "./verify-wardrobe.mjs";

export const residentNames = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
export const residentSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const readJson = async (file) => JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
export const sortResidents = (rows) => [...rows].sort((a, b) => residentNames.compare(a.name, b.name) || residentNames.compare(a.slug, b.slug));

export function requireWithin(root, file) {
  const relative = path.relative(root, file);
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("Gallery asset path must stay inside its input directory.");
  }
}

export function assetRelative(value, field) {
  if (typeof value !== "string" || !/^\/assets\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value) ||
      value.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error(`${field} must reference a safe local file under /assets/.`);
  }
  return value.slice(1);
}

export async function readContainedFile(root, relative) {
  const resolvedRoot = await realpath(root);
  const file = await realpath(path.resolve(resolvedRoot, relative));
  requireWithin(resolvedRoot, file);
  if (!(await lstat(file)).isFile()) throw new Error(`Gallery asset is not a file: ${relative}`);
  return readFile(file);
}

export async function readGalleryAsset(inputRoot, url) {
  const relative = assetRelative(url, "Gallery asset").slice("assets/".length);
  const root = await realpath(inputRoot);
  const assets = await realpath(path.join(root, "assets"));
  requireWithin(root, assets);
  return readContainedFile(assets, relative);
}

export function validateResidentIdentity(rows) {
  if (!Array.isArray(rows)) throw new Error("plushieIds.json must contain an array.");
  const slugs = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object" || typeof row.slug !== "string" || !residentSlug.test(row.slug) || slugs.has(row.slug)) {
      throw new Error("Invalid or duplicate gallery resident slug: " + row?.slug);
    }
    if (typeof row.name !== "string" || !row.name.trim()) throw new Error(row.slug + ": missing resident name.");
    slugs.add(row.slug);
  }
}

// This verifier reads only portable, committed site inputs. It never imports IDs.
export async function verifyGalleryRows(rows, { inputRoot = "src", readAsset } = {}) {
  validateResidentIdentity(rows);
  if (!rows.length) throw new Error("The resident gallery must not be empty.");
  // The array order is editorial and is preserved by rendering and import.
  const read = readAsset || ((url) => readGalleryAsset(inputRoot, url));
  for (const row of rows) {
    const base = "/assets/plushie-ids/" + row.slug;
    if (row.image !== base + "/front.webp" || row.idCard !== base + "/id-card.pdf") {
      throw new Error(row.slug + ": use the selected front.webp and id-card.pdf paths.");
    }
    for (const field of ["image", "idCard"]) assetRelative(row[field], field);
    if (typeof row.imageAlt !== "string" || !row.imageAlt.trim()) throw new Error(row.slug + ": imageAlt is required.");
    if (![row.width, row.height].every((value) => Number.isInteger(value) && value > 0)) {
      throw new Error(row.slug + ": positive image dimensions are required.");
    }
    for (const field of ["imageSha256", "idCardSha256"]) {
      if (typeof row[field] !== "string" || !/^[a-f0-9]{64}$/.test(row[field])) throw new Error(row.slug + ": " + field + " is required.");
    }
    const image = await read(row.image);
    const pdf = await read(row.idCard);
    if (sha256(image) !== row.imageSha256 || sha256(pdf) !== row.idCardSha256) {
      throw new Error(row.slug + ": gallery asset does not match its reviewed SHA-256 hash.");
    }
    const dimensions = readWebPDimensions(image);
    if (dimensions.width !== row.width || dimensions.height !== row.height) throw new Error(row.slug + ": gallery image dimensions disagree.");
    if (!pdf.subarray(0, 8).toString("ascii").startsWith("%PDF-") || !/%%EOF\s*$/.test(pdf.subarray(-1024).toString("ascii"))) {
      throw new Error(row.slug + ": ID card is not a complete PDF export.");
    }
    if (row.petPackage !== undefined && row.petPackage !== null) {
      assetRelative(row.petPackage, "petPackage");
      let pet;
      try { pet = await read(row.petPackage); }
      catch (error) {
        if (error.code === "ENOENT") throw new Error("petPackage points to a missing asset: " + row.petPackage);
        throw error;
      }
      if (!pet.length) throw new Error(row.slug + ": petPackage must not be empty.");
    }
  }
  return { residents: rows.length, assets: rows.length * 2 };
}

export async function verifyPlushieGallery({ inputRoot = "src" } = {}) {
  const bytes = await readContainedFile(inputRoot, "_data/plushieIds.json");
  const rows = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  return verifyGalleryRows(rows, { inputRoot });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await verifyPlushieGallery({ inputRoot: process.argv[2] || process.env.SITE_INPUT || "src" });
    console.log(`PASS: ${result.residents} residents in their saved order and ${result.assets} hash-verified gallery exports.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
