# Pressdown — improvement roadmap

Ranked by impact. Work top to bottom.

---

## 1. Subject line field ✓
- [x] Add a subject line input above the editor
- [x] Character counter (≤50 neutral, 51–70 amber, >70 red)
- [x] Persist subject per issue in draft + IndexedDB (saveIssue)
- [x] Include subject in .md export (prepended as "Subject: …")
- [x] Show subject in archive panel rows

## 2. Color picker for brand accent ✓
- [x] `<input type="color">` was already in place
- [x] Hex readout text input synced two-ways to the color swatch
- [x] Live preview re-renders email as you drag the color picker

## 3. Slash command discoverability ✓
- [x] Toolbar hint now dynamic: "Save a block · then type /" when empty
- [x] When blocks exist: "type / · N blocks saved" — count is a link to the panel
- [x] `updateBlockHint()` called on boot and after every block save/delete

## 4. Template variety ✓
- [x] `numbered` redesigned: 7px accent left spine — editorial briefing look
- [x] New `roundup` template: no card wrapper, compact 16px, accent top border — weekly link digest
- [x] Templates now span 7 genuinely distinct visual layouts

## 5. Image workflow ✓
- [x] Drag-and-drop already existed — added size guard: warn >100KB, block >600KB
- [x] Toolbar Image button now opens a file picker instead of dead `![](https://)` placeholder
- [x] Toast messages explain the Outlook/hosting tradeoff clearly per file size

---

## Done
- [x] Platform selector (Substack / Beehiiv / ConvertKit / Mailchimp / Ghost)
- [x] Platform-aware renderer (blockquote, hr, code per platform)
- [x] GitHub-style callout boxes (NOTE / TIP / WARNING / etc.)
- [x] Footnotes ([^1] syntax)
- [x] Subscript / superscript inline styles
- [x] HTML prettifier (readable copied output)
- [x] Collab rename: "Collaborate" → "Invite an editor"
- [x] Broken image guard (empty / bare protocol src)
- [x] Unsubscribe always renders as <a> with {{unsubscribe_url}} fallback
- [x] A+++++ visual upgrade (Georgia serif H1, card shadow, 1.8 line-height, warm bg)
- [x] Footer: serif newsletter name + subscription note + utility links
- [x] Preheader spacer padding (prevent body bleed into preview snippet)
- [x] Sponsor block: left accent bar instead of full border
- [x] Dark mode: full token coverage (sponsor, blockquote, footer, links)
- [x] Fixed collab invite link broken by panel title rename
