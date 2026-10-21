import Eleventy from "@11ty/eleventy";

const port = Number(process.env.SITE_PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("SITE_PORT must be an integer between 1 and 65535.");
}

const site = new Eleventy(undefined, undefined, { runMode: "serve" });
await site.init();
const rebuild = await site.watch();
// Eleventy 3.1.7 updates its file index on unlink but does not rebuild. Reuse
// the same queued rebuild function used for its change/add events.
site.watcher.on("unlink", (file) => {
  // Chokidar can supply Windows separators; the cached glob matcher uses '/'.
  site.fileSystemSearch.delete(file.replaceAll("\\", "/"));
  rebuild(file).catch((error) => console.error("Preview rebuild failed:", error));
});
await site.serve(port);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await site.stopWatch();
    process.exit(0);
  });
}
