import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Makes JSON safe to sit inside a script block: no early </script>, and no raw line separators. */
export function safeJson(data) {
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  return JSON.stringify(data).replace(/</g, '\\u003c').split(LS).join('\\u2028').split(PS).join('\\u2029');
}

/** One self-contained page: styles, script and data inline, so it opens from disk with no server. */
export function renderPage(data) {
  const css = fs.readFileSync(path.join(here, 'ui.css'), 'utf8');
  const js = fs.readFileSync(path.join(here, 'ui.js'), 'utf8');
  const json = safeJson(data);
  const title = String(data.title).replace(/[&<>"]/g, '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · code map</title>
<style>${css}</style>
</head>
<body>
<header><div class="bar">
  <div class="brand">${title}<small id="gen"></small></div>
  <nav role="tablist" aria-label="Views"></nav>
  <div class="search"><input id="q" type="search" placeholder="Search files and functions  ( / )" autocomplete="off" aria-label="Search files and functions"><div id="results" class="results" role="listbox"></div></div>
  <button id="theme" class="icon" aria-label="Switch light and dark">◐</button>
</div></header>
<main id="main"></main>
<script id="data" type="application/json">${json}</script>
<script>${js}</script>
</body>
</html>
`;
}
