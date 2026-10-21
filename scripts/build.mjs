import fs from 'node:fs/promises';
import path from 'node:path';
import Eleventy from '@11ty/eleventy';

// The only directory this command may remove is this checkout's generated dist.
const root = process.cwd();
const output = path.resolve(root, 'dist');
if (path.dirname(output) !== root || path.basename(output) !== 'dist') {
  throw new Error('Refusing to clean a directory outside this checkout.');
}
if (process.env.SITE_OUTPUT || process.env.SITE_INPUT) {
  throw new Error('build uses src/ and dist/; custom test outputs belong to scripts/check.mjs.');
}
await fs.rm(output, { recursive: true, force: true });
const site = new Eleventy();
await site.write();
