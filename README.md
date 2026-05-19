# Pressdown

Press your newsletter into its final form.

Write in Markdown, watch a pixel-accurate **email-safe** HTML preview update as
you type, then copy bulletproof HTML straight into Beehiiv, Substack,
ConvertKit, Mailchimp or Ghost. No account, no content upload. Every issue,
brand and block lives in your browser's IndexedDB and nowhere else. The site
uses Google Analytics for anonymous usage measurement; your newsletter content
is never read or transmitted.

## Run it

It's a static site with ES modules, so it must be *served* (modules need a
real origin — opening the file directly won't work):

```bash
cd pressdown
python3 -m http.server 8080
# open http://localhost:8080
```

No build, no install, no dependencies. The Markdown parser is a locally
vendored copy of [marked](https://marked.js.org) (`js/vendor/marked.min.js`);
Google Analytics (`js/analytics.js`) is the one third-party script, loaded only
when a GA4 Measurement ID is configured.

## What it does

- **Split-pane editor** — Markdown left, live email preview right (150ms)
- **Six email-safe templates** — single column, hero, digest, letter,
  sponsor-first, numbered breakdown (table-based, render in Outlook→Gmail)
- **Brand presets** — logo (base64), colors, font, footer; write once, inherit
- **Reusable blocks** — `/sponsor`, `/ps`, … slash-insert recurring content
- **Mobile + dark preview** — catch ~90% of rendering bugs before sending
- **Issue archive** — every copied issue saved & full-text searchable locally
- **Plain text + HTML copy** — CAN-SPAM-ready, Gmail 102KB clip guard
- **Writing stats** — word count, read time, Flesch score

## Privacy

Your newsletter content never leaves the browser and is never uploaded. The
site loads Google Analytics for anonymous usage stats only. See `privacy.html`
for the full statement and a one-click irreversible local data wipe.
