# Pressdown — AI Instructions

Read this before editing. It states what Pressdown is, how it is wired, and
the rules to keep when changing it.

---

## What Pressdown is

A **static, no-account, content-local** newsletter workspace. The writer
writes Markdown on the left; a pixel-accurate, email-safe HTML preview renders
on the right; they copy bulletproof HTML into Beehiiv / Substack / ConvertKit /
Mailchimp / Ghost and send. There is no backend and no account; the
newsletter content (Markdown, issues, brands, logos) lives only in the
browser's IndexedDB and is never uploaded. The site does load Google Analytics
(`js/analytics.js`, gated on a GA4 ID) for anonymous usage measurement — it
never has access to newsletter content. The one-line pitch: **"Your writing
stays in your browser."**

The name: *Press* (printing press — typesetting for distribution) + *down*
(Markdown). Pressdown is where you press a newsletter into its final form.

## User flow

Pick template + brand → write Markdown (preview updates, debounced 150ms) →
toggle mobile / dark to catch rendering bugs → Copy HTML → paste into platform
→ issue auto-saved to the local archive. No submit button anywhere.

## File map

```
index.html        marketing landing page (warm-linen, interactive starfield)
app.html          the app — the split-pane workspace (single screen)
privacy.html      data policy + irreversible local-wipe button
404.html          branded not-found
css/style.css     all app chrome styling (token-driven; brand theme default,
                  [data-chrome=bw] black-and-white alternate)
js/vendor/marked.min.js   vendored Markdown parser (v12) — offline, never a CDN
js/storage.js     IndexedDB wrapper: issues, brands, blocks, settings
js/templates.js   the 6 table-based email scaffolds (token slots)
js/compiler.js    the 6-stage Markdown→email compiler + plain-text
js/stats.js       word count / read time / Flesch — pure, no DOM
js/analytics.js   GA4, consent-gated, dormant until a Measurement ID is set
js/landing.js     landing-only interactive canvas starfield (cursor repel)
js/app.js         the ONLY DOM module (app.html): editor, preview, panels
```

## The compiler (most important part)

`js/compiler.js#compile(md, brand, templateId)` runs six stages: parse (custom
`marked.Renderer` that inlines **every** style — clients strip `<style>`),
slot into the template scaffold, brand-token inject, inline/sanitize, 102KB
Gmail-clip guard, output `{ html, text, bytes, clipped }`. The plain-text
version is generated from the **Markdown source**, never the HTML.

Rules:
- The renderer must emit fully inline styles on every element. Never rely on a
  `<style>` block for layout — the only `<style>` allowed is the dark-mode
  `@media` hint baked into the scaffold.
- Brand colors/fonts enter only via the token map in stage 3
  (`{{ACCENT}}`, `{{FONT}}`, `{{LOGO}}`, …). Never hardcode a brand value in a
  renderer or template.
- `marked` is a global loaded by a plain `<script>` in `index.html` so the ES
  modules stay dependency-free. Keep it vendored locally; never add a CDN or a
  build step.
- Renderer uses marked v12 **classic positional signatures**
  (`heading(text,level)`, `link(href,title,text)`, …) — verified; don't switch
  to token-object form without re-testing every method.

## Templates

Six scaffolds in `templates.js` (`single`, `hero`, `digest`, `letter`,
`sponsor`, `numbered`). Each is a pure function returning a full email
document built from nested tables with inline styles + token slots. Switching
templates is **non-destructive**: only the scaffold changes, the Markdown is
untouched. A new template is just another entry in `TEMPLATES` — no
per-template branching anywhere else.

## Brands & blocks

Brand presets (logo as base64 in IndexedDB — no hosting, ever), accent/ink
color, one of three email-safe font stacks, footer links, unsub URL,
preheader, sponsor markdown. Blocks are reusable Markdown snippets with a
`slash` trigger; typing `/name` in the editor inserts the block. Both are
CRUD'd from the slide-over panel in `app.js`.

## Rules when editing

- Keep `compiler.js`, `stats.js`, `storage.js`, `templates.js` free of UI
  code. `app.js` is the only module that touches the DOM.
- No build step, no framework, no runtime dependency. Plain ES modules; must
  run by serving the folder. `index.html` is the marketing landing page;
  `app.html` is the workspace; the app must keep running fully client-side.
- Content-locality is non-negotiable: newsletter content never leaves the
  browser and is never uploaded — no content fonts/scripts fetched per
  keystroke, no content network calls. The ONLY permitted third-party assets
  are the locally vendored `marked` and Google Analytics via
  `js/analytics.js`. Do not add other analytics, CDNs, or trackers, and never
  feed newsletter content to the analytics layer. Keep privacy.html truthful
  to whatever the code actually does.
- UI stays clean and paid-grade. No emojis in code or shipped copy (the small
  `▼` wordmark mark and status glyphs are deliberate, keep them minimal).
- IndexedDB: DB `pressdown`, stores `issues` (keyPath `number`), `brands`,
  `blocks`, `settings` (single record `id:1`). Bump `VERSION` and add an
  `onupgradeneeded` migration if a store's shape changes.
- The archive is append-on-copy and never auto-pruned. `New issue` and panel
  deletes are the only removers; the privacy page is the only full wipe.
- Verify after any compiler change: desktop + 375px mobile + dark toggle, and
  that plain text still generates. Keep output under the 102KB guard.
- Email protection: never render the contact address as text or as a plain
  `mailto:` in static HTML. Assemble it in JS at runtime, generic link text
  only (see `privacy.html`).
- App-chrome theming is a pure token-swap: `:root` is the default **brand
  theme** — a warm **linen ground** (`--bg #efe9dc`, `--ink` warm near-black);
  the illustration colors (`--accent`/`--night` ocean blue `#3C6E9F`,
  `--pink`, `--green`, `--cream`) are **accents only**, never the page
  ground. Riso pattern tokens: `--speckle`/`--speckle-ink` (kept well below
  text contrast — readability is a hard rule) and `--dash` (subtle grain).
  `html[data-chrome="bw"]` is the
  black-and-white alternate that keeps patterns but neutralizes the palette.
  Switched via the visible Brand/B&W segmented control in the topbar
  (`#themeBrand`/`#themeBw`), persisted in `localStorage`
  (`pressdown_chrome`). Components reference vars only — never hardcode a
  color, including scrollbars and pattern fills. Keep patterns off the editor
  textarea. The landing page replaces the CSS speckle with an interactive
  canvas (`js/landing.js`) that repels dots from the cursor; the CSS
  `::before` speckle stays as the no-JS fallback. All of this is separate
  from the email's own dark-mode preview, and from each brand preset's email
  accent (`SEED_BRAND.accent`), which chrome must not touch.
