// app.js — the only module that touches the DOM. It wires the editor, the
// live preview, the brand/blocks/archive panels and persistence together.
// All Markdown→email work lives in compiler.js; all data in storage.js.

import * as store from './storage.js';
import { compile, PLATFORMS } from './compiler.js';
import { TEMPLATES, TEMPLATE_IDS, templateLabel } from './templates.js';
import { stats } from './stats.js';

const $ = (id) => document.getElementById(id);
const debounce = (fn, ms) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

// ---- App state ----------------------------------------------------------

const S = {
  settings: null,
  brands: [],
  blocks: [],
  brandId: null,
  template: 'single',
  platform: 'generic',
  issueNumber: null,   // set when an archived issue is open (for re-save)
  device: 'desktop',
  dark: false,
};

const SEED_BRAND = {
  name: 'My Newsletter',
  logo: '',
  accent: '#3b5bdb',
  ink: '#1f2328',
  font: 'sans',
  footerLinks: [{ label: 'Website', url: 'https://example.com' }],
  unsubUrl: '',
  address: '',
  preheader: '',
  sponsor: '',
};

const SEED_MD = `# The quiet return of long-form

Something strange happened last quarter. Everyone I know who quit
newsletters came back — not because the algorithm rewarded it, but
because **they missed writing for humans** instead of feeds.

---

## What changed

Three things shifted at once:

1. Readers got tired of disposable content
2. Inboxes became the last calm channel
3. Writers wanted to own their audience again

> The newsletter is the only place online you actually own.

[Read the full breakdown →](https://example.com)
`;

function currentBrand() {
  return S.brands.find((b) => b.id === S.brandId) || { ...SEED_BRAND };
}

// ---- Render pipeline ----------------------------------------------------

function renderPreview() {
  const md = $('md').value;
  const brand = currentBrand();
  let out;
  try {
    out = compile(md, brand, S.template, S.platform);
  } catch (e) {
    console.error(e);
    return;
  }

  let html = out.html;
  if (S.dark) {
    // Force the dark palette regardless of OS by re-asserting the rules the
    // template ships behind prefers-color-scheme.
    html = html.replace('</head>', `<style>
      .pd-body{background:#111317!important}
      .pd-card{background:#1b1e24!important}
      .pd-ink,.pd-ink *{color:#e8e8ea!important}
      .pd-muted{color:#9aa0a6!important}
      .pd-rule{border-color:#2c3037!important}
    </style></head>`);
  }

  const doc = $('preview').contentDocument;
  doc.open(); doc.write(html); doc.close();

  $('clipWarn').hidden = !out.clipped;
  return out;
}

function renderStats() {
  const s = stats($('md').value);
  $('stWords').textContent = `${s.words.toLocaleString()} word${s.words === 1 ? '' : 's'}`;
  $('stRead').textContent = `${s.minutes} min read`;
  $('stFlesch').textContent = `Flesch ${s.flesch} · ${s.grade}`;
  $('stSentence').textContent = `${s.avgSentence} wds/sentence`;
  const unnamed = $('issueName').value.trim() === '';
  $('issueName').classList.toggle('needs-name', unnamed && s.words >= 30);
}

const persistDraft = debounce(async () => {
  await store.saveSettings({
    draft: {
      md: $('md').value,
      brandId: S.brandId,
      template: S.template,
      platform: S.platform,
      name: $('issueName').value,
      subject: $('subjectLine').value,
      number: S.issueNumber,
    },
  });
  flashSaved();
}, 600);

const liveRender = debounce(() => renderPreview(), 150);

function onInput() {
  renderStats();
  liveRender();
  persistDraft();
  syncToCollaborator();
}

let savedTimer;
function updateSubjectCount() {
  const n = $('subjectLine').value.length;
  const el = $('subjectCount');
  el.textContent = n || '';
  el.className = 'subject-count' + (n > 70 ? ' over' : n > 50 ? ' warn' : '');
}

function flashSaved() {
  const el = $('stSaved');
  el.textContent = 'Saved locally ✓';
  el.classList.add('on');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    el.classList.remove('on');
    el.textContent = 'Local-only · your content stays in this browser';
  }, 1400);
}

// ---- Editor: toolbar + selection helpers --------------------------------

function surround(before, after = before, placeholder = '') {
  const ta = $('md');
  const [s, e] = [ta.selectionStart, ta.selectionEnd];
  const sel = ta.value.slice(s, e) || placeholder;
  const text = ta.value.slice(0, s) + before + sel + after + ta.value.slice(e);
  ta.value = text;
  ta.focus();
  ta.selectionStart = s + before.length;
  ta.selectionEnd = s + before.length + sel.length;
  onInput();
}

function linePrefix(prefix) {
  const ta = $('md');
  const s = ta.selectionStart;
  const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
  ta.value = ta.value.slice(0, lineStart) + prefix + ta.value.slice(lineStart);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = s + prefix.length;
  onInput();
}

function insertAtCursor(snippet) {
  const ta = $('md');
  const s = ta.selectionStart;
  ta.value = ta.value.slice(0, s) + snippet + ta.value.slice(ta.selectionEnd);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = s + snippet.length;
  onInput();
}

function bindToolbar() {
  $('toolbar').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    switch (b.dataset.md) {
      case 'h1': linePrefix('# '); break;
      case 'h2': linePrefix('## '); break;
      case 'bold': surround('**', '**', 'bold text'); break;
      case 'italic': surround('_', '_', 'italic text'); break;
      case 'link': surround('[', '](https://)', 'link text'); break;
      case 'image': $('imgPicker').click(); break;
      case 'hr': insertAtCursor('\n\n---\n\n'); break;
    }
  });
}

// ---- Slash command menu (insert reusable blocks) ------------------------

let slashAnchor = -1;

function closeSlash() {
  $('slashMenu').hidden = true;
  slashAnchor = -1;
}

