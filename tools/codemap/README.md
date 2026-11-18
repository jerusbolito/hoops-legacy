# Code map

A generated, browsable map of a TypeScript project, built to answer the questions you ask once the codebase has outgrown your head:

- **Where does this live?** Every file with what it owns, what it uses, who uses it, and whether a test covers it.
- **How does this flow?** Pick an entry point (a week passing, a trade, a sync) and open its call tree level by level.
- **What changed and why?** Recent commits, and the files that change most.
- **What are the rules, and are we keeping them?** Architecture rules checked against the real imports, plus the gotchas the code cannot check.

It is one self-contained HTML file: no server, no network, nothing to install beyond the `typescript` package your project already has. It reads the code with TypeScript's own parser, so the import graph and call graph are real, not guessed.

## Use it

```
npm run codemap            # builds codemap-out/index.html
npm run codemap -- --open  # and opens it
node tools/codemap/src/cli.mjs --strict   # exit 1 if a rule is broken or a flow entry has gone missing (for CI)
```

Press `/` on the page to search files and functions. Everything is linkable: copy the address bar to point someone at a file or a flow.

## What you see

| Tab | What it is for |
| --- | --- |
| **Map** | Files grouped by area, with a description, size, how many files use it, test coverage and how often it changed. Sort by name, size, most used or most changed. Click a file for its detail page. |
| **Flows** | Preset flows from the config plus search for any function. Shows who calls it and an expandable tree of what it calls. "Trace from here" re-roots the tree. |
| **Graph** | One area at a time as a layered diagram: foundations on the left, the files built on them on the right. Click a box to light up what it uses and what uses it. Dashed lines are type-only imports. |
| **Changes** | Most changed files and the recent commit list, each commit with the files it touched. Filter by message or file. |
| **Rules** | Automatic checks (import cycles, import direction, forbidden dependencies) and the hand-written gotchas. |
| **Docs** | Your markdown notes, rendered, with a table of contents. |

## Where the descriptions come from

In order of preference: a table row in your notes (`| \`career.ts\` | what it owns |`, which is how the Engine map in HANDOFF.md already reads), then a comment at the top of the file, then a comment on the first declaration. Files with none say so, and show their exports instead. Writing the missing ones is the cheapest way to make the map better.

## Configure it

`codemap.config.json` (in the project root, or `tools/codemap/codemap.config.json`):

| Key | What it does |
| --- | --- |
| `title` | Heading and page title. |
| `include` | Folders to scan. |
| `testPatterns` | Paths that are test support (helpers, fixtures) and should not count as the project's own code. Files named `*.test.*` are always tests. |
| `groups` | Folder -> `{ title, blurb }`. Areas show in this order. The longest matching folder wins. |
| `flows` | `{ title, entry: "path/file.ts#functionName", blurb }`. Methods are `File.method`. The CLI warns when an entry no longer exists. |
| `layerChain` | `{ dir, order, why }`: modules in `dir` may import only the ones earlier in `order`. |
| `forbid` | `{ from, to }` or `{ from, package }`, with a `reason`: nothing under `from` may import `to` or that package. |
| `gotchas` | `{ title, text, where }` shown on the Rules tab. `where` is a path or a list of paths. |
| `docs` | `{ title, file }` markdown files for the Docs tab and for ownership tables. |

## How it works

- `src/analyze.mjs` parses one file at a time: imports, re-exports, exports with their doc comments, and every function with the calls it makes (including `this.method()`, `namespace.fn()`, `new Class()` and JSX components). Pure, and tested without touching the disk.
- `link()` joins files into the import graph (following re-exports), the call graph, import cycles (Tarjan) and a layer per file.
- `src/scan.mjs` adds git history, tests, ownership notes and the rule checks.
- `src/render.mjs` writes the page, and `ui.js` / `ui.css` are the whole interface.

## Limits worth knowing

- The call graph is **by name**. It follows imports, re-exports, `this` and namespaces. It does not follow calls through variables, callbacks passed to other functions, or dynamic dispatch, so a flow can be missing a step that happens through one of those. Treat it as a guide to where to look, then read the code.
- Class methods are recorded, but a call like `thing.method()` on an instance is not linked to the class.
- It reads TypeScript and TSX. Plain JavaScript files are not scanned.
- Tests: `npx vitest run tools`.
