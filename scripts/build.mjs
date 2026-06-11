import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const banner = `// ==UserScript==
// @name         Typing Everywhere
// @namespace    https://github.com/local/typing-everywhere
// @version      0.1.0
// @description  在普通网页文本上进行非侵入式连续打字练习
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==`;

const tempFile = 'dist/typing-everywhere.user.js.tmp';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/typing-everywhere.user.js'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome100', 'firefox100'],
  outfile: tempFile,
});

const bundled = await readFile(tempFile, 'utf8');
await writeFile('dist/typing-everywhere.user.js', `${banner}\n\n${bundled}`);
await rm(tempFile, { force: true });
