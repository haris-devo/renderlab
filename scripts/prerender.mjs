// Prerender the app into dist/index.html so the first paint needs no JavaScript.
// Run after `vite build` and `vite build --ssr`; see the build script in package.json.
import { readFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { render } = await import(pathToFileURL(resolve(root, 'dist-ssr/entry-server.js')).href);

const htmlPath = resolve(root, 'dist/index.html');
const template = await readFile(htmlPath, 'utf8');
const marker = '<div id="root"></div>';
if (!template.includes(marker)) throw new Error('Could not find the root element in dist/index.html');

const html = template.replace(marker, `<div id="root">${render()}</div>`);
await writeFile(htmlPath, html);
await rm(resolve(root, 'dist-ssr'), { recursive: true, force: true });

console.log(`Prerendered dist/index.html (${(html.length / 1024).toFixed(0)} KB of HTML)`);
