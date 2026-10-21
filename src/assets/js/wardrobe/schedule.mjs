// Deterministic Seattle calendar selection. No network, DOM, or persistent state.
export const TIME_ZONE = "America/Los_Angeles";
export const POOL_SIZE = 72;
export const EPOCH = "2026-01-01";
export const HOLIDAY_SOURCE = "https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/";
const DAY = 86400000;
const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
const holidayCache = new Map();
const prefixCounts = [[0, 0]];

export function dayNumber(key) {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new RangeError("Expected YYYY-MM-DD.");
  const [year, month, day] = key.split("-").map(Number);
  const stamp = Date.UTC(year, month - 1, day);
  if (year < 2021 || year > 2100 || new Date(stamp).toISOString().slice(0, 10) !== key) {
    throw new RangeError("Expected a valid calendar date in 2021-2100.");
  }
  return stamp / DAY;
}
const keyOf = (number) => new Date(number * DAY).toISOString().slice(0, 10);
const rawDay = (year, month, day) => Date.UTC(year, month - 1, day) / DAY;
const weekday = (number) => new Date(number * DAY).getUTCDay();

export function seattleDateKey(instant = new Date()) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid instant.");
  const values = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

function nthWeekday(year, month, dayOfWeek, nth) {
  const first = rawDay(year, month, 1);
  return first + (dayOfWeek - weekday(first) + 7) % 7 + 7 * (nth - 1);
}
function lastMonday(year, month) {
  const last = rawDay(year, month + 1, 1) - 1;
  return last - (weekday(last) - 1 + 7) % 7;
}
function annualHolidays(year) {
  return [
    ["New Year's Day", rawDay(year, 1, 1)],
    ["Birthday of Martin Luther King, Jr.", nthWeekday(year, 1, 1, 3)],
    ["Washington's Birthday", nthWeekday(year, 2, 1, 3)],
    ["Memorial Day", lastMonday(year, 5)],
    ["Juneteenth National Independence Day", rawDay(year, 6, 19)],
    ["Independence Day", rawDay(year, 7, 4)],
    ["Labor Day", nthWeekday(year, 9, 1, 1)],
    ["Columbus Day", nthWeekday(year, 10, 1, 2)],
    ["Veterans Day", rawDay(year, 11, 11)],
    ["Thanksgiving Day", nthWeekday(year, 11, 4, 4)],
    ["Christmas Day", rawDay(year, 12, 25)],
  ];
}
function holidaysForYear(year) {
  if (!holidayCache.has(year)) {
    const map = new Map();
    // Adjacent years include Dec 31 observed New Year's Day.
    for (const holidayYear of [year - 1, year, year + 1]) {
      for (const [name, actual] of annualHolidays(holidayYear)) {
        const dow = weekday(actual);
        const observed = actual + (dow === 6 ? -1 : dow === 0 ? 1 : 0);
        for (const [day, label] of [[actual, name], [observed, name + " (observed)"]]) {
          if (day === actual && label.endsWith("(observed)")) continue;
          const key = keyOf(day);
          if (Number(key.slice(0, 4)) !== year) continue;
          map.set(key, [...(map.get(key) || []), label]);
        }
      }
    }
    holidayCache.set(year, map);
  }
  return holidayCache.get(year);
}

export function classifyDate(key) {
  const number = dayNumber(key);
  const reasons = [...(holidaysForYear(Number(key.slice(0, 4))).get(key) || [])];
  if (key.slice(5) === "01-16") reasons.push("Bear's birthday");
  if ([0, 6].includes(weekday(number))) reasons.push("Weekend");
  return Object.freeze({ dateKey: key, pool: reasons.length ? "special" : "ordinary", reasons: Object.freeze(reasons) });
}

