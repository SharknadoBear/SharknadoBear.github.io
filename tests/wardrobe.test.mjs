// Test-only fixtures below are synthetic and are never saved as a release manifest.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { classifyDate, dayNumber, seattleDateKey, nextSeattleMidnight, rotationSlot, selectPortrait, validateManifest } from "../src/assets/js/wardrobe/schedule.mjs";
import { verifyWardrobe, readWebPDimensions } from "../scripts/verify-wardrobe.mjs";
import { mountRotation, preloadPortrait } from "../src/assets/js/wardrobe/rotation-controller.mjs";
import { wardrobeURLs, startWardrobe } from "../src/assets/js/wardrobe/bootstrap.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const here = path.dirname(fileURLToPath(import.meta.url));
function fixture() {
  const entries = (pool) => Array.from({ length: 72 }, (_, i) => {
    const text = "TEST-ONLY-" + pool + "-" + i;
    return {
      id: "shirt-" + String(i + 1).padStart(2, "0"),
      src: "/assets/images/wardrobe/" + pool + "/test-" + (i + 1) + ".webp",
      alt: "Test fixture bear wearing " + pool + " shirt " + (i + 1),
      reviewed: true, sha256: hash(text), bytes: Buffer.byteLength(text), width: 1254, height: 1254,
    };
  });
  return { schemaVersion: 1, enabled: true, timeZone: "America/Los_Angeles", epoch: "2026-01-01", poolSize: 72,
    ordinary: entries("ordinary"), special: entries("special"),
    verification: { status: "complete", algorithm: "sha256", assetCount: 144 } };
}
const dateKey = (day) => new Date(day * 86400000).toISOString().slice(0, 10);

test("OPM 2026 observed dates are special; ordinary weekdays remain ordinary", () => {
  for (const key of ["2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19",
    "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25"]) {
    assert.equal(classifyDate(key).pool, "special", key);
  }
  assert.equal(classifyDate("2026-11-27").pool, "ordinary");
  assert.equal(classifyDate("2026-07-04").pool, "special"); // actual + weekend
});

test("cross-year New Year observation, Sunday observation, and leap day", () => {
  assert(classifyDate("2027-12-31").reasons.includes("New Year's Day (observed)"));
  assert(classifyDate("2021-12-31").reasons.includes("New Year's Day (observed)"));
  assert(classifyDate("2023-01-02").reasons.includes("New Year's Day (observed)"));
  assert(classifyDate("2028-01-01").reasons.includes("New Year's Day"));
  assert.equal(classifyDate("2028-02-29").pool, "ordinary");
  assert.throws(() => classifyDate("2027-02-29"), RangeError);
});

test("birthday overrides weekday and overlap advances only one special slot", () => {
  assert.equal(classifyDate("2026-01-16").pool, "special");
  const overlap = classifyDate("2023-01-16");
  assert(overlap.reasons.includes("Bear's birthday"));
  assert(overlap.reasons.includes("Birthday of Martin Luther King, Jr."));
  assert.equal(rotationSlot("2027-01-16").ordinal + 1, rotationSlot("2027-01-17").ordinal);
});

test("Seattle day identity ignores visitor timezone and stays stable around DST", () => {
  assert.equal(seattleDateKey("2026-10-22T06:59:59Z"), "2026-10-21");
  assert.equal(seattleDateKey("2026-10-22T07:00:00Z"), "2026-10-22");
  assert.equal(seattleDateKey("2026-03-08T09:59:59Z"), "2026-03-08");
  assert.equal(seattleDateKey("2026-03-08T10:00:00Z"), "2026-03-08");
  assert.equal(seattleDateKey("2026-11-01T08:30:00Z"), seattleDateKey("2026-11-01T09:30:00Z"));
});

test("next Seattle midnight correctly handles 23h, 25h, year and leap boundaries", () => {
  for (const [now, next] of [
    ["2026-03-08T08:00:00Z", "2026-03-09T07:00:00.000Z"],
    ["2026-11-01T07:00:00Z", "2026-11-02T08:00:00.000Z"],
    ["2027-12-31T08:00:00Z", "2028-01-01T08:00:00.000Z"],
    ["2028-02-29T08:00:00Z", "2028-03-01T08:00:00.000Z"],
  ]) assert.equal(nextSeattleMidnight(now).toISOString(), next);
});

