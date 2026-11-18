/**
 * Reads TypeScript source and works out how it fits together. Pure functions: nothing here touches the disk or git,
 * so all of it can be tested with a few strings. `ts` is the host project's own TypeScript, passed in.
 */
import path from 'node:path';

const banner = (l) => /[─━═]{3,}|[-=*_#~]{5,}/.test(l);

const clean = (raw) =>
  raw
    .split('\n')
    .map((l) => l.replace(/^\s*\*+\s?/, '').trim())
    .filter((l) => l && !l.startsWith('@'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

/** First sentence-ish chunk, so a card never shows a paragraph. */
export const brief = (s, n = 200) => {
  if (!s) return '';
  const m = s.match(/^(.{20,}?[.!?])(\s|$)/);
  const one = m ? m[1] : s;
  return one.length > n ? one.slice(0, n - 1).trimEnd() + '…' : one;
};

/**
 * A file's own description: a block comment at the top level that stands apart from the declaration after it (a blank
 * line between them), or else comment lines at the very top of the file. Never a comment from inside a declaration.
 */
function fileDoc(ts, sf, text) {
  let firstCode = true;
  for (const st of sf.statements) {
    const isImport = ts.isImportDeclaration(st);
    const ranges = ts.getLeadingCommentRanges(text, st.getFullStart()) ?? [];
    for (const r of ranges) {
      const body = text.slice(r.pos, r.end);
      if (!body.startsWith('/*') || banner(body)) continue;
      const after = text.slice(r.end, st.getStart(sf));
      // detached from what follows, or sitting on the first real declaration of the file
      if (/\n\s*\n/.test(after) || (!isImport && firstCode) || (isImport && body.startsWith('/**'))) {
        const d = clean(body.replace(/^\/\*+|\*+\/$/g, ''));
        if (d) return d;
      }
    }
    if (!isImport) firstCode = false;
  }
  const top = text.match(/^(?:\s*\/\/[^\n]*\n)+/);
  if (top) {
    const lines = top[0].split('\n').map((l) => l.trim()).filter((l) => l.startsWith('//') && !banner(l)).map((l) => l.replace(/^\/\/+\s?/, ''));
    if (lines.length) return lines.join(' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

/** What one file contains, from its text alone. */
export function analyzeSource(ts, rel, text) {
  const kind = rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  const imports = [];
  const reexports = [];
  const exports = [];
  const funcs = [];

  const leadingDoc = (node) => {
    const lead = text.slice(node.getFullStart(), node.getStart(sf));
    // only a comment sitting right on the declaration describes it (a blank line after it means it describes the
    // file), and decorative section banners are not descriptions
    const blocks = [...lead.matchAll(/\/\*\*([\s\S]*?)\*\//g)].filter((m) => !banner(m[0]) && !/\n\s*\n/.test(lead.slice(m.index + m[0].length)));
    if (blocks.length) return clean(blocks[blocks.length - 1][1]);
    const lines = lead.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('//'));
    return lines.length ? lines.map((l) => l.replace(/^\/\/+\s?/, '')).join(' ').trim() : '';
  };
  const isExported = (node) => !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const isDefault = (node) => !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

  /** Every call made anywhere inside a node (including inside callbacks). */
  const collectCalls = (node) => {
    const calls = [];
    const seen = new Set();
    const add = (c) => {
      const k = `${c.k}:${c.ns ?? ''}:${c.name}`;
      if (!seen.has(k)) {
        seen.add(k);
        calls.push(c);
      }
    };
    const visit = (n) => {
      if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
        const e = n.expression;
        if (ts.isIdentifier(e)) add({ k: 'id', name: e.text });
        else if (ts.isPropertyAccessExpression(e)) {
          if (e.expression.kind === ts.SyntaxKind.ThisKeyword) add({ k: 'this', name: e.name.text });
          else if (ts.isIdentifier(e.expression)) add({ k: 'ns', ns: e.expression.text, name: e.name.text });
        }
      } else if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && ts.isIdentifier(n.tagName) && /^[A-Z]/.test(n.tagName.text)) {
        add({ k: 'id', name: n.tagName.text });
      }
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(node, visit);
    return calls;
  };

  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const addFunc = (name, node, bodyNode, extra = {}) => funcs.push({ name, line: lineOf(node), doc: brief(leadingDoc(node)), exported: !!extra.exported, calls: collectCalls(bodyNode), cls: extra.cls });
  const fnInit = (d) => d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer));

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const names = [];
      let typeOnly = false;
      const c = st.importClause;
      if (c) {
        typeOnly = c.isTypeOnly;
        if (c.name) names.push({ local: c.name.text, imported: 'default' });
        if (c.namedBindings) {
          if (ts.isNamespaceImport(c.namedBindings)) names.push({ local: c.namedBindings.name.text, imported: '*' });
          else for (const el of c.namedBindings.elements) names.push({ local: el.name.text, imported: (el.propertyName ?? el.name).text, type: el.isTypeOnly });
        }
        if (!typeOnly && names.length && names.every((n) => n.type)) typeOnly = true;
      }
      imports.push({ spec: st.moduleSpecifier.text, names, typeOnly });
      continue;
    }
    if (ts.isExportDeclaration(st)) {
      if (st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
        const spec = st.moduleSpecifier.text;
        if (!st.exportClause) reexports.push({ spec, star: true });
        else if (ts.isNamedExports(st.exportClause)) {
          for (const el of st.exportClause.elements) reexports.push({ spec, name: el.name.text, imported: (el.propertyName ?? el.name).text });
          imports.push({ spec, names: [], typeOnly: !!st.isTypeOnly, reexport: true });
        }
      } else if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) exports.push({ name: el.name.text, kind: 'name', doc: '', line: lineOf(st) });
      }
      continue;
    }
    if (ts.isFunctionDeclaration(st) && st.name) {
      if (isExported(st)) exports.push({ name: isDefault(st) ? 'default' : st.name.text, kind: 'function', doc: brief(leadingDoc(st)), line: lineOf(st) });
      if (st.body) addFunc(st.name.text, st, st.body, { exported: isExported(st) });
    } else if (ts.isVariableStatement(st)) {
      const doc = brief(leadingDoc(st));
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const isFn = fnInit(d);
        if (isExported(st)) exports.push({ name: d.name.text, kind: isFn ? 'function' : 'const', doc, line: lineOf(st) });
        if (isFn) addFunc(d.name.text, st, d.initializer, { exported: isExported(st) });
      }
    } else if (ts.isClassDeclaration(st) && st.name) {
      if (isExported(st)) exports.push({ name: st.name.text, kind: 'class', doc: brief(leadingDoc(st)), line: lineOf(st) });
      const ctor = st.members.find((m) => ts.isConstructorDeclaration(m));
      funcs.push({ name: st.name.text, line: lineOf(st), doc: brief(leadingDoc(st)), exported: isExported(st), calls: ctor ? collectCalls(ctor) : [], cls: st.name.text, isClass: true });
      for (const m of st.members) {
        if ((ts.isMethodDeclaration(m) || ts.isGetAccessor(m)) && m.name && ts.isIdentifier(m.name) && m.body) {
          funcs.push({ name: `${st.name.text}.${m.name.text}`, line: lineOf(m), doc: brief(leadingDoc(m)), exported: isExported(st), calls: collectCalls(m.body), cls: st.name.text });
        }
      }
    } else if (ts.isInterfaceDeclaration(st) && isExported(st)) exports.push({ name: st.name.text, kind: 'interface', doc: brief(leadingDoc(st)), line: lineOf(st) });
    else if (ts.isTypeAliasDeclaration(st) && isExported(st)) exports.push({ name: st.name.text, kind: 'type', doc: brief(leadingDoc(st)), line: lineOf(st) });
    else if (ts.isEnumDeclaration(st) && isExported(st)) exports.push({ name: st.name.text, kind: 'enum', doc: brief(leadingDoc(st)), line: lineOf(st) });
  }

  return { rel, lines: text.split('\n').length, doc: fileDoc(ts, sf, text), imports, reexports, exports, funcs };
}

