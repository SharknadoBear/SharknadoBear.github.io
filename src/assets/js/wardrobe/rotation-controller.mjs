// Importing this module has no DOM or network side effects.
import { selectPortrait, validateManifest, nextSeattleMidnight, seattleDateKey } from "./schedule.mjs";

export function preloadPortrait(src, {
  ImageClass = globalThis.Image,
  timeoutMs = 15000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  return new Promise((resolve, reject) => {
    const image = new ImageClass();
    let timer;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve(image);
    };
    image.onload = () => finish(image.naturalWidth > 0 ? null : new Error("Empty image."));
    image.onerror = () => finish(new Error("Portrait failed to load."));
    timer = setTimer(() => finish(new Error("Portrait load timed out.")), timeoutMs);
    image.src = src;
  });
}

export function mountRotation(image, manifest, {
  clock = () => new Date(),
  loadImage = preloadPortrait,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  page = globalThis.document,
  resolveSrc = (src) => src,
} = {}) {
  // Invalid or incomplete data must cause zero requests and zero DOM changes.
  if (!image || !validateManifest(manifest).valid) return { enabled: false, refresh: async () => {}, destroy() {} };
  const fixedManifest = structuredClone(manifest);
  const original = Object.fromEntries(["src", "alt", "srcset", "sizes"].map((name) => [name, image.getAttribute(name)]));
  let stopped = false;
  let timer;
  let generation = 0;
  let appliedDay = null;
  const restore = () => {
    for (const [name, value] of Object.entries(original)) {
      if (value === null) image.removeAttribute(name);
      else image.setAttribute(name, value);
    }
  };
  const arm = () => {
    clearTimer(timer);
    const now = clock();
    timer = setTimer(() => { void refresh(); }, Math.max(1, nextSeattleMidnight(now).getTime() - new Date(now).getTime() + 20));
  };
  async function refresh() {
    if (stopped) return;
    arm();
    const selected = selectPortrait(fixedManifest, clock());
    if (!selected.enabled) { generation += 1; appliedDay = null; restore(); return; }
    if (selected.dateKey === appliedDay) return;
    const request = ++generation;
    try {
      const resolvedSrc = resolveSrc(selected.portrait.src);
      await loadImage(resolvedSrc);
      if (stopped || request !== generation) return;
      // A load started yesterday must never overwrite today's portrait.
      if (seattleDateKey(clock()) !== selected.dateKey) { void refresh(); return; }
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      image.setAttribute("src", resolvedSrc);
      image.setAttribute("alt", selected.portrait.alt);
      appliedDay = selected.dateKey;
    } catch {
      if (!stopped && request === generation) { appliedDay = null; restore(); }
    }
  }
  const onVisible = () => { if (page?.visibilityState === "visible") void refresh(); };
  page?.addEventListener("visibilitychange", onVisible);
  void refresh();
  return {
    enabled: true,
    refresh,
    destroy() {
      stopped = true;
      generation += 1;
      clearTimer(timer);
      page?.removeEventListener("visibilitychange", onVisible);
      restore();
    },
  };
}
