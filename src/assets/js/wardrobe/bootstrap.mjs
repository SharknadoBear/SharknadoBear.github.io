import { mountRotation } from "./rotation-controller.mjs";

// The module URL carries Eleventy's hosting prefix; manifest entries stay rooted
// at /assets/ in source, just like the rest of the site.
export function wardrobeURLs(moduleURL = import.meta.url) {
  const siteRoot = new URL("../../../", moduleURL);
  return {
    manifest: new URL("assets/images/wardrobe/manifest.json", siteRoot),
    resolveSrc: (src) => new URL(src.slice(1), siteRoot).href,
  };
}

export async function startWardrobe({
  page = globalThis.document,
  fetchManifest = globalThis.fetch,
  moduleURL = import.meta.url,
  mount = mountRotation,
} = {}) {
  const image = page?.querySelector("[data-wardrobe-avatar]");
  if (!image) return { enabled: false, reason: "no-avatar" };
  try {
    const urls = wardrobeURLs(moduleURL);
    const response = await fetchManifest(urls.manifest, {
      credentials: "omit",
      cache: "no-cache",
      signal: globalThis.AbortSignal?.timeout?.(10000),
    });
    if (!response.ok) return { enabled: false, reason: "manifest-unavailable" };
    const manifest = await response.json();
    return mount(image, manifest, { page, resolveSrc: urls.resolveSrc });
  } catch {
    // Keep the existing HTML portrait for unavailable or invalid data.
    return { enabled: false, reason: "manifest-unavailable" };
  }
}

if (typeof document !== "undefined") void startWardrobe();