function openSlash() {
  const menu = $('slashMenu');
  if (!S.blocks.length) {
    menu.innerHTML = `<div class="slash-empty">No blocks yet. Add one in
      <button class="linklike" data-open="blocks">Reusable blocks</button>.</div>`;
  } else {
    menu.innerHTML = S.blocks.map((b, i) => {
      const preview = (b.md || '').replace(/[#*_~`\[\]()\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
      return `<button class="slash-item${i === 0 ? ' sel' : ''}" data-i="${i}">
        <span class="slash-top">
          <span class="slash-cmd">/${b.slash}</span>
          <span class="slash-name">${escapeHtml(b.name)}</span>
        </span>
        ${preview ? `<span class="slash-preview">${escapeHtml(preview)}</span>` : ''}
      </button>`;
    }).join('');
  }
  menu.hidden = false;
}

function filterSlash(q) {
  const items = [...$('slashMenu').querySelectorAll('.slash-item')];
  let firstVisible = null;
  items.forEach((it) => {
    const b = S.blocks[+it.dataset.i];
    const hit = !q || b.slash.toLowerCase().startsWith(q.toLowerCase());
    it.style.display = hit ? '' : 'none';
    it.classList.remove('sel');
    if (hit && !firstVisible) firstVisible = it;
  });
  if (firstVisible) firstVisible.classList.add('sel');
}

function applySlash(block) {
  const ta = $('md');
  const before = ta.value.slice(0, slashAnchor);
  const after = ta.value.slice(ta.selectionStart);
  ta.value = before + block.md + after;
  const pos = before.length + block.md.length;
  ta.selectionStart = ta.selectionEnd = pos;
  closeSlash();
  ta.focus();
  onInput();
}

function bindSlash() {
  const ta = $('md');
  const menu = $('slashMenu');

  ta.addEventListener('keydown', (e) => {
    if (menu.hidden) {
      if (e.key === '/') {
        const c = ta.value[ta.selectionStart - 1];
        if (!c || c === '\n' || c === ' ') {
          slashAnchor = ta.selectionStart;
          setTimeout(openSlash, 0);
        }
      }
      return;
    }
    const vis = [...menu.querySelectorAll('.slash-item')]
      .filter((i) => i.style.display !== 'none');
    const cur = menu.querySelector('.slash-item.sel');
    if (e.key === 'Escape') { closeSlash(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = vis.indexOf(cur);
      const n = e.key === 'ArrowDown'
        ? Math.min(i + 1, vis.length - 1) : Math.max(i - 1, 0);
      cur && cur.classList.remove('sel');
      vis[n] && vis[n].classList.add('sel');
    } else if (e.key === 'Enter' && cur) {
      e.preventDefault();
      applySlash(S.blocks[+cur.dataset.i]);
    }
  });

  ta.addEventListener('input', () => {
    if (menu.hidden || slashAnchor < 0) return;
    const seg = ta.value.slice(slashAnchor, ta.selectionStart);
    if (!seg.startsWith('/') || /\s/.test(seg)) { closeSlash(); return; }
    filterSlash(seg.slice(1));
  });

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.slash-item');
    if (item) { applySlash(S.blocks[+item.dataset.i]); return; }
    const open = e.target.closest('[data-open]');
    if (open) { closeSlash(); openPanel(open.dataset.open); }
  });

  document.addEventListener('click', (e) => {
    if (!menu.hidden && !e.target.closest('.editor-pane')) closeSlash();
  });
}

// ---- Selects (brand / template) -----------------------------------------

function fillSelects() {
  const ps = $('platformSel');
  ps.innerHTML = PLATFORMS.map((p) =>
    `<option value="${p.id}"${p.id === S.platform ? ' selected' : ''}>${escapeHtml(p.label)}</option>`).join('');

  const bs = $('brandSel');
  bs.innerHTML = S.brands.map((b) =>
    `<option value="${b.id}"${b.id === S.brandId ? ' selected' : ''}>${escapeHtml(b.name)}</option>`).join('')
    || '<option>(no brands)</option>';

  const ts = $('tplSel');
  ts.innerHTML = TEMPLATE_IDS.map((id) =>
    `<option value="${id}"${id === S.template ? ' selected' : ''}>${templateLabel(id)}</option>`).join('');
}

// ---- Platform hint bar --------------------------------------------------

function updatePlatformNote() {
  const p = PLATFORMS.find((x) => x.id === S.platform);
  const el = $('platformNote');
  if (p && p.note) { el.textContent = p.note; el.hidden = false; }
  else { el.hidden = true; }
}

// ---- Panels (slide-over) ------------------------------------------------

function openPanel(kind) {
  const titles = { brands: 'Brand presets', blocks: 'Reusable blocks', archive: 'Issue archive' };
  $('panelTitle').textContent = titles[kind] || kind;
  $('panelWrap').hidden = false;
  if (kind === 'brands') renderBrandsPanel();
  if (kind === 'blocks') renderBlocksPanel();
  if (kind === 'archive') renderArchivePanel();
}
function closePanel() { $('panelWrap').hidden = true; }

// --- Brands panel ---

function renderBrandsPanel() {
  const body = $('panelBody');
  body.innerHTML = `
    <p class="panel-lead">Write your visual identity once. Every issue you
    open with a brand inherits its logo, colors, font and footer.</p>
    <div id="brandList" class="card-list"></div>
    <button id="newBrand" class="btn btn-ghost wide" type="button">+ New brand preset</button>
  `;
  const list = $('brandList');
  list.innerHTML = S.brands.map((b) => `
    <div class="row-card">
      <div>
        <strong>${escapeHtml(b.name)}</strong>
        <span class="row-sub">${b.id === S.settings.defaultBrandId ? 'default · ' : ''}${(b.footerLinks || []).length} footer link(s)</span>
      </div>
      <div class="row-actions">
        <button class="btn btn-tertiary" data-edit="${b.id}" type="button">Edit</button>
        <button class="btn btn-tertiary" data-use="${b.id}" type="button">Use</button>
        <button class="btn btn-tertiary danger" data-del="${b.id}" type="button">Delete</button>
      </div>
    </div>`).join('') || '<p class="muted">No brands yet.</p>';

  $('newBrand').onclick = () => brandForm({ ...SEED_BRAND });
  list.querySelectorAll('[data-edit]').forEach((b) =>
    b.onclick = () => brandForm(S.brands.find((x) => x.id === +b.dataset.edit)));
  list.querySelectorAll('[data-use]').forEach((b) =>
    b.onclick = () => { S.brandId = +b.dataset.use; fillSelects(); persistAndRender(); closePanel(); });
  list.querySelectorAll('[data-del]').forEach((b) =>
    b.onclick = async () => {
      if (!await confirmDialog('Delete this brand preset? This cannot be undone.', 'Delete')) return;
      await store.brands.remove(+b.dataset.del);
      await reloadBrands(); renderBrandsPanel();
    });
}

function brandForm(b) {
  const body = $('panelBody');
  const links = b.footerLinks && b.footerLinks.length ? b.footerLinks : [{ label: '', url: '' }];
  body.innerHTML = `
  <form id="bForm" class="form">
    <label>Newsletter name<input name="name" value="${escapeAttr(b.name)}" required></label>
    <label>Logo (stored as base64 in your browser — no hosting)
      <input type="file" name="logoFile" accept="image/*">
      <span class="logo-prev">${b.logo ? `<img src="${b.logo}" alt="">` : '<em class="muted">no logo — wordmark used</em>'}</span>
    </label>
    <div class="two">
      <label>Accent color
        <div class="color-field">
          <input type="color" name="accent" id="bAccent" value="${b.accent}">
          <input type="text" class="color-hex" id="bAccentHex" value="${escapeAttr(b.accent)}" maxlength="7" spellcheck="false" autocomplete="off">
        </div>
      </label>
      <label>Text color
        <div class="color-field">
          <input type="color" name="ink" id="bInk" value="${b.ink}">
          <input type="text" class="color-hex" id="bInkHex" value="${escapeAttr(b.ink)}" maxlength="7" spellcheck="false" autocomplete="off">
        </div>
      </label>
    </div>
    <label>Font (only stacks that render everywhere)
      <select name="font">
        <option value="sans"${b.font === 'sans' ? ' selected' : ''}>System sans</option>
        <option value="serif"${b.font === 'serif' ? ' selected' : ''}>Serif</option>
        <option value="mono"${b.font === 'mono' ? ' selected' : ''}>Monospace</option>
      </select>
    </label>
    <label>Preheader (inbox preview line)<input name="preheader" value="${escapeAttr(b.preheader || '')}"></label>
    <fieldset class="fl"><legend>Footer links</legend><div id="flRows">
      ${links.map((l, i) => flRow(l, i)).join('')}
    </div><button type="button" class="btn btn-tertiary" id="addFl">+ Add link</button></fieldset>
    <label>Unsubscribe URL (CAN-SPAM)<input name="unsubUrl" value="${escapeAttr(b.unsubUrl || '')}"></label>
    <label>Mailing address (footer, optional)<input name="address" value="${escapeAttr(b.address || '')}"></label>
    <label>Sponsor block markdown (used by the Sponsor-first template)
      <textarea name="sponsor" rows="3">${escapeHtml(b.sponsor || '')}</textarea></label>
    <div class="form-actions">
      <button class="btn btn-primary" type="submit">Save brand</button>
      <button class="btn btn-ghost" type="button" id="bCancel">Cancel</button>
    </div>
  </form>`;

  let logoData = b.logo || '';
  body.querySelector('[name=logoFile]').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      logoData = rd.result;
      body.querySelector('.logo-prev').innerHTML = `<img src="${logoData}" alt="">`;
    };
    rd.readAsDataURL(f);
  };
  $('addFl').onclick = () => {
    const d = document.createElement('div');
    d.innerHTML = flRow({ label: '', url: '' }, Date.now());
    $('flRows').appendChild(d.firstElementChild);
  };
  $('flRows').addEventListener('click', (e) => {
    if (e.target.matches('[data-rmfl]')) e.target.closest('.fl-row').remove();
  });
  $('bCancel').onclick = renderBrandsPanel;

  // Color picker ↔ hex text sync + live preview
  function livePreviewBrand() {
    const tempBrand = {
      ...currentBrand(),
      accent: document.getElementById('bAccent').value,
      ink: document.getElementById('bInk').value,
    };
    try {
      const out = compile($('md').value, tempBrand, S.template, S.platform);
      let html = out.html;
      if (S.dark) html = html.replace('</head>', `<style>
        .pd-body{background:#111317!important}.pd-card{background:#1b1e24!important}
        .pd-ink,.pd-ink *{color:#e8e8ea!important}.pd-muted{color:#9aa0a6!important}
        .pd-rule{border-color:#2c3037!important}</style></head>`);
      const doc = $('preview').contentDocument;
      doc.open(); doc.write(html); doc.close();
    } catch {}
  }
  function wireColor(pickerId, hexId) {
    const picker = document.getElementById(pickerId);
    const hex = document.getElementById(hexId);
    picker.addEventListener('input', () => { hex.value = picker.value; livePreviewBrand(); });
    hex.addEventListener('input', () => {
      const v = hex.value.trim();
      if (/^#[0-9a-f]{6}$/i.test(v)) { picker.value = v; livePreviewBrand(); }
    });
    hex.addEventListener('blur', () => { hex.value = picker.value; });
  }
  wireColor('bAccent', 'bAccentHex');
  wireColor('bInk', 'bInkHex');

  $('bForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const footerLinks = [...$('flRows').querySelectorAll('.fl-row')].map((r) => ({
      label: r.querySelector('[name=fl_label]').value.trim(),
      url: r.querySelector('[name=fl_url]').value.trim(),
    })).filter((l) => l.label || l.url);
    const rec = {
      ...b,
      name: fd.get('name').trim() || 'Untitled brand',
      logo: logoData,
      accent: fd.get('accent'),
      ink: fd.get('ink'),
      font: fd.get('font'),
      preheader: fd.get('preheader').trim(),
      unsubUrl: fd.get('unsubUrl').trim(),
      address: fd.get('address').trim(),
      sponsor: fd.get('sponsor'),
      footerLinks,
    };
    await store.brands.save(rec);
    if (S.brands.length === 0) await store.saveSettings({ defaultBrandId: rec.id });
    await reloadBrands();
    if (!S.brandId) S.brandId = S.brands[0] && S.brands[0].id;
    fillSelects(); persistAndRender();
    renderBrandsPanel();
    toast('Brand saved');
  };
}

