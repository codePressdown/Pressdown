// compiler.js — the moat. Six stages turn Markdown into email-safe HTML.
//
//   1 parse      Markdown -> HTML via a custom renderer that inlines every
//                style (clients strip <style>, so nothing may rely on it)
//   2 slot       parsed body is dropped into the chosen template scaffold
//   3 brand      brand tokens ({{ACCENT}} ...) are interpolated
//   4 inline     a final inliner pass folds the scaffold's helper classes
//   5 sanitize   comments stripped, whitespace squeezed, 102KB guard
//   6 output     { html, text, bytes, clipped }
//
// `marked` is loaded as a global by a plain <script> in index.html so this
// stays a dependency-free ES module that runs offline.

import { buildScaffold } from './templates.js';

export const FONT_STACKS = {
  sans: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  serif: "Georgia,'Times New Roman',Times,serif",
  mono: "'SF Mono',SFMono-Regular,ui-monospace,Menlo,Consolas,monospace",
};

const GMAIL_CLIP = 102 * 1024; // 102KB — Gmail clips past this

function esc(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- Alert / callout boxes (> [!NOTE], > [!TIP], etc.) -----------------
// Detected inside the blockquote renderer; platform-aware output.

const ALERT_TYPES = {
  NOTE:      { label: 'Note',      color: '#3C6E9F', bg: '#e7edf3' },
  TIP:       { label: 'Tip',       color: '#3FA15B', bg: '#e8f5ec' },
  IMPORTANT: { label: 'Important', color: '#7c3aed', bg: '#f0ebff' },
  WARNING:   { label: 'Warning',   color: '#d97706', bg: '#fef3c7' },
  CAUTION:   { label: 'Caution',   color: '#b5402f', bg: '#fdecea' },
};

function alertHtml(type, body, richEditor) {
  const cfg = ALERT_TYPES[type] || ALERT_TYPES.NOTE;
  const label = `<p style="margin:0 0 8px;font-weight:700;font-size:12px;color:${cfg.color};text-transform:uppercase;letter-spacing:.06em;">${cfg.label}</p>`;
  if (richEditor) {
    return `<div style="border-left:4px solid ${cfg.color};background:${cfg.bg};padding:12px 16px;margin:0 0 20px;border-radius:0 6px 6px 0;">${label}${body}</div>`;
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td style="background:${cfg.bg};border-left:4px solid ${cfg.color};border-radius:0 6px 6px 0;padding:12px 16px;">${label}${body}</td></tr></table>`;
}

// ---- Footnotes: [^id] inline refs + [^id]: definition lines ------------
// Definitions are stripped before marked sees them (avoids link-ref
// ambiguity). Refs are replaced with inline <sup> HTML that marked
// passes through. The footnote list is appended as raw HTML after parse.

function processFootnotes(md) {
  const defs = {};
  const order = [];

  const clean = md.replace(/^\[\^([^\]]+)\]:\s*(.+)$/gm, (_, id, text) => {
    defs[id.trim()] = text.trim();
    return '';
  });

  const processed = clean.replace(/\[\^([^\]]+)\]/g, (_, id) => {
    const key = id.trim();
    if (!order.includes(key)) order.push(key);
    const n = order.indexOf(key) + 1;
    return `<sup style="font-size:.75em;line-height:1;vertical-align:super;">${n}</sup>`;
  });

  let fnHtml = '';
  if (order.length > 0) {
    const rows = order.map((id, i) => {
      const text = defs[id] || id;
      return `<tr><td style="padding:2px 4px 2px 0;font-size:12px;color:#8a8f98;vertical-align:top;white-space:nowrap;">${i + 1}.</td><td style="padding:2px 0 2px 8px;font-size:12px;color:#8a8f98;line-height:1.5;">${text}</td></tr>`;
    }).join('');
    fnHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;"><tr><td style="border-top:1px solid #e6e6e2;padding-top:14px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`;
  }

  return { md: processed.replace(/\n{3,}/g, '\n\n').trim(), fnHtml };
}

// ---- Stage 1: custom email-safe renderer --------------------------------
//
// Platform is passed in so element-level decisions (blockquote as <table>
// vs <blockquote>, code as table vs <pre><code>, hr as table vs <hr>) are
// made per element, per platform — not patched with post-hoc regex.
// Rich-editor platforms (Substack, Beehiiv, Ghost) normalise pasted HTML
// through their own email renderer, so they want semantic tags.
// Email-HTML platforms (Generic, ConvertKit, Mailchimp) need table-based
// layout with every style inlined.

function renderer(brand, platform = 'generic') {
  const A = brand.accent;
  const r = new marked.Renderer();

  // Rich-editor platforms: the host normalises HTML; semantic tags survive.
  const richEditor = platform === 'substack' || platform === 'beehiiv' || platform === 'ghost';

  r.heading = (text, level) => {
    if (level === 1) {
      return `<h1 class="pd-h1" style="margin:0 0 14px;font-size:30px;line-height:1.25;font-weight:700;letter-spacing:-.02em;color:inherit;font-family:Georgia,'Times New Roman',Times,serif;">${text}</h1>`;
    }
    if (level === 2) {
      return `<h2 class="pd-h2" style="margin:28px 0 10px;font-size:21px;line-height:1.3;font-weight:700;letter-spacing:-.01em;color:inherit;">${text}</h2>`;
    }
    const size = { 3: 17, 4: 15, 5: 14, 6: 13 }[level] || 16;
    return `<h${level} style="margin:24px 0 8px;font-size:${size}px;line-height:1.3;font-weight:700;color:inherit;">${text}</h${level}>`;
  };

  r.paragraph = (text) => {
    if (!text || !text.trim()) return '';
    return `<p style="margin:0 0 18px;font-size:inherit;line-height:inherit;color:inherit;">${text}</p>`;
  };

  r.link = (href, title, text) =>
    `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''} class="pd-link" style="color:${A};text-decoration:none;border-bottom:1.5px solid ${A};">${text}</a>`;

  r.image = (href, title, text) => {
    // Skip the toolbar placeholder (bare protocol) and empty srcs — broken
    // images in email are worse than no image.
    if (!href || /^https?:\/\/?$/.test(href.trim())) return '';
    return `<img src="${esc(href)}" alt="${esc(text || '')}"${title ? ` title="${esc(title)}"` : ''} width="100%" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:6px;margin:8px 0 22px;">`;
  };

  r.strong = (t) => `<strong style="font-weight:700;">${t}</strong>`;
  r.em = (t) => `<em style="font-style:italic;">${t}</em>`;
  r.del = (t) => `<span style="text-decoration:line-through;">${t}</span>`;

  r.blockquote = (q) => {
    // GitHub-style alert boxes: > [!NOTE], > [!TIP], etc.
    // Detected in the rendered HTML of the blockquote content — platform-aware output.
    const am = q.match(/^\s*<p[^>]*>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]<\/p>\s*/i);
    if (am) {
      const body = q.replace(/^\s*<p[^>]*>\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]<\/p>\s*/i, '');
      return alertHtml(am[1].toUpperCase(), body, richEditor);
    }
    // ConvertKit: inline-styled <blockquote> (email-safe without table wrapper)
    if (platform === 'convertkit') {
      return `<blockquote style="border-left:4px solid ${A};margin:0 0 20px;padding:8px 0 8px 16px;color:#55585f;font-style:italic;">${q}</blockquote>`;
    }
    // Substack/Beehiiv/Ghost: semantic <blockquote> (platform renders natively)
    if (richEditor) {
      return `<blockquote style="border-left:3px solid ${A};margin:0 0 20px;padding:4px 0 4px 20px;font-style:italic;color:#55585f;">${q}</blockquote>`;
    }
    // Default: table-based (email-safe for all clients)
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr>
<td class="pd-bq-txt" style="padding:4px 0 4px 20px;border-left:3px solid ${A};font-style:italic;color:#55585f;">${q}</td>
</tr></table>`;
  };

  r.hr = () => {
    // Rich-editor platforms: simple <hr> (editor normalises it)
    if (richEditor) {
      return `<hr style="border:none;border-top:1px solid #e6e6e2;margin:26px 0;">`;
    }
    // Default: table-based (email-safe)
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;"><tr><td style="border-top:1px solid #e6e6e2;font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
  };

  r.list = (body, ordered) => {
    const tag = ordered ? 'ol' : 'ul';
    return `<${tag} style="margin:0 0 18px;padding-left:22px;">${body}</${tag}>`;
  };
  r.listitem = (t) => `<li style="margin:0 0 8px;line-height:1.6;">${t}</li>`;

  r.code = (code) => {
    // Substack strips table structural padding from code blocks.
    // Use <pre><code> with explicit <br> line-breaks so whitespace survives.
    if (platform === 'substack') {
      const lines = esc(code).split('\n').join('<br>');
      return `<pre style="margin:0 0 20px;background:#f4f4f2;border-radius:6px;padding:16px 18px;overflow:auto;"><code style="font-family:${FONT_STACKS.mono};font-size:13px;line-height:1.5;color:#23262b;white-space:pre-wrap;">${lines}</code></pre>`;
    }
    // Beehiiv/Ghost: standard <pre><code> (editor handles it)
    if (richEditor) {
      return `<pre style="margin:0 0 20px;background:#f4f4f2;border-radius:6px;padding:16px 18px;overflow:auto;"><code style="font-family:${FONT_STACKS.mono};font-size:13px;line-height:1.5;color:#23262b;white-space:pre-wrap;">${esc(code)}</code></pre>`;
    }
    // Default: table-based (email-safe)
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td style="background:#f4f4f2;border-radius:6px;padding:16px 18px;font-family:${FONT_STACKS.mono};font-size:13px;line-height:1.5;color:#23262b;white-space:pre-wrap;word-break:break-word;">${esc(code)}</td></tr></table>`;
  };

  r.codespan = (t) =>
    `<code style="background:#f1f1ee;border-radius:4px;padding:2px 6px;font-family:${FONT_STACKS.mono};font-size:.92em;">${t}</code>`;

  r.table = (header, body) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border:1px solid #e6e6e2;border-radius:6px;border-collapse:separate;"><thead>${header}</thead><tbody>${body}</tbody></table>`;
  r.tablerow = (c) => `<tr>${c}</tr>`;
  r.tablecell = (c, f) => {
    const tag = f.header ? 'th' : 'td';
    const w = f.header
      ? 'font-weight:700;background:#faf9f6;'
      : 'border-top:1px solid #eee;';
    const align = f.align || 'left';
    return `<${tag} style="padding:10px 14px;text-align:${align};${w}font-size:14px;">${c}</${tag}>`;
  };

  return r;
}

