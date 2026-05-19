// templates.js — the six built-in layouts.
//
// Every template is a pure function returning an email-safe HTML *document*
// built entirely from nested tables with inline styles. No <style> blocks for
// layout (Gmail strips them); the only <style> emitted is a dark-mode media
// query the clients that support it will honor and the rest ignore.
//
// Tokens left for the compiler's brand-inject stage:
//   {{CONTENT}} {{BRAND_NAME}} {{LOGO}} {{ACCENT}} {{INK}} {{FONT}}
//   {{FOOTER}} {{PREHEADER}}
//
// Switching templates is non-destructive — only this scaffold changes; the
// Markdown source is untouched.

// Preheader spacer: zero-width joiners + non-breaking spaces prevent the email
// client's preview snippet from bleeding into the newsletter body.
const PREHEADER_PAD = `&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;`;
const PREHEADER = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">{{PREHEADER}}${PREHEADER_PAD}</div>`;

// Outer shell shared by every template: bulletproof centered 600px column
// that degrades to full width on phones, with a dark-mode hint.
function shell(inner, { pad = '0' } = {}) {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{{BRAND_NAME}}</title>
<style>
  @media (prefers-color-scheme: dark){
    .pd-body{background:#111317!important}
    .pd-card{background:#1b1e24!important}
    .pd-ink{color:#e8e8ea!important}
    .pd-muted{color:#9aa0a6!important}
    .pd-rule{border-color:#2c3037!important}
    .pd-sponsor{background:#1e2028!important}
    .pd-sponsor-tag{color:#7a6c50!important}
    .pd-sponsor-txt{color:#b8b4ae!important}
    .pd-bq-txt{color:#9aa0a6!important}
    .pd-footer-rule{border-top-color:#2c3037!important}
    .pd-footer-name{color:#c8c4bc!important}
    .pd-footer-txt{color:#6b7280!important}
    .pd-link{color:#7ab0d4!important;border-bottom-color:#7ab0d4!important}
  }
  @media only screen and (max-width:620px){
    .pd-col{width:100%!important}
    .pd-pad{padding-left:22px!important;padding-right:22px!important}
    .pd-card-inner{padding:28px 22px!important}
    .pd-h1{font-size:24px!important}
    .pd-h2{font-size:18px!important}
  }
</style>
</head>
<body class="pd-body" style="margin:0;padding:0;background:#f0ede8;-webkit-text-size-adjust:100%;">
${PREHEADER}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0ede8;">
<tr><td align="center" style="padding:${pad === '0' ? '32px 12px' : pad};">
<table role="presentation" class="pd-col" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
${inner}
</table>
</td></tr></table>
</body></html>`;
}

const FONT = `font-family:{{FONT}};`;

// Branded logo/wordmark header used by most templates.
function header(align = 'left') {
  return `<tr><td class="pd-pad pd-masthead-td" style="padding:8px 36px 24px;text-align:${align};">{{LOGO}}</td></tr>`;
}

// Card that holds the article body.
function card(body, { radius = 8 } = {}) {
  return `<tr><td class="pd-pad" style="padding:0 36px;">
<table role="presentation" class="pd-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:${radius}px;box-shadow:0 2px 12px rgba(0,0,0,0.07),0 0 0 1px rgba(0,0,0,0.04);">
<tr><td class="pd-card-inner pd-ink" style="padding:44px 48px;${FONT}font-size:17px;line-height:1.8;color:#23262b;">
{{CONTENT}}
</td></tr>
</table>
</td></tr>`;
}

const FOOTER_ROW = `<tr><td class="pd-pad pd-footer-rule pd-muted" style="padding:28px 36px 32px;${FONT}font-size:13px;line-height:1.7;color:#8a8f98;text-align:center;border-top:1px solid #e0dbd4;">{{FOOTER}}</td></tr>`;

// ---- The six templates --------------------------------------------------

export const TEMPLATES = {
  single: {
    label: 'Clean single-column',
    hint: 'Wide content column, generous line height. Essays and thinkers.',
    build: () => shell(`${header()}${card('{{CONTENT}}')}${FOOTER_ROW}`),
  },

  hero: {
    label: 'Hero image drop',
    hint: 'Full-width header image, large headline. Product drops & launches.',
    build: () => shell(`
${header('center')}
<tr><td class="pd-pad" style="padding:0 36px 18px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{{ACCENT}};border-radius:8px;">
    <tr><td style="padding:54px 40px;${FONT}font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#ffffff;opacity:.85;">{{BRAND_NAME}}</td></tr>
  </table>
</td></tr>
${card('{{CONTENT}}')}${FOOTER_ROW}`),
  },

  digest: {
    label: 'Digest grid',
    hint: 'Link-forward layout for curators rounding up many sources.',
    build: () => shell(`
${header()}
<tr><td class="pd-pad" style="padding:0 36px;">
<table role="presentation" class="pd-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.07),0 0 0 1px rgba(0,0,0,0.04);">
<tr><td class="pd-card-inner pd-ink" style="padding:44px 48px;${FONT}font-size:17px;line-height:1.8;color:#23262b;border-top:3px solid {{ACCENT}};border-radius:8px;">
{{CONTENT}}
</td></tr></table>
</td></tr>${FOOTER_ROW}`),
  },

  letter: {
    label: 'Personal letter',
    hint: 'No logo, narrow column, serif option. Feels like a private email.',
    build: () => shell(`
<tr><td class="pd-pad pd-ink" style="padding:44px 44px 12px;${FONT}font-size:17px;line-height:1.8;color:#23262b;">
{{CONTENT}}
</td></tr>
<tr><td class="pd-pad pd-footer-rule pd-footer-txt" style="padding:24px 44px 36px;${FONT}font-size:13px;color:#8a8f98;border-top:1px solid #e0dbd4;">{{FOOTER}}</td></tr>`,
      { pad: '36px 12px' }),
  },

  sponsor: {
    label: 'Sponsor-first',
    hint: 'Prominent sponsor slot above the fold. Monetized newsletters.',
    build: () => shell(`
${header()}
<tr><td class="pd-pad" style="padding:0 36px 16px;">
  <table role="presentation" class="pd-sponsor" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fbf7ec;border-radius:8px;">
    <tr>
      <td width="4" style="background:{{ACCENT}};border-radius:8px 0 0 8px;font-size:0;line-height:0;">&nbsp;</td>
      <td class="pd-sponsor-txt" style="padding:14px 20px 16px;${FONT}font-size:15px;line-height:1.6;color:#5c4a1e;">
        <div class="pd-sponsor-tag" style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#9a7b2e;margin:0 0 6px;">Presented by</div>
        {{SPONSOR}}
      </td>
    </tr>
  </table>
</td></tr>
${card('{{CONTENT}}')}${FOOTER_ROW}`),
  },

  numbered: {
    label: 'Numbered breakdown',
    hint: 'Accent spine left column — editorial briefing or step-by-step guide.',
    build: () => shell(`
${header()}
<tr><td class="pd-pad" style="padding:0 36px;">
<table role="presentation" class="pd-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.07),0 0 0 1px rgba(0,0,0,0.04);">
<tr>
  <td width="7" style="background:{{ACCENT}};border-radius:8px 0 0 8px;font-size:0;line-height:0;">&nbsp;</td>
  <td class="pd-card-inner pd-ink" style="padding:44px 44px;${FONT}font-size:17px;line-height:1.8;color:#23262b;">
  {{CONTENT}}
  </td>
</tr>
</table>
</td></tr>
${FOOTER_ROW}`),
  },

  roundup: {
    label: 'Link roundup',
    hint: 'Compact, no card wrapper. Curated links and weekly reading lists.',
    build: () => shell(`
${header()}
<tr><td class="pd-pad pd-ink" style="padding:4px 44px 32px;${FONT}font-size:16px;line-height:1.75;color:#23262b;border-top:3px solid {{ACCENT}};">
{{CONTENT}}
</td></tr>
${FOOTER_ROW}`),
  },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES);

export function templateLabel(id) {
  return (TEMPLATES[id] || TEMPLATES.single).label;
}

export function buildScaffold(id) {
  return (TEMPLATES[id] || TEMPLATES.single).build();
}
