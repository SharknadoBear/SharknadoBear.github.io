import { readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateManifest, POOL_SIZE } from "../src/assets/js/wardrobe/schedule.mjs";

// Read the static WebP container and dimensions without an image dependency.
// The exact hashes bind these files to the separately decoded/reviewed source.
export function readWebPDimensions(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 20 ||
      bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP" ||
      bytes.readUInt32LE(4) !== bytes.length - 8) throw new Error("Invalid WebP RIFF container.");
  let canvas;
  let frame;
  let offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error("Truncated WebP chunk header.");
    const type = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    const next = end + (size & 1);
    if (next > bytes.length) throw new Error("Truncated WebP chunk.");
    if (type === "ANIM" || type === "ANMF") throw new Error("Wardrobe portraits must be static WebP images.");
    if (type === "VP8X") {
      if (size !== 10 || canvas || (bytes[start] & 0x02)) throw new Error("Invalid or animated WebP canvas.");
      canvas = { width: bytes.readUIntLE(start + 4, 3) + 1, height: bytes.readUIntLE(start + 7, 3) + 1 };
    } else if (type === "VP8 ") {
      if (frame || size < 10 || (bytes[start] & 1) ||
          bytes[start + 3] !== 0x9d || bytes[start + 4] !== 0x01 || bytes[start + 5] !== 0x2a) {
        throw new Error("Invalid static WebP VP8 frame.");
      }
      frame = { width: bytes.readUInt16LE(start + 6) & 0x3fff, height: bytes.readUInt16LE(start + 8) & 0x3fff };
    } else if (type === "VP8L") {
      if (frame || size < 5 || bytes[start] !== 0x2f) throw new Error("Invalid WebP lossless frame.");
      const bits = bytes.readUInt32LE(start + 1);
      if (bits >>> 29) throw new Error("Unsupported WebP lossless version.");
      frame = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    offset = next;
  }
  if (!frame || frame.width === 0 || frame.height === 0) throw new Error("WebP has no static image frame.");
  if (canvas && (canvas.width !== frame.width || canvas.height !== frame.height)) {
    throw new Error("WebP canvas and image dimensions disagree.");
  }
  return { ...frame, format: "webp" };
}

function requireWithin(root, file) {
  const relative = path.relative(root, file);
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("Wardrobe path escapes the site input.");
  }
}

export async function verifyWardrobe({ inputRoot = "src" } = {}) {
  const root = await realpath(inputRoot);
  const manifestFile = await realpath(path.join(root, "assets", "images", "wardrobe", "manifest.json"));
  requireWithin(root, manifestFile);
  const manifest = JSON.parse((await readFile(manifestFile, "utf8")).replace(/^\uFEFF/, ""));
  const validation = validateManifest(manifest);
  if (!validation.valid) throw new Error("Wardrobe manifest is not publishable: " + validation.reason);
  for (const portrait of [...manifest.ordinary, ...manifest.special]) {
    if (!portrait.src.endsWith(".webp")) throw new Error("Wardrobe publication requires reviewed WebP portraits.");
    const file = await realpath(path.resolve(root, "." + portrait.src));
    requireWithin(root, file);
    const bytes = await readFile(file);
    if (bytes.length !== portrait.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== portrait.sha256) {
      throw new Error("Wardrobe reviewed bytes changed: " + portrait.src);
    }
    const size = readWebPDimensions(bytes);
    if (size.width !== portrait.width || size.height !== portrait.height ||
        size.width !== 1254 || size.height !== 1254) {
      throw new Error("Wardrobe dimensions changed: " + portrait.src);
    }
  }
  return { verified: true, count: POOL_SIZE * 2 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await verifyWardrobe({ inputRoot: process.argv[2] || process.env.SITE_INPUT || "src" });
    console.log("PASS: " + result.count + " reviewed wardrobe files, hashes, bytes, WebP headers, and dimensions.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
