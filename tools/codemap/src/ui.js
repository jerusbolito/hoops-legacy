/* Code map interface. Plain JavaScript, no libraries. Reads the data embedded in the page. */
(function () {
  const D = JSON.parse(document.getElementById('data').textContent);
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const attr = esc;

  /* ── lookups ── */
  const files = new Map(D.files.map((f) => [f.rel, f]));
  const imports = new Map();
  const importedBy = new Map();
  for (const e of D.edges) {
    (imports.get(e.from) ?? imports.set(e.from, []).get(e.from)).push(e);
    (importedBy.get(e.to) ?? importedBy.set(e.to, []).get(e.to)).push(e);
  }
  const fns = new Map(); // id -> {id, rel, name, line, doc, exported}
  for (const f of D.files) for (const fn of f.funcs) fns.set(`${f.rel}#${fn.name}`, { id: `${f.rel}#${fn.name}`, rel: f.rel, ...fn });
  const callsOut = new Map();
  const callsIn = new Map();
  for (const c of D.calls) {
    (callsOut.get(c.from) ?? callsOut.set(c.from, []).get(c.from)).push(c.to);
    (callsIn.get(c.to) ?? callsIn.set(c.to, []).get(c.to)).push(c.from);
  }
  const short = (rel) => rel.split('/').slice(-2).join('/');
  const base = (rel) => rel.split('/').pop();
  const groupTitle = (key) => D.groups.find((g) => g.key === key)?.title ?? key;
  const describe = (f) => f.owns || f.doc || '';

  /* ── small pieces ── */
  const fileLink = (rel, label) => (files.has(rel) ? `<button class="link" data-go="file" data-id="${attr(rel)}">${esc(label ?? base(rel))}</button>` : `<span class="mono">${esc(label ?? rel)}</span>`);
  const fnLink = (id) => {
    const f = fns.get(id);
    return f ? `<button class="link" data-go="flow" data-id="${attr(id)}">${esc(f.name)}</button>` : esc(id);
  };
  const badge = (t, k = '') => `<span class="b ${k}">${esc(t)}</span>`;
  const fileBadges = (f) =>
    [
      badge(`${f.lines} lines`),
      f.fanIn ? badge(`used by ${f.fanIn}`) : badge('not imported', 'warn'),
      f.tests.length ? badge(`${f.tests.length} test file${f.tests.length > 1 ? 's' : ''}`, 'ok') : badge('no direct test', 'warn'),
      f.churn ? badge(`changed ${f.churn}×`) : '',
    ].join('');

  /* ── markdown (just what the docs use) ── */
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  function markdown(text) {
    const out = [];
    const toc = [];
    const lines = text.split('\n');
    let i = 0;
    let list = false;
    const close = () => {
      if (list) out.push('</ul>');
      list = false;
    };
    while (i < lines.length) {
      const l = lines[i];
      if (l.startsWith('```')) {
        close();
        const code = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
        out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
        i++;
        continue;
      }
      const h = l.match(/^(#{1,4})\s+(.*)$/);
      if (h) {
        close();
        const n = h[1].length;
        const id = `h${toc.length}`;
        if (n <= 2) toc.push({ id, text: h[2].replace(/[`*]/g, ''), n });
        out.push(`<h${Math.max(2, n)} id="${id}">${inline(h[2])}</h${Math.max(2, n)}>`);
        i++;
        continue;
      }
      if (/^\s*\|/.test(l)) {
        close();
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
        const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const head = cells(rows[0]);
        const body = rows.slice(/^\s*\|[\s:|-]+\|\s*$/.test(rows[1] ?? '') ? 2 : 1).map(cells);
        out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
        continue;
      }
      const li = l.match(/^\s*[-*]\s+(.*)$/);
      if (li) {
        if (!list) out.push('<ul>');
        list = true;
        out.push(`<li>${inline(li[1])}</li>`);
        i++;
        continue;
      }
      close();
      if (l.trim()) out.push(`<p>${inline(l)}</p>`);
      i++;
    }
    close();
    return { html: out.join(''), toc };
  }

  /* ── views ── */
  const views = {};

  views.map = (state) => {
    const sort = state.sort ?? 'name';
    const cmp = { name: (a, b) => a.name.localeCompare(b.name), size: (a, b) => b.lines - a.lines, used: (a, b) => b.fanIn - a.fanIn, changed: (a, b) => b.churn - a.churn }[sort];
    const totalLines = D.files.reduce((n, f) => n + f.lines, 0);
    const sorts = [['name', 'Name'], ['size', 'Biggest'], ['used', 'Most used'], ['changed', 'Most changed']];
    return `
      <h1>${esc(D.title)}</h1>
      <p class="lead">${D.files.length} source files, ${totalLines.toLocaleString()} lines, in ${D.groups.length} areas. Click a file to see what it owns, what it uses and who uses it.</p>
      <div class="sorts">Sort files by ${sorts.map(([k, t]) => `<button class="chip" data-sort="${k}" aria-pressed="${sort === k}">${t}</button>`).join('')}</div>
      ${D.groups
        .map((g) => {
          const list = g.files.map((r) => files.get(r)).sort(cmp);
          return `<h2>${esc(g.title)} <span class="muted" style="font-size:13px;font-weight:400">${esc(g.key)} · ${list.length} files · ${list.reduce((n, f) => n + f.lines, 0).toLocaleString()} lines</span></h2>
            ${g.blurb ? `<p class="lead">${esc(g.blurb)}</p>` : ''}
            <div class="grid">${list
              .map((f) => {
                const t = describe(f);
                const hint = f.exports.slice(0, 4).map((e) => e.name).join(', ');
                return `<button class="card" data-go="file" data-id="${attr(f.rel)}"><span class="n">${esc(f.name)}</span><span class="t ${t ? '' : 'none'}">${t ? esc(t) : hint ? 'No description in the code. Exports ' + esc(hint) + (f.exports.length > 4 ? '…' : '') : 'No description in the code.'}</span><span class="badges">${fileBadges(f)}</span></button>`;
              })
              .join('')}</div>`;
        })
        .join('')}`;
  };

  views.file = (state) => {
    const f = files.get(state.id);
    if (!f) return `<p class="err">No such file: ${esc(state.id)}</p>`;
    const ins = (importedBy.get(f.rel) ?? []).sort((a, b) => a.from.localeCompare(b.from));
    const outs = (imports.get(f.rel) ?? []).sort((a, b) => a.to.localeCompare(b.to));
    const commits = D.commits.filter((c) => c.files.includes(f.rel));
    const edgeList = (list, key) => (list.length ? `<ul class="list">${list.map((e) => `<li style="display:block"><div>${fileLink(e[key], short(e[key]))} ${e.type ? badge('types only') : ''}</div><div class="muted" style="font-size:12px">${esc(describe(files.get(e[key]) ?? {}))}</div></li>`).join('')}</ul>` : '<p class="muted">None.</p>');
    return `
      <button class="icon back" data-go="map">← All files</button>
      <h1 class="mono" style="font-size:20px">${esc(f.rel)}</h1>
      <div class="row">${fileBadges(f)}${badge('layer ' + f.layer)}${f.lastChanged ? badge('last changed ' + f.lastChanged) : ''}</div>
      ${f.owns ? `<div class="panel"><h3 style="margin-top:0">What it owns</h3>${esc(f.owns)}</div>` : ''}
      ${f.fullDoc ? `<div class="panel"><h3 style="margin-top:0">What the code says</h3>${esc(f.fullDoc)}</div>` : ''}
      ${!f.owns && !f.fullDoc ? '<div class="panel muted">This file has no description in the code or in the ownership table.</div>' : ''}
      <div class="cols">
        <div class="panel"><h3 style="margin-top:0">Uses (${outs.length})</h3>${edgeList(outs, 'to')}${f.external.length ? `<h3>Packages</h3><div class="row">${f.external.map((p) => badge(p)).join('')}</div>` : ''}</div>
        <div class="panel"><h3 style="margin-top:0">Used by (${ins.length})</h3>${edgeList(ins, 'from')}</div>
      </div>
      <div class="panel"><h3 style="margin-top:0">Exports (${f.exports.length})</h3>
        ${f.exports.length ? `<table><thead><tr><th>Name</th><th>Kind</th><th>Line</th><th>What it does</th></tr></thead><tbody>${f.exports.map((e) => `<tr><td class="mono">${fns.has(f.rel + '#' + e.name) ? fnLink(f.rel + '#' + e.name) : esc(e.name)}</td><td>${esc(e.kind)}</td><td class="num">${e.line}</td><td>${esc(e.doc)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nothing exported.</p>'}
      </div>
      ${f.tests.length ? `<div class="panel"><h3 style="margin-top:0">Tests</h3><ul class="list">${f.tests.map((t) => `<li class="mono">${esc(t)}</li>`).join('')}</ul></div>` : ''}
      <div class="panel"><h3 style="margin-top:0">Recent changes (${commits.length})</h3>${commits.length ? commits.map((c) => `<div class="commit"><span class="mono muted">${esc(c.date)}</span><span class="mono">${esc(c.hash)}</span><span>${esc(c.subject)}</span></div>`).join('') : '<p class="muted">Not touched in the commits shown.</p>'}</div>`;
  };

  /* call tree: built lazily so a big flow stays fast */
  const treeNode = (id, depth, seen) => {
    const f = fns.get(id);
    if (!f) return '';
    const kids = (callsOut.get(id) ?? []).filter((k) => fns.has(k));
    const head = `<span class="fn">${esc(f.name)}</span><span class="where">${esc(short(f.rel))}:${f.line}</span>${f.exported ? '' : '<span class="where">(private)</span>'}`;
    const doc = f.doc ? `<div class="doc">${esc(f.doc)}</div>` : '';
    if (!kids.length) return `<div class="leaf">${head}<button class="link" style="margin-left:8px" data-go="file" data-id="${attr(f.rel)}">file</button>${doc}</div>`;
    const loop = seen.has(id);
    return `<details data-id="${attr(id)}" data-depth="${depth}" ${depth < 1 && !loop ? 'open' : ''}><summary>${head} <span class="where">${kids.length} call${kids.length > 1 ? 's' : ''}</span>${loop ? ' <span class="b warn">already shown above</span>' : ''}<button class="link" style="margin-left:8px" data-go="flow" data-id="${attr(id)}">trace from here</button></summary>${doc}<div class="kids">${depth < 1 && !loop ? kids.map((k) => treeNode(k, depth + 1, new Set([...seen, id]))).join('') : ''}</div></details>`;
  };

  views.flow = (state) => {
    const root = state.id && fns.has(state.id) ? state.id : null;
    const presets = D.flows.map((p) => ({ ...p, ok: fns.has(p.entry) }));
    const side = `<div class="presets"><h3 style="margin-top:0">Common flows</h3>${presets.length ? presets.map((p) => `<button data-go="flow" data-id="${attr(p.entry)}" aria-pressed="${root === p.entry}" ${p.ok ? '' : 'disabled title="Entry point not found"'}>${esc(p.title)}<small>${esc(p.blurb ?? p.entry)}</small></button>`).join('') : '<p class="muted">Add flows to the config to list them here.</p>'}<h3>Any function</h3><p class="muted" style="font-size:13px;margin:0">Use the search box above and pick a function.</p></div>`;
    if (!root) return `<h1>How things flow</h1><p class="lead">Pick an entry point to see everything it calls, level by level. Open any step to go deeper.</p><div class="flow">${side}<div class="panel muted">Choose a flow on the left, or search for a function.</div></div>`;
    const f = fns.get(root);
    const callers = (callsIn.get(root) ?? []).filter((c) => fns.has(c));
    return `<h1>How things flow</h1><div class="flow">${side}<div>
      <div class="panel"><div class="row"><span class="fn mono" style="font-weight:700;font-size:16px">${esc(f.name)}</span>${fileLink(f.rel, short(f.rel) + ':' + f.line)}</div>${f.doc ? `<p class="lead" style="margin:6px 0 0">${esc(f.doc)}</p>` : ''}
        <h3>Called by (${callers.length})</h3>${callers.length ? `<div class="row">${callers.slice(0, 30).map((c) => `<button class="chip" data-go="flow" data-id="${attr(c)}">${esc(fns.get(c).name)} <span class="muted">${esc(base(fns.get(c).rel))}</span></button>`).join('')}${callers.length > 30 ? `<span class="muted">+${callers.length - 30} more</span>` : ''}</div>` : '<p class="muted" style="margin:0">Nothing in the code calls it (an entry point, or called from outside).</p>'}
      </div>
      <h3>Calls</h3><div class="panel tree">${treeNode(root, 0, new Set())}</div></div></div>`;
  };

  views.graph = (state) => {
    const key = state.group && D.groups.some((g) => g.key === state.group) ? state.group : (D.groups.find((g) => g.key.endsWith('engine')) ?? D.groups[0]).key;
    const g = D.groups.find((x) => x.key === key);
    const inGroup = new Set(g.files);
    const nodes = g.files.map((r) => files.get(r));
    const ranks = [...new Set(nodes.map((n) => n.layer))].sort((a, b) => a - b);
    const rankIdx = new Map(ranks.map((r, i) => [r, i]));
    const col = new Map();
    for (const n of nodes) (col.get(n.layer) ?? col.set(n.layer, []).get(n.layer)).push(n);
    for (const list of col.values()) list.sort((a, b) => b.fanIn - a.fanIn || a.name.localeCompare(b.name));
    const W = 170, H = 22, GX = 90, GY = 8, PAD = 16;
    const pos = new Map();
    let maxRows = 0;
    for (const [layer, list] of col) {
      maxRows = Math.max(maxRows, list.length);
      list.forEach((n, i) => pos.set(n.rel, { x: PAD + rankIdx.get(layer) * (W + GX), y: PAD + i * (H + GY) }));
    }
    const width = PAD * 2 + ranks.length * (W + GX) - GX;
    const height = PAD * 2 + maxRows * (H + GY);
    const sel = state.id && inGroup.has(state.id) ? state.id : null;
    const edges = D.edges.filter((e) => inGroup.has(e.from) && inGroup.has(e.to));
    const touches = (e) => sel && (e.from === sel || e.to === sel);
    const near = new Set(sel ? [sel, ...edges.filter(touches).flatMap((e) => [e.from, e.to])] : []);
    const path = (e) => {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      const x1 = a.x, y1 = a.y + H / 2, x2 = b.x + W, y2 = b.y + H / 2;
      const dx = Math.max(30, Math.abs(x1 - x2) / 2);
      return `M${x1},${y1} C${x1 - dx},${y1} ${x2 + dx},${y2} ${x2},${y2}`;
    };
    const tabs = D.groups.filter((x) => x.files.length > 1).map((x) => `<button class="chip" data-graph="${attr(x.key)}" aria-pressed="${x.key === key}">${esc(x.title)}</button>`).join('');
    const info = sel ? files.get(sel) : null;
    return `<h1>How files depend on each other</h1>
      <p class="lead">Each box is a file. A line runs from a file to something it imports. Foundations are on the left and the files built on top of them are on the right. Click a box to light up its connections.</p>
      <div class="row" style="margin-bottom:10px">${tabs}</div>
      ${info ? `<div class="panel"><div class="row"><b class="mono">${esc(info.name)}</b>${badge('uses ' + info.fanOut)}${badge('used by ' + info.fanIn)}<button class="link" data-go="file" data-id="${attr(info.rel)}">open file details</button>${edges.some(touches) ? '' : badge('no links inside this area', 'warn')}</div><div class="muted" style="font-size:13px">${esc(describe(info))}</div></div>` : ''}
      <div class="graphwrap"><svg width="${width}" height="${height}" role="img" aria-label="Dependency diagram for ${attr(g.title)}">
        ${edges.map((e) => `<path class="edge ${e.type ? 'type' : ''} ${sel ? (touches(e) ? 'hi' : 'dim') : ''}" d="${path(e)}"/>`).join('')}
        ${nodes.map((n) => { const p = pos.get(n.rel); return `<g class="node ${n.rel === sel ? 'sel' : ''} ${sel && !near.has(n.rel) ? 'dim' : ''}" data-node="${attr(n.rel)}" tabindex="0" role="button" aria-label="${attr(n.name)}"><title>${esc(n.rel + (describe(n) ? ' — ' + describe(n) : ''))}</title><rect x="${p.x}" y="${p.y}" width="${W}" height="${H}"/><text x="${p.x + 8}" y="${p.y + 15}">${esc(n.name.length > 24 ? n.name.slice(0, 23) + '…' : n.name)}</text></g>`; }).join('')}
      </svg></div>`;
  };

  views.changes = (state) => {
    const q = (state.q ?? '').toLowerCase();
    const hot = [...D.files].filter((f) => f.churn).sort((a, b) => b.churn - a.churn).slice(0, 15);
    const top = hot[0]?.churn ?? 1;
    const commits = D.commits.filter((c) => !q || c.subject.toLowerCase().includes(q) || c.files.some((f) => f.toLowerCase().includes(q)));
    return `<h1>What changed and why</h1>
      <p class="lead">The files touched most often are where the code is still moving, which is also where it is easiest to lose track.</p>
      <div class="panel"><h3 style="margin-top:0">Most changed files</h3>${hot.map((f) => `<div class="bar-row"><span>${fileLink(f.rel, short(f.rel))}</span><span class="track"><span class="fill" style="display:block;width:${(f.churn / top) * 100}%"></span></span><span class="mono">${f.churn}</span></div>`).join('') || '<p class="muted">No git history found.</p>'}</div>
      <div class="row" style="margin:14px 0 4px"><h3 style="margin:0">Recent commits</h3><input id="cq" class="icon" style="min-width:240px" placeholder="Filter by message or file" value="${attr(state.q ?? '')}"></div>
      <div class="panel">${commits.map((c) => `<div class="commit"><span class="mono muted">${esc(c.date)}</span><span class="mono">${esc(c.hash)}</span><span>${esc(c.subject)}</span><span class="files">${c.files.slice(0, 14).map((f) => `<button class="b" style="cursor:pointer" data-go="file" data-id="${attr(f)}">${esc(base(f))}</button>`).join('')}${c.files.length > 14 ? badge('+' + (c.files.length - 14) + ' more') : ''}</span></div>`).join('') || '<p class="muted">Nothing matches.</p>'}</div>`;
  };

  views.rules = () => `
    <h1>Rules and gotchas</h1>
    <p class="lead">The checks below run against the code every time this page is generated, so a rule that is quietly broken shows up here.</p>
    <div class="panel">${D.rules.map((r) => `<div class="rule ${r.ok ? 'ok' : 'bad'}" style="margin:10px 0"><span class="mark">${r.ok ? '✓' : '!'}</span><div><b>${esc(r.title)}</b><div class="muted" style="font-size:13px">${esc(r.why)}</div>${r.ok ? '' : `<ul>${r.violations.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>`}</div></div>`).join('')}</div>
    <h2>Things that bite</h2>
    <p class="lead">Hand-written from the project's own notes. The code cannot check these, so they live here where you will see them.</p>
    ${D.gotchas.length ? D.gotchas.map((g) => `<div class="gotcha"><b>${esc(g.title)}</b>${esc(g.text)}${g.where ? `<div class="muted" style="font-size:12px;margin-top:2px">${(Array.isArray(g.where) ? g.where : [g.where]).map((w) => (files.has(w) ? fileLink(w, w) : `<span class="mono">${esc(w)}</span>`)).join(' · ')}</div>` : ''}</div>`).join('') : '<p class="muted">Add gotchas to the config.</p>'}`;

  views.docs = (state) => {
    if (!D.docs.length) return '<h1>Docs</h1><p class="muted">No documents were configured.</p>';
    const i = Math.min(state.doc ?? 0, D.docs.length - 1);
    const md = markdown(D.docs[i].text);
    return `<h1>Project notes</h1><div class="row" style="margin-bottom:10px">${D.docs.map((d, k) => `<button class="chip" data-doc="${k}" aria-pressed="${k === i}">${esc(d.title)}</button>`).join('')}</div>
      <div class="docs"><div class="toc"><h3 style="margin-top:0">On this page</h3>${md.toc.map((t) => `<button data-jump="${t.id}" style="padding-left:${(t.n - 1) * 12}px">${esc(t.text)}</button>`).join('')}</div><div class="md panel">${md.html}</div></div>`;
  };

  /* ── router ── */
  const TABS = [['map', 'Map'], ['flow', 'Flows'], ['graph', 'Graph'], ['changes', 'Changes'], ['rules', 'Rules'], ['docs', 'Docs']];
  let state = { view: 'map' };
  const parse = () => {
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    const [view, rest] = h.split('?');
    const s = { view: views[view] ? view : 'map' };
    for (const kv of (rest ?? '').split('&')) {
      const j = kv.indexOf('=');
      if (j > 0) s[kv.slice(0, j)] = kv.slice(j + 1);
    }
    if (s.doc !== undefined) s.doc = Number(s.doc);
    return s;
  };
  const go = (view, params = {}) => {
    const q = Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${v}`).join('&');
    location.hash = encodeURIComponent(view) + (q ? '?' + q : '');
  };
  const render = () => {
    state = parse();
    const v = state.view === 'file' ? 'map' : state.view;
    $('nav').innerHTML = TABS.map(([k, t]) => `<button data-tab="${k}" role="tab" aria-selected="${k === v}">${t}</button>`).join('');
    try {
      $('main').innerHTML = views[state.view](state);
    } catch (e) {
      $('main').innerHTML = `<div class="err">Something went wrong drawing this view.\n${esc(e.stack || e)}</div>`;
    }
    if (state.view !== 'changes') window.scrollTo(0, 0);
    // a selected box can be far to the right in a wide diagram: bring it to the middle of the view
    if (state.view === 'graph') $('.node.sel')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  };
  window.addEventListener('hashchange', render);

  /* lazy children for the call tree */
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.open || !d.dataset.id) return;
    const kids = d.querySelector(':scope > .kids');
    if (!kids || kids.childElementCount) return;
    const seen = new Set();
    for (let p = d.parentElement; p; p = p.parentElement) if (p.dataset?.id && p.tagName === 'DETAILS') seen.add(p.dataset.id);
    kids.innerHTML = (callsOut.get(d.dataset.id) ?? []).filter((k) => fns.has(k)).map((k) => treeNode(k, Number(d.dataset.depth) + 1, seen)).join('');
  }, true);

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go],[data-tab],[data-sort],[data-graph],[data-doc],[data-jump],[data-node]');
    if (!t) return;
    if (t.dataset.tab) return go(t.dataset.tab);
    if (t.dataset.sort) {
      state.sort = t.dataset.sort;
      $('main').innerHTML = views.map(state);
      return;
    }
    if (t.dataset.graph) return go('graph', { group: t.dataset.graph });
    if (t.dataset.node) return go('graph', { group: state.group ?? files.get(t.dataset.node).group, id: t.dataset.node });
    if (t.dataset.doc) return go('docs', { doc: t.dataset.doc });
    if (t.dataset.jump) return void document.getElementById(t.dataset.jump)?.scrollIntoView({ behavior: 'smooth' });
    e.preventDefault();
    const k = t.dataset.go;
    if (k === 'file') go('file', { id: t.dataset.id });
    else if (k === 'flow') go('flow', { id: t.dataset.id });
    else go(k);
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.node')) {
      e.preventDefault();
      e.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'cq') {
      state.q = e.target.value;
      const pos = e.target.selectionStart;
      $('main').innerHTML = views.changes(state);
      const el = $('#cq');
      el.focus();
      el.setSelectionRange(pos, pos);
    }
  });

  /* ── search ── */
  const box = $('#q');
  const res = $('#results');
  let hits = [];
  let cur = 0;
  const find = (q) => {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const score = (s, w) => (s.toLowerCase() === q ? 3 : s.toLowerCase().startsWith(q) ? 2 : s.toLowerCase().includes(q) ? 1 : 0) * w;
    const out = [];
    for (const f of D.files) {
      const s = Math.max(score(f.name, 4), score(f.rel, 2), score(describe(f), 0.6));
      if (s) out.push({ s, k: 'file', id: f.rel, t: f.name, d: describe(f) || f.group });
    }
    for (const fn of fns.values()) {
      const s = score(fn.name, 3) + (fn.exported ? 0.5 : 0);
      if (s >= 1) out.push({ s, k: 'func', id: fn.id, t: fn.name, d: short(fn.rel) });
    }
    return out.sort((a, b) => b.s - a.s || a.t.length - b.t.length).slice(0, 14);
  };
  const paint = () => {
    res.classList.toggle('open', hits.length > 0);
    res.innerHTML = hits.map((h, i) => `<button class="${i === cur ? 'sel' : ''}" data-hit="${i}"><span class="k">${h.k}</span><span class="mono">${esc(h.t)}</span><span class="d">${esc(h.d)}</span></button>`).join('');
  };
  const pick = (h) => {
    box.value = '';
    hits = [];
    paint();
    box.blur();
    if (h.k === 'file') go('file', { id: h.id });
    else go('flow', { id: h.id });
  };
  box.addEventListener('input', () => {
    hits = find(box.value);
    cur = 0;
    paint();
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') (cur = Math.min(hits.length - 1, cur + 1)), paint(), e.preventDefault();
    else if (e.key === 'ArrowUp') (cur = Math.max(0, cur - 1)), paint(), e.preventDefault();
    else if (e.key === 'Enter' && hits[cur]) pick(hits[cur]);
    else if (e.key === 'Escape') (box.value = ''), (hits = []), paint(), box.blur();
  });
  res.addEventListener('mousedown', (e) => {
    const b = e.target.closest('[data-hit]');
    if (b) pick(hits[Number(b.dataset.hit)]);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== box && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) {
      e.preventDefault();
      box.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search')) {
      hits = [];
      paint();
    }
  });

  /* ── theme ── */
  const themeBtn = $('#theme');
  const applyTheme = (t) => {
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  };
  try {
    applyTheme(localStorage.getItem('codemap-theme'));
  } catch {
    /* storage may be blocked */
  }
  themeBtn.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem('codemap-theme', next);
    } catch {
      /* ignore */
    }
  });

  $('#gen').textContent = `Generated ${D.generatedAt.slice(0, 16).replace('T', ' ')}`;
  render();
})();
