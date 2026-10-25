import { HtmlBasePlugin } from "@11ty/eleventy";
import { statSync } from "node:fs";
import { lstat, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { verifyWardrobe } from "./scripts/verify-wardrobe.mjs";
import { verifyPlushieGallery } from "./scripts/verify-plushie-gallery.mjs";

function hostingPrefix(value = "/") {
  const prefix = value.trim();
  if (/[?#:\\]/.test(prefix) || prefix.split("/").includes("..")) {
    throw new Error("SITE_PATH_PREFIX must be a URL path, for example /bears-den/.");
  }
  const segments = prefix.split("/").filter(Boolean);
  return segments.length ? `/${segments.join("/")}/` : "/";
}

function asDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid content date: ${String(value)}`);
  }
  return date;
}

const dateFormatter = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

function newestFirst(entries) {
  return entries.sort((left, right) => {
    const difference = asDate(right.date).getTime() - asDate(left.date).getTime();
    return difference || left.inputPath.localeCompare(right.inputPath);
  });
}

function isInSection(entry, section, kinds) {
  const inputPath = entry.inputPath.replaceAll("\\", "/");
  return !entry.data.draft &&
    (inputPath.includes(`/content/${section}/`) || kinds.includes(entry.data.kind));
}

function requireLocalAsset(value, field, input) {
  if (!value) return;
  if (typeof value !== "string" || !value.startsWith("/assets/")) {
    throw new Error(`${field} must reference a local file under /assets/.`);
  }
  const assetRoot = path.resolve(input, "assets");
  const asset = path.resolve(assetRoot, decodeURIComponent(value.slice("/assets/".length)));
  if (!asset.startsWith(assetRoot + path.sep)) {
    throw new Error(`${field} must stay inside /assets/.`);
  }
  try {
    if (statSync(asset).isFile()) return;
  } catch { /* Report an actionable authoring error below. */ }
  throw new Error(`${field} points to a missing asset: ${value}`);
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function removeObsoletePages({ directories, results, outputMode }) {
  if (outputMode !== "fs") return;
  const output = path.resolve(directories.output);
  const input = path.resolve(directories.input);
  const workingDirectory = path.resolve(".");
  // A configured output may be elsewhere (isolated checks use the OS temp
  // directory), but it must never contain the source tree or working directory.
  if (output === workingDirectory || output === input ||
      isWithin(output, workingDirectory) || isWithin(output, input) || isWithin(input, output)) {
    throw new Error("The generated output must be separate from the source and project roots.");
  }
  const rootInfo = await lstat(output);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("Refusing to prune a generated output directory that is a symbolic link.");
  }
  const currentPages = new Set(results.filter((result) => result.outputPath).map((result) => path.resolve(result.outputPath)));
  for (const file of currentPages) {
    if (!isWithin(output, file)) throw new Error("A generated page escaped the configured output directory.");
  }
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || (directory === output && entry.name === "assets")) continue;
      const file = path.resolve(directory, entry.name);
      if (!isWithin(output, file)) throw new Error("Refusing to prune a path outside generated output.");
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && file.endsWith(".html") && !currentPages.has(file)) await unlink(file);
    }
  }
  await visit(output);
}

export default function (eleventyConfig) {
  // SITE_INPUT is used by the isolated build checks; normal authoring uses src/.
  const input = (process.env.SITE_INPUT || "src").replaceAll("\\", "/");

  eleventyConfig.addPlugin(HtmlBasePlugin);
  eleventyConfig.addPassthroughCopy({ [path.join(input, "assets")]: "assets" });
  eleventyConfig.addPassthroughCopy({ [path.join(input, ".nojekyll")]: ".nojekyll" });
  // License/readme Markdown in assets is copied verbatim, never rendered as pages.
  eleventyConfig.ignores.add(`${input.replaceAll("\\", "/")}/assets/**`);

  eleventyConfig.on("eleventy.before", async ({ incremental }) => {
    if (incremental) {
      throw new Error("Incremental builds are unsupported: use a full build so newly drafted pages leave the preview.");
    }
    // Verify the exact input tree, including isolated checks and live rebuilds.
    await verifyWardrobe({ inputRoot: input });
    await verifyPlushieGallery({ inputRoot: input });
  });
  // Eleventy otherwise leaves pages on disk when their source is removed or
  // made a draft. The complete successful result list also cleans preview.
  eleventyConfig.on("eleventy.after", removeObsoletePages);

  // Drafts never render, including during preview. This keeps direct URLs private
  // as well as removing drafts from public listings.
  eleventyConfig.addPreprocessor("exclude-drafts", "md,njk,html", (data) => {
    if (data.draft !== undefined && typeof data.draft !== "boolean") {
      throw new Error("Content draft metadata must be the boolean true or false.");
    }
    if (data.draft === true) return false;
    for (const field of ["image", "idCard", "petPackage"]) {
      requireLocalAsset(data[field], field, input);
    }
    if (data.image && !data.imageAlt?.trim()) {
      throw new Error("Content with an image needs a descriptive imageAlt field.");
    }
  });

  eleventyConfig.addCollection("journal", (collection) => newestFirst(
    collection.getAll().filter((entry) => isInSection(entry, "journal", ["post", "meme"])),
  ));
  eleventyConfig.addCollection("maps", (collection) => newestFirst(
    collection.getAll().filter((entry) => isInSection(entry, "maps", ["map"])),
  ));
  eleventyConfig.addCollection("plushies", (collection) => newestFirst(
    collection.getAll().filter((entry) => isInSection(entry, "plushies", ["plushy"])),
  ));

  eleventyConfig.addFilter("readableDate", (value) => {
    const date = asDate(value);
    return date ? dateFormatter.format(date) : "";
  });
  eleventyConfig.addFilter("dateISO", (value) => asDate(value)?.toISOString().slice(0, 10) || "");
  eleventyConfig.addFilter("projectEntries", (entries, project) =>
    (entries || []).filter((entry) => entry.data.project === project),
  );

  return {
    dir: {
      input,
      includes: "_includes",
      data: "_data",
      output: process.env.SITE_OUTPUT || "dist",
    },
    templateFormats: ["njk", "md", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    pathPrefix: hostingPrefix(process.env.SITE_PATH_PREFIX),
  };
}