test("separate counters traverse every portrait before repeating and remain balanced", () => {
  const counts = { ordinary: Array(72).fill(0), special: Array(72).fill(0) };
  const seen = { ordinary: 0, special: 0 };
  for (let day = dayNumber("2026-01-01"); day < dayNumber("2029-01-01"); day++) {
    const slot = rotationSlot(dateKey(day));
    assert.equal(slot.ordinal, seen[slot.pool]++);
    assert.equal(slot.index, (seen[slot.pool] - 1) % 72);
    counts[slot.pool][slot.index]++;
    assert(Math.max(...counts[slot.pool]) - Math.min(...counts[slot.pool]) <= 1);
  }
  assert(seen.ordinary > 72 && seen.special > 72);
});

test("refreshing the page never advances today's selection; selection does not mutate input", () => {
  const manifest = fixture();
  const before = JSON.stringify(manifest);
  const a = selectPortrait(manifest, "2026-10-23T07:00:00Z");
  const b = selectPortrait(manifest, "2026-10-24T06:59:59Z");
  assert.deepEqual(a, b);
  assert.equal(a.pool, "ordinary");
  assert.equal(selectPortrait(manifest, "2026-10-24T07:00:00Z").pool, "special");
  assert.equal(JSON.stringify(manifest), before);
  assert(Object.isFrozen(a.portrait));
});

test("empty, missing, partial, unverified, repeated, unsafe and mismatched manifests disable rotation", async () => {
  const disabled = { enabled: false, ordinary: [], special: [] };
  const cases = [null, {}, disabled];
  let value = fixture(); value.ordinary.pop(); cases.push(value);
  value = fixture(); value.verification = null; cases.push(value);
  value = fixture(); value.ordinary[0].reviewed = false; cases.push(value);
  value = fixture(); value.special[0].src = value.ordinary[0].src; cases.push(value);
  value = fixture(); value.ordinary[0].src = "/assets/images/wardrobe/../bear-avatar.png"; cases.push(value);
  value = fixture(); value.special.reverse(); cases.push(value);
  value = fixture(); value.special[1].sha256 = value.special[0].sha256; cases.push(value);
  for (const manifest of cases) {
    assert.equal(validateManifest(manifest).valid, false);
    const selected = selectPortrait(manifest, "2026-10-21T20:00:00Z");
    assert.equal(selected.enabled, false);
    assert.equal(selected.portrait, null);
  }
});


const tick = () => new Promise((resolve) => setImmediate(resolve));
function fakeImage() {
  const attributes = new Map([["src", "/assets/images/bear-avatar.png"], ["alt", "Original bear portrait"],
    ["class", "avatar"], ["width", "1254"], ["height", "1254"]]);
  return { attributes, getAttribute: (key) => attributes.get(key) ?? null,
    setAttribute: (key, value) => attributes.set(key, value), removeAttribute: (key) => attributes.delete(key) };
}
function fakePage() {
  const handlers = new Map();
  return { visibilityState: "visible", addEventListener: (event, fn) => handlers.set(event, fn),
    removeEventListener: (event) => handlers.delete(event), fire: () => handlers.get("visibilitychange")?.() };
}

test("invalid manifest makes no requests, changes no attributes and arms no timer", async () => {
  const image = fakeImage();
  const before = [...image.attributes];
  let requests = 0, timers = 0;
  const controller = mountRotation(image, {}, { loadImage: () => { requests++; }, setTimer: () => { timers++; } });
  await controller.refresh();
  assert.equal(controller.enabled, false);
  assert.equal(requests, 0);
  assert.equal(timers, 0);
  assert.deepEqual([...image.attributes], before);
});

test("controller preloads then swaps, stays stable, recovers on visibility, and restores base on failure", async () => {
  const image = fakeImage();
  const before = [...image.attributes];
  const basePath = new URL("../src/assets/images/bear-avatar.png", import.meta.url);
  const baseHash = hash(await readFile(basePath));
  let now = new Date("2026-10-23T12:00:00Z");
  let fail = false, requests = 0, delay = 0;
  const page = fakePage();
  const controller = mountRotation(image, fixture(), {
    clock: () => now, page, setTimer: (_, ms) => { delay = ms; return 1; }, clearTimer() {},
    loadImage: async () => { requests++; if (fail) throw new Error("network"); },
  });
  assert.equal(image.getAttribute("src"), before[0][1]); // old image kept before load
  await tick();
  assert.match(image.getAttribute("src"), /ordinary/);
  assert.match(image.getAttribute("alt"), /ordinary/);
  assert.equal(delay, nextSeattleMidnight(now) - now + 20);
  await controller.refresh();
  assert.equal(requests, 1);
  now = new Date("2026-10-24T08:00:00Z");
  page.fire();
  await tick();
  assert.match(image.getAttribute("src"), /special/);
  fail = true;
  now = new Date("2026-10-25T08:00:00Z");
  await controller.refresh();
  assert.deepEqual([...image.attributes], before);
  controller.destroy();
  assert.equal(hash(await readFile(basePath)), baseHash);
});