function flRow(l, i) {
  return `<div class="fl-row">
    <input name="fl_label" placeholder="Label" value="${escapeAttr(l.label || '')}">
    <input name="fl_url" placeholder="https://" value="${escapeAttr(l.url || '')}">
    <button type="button" class="icon-btn" data-rmfl title="Remove">✕</button>
  </div>`;
}

// --- Blocks panel ---

function renderBlocksPanel() {
  const body = $('panelBody');
  body.innerHTML = `
    <p class="panel-lead">Your recurring pieces — sponsor slot, CTA, PS line,
    divider. Type <kbd>/</kbd> then the trigger in the editor to drop one in.</p>
    <div id="blockList" class="card-list"></div>
    <button id="newBlock" class="btn btn-ghost wide" type="button">+ New block</button>
  `;
  $('blockList').innerHTML = S.blocks.map((b) => `
    <div class="row-card">
      <div><strong>/${escapeHtml(b.slash)}</strong>
      <span class="row-sub">${escapeHtml(b.name)}</span></div>
      <div class="row-actions">
        <button class="btn btn-tertiary" data-edit="${b.id}" type="button">Edit</button>
        <button class="btn btn-tertiary danger" data-del="${b.id}" type="button">Delete</button>
      </div>
    </div>`).join('') || '<p class="muted">No blocks yet.</p>';

  $('newBlock').onclick = () => blockForm({ name: '', slash: '', md: '' });
  $('blockList').querySelectorAll('[data-edit]').forEach((b) =>
    b.onclick = () => blockForm(S.blocks.find((x) => x.id === +b.dataset.edit)));
  $('blockList').querySelectorAll('[data-del]').forEach((b) =>
    b.onclick = async () => {
      await store.blocks.remove(+b.dataset.del);
      await reloadBlocks(); renderBlocksPanel();
    });
}