const EXT = ['', '.ts', '.tsx', '.mts', '/index.ts', '/index.tsx'];

/** Where a relative import points, among the files we know about. Null for packages and anything outside. */
export function resolveSpec(fromRel, spec, fileSet) {
  if (!spec.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec.replace(/\.(m?js)$/, '')));
  for (const e of EXT) if (fileSet.has(base + e)) return base + e;
  return null;
}

/** Joins the per-file results into the whole picture: edges, call graph, layers, cycles. */
export function link(analyses) {
  const files = new Map(analyses.map((a) => [a.rel, a]));
  const set = new Set(files.keys());

  // exported name -> where it is really defined, following re-exports
  const defs = new Map();
  for (const a of analyses) defs.set(a.rel, new Set([...a.exports.map((e) => e.name), ...a.funcs.map((f) => f.name)]));
  const exportTable = (rel, depth = 0) => {
    const out = new Map();
    const a = files.get(rel);
    if (!a || depth > 4) return out;
    for (const e of a.exports) out.set(e.name, { file: rel, name: e.name });
    for (const f of a.funcs) if (f.exported && !f.name.includes('.')) out.set(f.name, { file: rel, name: f.name });
    for (const r of a.reexports) {
      const target = resolveSpec(rel, r.spec, set);
      if (!target) continue;
      if (r.star) for (const [k, v] of exportTable(target, depth + 1)) out.set(k, v);
      else {
        const hit = exportTable(target, depth + 1).get(r.imported);
        out.set(r.name, hit ?? { file: target, name: r.imported });
      }
    }
    return out;
  };
  const tables = new Map(analyses.map((a) => [a.rel, exportTable(a.rel)]));

  const edges = []; // {from, to, type}
  const external = new Map(); // rel -> Set(package)
  const edgeKey = new Set();
  const locals = new Map(); // rel -> Map(local -> {file,name}|{ns:file})
  for (const a of analyses) {
    const lm = new Map();
    for (const imp of a.imports) {
      const target = resolveSpec(a.rel, imp.spec, set);
      if (!target) {
        if (!imp.spec.startsWith('.')) (external.get(a.rel) ?? external.set(a.rel, new Set()).get(a.rel)).add(imp.spec.startsWith('@') ? imp.spec.split('/').slice(0, 2).join('/') : imp.spec.split('/')[0]);
        continue;
      }
      const k = `${a.rel}>${target}>${imp.typeOnly}`;
      if (!edgeKey.has(k) && a.rel !== target) {
        edgeKey.add(k);
        edges.push({ from: a.rel, to: target, type: !!imp.typeOnly });
      }
      for (const n of imp.names) {
        if (n.imported === '*') lm.set(n.local, { ns: target });
        else lm.set(n.local, tables.get(target)?.get(n.imported) ?? { file: target, name: n.imported });
      }
    }
    locals.set(a.rel, lm);
  }
  // a file that imports a type and a value from the same place has both edges; keep only the stronger one
  const runtimePairs = new Set(edges.filter((e) => !e.type).map((e) => `${e.from}>${e.to}`));
  const cleanEdges = edges.filter((e) => !e.type || !runtimePairs.has(`${e.from}>${e.to}`));

  const callEdges = []; // {from:'file#fn', to:'file#fn'}
  const fnIds = new Set();
  for (const a of analyses) for (const f of a.funcs) fnIds.add(`${a.rel}#${f.name}`);
  for (const a of analyses) {
    const lm = locals.get(a.rel);
    const mine = new Set(a.funcs.map((f) => f.name));
    for (const f of a.funcs) {
      const from = `${a.rel}#${f.name}`;
      const seen = new Set();
      const push = (to) => {
        if (to !== from && fnIds.has(to) && !seen.has(to)) {
          seen.add(to);
          callEdges.push({ from, to });
        }
      };
      for (const c of f.calls) {
        if (c.k === 'this') {
          if (f.cls) push(`${a.rel}#${f.cls}.${c.name}`);
        } else if (c.k === 'id') {
          if (mine.has(c.name)) push(`${a.rel}#${c.name}`);
          else {
            const t = lm.get(c.name);
            if (t?.file) push(`${t.file}#${t.name}`);
          }
        } else if (c.k === 'ns') {
          const t = lm.get(c.ns);
          if (t?.ns) {
            const hit = tables.get(t.ns)?.get(c.name);
            if (hit) push(`${hit.file}#${hit.name}`);
          }
        }
      }
    }
  }

  // cycles among runtime imports (Tarjan), and a layer for every file: how deep its dependencies go
  const adj = new Map([...set].map((r) => [r, []]));
  for (const e of cleanEdges) if (!e.type) adj.get(e.from).push(e.to);
  let idx = 0;
  const stack = [];
  const on = new Set();
  const index = new Map();
  const low = new Map();
  const comp = new Map();
  const sccs = [];
  const strong = (v) => {
    index.set(v, idx);
    low.set(v, idx++);
    stack.push(v);
    on.add(v);
    for (const w of adj.get(v)) {
      if (!index.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) {
      const c = [];
      let w;
      do {
        w = stack.pop();
        on.delete(w);
        comp.set(w, sccs.length);
        c.push(w);
      } while (w !== v);
      sccs.push(c);
    }
  };
  for (const v of set) if (!index.has(v)) strong(v);
  const cycles = sccs.filter((c) => c.length > 1).map((c) => c.sort());

  const layerOf = new Map();
  const layerCalc = (c) => {
    if (layerOf.has(c)) return layerOf.get(c);
    layerOf.set(c, 0); // guards against surprises; the condensation is acyclic
    let max = -1;
    for (const v of sccs[c]) for (const w of adj.get(v)) if (comp.get(w) !== c) max = Math.max(max, layerCalc(comp.get(w)));
    layerOf.set(c, max + 1);
    return max + 1;
  };
  const layers = {};
  for (const r of set) layers[r] = layerCalc(comp.get(r));

  const fanIn = {};
  const fanOut = {};
  for (const r of set) (fanIn[r] = 0), (fanOut[r] = 0);
  for (const e of cleanEdges) (fanOut[e.from]++, fanIn[e.to]++);

  return { edges: cleanEdges, callEdges, cycles, layers, fanIn, fanOut, external: Object.fromEntries([...external].map(([k, v]) => [k, [...v].sort()])) };
}