test("yesterday's slow image cannot replace today's portrait", async () => {
  const image = fakeImage();
  const pending = [];
  let now = new Date("2026-10-24T06:59:59Z");
  const controller = mountRotation(image, fixture(), {
    clock: () => now, setTimer: () => 1, clearTimer() {}, page: fakePage(),
    loadImage: (src) => new Promise((resolve) => pending.push({ src, resolve })),
  });
  now = new Date("2026-10-24T07:00:01Z");
  pending[0].resolve();
  await tick();
  assert.equal(image.getAttribute("src"), "/assets/images/bear-avatar.png");
  assert.equal(pending.length, 2);
  pending[1].resolve();
  await tick();
  assert.match(image.getAttribute("src"), /special/);
  controller.destroy();
});



test("module-relative URLs preserve root and subdirectory hosting", () => {
  for (const prefix of ["/", "/bears-den-check/"]) {
    const base = "https://example.test" + prefix;
    const urls = wardrobeURLs(base + "assets/js/wardrobe/bootstrap.mjs");
    assert.equal(urls.manifest.href, base + "assets/images/wardrobe/manifest.json");
    assert.equal(urls.resolveSrc("/assets/images/wardrobe/123-normal.webp"),
      base + "assets/images/wardrobe/123-normal.webp");
  }
});

test("bootstrap fetch failures and invalid manifests preserve the original image", async () => {
  const image = fakeImage();
  const original = [...image.attributes];
  const page = { ...fakePage(), querySelector: () => image };
  for (const fetchManifest of [
    async () => { throw new Error("offline"); },
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError("bad JSON"); } }),
    async () => ({ ok: true, json: async () => ({}) }),
  ]) {
    const result = await startWardrobe({ page, fetchManifest, moduleURL: "https://example.test/assets/js/wardrobe/bootstrap.mjs" });
    assert.equal(result.enabled, false);
    assert.deepEqual([...image.attributes], original);
  }
});

test("bootstrap passes only the real manifest and its hosting root to mounting", async () => {
  const image = fakeImage();
  const page = { querySelector: () => image };
  const manifest = fixture();
  let mounts = 0;
  const result = await startWardrobe({
    page, moduleURL: "https://example.test/preview/assets/js/wardrobe/bootstrap.mjs",
    fetchManifest: async (url) => {
      assert.equal(url.href, "https://example.test/preview/assets/images/wardrobe/manifest.json");
      return { ok: true, json: async () => manifest };
    },
    mount: (element, data, options) => {
      mounts++;
      assert.equal(element, image);
      assert.equal(data, manifest);
      assert.equal(options.resolveSrc(data.ordinary[0].src),
        "https://example.test/preview" + data.ordinary[0].src);
      return { enabled: true };
    },
  });
  assert.equal(result.enabled, true);
  assert.equal(mounts, 1);
});

test("stalled preloads time out and release event handlers", async () => {
  let instance, expire, clears = 0;
  class TestImage { constructor() { instance = this; this.naturalWidth = 1254; } }
  const promise = preloadPortrait("/test.webp", {
    ImageClass: TestImage, timeoutMs: 50,
    setTimer: (fn, ms) => { assert.equal(ms, 50); expire = fn; return 1; },
    clearTimer: () => { clears++; },
  });
  const rejected = assert.rejects(promise, /timed out/);
  expire();
  await rejected;
  assert.equal(instance.onload, null);
  assert.equal(instance.onerror, null);
  assert.equal(clears, 1);
});

test("a timed-out midnight swap restores the base and visibility can retry the same day", async () => {
  const image = fakeImage();
  const original = [...image.attributes];
  const instances = [];
  let expire;
  class TestImage { constructor() { instances.push(this); this.naturalWidth = 1254; } }
  let now = new Date("2026-10-23T12:00:00Z");
  const page = fakePage();
  const controller = mountRotation(image, fixture(), {
    clock: () => now, page, setTimer: () => 1, clearTimer() {},
    loadImage: (src) => preloadPortrait(src, {
      ImageClass: TestImage, setTimer: (fn) => { expire = fn; return 1; }, clearTimer() {},
    }),
  });
  instances[0].onload();
  await tick();
  assert.match(image.getAttribute("src"), /ordinary/);
  now = new Date("2026-10-24T08:00:00Z");
  const nextDay = controller.refresh();
  expire();
  await nextDay;
  assert.deepEqual([...image.attributes], original);
  page.fire();
  instances[2].onload();
  await tick();
  assert.match(image.getAttribute("src"), /special/);
  controller.destroy();
});