function blockForm(b) {
  $('panelBody').innerHTML = `
  <form id="kForm" class="form">
    <label>Name<input name="name" value="${escapeAttr(b.name)}" required></label>
    <label>Slash trigger (no spaces)
      <input name="slash" value="${escapeAttr(b.slash)}" pattern="[a-zA-Z0-9_-]+" required></label>
    <label>Markdown content
      <textarea name="md" rows="8" required>${escapeHtml(b.md)}</textarea></label>
    <div class="form-actions">
      <button class="btn btn-primary" type="submit">Save block</button>
      <button class="btn btn-ghost" type="button" id="kCancel">Cancel</button>
    </div>
  </form>`;
  $('kCancel').onclick = renderBlocksPanel;
  $('kForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await store.blocks.save({
      ...b,
      name: fd.get('name').trim(),
      slash: fd.get('slash').trim().replace(/^\//, ''),
      md: fd.get('md'),
    });
    await reloadBlocks(); renderBlocksPanel();
    toast('Block saved');
  };
}

// --- Archive panel ---

async function renderArchivePanel(q = '') {
  const list = await store.issues.search(q);
  $('panelBody').innerHTML = `
    <p class="panel-lead">Every issue you copied is saved here — Markdown,
    HTML and plain text. Search every word you have ever written.</p>
    <input id="arcSearch" class="search" placeholder="Search all issues…" value="${escapeAttr(q)}">
    <div class="card-list">
      ${list.map((i) => `
      <div class="row-card">
        <div>
          <strong>#${i.number} · ${escapeHtml(i.name || 'Untitled')}</strong>
          ${i.subject ? `<span class="row-subject">${escapeHtml(i.subject)}</span>` : ''}
          <span class="row-sub">${new Date(i.updated).toLocaleDateString()} · ${i.words || 0} words · ${escapeHtml(i.template)}</span>
        </div>
        <div class="row-actions">
          <button class="btn btn-tertiary" data-open="${i.number}" type="button">Open</button>
          <button class="btn btn-tertiary danger" data-del="${i.number}" type="button">Delete</button>
        </div>
      </div>`).join('') || '<p class="muted">No saved issues yet. They appear here the moment you Copy HTML.</p>'}
    </div>`;

  $('arcSearch').addEventListener('input', debounce((e) => renderArchivePanel(e.target.value), 200));
  $('panelBody').querySelectorAll('[data-open]').forEach((b) =>
    b.onclick = async () => {
      const iss = await store.issues.get(+b.dataset.open);
      $('md').value = iss.md;
      $('issueName').value = iss.name || '';
      $('subjectLine').value = iss.subject || '';
      updateSubjectCount();
      S.issueNumber = iss.number;
      if (iss.brandId && S.brands.some((x) => x.id === iss.brandId)) S.brandId = iss.brandId;
      if (TEMPLATES[iss.template]) S.template = iss.template;
      $('issueNo').textContent = `#${iss.number}`;
      fillSelects(); persistAndRender(); closePanel();
      toast(`Opened issue #${iss.number}`);
    });
  $('panelBody').querySelectorAll('[data-del]').forEach((b) =>
    b.onclick = async () => {
      if (!await confirmDialog('Delete this archived issue? This cannot be undone.', 'Delete')) return;
      await store.issues.remove(+b.dataset.del);
      renderArchivePanel($('arcSearch').value);
    });
}

// ---- Actions ------------------------------------------------------------