// ---- Brand helpers ------------------------------------------------------

function logoHtml(brand) {
  if (brand.logo) {
    return `<img src="${esc(brand.logo)}" alt="${esc(brand.name)}" height="34" style="display:inline-block;height:34px;width:auto;border:0;">`;
  }
  return `<span style="font-family:Georgia,'Times New Roman',Times,serif;font-size:20px;font-weight:700;letter-spacing:-.02em;color:${brand.ink};">${esc(brand.name || 'Newsletter')}</span>`;
}

function footerHtml(brand) {
  const name = `<div class="pd-footer-name" style="font-family:Georgia,'Times New Roman',Times,serif;font-size:15px;font-weight:700;letter-spacing:-.01em;color:#4a4a42;margin:0 0 8px;">${esc(brand.name || 'Newsletter')}</div>`;
  const note = `<div class="pd-footer-txt" style="color:#8a8f98;margin:0 0 10px;">You&rsquo;re receiving this because you subscribed.</div>`;
  // Always render a real <a> tag — plain-text "Unsubscribe" violates CAN-SPAM.
  // If no URL is set, emit a recognisable template token that the sending
  // platform (or the user, in brand settings) can replace.
  const unsub = `<a href="${brand.unsubUrl ? esc(brand.unsubUrl) : '{{unsubscribe_url}}'}" class="pd-footer-txt" style="color:#8a8f98;text-decoration:underline;">Unsubscribe</a>`;
  const extraLinks = (brand.footerLinks || [])
    .filter((l) => l.label && l.url)
    .map((l) => `<a href="${esc(l.url)}" class="pd-footer-txt" style="color:#8a8f98;text-decoration:underline;">${esc(l.label)}</a>`);
  const linksRow = [unsub, ...extraLinks].join(' &nbsp;&middot;&nbsp; ');
  const addr = brand.address ? `<br><span class="pd-footer-txt" style="color:#8a8f98;">${esc(brand.address)}</span>` : '';
  return `${name}${note}${linksRow}${addr}`;
}