export function rotationSlot(key) {
  const offset = dayNumber(key) - dayNumber(EPOCH);
  if (offset < 0) throw new RangeError("Rotation begins at " + EPOCH + ".");
  const start = dayNumber(EPOCH);
  while (prefixCounts.length <= offset) {
    const i = prefixCounts.length - 1;
    const counts = [...prefixCounts[i]];
    counts[classifyDate(keyOf(start + i)).pool === "ordinary" ? 0 : 1] += 1;
    prefixCounts.push(counts);
  }
  const result = classifyDate(key);
  const ordinal = prefixCounts[offset][result.pool === "ordinary" ? 0 : 1];
  return Object.freeze({ ...result, ordinal, index: ordinal % POOL_SIZE });
}

export function nextSeattleMidnight(instant = new Date()) {
  const now = new Date(instant).getTime();
  if (!Number.isFinite(now)) throw new RangeError("Invalid instant.");
  const today = seattleDateKey(now);
  // Search for the first instant in the next Seattle day. A local day may be
  // 23 or 25 hours, so adding 24h to local midnight is deliberately avoided.
  let low = now;
  let high = now + 36 * 3600000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (seattleDateKey(middle) === today) low = middle;
    else high = middle;
  }
  return new Date(high);
}

function validPortrait(item) {
  return item && typeof item.id === "string" && /^[a-z0-9][a-z0-9-]*$/.test(item.id) &&
    typeof item.src === "string" &&
    /^\/assets\/images\/wardrobe\/[a-z0-9][a-z0-9._/-]*\.(png|jpg|jpeg|webp|avif)$/.test(item.src) &&
    !item.src.includes("//") && !item.src.split("/").includes("..") &&
    typeof item.alt === "string" && item.alt.trim().length > 10 &&
    item.reviewed === true && /^[a-f0-9]{64}$/.test(item.sha256 || "") &&
    Number.isSafeInteger(item.bytes) && item.bytes > 0 &&
    Number.isSafeInteger(item.width) && item.width === 1254 &&
    Number.isSafeInteger(item.height) && item.height === 1254;
}

export function validateManifest(manifest, { requireVerification = true } = {}) {
  const fail = (reason) => ({ valid: false, reason });
  if (!manifest || manifest.enabled !== true) return fail("rotation-disabled");
  if (manifest.schemaVersion !== 1 || manifest.timeZone !== TIME_ZONE ||
      manifest.epoch !== EPOCH || manifest.poolSize !== POOL_SIZE) return fail("unsupported-manifest");
  const all = [];
  for (const pool of ["ordinary", "special"]) {
    const entries = manifest[pool];
    if (!Array.isArray(entries) || entries.length !== POOL_SIZE) return fail("incomplete-pools");
    if (!entries.every(validPortrait)) return fail("unreviewed-or-invalid-asset");
    if (new Set(entries.map((entry) => entry.id)).size !== POOL_SIZE) return fail("duplicate-shirt-id");
    all.push(...entries);
  }
  // Both pools use the same canonical shirt order. Preserve it across releases.
  if (manifest.ordinary.some((entry, index) => entry.id !== manifest.special[index].id)) {
    return fail("mismatched-shirt-order");
  }
  if (new Set(all.map((entry) => entry.src)).size !== POOL_SIZE * 2 ||
      new Set(all.map((entry) => entry.sha256)).size !== POOL_SIZE * 2) return fail("duplicate-portrait");
  if (requireVerification && (manifest.verification?.status !== "complete" ||
      manifest.verification?.assetCount !== POOL_SIZE * 2 ||
      manifest.verification?.algorithm !== "sha256")) return fail("assets-not-verified");
  return { valid: true, reason: null };
}

export function selectPortrait(manifest, instant = new Date()) {
  const validation = validateManifest(manifest);
  if (!validation.valid) return Object.freeze({ enabled: false, reason: validation.reason, portrait: null });
  try {
    const slot = rotationSlot(seattleDateKey(instant));
    return Object.freeze({ enabled: true, ...slot, portrait: Object.freeze({ ...manifest[slot.pool][slot.index] }) });
  } catch {
    return Object.freeze({ enabled: false, reason: "date-outside-schedule", portrait: null });
  }
}