async function copyOut(kind) {
  // 'md' copies raw Markdown source (for Ghost Markdown cards, etc.)
  if (kind === 'md') {
    const md = $('md').value;
    try { await navigator.clipboard.writeText(md); }
    catch { const ta = document.createElement('textarea'); ta.value = md; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    toast('Markdown copied');
    return;
  }
  const out = renderPreview();
  if (!out) return;
  const payload = kind === 'text' ? out.text : out.html;
  try {
    await navigator.clipboard.writeText(payload);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = payload; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
  const saved = await saveIssue(out);
  toast(`${kind === 'text' ? 'Plain text' : 'HTML'} copied · saved as issue #${saved.number}`);
}

async function saveIssue(out) {
  const s = stats($('md').value);
  const rec = await store.issues.save({
    number: S.issueNumber || undefined,
    name: $('issueName').value.trim() || 'Untitled',
    subject: $('subjectLine').value.trim(),
    md: $('md').value,
    html: out.html,
    text: out.text,
    words: s.words,
    minutes: s.minutes,
    brandId: S.brandId,
    template: S.template,
  });
  S.issueNumber = rec.number;
  $('issueNo').textContent = `#${rec.number}`;
  return rec;
}

function confirmDialog(msg, okLabel = 'Continue') {
  return new Promise((resolve) => {
    $('confirmMsg').textContent = msg;
    $('confirmOk').textContent = okLabel;
    $('confirmOverlay').hidden = false;
    $('confirmOk').focus();
    const done = (result) => {
      $('confirmOverlay').hidden = true;
      off();
      resolve(result);
    };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    const off = () => {
      $('confirmOk').onclick = null;
      $('confirmCancel').onclick = null;
      $('confirmOverlay').onclick = null;
      document.removeEventListener('keydown', onKey);
    };
    $('confirmOk').onclick = () => done(true);
    $('confirmCancel').onclick = () => done(false);
    $('confirmOverlay').onclick = (e) => { if (e.target === $('confirmOverlay')) done(false); };
    document.addEventListener('keydown', onKey);
  });
}

async function newIssue() {
  if ($('md').value.trim() && !await confirmDialog('Start a new issue? Your current draft is only in the archive if you copied it.', 'New issue')) return;
  $('md').value = '';
  $('issueName').value = '';
  $('subjectLine').value = '';
  updateSubjectCount();
  S.issueNumber = null;
  $('issueNo').textContent = '';
  persistAndRender();
}

function exportMd() {
  const name = ($('issueName').value.trim() || 'pressdown-issue').replace(/[^\w-]+/g, '-');
  const subject = $('subjectLine').value.trim();
  const content = subject ? `Subject: ${subject}\n\n${$('md').value}` : $('md').value;
  const blob = new Blob([content], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function setChrome(mode) {
  // mode: '' = brand theme (default), 'bw' = black-and-white alternate.
  if (mode === 'bw') document.documentElement.setAttribute('data-chrome', 'bw');
  else document.documentElement.removeAttribute('data-chrome');
  try { localStorage.setItem('pressdown_chrome', mode); } catch {}
  reflectChrome();
}
function reflectChrome() {
  const bw = document.documentElement.getAttribute('data-chrome') === 'bw';
  $('themeBw').classList.toggle('on', bw);
  $('themeBrand').classList.toggle('on', !bw);
}

// ---- Persistence + helpers ----------------------------------------------

function persistAndRender() {
  renderStats();
  renderPreview();
  store.saveSettings({
    defaultTemplate: S.template,
    draft: {
      md: $('md').value, brandId: S.brandId,
      template: S.template, platform: S.platform,
      name: $('issueName').value, subject: $('subjectLine').value,
      number: S.issueNumber,
    },
  });
}

async function reloadBrands() {
  S.brands = await store.brands.all();
  S.settings = await store.loadSettings();
}
async function reloadBlocks() {
  S.blocks = await store.blocks.all();
  updateBlockHint();
}

function updateBlockHint() {
  const el = $('blockHint');
  if (!el) return;
  if (!S.blocks.length) {
    el.innerHTML = `<button class="linklike" data-open="blocks">Save a block</button> · then type <kbd>/</kbd> to insert`;
  } else {
    const n = S.blocks.length;
    el.innerHTML = `type <kbd>/</kbd> · <button class="linklike" data-open="blocks">${n} block${n !== 1 ? 's' : ''} saved</button>`;
  }
  el.querySelectorAll('[data-open]').forEach((btn) => {
    btn.onclick = () => openPanel(btn.dataset.open);
  });
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.classList.remove('show'); t.hidden = true; }, 2400);
}

const escapeHtml = (s = '') => s.replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escapeAttr = (s = '') => escapeHtml(s);

// ---- Find & Replace -----------------------------------------------------

let fnrMatches = [];
let fnrIdx = 0;

function fnrRun(query) {
  fnrMatches = [];
  if (!query) { $('fnrCount').textContent = ''; return; }
  const text = $('md').value;
  const qLow = query.toLowerCase();
  const tLow = text.toLowerCase();
  let i = 0;
  while (i <= text.length - query.length) {
    const pos = tLow.indexOf(qLow, i);
    if (pos === -1) break;
    fnrMatches.push(pos);
    i = pos + 1;
  }
  $('fnrCount').textContent = fnrMatches.length
    ? `${Math.min(fnrIdx + 1, fnrMatches.length)}/${fnrMatches.length}`
    : 'no results';
}

function fnrGoto(idx) {
  if (!fnrMatches.length) return;
  fnrIdx = ((idx % fnrMatches.length) + fnrMatches.length) % fnrMatches.length;
  const ta = $('md');
  ta.setSelectionRange(fnrMatches[fnrIdx], fnrMatches[fnrIdx] + $('fnrFind').value.length);
  $('fnrCount').textContent = `${fnrIdx + 1}/${fnrMatches.length}`;
}

function bindFnr() {
  const fnr = $('fnr');
  const findIn = $('fnrFind');
  const replIn = $('fnrReplace');

  function toggleFnr() {
    fnr.hidden = !fnr.hidden;
    $('fnrBtn').classList.toggle('on', !fnr.hidden);
    if (!fnr.hidden) setTimeout(() => { findIn.focus(); findIn.select(); }, 0);
  }

  $('fnrBtn').addEventListener('click', toggleFnr);

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.metaKey && e.key === 'h') { e.preventDefault(); toggleFnr(); }
    if (e.key === 'Escape' && !fnr.hidden) { fnr.hidden = true; $('fnrBtn').classList.remove('on'); $('md').focus(); }
    if (e.key === 'Escape' && !$('cheatSheet').hidden) $('cheatSheet').hidden = true;
  });

  findIn.addEventListener('input', () => { fnrIdx = 0; fnrRun(findIn.value); if (fnrMatches.length) fnrGoto(0); });
  findIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fnrGoto(e.shiftKey ? fnrIdx - 1 : fnrIdx + 1); }
  });
  replIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('fnrRepl').click(); }
  });

  $('fnrPrev').onclick = () => { fnrGoto(fnrIdx - 1); findIn.focus(); };
  $('fnrNext').onclick = () => { fnrGoto(fnrIdx + 1); findIn.focus(); };
  $('fnrClose').onclick = () => { fnr.hidden = true; $('fnrBtn').classList.remove('on'); $('md').focus(); };

  $('fnrRepl').onclick = () => {
    if (!fnrMatches.length) return;
    const q = findIn.value;
    const ta = $('md');
    const pos = fnrMatches[fnrIdx];
    ta.value = ta.value.slice(0, pos) + replIn.value + ta.value.slice(pos + q.length);
    onInput();
    fnrRun(q);
    fnrGoto(fnrIdx < fnrMatches.length ? fnrIdx : Math.max(0, fnrIdx - 1));
    findIn.focus();
  };

  $('fnrReplAll').onclick = () => {
    const q = findIn.value;
    if (!q || !fnrMatches.length) return;
    const count = fnrMatches.length;
    const ta = $('md');
    let result = '';
    let last = 0;
    fnrMatches.forEach((pos) => {
      result += ta.value.slice(last, pos) + replIn.value;
      last = pos + q.length;
    });
    result += ta.value.slice(last);
    ta.value = result;
    fnrIdx = 0;
    onInput();
    fnrRun(q);
    toast(`Replaced ${count} occurrence${count !== 1 ? 's' : ''}`);
  };
}

// ---- Image drag-and-drop + file picker ----------------------------------

const IMG_WARN_BYTES  = 100 * 1024;  // 100 KB — warn above this
const IMG_BLOCK_BYTES = 600 * 1024;  // 600 KB — refuse above this

function insertImageFile(file) {
  const kb = Math.round(file.size / 1024);
  if (file.size > IMG_BLOCK_BYTES) {
    toast(`${file.name} is ${kb} KB — too large to inline. Host it and paste the URL.`);
    return;
  }
  const rd = new FileReader();
  rd.onload = () => {
    const name = file.name.replace(/\.[^.]+$/, '');
    insertAtCursor(`![${name}](${rd.result})\n`);
    if (file.size > IMG_WARN_BYTES) {
      toast(`${kb} KB image inserted for preview. Outlook blocks large inline images — host it and replace with a URL before sending.`);
    } else {
      toast('Image inserted. Replace with a hosted URL before sending.');
    }
  };
  rd.readAsDataURL(file);
}