// ---- Plain-text generation (stage 6b) -----------------------------------
// Built from the Markdown source, not the HTML — a clean reading fallback,
// required by CAN-SPAM for every send.

export function toPlainText(md, brand) {
  let t = md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')                  // images
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')         // links
    .replace(/^#{1,6}\s*/gm, '')                             // headings
    .replace(/(\*\*|__)(.*?)\1/g, '$2')                      // bold
    .replace(/(\*|_)(.*?)\1/g, '$2')                         // italic
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')                   // code
    .replace(/^\s*[-*+]\s+/gm, '- ')                         // bullets
    .replace(/^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n?/gim, '') // alert markers
    .replace(/^\s*>\s?/gm, '')                               // quotes
    .replace(/^-{3,}$/gm, '----------')                      // rules
    .replace(/\[\^[^\]]+\]/g, '')                            // footnote refs
    .replace(/^\[\^[^\]]+\]:\s*/gm, '')                      // footnote defs
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const foot = (brand.footerLinks || [])
    .filter((l) => l.label && l.url)
    .map((l) => `${l.label}: ${l.url}`).join('\n');
  return `${t}\n\n----------\n${brand.name || ''}\n${foot}\nUnsubscribe: ${brand.unsubUrl || '[unsubscribe link]'}`.trim();
}