function chunk(type, payload) {
  const header = Buffer.alloc(8);
  header.write(type, 0, "ascii");
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload, Buffer.alloc(payload.length & 1)]);
}
// Structural parser fixtures only: no portrait or release asset is fabricated.
function testWebP({ width = 1254, height = 1254, marker = "", lossy = false, extended = false } = {}) {
  const image = Buffer.alloc(lossy ? 10 : 5);
  if (lossy) {
    image.set([0x9d, 0x01, 0x2a], 3);
    image.writeUInt16LE(width, 6);
    image.writeUInt16LE(height, 8);
  } else {
    image[0] = 0x2f;
    image.writeUInt32LE(((width - 1) | ((height - 1) << 14)) >>> 0, 1);
  }
  const pieces = [];
  if (extended) {
    const canvas = Buffer.alloc(10);
    canvas.writeUIntLE(width - 1, 4, 3);
    canvas.writeUIntLE(height - 1, 7, 3);
    pieces.push(chunk("VP8X", canvas));
  }
  pieces.push(chunk(lossy ? "VP8 " : "VP8L", image), chunk("TEST", Buffer.from(marker)));
  const body = Buffer.concat(pieces);
  const header = Buffer.alloc(12);
  header.write("RIFF");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8);
  return Buffer.concat([header, body]);
}

test("WebP parser covers lossy, lossless and extended containers; rejects corrupt or animated data", () => {
  for (const options of [{}, { lossy: true }, { extended: true }, { lossy: true, extended: true }]) {
    assert.deepEqual(readWebPDimensions(testWebP(options)), { width: 1254, height: 1254, format: "webp" });
  }
  assert.throws(() => readWebPDimensions(Buffer.from("not an image")), /WebP/);
  assert.throws(() => readWebPDimensions(testWebP().subarray(0, 20)), /WebP/);
  const animated = testWebP({ extended: true }); animated[20] = 0x02;
  assert.throws(() => readWebPDimensions(animated), /animated/);
  const mismatched = testWebP({ extended: true }); mismatched[24] = 0;
  assert.throws(() => readWebPDimensions(mismatched), /disagree/);
  const chunkOverflow = testWebP(); chunkOverflow.writeUInt32LE(0xffffffff, 16);
  assert.throws(() => readWebPDimensions(chunkOverflow), /Truncated/);
});

test("publishing gate checks every record, exact bytes, format and dimensions", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "bears-wardrobe-test-"));
  const manifest = fixture();
  const manifestFile = path.join(temporary, "assets", "images", "wardrobe", "manifest.json");
  try {
    await assert.rejects(verifyWardrobe({ inputRoot: temporary }), /ENOENT/);
    for (const [pool, entries] of [["ordinary", manifest.ordinary], ["special", manifest.special]]) {
      for (const entry of entries) {
        const bytes = testWebP({ marker: pool + ":" + entry.id });
        entry.bytes = bytes.length;
        entry.sha256 = hash(bytes);
        const file = path.resolve(temporary, "." + entry.src);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, bytes);
      }
    }
    await writeFile(manifestFile, JSON.stringify(manifest));
    assert.deepEqual(await verifyWardrobe({ inputRoot: temporary }), { verified: true, count: 144 });
    const last = manifest.special.at(-1);
    const file = path.resolve(temporary, "." + last.src);
    await writeFile(file, "changed bytes");
    await assert.rejects(verifyWardrobe({ inputRoot: temporary }), /reviewed bytes changed/);
    const wrongSize = testWebP({ width: 1253, marker: "wrong-dimensions" });
    last.sha256 = hash(wrongSize); last.bytes = wrongSize.length;
    await writeFile(file, wrongSize);
    await writeFile(manifestFile, JSON.stringify(manifest));
    await assert.rejects(verifyWardrobe({ inputRoot: temporary }), /dimensions changed/);
    await rm(file);
    await assert.rejects(verifyWardrobe({ inputRoot: temporary }), /ENOENT/);
    manifest.verification = null;
    await writeFile(manifestFile, JSON.stringify(manifest));
    await assert.rejects(verifyWardrobe({ inputRoot: temporary }), /assets-not-verified/);
  } finally {
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir()));
    assert(path.basename(temporary).startsWith("bears-wardrobe-test-"));
    await rm(temporary, { recursive: true, force: true });
  }
});