function bindImageDrop() {
  const ta = $('md');
  ta.addEventListener('dragover', (e) => {
    if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); ta.classList.add('drag-over'); }
  });
  ta.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget || !ta.contains(e.relatedTarget)) ta.classList.remove('drag-over');
  });
  ta.addEventListener('drop', (e) => {
    ta.classList.remove('drag-over');
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    files.forEach(insertImageFile);
  });

  $('imgPicker').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) insertImageFile(f);
    e.target.value = '';
  });
}

// ---- Scroll sync --------------------------------------------------------

function bindScrollSync() {
  const ta = $('md');
  ta.addEventListener('scroll', () => {
    const max = ta.scrollHeight - ta.clientHeight;
    if (max <= 0) return;
    const pct = ta.scrollTop / max;
    try {
      const doc = $('preview').contentDocument;
      const root = doc.documentElement;
      const imax = root.scrollHeight - $('preview').clientHeight;
      if (imax > 0) root.scrollTop = pct * imax;
    } catch {}
  });
}

// ---- Splitter -----------------------------------------------------------

function bindSplitter() {
  const sp = $('splitter'), ws = $('workspace');
  let drag = false;
  sp.addEventListener('mousedown', () => { drag = true; document.body.style.userSelect = 'none'; });
  window.addEventListener('mouseup', () => { drag = false; document.body.style.userSelect = ''; });
  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const r = ws.getBoundingClientRect();
    const pct = Math.min(80, Math.max(20, ((e.clientX - r.left) / r.width) * 100));
    ws.style.gridTemplateColumns = `${pct}% 6px 1fr`;
  });
}

// ---- Collaboration (WebRTC, main thread) --------------------------------
// The RTCPeerConnection lives on the page itself. It used to run inside a
// SharedWorker (to survive reloads), but RTCPeerConnection is not exposed in
// SharedWorkers in ANY browser — Chrome only allows it in dedicated workers,
// Firefox/Safari not in workers at all. Main thread is the only portable home.
// Tradeoff: a page reload drops the session and the handshake must be redone.

const COLLAB_ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

let pc = null;
let channel = null;
let collabConnected = false;
let collabRole     = null;   // 'host' | 'guest'
let applyingRemote = false;

function waitIce(peer) {
  return new Promise((res) => {
    if (peer.iceGatheringState === 'complete') { res(); return; }
    peer.onicegatheringstatechange = () => { if (peer.iceGatheringState === 'complete') res(); };
    setTimeout(res, 8000); // safety valve
  });
}

// Only emit 'disconnected' when there was an actual connection to tear down —
// createOffer/applyOffer call teardown() first for a clean slate, and that
// must not reset the panel mid-handshake.
function collabTeardown() {
  const had = !!(pc || channel);
  try { channel && channel.close(); } catch {}
  try { pc && pc.close(); }           catch {}
  pc = null; channel = null; collabRole = null; collabConnected = false;
  if (had) collabEmit({ type: 'disconnected' });
}

async function createOffer() {
  if (typeof RTCPeerConnection === 'undefined') { collabEmit({ type: 'no-webrtc' }); return; }
  collabTeardown();
  try {
    collabRole = 'host';
    pc = new RTCPeerConnection({ iceServers: COLLAB_ICE });
    channel = pc.createDataChannel('pd', { ordered: true });
    wireChannel(); wirePeer();
    await pc.setLocalDescription(await pc.createOffer());
    await waitIce(pc);
    collabEmit({ type: 'offer-ready', sdp: JSON.stringify(pc.localDescription) });
  } catch (err) {
    collabTeardown();
    collabEmit({ type: 'error', msg: String(err.message || err) });
  }
}

async function applyOffer(sdpJson) {
  if (typeof RTCPeerConnection === 'undefined') { collabEmit({ type: 'no-webrtc' }); return; }
  collabTeardown();
  try {
    collabRole = 'guest';
    pc = new RTCPeerConnection({ iceServers: COLLAB_ICE });
    wirePeer();
    pc.ondatachannel = (e) => { channel = e.channel; wireChannel(); };
    await pc.setRemoteDescription(JSON.parse(sdpJson));
    await pc.setLocalDescription(await pc.createAnswer());
    await waitIce(pc);
    collabEmit({ type: 'answer-ready', sdp: JSON.stringify(pc.localDescription) });
  } catch (err) {
    collabTeardown();
    collabEmit({ type: 'error', msg: String(err.message || err) });
  }
}

async function applyAnswer(sdpJson) {
  if (!pc) return;
  try { await pc.setRemoteDescription(JSON.parse(sdpJson)); }
  catch (err) { collabEmit({ type: 'error', msg: String(err.message || err) }); }
}

function relay(data) {
  if (channel && channel.readyState === 'open') {
    try { channel.send(JSON.stringify(data)); } catch {}
  }
}

function wireChannel() {
  channel.onopen  = () => collabEmit({ type: 'connected', role: collabRole });
  channel.onclose = () => collabEmit({ type: 'disconnected' });
  channel.onerror = () => collabEmit({ type: 'disconnected' });
  channel.onmessage = (e) => {
    try { collabEmit({ type: 'message', data: JSON.parse(e.data) }); } catch {}
  };
}

function wirePeer() {
  pc.onconnectionstatechange = () => {
    if (!pc) return;
    collabEmit({ type: 'state', connectionState: pc.connectionState, role: collabRole });
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      collabEmit({ type: 'disconnected' });
    }
  };
}

function collabEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function collabDecode(b64) {
  try {
    let s = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch { return null; }
}

function collabSend(data) {
  if (collabConnected) relay(data);
}

function syncToCollaborator() {
  if (!collabConnected || applyingRemote) return;
  collabSend({ type: 'update', md: $('md').value });
}

function handleCollabMessage(msg) {
  if (msg.type === 'update') {
    const ta = $('md');
    if (ta.value === msg.md) return;
    applyingRemote = true;
    const [s, e] = [ta.selectionStart, ta.selectionEnd];
    ta.value = msg.md;
    ta.setSelectionRange(s, e);
    applyingRemote = false;
    renderStats();
    liveRender();
  } else if (msg.type === 'permission') {
    $('md').readOnly = !msg.canEdit;
    toast(msg.canEdit ? 'You can now edit' : 'Switched to view only');
    refreshCollabStatus();
  }
}

function refreshCollabStatus() {
  const el = $('collabStatus');
  if (!collabConnected) { el.hidden = true; return; }
  el.hidden = false;
  const readOnly = $('md').readOnly;
  el.textContent = collabRole === 'host'
    ? '● 1 editor connected'
    : readOnly ? '● Live — view only' : '● Live — editing';
  el.title = 'Direct peer-to-peer session — no server sees your content';
}

function openCollabPanel() {
  $('panelTitle').textContent = 'Invite an editor';
  $('panelWrap').hidden = false;
  renderCollabPanelBody(collabConnected ? 'connected' : 'init');
}

// Paste-anywhere listener active while host is waiting for the answer back.
let collabPasteHandler = null;
function clearCollabPasteHandler() {
  if (collabPasteHandler) { document.removeEventListener('paste', collabPasteHandler); collabPasteHandler = null; }
}

function applyAnswerSdp(raw) {
  const m = raw.match(/#collab=answer:([A-Za-z0-9+/=_-]+)/);
  if (!m) return false;
  const decoded = collabDecode(m[1]);
  if (!decoded) return false;
  clearCollabPasteHandler();
  applyAnswer(decoded);
  const body = $('panelBody');
  if (body) body.innerHTML = '<p class="panel-lead">Connecting…</p>';
  return true;
}

function renderCollabPanelBody(state, sdp) {
  clearCollabPasteHandler();
  const body = $('panelBody');

  if (state === 'init') {
    body.innerHTML = `
      <p class="panel-lead">Invite a co-editor into this issue. One link each — then every keystroke goes directly between your browsers with no server in between.</p>
      <button id="startSession" class="btn btn-primary wide" type="button">Generate invite link</button>`;
    $('startSession').onclick = () => {
      body.innerHTML = '<p class="panel-lead" style="color:var(--muted)">Generating…</p>';
      createOffer();
    };

  } else if (state === 'offer') {
    // SYN — auto-copy the invite link immediately
    const inviteUrl = location.href.split('#')[0] + '#collab=offer:' + collabEncode(sdp);
    navigator.clipboard.writeText(inviteUrl).catch(() => {});
    body.innerHTML = `
      <p class="panel-lead"><strong>Step 1 — Send this link</strong><br>Copied to clipboard. Send it to your collaborator however you like.</p>
      <div class="collab-url-row">
        <input class="collab-url-input" value="${escapeAttr(inviteUrl)}" readonly>
        <button class="btn btn-ghost" id="copyInvite" type="button">Copy again</button>
      </div>
      <p class="panel-lead" style="margin-top:20px;color:var(--muted)"><strong>Step 2 — Wait, then paste</strong><br>They'll send you a reply link. Just paste it anywhere in the app — no button needed.</p>
      <p class="panel-lead" style="color:var(--muted);font-size:12px">WebRTC peer-to-peer · Google STUN for handshake only · no content ever leaves your browser</p>`;
    $('copyInvite').onclick = () => {
      navigator.clipboard.writeText(inviteUrl).catch(() => {});
      toast('Invite link copied');
    };
    // SYN-ACK — detect the answer anywhere the user pastes in the app
    collabPasteHandler = (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (applyAnswerSdp(text)) e.preventDefault();
    };
    document.addEventListener('paste', collabPasteHandler);

  } else if (state === 'answer') {
    // SYN-ACK — auto-copy the answer link immediately
    const answerUrl = location.href.split('#')[0] + '#collab=answer:' + collabEncode(sdp);
    navigator.clipboard.writeText(answerUrl).catch(() => {});
    body.innerHTML = `
      <p class="panel-lead"><strong>Answer copied!</strong><br>Send this reply link back to the person who invited you. Once they receive it the session will connect automatically.</p>
      <div class="collab-url-row">
        <input class="collab-url-input" value="${escapeAttr(answerUrl)}" readonly>
        <button class="btn btn-ghost" id="copyAnswer" type="button">Copy again</button>
      </div>
      <p class="panel-lead collab-waiting" style="color:var(--muted)">Waiting for host…</p>`;
    $('copyAnswer').onclick = () => {
      navigator.clipboard.writeText(answerUrl).catch(() => {});
      toast('Answer link copied');
    };

  } else if (state === 'connected') {
    const isHost = collabRole === 'host';
    let guestCanEdit = false;
    body.innerHTML = `
      <p class="panel-lead" style="color:var(--accent);font-weight:600">● Live session active</p>
      ${isHost ? `
        <div class="collab-perm-row">
          <span>Collaborator editing</span>
          <button id="toggleEdit" class="btn btn-ghost" type="button">View only</button>
        </div>` : `
        <p class="panel-lead">You are ${$('md').readOnly ? 'viewing' : 'editing'}. The host controls permissions.</p>`}
      <p class="panel-lead" style="margin-top:14px;color:var(--muted);font-size:12px">Keep this tab open. If either of you refreshes or closes the window the session ends and you'll need to swap links again.</p>
      <button id="endSession" class="btn btn-ghost wide" type="button" style="margin-top:10px">End session</button>`;
    if (isHost) {
      const btn = $('toggleEdit');
      btn.onclick = () => {
        guestCanEdit = !guestCanEdit;
        btn.textContent  = guestCanEdit ? 'Can edit' : 'View only';
        btn.classList.toggle('btn-primary', guestCanEdit);
        btn.classList.toggle('btn-ghost', !guestCanEdit);
        collabSend({ type: 'permission', canEdit: guestCanEdit });
        toast(`Collaborator can now ${guestCanEdit ? 'edit' : 'only view'}`);
      };
    }
    $('endSession').onclick = () => {
      collabTeardown();
      closePanel();
    };
  }
}

// The WebRTC engine calls this instead of broadcasting from a worker port.
// Same message shapes as before so the UI layer is unchanged.
function collabEmit(msg) {
  const panelOpen = !$('panelWrap').hidden && $('panelTitle').textContent === 'Invite an editor';
  switch (msg.type) {
    case 'state':
      if (msg.connectionState === 'connected') {
        collabConnected = true;
        collabRole = msg.role;
        refreshCollabStatus();
      }
      break;
    case 'offer-ready':
      if (!panelOpen) openCollabPanel();
      renderCollabPanelBody('offer', msg.sdp);
      break;
    case 'answer-ready':
      if (!panelOpen) openCollabPanel();
      renderCollabPanelBody('answer', msg.sdp);
      break;
    case 'connected':
      collabConnected = true;
      collabRole = msg.role;
      if (collabRole === 'guest') $('md').readOnly = true;
      $('collabBanner').hidden = true;
      refreshCollabStatus();
      toast(collabRole === 'host' ? 'Collaborator joined!' : 'Connected to session');
      if (panelOpen) renderCollabPanelBody('connected');
      break;
    case 'disconnected':
      collabConnected = false;
      collabRole = null;
      $('md').readOnly = false;
      refreshCollabStatus();
      if (panelOpen) renderCollabPanelBody('init');
      break;
    case 'message':
      handleCollabMessage(msg.data);
      break;
    case 'no-webrtc':
      if (panelOpen) {
        $('panelBody').innerHTML = `
          <p class="panel-lead">Live collaboration isn't available in this browser.</p>
          <p class="panel-lead" style="color:var(--muted);font-size:13px;">This browser doesn't support WebRTC. Try a current version of Chrome, Firefox, Safari or Edge.</p>`;
      }
      break;
    case 'error':
      toast(`Session error: ${msg.msg}`);
      if (panelOpen) renderCollabPanelBody('init');
      break;
  }
}

function initCollab() {
  // The peer connection lives on this page — reload/close kills it. Warn the
  // user before they lose an active session by accident.
  window.addEventListener('beforeunload', (e) => {
    if (!collabConnected) return;
    e.preventDefault();
    e.returnValue = '';
  });

  // Handle an incoming collab URL (offer link → guest, answer link → host).
  const hash = location.hash;
  if (hash.startsWith('#collab=')) {
    const payload = hash.slice(8);
    history.replaceState(null, '', location.pathname + location.search);

    if (payload.startsWith('offer:')) {
      const sdp = collabDecode(payload.slice(6));
      if (sdp) {
        $('collabBanner').hidden = false;
        $('collabJoin').onclick = () => {
          $('collabBannerMsg').textContent = 'Joining session…';
          $('collabJoin').disabled = true;
          applyOffer(sdp);
        };
        $('collabDismiss').onclick = () => { $('collabBanner').hidden = true; };
      }
    } else if (payload.startsWith('answer:')) {
      const sdp = collabDecode(payload.slice(7));
      if (sdp) {
        applyAnswer(sdp);
        toast('Connecting to collaborator…');
      }
    }
  }
}

// ---- Boot ---------------------------------------------------------------

async function boot() {
  S.settings = await store.loadSettings();
  S.brands = await store.brands.all();
  S.blocks = await store.blocks.all();

  // First run: seed a default brand + a couple of starter blocks so the
  // tool shows itself working immediately.
  if (!S.brands.length) {
    await store.brands.save({ ...SEED_BRAND });
    await store.blocks.save({ name: 'Sponsor slot', slash: 'sponsor',
      md: '\n\n---\n\n**Today’s sponsor:** [Acme](https://example.com) — one line about what they do.\n\n---\n\n' });
    await store.blocks.save({ name: 'Sign-off', slash: 'ps',
      md: '\n\n_P.S. — Forward this to one person who would like it._\n' });
    S.brands = await store.brands.all();
    S.blocks = await store.blocks.all();
    await store.saveSettings({ defaultBrandId: S.brands[0].id });
    S.settings = await store.loadSettings();
  }

  const d = S.settings.draft || {};
  S.brandId = (d.brandId && S.brands.some((b) => b.id === d.brandId))
    ? d.brandId
    : (S.settings.defaultBrandId || (S.brands[0] && S.brands[0].id));
  S.template = TEMPLATES[d.template] ? d.template : (S.settings.defaultTemplate || 'single');
  S.platform = d.platform || 'generic';
  S.issueNumber = d.number || null;
  S.device = S.settings.device || 'desktop';
  S.dark = !!S.settings.dark;

  $('md').value = d.md || SEED_MD;
  $('issueName').value = d.name || '';
  $('subjectLine').value = d.subject || '';
  if (S.issueNumber) $('issueNo').textContent = `#${S.issueNumber}`;
  updateSubjectCount();
  updateBlockHint();
  applyDevice();
  $('darkBtn').classList.toggle('on', S.dark);

  fillSelects();
  updatePlatformNote();
  renderStats();
  renderPreview();

  // Events
  $('md').addEventListener('input', onInput);
  $('issueName').addEventListener('input', () => {
    $('issueName').classList.remove('needs-name');
    persistDraft();
  });
  $('subjectLine').addEventListener('input', () => { updateSubjectCount(); persistDraft(); });
  $('cheatBtn').addEventListener('click', () => { $('cheatSheet').hidden = !$('cheatSheet').hidden; });
  $('cheatClose').addEventListener('click', () => { $('cheatSheet').hidden = true; });
  $('platformSel').addEventListener('change', (e) => { S.platform = e.target.value; updatePlatformNote(); persistAndRender(); });
  $('brandSel').addEventListener('change', (e) => { S.brandId = +e.target.value; persistAndRender(); });
  $('tplSel').addEventListener('change', (e) => { S.template = e.target.value; persistAndRender(); });
  $('copyHtml').addEventListener('click', () => copyOut('html'));

  $('devDesktop').addEventListener('click', () => setDevice('desktop'));
  $('devMobile').addEventListener('click', () => setDevice('mobile'));
  $('darkBtn').addEventListener('click', () => {
    S.dark = !S.dark;
    $('darkBtn').classList.toggle('on', S.dark);
    store.saveSettings({ dark: S.dark });
    renderPreview();
  });

  $('menuBtn').addEventListener('click', () =>
    $('menuPop').hidden = !$('menuPop').hidden);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu')) $('menuPop').hidden = true;
  });
  $('menuPop').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    $('menuPop').hidden = true;
    if (a === 'brands' || a === 'blocks' || a === 'archive') openPanel(a);
    else if (a === 'collab') openCollabPanel();
    else if (a === 'new') newIssue();
    else if (a === 'copytext') copyOut('text');
    else if (a === 'copymd') copyOut('md');
    else if (a === 'export') exportMd();
  });

  $('themeBrand').addEventListener('click', () => setChrome(''));
  $('themeBw').addEventListener('click', () => setChrome('bw'));
  reflectChrome();

  $('panelClose').addEventListener('click', closePanel);
  $('panelScrim').addEventListener('click', closePanel);

  bindToolbar();
  bindSlash();
  bindSplitter();
  bindFnr();
  bindImageDrop();
  bindScrollSync();
  initCollab();
}

function setDevice(d) {
  S.device = d;
  store.saveSettings({ device: d });
  applyDevice();
}
function applyDevice() {
  $('devDesktop').classList.toggle('on', S.device === 'desktop');
  $('devMobile').classList.toggle('on', S.device === 'mobile');
  $('pvStage').classList.toggle('mobile', S.device === 'mobile');
}

boot();