// ---- Platform registry --------------------------------------------------
// Each entry declares what the destination platform needs from the HTML.
// Transforms run after sanitize so they operate on the final string.

export const PLATFORMS = [
  { id: 'generic',    label: 'Generic (any platform)',  note: '' },
  { id: 'beehiiv',   label: 'Beehiiv',                 note: '' },
  { id: 'substack',  label: 'Substack',                note: 'Paste into the Substack editor. Images become placeholders and table borders are dropped — all other formatting is preserved.' },
  { id: 'convertkit',label: 'ConvertKit',              note: '' },
  { id: 'mailchimp', label: 'Mailchimp',               note: '' },
  { id: 'ghost',     label: 'Ghost',                   note: 'Ghost supports native Markdown cards — paste raw Markdown directly for a clean block, or use Copy HTML for a Ghost HTML card.' },
];

// Substack owns the container; pasting a full wrapper table fights its chrome.
// Strip font overrides (Substack resets them), background colors on the outer
// wrapper, hard max-width constraints, and link colors (Substack applies its
// own). Table borders are also dropped by Substack's HTML normalizer so we
// strip them here so the preview is honest about what will land.
function txSubstack(html) {
  return html
    .replace(/font-family:[^;'"<]{3,180}/g, `font-family:${FONT_STACKS.sans}`)
    .replace(/(<(?:body|table)\b[^>]*?style="[^"]*?)background(?:-color)?:\s*#[0-9a-f]{3,8}\s*;?/gi, '$1')
    .replace(/max-width:\s*\d+px/g, 'max-width:100%')
    // Substack overrides link colors with its own brand color
    .replace(/(<a\b[^>]*?style="[^"]*?)color:[^;'"<]+;?\s*/gi, '$1')
    // Substack drops table borders; strip from <table> so the preview is accurate
    .replace(/(<table\b[^>]*?style="[^"]*?)border(?:-[a-z]+)?:\s*[^;'"<]+;?\s*/gi, '$1')
    // Strip header-cell background (#faf9f6) — ignored by Substack
    .replace(/(<th\b[^>]*?style="[^"]*?)background(?:-color)?:[^;'"<]+;?\s*/gi, '$1')
    // Strip data-cell top border (separator lines Substack doesn't render)
    .replace(/(<td\b[^>]*?style="[^"]*?)border-top:[^;'"<]+;?\s*/gi, '$1');
}

// ConvertKit targets a conservative client set; cap border-radius so
// rounded elements don't break in older Outlook builds it serves.
function txConvertKit(html) {
  return html.replace(/border-radius:\s*(\d+)px/g, (_, n) => `border-radius:${Math.min(+n, 6)}px`);
}

// Mailchimp discards min-height attributes during its own HTML pass,
// which causes layout collapse; strip them pre-emptively.
function txMailchimp(html) {
  return html.replace(/min-height:\s*[\d.]+(?:px|em|rem);?\s*/g, '');
}

// Ghost's HTML card supports full email HTML. Add the color-scheme meta
// so Ghost's dark mode hint is honoured inside the card.
function txGhost(html) {
  return html.replace('</head>', '<meta name="color-scheme" content="light dark"></head>');
}

const PLATFORM_TX = {
  generic: null, beehiiv: null,
  substack: txSubstack, convertkit: txConvertKit,
  mailchimp: txMailchimp, ghost: txGhost,
};

// ---- Stages 4 + 5: inline leftover classes, sanitize --------------------

function sanitize(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')    // strip comments (clip risk)
    .replace(/[ \t]+/g, ' ')            // collapse same-line whitespace
    .replace(/\n{3,}/g, '\n\n')          // max two consecutive blank lines
    .trim();
}

// ---- Prettifier: adds newlines around block elements --------------------
// Runs after sanitize so the output humans copy is readable. Byte count is
// measured from the sanitized (smaller) version — the 102KB guard stays tight.

function prettify(html) {
  const B = 'table|thead|tbody|tr|td|th|p|h[1-6]|ul|ol|li|div|pre|blockquote|head|body|html|style|meta|link|title';
  return html
    .replace(new RegExp(`(<(?:${B})\\b)`, 'gi'), '\n$1')
    .replace(new RegExp(`</(${B})>`, 'gi'), '</$1>\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---- Public: full pipeline ---------------------------------------------

export function compile(md, brand, templateId, platform = 'generic') {
  // Pre-process: extract footnote defs, replace refs with <sup>, return fnHtml
  const { md: processedMd, fnHtml } = processFootnotes(md || '');

  // 1 parse — renderer is platform-aware; element-level decisions made here
  marked.setOptions({ gfm: true, breaks: false });
  const body = marked.parse(processedMd, { renderer: renderer(brand, platform) }) + fnHtml;

  // 2 slot
  let html = buildScaffold(templateId);

  // 3 brand inject
  const sponsorHtml = brand.sponsor
    ? marked.parse(brand.sponsor, { renderer: renderer(brand, platform) })
    : '';
  const map = {
    '{{CONTENT}}': body,
    '{{BRAND_NAME}}': esc(brand.name || 'Newsletter'),
    '{{LOGO}}': logoHtml(brand),
    '{{ACCENT}}': brand.accent,
    '{{INK}}': brand.ink,
    '{{FONT}}': FONT_STACKS[brand.font] || FONT_STACKS.sans,
    '{{FOOTER}}': footerHtml(brand),
    '{{PREHEADER}}': esc(brand.preheader || ''),
    '{{SPONSOR}}': sponsorHtml || 'Your sponsor copy goes here.',
  };
  for (const [k, v] of Object.entries(map)) html = html.split(k).join(v);

  // 4 + 5 inline + sanitize
  html = sanitize(html);

  // Add inline styles to bare <sub>/<sup> (email clients need them explicitly)
  html = html
    .replace(/<sub(?![^>]*style=)>/g, '<sub style="font-size:.75em;line-height:1;vertical-align:sub;">')
    .replace(/<sup(?![^>]*style=)>/g, '<sup style="font-size:.75em;line-height:1;vertical-align:super;">');

  // 6 platform transform
  const tx = PLATFORM_TX[platform];
  if (tx) html = tx(html);

  // 7 output — measure bytes before prettifying (tighter guard), return readable HTML
  const bytes = new Blob([html]).size;
  return {
    html: prettify(html),
    text: toPlainText(md || '', brand),
    bytes,
    clipped: bytes > GMAIL_CLIP,
    limit: GMAIL_CLIP,
  };
}
